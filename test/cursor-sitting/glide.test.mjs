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
  const judged = orderFromMeta(gated());
  const second = judged.targets['second-target'];
  assert.equal(second.verdict, 'pass');
  assert.equal(second.doneMs, 60 + FRAME_MS);
  assert.ok(second.plannedGlide.floorMs > second.doneMs);
  assert.equal(judged.targets['first-target'].verdict, 'undetermined');
  assert.match(judged.targets['first-target'].reason, /fades in/);
  assert.equal(orderFromMeta(gated().map(r => (r.task === 'glide-start' ? {...r, result: {...r.result, dMin: 0}} : r.orderTarget === 'second-target' ? {...r, meta: {...r.meta, engineMs: 300}} : r))).targets['second-target'].verdict, 'undetermined', 'no distance and a slow click: not decided');
  assert.throws(() => orderFromMeta(rows().filter(r => r.task !== 'glide-start')), /glide-start/);
  assert.throws(() => orderFromMeta(rows().map(r => (r.orderTarget === 'second-target' ? {...r, meta: {}} : r))), /engineMs/);
});

test('order-meta writes its judgement and appends both order verdicts', async t => {
  const out = mkdtempSync(join(tmpdir(), 'cua-235-glide-'));
  t.after(() => rmSync(out, {recursive: true, force: true}));
  writeFileSync(join(out, 'item-1.jsonl'), gated().map(r => JSON.stringify(r)).join('\n') + '\n');
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

test('what covers the target window, by the engine\'s own occlusion rule: a window above it, not the engine\'s, at a normal or menu layer', async () => {
  const {coverOver} = await import('../../scripts/cursor-sitting/glide.mjs');
  const w = (ownerPid, number, bounds, layer = 0) => ({ownerPid, number, layer, bounds, onScreen: true});
  const chrome = rect(80, 60, 900, 760);
  const list = [w(1, 50, rect(0, 0, 1512, 982), 25), w(9, 44, rect(0, 0, 1512, 982)), w(40, 3, rect(800, 700, 400, 200)), w(12, 70, chrome), w(40, 4, rect(0, 0, 300, 300))];
  assert.deepEqual(coverOver(list, 70, chrome, [9]).map(c => c.number), [3], 'the engine\'s panel and a layer-25 window pass over; the terminal above Chrome covers it; one below does not');
  assert.deepEqual(coverOver(list.filter(x => x.number !== 3), 70, chrome, [9]), []);
  assert.equal(coverOver(list, 99, chrome, [9]), null, 'a target not on screen: nothing can be ruled out');
});

// The scroll's row recorded on its reply at 10 s, the second click's on its reply 2 s later (rows carry `at`, ms).
const gated = ({scroll = true, covered = false, cover = true, gapMs = 2000} = {}) => {
  const r = rows();
  const at = r.findIndex(x => x.orderTarget === 'second-target');
  const extra = [{kind: 'cell', ok: scroll, role: 'glide-scroll', at: 10_000, ...(scroll ? {} : {error: 'refused'})},
    ...(cover ? [{kind: 'task', task: 'glide-cover', result: {ok: !covered, covers: covered ? [{number: 3}] : []}}] : [])];
  return [...r.slice(0, at), ...extra, {...r[at], at: 10_000 + gapMs}, ...r.slice(at + 1)];
};

test('the order needs the cursor to have reached its start, and nothing over Chrome\'s window that could make the engine snap', () => {
  assert.equal(orderFromMeta(gated()).targets['second-target'].verdict, 'pass');
  const failed = orderFromMeta(gated({scroll: false})).targets['second-target'];
  assert.equal(failed.verdict, 'undetermined');
  assert.match(failed.reason, /positioning scroll failed/);
  const covered = orderFromMeta(gated({covered: true})).targets['second-target'];
  assert.equal(covered.verdict, 'undetermined');
  assert.match(covered.reason, /snap/);
  assert.match(orderFromMeta(gated({cover: false})).targets['second-target'].reason, /no reading of what covers/);
  assert.match(orderFromMeta(rows()).targets['second-target'].reason, /positioning scroll/, 'a run without the scroll\'s row decides nothing');
});

test('the order needs the cursor still visible at its start when the click is sent: the idle fade would make it fade in, not glide', async () => {
  const {VISIBLE_START_MS} = await import('../../scripts/cursor-sitting/glide.mjs');
  assert.equal(orderFromMeta(gated({gapMs: 2000})).targets['second-target'].verdict, 'pass');
  // the click's request begins about engineMs before its reply: 10 s + gap - 60 ms after the scroll's reply at 10 s
  const late = orderFromMeta(gated({gapMs: VISIBLE_START_MS + 60 + 1})).targets['second-target'];
  assert.equal(late.verdict, 'undetermined');
  assert.match(late.reason, /idle/);
  assert.ok(VISIBLE_START_MS < 5000 && VISIBLE_START_MS >= 3000, 'under the engine\'s 5 s idle, with a margin');
  const untimed = gated().map(r => (r.role === 'glide-scroll' ? {...r, at: undefined} : r));
  assert.match(orderFromMeta(untimed).targets['second-target'].reason, /no time/);
});

test('the window-list probe is compiled before the cursor is positioned, never between the scroll and the click', async () => {
  const {PLANS} = await import('../../scripts/cursor-sitting/plans.mjs');
  const steps = PLANS[1]({noClip: true});
  const ready = steps.findIndex(s => s.task === 'window-list-ready');
  assert.ok(ready >= 0 && steps[ready].required === true);
  assert.ok(ready < steps.findIndex(s => s.task === 'glide-start') && ready < steps.findIndex(s => s.open));
});
