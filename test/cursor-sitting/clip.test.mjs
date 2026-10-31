// Item 1's order from its recording (scripts/cursor-sitting/clip.mjs, cursor-sitting.mjs clip frames|order): the frames
// around each click, cropped to the target scene's window, then the judged frames (the first where the control changes,
// the first where the arrow's tip reaches the target) ordered on the clip's clock and placed on the request meta's clock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clipEvidence, cropOf, CURSOR_LEAD_MS, framesWindow, indexRange, judgeOrder, frameFile} from '../../scripts/cursor-sitting/clip.mjs';
import {main} from '../../scripts/cursor-sitting.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-235-clip-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; process.stdout.write = () => true; try { return await run(); } finally { process.stdout.write = write; } };
const rect = (x, y, width, height) => ({x, y, width, height});
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';

// Item 1's rows as the runner records them: the recording's start, the two order targets' clicks with their meta, its stop.
const itemRows = ({spawnAt = 8000, first = 9990, second = 11990} = {}) => [
  {kind: 'start'},
  {kind: 'task', task: 'record-start', result: {ok: true, clip: '/rec/item-1.mov', region: rect(0, 0, 100, 50),
    windows: {textedit: rect(0, 0, 40, 50), chrome: rect(40, 0, 60, 50)}, spawnAt, readyAt: spawnAt + 120}},
  {kind: 'cell', ok: true, label: 'TextEdit: the format bar\'s alignment', orderTarget: 'first-target', route: '1', at: first + 40,
    meta: {receivedAt: first, engineMs: 30, actionInterval: {startedAt: first + 10, endedAt: first + 14}}},
  {kind: 'cell', ok: true, label: 'Chrome for Testing: the page\'s "Scene option" checkbox', orderTarget: 'second-target', route: '1', at: second + 60,
    meta: {receivedAt: second, engineMs: 55, actionInterval: {startedAt: second + 8, endedAt: second + 9}}},
  {kind: 'task', task: 'record-stop', result: {ok: true, sha256: 'c'.repeat(64), bytes: 9}},
];

test('the recording and both clicks are found in item 1\'s last attempt, or the sentence says what is missing', () => {
  const evidence = clipEvidence(itemRows());
  assert.equal(evidence.recording.clip, '/rec/item-1.mov');
  assert.equal(evidence.stop.sha256, 'c'.repeat(64));
  assert.equal(evidence.clicks['second-target'].meta.receivedAt, 11990);
  assert.throws(() => clipEvidence(itemRows().filter(r => r.task !== 'record-start')), /no recording started/);
  assert.throws(() => clipEvidence(itemRows().filter(r => r.orderTarget !== 'second-target')), /second-target/);
  assert.throws(() => clipEvidence(itemRows().map(r => (r.orderTarget === 'first-target' ? {...r, meta: {}} : r))), /receivedAt/);
});

test('the frames kept around a click cover every start the recorder could have had, then the longest glide', () => {
  // received 3990 ms after the recorder was launched; its first frame came 0–3000 ms after the launch.
  const [from, to] = framesWindow({receivedAt: 11990, spawnAt: 8000});
  assert.equal(from, (3990 - 3000 - 300) / 1000);
  assert.equal(to, (3990 + 1500) / 1000);
  assert.deepEqual(framesWindow({receivedAt: 8100, spawnAt: 8000}), [0, 1.6]);
});

test('frame ranges and crops: indices by presentation time, the scene window in the clip\'s pixels, inside the frame', () => {
  const pts = Array.from({length: 120}, (_, i) => i / 60);
  assert.deepEqual(indexRange(pts, 0.5, 1), [30, 60]);
  assert.equal(indexRange(pts, 5, 6), null);
  assert.deepEqual(cropOf(rect(40, 0, 60, 50), rect(0, 0, 100, 50), 2, {width: 200, height: 100}), {x: 80, y: 0, width: 120, height: 100});
  assert.deepEqual(cropOf(rect(-5, 10, 30, 80), rect(0, 0, 100, 50), 2, {width: 200, height: 100}), {x: 0, y: 20, width: 50, height: 80}, 'clipped to the frame');
  assert.equal(frameFile('second-target', 42), 'second-target-f000042.jpg');
});

// The frames' record as `clip frames` writes it: 60 fps from 0.
function framesRecord({spawnAt = 8000} = {}) {
  const evidence = clipEvidence(itemRows({spawnAt}));
  const frames = (from, to) => Array.from({length: to - from + 1}, (_, k) => ({index: from + k, pts: (from + k) / 60, file: null}));
  return {clip: evidence.recording.clip, sha256: evidence.stop.sha256, region: evidence.recording.region, scale: 2,
    video: {width: 200, height: 100, frames: 900, firstPts: 0}, recording: {spawnAt, readyAt: spawnAt + 120},
    targets: {
      'first-target': {scene: 'textedit', click: evidence.clicks['first-target'], frames: frames(60, 160).map(f => ({...f, file: frameFile('first-target', f.index)}))},
      'second-target': {scene: 'chrome', click: evidence.clicks['second-target'], frames: frames(180, 300).map(f => ({...f, file: frameFile('second-target', f.index)}))},
    }};
}

test('the order compares first frames: an earlier change is before, the same frame while, a later one after; the clip put on the engine\'s clock at the cursor\'s first frame', () => {
  const record = framesRecord();
  const judged = judgeOrder(record, {'first-target': {change: 100, arrival: 100}, 'second-target': {change: 200, arrival: 236}});
  // The anchor: the cursor's first frame (first-target's arrival, 100 / 60 s) is the first click's start plus the plan's lead.
  assert.equal(judged.join.anchor.wall, 9990 + 10 + CURSOR_LEAD_MS);
  assert.ok(Math.abs(judged.join.offsetMs - (10020 - 100 / 60 * 1000)) < 1e-6);
  assert.equal(judged.join.consistent, true, 'the recorder\'s first frame lands 0–3000 ms after its launch');
  const first = judged.targets['first-target'], second = judged.targets['second-target'];
  assert.equal(first.order, 'while');
  assert.equal(first.pass, true);
  assert.equal(second.order, 'before');
  assert.equal(second.framesApart, 36);
  assert.ok(Math.abs(second.msApart - 600) < 1e-6);
  // On the request's clock: 200 / 60 s into the clip is 10020 + (200 − 100) / 60 · 1000 ms.
  assert.ok(Math.abs(second.change.sinceReceivedMs - (10020 + 100 / 60 * 1000 - 11990)) < 1e-6);
  assert.equal(judged.pass, true);
  const late = judgeOrder(record, {'first-target': {change: 100, arrival: 100}, 'second-target': {change: 240, arrival: 236}});
  assert.equal(late.targets['second-target'].order, 'after');
  assert.equal(late.pass, false);
  const oneFrame = judgeOrder(record, {'first-target': {change: 101, arrival: 100}, 'second-target': {change: 235, arrival: 236}});
  assert.equal(oneFrame.targets['first-target'].order, 'after', 'a change one frame after the arrival is after');
  assert.equal(oneFrame.targets['first-target'].pass, false);
  assert.equal(oneFrame.targets['second-target'].order, 'before', 'a change one frame before it is before');
  assert.equal(oneFrame.pass, false);
});

test('a join that would start the clip before its recorder was launched is flagged, not trusted', () => {
  const judged = judgeOrder(framesRecord({spawnAt: 9500}), {'first-target': {change: 100, arrival: 100}, 'second-target': {change: 200, arrival: 236}});
  assert.equal(judged.join.consistent, false);
  assert.match(judged.join.problem, /before its recorder was launched/);
  assert.equal(judged.pass, true, 'the order comes from the frames alone');
});

test('a judged frame must be one extracted for that target', () => {
  assert.throws(() => judgeOrder(framesRecord(), {'first-target': {change: 101, arrival: 100}, 'second-target': {change: 999, arrival: 236}}), /frame 999 is not among the second-target's extracted frames/);
  assert.throws(() => judgeOrder(framesRecord(), {'first-target': {change: 101, arrival: 100}}), /second-target/);
});

test('clip order writes the order, copies the judged frames into the evidence, and appends both verdicts', async t => {
  const dir = scratch(t), frames = join(dir, 'frames'), out = join(dir, 'out');
  mkdirSync(frames); mkdirSync(out);
  const record = framesRecord();
  writeFileSync(join(frames, 'frames.json'), JSON.stringify(record));
  for (const target of Object.values(record.targets)) for (const f of target.frames) writeFileSync(join(frames, f.file), `jpeg ${f.index}`);
  const code = await quietly(() => main(['clip', 'order', '--frames', frames, '--out', out, 'first-target', '100', '100', 'second-target', '200', '236']));
  assert.equal(code, 0);
  const order = JSON.parse(readFileSync(join(out, 'item-1-order.json'), 'utf8'));
  assert.equal(order.targets['second-target'].order, 'before');
  assert.match(readFileSync(join(out, 'item-1-order.md'), 'utf8'), /second-target.*before/);
  assert.deepEqual(readdirSync(join(out, 'item-1-frames')).sort(), [
    'first-target-arrival-f000100.jpg', 'first-target-before-arrival-f000099.jpg', 'first-target-before-change-f000099.jpg', 'first-target-change-f000100.jpg',
    'second-target-arrival-f000236.jpg', 'second-target-before-arrival-f000235.jpg', 'second-target-before-change-f000199.jpg', 'second-target-change-f000200.jpg']);
  const verdicts = readFileSync(join(out, 'verdicts.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(verdicts.map(v => [v.item, v.id, v.verdict]), [['1', 'order-first-target', 'pass'], ['1', 'order-second-target', 'pass']]);
  assert.match(verdicts[1].note, /^from the recording's frames: .*before by 36 frames/);
  await assert.rejects(main(['clip', 'order', '--frames', frames, '--out', out, 'first-target', '101']), /first-target <change> <arrival> second-target <change> <arrival>/);
});

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); execFileSync('ffprobe', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();

test('clip frames extracts each click\'s frames from a real clip, numbered by the clip\'s own frame index, cropped to the scene', {skip: hasFfmpeg ? false : 'needs ffmpeg and ffprobe'}, async t => {
  const dir = scratch(t), out = join(dir, 'out'), frames = join(dir, 'frames');
  mkdirSync(out);
  // A 6 s, 30 fps, 200 × 100 test pattern stands in for the recording (a 100 × 50 pt region at 2 px per pt).
  const clip = join(dir, 'item-1.mov');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=200x100:rate=30:duration=6', '-c:v', 'mjpeg', '-q:v', '3', clip]);
  const sha256 = createHash('sha256').update(readFileSync(clip)).digest('hex');
  const rows = itemRows({spawnAt: 8000, first: 11000, second: 12500}).map(r => (r.task === 'record-start' ? {...r, result: {...r.result, clip}}
    : r.task === 'record-stop' ? {...r, result: {...r.result, sha256}} : r));
  writeFileSync(join(out, 'item-1.jsonl'), jsonl(rows.map(r => (r.task === 'record-stop' ? {...r, result: {...r.result, sha256: 'd'.repeat(64)}} : r))));
  await assert.rejects(main(['clip', 'frames', '--out', out, '--frames', frames]), /not the one recorded/);
  assert.ok(!existsSync(frames), 'nothing written for a clip that is not the recorded one');
  writeFileSync(join(out, 'item-1.jsonl'), jsonl(rows));
  assert.equal(await quietly(() => main(['clip', 'frames', '--out', out, '--frames', frames])), 0);
  const record = JSON.parse(readFileSync(join(frames, 'frames.json'), 'utf8'));
  assert.equal(record.scale, 2);
  assert.equal(record.sha256, sha256);
  const second = record.targets['second-target'];
  assert.deepEqual(second.crop, {x: 80, y: 0, width: 120, height: 100});
  // received 4500 ms after the launch: frames from 1.2 s (4.5 − 3 − 0.3) to the clip's end (6 s; 4.5 + 1.5 is past it).
  assert.equal(second.frames[0].index, 36);
  assert.equal(second.frames.at(-1).index, 179);
  for (const f of [second.frames[0], second.frames.at(-1)]) assert.ok(existsSync(join(frames, f.file)), f.file);
  assert.equal(readdirSync(frames).filter(f => f.startsWith('second-target-')).length, second.frames.length);
  const size = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', join(frames, second.frames[0].file)], {encoding: 'utf8'})).streams[0];
  assert.deepEqual([size.width, size.height], [120, 100]);
  await assert.rejects(main(['clip', 'frames', '--out', out, '--frames', frames]), /exists/);
});
