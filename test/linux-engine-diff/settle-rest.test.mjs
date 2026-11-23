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

/** An Electron drop, landed and ok: its settle on the drag's drop cursor, or on a handle's (`lane` cua:handle). */
const settled = (i, rest, { lane = 'cua' } = {}) => {
  const r = dropRow({ family: 'electron', lane, i });
  const cursor = { accepted: true, settle: settle(rest) };
  return lane === 'cua:handle' ? { ...r, drop_cursor: cursor, handle: { drop_cursor: cursor } } : { ...r, drop_cursor: cursor };
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
  assert.deepEqual(engineVersionOf('cua-engine 1.0.0'), [1, 0, 0]);
  for (const bad of [undefined, null, '', 42, 'cua-engine', 'cua-engine 0.4', 'cua 0.4.4 (x)', 'sky 0.4.4', 'cua-engine 0.4.4x (y)', ' cua-engine 0.4.4 (y)']) assert.equal(engineVersionOf(bad), null, String(bad));
});

test("a row's settle record is its drag's drop cursor's, or its handle's", () => {
  assert.deepEqual(settleOf(settled(0, 30)), settle(30));
  assert.deepEqual(settleOf({ handle: { drop_cursor: { settle: settle(30) } } }), settle(30));
  assert.equal(settleOf(dropRow({ family: 'electron' })), null);
  assert.equal(settleOf({ drop_cursor: { accepted: false } }), null);
});

test('on 0.4.4 every settled row resting 30 ms passes, drags and handles alike, and rows with no settle are not checked', () => {
  const rows = [settled(0, 30), settled(1, 30), settled(0, 30, { lane: 'cua:handle' }), dropRow({ family: 'electron', cell: 'left', landed: false, pending: 'unconfirmed', i: 0 })];
  const v = fix3(rows, V044);
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.counts.settle_rest, { applies: true, version: '0.4.4', settled: 3, rest_30: 3, wrong: 0, missing: 0 });
  assert.match(v.md.join('\n'), /The settle's rest \(#487, engine 0.4.4\): 3 of 3 settled drags rested 30 ms; 0 another rest, 0 without the record/);
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

test('the named rows are capped at five, the count whole', () => {
  const v = fix3(Array.from({ length: 8 }, (_, i) => settled(i, 0)), V044);
  assert.match(v.failed[0], /on 8 of 8 settled drags \(cua plain #0 rested 0 ms, .*cua plain #4 rested 0 ms, …\)/);
});

test('later engines are held to it too', () => {
  for (const version of ['cua-engine 0.4.5 (a)', 'cua-engine 0.5.0 (a)', 'cua-engine 1.0.0 (a)']) assert.equal(fix3([settled(0)], version).failed.length, 1, version);
});

test("an engine before 0.4.4, whose settle records predate the field, is untouched: no fail, and the check says why it did not apply", () => {
  for (const version of [V043, 'cua-engine 0.4.1 (a)', 'cua-engine 0.3.9 (a)']) {
    const v = fix3([settled(0), settled(1, 0)], version);
    assert.deepEqual(v.failed, [], version);
    assert.equal(v.counts.settle_rest.applies, false, version);
  }
  assert.ok(fix3([settled(0)], V043).findings.includes("the settle's rest is not checked: engine 0.4.3 predates its record (from 0.4.4)"));
});

test("a run whose engine version cannot be read fails the check, never skips it", () => {
  for (const version of [undefined, null, 'cua-engine dev', 'garbage']) {
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
