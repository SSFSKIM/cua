// The frames the window server composited during each cursor glide (scripts/cursor-sitting/frames.mjs; #235's
// task-8 report): WindowServer's FrameUpdate signposts counted inside the spans the engine's `cursor.motion` signposts
// and the cursor probe's `--glides` give, so the `fps60` arm's cap is proven, or shown not taking effect, in the same run
// as its timing. Checked without a Mac, on log lines shaped as `log show --signpost --style ndjson` prints them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capVerdict, frameSummary, frameUpdateTimes, glideFrames, glideFramesCheck, motionSpans, probeSpans} from '../../scripts/cursor-sitting/frames.mjs';

// 24 MHz ticks, as on Apple silicon: 24 000 a millisecond.
const MS = 24_000;
const frame = t => JSON.stringify({subsystem: 'com.apple.SkyLight', category: 'tracing', signpostName: 'FrameUpdate', eventType: 'signpostEvent',
  processImagePath: '/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/Resources/WindowServer', machTimestamp: t, eventMessage: 'base_mct=1 contributors=\'\''});
const motion = (pid, begin, ms, mode = 'path', cursor = null) => JSON.stringify({subsystem: 'io.github.ssfskim.cua.engine', category: 'timing', signpostName: 'cursor.motion',
  eventType: 'signpostEvent', processID: pid, machTimestamp: begin - 20 * MS,
  eventMessage: `begin=${begin} end=${begin + ms * MS} ms=${ms.toFixed(1)} mode=${mode}${cursor === null ? '' : ` cursor=${cursor}`}`});
const stop = (pid, at, cursor) => JSON.stringify({subsystem: 'io.github.ssfskim.cua.engine', category: 'timing', signpostName: 'cursor.stop',
  eventType: 'signpostEvent', processID: pid, machTimestamp: at, eventMessage: `cursor=${cursor}`});
// Frames every `every` ms from `from` for `ms`.
const frames = (from, ms, every) => Array.from({length: Math.round(ms / every)}, (_, k) => from + Math.round(k * every * MS));

test('the FrameUpdate times are WindowServer\'s FrameUpdate events only, in order', () => {
  const text = [frame(300), 'Filtering the log data using …', frame(100), JSON.stringify({signpostName: 'SLSTransaction', machTimestamp: 200}),
    JSON.stringify({signpostName: 'FrameUpdate', subsystem: 'com.apple.SkyLight', category: 'tracing.stalls', machTimestamp: 250}), frame(200), ''].join('\n');
  assert.deepEqual(frameUpdateTimes(text), [100, 200, 300]);
});

test('the engine\'s motion spans come from its cursor.motion signposts, a probe\'s pids left out', () => {
  const text = [motion(7, 1_000_000, 800), motion(9, 5_000_000, 600, 'scoot'), JSON.stringify({signpostName: 'cursor.apply', processID: 7}), motion(7, 30_000_000, 1200)].join('\n');
  assert.deepEqual(motionSpans(text), [
    {pid: 7, cursor: null, begin: 1_000_000, end: 1_000_000 + 800 * MS, ms: 800, mode: 'path', cut: false},
    {pid: 9, cursor: null, begin: 5_000_000, end: 5_000_000 + 600 * MS, ms: 600, mode: 'scoot', cut: false},
    {pid: 7, cursor: null, begin: 30_000_000, end: 30_000_000 + 1200 * MS, ms: 1200, mode: 'path', cut: false}]);
  assert.deepEqual(motionSpans(text, {excludePids: [9]}).map(s => s.begin), [1_000_000, 30_000_000]);
});

test('a glide another motion of its cursor replaced, or a stop cancelled, is counted only until then', () => {
  // TYPING_SAMPLE's second click before the first glide settles: the install removes the first glide's animations.
  const text = [motion(7, 1000 * MS, 800, 'path', 1), motion(7, 1400 * MS, 600, 'path', 1),
    motion(7, 1450 * MS, 500, 'path', 2), stop(7, 1700 * MS, 1), motion(9, 1100 * MS, 500, 'path', 1),
    motion(7, 3000 * MS, 400, 'scoot', 1), motion(7, 3010 * MS, 300, 'path', 1)].join('\n');
  const spans = motionSpans(text);
  const of = (pid, cursor, begin) => spans.find(s => s.pid === pid && s.cursor === cursor && s.begin === begin * MS);
  const first = of(7, 1, 1000);
  assert.equal(first.end, (1400 - 20) * MS, 'cut where the next install of its cursor removed it');
  assert.ok(Math.abs(first.ms - 380) < 1e-9, 'its ms is the part that played');
  assert.equal(first.cut, true);
  const second = of(7, 1, 1400);
  assert.equal(second.end, 1700 * MS, 'a stop of its cursor (a hide, a snap, a close) cancels it');
  assert.equal(of(7, 2, 1450).end, 1950 * MS, 'another cursor\'s motions and stops leave it whole');
  assert.equal(of(7, 2, 1450).cut, false);
  assert.equal(of(9, 1, 1100).end, 1600 * MS, 'so do another process\'s');
  assert.equal(of(7, 1, 3000), undefined, 'replaced before it began: it never played, and is not a glide');
  assert.ok(of(7, 1, 3010));
  // Signposts of a build before the cursor field: one cursor a process, cut the same way.
  const old = motionSpans([motion(5, 1000 * MS, 800), motion(5, 1400 * MS, 600)].join('\n'));
  assert.equal(old[0].end, 1380 * MS);
  assert.equal(old[0].cursor, null);
});

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

test('the cap took effect when the capped glides\' frames come about 60 a second and the default ones\' at the display\'s full rate', () => {
  // Judged by the median interval between frames, which a burst of another app's frames inside a glide barely moves.
  assert.equal(capVerdict({hz: 118, intervalMs: 8.3, glides: 2}, {hz: 63, intervalMs: 16.7, glides: 2}).verdict, 'capped');
  assert.equal(capVerdict({hz: 118, intervalMs: 8.3, glides: 2}, {hz: 68, intervalMs: 16.7, glides: 2}).verdict, 'capped', 'a few frames of another app\'s raise the rate, not the interval');
  const fast = capVerdict({hz: 118, intervalMs: 8.3, glides: 2}, {hz: 88, intervalMs: 8.4, glides: 2});
  assert.equal(fast.verdict, 'not capped', 'a capped glide that still runs at full rate: the cap was not honoured');
  assert.match(fast.why, /8\.4 ms/);
  const slow = capVerdict({hz: 61, intervalMs: 16.6, glides: 2}, {hz: 60, intervalMs: 16.7, glides: 2});
  assert.equal(slow.verdict, 'undetermined');
  assert.match(slow.why, /default/);
  assert.equal(capVerdict({glides: 0}, {hz: 60, intervalMs: 16.7, glides: 2}).verdict, 'undetermined');
});

test('a probe\'s answer gives its glides and its rock as spans under its pid', () => {
  const answer = {pid: 42, debug: 'fps60', glides: [{begin: 10, end: 34_000, ms: 1.4, mode: 'path'}], rock: {begin: 50_000, end: 74_000, ms: 1}};
  assert.deepEqual(probeSpans(answer), {pid: 42, glides: [{pid: 42, begin: 10, end: 34_000, ms: 1.4, mode: 'path'}], rock: {pid: 42, begin: 50_000, end: 74_000, ms: 1, mode: 'rock'}});
  assert.deepEqual(probeSpans({pid: 1, glides: [], rock: null}).rock, null);
});

test('the fps60 cap check does not stop for a failed count: a failed probe or log read is undetermined, its pids kept', async () => {
  const answer = pid => ({pid, glides: [{begin: 0, end: 24_000, ms: 1, mode: 'path'}], rock: null});
  const asked = [];
  const probe = args => { asked.push(args.join(' ')); return answer(asked.length === 1 ? 5 : 6); };
  const unread = await glideFramesCheck('fps60', {probe, readFrames: () => { throw new Error('log show timed out\nmore'); }});
  assert.deepEqual(asked, ['cursor --glides 2', 'cursor --glides 2 --debug fps60']);
  assert.equal(unread.verdict, 'undetermined');
  assert.equal(unread.ok, false);
  assert.match(unread.why, /not counted.*log show timed out$/);
  assert.deepEqual(unread.pids, [5, 6], 'the series still leaves the probes\' glides out');
  let calls = 0;
  const stuck = await glideFramesCheck('fps60', {probe: () => { if (++calls === 2) throw new Error('the probe did not exit'); return answer(5); }, readFrames: () => []});
  assert.equal(stuck.verdict, 'undetermined');
  assert.deepEqual(stuck.pids, [5]);
  asked.length = 0;
  const counted = await glideFramesCheck('fps60', {probe, readFrames: () => []});
  assert.equal(counted.verdict, 'undetermined', 'no frames: nothing counted on either side');
  assert.deepEqual(counted.pids, [5, 6]);
});

test('a probe whose end is unconfirmed (stuck) stops the series: another cursor probe may still be drawing', async () => {
  const answer = pid => ({pid, glides: [{begin: 0, end: 24_000, ms: 1, mode: 'path'}], rock: null});
  for (const message of ['the cursor probe did not finish within 60 s and its process was never identified', 'the cursor probe (pid 6) did not exit after SIGKILL']) {
    let calls = 0;
    const probe = () => { if (++calls === 2) throw Object.assign(new Error(message), {stuck: true}); return answer(5); };
    await assert.rejects(glideFramesCheck('fps60', {probe, readFrames: () => []}), error => error.stuck === true && error.message === message);
  }
  // A probe stopped with its exit confirmed is an ordinary failure: undetermined, and the series goes on.
  let calls = 0;
  const stopped = await glideFramesCheck('fps60', {probe: () => { if (++calls === 2) throw new Error('the cursor probe did not finish within 60 s; its process was stopped'); return answer(5); }, readFrames: () => []});
  assert.equal(stopped.verdict, 'undetermined');
  assert.deepEqual(stopped.pids, [5]);
});

test('the cap check waits for its frames: the series\' own stream delivers them after the probes end', async () => {
  const answer = pid => ({pid, glides: [{begin: 0, end: 24_000, ms: 1, mode: 'path'}], rock: null});
  let calls = 0;
  const times = Array.from({length: 120}, (_, k) => k * 200);
  const check = await glideFramesCheck('fps60', {probe: () => answer(++calls), readFrames: async () => { await new Promise(r => setTimeout(r, 5)); return times; }});
  assert.equal(check.base.frames, 120);
});
