// The frames the window server composited during the cursor probe's glides (scripts/cursor-sitting/frames.mjs; #235's
// task-8 report): WindowServer's FrameUpdate times counted inside the spans the probe's `--glides` gives, so the `fps60`
// arm's cap is proven, or shown not taking effect, in the same run as its timing. Checked without a Mac.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capVerdict, frameSummary, glideFrames, glideFramesCheck, probeSpans} from '../../scripts/cursor-sitting/frames.mjs';

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
