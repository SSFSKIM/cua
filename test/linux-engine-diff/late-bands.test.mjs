// C1's and L4c's plan recast (the design session's ruling 931, task 121's sweeps): under 0.4.2 a Chrome drag lands
// inside the hold or Chrome refuses it, and the late-take window is about 3 ms wide, so the plan (`t14-late`) runs three
// freeze bands, every answer judged honest or not, each band's own outcome required a minimum number of times, and the
// late takes the edge band makes counted and judged in full, never required. Display-free: drop-signals rows as
// drop-signals.mjs `oneDrag` writes them.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HOLD_NOTICE, LATE_BANDS, chromeDropVerdict } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { planSpecs } from '../../scripts/linux-engine-diff/drop-signals.mjs';
import * as premise from '../../scripts/linux-engine-diff/premise.mjs';
import { dropRow } from './drop-rows.mjs';

const chrome = (o) => dropRow({ family: 'chrome', ...o });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const specs = (...cells) => cells.map(([lane, cell, n]) => ({ lane, cell, n }));
const untaken = { signals: { take_after_press_ms: null, late_take: false }, hold: { taken: false, adaptive: { way: 'noticed' } } };
/** The past band's honest answer: Chrome refused the drag, the reply carried the hold notice, nothing was pending. */
const refused = (cell, i) => Object.assign(chrome({ cell, i, landed: false }), { reply_notice: HOLD_NOTICE, ...untaken });
const banded = ({ inside = 10, past = 10, late = 2, edgeLanded = 8 } = {}) => [
  ...many(inside, (i) => Object.assign(chrome({ cell: 'freeze-600', i, landed: true }), { hold: { taken: true } })),
  ...many(10 - inside, (i) => chrome({ cell: 'freeze-600', i: inside + i, landed: false, pending: 'unconfirmed' })),
  ...many(late, (i) => Object.assign(chrome({ cell: 'freeze-650', i, landed: false, late: true, pending: 'late' }), { reply_notice: HOLD_NOTICE })),
  ...many(edgeLanded, (i) => chrome({ cell: 'freeze-650', i: late + i, landed: true })),
  ...many(10 - late - edgeLanded, (i) => refused('freeze-650', late + edgeLanded + i)),
  ...many(past, (i) => refused('freeze-700', i)),
  ...many(10 - past, (i) => chrome({ cell: 'freeze-700', i: past + i, landed: true })),
];
const bandSpecs = specs(['cua', 'freeze-600', 10], ['cua', 'freeze-650', 10], ['cua', 'freeze-700', 10]);
const BANDS = [
  { band: 'inside', cells: ['freeze-600'], expects: 'landed', min: 7 },
  { band: 'edge', cells: ['freeze-650'], expects: null, min: 0 },
  { band: 'past', cells: ['freeze-700'], expects: 'refused', min: 7 },
];
const judge = (rows) => chromeDropVerdict(rows, { specs: bandSpecs, plan: 't14-late', bands: BANDS });
const swap = (rows, cell, i, row) => rows.map((r) => (r.cell === cell && r.i === i ? row : r));

test("t14-late's plan is its three bands, each expecting band a minimum under its drags; the hold notice is the engine's word for word", () => {
  assert.equal(HOLD_NOTICE, premise.HOLD_NOTICE);
  assert.deepEqual(LATE_BANDS.map((b) => b.band), ['inside', 'edge', 'past']);
  const planned = planSpecs({ plan: 't14-late' });
  assert.deepEqual(planned.map((s) => s.cell), LATE_BANDS.flatMap((b) => b.cells), 'every planned cell in one band, in order');
  for (const b of LATE_BANDS.filter((x) => x.expects)) {
    const n = planned.filter((s) => b.cells.includes(s.cell)).reduce((k, s) => k + s.n, 0);
    assert.ok(b.min > 0 && b.min < n, `${b.band}: a minimum of ${b.min} below its ${n} drags`);
  }
  assert.deepEqual(planSpecs({ plan: 't14-late-edge' }), [{ lane: 'cua', cell: 'freeze-650', n: 40 }], 'the knife-edge ride-along');
});

test('a banded sitting passes on honest answers in every band, its late takes counted, not required', () => {
  const v = judge(banded());
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.counts.bands, { inside: { drags: 10, expected: 10, late: 0 }, edge: { drags: 10, expected: null, late: 2 }, past: { drags: 10, expected: 10, late: 0 } });
  const none = judge(banded({ late: 0, edgeLanded: 9 }));
  assert.deepEqual(none.failed, [], 'no late take came: counted, never a failure');
  assert.match(none.findings.join('\n'), /the edge band made no late take \(not required, ruling 931\)/);
});

test('a band below its minimum is unexercised and fails, and one that never shows its outcome fails the same way', () => {
  assert.deepEqual(judge(banded({ inside: 6 })).failed, ['the inside band (freeze-600): 6 of 10 drags landed after a take inside the hold, fewer than its 7: the band is unexercised']);
  assert.deepEqual(judge(banded({ past: 0 })).failed, ['the past band (freeze-700): 0 of 10 drags answered the hold notice with no drop and nothing sent after it, fewer than its 7: the band is unexercised']);
  // a refusal with something sent after it (the harness's Escape of a drag left open) is no past-band outcome
  const sent = banded().map((r) => (r.cell === 'freeze-700' && r.i < 4 ? { ...r, escaped: true } : r));
  assert.match(judge(sent).failed.join('\n'), /the past band \(freeze-700\): 6 of 10 drags answered the hold notice/);
  // and a band with no drag at all (a plan that left it out)
  const missing = judge(banded().filter((r) => r.cell !== 'freeze-600'));
  assert.ok(missing.failed.includes('the inside band (freeze-600): 0 of 0 drags landed after a take inside the hold, fewer than its 7: the band is unexercised'), missing.failed.join('\n'));
});

test('every banded answer is judged: a plain ok on a drag its page started that Chrome refused is a false ok; a notice on a drop that landed a false alarm, counted', () => {
  const plainOk = Object.assign(chrome({ cell: 'freeze-700', i: 9, landed: false }), { signals: { take_after_press_ms: null, late_take: false }, hold: { taken: false } });
  const v = judge(swap(banded({ past: 10 }), 'freeze-700', 9, plainOk));
  assert.deepEqual(v.failed, ['cua freeze-700: answered ok with no notice and nothing pending on a drag its page started that did not land, on 1 of 10 (#9)']);
  assert.equal(v.counts.false_ok, 1);
  const alarm = Object.assign(chrome({ cell: 'freeze-650', i: 9, landed: true }), { reply_notice: HOLD_NOTICE });
  const a = judge(swap(banded({ late: 2, edgeLanded: 7 }), 'freeze-650', 9, alarm));
  assert.deepEqual(a.failed, []);
  assert.equal(a.counts.false_alarms, 1);
  assert.match(a.findings.join('\n'), /1 hold notice on a drop that landed \(a false alarm, counted, ruling 898\.2\)/);
  // a late take the edge band made, unreported: judged in full, as every late take is
  const unreported = banded({ late: 1 }).map((r) => (r.cell === 'freeze-650' && r.i === 0 ? { ...r, notice: null, next: { ok: true, error: null, late_dnd: null } } : r));
  assert.ok(judge(unreported).failed.some((f) => /cua freeze-650: a late take not reported/.test(f)));
});

test('the review of H6, blocker 2: a late take that landed before its cancel is no inside-band landing', () => {
  const lateLanded = (i) => Object.assign(chrome({ cell: 'freeze-600', i, landed: true, late: true, pending: 'late' }), { hold: { taken: false } });
  const v = judge(banded().map((r) => (r.cell === 'freeze-600' && r.i < 4 ? lateLanded(r.i) : r)));
  assert.deepEqual(v.failed, ['the inside band (freeze-600): 6 of 10 drags landed after a take inside the hold, fewer than its 7: the band is unexercised']);
  // and a landing the engine saw no take for, late or not, proves no in-hold take either
  const untakenLanded = banded().map((r) => (r.cell === 'freeze-600' && r.i < 4 ? { ...r, hold: { taken: false } } : r));
  assert.match(judge(untakenLanded).failed.join('\n'), /the inside band \(freeze-600\): 6 of 10/);
});

test('the review of H6, blocker 3: a past-band answer needs the page read before and after, its drop counter unchanged', () => {
  // the page's status missing after the drag: no evidence of no drop
  const unread = banded().map((r) => (r.cell === 'freeze-700' && r.i < 4 ? { ...r, after: { ...r.after, dnd: {} } } : r));
  assert.match(judge(unread).failed.join('\n'), /the past band \(freeze-700\): 6 of 10 drags answered the hold notice/);
  const unreadBefore = banded().map((r) => (r.cell === 'freeze-700' && r.i < 4 ? { ...r, before: null } : r));
  assert.match(judge(unreadBefore).failed.join('\n'), /the past band \(freeze-700\): 6 of 10 drags answered the hold notice/);
  // read on both sides and unchanged: that is the band's outcome
  const unchanged = banded().map((r) => (r.cell === 'freeze-700' ? { ...r, after: { ...r.after, dnd: { 'press-150': { ...r.before.dnd['press-150'], starts: r.before.dnd['press-150'].starts + 1 } } } } : r));
  assert.deepEqual(judge(unchanged).failed, []);
  assert.equal(judge(unchanged).counts.bands.past.expected, 10);
});

test('the review of H6, blocker 4: on a banded plan only a pending cause that accounts for the outcome excuses it', () => {
  // an untaken drag its page started, not landed, answered ok, then an unrelated pending notice and its refusal
  const other = 'Pending from your last drag, something else entirely. Read the window before sending input again: your next input request will not be run';
  const otherRefusal = 'Pending from your last drag, something else entirely; this preflight request was not run, so read the window before sending it again';
  const excused = (cell, i) => Object.assign(chrome({ cell, i, landed: false }), { signals: { take_after_press_ms: null, late_take: false }, hold: { taken: false }, notice: other, next: { ok: false, error: otherRefusal, late_dnd: null } });
  const v = judge([...banded().filter((r) => !(r.cell === 'freeze-650' && r.i === 9)), excused('freeze-650', 9)]);
  assert.ok(v.failed.includes('cua freeze-650: answered ok with no notice and nothing pending on a drag its page started that did not land, on 1 of 10 (#9)'), v.failed.join('\n'));
  assert.equal(v.counts.false_ok, 1);
  // a taken drag that did not land, excused by an unrelated pair: a false ok there too
  const takenOther = Object.assign(excused('freeze-650', 9), { signals: { take_after_press_ms: 20, late_take: false }, hold: { taken: true } });
  const t = judge([...banded().filter((r) => !(r.cell === 'freeze-650' && r.i === 9)), takenOther]);
  assert.ok(t.failed.some((f) => /cua freeze-650: answered ok with no drop and nothing pending on 1 of 10/.test(f)), t.failed.join('\n'));
  // the causes that do account for it still excuse: an unconfirmed drop for a taken one, a failed watch for either
  const unconfirmed = Object.assign(chrome({ cell: 'freeze-650', i: 9, landed: false, pending: 'unconfirmed' }), { hold: { taken: true } });
  assert.deepEqual(judge([...banded().filter((r) => !(r.cell === 'freeze-650' && r.i === 9)), unconfirmed]).failed, []);
  const failedWatch = Object.assign(chrome({ cell: 'freeze-650', i: 9, landed: false, pending: 'failed' }), { signals: { take_after_press_ms: null, late_take: false }, hold: { taken: false } });
  assert.deepEqual(judge([...banded().filter((r) => !(r.cell === 'freeze-650' && r.i === 9)), failedWatch]).failed, []);
  // the legacy judge (an unbanded plan) keeps accepting any kept pair
  const legacy = chromeDropVerdict([excused('freeze-650', 0), Object.assign(chrome({ cell: 'freeze-650', i: 1, landed: false, late: true, pending: 'late' }), { hold: { taken: false } })], { specs: specs(['cua', 'freeze-650', 2]), plan: 't14-late-edge' });
  assert.deepEqual(legacy.failed, []);
});

test("the per-cell table's false ok column counts the banded plan's refused plain oks, as the total does", () => {
  const plainOk = Object.assign(chrome({ cell: 'freeze-700', i: 9, landed: false }), { signals: { take_after_press_ms: null, late_take: false }, hold: { taken: false } });
  const v = judge(swap(banded(), 'freeze-700', 9, plainOk));
  const row = v.md.find((l) => l.startsWith('| cua | freeze-700 |'));
  assert.equal(row.split('|').map((c) => c.trim())[10], '1', row);
});

test("a plan without bands keeps T14's rules: an untaken plain ok there claims no drop", () => {
  const lost = Object.assign(chrome({ cell: 'freeze-250', i: 0, landed: false }), { signals: { take_after_press_ms: null, late_take: false }, hold: { taken: false } });
  const v = chromeDropVerdict([chrome({ cell: 'freeze-250', i: 1, landed: false, late: true, pending: 'late' }), lost], { specs: specs(['cua', 'freeze-250', 2]), plan: 't14-late-edge' });
  assert.deepEqual(v.failed, []);
});

test("by default t14-late is judged by its own bands", () => {
  const cells = LATE_BANDS.flatMap((b) => b.cells);
  const rows = planSpecs({ plan: 't14-late' }).flatMap((s) => many(s.n, (i) => chrome({ cell: s.cell, i, landed: true })));
  const v = chromeDropVerdict(rows, { specs: planSpecs({ plan: 't14-late' }), plan: 't14-late' });
  // every drag landed: the past band's refusals never came, so it is unexercised
  assert.ok(v.failed.some((f) => f.startsWith(`the past band (${LATE_BANDS.at(-1).cells.join(', ')})`)), v.failed.join('\n'));
  assert.ok(cells.length >= 3);
});
