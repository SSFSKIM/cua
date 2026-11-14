// Chrome's drop-signals cells in the gate (the harness-fix wave, the whole-branch review's P1): the steps that run
// Chrome's `t14-late` (C1, L4c) and `t14` (L4b) are held to T14's contract. The qualifying late takes occurred, each with
// its notice on the next read, the refusal of the next acting request and its Escape; a normal drop leaves nothing
// pending and no Escape; a drop that did not land is never answered ok with nothing pending. Display-free: drop-signals
// rows as drop-signals.mjs `oneDrag` writes them.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHROME_JUDGED_PLANS, chromeDropVerdict, dropSignalsVerdict, judgedChromePlan } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { planSpecs } from '../../scripts/linux-engine-diff/drop-signals.mjs';
import { dropRow } from './drop-rows.mjs';

const chrome = (o) => dropRow({ family: 'chrome', ...o });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const specs = (...cells) => cells.map(([lane, cell, n]) => ({ lane, cell, n }));

/** A `t14-late` sitting's drags: `late` real late takes, reported, then confirmed drops and honest unconfirmed ones. */
const lateSitting = ({ late = 3, landed = 5, unconfirmed = 2, lateOf = {} } = {}) => [
  ...many(late, (i) => chrome({ cell: 'freeze-250', i, landed: false, late: true, pending: 'late', ...lateOf })),
  ...many(landed, (i) => chrome({ cell: 'freeze-250', i: late + i, landed: true })),
  ...many(unconfirmed, (i) => chrome({ cell: 'freeze-250', i: late + landed + i, landed: false, pending: 'unconfirmed' })),
];
const lateSpecs = (n) => specs(['cua', 'freeze-250', n]);

test("the gate's Chrome plans each get a judge: t14-late and t14, with t14-floor and the long controls; the surveys none", () => {
  for (const plan of ['t14', 't14-late', 't14-floor', 't14-long', 't14-long-gate']) assert.equal(judgedChromePlan({ families: ['chrome'], plan }), true, plan);
  assert.equal(judgedChromePlan({ plan: 't14-late' }), true, 'chrome is the experiment\'s default family');
  assert.equal(judgedChromePlan({ families: ['electron'], plan: 't14-late' }), false);
  assert.equal(judgedChromePlan({ families: ['chrome'], plan: 'main' }), false, "T13's survey measures, and judges nothing");
  assert.deepEqual(CHROME_JUDGED_PLANS.filter((p) => !planSpecs({ plan: p }).length), []);
  assert.equal(dropSignalsVerdict({ families: ['chrome'], plan: 'main' }, []), null);
  assert.equal(dropSignalsVerdict({ families: ['electron'], plan: 't17-fix3' }, []).judge, 'electronDropVerdict');
  assert.equal(dropSignalsVerdict({ families: ['chrome'], plan: 't14-late' }, []).judge, 'chromeDropVerdict');
});

test('a t14-late sitting whose late takes were each reported passes, its counts kept', () => {
  const v = chromeDropVerdict(lateSitting(), { specs: lateSpecs(10), plan: 't14-late' });
  assert.deepEqual(v.failed, []);
  assert.deepEqual([v.counts.late, v.counts.late_reported, v.counts.landed, v.counts.false_ok], [3, 3, 5, 0]);
});

test('a t14-late sitting with no late take proves nothing of #264, and fails', () => {
  const v = chromeDropVerdict(lateSitting({ late: 0, landed: 8 }), { specs: lateSpecs(10), plan: 't14-late' });
  assert.deepEqual(v.failed, ['no late take came: the sitting proves nothing of #264']);
});

test('a candidate that reports none of the real late takes fails: no notice, no refusal, no Escape', () => {
  const v = chromeDropVerdict(lateSitting({ lateOf: { pending: null } }), { specs: lateSpecs(10), plan: 't14-late' });
  assert.ok(v.failed.includes('cua freeze-250: a late take not reported (its notice on the read, the next acting request refused with it, its Escape) on 3 of 10 (#0, #1, #2)'), v.failed.join('\n'));
  assert.ok(v.failed.some((f) => /answered ok with no drop and nothing pending on 3 of 10/.test(f)), 'and the ok on a drop that did not land is a false ok');
});

test("a late take's notice is not enough: the next acting request refused with it, and its Escape, are T14's contract too", () => {
  const unrefused = chromeDropVerdict(lateSitting({ late: 1, lateOf: { next: { ok: true, error: null, late_dnd: null } } }), { specs: lateSpecs(8), plan: 't14-late' });
  assert.ok(unrefused.failed.some((f) => /a late take not reported .* on 1 of 8/.test(f)), unrefused.failed.join('\n'));
  assert.ok(unrefused.failed.some((f) => /the read carried a notice, and the next acting request was not refused with it, on 1 of 8/.test(f)));
  const row = chrome({ cell: 'freeze-250', landed: false, late: true, pending: 'late' });
  row.next.late_dnd.escaped = false;
  const unescaped = chromeDropVerdict([row], { specs: lateSpecs(1), plan: 't14-late' });
  assert.ok(unescaped.failed.some((f) => /a late take not reported .* on 1 of 1/.test(f)), unescaped.failed.join('\n'));
});

test('a late notice on a drag with no late take fails: a normal drop leaves no notice and no Escape', () => {
  const rows = [...lateSitting({ late: 1 }), chrome({ cell: 'freeze-250', i: 9, landed: true, pending: 'late' })];
  const v = chromeDropVerdict(rows, { specs: lateSpecs(9), plan: 't14-late' });
  assert.deepEqual(v.failed, ['cua freeze-250: a late drag and drop reported, and its Escape sent, on a drag with no late take, on 1 of 9 (#9)']);
});

test("a drop that landed and was reported unconfirmed is honest: T14's share is a finding, never a fail", () => {
  const rows = [chrome({ cell: 'plain-long', i: 0 }), chrome({ cell: 'plain-long', i: 1, pending: 'unconfirmed' })];
  const v = chromeDropVerdict(rows, { specs: specs(['cua', 'plain-long', 2]), plan: 't14-floor' });
  assert.deepEqual(v.failed, []);
  assert.equal(v.counts.unconfirmed_landed, 1);
  assert.match(v.findings.join('\n'), /T14's share, reported and not a fail: 1 of 2 landed drops answered unconfirmed, over 5%/);
});

test('on the shipped lane a drop that did not land is never ok with nothing pending, and a long drop that did not land fails whatever its answer', () => {
  const rows = [
    chrome({ cell: 'plain-long', i: 0, landed: false, pending: 'unconfirmed' }),
    chrome({ cell: 'left', i: 0 }),
    chrome({ cell: 'inzone-out', i: 0, pending: 'unconfirmed' }),
  ];
  const v = chromeDropVerdict(rows, { specs: specs(['cua', 'plain-long', 1], ['cua', 'left', 1], ['cua', 'inzone-out', 1]), plan: 't14-floor' });
  assert.deepEqual(v.failed, [
    'cua plain-long: the drop did not land on 1 of 1, in a cell that expects it (#0)',
    'cua left: answered ok with no drop and nothing pending on 1 of 1 (#0)',
  ]);
});

test("t14's measurement lane: a release at the accept that did not land is a false release, counted, its ok the stated limit of Chrome's confirmation; the floor's fallback is judged as shipped", () => {
  const rows = [
    ...many(3, (i) => chrome({ lane: 'cua:accept', cell: 'plain-long', i, accepted: true })),
    chrome({ lane: 'cua:accept', cell: 'inzone-out', i: 0, accepted: true }),
    chrome({ lane: 'cua:accept', cell: 'inzone-out', i: 1, accepted: false, pending: 'unconfirmed' }),
    chrome({ lane: 'cua:accept', cell: 'plain-long', i: 3, accepted: true, landed: false, pending: 'unconfirmed' }),
  ];
  const v = chromeDropVerdict(rows, { specs: specs(['cua:accept', 'plain-long', 4], ['cua:accept', 'inzone-out', 2]), plan: 't14' });
  assert.deepEqual(v.failed, []);
  assert.deepEqual([v.counts.false_releases, v.counts.false_release_ok], [2, 1]);
  assert.match(v.findings.join('\n'), /2 false releases at the accept \(measurement lane `cua:accept`, not shipped\), 1 of them answered ok/);
  const fallback = chromeDropVerdict([chrome({ lane: 'cua:accept', cell: 'left', accepted: false })], { specs: specs(['cua:accept', 'left', 1]), plan: 't14' });
  assert.deepEqual(fallback.failed, ['cua:accept left: answered ok with no drop and nothing pending on 1 of 1 (#0)']);
});

test("a Chrome control's drop counts only by the zone: a page record from an earlier trial is no drop, and a candidate that does nothing on the controls fails them", () => {
  // took (the watch saw XdndSelection), the page's last record a plain drop from before: ok with nothing pending is false
  const stale = chrome({ cell: 'left', i: 0, started: false, landed: false });
  stale.signals.take_after_press_ms = 12;
  const v = chromeDropVerdict([chrome({ cell: 'plain-long', i: 0 }), stale], { specs: specs(['cua', 'plain-long', 1], ['cua', 'left', 1]), plan: 't14-floor' });
  assert.deepEqual(v.failed, ['cua left: answered ok with no drop and nothing pending on 1 of 1 (#0)']);
  // nothing done on any control: they prove nothing, and the long drop did not land
  const idle = (cell) => chrome({ cell, started: false, landed: false });
  const none = chromeDropVerdict([idle('plain-long'), idle('left'), idle('inzone-out')], { specs: specs(['cua', 'plain-long', 1], ['cua', 'left', 1], ['cua', 'inzone-out', 1]), plan: 't14-floor' });
  assert.deepEqual(none.failed, [
    'cua plain-long: the drop did not land on 1 of 1, in a cell that expects it (#0)',
    'cua left: no drag and drop took on any of 1: the control proved nothing',
    'cua inzone-out: no drag and drop took on any of 1: the control proved nothing',
  ]);
});

test("a drag whose drag and drop never took answers as a plain drag: its ok claims no drop (the stopped browser's lost start), but a control none of whose drags took proves nothing", () => {
  // the L4c pilot's second drag: the page's dragstart came, the browser (stopped across the release) never took XdndSelection
  const lost = chrome({ cell: 'freeze-250', i: 1, landed: false });
  lost.signals.take_after_press_ms = null;
  lost.hold = { taken: false };
  const v = chromeDropVerdict([chrome({ cell: 'freeze-250', i: 0, landed: false, late: true, pending: 'late' }), lost], { specs: lateSpecs(2), plan: 't14-late' });
  assert.deepEqual(v.failed, []);
  assert.equal(v.counts.untaken, 1);
  // a control: one took and was reported, one never took: honest; none took: the control proved nothing
  const untaken = (i) => Object.assign(chrome({ cell: 'inzone-out', i, landed: false }), { signals: { take_after_press_ms: null, late_take: false }, hold: { taken: false } });
  const some = chromeDropVerdict([chrome({ cell: 'inzone-out', i: 0, landed: false, pending: 'unconfirmed' }), untaken(1)], { specs: specs(['cua', 'inzone-out', 2]), plan: 't14-floor' });
  assert.deepEqual(some.failed, []);
  const none = chromeDropVerdict([untaken(0), untaken(1)], { specs: specs(['cua', 'inzone-out', 2]), plan: 't14-floor' });
  assert.deepEqual(none.failed, ['cua inzone-out: no drag and drop took on any of 2: the control proved nothing']);
});

test('a sitting capped by --trials (a pilot) with no late take is unjudged on that count, a finding; the whole plan must make one', () => {
  const v = chromeDropVerdict(lateSitting({ late: 0, landed: 2, unconfirmed: 0 }), { specs: lateSpecs(2), plan: 't14-late', capped: true });
  assert.deepEqual(v.failed, []);
  assert.match(v.findings.join('\n'), /no late take came in a sitting capped by --trials: #264 unjudged here/);
});

test('a missing case fails the Chrome cells too, and the pending contract holds on every drag', () => {
  const unannounced = chrome({ cell: 'plain-long', i: 1, next: { ok: false, error: 'Pending from your last drag, an unconfirmed drop: x; this preflight request was not run, so read the window before sending it again', late_dnd: null } });
  const v = chromeDropVerdict([chrome({ cell: 'plain-long', i: 0 }), unannounced], { specs: specs(['cua', 'plain-long', 3]), plan: 't14-floor' });
  assert.ok(v.failed.includes("cua plain-long: 2 of the plan's 3 drags ran (a missing case)"));
  assert.ok(v.failed.includes('cua plain-long: the next acting request was refused for something pending, and the read carried no notice, on 1 of 2 (#1)'));
});
