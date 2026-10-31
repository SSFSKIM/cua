// The frames the window server composited during the cursor probe's glides (scripts/cursor-sitting/frames.mjs; #235's
// task-8 report): WindowServer's FrameUpdate times counted inside the spans the probe's `--glides` gives, so the default's
// 60 Hz cap is proven against the `uncapped` arm, or shown not taking effect, in the same run as its timing. Checked without a Mac.
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {startFrameStream} from '../../scripts/cursor-sitting/signposts.mjs';
import assert from 'node:assert/strict';
import {capCheckWithStream, capVerdict, frameSummary, glideFrames, glideFramesCheck, probeSpans} from '../../scripts/cursor-sitting/frames.mjs';

// 24 MHz ticks, as on Apple silicon: 24 000 a millisecond.
const MS = 24_000;
// Frames every `every` ms from `from` for `ms`.
const frames = (from, ms, every) => Array.from({length: Math.round(ms / every)}, (_, k) => from + Math.round(k * every * MS));

test('each glide counts the frames inside its span, its rate and its median frame interval, in the span\'s own ticks', () => {
  const a = {pid: 7, begin: 10 * MS, end: 1010 * MS, ms: 1000, mode: 'path'}, b = {pid: 7, begin: 2000 * MS, end: 2500 * MS, ms: 500, mode: 'scoot'};
  const times = [...frames(0, 3000, 1000 / 120).filter(t => t < 1500 * MS), ...frames(2000 * MS, 500, 1000 / 60)].sort((x, y) => x - y);
  const [first, second] = glideFrames([a, b], times);
  assert.equal(first.frames, 120);
  assert.ok(Math.abs(first.hz - 120) < 1e-9);
  assert.ok(Math.abs(first.intervalMs - 1000 / 120) < 0.01);
  assert.equal(second.frames, 30);
  assert.ok(Math.abs(second.intervalMs - 1000 / 60) < 0.01);
  // Ticks of another clock rate (nanoseconds, an Intel Mac's): the span's own ms and ticks set the scale.
  const ns = glideFrames([{pid: 1, begin: 0, end: 1e9, ms: 1000, mode: 'path'}], Array.from({length: 60}, (_, k) => Math.round(k * 1e9 / 60)))[0];
  assert.ok(Math.abs(ns.intervalMs - 1000 / 60) < 0.01 && ns.frames === 60);
  assert.equal(glideFrames([a], [])[0].intervalMs, null, 'no two frames: no interval');
});

test('the summary is each glide\'s median, and says when there were none', () => {
  const rows = [{frames: 100, ms: 1500, hz: 66.7, intervalMs: 16.7}, {frames: 60, ms: 1000, hz: 60, intervalMs: 16.6}, {frames: 80, ms: 1300, hz: 61.5, intervalMs: 16.8}];
  assert.deepEqual(frameSummary(rows), {glides: 3, frames: 80, ms: 1300, hz: 61.5, intervalMs: 16.7});
  assert.deepEqual(frameSummary([]), {glides: 0});
});

test('the cap took effect when the capped glides\' frames come about 60 a second and the uncapped ones\' at the display\'s full rate', () => {
  // Judged by the median interval between frames, which a burst of another app's frames inside a glide barely moves.
  assert.equal(capVerdict({hz: 118, intervalMs: 8.3, glides: 2}, {hz: 63, intervalMs: 16.7, glides: 2}).verdict, 'capped');
  assert.equal(capVerdict({hz: 118, intervalMs: 8.3, glides: 2}, {hz: 68, intervalMs: 16.7, glides: 2}).verdict, 'capped', 'a few frames of another app\'s raise the rate, not the interval');
  const fast = capVerdict({hz: 118, intervalMs: 8.3, glides: 2}, {hz: 88, intervalMs: 8.4, glides: 2});
  assert.equal(fast.verdict, 'not capped', 'a capped glide that still runs at full rate: the cap was not honoured');
  assert.match(fast.why, /8\.4 ms/);
  const slow = capVerdict({hz: 61, intervalMs: 16.6, glides: 2}, {hz: 60, intervalMs: 16.7, glides: 2});
  assert.equal(slow.verdict, 'undetermined');
  assert.match(slow.why, /uncapped/);
  assert.equal(capVerdict({glides: 0}, {hz: 60, intervalMs: 16.7, glides: 2}).verdict, 'undetermined');
});

test('a probe\'s answer gives its glides and its rock as spans under its pid', () => {
  const answer = {pid: 42, debug: 'uncapped', glides: [{begin: 10, end: 34_000, ms: 1.4, mode: 'path'}], rock: {begin: 50_000, end: 74_000, ms: 1}};
  assert.deepEqual(probeSpans(answer), {pid: 42, debug: 'uncapped', glides: [{pid: 42, begin: 10, end: 34_000, ms: 1.4, mode: 'path'}], rock: {pid: 42, begin: 50_000, end: 74_000, ms: 1, mode: 'rock'}});
  assert.deepEqual(probeSpans({pid: 1, glides: [], rock: null}).rock, null);
});

test('the cap check does not stop for a failed count: a failed probe or log read is undetermined, its pids kept', async () => {
  const answer = pid => ({pid, debug: pid === 5 ? 'uncapped' : null, glides: [{begin: 0, end: 24_000, ms: 1, mode: 'path'}], rock: null});
  const asked = [];
  const probe = args => { asked.push(args.join(' ')); return answer(asked.length === 1 ? 5 : 6); };
  const unread = await glideFramesCheck('uncapped', {probe, readFrames: () => { throw new Error('log show timed out\nmore'); }});
  assert.deepEqual(asked, ['cursor --glides 2 --debug uncapped', 'cursor --glides 2'], 'the uncapped side first, then the default');
  assert.equal(unread.verdict, 'undetermined');
  assert.equal(unread.ok, false);
  assert.match(unread.why, /not counted.*log show timed out$/);
  assert.deepEqual(unread.pids, [5, 6], 'the series still leaves the probes\' glides out');
  let calls = 0;
  const stuck = await glideFramesCheck('uncapped', {probe: () => { if (++calls === 2) throw new Error('the probe did not exit'); return answer(5); }, readFrames: () => []});
  assert.equal(stuck.verdict, 'undetermined');
  assert.deepEqual(stuck.pids, [5]);
  asked.length = 0;
  const counted = await glideFramesCheck('uncapped', {probe, readFrames: () => []});
  assert.equal(counted.verdict, 'undetermined', 'no frames: nothing counted on either side');
  assert.deepEqual(counted.pids, [5, 6]);
});

test('a probe whose end is unconfirmed (stuck) stops the series: another cursor probe may still be drawing', async () => {
  const answer = pid => ({pid, glides: [{begin: 0, end: 24_000, ms: 1, mode: 'path'}], rock: null});
  for (const message of ['the cursor probe did not finish within 60 s and its process was never identified', 'the cursor probe (pid 6) did not exit after SIGKILL']) {
    let calls = 0;
    const probe = () => { if (++calls === 2) throw Object.assign(new Error(message), {stuck: true}); return answer(5); };
    await assert.rejects(glideFramesCheck('uncapped', {probe, readFrames: () => []}), error => error.stuck === true && error.message === message);
  }
  // A probe stopped with its exit confirmed is an ordinary failure: undetermined, and the series goes on.
  let calls = 0;
  const stopped = await glideFramesCheck('uncapped', {probe: () => { if (++calls === 2) throw new Error('the cursor probe did not finish within 60 s; its process was stopped'); return answer(5); }, readFrames: () => []});
  assert.equal(stopped.verdict, 'undetermined');
  assert.deepEqual(stopped.pids, [5]);
});

test('the cap check waits for its frames: the series\' own stream delivers them after the probes end', async () => {
  const answer = pid => ({pid, debug: pid === 1 ? 'uncapped' : null, glides: [{begin: 0, end: 24_000, ms: 1, mode: 'path'}], rock: null});
  let calls = 0;
  const times = Array.from({length: 120}, (_, k) => k * 200);
  const check = await glideFramesCheck('uncapped', {probe: () => answer(++calls), readFrames: async () => { await new Promise(r => setTimeout(r, 5)); return times; }});
  assert.equal(check.base.frames, 120);
});

test('the cap is judged from the drained stream: a stream that failed, or a glide with no frames, is undetermined', async () => {
  // Two glides a side, each 1 s; the uncapped arm's frames every 8.3 ms, the default's (capped) every 16.7 ms.
  const span = (k, pid) => ({begin: k * 2000 * MS, end: (k * 2000 + 1000) * MS, ms: 1000, mode: 'path', pid});
  const answer = (pid, first) => ({pid, debug: pid === 5 ? 'uncapped' : null, glides: [span(first, pid), span(first + 1, pid)].map(({pid: _, ...g}) => g), rock: null});
  let calls = 0;
  const probe = () => (++calls === 1 ? answer(5, 0) : answer(6, 2));
  const every = (k, step) => frames(k * 2000 * MS, 1000, step);
  const good = [...every(0, 1000 / 120), ...every(1, 1000 / 120), ...every(2, 1000 / 60), ...every(3, 1000 / 60)];
  const stream = (stopped) => async () => ({started: true, frameTimes: () => good.slice(0, 10), stop: async () => stopped});
  calls = 0;
  const capped = await capCheckWithStream('uncapped', {probe, startStream: stream({ok: true, times: good}), settleMs: 0});
  assert.equal(capped.verdict, 'capped', 'judged from the drained times, not the snapshot before stop');
  calls = 0;
  const died = await capCheckWithStream('uncapped', {probe, startStream: stream({ok: false, error: 'log stream ended before it was stopped (exit 1)', times: good.slice(0, 200)}), settleMs: 0});
  assert.equal(died.verdict, 'undetermined');
  assert.match(died.why, /ended before it was stopped/);
  assert.deepEqual(died.pids, [5, 6]);
  calls = 0;
  // The stream lost the last capped glide: its intervals are none, which frameSummary would pass over.
  const partial = [...every(0, 1000 / 120), ...every(1, 1000 / 120), ...every(2, 1000 / 60)];
  const lost = await capCheckWithStream('uncapped', {probe, startStream: stream({ok: true, times: partial}), settleMs: 0});
  assert.equal(lost.verdict, 'undetermined');
  assert.match(lost.why, /a glide with no frames/);
  calls = 0;
  const never = await capCheckWithStream('uncapped', {probe, startStream: async () => ({started: false, frameTimes: () => [], stop: async () => ({ok: false, error: 'log stream did not start within 10 s', times: []})}), settleMs: 0});
  assert.equal(never.verdict, 'undetermined');
  assert.match(never.why, /did not start/);
});

test('the cap check reads a display another client held at 50 Hz or more as undetermined, never "not capped"', async () => {
  // Tonight's run (sitting-2026-10-31b, step 12-fps60.12, when the cap was the fps60 arm): both sides at 8.3 ms with the owner's full-screen Chrome and
  // cmux on the display. The stream's frames before the probes say whether the display was already at full rate.
  const span = k => ({begin: k * 2000 * MS, end: (k * 2000 + 1000) * MS, ms: 1000, mode: 'path'});
  let calls = 0;
  const probe = () => (++calls === 1 ? {pid: 5, debug: 'uncapped', glides: [span(0), span(1)], rock: null} : {pid: 6, debug: null, glides: [span(2), span(3)], rock: null});
  const full = [0, 1, 2, 3].flatMap(k => frames(k * 2000 * MS, 1000, 1000 / 120));
  // Held from 50 Hz: the run of 2026-10-31c's quiet window, 127 frames in 1.5 s (84.7 Hz), let a void cap read
  // "not capped" (sitting-2026-10-31c/item-12-fps60.jsonl).
  for (const [count, quietMs, quietHz, verdict] of [[120, 1000, 120, 'undetermined'], [127, 1500, 84.7, 'undetermined'], [50, 1000, 50, 'undetermined'],
    [49, 1000, 49, 'not capped'], [3, 1000, 3, 'not capped']]) {
    calls = 0;
    let clock = 50_000;
    // The drained stream's frames, with their log times: `count` of them in the `quietMs` window the check marks.
    const walls = Array.from({length: count}, (_, k) => 50_000 + k * (quietMs / count));
    const startStream = async () => ({started: true, frameTimes: () => [], stop: async () => ({ok: true, times: full, walls})});
    const check = await capCheckWithStream('uncapped', {probe, startStream, settleMs: 0, quietMs, sleep: async ms => { clock += ms; }, now: () => clock});
    assert.equal(check.verdict, verdict, `${quietHz} Hz before the probes`);
    assert.equal(check.quiet.hz, quietHz);
    if (verdict === 'undetermined') assert.match(check.why, new RegExp(`display ran at ${quietHz} Hz before the probes.*held`));
  }
});

test('a probe that does not report the arm it was asked for is undetermined: the arm may never have taken', async () => {
  const span = k => ({begin: k * 2000 * MS, end: (k * 2000 + 1000) * MS, ms: 1000, mode: 'path'});
  const times = [0, 1].flatMap(k => frames(k * 2000 * MS, 1000, 1000 / 120)).concat([2, 3].flatMap(k => frames(k * 2000 * MS, 1000, 1000 / 60)));
  for (const debugs of [[null, null], ['uncapped', 'uncapped'], ['uncapped', undefined], [null, 'uncapped']]) {
    let calls = 0;
    const probe = () => { const k = calls++; return {pid: 5 + k, ...(debugs[k] === undefined ? {} : {debug: debugs[k]}), glides: [span(2 * k), span(2 * k + 1)], rock: null}; };
    const check = await glideFramesCheck('uncapped', {probe, readFrames: () => times});
    assert.equal(check.verdict, 'undetermined', JSON.stringify(debugs));
    assert.match(check.why, /reported the arm/);
  }
  let calls = 0;
  const right = () => { const k = calls++; return {pid: 5 + k, debug: k ? null : 'uncapped', glides: [span(2 * k), span(2 * k + 1)], rock: null}; };
  assert.equal((await glideFramesCheck('uncapped', {probe: right, readFrames: () => times})).verdict, 'capped');
});

// A local `log` timestamp ("2026-10-31 13:22:07.139326-0700") for epoch ms `ms`.
const logStamp = ms => {
  const d = new Date(ms), p = (n, w = 2) => String(n).padStart(w, '0');
  const z = -d.getTimezoneOffset(), sign = z >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}000${sign}${p(Math.floor(Math.abs(z) / 60))}${p(Math.abs(z) % 60)}`;
};

test('the quiet window is counted by the frames\' own times after the drain, not by when log stream delivered them', async () => {
  // The production stream adapter over a fake `log stream` whose lines arrive late: frames of the quiet window only
  // after it, older queued frames during it.
  const T0 = Date.UTC(2026, 9, 31, 20, 22, 6);
  const frameLine = ms => `${JSON.stringify({signpostName: 'FrameUpdate', subsystem: 'com.apple.SkyLight', category: 'tracing', machTimestamp: Math.round(ms * MS), timestamp: logStamp(ms)})}\n`;
  const every = (from, to, step) => Array.from({length: Math.round((to - from) / step)}, (_, k) => from + k * step);
  const span = (from, ms) => ({begin: Math.round(from * MS), end: Math.round((from + ms) * MS), ms, mode: 'path'});
  const glidesAt = [T0 + 3000, T0 + 5000, T0 + 7000, T0 + 9000];
  for (const [label, quietFrames, staleFrames, verdict, quietHz] of [
    ['a held display whose quiet frames come late', every(T0, T0 + 1500, 1000 / 120), every(T0 - 1500, T0, 25), 'undetermined', 120],
    ['a quiet display with stale frames delivered during its window', [], every(T0 - 1500, T0, 1000 / 120), 'not capped', 0],
  ]) {
    let clock = T0, child;
    const spawn = () => {
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.exitCode = null;
      child.kill = () => { setImmediate(() => { child.emit('exit', 0); child.stdout.end(); setImmediate(() => child.emit('close', 0)); }); return true; };
      setImmediate(() => child.stdout.write('Filtering the log data using "…"\n'));
      return child;
    };
    let sleeps = 0;
    const sleep = async ms => {
      sleeps++;
      if (sleeps === 1) for (const t of staleFrames) child.stdout.write(frameLine(t));  // during the quiet window
      clock += ms;
      if (sleeps === 2) {  // the settle: the quiet window's own frames, then every glide's at full rate
        for (const t of quietFrames) child.stdout.write(frameLine(t));
        for (const g of glidesAt) for (const t of every(g, g + 1000, 1000 / 120)) child.stdout.write(frameLine(t));
      }
      await new Promise(r => setImmediate(r));
    };
    let calls = 0;
    const probe = () => (++calls === 1 ? {pid: 5, debug: 'uncapped', glides: [span(glidesAt[0], 1000), span(glidesAt[1], 1000)], rock: null}
      : {pid: 6, debug: null, glides: [span(glidesAt[2], 1000), span(glidesAt[3], 1000)], rock: null});
    const check = await capCheckWithStream('uncapped', {probe, startStream: () => startFrameStream({spawn, readyMs: 1000}), settleMs: 0, quietMs: 1500,
      sleep, now: () => clock});
    assert.equal(check.quiet.hz, quietHz, label);
    assert.equal(check.verdict, verdict, label);
  }
});
