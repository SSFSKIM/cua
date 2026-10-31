// Item 1's screen recording (scripts/cursor-sitting/recording.mjs): the region is the rectangle the two harness windows
// fill, refused when it holds more than them (a gap, a strip beside the shorter window, the frontmost app's window over
// it); the clip is kept outside the repository; the recorder is started, checked to be running, and stopped so that it
// writes its file. The recorder here is a stand-in process: nothing is captured.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clipPathProblem, overlapProblem, recordingPlan, recordingRegion, screencaptureCommand, startRecording, stopRecording,
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

test('the recorder records that region, silently, into the clip, with no -V (a time-limited recording takes no stop)', () => {
  assert.deepEqual(screencaptureCommand({region: rect(80, 60, 1430, 760), file: '/x/item-1.mov'}),
    ['/usr/sbin/screencapture', '-v', '-x', '-R', '80,60,1430,760', '/x/item-1.mov']);
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

// A stand-in recorder that behaves as screencapture -v did on the MacBook (2026-10-31): on a terminal it says it is
// recording, and a character typed there (read raw) stops it and writes the movie; on a pipe it says nothing and takes
// no stop. EXIT_AT_ONCE: it cannot record; SILENT: it records but never says so; NO_FILE: it stops without a movie;
// IGNORE_INPUT: it prompts, then ignores its terminal's input, SIGTERM, SIGHUP and SIGINT (only SIGKILL ends it).
const STAND_IN = `
const file = process.argv.at(-1);
if (process.env.EXIT_AT_ONCE) { process.stderr.write('could not start'); process.exit(1); }
if (process.env.IGNORE_INPUT) {
  for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(sig, () => {});
  process.stdout.write('type any character (or ctrl-c) to stop screen recording\\n');
  setInterval(() => {}, 1000);
} else
if (process.stdin.isTTY && !process.env.SILENT) {
  process.stdin.setRawMode(true);
  process.stdout.write('type any character (or ctrl-c) to stop screen recording\\n');
  process.stdin.once('data', () => { if (!process.env.NO_FILE) require('node:fs').writeFileSync(file, 'movie'); process.exit(0); });
}
setInterval(() => {}, 1000);`;
const standIn = file => [process.execPath, '-e', STAND_IN, file];

test('a recorder on its own terminal says it is recording, is stopped there, and its movie is kept with its hash', async t => {
  const dir = scratch(t), file = join(dir, 'item-1.mov');
  const started = await startRecording({recorder: standIn(file)});
  assert.equal(started.ok, true, started.problem);
  assert.ok(started.readyAt >= started.spawnAt, 'its prompt\'s time is kept');
  const stopped = await stopRecording(started.handle, {file, stopMs: 5000});
  assert.equal(stopped.ok, true, stopped.problem);
  assert.equal(stopped.bytes, 5);
  assert.match(stopped.sha256, /^[0-9a-f]{64}$/);
  assert.equal(stopped.code, 0);
  assert.ok(stopped.exitedAt - stopped.stopAt < 2000);
});

test('the terminal types the stop itself at the cap, and when the kit goes away (its pipe closes)', async t => {
  const dir = scratch(t);
  const capped = join(dir, 'capped.mov');
  const started = await startRecording({recorder: standIn(capped), capSeconds: 1});
  assert.equal(started.ok, true, started.problem);
  const exit = await started.handle.exited;
  assert.ok(exit.at - started.spawnAt < 3000 && exit.code === 0, 'stopped by the cap');
  assert.equal((await stopRecording(started.handle, {file: capped})).ok, true, 'a stop after the cap keeps the movie');
  const orphan = join(dir, 'orphan.mov');
  const again = await startRecording({recorder: standIn(orphan)});
  again.handle.child.stdin.end();
  assert.equal((await again.handle.exited).code, 0);
  assert.equal(readFileSync(orphan, 'utf8'), 'movie');
});

test('a recorder that exits at once, or never says it is recording, is refused, with what it said', async t => {
  const dir = scratch(t);
  const failed = await startRecording({recorder: standIn(join(dir, 'x.mov')), env: {...process.env, EXIT_AT_ONCE: '1'}, startCheckMs: 3000});
  assert.equal(failed.ok, false);
  assert.match(failed.problem, /exited at once \(code 1\): could not start/);
  const silent = await startRecording({recorder: standIn(join(dir, 'y.mov')), env: {...process.env, SILENT: '1'}, startCheckMs: 500});
  assert.equal(silent.ok, false);
  assert.match(silent.problem, /did not say it is recording within 500 ms/);
});

test('a killed terminal hangs its recorder up: none is left recording behind it', async t => {
  const dir = scratch(t);
  const started = await startRecording({recorder: standIn(join(dir, 'x.mov'))});
  const recorder = Number(spawnSync('pgrep', ['-P', String(started.handle.child.pid)], {encoding: 'utf8'}).stdout.trim());
  assert.ok(recorder > 0);
  started.handle.child.kill('SIGKILL');
  await started.handle.exited;
  const alive = () => { try { process.kill(recorder, 0); return true; } catch { return false; } };
  for (let i = 0; i < 40 && alive(); i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(alive(), false, 'the recorder ended with its terminal');
});

test('a recorder that left no movie is a failed stop', async t => {
  const dir = scratch(t), file = join(dir, 'never.mov');
  const started = await startRecording({recorder: standIn(file), env: {...process.env, NO_FILE: '1'}});
  const stopped = await stopRecording(started.handle, {file, stopMs: 5000});
  assert.equal(stopped.ok, false);
  assert.match(stopped.problem, /no clip at/);
});

test('neither the start check nor the stop leaves a timer that keeps the process alive once the recorder has answered', t => {
  const dir = scratch(t);
  // A process that starts a recorder and stops it, then one that exits at once, with long bounds (5 s each), and then
  // has nothing left to do: it must end as soon as both have answered, not when the bounds run out.
  const script = `
import {startRecording, stopRecording} from ${JSON.stringify(new URL('../../scripts/cursor-sitting/recording.mjs', import.meta.url).href)};
const file = ${JSON.stringify(join(dir, 'item-1.mov'))};
const recorder = [process.execPath, '-e', process.env.STAND_IN, file];
const started = await startRecording({recorder, startCheckMs: 5000});
const stopped = await stopRecording(started.handle, {file, stopMs: 5000});
const refused = await startRecording({recorder, env: {...process.env, EXIT_AT_ONCE: '1'}, startCheckMs: 5000});
process.stdout.write(JSON.stringify({stopped: stopped.ok, refused: refused.ok, at: Date.now()}));`;
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8', env: {...process.env, STAND_IN}, timeout: 20_000});
  const ended = Date.now();
  const answer = JSON.parse(ran.stdout);
  assert.deepEqual([answer.stopped, answer.refused], [true, false]);
  assert.ok(ended - answer.at < 1500, `the process lived ${ended - answer.at} ms after its last answer`);
});

const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const childOf = pid => Number(spawnSync('pgrep', ['-P', String(pid)], {encoding: 'utf8'}).stdout.trim().split('\n')[0]) || null;
const gone = async (pids, ms) => { const until = Date.now() + ms; while (pids.some(alive) && Date.now() < until) await new Promise(r => setTimeout(r, 50)); return !pids.some(alive); };
// The bound after a stop request: the grace, then SIGTERM's two seconds before SIGKILL, and the polls' slack.
const GRACE_S = 0.3, BOUND_MS = (GRACE_S + 2) * 1000 + 1500;

test('a recorder that ignores its terminal and every polite signal is ended once the grace after the cap has run out', async t => {
  const dir = scratch(t);
  const started = await startRecording({recorder: standIn(join(dir, 'x.mov')), env: {...process.env, IGNORE_INPUT: '1'}, capSeconds: 0.5, graceSeconds: GRACE_S});
  assert.equal(started.ok, true, started.problem);
  const recorder = childOf(started.handle.child.pid);
  assert.ok(recorder > 0);
  const exit = await started.handle.exited;
  assert.ok(exit.at - started.spawnAt < 500 + BOUND_MS, `the terminal ended ${exit.at - started.spawnAt} ms after its launch`);
  assert.equal(exit.code, 128 + 9, 'the recorder was killed (SIGKILL), its terminal exits with that');
  assert.equal(await gone([recorder], 500), true, 'the recorder is gone');
});

test('a killed kit leaves neither the terminal nor a recorder that ignores its input alive past the bound', async t => {
  const dir = scratch(t);
  // A kit that starts a recording (cap 30 s, so only the kit's death can stop it), says the pids, and waits.
  const kit = spawn(process.execPath, ['--input-type=module', '-e', `
import {startRecording} from ${JSON.stringify(new URL('../../scripts/cursor-sitting/recording.mjs', import.meta.url).href)};
const started = await startRecording({recorder: [process.execPath, '-e', process.env.STAND_IN, ${JSON.stringify(join(dir, 'y.mov'))}], capSeconds: 30, graceSeconds: ${GRACE_S}});
process.stdout.write(JSON.stringify({ok: started.ok, terminal: started.handle?.child.pid}) + '\\n');
setInterval(() => {}, 1000);`], {stdio: ['ignore', 'pipe', 'inherit'], env: {...process.env, STAND_IN, IGNORE_INPUT: '1'}});
  t.after(() => kit.kill('SIGKILL'));
  const said = JSON.parse(await new Promise(resolve => kit.stdout.once('data', chunk => resolve(String(chunk)))));
  assert.equal(said.ok, true);
  const recorder = childOf(said.terminal);
  assert.ok(recorder > 0 && alive(recorder));
  const killedAt = Date.now();
  kit.kill('SIGKILL');
  assert.equal(await gone([said.terminal, recorder], BOUND_MS), true, `still alive ${Date.now() - killedAt} ms after the kit was killed`);
});
