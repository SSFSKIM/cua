// Item 1's order without a clip (scripts/cursor-sitting/glide.mjs): the second click's change against the earliest
// arrival the engine could plan for its glide, from a known start, using the motion reference's own springs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {arrivalFloor, farPoint, FRAME_MS, orderFromMeta} from '../../scripts/cursor-sitting/glide.mjs';
import {main} from '../../scripts/cursor-sitting.mjs';

const rect = (x, y, width, height) => ({x, y, width, height});
const vectors = JSON.parse(readFileSync(new URL('../../native/engine/Tests/EngineTests/Fixtures/cursor-reference/vectors.json', import.meta.url), 'utf8'));

test('the known start is TextEdit\'s point farthest from Chrome\'s window, and the move is at least the distance to it', () => {
  const far = farPoint(rect(1000, 60, 500, 760), rect(80, 60, 900, 760));
  assert.deepEqual(far.fraction, [0.9, 0.15], 'TextEdit on the right: its right side');
  assert.ok(Math.abs(far.dMin - (1450 - 980)) < 1e-9);
  assert.equal(farPoint(rect(100, 100, 400, 400), rect(50, 50, 600, 600)).dMin, 0, 'inside Chrome\'s rectangle: no distance to count on');
});

test('the floor never exceeds a glide the reference plans: every vector case arrives no earlier than its floor', () => {
  for (const c of vectors.cases) {
    const floor = arrivalFloor(c.distance);
    assert.ok(floor.seconds <= c.settleTime + 1e-9, `${c.name}: floor ${floor.seconds} s against the case's settle ${c.settleTime} s`);
  }
});

test('the floor grows with the move: tiny moves give nothing to count on, a long one a path\'s worth', () => {
  const tiny = arrivalFloor(0), short = arrivalFloor(150), long = arrivalFloor(500);
  assert.ok(tiny.seconds < 0.05, `a move of 0 pt can arrive at once (${tiny.seconds} s)`);
  assert.ok(short.seconds > 0.1 && short.seconds <= long.seconds + 1e-9, `${short.seconds} s for 150 pt, ${long.seconds} s for 500 pt`);
  assert.equal(long.mode, 'path');
  assert.ok(long.response >= 0.3726 - 1e-9);
});

const rows = ({dMin = 470, engineMs = 60} = {}) => [
  {kind: 'start'},
  {kind: 'cell', ok: true, orderTarget: 'first-target', route: '1', meta: {engineMs: 30, receivedAt: 1}},
  {kind: 'task', task: 'glide-start', result: {ok: true, fraction: [0.9, 0.15], point: {x: 1450, y: 174}, dMin}},
  {kind: 'cell', ok: true, orderTarget: 'second-target', route: '3', meta: {engineMs, receivedAt: 2}},
];

test('the order from the engine\'s numbers: before when engineMs plus a frame is under the floor; the fade-in target stays open', () => {
  const judged = orderFromMeta(rows());
  const second = judged.targets['second-target'];
  assert.equal(second.verdict, 'pass');
  assert.equal(second.doneMs, 60 + FRAME_MS);
  assert.ok(second.plannedGlide.floorMs > second.doneMs);
  assert.equal(judged.targets['first-target'].verdict, 'undetermined');
  assert.match(judged.targets['first-target'].reason, /fades in/);
  assert.equal(orderFromMeta(rows({dMin: 0, engineMs: 300})).targets['second-target'].verdict, 'undetermined', 'no distance and a slow click: not decided');
  assert.throws(() => orderFromMeta(rows().filter(r => r.task !== 'glide-start')), /glide-start/);
  assert.throws(() => orderFromMeta(rows().map(r => (r.orderTarget === 'second-target' ? {...r, meta: {}} : r))), /engineMs/);
});

test('order-meta writes its judgement and appends both order verdicts', async t => {
  const out = mkdtempSync(join(tmpdir(), 'cua-235-glide-'));
  t.after(() => rmSync(out, {recursive: true, force: true}));
  writeFileSync(join(out, 'item-1.jsonl'), rows().map(r => JSON.stringify(r)).join('\n') + '\n');
  const write = process.stdout.write; process.stdout.write = () => true;
  let code; try { code = await main(['order-meta', '--out', out]); } finally { process.stdout.write = write; }
  assert.equal(code, 0);
  assert.match(readFileSync(join(out, 'item-1-order-meta.md'), 'utf8'), /second-target: pass/);
  const verdicts = readFileSync(join(out, 'verdicts.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(verdicts.map(v => [v.id, v.verdict]), [['order-first-target', 'undetermined'], ['order-second-target', 'pass']]);
});

test('the planned settle of a move, from the reference: what the still series waits out', async () => {
  const {plannedSettle} = await import('../../scripts/cursor-sitting/glide.mjs');
  for (const c of vectors.cases.filter(v => v.panelHeight === 900)) {
    const toGlobal = p => ({x: p.x, y: c.panelHeight - p.y});
    const planned = plannedSettle(toGlobal(c.from), toGlobal(c.to), {width: 1440, height: 900, menuBar: 30});
    assert.equal(planned.mode, c.mode, c.name);
    assert.ok(Math.abs(planned.settleSeconds - c.settleTime) < 1e-9, `${c.name}: ${planned.settleSeconds} against ${c.settleTime}`);
  }
});

test('overlays: the scene\'s own on-screen windows above its run window, front to back', async () => {
  const {overlaysAbove} = await import('../../scripts/cursor-sitting/glide.mjs');
  const w = (number, width, height, onScreen = true) => ({number, bounds: {x: 0, y: 0, width, height}, onScreen});
  assert.deepEqual(overlaysAbove([w(9, 53, 48), w(7, 700, 700), w(5, 40, 40)], 7).map(o => o.number), [9]);
  assert.deepEqual(overlaysAbove([w(9, 53, 48, false), w(7, 700, 700)], 7), []);
  assert.deepEqual(overlaysAbove([w(7, 700, 700)], 7), []);
  assert.deepEqual(overlaysAbove([w(9, 53, 48)], 7).map(o => o.number), [9], 'a run window not on screen: everything is above it');
});
