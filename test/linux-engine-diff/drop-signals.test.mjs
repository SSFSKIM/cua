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
// the engine's server-time probe: a 1×1 window at the origin (input.rs `server_time`)
const probeAt = (wall) => ({ kind: 'create', window: 0x00a00001, override_redirect: false, x: 0, y: 0, w: 1, h: 1, wall_ms: wall });

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
  // the release's own reset to the loop's cursor, up to a few ms before the engine's release stamp (the engine stamps
  // after sending; load2's selected-text drags): the records cannot order it against the release, so the drag's
  // reading is indeterminate, never a plain negative
  const reset = signalsOf([cursor(1003, 81), take(1004), cursor(1008, 82), cursor(1047, 81)], { target: TARGET, pressMs: 1000, releaseMs: 1050 });
  assert.deepEqual([reset.accept_shown, reset.accept_indeterminate], [false, true]);
  // a leave: the take, the first status, no accept, no activation
  const leave = signalsOf([cursor(1003, 81), take(1004), cursor(1007, 82), probeAt(1051), cursor(1051, 81)], { target: TARGET, pressMs: 1000, releaseMs: 1050 });
  assert.equal(leave.activation_after_release_ms, null);
  assert.deepEqual([leave.accept_shown, leave.accept_indeterminate], [false, false]);
  // an activation before the take is not the drop's (the harness's own activation comes before the press); one after
  // the take and a little before the engine's release stamp is (load2: the engine stamps its release after sending it,
  // and the drop's request came up to 2 ms before the stamp), its latency negative
  assert.equal(signalsOf([activate(1002), take(1004)], { target: TARGET, pressMs: 1000, releaseMs: 1050 }).activation_after_release_ms, null);
  assert.equal(signalsOf([take(1004), activate(1048)], { target: TARGET, pressMs: 1000, releaseMs: 1050 }).activation_after_release_ms, -2);
  assert.equal(signalsOf([activate(1060)], { target: TARGET, pressMs: 1000, releaseMs: 1050 }).activation_after_release_ms, null, 'no take: no drop to answer for');
  assert.equal(signalsOf([activate(1060, 0x0140000c, 2)], { target: TARGET, pressMs: 1000, releaseMs: 1050 }).activation_after_release_ms, null, 'a pager-sourced request is the harness');
  // a late take: the selection taken after the release
  const late = signalsOf([take(1300)], { target: TARGET, pressMs: 1000, releaseMs: 1250 });
  assert.equal(late.late_take, true);
  assert.equal(late.take_after_release_ms, 50);
  assert.equal(signalsOf([], { target: TARGET, pressMs: 1000, releaseMs: 1250 }).take_after_press_ms, null);
});

test('the accept read at the release follows the cursor the drag ends on: an accept a later change withdrew does not count', () => {
  const at = (lines) => signalsOf(lines, { target: TARGET, pressMs: 1000, releaseMs: 1050 });
  // none, accept, none: a path that entered an accepting zone and left it (the review of task 68)
  assert.equal(at([cursor(1003, 81), take(1004), cursor(1007, 82), cursor(1020, 83), cursor(1030, 82)]).accept_shown, false);
  assert.equal(at([cursor(1003, 81), take(1004), cursor(1007, 82), cursor(1020, 83), cursor(1030, 84)]).accept_shown, false, 'another cursor withdraws it too');
  assert.equal(at([cursor(1003, 81), take(1004), cursor(1007, 82), cursor(1020, 83), cursor(1030, 82), cursor(1035, 83)]).accept_shown, true, 'shown again, it counts again');
  assert.equal(at([cursor(1003, 81), take(1004), cursor(1007, 82), cursor(1020, 83), cursor(1030, 2, true)]).accept_shown, true, "another client's theme cursor does not withdraw it");
});

test("a change the records cannot order against the release makes the drag's reading indeterminate, never a negative", () => {
  const at = (lines, opts = {}) => signalsOf(lines, { target: TARGET, pressMs: 1000, releaseMs: 1050, ...opts });
  const stalled = (second) => [cursor(1003, 81), take(1004), cursor(1007, 82), cursor(second, 83)];
  // the review's case: the second change 6 ms and 3 ms before the stamp. Neither is read as a plain negative.
  for (const second of [1044, 1047]) {
    const s = at(stalled(second));
    assert.deepEqual([s.accept_shown, s.accept_indeterminate], [false, true], `${1050 - second} ms before the stamp`);
  }
  // well before the release: a plain accept
  assert.deepEqual([at(stalled(1030)).accept_shown, at(stalled(1030)).accept_indeterminate], [true, false]);
  // after the stamp on the server's clock but with no probe after it: the clock's offset is an estimate, not a bound,
  // so only the probe orders a change after the release (the re-review of task 68's fix wave)
  assert.deepEqual([at(stalled(1053)).accept_shown, at(stalled(1053)).accept_indeterminate], [false, true]);
  assert.deepEqual([at([...stalled(1053), probeAt(1052)]).accept_shown, at([...stalled(1053), probeAt(1052)]).accept_indeterminate], [false, true], 'read after the probe, but ordered before it');
  const afterProbe = at([cursor(1003, 81), take(1004), cursor(1007, 82), probeAt(1052), cursor(1053, 83)]);
  assert.deepEqual([afterProbe.accept_shown, afterProbe.accept_indeterminate], [false, false]);
  // the re-review's case: the deciding change mapped 0.03 ms after the stamp, before the probe
  const edge = { ...cursor(1050, 83), wall_ms: 1051 };
  const justAfter = at([cursor(1003, 81), take(1004), cursor(1007, 82), edge, probeAt(1051)], { serverOffsetMs: 900.03 });
  assert.deepEqual([justAfter.accept_shown, justAfter.accept_indeterminate], [false, true], 'inside the offset\'s uncertainty: indeterminate');
  // the watch read a change 10 ms late: its server time puts it before the release, so it is judged there
  const lagged = { ...cursor(1030, 83), wall_ms: 1060 };
  assert.equal(at([cursor(1003, 81), take(1004), cursor(1007, 82), lagged]).accept_shown, true, "ordered by the server's clock, not the read");
  // a run's offset given: the drag's own lines need not carry the least lag
  const late = (wall, serial) => ({ ...cursor(wall, serial), wall_ms: wall + 3 });
  const run = (second) => at([late(1003, 81), { ...take(1004), wall_ms: 1007 }, late(1007, 82), late(second, 83)], { serverOffsetMs: 900 });
  assert.deepEqual([run(1049).accept_shown, run(1049).accept_indeterminate], [false, true], "on the drag's own lines it would read after the stamp");
  assert.deepEqual([run(1039).accept_shown, run(1039).accept_indeterminate], [true, false], "on the drag's own lines it would read inside the margin");
  // the engine's server-time probe after the release orders what follows it: Chrome's return to its loop's cursor,
  // read after the probe, is after the release whatever its server time says
  const probe = (wall) => ({ kind: 'create', window: 0x00a00001, override_redirect: false, x: 0, y: 0, w: 1, h: 1, wall_ms: wall });
  const anchor = probe(999);
  const reset = { ...cursor(1048, 81), wall_ms: 1052 };
  const ordered = at([anchor, cursor(1003, 81), take(1004), cursor(1007, 82), probe(1051), reset]);
  assert.deepEqual([ordered.accept_shown, ordered.accept_indeterminate], [false, false]);
  const unordered = at([anchor, cursor(1003, 81), take(1004), cursor(1007, 82), reset, probe(1053)]);
  assert.deepEqual([unordered.accept_shown, unordered.accept_indeterminate], [false, true], 'before the probe: the records cannot order it');
  // an accept withdrawn by a change the records cannot order: indeterminate as well
  const withdrawn = at([cursor(1003, 81), take(1004), cursor(1007, 82), cursor(1020, 83), cursor(1046, 82)]);
  assert.deepEqual([withdrawn.accept_shown, withdrawn.accept_indeterminate], [true, true]);
});

test("the least offset of the watch's wall clock to the server's, over the lines that carry a server time", async () => {
  const { serverOffset } = await import('../../scripts/linux-engine-diff/drop-signals-judge.mjs');
  assert.equal(serverOffset([{ ...cursor(1003, 81), wall_ms: 1905 }, cursor(1010, 82), activate(1020)]), 900);
  assert.equal(serverOffset([activate(1020)]), null);
});

test("the engine's probe after the release: a 1×1 window at the origin, read at or after the release stamp", async () => {
  const { releaseProbeIndex } = await import('../../scripts/linux-engine-diff/drop-signals-judge.mjs');
  const create = (wall, extra = {}) => ({ kind: 'create', window: 0x00a00001, override_redirect: false, x: 0, y: 0, w: 1, h: 1, wall_ms: wall, ...extra });
  assert.equal(releaseProbeIndex([create(999), cursor(1003, 81), create(1051)], 1050), 2, "the route's anchor before the press is not it");
  assert.equal(releaseProbeIndex([create(1051, { x: -10000, y: -10000, w: 10, h: 10 })], 1050), -1, "Chrome's own windows are not it");
  assert.equal(releaseProbeIndex([create(1051, { override_redirect: true })], 1050), -1);
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
  // a link or an image on the hit-test chain above the deepest: draggable by default, so not predicted
  const inLink = { ...at('static'), chain: [{ role: 'document web' }, { role: 'link' }, { role: 'static' }] };
  assert.equal(NEVER_TAKE_RULES['role:any'](inLink), true);
  assert.equal(NEVER_TAKE_RULES['role:any-hit-chain'](inLink), false);
  assert.equal(NEVER_TAKE_RULES['role:any-hit-chain']({ ...at('static'), chain: [{ role: 'paragraph' }, { role: 'static' }] }), true);
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
  // the accept read at the release, its indeterminates kept apart: a leave's counts against the bar as a false positive
  const read = (landed, shown, indeterminate) => row('plain', { outcome: { started: true, landed, effect: null }, signals: { take_after_press_ms: 5, late_take: false, activation_after_release_ms: landed ? 2 : null, accept_shown: shown, accept_indeterminate: indeterminate } });
  const i = afterReleaseTable([read(true, true, false), read(true, false, true), read(true, false, false), read(false, false, true), read(false, true, false), read(false, false, false), read(false, false, false)]).counts.find((x) => x.signal === 'accept cursor at the release');
  assert.deepEqual(
    { tp: i.tp, fn: i.fn, fp: i.fp, tn: i.tn, drops: i.indeterminate_drops, leaves: i.indeterminate_leaves, worst: i.fp_counting_indeterminate, clean: i.clean_leaves },
    { tp: 1, fn: 1, fp: 1, tn: 2, drops: 1, leaves: 1, worst: 2, clean: 3 },
  );
  assert.equal(afterReleaseTable([read(true, true, false)]).counts.find((x) => x.signal === 'activation').indeterminate_leaves, 0, 'the activation has none');
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

test('the cover table: survival by kind, covered part and cover, with the start role beside it', () => {
  // rows as the runner writes them: the cell names its covered part, the lane its kind of cover
  const c = (kind, part, survived, role = 'section', lane = 'cua:cover') => ({ kind: 'drop-signal', load: 'idle', lane, cell: `${kind}@${part}`, base: kind, cover: part, ok: true, probe: { deepest: { role } }, outcome: kind === 'plain' ? { started: survived, landed: false, effect: null } : { started: false, landed: false, effect: survived } });
  const t = coverTable([c('select', 'start', false, 'paragraph'), c('select', 'start', true, 'paragraph'), c('select', 'none', true, 'paragraph'), c('plain', 'end', true), c('plain', 'end', false, 'panel', 'cua:cover-managed')]);
  const s = t.counts.find((x) => x.cell === 'select' && x.cover === 'start');
  assert.deepEqual({ n: s.n, survived: s.survived, role: s.roles, by: s.by }, { n: 2, survived: 1, role: 'paragraph 2', by: 'override-redirect' });
  const plain = t.counts.filter((x) => x.cell === 'plain' && x.cover === 'end');
  assert.deepEqual(plain.map((x) => [x.by, x.survived]), [['override-redirect', 1], ['managed', 0]], "a drop's survival is its take; each cover kind apart");
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
  const zone = { x0: 560, x1: 960, y0: 100, y1: 620 };
  const inZone = ([x, y]) => x >= zone.x0 && x < zone.x1 && y >= zone.y0 && y < zone.y1;
  for (const cell of ZONE_CELLS.filter((c) => c !== 'plain-long')) {
    const path = CELLS[cell](0);
    assert.equal(path.length, 2, cell);
    assert.equal(Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]), 40, `${cell}: a short drop`);
    assert.ok(!inZone(path[0]) && inZone(path[1]), `${cell}: from outside the zone into it`);
  }
  assert.ok(!inZone(CELLS.nozone(0).at(-1)), 'the leave ends outside the zone');
  assert.deepEqual(planSpecs({ plan: 'canvas-drag' }), [{ lane: 'cua', cell: 'canvas-drag', n: 30 }], "the canvas rule's taking control");
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
  assert.ok(planSpecs({ plan: 'cover-managed' }).every((s) => LANES[s.lane].managed && s.cell.includes('@')), 'the managed cover has its own lane');
  assert.ok(planSpecs({ plan: 'main', trials: 3 }).every((s) => s.n <= 3));
  assert.deepEqual([...new Set(planSpecs({ plan: 'main', lanes: ['cua:floor0'] }).map((s) => s.lane))], ['cua:floor0']);
  for (const [lane] of Object.values(PLANS).flat()) assert.ok(LANES[lane], `${lane} is a lane`);
  assert.throws(() => planSpecs({ plan: 'nope' }), /no plan nope/);
});

test("a handle lane's drag: the path as drag_handle steps on the screen, the end sent whatever came before, answered as the step that failed or the end (M4's T17 fix wave)", async () => {
  const { LANES, handleDrag, planSpecs } = await import('../../scripts/linux-engine-diff/drop-signals.mjs');
  const fake = (failing) => {
    const sent = [];
    return {
      sent,
      request: async (command, input) => {
        sent.push([command, input]);
        const ok = input.action !== failing;
        return { response: ok ? { ok: true, output: null } : { ok: false, error: `${input.action} refused` }, ms: 1, stats: { handle: { action: input.action } } };
      },
    };
  };
  const scene = { window: { x: 100, y: 50 } };
  const path = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }];
  const engine = fake(null);
  const done = await handleDrag(engine, scene, path);
  assert.deepEqual(engine.sent, [
    ['drag_handle', { action: 'start', x: 110, y: 70 }],
    ['drag_handle', { action: 'move_to', x: 130, y: 90 }],
    ['drag_handle', { action: 'move_to', x: 150, y: 110 }],
    ['drag_handle', { action: 'end' }],
  ]);
  assert.equal(done.response.ok, true);
  assert.deepEqual(done.stats, { handle: { action: 'end' } }, "the end's record");
  const refused = fake('move_to');
  const failed = await handleDrag(refused, scene, path);
  assert.deepEqual(refused.sent.map(([, input]) => input.action), ['start', 'move_to', 'end'], 'the end released it');
  assert.equal(failed.response.error, 'move_to refused');
  assert.deepEqual(failed.end, { ok: true, output: null });
  assert.ok(LANES['cua:handle'].handle);
  assert.deepEqual(planSpecs({ plan: 't17-handle' }).map((s) => [s.lane, s.cell, s.n]), [['cua:handle', 'plain', 300], ['cua:handle', 'left', 30], ['cua:handle', 'inzone-out', 30]]);
  assert.deepEqual(planSpecs({ plan: 't17-floor' }).map((s) => [s.lane, s.cell, s.n]), [['cua', 'plain', 300], ['cua', 'left', 30], ['cua', 'inzone-out', 30]]);
});

test("the second fix wave's cells: a desktop drag that leaves the window for the bare root, and a drop that only moves (M4's T17)", async () => {
  const { CELLS, LANES, OFF_WINDOW, T14_SOURCE, desktopDrag, offWindowEnds, planSpecs, windowPath } = await import('../../scripts/linux-engine-diff/drop-signals.mjs');
  const at = { page: { x: 4, y: 30 } };
  const window = { x: 100, y: 50, width: 1050, height: 780 };
  const root = windowPath(at, 'root', 0, window);
  assert.deepEqual(root[0], { x: 534, y: 158 }, 'from the plain source');
  assert.equal(root.at(-1).x, window.width + 30, '30 px right of the window, the screen having room there');
  const right = { ...window, x: 220 };
  assert.equal(windowPath(at, 'root', 0, right).at(-1).x, -30, 'else 30 px left of it');
  assert.throws(() => windowPath(at, 'root', 0, { ...window, x: 10, width: 1260 }), /no bare root beside the window/);
  assert.equal(T14_SOURCE.root, 'plain', 'a drop the zone never counts');
  assert.deepEqual(CELLS.move(0), [[725, 68], [725, 108]], 'from above the zone, into it');
  const sent = [];
  const engine = { request: async (command, input) => (sent.push([command, input]), { response: { ok: true } }) };
  await desktopDrag(engine, { window }, root);
  assert.deepEqual(sent, [['drag', { path: [{ x: 634, y: 208 }, { x: 744, y: 208 }, { x: 1180, y: 208 }] }]], 'no window named, screen coordinates');
  assert.ok(LANES['cua:desktop'].desktop);
  // the release over the xterm and over the other browser window, at their screen points
  const ends = offWindowEnds({ front: { id: 7, x: 1170, y: 715 }, other: { id: 9, x: 920, y: 250 } });
  assert.deepEqual(ends, { xterm: { x: 1170, y: 715, over: 7 }, other: { x: 1070, y: 400, over: 9 }, slow: null, moved: null });
  assert.deepEqual(windowPath(at, 'xterm', 0, window, ends).at(-1), { x: 1070, y: 665 }, 'window coordinates of the xterm');
  assert.deepEqual(windowPath(at, 'other', 0, window, ends).at(-1), { x: 970, y: 350 });
  assert.deepEqual(OFF_WINDOW.map((c) => T14_SOURCE[c]), ['plain', 'plain', 'plain', 'plain', 'plain'], 'drops the zone never counts');
  const plan = planSpecs({ plan: 't17-fix2' });
  for (const cell of ['root', 'xterm', 'other']) assert.deepEqual(plan.filter((s) => s.cell === cell).map((s) => s.lane), ['cua:desktop', 'cua:handle'], cell);
  assert.ok(plan.every((s) => s.n === (s.cell === 'plain' ? 100 : 30)));
  assert.deepEqual(planSpecs({ plan: 't17-root' }).map((s) => [s.lane, s.cell, s.n]), ['root', 'xterm', 'other'].map((c) => ['cua:desktop', c, 30]));
});

test("the third fix wave's cells: a release over a drop target that never answers, and one the pointer was moved from (M4's T17)", async () => {
  const { OFF_WINDOW, T14_SOURCE, moveHook, offWindowEnds, planSpecs, windowPath } = await import('../../scripts/linux-engine-diff/drop-signals.mjs');
  const { ROOT } = await import('../../scripts/linux-engine-diff/park.mjs');
  const at = { page: { x: 4, y: 30 } };
  const window = { x: 100, y: 50, width: 1050, height: 780 };
  // the sink's middle, from its client's origin and size; the hook's point, on the bare root
  const ends = offWindowEnds({ sink: { id: 11, x: 1100, y: 60, width: 160, height: 150 }, moved: { x: 1180, y: 208 } });
  assert.deepEqual(ends.slow, { x: 1180, y: 135, over: 11 });
  assert.deepEqual(ends.moved, { x: 1180, y: 208, over: ROOT });
  const slow = windowPath(at, 'slow', 0, window, ends);
  assert.deepEqual(slow.map((p) => [p.x, p.y]), [[534, 158], [644, 158], [1080, 85]], 'accepted in the zone, then to the sink');
  assert.deepEqual(windowPath(at, 'moved', 0, window, ends).at(-1), { x: 574, y: 158 }, 'the short drop: the path ends in the zone');
  assert.ok(OFF_WINDOW.includes('slow') && OFF_WINDOW.includes('moved'), 'neither is ever counted as dropped');
  assert.equal(T14_SOURCE.slow, 'plain');
  assert.deepEqual(moveHook({ DISPLAY: ':5' }, ends.moved), { DISPLAY: ':5', CUA_ENGINE_FAULT: 'drag-release-move', CUA_ENGINE_FAULT_AT: '1180,208' });
  const plan = planSpecs({ plan: 't17-fix3' });
  for (const cell of ['root', 'xterm', 'other', 'slow']) assert.deepEqual(plan.filter((s) => s.cell === cell).map((s) => [s.lane, s.n]), [['cua:desktop', 30], ['cua:handle', 30]], cell);
  for (const cell of ['left', 'inzone-out']) assert.deepEqual(plan.filter((s) => s.cell === cell).map((s) => [s.lane, s.n]), [['cua', 30], ['cua:handle', 30]], cell);
  assert.deepEqual(plan.filter((s) => s.cell === 'plain').map((s) => [s.lane, s.n]), [['cua', 100], ['cua:handle', 100]]);
  assert.equal(plan.length, 14, 'no move cell, no moved cell: the hook is a live build\'s');
  assert.deepEqual(planSpecs({ plan: 't17-slow' }).map((s) => [s.lane, s.cell, s.n]), [['cua:desktop', 'slow', 30], ['cua:handle', 'slow', 30]]);
  assert.deepEqual(planSpecs({ plan: 't17-moved' }).map((s) => [s.lane, s.cell, s.n]), [['cua:desktop', 'moved', 30]]);
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
