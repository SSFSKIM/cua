// Item 1's screen recording (scripts/cursor-sitting/recording.mjs): the region is the rectangle the two harness windows
// fill, refused when it holds more than them (a gap, a strip beside the shorter window, the frontmost app's window over
// it); the clip is kept outside the repository; the recorder is started, checked to be running, and stopped so that it
// writes its file. The recorder here is a stand-in process: nothing is captured.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clipPathProblem, overlapProblem, recordingPlan, recordingRegion, screencaptureArgs, startRecording, stopRecording,
  UNCOVERED_TOLERANCE_PT} from '../../scripts/cursor-sitting/recording.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-235-rec-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const rect = (x, y, width, height) => ({x, y, width, height});

test('two windows side by side, touching and level, fill their rectangle: it is the region', () => {
  const {region, uncovered, problem} = recordingRegion([rect(80, 60, 1000, 760), rect(1080, 60, 430, 760)]);
  assert.deepEqual(region, rect(80, 60, 1430, 760));
  assert.deepEqual(uncovered, []);
  assert.equal(problem, null);
});

test('slivers up to the tolerance pass (a tiling margin); a strip beside the shorter window or a wide gap is refused, named', () => {
  const sliver = recordingRegion([rect(0, 0, 500, 700), rect(500 + UNCOVERED_TOLERANCE_PT, 0, 500, 700)]);
  assert.equal(sliver.problem, null);
  assert.equal(sliver.uncovered.length, 1, 'the sliver is still recorded');
  const strip = recordingRegion([rect(80, 60, 1000, 760), rect(1080, 60, 430, 600)]);
  assert.match(strip.problem, /430 × 160 pt at \(1080, 660\) holds neither window/);
  const gap = recordingRegion([rect(0, 0, 500, 700), rect(600, 0, 500, 700)]);
  assert.match(gap.problem, /100 × 700 pt at \(500, 0\)/);
  assert.match(recordingRegion([rect(0, 0, 500, 700)]).problem, /two windows/);
});

test('overlapping windows still fill their rectangle with harness windows only', () => {
  assert.equal(recordingRegion([rect(0, 0, 600, 700), rect(500, 0, 600, 700)]).problem, null);
});

test('the frontmost app\'s windows must stay off the region; off-screen ones do not count', () => {
  const region = rect(80, 60, 1430, 760);
  assert.equal(overlapProblem(region, [{number: 3, bounds: rect(80, 830, 1430, 150), onScreen: true}]), null);
  assert.match(overlapProblem(region, [{number: 3, bounds: rect(900, 700, 600, 280), onScreen: true}]), /window 3 .* overlaps the recording region/);
  assert.equal(overlapProblem(region, [{number: 3, bounds: rect(900, 700, 600, 280), onScreen: false}]), null);
});

test('item 1 records only with both run windows on screen, filling the region, both in the background, nothing of the front app over them', () => {
  const windows = {textedit: rect(1080, 60, 430, 760), chrome: rect(80, 60, 1000, 760)}, pids = {textedit: 11, chrome: 12};
  const terminal = {pid: 40, bundleId: 'com.cmuxterm.app'};
  const ok = recordingPlan({windows, pids, frontmost: terminal, frontWindows: [{number: 3, bounds: rect(80, 830, 1430, 150), onScreen: true}]});
  assert.equal(ok.ok, true, ok.problem);
  assert.deepEqual(ok.region, rect(80, 60, 1430, 760));
  assert.deepEqual(ok.frontmost, terminal);
  assert.match(recordingPlan({windows: {...windows, chrome: null}, pids, frontmost: terminal}).problem, /chrome scene's run window is not on screen/);
  assert.match(recordingPlan({windows: {...windows, textedit: rect(1080, 60, 430, 600)}, pids, frontmost: terminal}).problem, /holds neither window/);
  assert.match(recordingPlan({windows, pids, frontmost: {pid: 12, bundleId: 'x'}}).problem, /chrome scene is frontmost/);
  assert.match(recordingPlan({windows, pids, frontmost: terminal, frontWindows: [{number: 3, bounds: rect(900, 700, 600, 280), onScreen: true}]}).problem, /overlaps the recording region/);
  assert.equal(recordingPlan({windows, pids, frontmost: null}).ok, true, 'no frontmost process read: nothing of it can be over the region');
});

test('the recorder records that region, silently, with a cap, into the clip', () => {
  assert.deepEqual(screencaptureArgs({region: rect(80, 60, 1430, 760), file: '/x/item-1.mov', capSeconds: 300}),
    ['-v', '-x', '-V', '300', '-R', '80,60,1430,760', '/x/item-1.mov']);
});

test('the clip stays outside the repository, is a new .mov, by absolute path', t => {
  const dir = scratch(t), repo = join(dir, 'repo');
  assert.equal(clipPathProblem(join(dir, 'item-1.mov'), repo), null);
  assert.match(clipPathProblem(join(repo, 'docs', 'item-1.mov'), repo), /outside the repository/);
  assert.match(clipPathProblem('item-1.mov', repo), /absolute/);
  assert.match(clipPathProblem(join(dir, 'item-1.mp4'), repo), /\.mov/);
  writeFileSync(join(dir, 'old.mov'), '');
  assert.match(clipPathProblem(join(dir, 'old.mov'), repo), /exists/);
});

// A stand-in recorder: writes its file when interrupted (as screencapture does on ctrl-c), or exits at once.
const STAND_IN = `
const file = process.argv.at(-1);
if (process.env.EXIT_AT_ONCE) { process.stderr.write('could not start'); process.exit(1); }
process.stdout.write('type any character (or ctrl-c) to stop screen recording\\n');
process.on('SIGINT', () => { require('node:fs').writeFileSync(file, 'movie'); process.exit(0); });
setInterval(() => {}, 1000);`;

test('a recorder that keeps running is started, stopped with an interrupt, and its file kept with its hash', async t => {
  const dir = scratch(t), file = join(dir, 'item-1.mov');
  const started = await startRecording({command: process.execPath, args: ['-e', STAND_IN, file], startCheckMs: 300});
  assert.equal(started.ok, true, started.problem);
  assert.ok(started.spawnAt <= started.readyAt, 'its first line\'s time is kept');
  const stopped = await stopRecording(started.handle, {file});
  assert.equal(stopped.ok, true, stopped.problem);
  assert.equal(stopped.bytes, 5);
  assert.match(stopped.sha256, /^[0-9a-f]{64}$/);
  assert.equal(stopped.signal, null);
  assert.ok(stopped.stopAt >= started.spawnAt);
});

test('a recorder that exits at once is refused, with what it said', async t => {
  const dir = scratch(t);
  const started = await startRecording({command: process.execPath, args: ['-e', STAND_IN, join(dir, 'x.mov')], env: {...process.env, EXIT_AT_ONCE: '1'}, startCheckMs: 2000});
  assert.equal(started.ok, false);
  assert.match(started.problem, /exited at once \(code 1\): could not start/);
});

test('a recorder that left no file is a failed stop', async t => {
  const dir = scratch(t), file = join(dir, 'never.mov');
  const started = await startRecording({command: process.execPath, args: ['-e', 'process.on("SIGINT", () => process.exit(0)); setInterval(() => {}, 1000);'], startCheckMs: 200});
  const stopped = await stopRecording(started.handle, {file});
  assert.equal(stopped.ok, false);
  assert.match(stopped.problem, /no clip at/);
});
