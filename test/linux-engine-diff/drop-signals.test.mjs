import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NEVER_TAKE_RULES,
  acceptTable,
  afterReleaseTable,
  blockPlan,
  coverTable,
  dragOutcome,
  lateTakeTable,
  neverTakeTable,
  parseDropStatus,
  signalsOf,
} from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';

const STATUS = [
  'dnd plain 3/2 nested 1/1 slider 0/0 dragstart-150 0/0 press-150 0/0 dragstart-400 1/0 press-400 0/0 link 0/0 image 0/0 seltext 2/0 last seltext effect 0 lat 4 dur 120',
  'select seq 7 text alpha_br',
  'range seq 8 inputs 5 value 10',
  'scroll seq 9 max 42',
  'canvas seq 10 moves 3',
  'press seq 11 at 123456',
];

test("the page's status lines parse into counts by source and each kind's last press", () => {
  const s = parseDropStatus(['Scroller', ...STATUS, 'Range']);
  assert.deepEqual(s.dnd.plain, { starts: 3, drops: 2 });
  assert.deepEqual(s.dnd['dragstart-400'], { starts: 1, drops: 0 });
  assert.deepEqual(s.last, { src: 'seltext', effect: 0, lat: 4, dur: 120 });
  assert.deepEqual(s.select, { seq: 7, text: 'alpha_br' });
  assert.deepEqual(s.range, { seq: 8, inputs: 5, value: 10 });
  assert.deepEqual(s.scroll, { seq: 9, max: 42 });
  assert.deepEqual(s.canvas, { seq: 10, moves: 3 });
  assert.deepEqual(s.press, { seq: 11, at: 123456 });
  assert.equal(parseDropStatus(['nothing here']).dnd, null, 'no dnd line: no counts, never zeros');
});

test("a drag's outcome: a source's start and the zone's drop, or a kind's effect on its own press, never another's", () => {
  const before = parseDropStatus(STATUS);
  const bump = (src, starts, drops) => parseDropStatus([STATUS[0].replace(`${src} ${before.dnd[src].starts}/${before.dnd[src].drops}`, `${src} ${starts}/${drops}`), ...STATUS.slice(1)]);
  assert.deepEqual(dragOutcome('plain', before, bump('plain', 4, 3)), { started: true, landed: true, effect: null });
  assert.deepEqual(dragOutcome('plain', before, bump('plain', 4, 2)), { started: true, landed: false, effect: null }, 'a take, no drop');
  assert.deepEqual(dragOutcome('nozone', before, bump('plain', 4, 2)), { started: true, landed: false, effect: null });
  assert.deepEqual(dragOutcome('plain', before, before), { started: false, landed: false, effect: null });
  assert.deepEqual(dragOutcome('plain', before, bump('nested', 2, 2)), { started: false, landed: false, effect: null }, "another source's start is not this drag's");
  // a kind with no source: its effect read from its own line, on the press the drag made
  const pressed = (lines) => parseDropStatus([...STATUS.slice(0, 5).map((l, k) => lines[k] ?? l), 'press seq 12 at 1']);
  assert.equal(dragOutcome('select', before, pressed({ 1: 'select seq 12 text bravo' })).effect, true);
  assert.equal(dragOutcome('select', before, pressed({ 1: 'select seq 12 text none' })).effect, false);
  assert.equal(dragOutcome('select', before, pressed({})).effect, false, "the line is an earlier press's");
  assert.equal(dragOutcome('scroller', before, pressed({ 3: 'scroll seq 12 max 30' })).effect, true);
  assert.equal(dragOutcome('canvas', before, pressed({ 4: 'canvas seq 12 moves 0' })).effect, false);
  assert.equal(dragOutcome('range', before, pressed({ 2: 'range seq 12 inputs 3 value 10' }), { i: 0 }).effect, true);
  assert.equal(dragOutcome('range', before, pressed({ 2: 'range seq 12 inputs 3 value 0' }), { i: 0 }).effect, false, 'pressed, not dragged to the end');
  assert.equal(dragOutcome('range', before, pressed({ 2: 'range seq 12 inputs 3 value 0' }), { i: 1 }).effect, true, 'the odd runs go back to 0');
  // the selected text's drag is a take under a text role
  assert.equal(dragOutcome('seltext', before, bump('seltext', 3, 0)).started, true);
  assert.equal(dragOutcome('inert', before, pressed({})).started, false);
});

const TARGET = 0x01400003;
// each line's server time its wall clock less a constant, as the watch's lines carry both
const take = (wall, owner = 0x0140000c) => ({ kind: 'take', owner, subtype: 0, server_time: wall - 900, wall_ms: wall });
const cursor = (wall, serial, named = false) => ({ kind: 'cursor', serial, named, server_time: wall - 900, image: `i${serial}`, wall_ms: wall });
const activate = (wall, window = 0x0140000c, source = 1) => ({ kind: 'activate', window, source, user_time: 0, wall_ms: wall });

test("a drag's signals from the watch: the take, a late take after the release, Chrome's activation after it, the cursors", () => {
  const lines = [cursor(990, 80), cursor(1003, 81), take(1004), cursor(1007, 82), cursor(1020, 83), activate(1053), cursor(1052, 81), take(1100, 0x02000001), activate(1060, 0x02000005)];
  const s = signalsOf(lines, { target: TARGET, pressMs: 1000, releaseMs: 1050 });
  assert.equal(s.take_after_press_ms, 4);
  assert.equal(s.late_take, false);
  assert.equal(s.activation_after_release_ms, 3, "the target's client, after the release; another client's ignored");
  assert.deepEqual(s.cursors.map((c) => [c.serial, c.t_ms]), [[81, 3], [82, 7], [83, 20], [81, 52]], 'from the press on');
  assert.equal(s.accept_shown, true, "the accept rule's change (the second strictly after the take, server time) came before the release");
  // the first status in the take's own millisecond: not counted, so no accept is read (accept.rs)
  assert.equal(signalsOf([cursor(1003, 81), take(1004), cursor(1004, 82), cursor(1020, 83)], { target: TARGET, pressMs: 1000, releaseMs: 1050 }).accept_shown, false);
  // a leave: the take, the first status, no accept, no activation
  const leave = signalsOf([cursor(1003, 81), take(1004), cursor(1007, 82), cursor(1051, 81)], { target: TARGET, pressMs: 1000, releaseMs: 1050 });
  assert.equal(leave.activation_after_release_ms, null);
  assert.equal(leave.accept_shown, false);
  // an activation before the release is not the drop's (the harness's own activation comes before the press)
  assert.equal(signalsOf([activate(1040), take(1004)], { target: TARGET, pressMs: 1000, releaseMs: 1050 }).activation_after_release_ms, null);
  assert.equal(signalsOf([activate(1060, 0x0140000c, 2)], { target: TARGET, pressMs: 1000, releaseMs: 1050 }).activation_after_release_ms, null, 'a pager-sourced request is the harness');
  // a late take: the selection taken after the release
  const late = signalsOf([take(1300)], { target: TARGET, pressMs: 1000, releaseMs: 1250 });
  assert.equal(late.late_take, true);
  assert.equal(late.take_after_release_ms, 50);
  assert.equal(signalsOf([], { target: TARGET, pressMs: 1000, releaseMs: 1250 }).take_after_press_ms, null);
});

test('the never-take rules read the deepest accessible at the start point', () => {
  const at = (role, extra = {}) => ({ deepest: { role, states: [], interfaces: ['Accessible'], attributes: {} }, in_selection: false, ...extra });
  assert.equal(NEVER_TAKE_RULES['role:range'](at('slider')), true);
  assert.equal(NEVER_TAKE_RULES['role:range'](at('section')), false);
  assert.equal(NEVER_TAKE_RULES['role:text'](at('paragraph')), true);
  assert.equal(NEVER_TAKE_RULES['role:text'](at('paragraph', { in_selection: true })), false, 'a press inside a selection drags it');
  assert.equal(NEVER_TAKE_RULES['role:canvas'](at('canvas')), true);
  assert.equal(NEVER_TAKE_RULES['role:any'](at('canvas')), true);
  assert.equal(NEVER_TAKE_RULES['role:any'](at('section')), false);
  assert.equal(NEVER_TAKE_RULES['role:any'](null), false, 'no probe: no prediction');
  // a link's or an image's text inside the deepest's ancestors: draggable by default, so not predicted
  const inLink = { ...at('static'), chain: [{ role: 'document web' }, { role: 'link' }, { role: 'static' }] };
  assert.equal(NEVER_TAKE_RULES['role:any'](inLink), true);
  assert.equal(NEVER_TAKE_RULES['role:any-chain'](inLink), false);
  assert.equal(NEVER_TAKE_RULES['role:any-chain']({ ...at('static'), chain: [{ role: 'paragraph' }, { role: 'static' }] }), true);
  assert.equal(NEVER_TAKE_RULES['xdnd-aware']({ ...at('section'), xdnd_aware: true }), false);
  assert.equal(NEVER_TAKE_RULES['xdnd-aware']({ ...at('section'), xdnd_aware: false }), true);
});

const row = (cell, extra = {}) => ({
  kind: 'drop-signal',
  load: 'idle',
  lane: 'cua',
  cell,
  ok: true,
  probe: { deepest: { role: 'section', states: [], interfaces: [], attributes: {} }, in_selection: false },
  xdnd_aware: true,
  hold: { path_ms: 30, held: false, taken: false, take_after_press_ms: null },
  outcome: { started: false, landed: false, effect: true },
  signals: { take_after_press_ms: null, late_take: false, activation_after_release_ms: null, accept_shown: false },
  ...extra,
});

test('the never-take table counts each rule\'s false negatives, and those whose take came after the path, by load', () => {
  const slider = { deepest: { role: 'slider', states: [], interfaces: [], attributes: {} }, in_selection: false };
  const rows = [
    row('range', { probe: slider }),
    row('range', { probe: slider }),
    // the draggable div under a slider: predicted never, took after the path's end
    row('slider', { probe: slider, outcome: { started: true, landed: true, effect: null }, hold: { path_ms: 30, held: true, taken: true, take_after_press_ms: 60 }, signals: { take_after_press_ms: 60 } }),
    row('slider', { probe: slider, outcome: { started: true, landed: true, effect: null }, hold: { path_ms: 30, held: false, taken: true, take_after_press_ms: 10 }, signals: { take_after_press_ms: 10 } }),
    row('plain', { outcome: { started: true, landed: true, effect: null } }),
  ];
  const t = neverTakeTable(rows);
  const range = t.counts.find((c) => c.rule === 'role:range' && c.load === 'idle');
  assert.deepEqual({ n: range.n, predicted: range.predicted, fn: range.false_negatives, fn_after_path: range.false_negatives_after_path, tn: range.true_negatives }, { n: 5, predicted: 4, fn: 2, fn_after_path: 1, tn: 2 });
  assert.ok(t.md.some((l) => l.includes('role:range')), 'one line per rule and load');
  // a rule with no false negative is still not a clean signal under 300 drags
  const clean = neverTakeTable([row('range', { probe: slider })]).counts.find((c) => c.rule === 'role:range');
  assert.equal(clean.false_negatives, 0);
  assert.equal(clean.enough, false, 'fewer than 300 drags at that load');
});

test('the after-release table: Chrome\'s activation against the drop, for drags that took by the release', () => {
  const took = (landed, act) => row('plain', { outcome: { started: true, landed, effect: null }, signals: { take_after_press_ms: 5, late_take: false, activation_after_release_ms: act, accept_shown: landed } });
  const rows = [took(true, 2), took(true, 4), took(false, null), took(false, 9), took(true, null), row('select'), row('plain', { outcome: { started: true, landed: false, effect: null }, signals: { take_after_press_ms: 400, late_take: true, activation_after_release_ms: null } })];
  const t = afterReleaseTable(rows);
  const c = t.counts.find((x) => x.signal === 'activation' && x.load === 'idle');
  assert.deepEqual({ n: c.n, drops: c.drops, leaves: c.leaves, tp: c.tp, fn: c.fn, fp: c.fp, tn: c.tn }, { n: 5, drops: 3, leaves: 2, tp: 2, fn: 1, fp: 1, tn: 1 }, 'late takes and drags that never took are not judged here');
  assert.deepEqual(c.latency_ms, { p50: 2, p95: 4, max: 4 }, "the drops' own activations");
  const a = t.counts.find((x) => x.signal === 'accept cursor at the release');
  assert.deepEqual({ tp: a.tp, fn: a.fn, fp: a.fp, tn: a.tn }, { tp: 3, fn: 0, fp: 0, tn: 2 });
  // a drop seen past the window counts as missed
  assert.equal(afterReleaseTable([took(true, 450)], { windowMs: 300 }).counts.find((x) => x.signal === 'activation').fn, 1);
});

test('the accept table: false releases are accept-released drops that did not land, against the ceiling\'s', () => {
  const lane = (accepted, landed, extra = {}) => row('plain', { lane: 'cua:accept', ms: accepted ? 60 : 360, accept: { accepted, accept_after_take_ms: accepted ? 20 : null }, outcome: { started: true, landed, effect: null }, ...extra });
  const rows = [lane(true, true), lane(true, true), lane(true, false), lane(false, true), lane(false, false), row('nozone', { lane: 'cua:accept', accept: { accepted: true, accept_after_take_ms: 5 }, outcome: { started: true, landed: false, effect: null } })];
  const t = acceptTable(rows);
  const c = t.counts.find((x) => x.cell === 'plain');
  assert.deepEqual({ n: c.n, accepted: c.accepted, false_releases: c.false_releases, ceiling: c.ceiling, ceiling_missed: c.ceiling_missed }, { n: 5, accepted: 3, false_releases: 1, ceiling: 2, ceiling_missed: 1 });
  assert.deepEqual(c.accept_after_take_ms, { p50: 20, p95: 20, max: 20 });
  assert.equal(t.counts.find((x) => x.cell === 'nozone').accepted, 1, 'the rule read an accept on a drag bound to leave');
  assert.ok(t.md.some((l) => /false releases/.test(l)));
});

test('the late-take table: takes after the release, whether the drag still answered ok, and whether it landed', () => {
  const rows = [
    row('press-400', { signals: { take_after_press_ms: 410, late_take: true, take_after_release_ms: 160 }, outcome: { started: true, landed: false, effect: null } }),
    row('press-400', { signals: { take_after_press_ms: 200, late_take: false }, outcome: { started: true, landed: true, effect: null } }),
    row('plain', { signals: { take_after_press_ms: 5, late_take: false }, outcome: { started: true, landed: true, effect: null } }),
  ];
  const t = lateTakeTable(rows);
  const c = t.counts.find((x) => x.cell === 'press-400');
  assert.deepEqual({ n: c.n, late: c.late, late_ok: c.late_ok, late_landed: c.late_landed }, { n: 2, late: 1, late_ok: 1, late_landed: 0 });
  assert.equal(t.counts.find((x) => x.cell === 'plain').late, 0);
});

test('the cover table: survival by kind and covered part, with the start role beside it', () => {
  const c = (kind, part, survived, role = 'section') => ({ kind: 'drop-signal', load: 'idle', lane: 'cua:cover', cell: kind, cover: part, ok: true, probe: { deepest: { role } }, outcome: kind === 'plain' ? { started: survived, landed: false, effect: null } : { started: false, landed: false, effect: survived } });
  const t = coverTable([c('select', 'start', false, 'paragraph'), c('select', 'start', true, 'paragraph'), c('select', 'none', true, 'paragraph'), c('plain', 'end', true)]);
  const s = t.counts.find((x) => x.cell === 'select' && x.cover === 'start');
  assert.deepEqual({ n: s.n, survived: s.survived, role: s.roles }, { n: 2, survived: 1, role: 'paragraph 2' });
  assert.equal(t.counts.find((x) => x.cell === 'plain').survived, 1, "a drop's survival is its take");
});

test("the block plan: blocks of ten, each cell's lanes interleaved and rotating, every drag counted once", () => {
  const plan = blockPlan([{ lane: 'a', cell: 'x', n: 25 }, { lane: 'b', cell: 'x', n: 10 }, { lane: 'a', cell: 'y', n: 10 }]);
  assert.deepEqual(plan.map((b) => `${b.lane}:${b.cell}:${b.n}`), ['a:x:10', 'b:x:10', 'a:y:10', 'a:x:10', 'a:x:5']);
  assert.equal(plan.reduce((s, b) => s + b.n, 0), 45);
  assert.deepEqual(plan.map((b) => b.start), [0, 0, 0, 10, 20], "each block's first run index in its cell");
  const even = blockPlan(['p', 'q', 'r'].map((lane) => ({ lane, cell: 'x', n: 20 })));
  assert.deepEqual(even.map((b) => b.lane), ['p', 'q', 'r', 'q', 'r', 'p'], 'the order rotates each round');
  assert.throws(() => blockPlan([{ lane: 'a', cell: 'x', n: 0 }]), /at least one/);
});

test("a covered range's drag ends where its own path ends, and a plain range's at the default ends", async () => {
  const { rangeValueAt } = await import('../../scripts/linux-engine-diff/drop-signals.mjs');
  assert.equal(rangeValueAt(68), 10);
  assert.equal(rangeValueAt(28), 0);
  assert.equal(rangeValueAt(268), 63);
  const before = parseDropStatus(STATUS);
  const after = parseDropStatus([...STATUS.slice(0, 2), 'range seq 12 inputs 9 value 63', ...STATUS.slice(3, 5), 'press seq 12 at 1']);
  assert.equal(dragOutcome('range', before, after, { i: 0 }).effect, false, 'not the short drag\'s end');
  assert.equal(dragOutcome('range', before, after, { i: 0, rangeEnd: 63 }).effect, true);
});

test("the plan's cells: every drop path 40 px into the zone, the covers placed on the part they name, every spec capped by --trials", async () => {
  const { CELLS, COVER_CELLS, LANES, PLANS, coverRect, planSpecs } = await import('../../scripts/linux-engine-diff/drop-signals.mjs');
  const { ZONE_CELLS } = await import('../../scripts/linux-engine-diff/drop-signals-judge.mjs');
  const zone = { x0: 560, x1: 960, y0: 100, y1: 520 };
  const inZone = ([x, y]) => x >= zone.x0 && x < zone.x1 && y >= zone.y0 && y < zone.y1;
  for (const cell of ZONE_CELLS.filter((c) => c !== 'plain-long')) {
    const path = CELLS[cell](0);
    assert.equal(path.length, 2, cell);
    assert.equal(Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]), 40, `${cell}: a short drop`);
    assert.ok(!inZone(path[0]) && inZone(path[1]), `${cell}: from outside the zone into it`);
  }
  assert.ok(!inZone(CELLS.nozone(0).at(-1)), 'the leave ends outside the zone');
  const path = COVER_CELLS.select(0);
  const hides = (r, [x, y]) => r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  assert.equal(coverRect('none', path), null);
  assert.ok(hides(coverRect('start', path), path[0]) && !hides(coverRect('start', path), path[1]));
  assert.ok(hides(coverRect('end', path), path[1]) && !hides(coverRect('end', path), path[0]));
  const mid = coverRect('middle', path);
  assert.ok(hides(mid, [170, 32]) && !hides(mid, path[0]) && !hides(mid, path[1]), 'the middle only');
  assert.ok(hides(coverRect('all', path), path[0]) && hides(coverRect('all', path), path[1]));
  const vertical = coverRect('middle', COVER_CELLS.scroller(0));
  assert.ok(hides(vertical, [313, 220]) && !hides(vertical, [313, 140]), 'across a vertical path');
  assert.throws(() => coverRect('half', path), /no cover part/);
  // the plans
  const main = planSpecs({ plan: 'main' });
  assert.equal(main.find((s) => s.lane === 'cua:accept' && s.cell === 'plain').n, 300, "the accept's 300 drops a load");
  assert.ok(main.reduce((n, s) => n + s.n, 0) >= 300, 'the never-take survey reads every drag');
  assert.ok(!main.some((s) => LANES[s.lane].gate), 'the gate cells only at the gate load');
  assert.ok(planSpecs({ plan: 'main', ballast: 'gate' }).some((s) => LANES[s.lane].gate));
  assert.ok(planSpecs({ plan: 'cover' }).every((s) => LANES[s.lane].cover && s.cell.includes('@')));
  assert.ok(planSpecs({ plan: 'main', trials: 3 }).every((s) => s.n <= 3));
  assert.deepEqual([...new Set(planSpecs({ plan: 'main', lanes: ['cua:floor0'] }).map((s) => s.lane))], ['cua:floor0']);
  for (const [lane] of Object.values(PLANS).flat()) assert.ok(LANES[lane], `${lane} is a lane`);
  assert.throws(() => planSpecs({ plan: 'nope' }), /no plan nope/);
});

test('the drop-signals experiment takes the gate ballast without a cold run; the dnd experiment still refuses it', async () => {
  const { parseArgs } = await import('../../scripts/linux-engine-diff/cli.mjs');
  const a = parseArgs(['--experiment', 'drop-signals', '--cua', '/c', '--out', '/o', '--plan', 'cover', '--ballast', 'gate']);
  assert.equal(a.plan, 'cover');
  assert.equal(a.ballast, 'gate');
  assert.throws(() => parseArgs(['--experiment', 'dnd', '--cua', '/c', '--vendor', '/v', '--out', '/o', '--ballast', 'gate']), /--dnd-cold/);
});

test("the freeze cell's browser: the run's profile and no child type, its title read as text, never another's", async () => {
  const { runBrowser } = await import('../../scripts/linux-engine-diff/drop-signals.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const proc = mkdtempSync(join(tmpdir(), 'cua171-proc-'));
  try {
    const put = (pid, text) => {
      mkdirSync(join(proc, String(pid)));
      writeFileSync(join(proc, String(pid), 'cmdline'), text);
    };
    put(10, '/opt/google/chrome/chrome --type=renderer --user-data-dir=/run/p ');
    put(11, '/opt/google/chrome/chrome --user-data-dir=/other/p --new-window ');
    put(12, '/opt/google/chrome/chrome --user-data-dir=/run/p --new-window file:///x ');
    mkdirSync(join(proc, 'self'));
    assert.equal(runBrowser('/run/p', { proc }), 12);
    assert.equal(runBrowser('/run/p/sub', { proc }), null, 'a prefix is not the profile');
    rmSync(join(proc, '12'), { recursive: true });
    put(13, ['/opt/google/chrome/chrome', '--user-data-dir=/run/p', ''].join('\0'));
    assert.equal(runBrowser('/run/p', { proc }), 13, 'separate arguments too');
  } finally {
    rmSync(proc, { recursive: true });
  }
});
