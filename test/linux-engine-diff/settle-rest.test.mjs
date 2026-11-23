// The settle's rest in item 1's judge (#487, task 142, ruling 1102): from linux-engine 0.4.4 every Electron settle
// records the rest it took between its two pings (`drop_cursor.settle.rest_ms`, a drag's or a handle's), which is its
// press source's family's, Electron's 30 ms. t17-fix3's judge fails a settled row whose rest is not 30, or that lacks
// the field, on a run whose engine (its meta row's `cua_version`) is 0.4.4 or later; a run whose version cannot be read
// fails the check, never skips it; rows from an earlier engine, which predate the field, are untouched.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SETTLE_REST, dropSignalsVerdict, electronDropVerdict, engineVersionOf, settleOf } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { dropRow } from './drop-rows.mjs';

const V043 = 'cua-engine 0.4.3 (ba5b043834ce)';
const V044 = 'cua-engine 0.4.4 (d8e03a5cb7d4)';

/** A settle record as the engine writes it; `rest` its `rest_ms`, left out when undefined. */
const settle = (rest) => ({ after_motion: { answered: true, ms: 1.5 }, before_rest: { answered: true, ms: 0.7 }, second_rest: 'needless', settle_failed_activation_confirmed: false, settled: true, ...(rest === undefined ? {} : { rest_ms: rest }) });

/**
 * An Electron drop, landed and ok, taken by the engine's hold with a live cursor watch: its settle on the drag's drop
 * cursor, or on a handle's (`lane` cua:handle), as the rows copy them (drop-signals.mjs `oneDrag`). `taken` false
 * makes it a drag the engine saw no take for; `cursor` replaces the watch's record (null: none).
 */
const settled = (i, rest, { lane = 'cua', taken = true, cursor = { accepted: true, error: null, settle: settle(rest) } } = {}) => {
  const r = dropRow({ family: 'electron', lane, i });
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

test("the engine's version is read from the meta row's `cua-engine X.Y.Z (sha)`, else null", () => {
  assert.deepEqual(engineVersionOf(V043), [0, 4, 3]);
  assert.deepEqual(engineVersionOf(V044), [0, 4, 4]);
  assert.deepEqual(engineVersionOf('cua-engine 0.4.10 (0123456789ab)'), [0, 4, 10]);
  assert.deepEqual(engineVersionOf('cua-engine 1.0.0 (unknown)'), [1, 0, 0], "build.rs's stamp with no git");
  // the whole recorded string, as the engine prints it (main.rs `version`): malformed metadata never opts a run out
  for (const bad of [undefined, null, '', 42, 'cua-engine', 'cua-engine 0.4', 'cua-engine 1.0.0', 'cua-engine 0.4.3 (', 'cua-engine 0.4.3 (ba5b043834ce', 'cua-engine 0.4.3 ()', 'cua-engine 0.4.3 (ba5b043834ce) extra', 'cua-engine 0.4.3 (not-a-sha)', 'cua 0.4.4 (x)', 'sky 0.4.4', 'cua-engine 0.4.4x (y)', ' cua-engine 0.4.4 (d8e03a5cb7d4)', 'cua-engine 0.4.4 (d8e03a5cb7d4)\n']) assert.equal(engineVersionOf(bad), null, JSON.stringify(bad));
});

test("a row's settle record is its drag's drop cursor's, or its handle's", () => {
  assert.deepEqual(settleOf(settled(0, 30)), settle(30));
  assert.deepEqual(settleOf({ handle: { drop_cursor: { settle: settle(30) } } }), settle(30));
  assert.equal(settleOf(dropRow({ family: 'electron' })), null);
  assert.equal(settleOf({ drop_cursor: { accepted: false } }), null);
  for (const notRecord of [false, true, 0, 'settled', [], null]) assert.equal(settleOf({ drop_cursor: { settle: notRecord } }), null, JSON.stringify(notRecord));
});

test('on 0.4.4 every settled row resting 30 ms passes, drags and handles alike, and rows with no settle are not checked', () => {
  const rows = [settled(0, 30), settled(1, 30), settled(0, 30, { lane: 'cua:handle' }), dropRow({ family: 'electron', cell: 'left', landed: false, pending: 'unconfirmed', i: 0 })];
  const v = fix3(rows, V044);
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.counts.settle_rest, { applies: true, version: '0.4.4', settled: 3, rest_30: 3, wrong: 0, missing: 0, unrecorded: 0 });
  assert.match(v.md.join('\n'), /The settle's rest \(#487, engine 0.4.4\): 3 of 3 settled drags rested 30 ms; 0 another rest, 0 without rest_ms, 0 without the settle record/);
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

test("on 0.4.4 a taken drop with a live watch whose settle record is gone fails, the whole object deleted, drags and handles alike", () => {
  const rows = [settled(0, 30), unsettled(settled(1, 0)), unsettled(settled(0, 0, { lane: 'cua:handle' }))];
  const v = fix3(rows, V044);
  assert.deepEqual(v.failed, ["a settle was expected (the engine's take with a live cursor watch, or a settle field) and no settle record (drop_cursor.settle, an object) is there on 2 of 3 drags held to it (cua plain #1, cua:handle plain #0) (#487, engine 0.4.4)"]);
  assert.equal(v.counts.settle_rest.unrecorded, 2);
  assert.equal(v.counts.settle_rest.settled, 3);
});

test("a taken Electron drop with no cursor watch record at all fails as unrecorded; one whose watch failed to start, or the engine never saw take, is exempt", () => {
  const noWatch = settled(0, 30, { cursor: null });
  assert.equal(fix3([noWatch], V044).counts.settle_rest.unrecorded, 1);
  const failedWatch = settled(1, undefined, { cursor: { accepted: null, error: 'connection refused' } });
  const untaken = unsettled(settled(2, 30, { taken: false }));
  const untakenHandle = unsettled(settled(0, 30, { lane: 'cua:handle', taken: false }));
  const v = fix3([failedWatch, untaken, untakenHandle], V044);
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.counts.settle_rest, { applies: true, version: '0.4.4', settled: 0, rest_30: 0, wrong: 0, missing: 0, unrecorded: 0 });
});

test('a settle that is not a record fails wherever it is, taken or not', () => {
  for (const notRecord of [false, true, 30, 'settled']) {
    const r = settled(0, 30, { taken: false, cursor: { accepted: true, error: null, settle: notRecord } });
    assert.equal(fix3([r], V044).counts.settle_rest.unrecorded, 1, JSON.stringify(notRecord));
  }
});

test("a row of another family is not expected to settle: the expectation is an Electron scene's", () => {
  const chrome = { ...unsettled(settled(0, 30)), family: 'chrome' };
  assert.deepEqual(fix3([chrome], V044).failed, []);
});

test('the named rows are capped at five, the count whole', () => {
  const v = fix3(Array.from({ length: 8 }, (_, i) => settled(i, 0)), V044);
  assert.match(v.failed[0], /on 8 of 8 settled drags \(cua plain #0 rested 0 ms, .*cua plain #4 rested 0 ms, …\)/);
});

test('later engines are held to it too', () => {
  for (const version of ['cua-engine 0.4.5 (0123456789ab)', 'cua-engine 0.5.0 (0123456789ab)', 'cua-engine 1.0.0 (0123456789ab)']) assert.equal(fix3([settled(0)], version).failed.length, 1, version);
});

test("an engine before 0.4.4, whose settle records predate the field, is untouched: no fail, and the check says why it did not apply", () => {
  for (const version of [V043, 'cua-engine 0.4.1 (7522dcb8fb8c)', 'cua-engine 0.3.0 (83dd7e5bfedb)']) {
    const v = fix3([settled(0), settled(1, 0), unsettled(settled(2, 0))], version);
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
