// The settle's rest in item 1's judge (#487, task 142, ruling 1102): from linux-engine 0.4.4 every Electron settle
// records the rest it took between its two pings (`drop_cursor.settle.rest_ms`, a drag's or a handle's), which is its
// press source's family's, Electron's 30 ms. On a run whose engine (its meta row's `cua_version`) is 0.4.4 or later,
// t17-fix3's judge holds every drop to the engine's own count of the settles its requests entered (`drop_settles.entered`,
// carried per drop as `settle_count`): one entered needs a settle record resting 30 ms; none entered, no settle at all.
// A drop without that count, with a family label other than Electron's, or with copies of its settle that disagree,
// fails. A run whose version cannot be read fails the check, never skips it; rows from an earlier engine, which predate
// the field, are untouched.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { settleCount, settlesBefore } from '../../scripts/linux-engine-diff/drop-signals.mjs';
import { SETTLE_REST, dropSignalsVerdict, electronDropVerdict, engineVersionOf, settleOf, settlesEntered, watchFailedToStart } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { dropRow } from './drop-rows.mjs';

const V043 = 'cua-engine 0.4.3 (ba5b043834ce)';
const V044 = 'cua-engine 0.4.4 (23f34217aaaa)';

/** A settle record as the engine writes it; `rest` its `rest_ms`, left out when undefined. */
const settle = (rest) => ({ after_motion: { answered: true, ms: 1.5 }, before_rest: { answered: true, ms: 0.7 }, second_rest: 'needless', settle_failed_activation_confirmed: false, settled: true, ...(rest === undefined ? {} : { rest_ms: rest }) });

/** A cursor watch's release read, as `drop_cursor.rs` `AtRelease::record` writes it, with `error` its own. */
const releaseRead = (extra = {}) => ({ steps: [['c', 1, 2]], accepted: true, shown: null, initial: '0', history: [], take_time: 1, read_ms: 0.9, error: null, start: [640, 400], motions: 0, last_motions: [], ...extra });

/**
 * An Electron drop, landed and ok, whose request entered `entered` settles by the engine's count: its settle on the
 * drag's drop cursor, or for a handle (`lane` cua:handle) on the handle's, copied to the top as drop-signals.mjs
 * `oneDrag` does (the same record twice). `taken` is its hold's record; `cursor` replaces the watch's record (null: none).
 */
const settled = (i, rest, { lane = 'cua', entered = 1, taken = true, cursor = releaseRead({ settle: settle(rest) }) } = {}) => {
  const r = { ...dropRow({ family: 'electron', lane, i }), settle_count: entered === null ? null : { before: 3, after: 3 + entered, entered } };
  const watch = cursor === null ? {} : { drop_cursor: cursor };
  if (lane === 'cua:handle') return { ...r, ...watch, handle: { pressed: true, hold: { taken }, held: { taken }, ...watch } };
  return { ...r, ...watch, hold: { taken } };
};
/** The same row with its settle record deleted, the whole object, from the drag's and the handle's watch alike. */
const unsettled = (r) => {
  const strip = (c) => (c ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'settle')) : c);
  return { ...r, drop_cursor: strip(r.drop_cursor), ...(r.handle ? { handle: { ...r.handle, drop_cursor: strip(r.handle.drop_cursor) } } : {}) };
};

const fix3 = (rows, cuaVersion, plan = 't17-fix3') => {
  const cells = new Map();
  for (const r of rows) cells.set(`${r.lane}|${r.cell}`, { lane: r.lane, cell: r.cell, n: (cells.get(`${r.lane}|${r.cell}`)?.n ?? 0) + 1 });
  return electronDropVerdict(rows, { specs: [...cells.values()], plan, cuaVersion });
};
const UNRECORDED = (n, of, rows) => `the engine entered a settle and the drop carries no settle record (drop_cursor.settle, an object) on ${n} of ${of} settled drags (${rows}) (#487, engine 0.4.4)`;

test("the engine's version is read from the meta row's `cua-engine X.Y.Z (sha)`, else null", () => {
  assert.deepEqual(engineVersionOf(V043), [0, 4, 3]);
  assert.deepEqual(engineVersionOf(V044), [0, 4, 4]);
  assert.deepEqual(engineVersionOf('cua-engine 0.4.10 (0123456789ab)'), [0, 4, 10]);
  assert.deepEqual(engineVersionOf('cua-engine 1.0.0 (unknown)'), [1, 0, 0], "build.rs's stamp with no git");
  // the whole recorded string, as the engine prints it (main.rs `version`): malformed metadata never opts a run out
  for (const bad of [undefined, null, '', 42, 'cua-engine', 'cua-engine 0.4', 'cua-engine 1.0.0', 'cua-engine 0.4.3 (', 'cua-engine 0.4.3 (ba5b043834ce', 'cua-engine 0.4.3 ()', 'cua-engine 0.4.3 (ba5b043834ce) extra', 'cua-engine 0.4.3 (not-a-sha)', 'cua 0.4.4 (x)', 'sky 0.4.4', 'cua-engine 0.4.4x (y)', ' cua-engine 0.4.4 (d8e03a5cb7d4)', 'cua-engine 0.4.4 (d8e03a5cb7d4)\n']) assert.equal(engineVersionOf(bad), null, JSON.stringify(bad));
});

test("a row's settle record is its one settle, the same in every copy, and a record", () => {
  assert.deepEqual(settleOf(settled(0, 30)), settle(30));
  assert.deepEqual(settleOf(settled(0, 30, { lane: 'cua:handle' })), settle(30), "a handle's two copies, the same record");
  assert.deepEqual(settleOf({ handle: { drop_cursor: { settle: settle(30) } } }), settle(30));
  assert.equal(settleOf(dropRow({ family: 'electron' })), null);
  assert.equal(settleOf({ drop_cursor: { accepted: false } }), null);
  for (const notRecord of [false, true, 0, 'settled', [], null]) assert.equal(settleOf({ drop_cursor: { settle: notRecord } }), null, JSON.stringify(notRecord));
  assert.equal(settleOf({ drop_cursor: { settle: settle(30) }, handle: { drop_cursor: { settle: false } } }), null, 'copies that disagree are no settle');
});

test("the drop's settle count is the engine's counter after its requests less before, and the judge reads only that", () => {
  assert.deepEqual(settleCount({ entered: 4, unsettled: 0 }, { entered: 5, unsettled: 0 }), { before: 4, after: 5, entered: 1 });
  assert.deepEqual(settleCount({ entered: 0 }, { entered: 0 }), { before: 0, after: 0, entered: 0 });
  for (const [b, a] of [[null, { entered: 1 }], [{ entered: 1 }, null], [{ entered: 2 }, { entered: 1 }], [{}, { entered: 1 }], [{ entered: 1.5 }, { entered: 2 }]]) assert.equal(settleCount(b, a), null, JSON.stringify([b, a]));
  // a fresh engine has entered none; one that printed lines without the counter has none to give
  assert.deepEqual(settlesBefore({ dropSettles: null, lines: 0 }), { entered: 0 });
  assert.equal(settlesBefore({ dropSettles: null, lines: 3 }), null);
  assert.deepEqual(settlesBefore({ dropSettles: { entered: 7 }, lines: 9 }), { entered: 7 });
  assert.equal(settlesEntered({ settle_count: { entered: 1 } }), 1);
  for (const c of [undefined, null, {}, { entered: -1 }, { entered: '1' }, { entered: 1.5 }]) assert.equal(settlesEntered({ settle_count: c }), null, JSON.stringify(c));
});

test('a watch that failed to start is told apart from a release read that carried an error', () => {
  assert.equal(watchFailedToStart({ accepted: null, error: 'connection refused' }), true);
  assert.equal(watchFailedToStart({ accepted: null, error: 'connection refused', settle: settle(30) }), true);
  assert.equal(watchFailedToStart(releaseRead({ error: 'the read timed out', accepted: null })), false);
  assert.equal(watchFailedToStart({ read: false }), false);
  assert.equal(watchFailedToStart(releaseRead()), false);
});

test('on 0.4.4 every settle the engine counted, resting 30 ms, passes, drags and handles alike; a drop with none counted and no settle passes', () => {
  const none = { ...dropRow({ family: 'electron', cell: 'left', landed: false, pending: 'unconfirmed', i: 0 }), settle_count: { before: 3, after: 3, entered: 0 } };
  const rows = [settled(0, 30), settled(1, 30), settled(0, 30, { lane: 'cua:handle' }), none];
  const v = fix3(rows, V044);
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.counts.settle_rest, { applies: true, version: '0.4.4', drops: 4, settled: 3, rest_30: 3, wrong: 0, missing: 0, unrecorded: 0, uncounted: 0, contradicted: 0, disagreeing: 0, mislabelled: 0 });
  assert.match(v.md.join('\n'), /The settle's rest \(#487, engine 0.4.4\): 3 of 3 settled drags rested 30 ms; 0 another rest, 0 without rest_ms, 0 without the settle record; 0 drops without the engine's settle count, 0 contradicting it, 0 with copies that disagree, 0 not labelled Electron's/);
});

test('on 0.4.4 a settled row resting other than 30 ms fails, named with its rest', () => {
  const rows = [settled(0, 30), settled(1, 0), settled(2, 30), settled(0, 16, { lane: 'cua:handle' })];
  const v = fix3(rows, V044);
  assert.deepEqual(v.failed, ["the settle's rest (drop_cursor.settle.rest_ms) is not Electron's 30 ms on 2 of 4 settled drags (cua plain #1 rested 0 ms, cua:handle plain #0 rested 16 ms) (#487, engine 0.4.4)"]);
  assert.equal(v.counts.settle_rest.wrong, 2);
});

test('on 0.4.4 a settled row lacking the field, or holding no whole number of ms, fails, named', () => {
  const rows = [settled(0, 30), settled(1), settled(2, '30'), settled(3, 30.5), settled(4, null), settled(0, undefined, { lane: 'cua:handle' })];
  const v = fix3(rows, V044);
  assert.deepEqual(v.failed, ["a settled drag lacks the settle's rest (drop_cursor.settle.rest_ms, an integer in ms) on 5 of 6 settled drags (cua plain #1, cua plain #2, cua plain #3, cua plain #4, cua:handle plain #0) (#487: engine 0.4.4 records it on every settle)"]);
  assert.equal(v.counts.settle_rest.missing, 5);
});

test('the engine counted a settle and its record is gone, the whole object deleted: a drag and a handle fail', () => {
  const v = fix3([settled(0, 30), unsettled(settled(1, 0)), unsettled(settled(0, 0, { lane: 'cua:handle' }))], V044);
  assert.deepEqual(v.failed, [UNRECORDED(2, 3, 'cua plain #1, cua:handle plain #0')]);
  assert.equal(v.counts.settle_rest.unrecorded, 2);
});

test("probe: a handle whose take only its cursor watch saw (the hold saw none), its counted settle deleted, fails", () => {
  // handle.rs `settles`: the hold's take or the watch's `take_seen`; `handle.hold.taken` records only the hold's
  const cursorOnly = unsettled(settled(0, 30, { lane: 'cua:handle', taken: false }));
  assert.equal(cursorOnly.handle.hold.taken, false);
  const v = fix3([cursorOnly], V044);
  assert.deepEqual(v.failed, [UNRECORDED(1, 1, 'cua:handle plain #0')]);
});

test('probe: a drag whose release read carried an error, its counted settle deleted, fails: the error is a watch that ran', () => {
  const readError = unsettled(settled(0, 30, { cursor: releaseRead({ accepted: null, error: 'the read timed out', settle: settle(30) }) }));
  assert.equal(watchFailedToStart(readError.drop_cursor), false);
  assert.deepEqual(fix3([readError], V044).failed, [UNRECORDED(1, 1, 'cua plain #0')]);
  // and a handle's alike
  const handleReadError = unsettled(settled(0, 30, { lane: 'cua:handle', cursor: releaseRead({ error: 'the read timed out', settle: settle(30) }) }));
  assert.deepEqual(fix3([handleReadError], V044).failed, [UNRECORDED(1, 1, 'cua:handle plain #0')]);
});

test('a watch that failed to start settles nothing: none counted and no settle passes; a settle counted beside it without a record still fails', () => {
  const failedWatch = settled(0, undefined, { entered: 0, cursor: { accepted: null, error: 'connection refused' } });
  assert.deepEqual(fix3([failedWatch], V044).failed, []);
  const counted = settled(0, undefined, { entered: 1, cursor: { accepted: null, error: 'connection refused' } });
  assert.deepEqual(fix3([counted], V044).failed, [UNRECORDED(1, 1, 'cua plain #0')]);
});

test("an untaken drop the engine counted no settle for, with none, passes; the hold's record is never what decides", () => {
  const untaken = unsettled(settled(0, 30, { taken: false, entered: 0 }));
  const untakenHandle = unsettled(settled(0, 30, { lane: 'cua:handle', taken: false, entered: 0 }));
  assert.deepEqual(fix3([untaken, untakenHandle], V044).failed, []);
  const takenButUncounted = unsettled(settled(1, 30, { taken: true, entered: 0 }));
  assert.deepEqual(fix3([takenButUncounted], V044).failed, [], 'the count, not the hold, says no settle ran');
});

test("a drop without the engine's settle count fails on 0.4.4: whether it settled is unknown", () => {
  const v = fix3([settled(0, 30, { entered: null }), unsettled(settled(1, 30, { entered: null }))], V044);
  assert.deepEqual(v.failed, ["a drop carries no settle count of its request (settle_count.entered, the engine's drop_settles.entered after it less before) on 2 of 2 drops (cua plain #0, cua plain #1): whether it settled is unknown (#487, engine 0.4.4)"]);
  assert.equal(v.counts.settle_rest.uncounted, 2);
});

test('a settle field with none counted, or more than one settle counted for one drop, contradicts the count and fails', () => {
  const rows = [settled(0, 30, { entered: 0 }), settled(1, 30, { entered: 0, cursor: releaseRead({ settle: false }) }), settled(2, 30, { entered: 2 })];
  const v = fix3(rows, V044);
  assert.deepEqual(v.failed, ["a drop's settle contradicts the engine's count (a settle field with none entered, or more than one entered) on 3 of 3 drops (cua plain #0 entered 0, cua plain #1 entered 0, cua plain #2 entered 2) (#487, engine 0.4.4)"]);
  // a settle that is no record, where one was counted, is no record
  assert.deepEqual(fix3([settled(0, 30, { cursor: releaseRead({ settle: false }) })], V044).failed, [UNRECORDED(1, 1, 'cua plain #0')]);
});

test("probe: a taken plain drop relabelled chrome, its settle missing, still fails: a missing or other family label fails the row", () => {
  const relabelled = { ...unsettled(settled(0, 30)), family: 'chrome' };
  const v = fix3([relabelled], V044);
  assert.ok(v.failed.includes(UNRECORDED(1, 1, 'cua plain #0')), v.failed.join('\n'));
  assert.ok(v.failed.includes(`a drop of the Electron plan is not labelled the Electron scene's (family "chrome") on 1 of 1 drops (cua plain #0): its settle is checked as any (#487, engine 0.4.4)`), v.failed.join('\n'));
  const unlabelled = { ...settled(0, 30) };
  delete unlabelled.family;
  assert.deepEqual(fix3([unlabelled], V044).failed, [`a drop of the Electron plan is not labelled the Electron scene's (family null) on 1 of 1 drops (cua plain #0): its settle is checked as any (#487, engine 0.4.4)`]);
});

test("probe: two copies of a settle must agree: rest 30 at the top with `settle: false` in the handle's copy fails", () => {
  const r = settled(0, 30, { lane: 'cua:handle' });
  const masked = { ...r, handle: { ...r.handle, drop_cursor: { ...r.handle.drop_cursor, settle: false } } };
  const v = fix3([masked], V044);
  assert.deepEqual(v.failed, ["a drop's copies of its settle disagree (drop_cursor.settle and handle.drop_cursor.settle) on 1 of 1 drops (cua:handle plain #0) (#487, engine 0.4.4)"]);
  const otherRest = { ...r, handle: { ...r.handle, drop_cursor: { ...r.handle.drop_cursor, settle: settle(0) } } };
  assert.equal(fix3([otherRest], V044).counts.settle_rest.disagreeing, 1);
});

test('the named rows are capped at five, the count whole', () => {
  const v = fix3(Array.from({ length: 8 }, (_, i) => settled(i, 0)), V044);
  assert.match(v.failed[0], /on 8 of 8 settled drags \(cua plain #0 rested 0 ms, .*cua plain #4 rested 0 ms, …\)/);
});

test('later engines are held to it too', () => {
  for (const version of ['cua-engine 0.4.5 (0123456789ab)', 'cua-engine 0.5.0 (0123456789ab)', 'cua-engine 1.0.0 (0123456789ab)']) assert.equal(fix3([settled(0)], version).failed.length, 1, version);
});

test("an engine before 0.4.4, whose rows predate the field and the count, is untouched: no fail, and the check says why it did not apply", () => {
  for (const version of [V043, 'cua-engine 0.4.1 (7522dcb8fb8c)', 'cua-engine 0.3.0 (83dd7e5bfedb)']) {
    const v = fix3([settled(0, undefined, { entered: null }), settled(1, 0), unsettled(settled(2, 0)), { ...settled(3), family: 'chrome' }], version);
    assert.deepEqual(v.failed, [], version);
    assert.equal(v.counts.settle_rest.applies, false, version);
  }
  assert.ok(fix3([settled(0)], V043).findings.includes("the settle's rest is not checked: engine 0.4.3 predates its record (from 0.4.4)"));
});

test("a run whose engine version cannot be read fails the check, never skips it", () => {
  for (const version of [undefined, null, 'cua-engine dev', 'garbage', 'cua-engine 0.4.3 (']) {
    const v = fix3([settled(0, 30)], version);
    assert.deepEqual(v.failed, [`the run's engine version is unreadable (its meta row's cua_version: ${JSON.stringify(version ?? null)}), so the settle's rest cannot be checked (#487)`], String(version));
    assert.equal(v.counts.settle_rest.applies, null);
  }
});

test("the check is t17-fix3's alone: another Electron plan on 0.4.4 is not held to it", () => {
  for (const plan of ['t17-floor', 't17-handle', 't17-fix2']) {
    const v = fix3([settled(0)], V044, plan);
    assert.deepEqual(v.failed, [], plan);
    assert.equal(v.counts.settle_rest, undefined, plan);
  }
});

test("the dispatcher reads the version from the run's meta row", () => {
  const run = (meta, rows) => dropSignalsVerdict({ families: ['electron'], plan: 't17-fix3' }, [...(meta ? [meta] : []), { kind: 'drop-signal-scene', specs: [{ lane: 'cua', cell: 'plain', n: rows.length }] }, ...rows]);
  assert.deepEqual(run({ kind: 'meta', cua_version: V044 }, [settled(0, 30)]).failed, []);
  assert.equal(run({ kind: 'meta', cua_version: V044 }, [settled(0)]).failed.length, 1);
  assert.deepEqual(run({ kind: 'meta', cua_version: V043 }, [settled(0)]).failed, []);
  assert.match(run(null, [settled(0, 30)]).failed[0], /engine version is unreadable/);
  assert.match(run({ kind: 'meta' }, [settled(0, 30)]).failed[0], /engine version is unreadable/);
});

test('SETTLE_REST names the plan, the first version and the rest', () => {
  assert.deepEqual(SETTLE_REST, { plan: 't17-fix3', since: [0, 4, 4], rest_ms: 30 });
});
