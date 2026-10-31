// The frames the window server composited during each cursor glide (scripts/cursor-sitting/frames.mjs; #235's
// task-8 report): WindowServer's FrameUpdate signposts counted inside the spans the engine's `cursor.motion` signposts
// and the cursor probe's `--glides` give, so the `fps60` arm's cap is proven, or shown not taking effect, in the same run
// as its timing. Checked without a Mac, on log lines shaped as `log show --signpost --style ndjson` prints them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capVerdict, frameSummary, frameUpdateTimes, glideFrames, motionSpans, probeSpans} from '../../scripts/cursor-sitting/frames.mjs';

// 24 MHz ticks, as on Apple silicon: 24 000 a millisecond.
const MS = 24_000;
const frame = t => JSON.stringify({subsystem: 'com.apple.SkyLight', category: 'tracing', signpostName: 'FrameUpdate', eventType: 'signpostEvent',
  processImagePath: '/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/Resources/WindowServer', machTimestamp: t, eventMessage: 'base_mct=1 contributors=\'\''});
const motion = (pid, begin, ms, mode = 'path') => JSON.stringify({subsystem: 'io.github.ssfskim.cua.engine', category: 'timing', signpostName: 'cursor.motion',
  eventType: 'signpostEvent', processID: pid, machTimestamp: begin - 20 * MS, eventMessage: `begin=${begin} end=${begin + ms * MS} ms=${ms.toFixed(1)} mode=${mode}`});
// Frames every `every` ms from `from` for `ms`.
const frames = (from, ms, every) => Array.from({length: Math.round(ms / every)}, (_, k) => from + Math.round(k * every * MS));

test('the FrameUpdate times are WindowServer\'s FrameUpdate events only, in order', () => {
  const text = [frame(300), 'Filtering the log data using …', frame(100), JSON.stringify({signpostName: 'SLSTransaction', machTimestamp: 200}),
    JSON.stringify({signpostName: 'FrameUpdate', subsystem: 'com.apple.SkyLight', category: 'tracing.stalls', machTimestamp: 250}), frame(200), ''].join('\n');
  assert.deepEqual(frameUpdateTimes(text), [100, 200, 300]);
});

test('the engine\'s motion spans come from its cursor.motion signposts, a probe\'s pids left out', () => {
  const text = [motion(7, 1_000_000, 800), motion(9, 5_000_000, 600, 'scoot'), JSON.stringify({signpostName: 'cursor.apply', processID: 7}), motion(7, 9_000_000, 1200)].join('\n');
  assert.deepEqual(motionSpans(text), [
    {pid: 7, begin: 1_000_000, end: 1_000_000 + 800 * MS, ms: 800, mode: 'path'},
    {pid: 9, begin: 5_000_000, end: 5_000_000 + 600 * MS, ms: 600, mode: 'scoot'},
    {pid: 7, begin: 9_000_000, end: 9_000_000 + 1200 * MS, ms: 1200, mode: 'path'}]);
  assert.deepEqual(motionSpans(text, {excludePids: [9]}).map(s => s.begin), [1_000_000, 9_000_000]);
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
