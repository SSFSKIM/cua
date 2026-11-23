// The settle's rest in item 1's judge (#487, task 142, ruling 1102): from linux-engine 0.4.4 every Electron settle
// records the rest it took between its two pings (`drop_cursor.settle.rest_ms`, a drag's or a handle end's), which is
// its press source's family's, Electron's 30 ms. On a run whose engine (its meta row's `cua_version`, held to the
// candidate it recorded) is 0.4.4 or later, t17-fix3's judge holds every drop to the engine's own count of the settles
// its requests entered (`drop_settles.entered`, carried per drop as `settle_count`, read from the stats lines matched to
// its requests): one entered needs its own operation's settle record resting 30 ms; none entered, no settle at all and
// a zero shown to be its own. A drop without that count, with a family label other than Electron's, or with a copy of
// its settle that disagrees, fails; so does a run with a lane and cell where no settle was observed. A run whose version
// cannot be read or does not stand fails the check, never skips it; rows from an earlier engine, which predate the
// field, are untouched.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FRESH, counterOf, settleCount } from '../../scripts/linux-engine-diff/drop-signals.mjs';
import { SETTLE_REST, dropSignalsVerdict, electronDropVerdict, engineVersionOf, settleOf, settlesEntered, versionDisagreements, watchFailedToStart, zeroCountOwn } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { dropRow } from './drop-rows.mjs';

const V043 = 'cua-engine 0.4.3 (ba5b043834ce)';
const V044 = 'cua-engine 0.4.4 (23f342178d94)';
/** A development run's meta row (no gate, no candidate), on `version`. */
const dev = (version) => ({ kind: 'meta', gate: false, cua_version: version });
/** A pinned run's meta row as experiments.mjs writes it: the gate, the candidate's version and its attested asset. */
const pinned = (version, { candidate = version, asset = `cua-engine-${engineVersionOf(candidate)?.join('.')}-linux-x64`, sha = 'f'.repeat(64) } = {}) => ({
  kind: 'meta',
  gate: 'pinned',
  cua_version: version,
  candidate: { gate: 'pinned', sha256: sha, version: candidate, attestation: { verified: true, attestations: [{ subjects: [{ name: asset, sha256: sha }, { name: 'cua-engine-x-linux-arm64', sha256: 'e'.repeat(64) }] }] } },
});

/** A settle record as the engine writes it; `rest` its `rest_ms`, left out when undefined. */
const settle = (rest) => ({ after_motion: { answered: true, ms: 1.5 }, before_rest: { answered: true, ms: 0.7 }, second_rest: 'needless', settle_failed_activation_confirmed: false, settled: true, ...(rest === undefined ? {} : { rest_ms: rest }) });

/** A cursor watch's release read, as `drop_cursor.rs` `AtRelease::record` writes it, with `error` its own. */
const releaseRead = (extra = {}) => ({ steps: [['c', 1, 2]], accepted: true, shown: null, initial: '0', history: [], take_time: 1, read_ms: 0.9, error: null, start: [640, 400], motions: 0, last_motions: [], ...extra });

/** A drop's settle count as drop-signals.mjs `settleCount` writes it: from the lines matched to its requests. */
const counted = (entered, { before = 3, before_from = 7, after_from = 9 } = {}) => ({ before, after: before + entered, entered, before_from, after_from });

/**
 * An Electron drop, landed and ok, whose requests entered `entered` settles by the engine's count: its settle on the
 * drag's drop cursor, or for a handle (`lane` cua:handle) on the handle end's, copied to the top as drop-signals.mjs
 * `oneDrag` does (the same record twice). `taken` is its hold's record; `cursor` replaces the watch's record (null:
 * none); `count` replaces the whole count.
 */
const settled = (i, rest, { lane = 'cua', cell = 'plain', entered = 1, count, taken = true, cursor = releaseRead({ settle: settle(rest) }) } = {}) => {
  const r = { ...dropRow({ family: 'electron', lane, cell, i }), settle_count: count !== undefined ? count : entered === null ? null : counted(entered) };
  const watch = cursor === null ? {} : { drop_cursor: cursor };
  if (lane === 'cua:handle') return { ...r, ...watch, handle: { pressed: true, hold: { taken }, held: { taken }, ...watch } };
  return { ...r, ...watch, hold: { taken } };
};
/** The same row with its settle record deleted, the whole object, from the drag's and the handle's watch alike. */
const unsettled = (r) => {
  const strip = (c) => (c ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'settle')) : c);
  return { ...r, drop_cursor: strip(r.drop_cursor), ...(r.handle ? { handle: { ...r.handle, drop_cursor: strip(r.handle.drop_cursor) } } : {}) };
};

const fix3 = (rows, meta, plan = 't17-fix3') => {
  const cells = new Map();
  for (const r of rows) cells.set(`${r.lane}|${r.cell}`, { lane: r.lane, cell: r.cell, n: (cells.get(`${r.lane}|${r.cell}`)?.n ?? 0) + 1 });
  return electronDropVerdict(rows, { specs: [...cells.values()], plan, meta: typeof meta === 'string' || meta == null ? (meta == null ? meta : dev(meta)) : meta });
};
const UNRECORDED = (n, of, rows) => `the engine entered a settle and the drop's own operation carries no settle record (an object) on ${n} of ${of} settled drags (${rows}) (#487, engine 0.4.4)`;
/** The fails that are the settle check's, apart from T17's own. */
const settleFails = (v) => v.failed.filter((f) => /#487/.test(f));

test("the engine's version is read from the meta row's `cua-engine X.Y.Z (sha)`, else null", () => {
  assert.deepEqual(engineVersionOf(V043), [0, 4, 3]);
  assert.deepEqual(engineVersionOf(V044), [0, 4, 4]);
  assert.deepEqual(engineVersionOf('cua-engine 0.4.10 (0123456789ab)'), [0, 4, 10]);
  assert.deepEqual(engineVersionOf('cua-engine 1.0.0 (unknown)'), [1, 0, 0], "build.rs's stamp with no git");
  // the whole recorded string, as the engine prints it (main.rs `version`): malformed metadata never opts a run out
  for (const bad of [undefined, null, '', 42, 'cua-engine', 'cua-engine 0.4', 'cua-engine 1.0.0', 'cua-engine 0.4.3 (', 'cua-engine 0.4.3 (ba5b043834ce', 'cua-engine 0.4.3 ()', 'cua-engine 0.4.3 (ba5b043834ce) extra', 'cua-engine 0.4.3 (not-a-sha)', 'cua 0.4.4 (x)', 'sky 0.4.4', 'cua-engine 0.4.4x (y)', ' cua-engine 0.4.4 (d8e03a5cb7d4)', 'cua-engine 0.4.4 (d8e03a5cb7d4)\n']) assert.equal(engineVersionOf(bad), null, JSON.stringify(bad));
});

test("a row's settle record is its own operation's: the drag's on a drag lane, the handle end's on a handle lane, any copy agreeing", () => {
  assert.deepEqual(settleOf(settled(0, 30)), settle(30));
  assert.deepEqual(settleOf(settled(0, 30, { lane: 'cua:handle' })), settle(30), "a handle's two copies, the same record");
  assert.equal(settleOf(dropRow({ family: 'electron' })), null);
  assert.equal(settleOf({ lane: 'cua', drop_cursor: { accepted: false } }), null);
  for (const notRecord of [false, true, 0, 'settled', [], null]) assert.equal(settleOf({ lane: 'cua', drop_cursor: { settle: notRecord } }), null, JSON.stringify(notRecord));
  assert.equal(settleOf({ lane: 'cua:handle', drop_cursor: { settle: settle(30) }, handle: { drop_cursor: { settle: false } } }), null, 'a copy that disagrees');
  // a handle's top-level copy alone never stands for the handle end's own record
  assert.equal(settleOf({ lane: 'cua:handle', drop_cursor: { settle: settle(30) }, handle: { drop_cursor: {} } }), null);
});

test("the drop's settle count comes from the stats lines matched to its own requests, never the engine's last counter", () => {
  const reply = (id, entered) => ({ id, stats: { drop_settles: { entered, second_rest: 0, skipped: 0, unsettled: 0 } } });
  assert.deepEqual(settleCount(counterOf(reply(7, 4)), counterOf(reply(9, 5))), { before: 4, after: 5, entered: 1, before_from: 7, after_from: 9 });
  assert.deepEqual(settleCount(FRESH, counterOf(reply(1, 0))), { before: 0, after: 0, entered: 0, before_from: 'fresh', after_from: 1 });
  // a lost stats line on either side leaves the count null, which fails the row; never the last counter read twice
  assert.equal(settleCount(counterOf(reply(7, 4)), counterOf({ id: 9, stats: null })), null);
  assert.equal(settleCount(counterOf({ id: 7, stats: null }), counterOf(reply(9, 4))), null);
  assert.equal(settleCount({ from: null, counter: null }, counterOf(reply(9, 4))), null);
  assert.equal(settleCount(counterOf(reply(7, 5)), counterOf(reply(9, 4))), null, 'a counter that went back');
  assert.equal(settleCount(counterOf(reply(7, 4)), { from: null, counter: { entered: 5 } }), null, 'an after with no request of its own');
});

test('a whole count only: non-negative integer endpoints and entered their difference; a zero must be shown its own', () => {
  assert.equal(settlesEntered({ settle_count: counted(1) }), 1);
  for (const c of [undefined, null, {}, { entered: 1 }, { before: 0, after: 1, entered: 0 }, { before: 4, after: 4, entered: 1 }, { before: -1, after: 0, entered: 1 }, { before: 0, after: 1.5, entered: 1.5 }, { before: '0', after: 1, entered: 1 }]) assert.equal(settlesEntered({ settle_count: c }), null, JSON.stringify(c));
  assert.equal(zeroCountOwn({ settle_count: counted(0) }), true);
  assert.equal(zeroCountOwn({ settle_count: counted(0, { before_from: 'fresh' }) }), true);
  for (const c of [{ before: 4, after: 4, entered: 0 }, counted(0, { after_from: null }), counted(0, { before_from: 'stale' })]) assert.equal(zeroCountOwn({ settle_count: c }), false, JSON.stringify(c));
});

test('a watch that failed to start is told apart from a release read that carried an error', () => {
  assert.equal(watchFailedToStart({ accepted: null, error: 'connection refused' }), true);
  assert.equal(watchFailedToStart({ accepted: null, error: 'connection refused', settle: settle(30) }), true);
  assert.equal(watchFailedToStart(releaseRead({ error: 'the read timed out', accepted: null })), false);
  assert.equal(watchFailedToStart({ read: false }), false);
  assert.equal(watchFailedToStart(releaseRead()), false);
});

test("a run's version stands only where its candidate agrees: the meta's cua_version, the candidate's version, its attested asset", () => {
  assert.deepEqual(versionDisagreements(pinned(V044)), []);
  assert.deepEqual(versionDisagreements(pinned(V043)), []);
  assert.deepEqual(versionDisagreements(dev(V043)), [], 'a development run records no candidate');
  assert.equal(versionDisagreements(pinned(V043, { candidate: V044 })).length, 1, 'the line and the candidate disagree');
  assert.equal(versionDisagreements(pinned(V043, { asset: 'cua-engine-0.4.4-linux-x64' })).length, 1, 'the attested asset names another version');
  assert.equal(versionDisagreements({ kind: 'meta', gate: 'pinned', cua_version: V043 }).length, 1, 'a counted run with no candidate');
  assert.equal(versionDisagreements({ kind: 'meta', gate: true, cua_version: V043 }).length, 1, "a release gate's run with no candidate");
});

test('on 0.4.4 every settle the engine counted, resting 30 ms, passes, drags and handles alike; a drop with none counted and no settle passes', () => {
  const none = { ...dropRow({ family: 'electron', cell: 'plain', landed: false, pending: 'unconfirmed', i: 2 }), settle_count: counted(0) };
  const rows = [settled(0, 30), settled(1, 30), settled(0, 30, { lane: 'cua:handle' }), none];
  const v = fix3(rows, pinned(V044));
  assert.deepEqual(settleFails(v), []);
  assert.deepEqual(v.counts.settle_rest, { applies: true, version: '0.4.4', drops: 4, settled: 3, rest_30: 3, wrong: 0, missing: 0, unrecorded: 0, uncounted: 0, unproven_zero: 0, contradicted: 0, disagreeing: 0, mislabelled: 0, cells: 2, unexercised_cells: 0 });
  assert.match(v.md.join('\n'), /The settle's rest \(#487, engine 0.4.4\): 3 of 3 settled drags rested 30 ms; 0 another rest, 0 without rest_ms, 0 without the settle record; 0 drops without the engine's settle count, 0 contradicting it, 0 with copies that disagree, 0 not labelled Electron's; 0 zero counts not shown their own; 0 of 2 lanes and cells with no settle observed/);
});

test('on 0.4.4 a settled row resting other than 30 ms fails, named with its rest', () => {
  const rows = [settled(0, 30), settled(1, 0), settled(2, 30), settled(0, 16, { lane: 'cua:handle' })];
  const v = fix3(rows, V044);
  assert.deepEqual(settleFails(v), ["the settle's rest (drop_cursor.settle.rest_ms) is not Electron's 30 ms on 2 of 4 settled drags (cua plain #1 rested 0 ms, cua:handle plain #0 rested 16 ms) (#487, engine 0.4.4)"]);
});

test('on 0.4.4 a settled row lacking the field, or holding no whole number of ms, fails, named', () => {
  const rows = [settled(0, 30), settled(1), settled(2, '30'), settled(3, 30.5), settled(4, null), settled(0, 30, { lane: 'cua:handle' }), settled(1, undefined, { lane: 'cua:handle' })];
  const v = fix3(rows, V044);
  assert.deepEqual(settleFails(v), ["a settled drag lacks the settle's rest (drop_cursor.settle.rest_ms, an integer in ms) on 5 of 7 settled drags (cua plain #1, cua plain #2, cua plain #3, cua plain #4, cua:handle plain #1) (#487: engine 0.4.4 records it on every settle)"]);
});

test('the engine counted a settle and its record is gone, the whole object deleted: a drag and a handle fail', () => {
  const v = fix3([settled(0, 30), unsettled(settled(1, 0)), settled(0, 30, { lane: 'cua:handle' }), unsettled(settled(1, 0, { lane: 'cua:handle' }))], V044);
  assert.deepEqual(settleFails(v), [UNRECORDED(2, 4, 'cua plain #1, cua:handle plain #1')]);
});

test("probe: a handle whose take only its cursor watch saw (the hold saw none), its counted settle deleted, fails", () => {
  const cursorOnly = unsettled(settled(1, 30, { lane: 'cua:handle', taken: false }));
  assert.deepEqual(settleFails(fix3([settled(0, 30, { lane: 'cua:handle' }), cursorOnly], V044)), [UNRECORDED(1, 2, 'cua:handle plain #1')]);
});

test('probe: a drag whose release read carried an error, its counted settle deleted, fails: the error is a watch that ran', () => {
  const readError = unsettled(settled(1, 30, { cursor: releaseRead({ accepted: null, error: 'the read timed out', settle: settle(30) }) }));
  assert.deepEqual(settleFails(fix3([settled(0, 30), readError], V044)), [UNRECORDED(1, 2, 'cua plain #1')]);
});

test("a watch that failed to start settles nothing: none counted and no settle passes; a settle counted beside it without a record still fails", () => {
  const failedWatch = settled(1, undefined, { entered: 0, cursor: { accepted: null, error: 'connection refused' } });
  assert.deepEqual(settleFails(fix3([settled(0, 30), failedWatch], V044)), []);
  const countedNoRecord = settled(1, undefined, { cursor: { accepted: null, error: 'connection refused' } });
  assert.deepEqual(settleFails(fix3([settled(0, 30), countedNoRecord], V044)), [UNRECORDED(1, 2, 'cua plain #1')]);
});

test("a drop without a whole settle count fails on 0.4.4: whether it settled is unknown", () => {
  const v = fix3([settled(0, 30), settled(1, 30, { entered: null }), unsettled(settled(2, 30, { count: { before: 0, after: 1, entered: 0 } }))], V044);
  assert.deepEqual(settleFails(v), ["a drop carries no whole settle count of its requests (settle_count: its engine's drop_settles.entered before and after, non-negative integers, and entered their difference) on 2 of 3 drops (cua plain #1, cua plain #2): whether it settled is unknown (#487, engine 0.4.4)"]);
});

test('a settle field with none counted, or more than one settle counted for one drop, contradicts the count and fails', () => {
  const rows = [settled(0, 30), settled(1, 30, { entered: 0 }), settled(2, 30, { entered: 0, cursor: releaseRead({ settle: false }) }), settled(3, 30, { entered: 2 })];
  assert.deepEqual(settleFails(fix3(rows, V044)), ["a drop's settle contradicts the engine's count (a settle field with none entered, or more than one entered) on 3 of 4 drops (cua plain #1 entered 0, cua plain #2 entered 0, cua plain #3 entered 2) (#487, engine 0.4.4)"]);
});

test("probe: a taken plain drop relabelled chrome, its settle missing, still fails: a missing or other family label fails the row", () => {
  const relabelled = { ...unsettled(settled(1, 30)), family: 'chrome' };
  const v = fix3([settled(0, 30), relabelled], V044);
  assert.ok(v.failed.includes(UNRECORDED(1, 2, 'cua plain #1')), v.failed.join('\n'));
  assert.ok(v.failed.includes(`a drop of the Electron plan is not labelled the Electron scene's (family "chrome") on 1 of 2 drops (cua plain #1): its settle is checked as any (#487, engine 0.4.4)`), v.failed.join('\n'));
  const unlabelled = { ...settled(1, 30) };
  delete unlabelled.family;
  assert.deepEqual(settleFails(fix3([settled(0, 30), unlabelled], V044)), [`a drop of the Electron plan is not labelled the Electron scene's (family null) on 1 of 2 drops (cua plain #1): its settle is checked as any (#487, engine 0.4.4)`]);
});

test("probe: a copy of a settle must agree with its own: rest 30 at the top with `settle: false` in the handle end's fails", () => {
  const r = settled(0, 30, { lane: 'cua:handle' });
  const masked = { ...r, handle: { ...r.handle, drop_cursor: { ...r.handle.drop_cursor, settle: false } } };
  // the handle end's own settle is no record, and the valid top-level copy cannot stand for it
  assert.deepEqual(settleFails(fix3([settled(1, 30, { lane: 'cua:handle' }), masked], V044)), [
    "a drop's copy of its settle disagrees with its own operation's (the handle end's on a handle lane, else the drag's drop_cursor.settle) on 1 of 2 drops (cua:handle plain #0) (#487, engine 0.4.4)",
    UNRECORDED(1, 2, 'cua:handle plain #0'),
  ]);
  // the other way round: a valid own record with a malformed copy fails as disagreeing
  const copyBad = { ...r, drop_cursor: { ...r.drop_cursor, settle: false } };
  assert.equal(fix3([settled(1, 30, { lane: 'cua:handle' }), copyBad], V044).counts.settle_rest.disagreeing, 1);
});

// ---------------------------------------------------------------------------------------------------------------
// fix wave 3 (the 0.4.4 PR's whole-branch review of 4e0ba0a9): each a constructed row the judge at 4e0ba0a9 passed

test('wave 3, P1 2: a lost stats line read as {before 4, after 4, entered 0}, a landed row with no settle record, fails: the zero is not its own', () => {
  const lost = unsettled(settled(1, 30, { count: { before: 4, after: 4, entered: 0 } }));
  assert.deepEqual(settleFails(fix3([settled(0, 30), lost], V044)), ["a drop's count of no settle is not shown to be its own (its after read from its own request's stats line, its before from the engine's previous request's or a fresh engine's) on 1 of 2 drops (cua plain #1): a lost stats line reads as none (#487, engine 0.4.4)"]);
  // the same zero read from the drop's own lines stands
  assert.deepEqual(settleFails(fix3([settled(0, 30), unsettled(settled(1, 30, { entered: 0 }))], V044)), []);
});

test('wave 3, P2 3: a 0.4.4 run whose meta cua_version alone says 0.4.3 is not exempt: its candidate and attested asset disagree, and the check fails', () => {
  const rows = [settled(0), settled(1)];
  const v = fix3(rows, pinned(V043, { candidate: V044 }));
  assert.equal(v.counts.settle_rest.applies, null);
  assert.match(v.failed.join('\n'), /the run's engine version does not stand \(its cua_version "cua-engine 0.4.3 \(ba5b043834ce\)" and its candidate's version "cua-engine 0.4.4 \(23f342178d94\)" disagree; its candidate's attested asset is named for "0.4.4", not its version 0.4.4\)|the run's engine version does not stand/);
  // a pinned 0.4.3 run whose records agree stays exempt
  assert.equal(fix3(rows, pinned(V043)).counts.settle_rest.applies, false);
  assert.deepEqual(settleFails(fix3(rows, pinned(V043))), []);
});

test('wave 3, P2 4: a count {before 0, after 1, entered 0} with no record fails: entered must be after less before', () => {
  const broken = unsettled(settled(1, 30, { count: { before: 0, after: 1, entered: 0, before_from: 'fresh', after_from: 2 } }));
  const v = fix3([settled(0, 30), broken], V044);
  assert.equal(v.counts.settle_rest.uncounted, 1);
  assert.match(settleFails(v).join('\n'), /a drop carries no whole settle count/);
});

test("wave 3, P2 5: a plain drag's settle moved into handle.drop_cursor fails: on a drag lane only the drag's own drop_cursor counts", () => {
  const base = settled(1, 30);
  const moved = { ...base, drop_cursor: releaseRead(), handle: { drop_cursor: releaseRead({ settle: settle(30) }) } };
  const v = fix3([settled(0, 30), moved], V044);
  assert.ok(v.failed.includes(UNRECORDED(1, 2, 'cua plain #1')), v.failed.join('\n'));
  assert.equal(v.counts.settle_rest.disagreeing, 1);
  // and a handle's settle only at the top fails alike
  const h = settled(1, 30, { lane: 'cua:handle' });
  const top = { ...h, handle: { ...h.handle, drop_cursor: releaseRead() } };
  assert.ok(fix3([settled(0, 30, { lane: 'cua:handle' }), top], V044).failed.includes(UNRECORDED(1, 2, 'cua:handle plain #1')));
});

test('wave 3, P2 6: a run whose 560 drops all read zero settles with no record fails: each lane and cell must show a settle observed', () => {
  const cells = [['cua', 'plain', 100], ['cua', 'left', 30], ['cua', 'inzone-out', 30], ...['root', 'xterm', 'other', 'slow'].map((c) => ['cua:desktop', c, 30]), ['cua:handle', 'plain', 100], ['cua:handle', 'left', 30], ['cua:handle', 'inzone-out', 30], ...['root', 'xterm', 'other', 'slow'].map((c) => ['cua:handle', c, 30])];
  const rows = cells.flatMap(([lane, cell, n]) => Array.from({ length: n }, (_, i) => unsettled(settled(i, 30, { lane, cell, entered: 0 }))));
  assert.equal(rows.length, 560);
  const v = fix3(rows, pinned(V044));
  assert.equal(v.counts.settle_rest.unexercised_cells, 14);
  assert.ok(v.failed.some((f) => f.startsWith('no settle was observed (one entered by the engine\'s count, its record there) in 14 of the 14 lanes and cells the run sat')), v.failed.join('\n'));
  // one observed settle in each lane and cell is enough; the other drops may read zero
  const once = rows.map((r) => (r.i === 0 ? settled(0, 30, { lane: r.lane, cell: r.cell }) : r));
  assert.equal(fix3(once, pinned(V044)).counts.settle_rest.unexercised_cells, 0);
});

test('the named rows are capped at five, the count whole', () => {
  const v = fix3(Array.from({ length: 8 }, (_, i) => settled(i, 0)), V044);
  assert.match(settleFails(v)[0], /on 8 of 8 settled drags \(cua plain #0 rested 0 ms, .*cua plain #4 rested 0 ms, …\)/);
});

test('later engines are held to it too', () => {
  for (const version of ['cua-engine 0.4.5 (0123456789ab)', 'cua-engine 0.5.0 (0123456789ab)', 'cua-engine 1.0.0 (0123456789ab)']) assert.equal(settleFails(fix3([settled(0)], version)).length, 1, version);
});

test("an engine before 0.4.4, whose rows predate the field and the count, is untouched: no fail, and the check says why it did not apply", () => {
  for (const meta of [V043, 'cua-engine 0.4.1 (7522dcb8fb8c)', 'cua-engine 0.3.0 (83dd7e5bfedb)', pinned(V043)]) {
    const v = fix3([settled(0, undefined, { entered: null }), settled(1, 0), unsettled(settled(2, 0)), { ...settled(3), family: 'chrome' }], meta);
    assert.deepEqual(settleFails(v), [], JSON.stringify(meta));
    assert.equal(v.counts.settle_rest.applies, false, JSON.stringify(meta));
  }
  assert.ok(fix3([settled(0)], V043).findings.includes("the settle's rest is not checked: engine 0.4.3 predates its record (from 0.4.4)"));
});

test("a run whose engine version cannot be read fails the check, never skips it", () => {
  for (const version of [undefined, null, 'cua-engine dev', 'garbage', 'cua-engine 0.4.3 (']) {
    const v = fix3([settled(0, 30)], { kind: 'meta', cua_version: version });
    assert.deepEqual(settleFails(v), [`the run's engine version is unreadable (its meta row's cua_version: ${JSON.stringify(version ?? null)}), so the settle's rest cannot be checked (#487)`], String(version));
    assert.equal(v.counts.settle_rest.applies, null);
  }
  assert.match(settleFails(fix3([settled(0, 30)], null))[0], /engine version is unreadable/);
});

test("the check is t17-fix3's alone: another Electron plan on 0.4.4 is not held to it", () => {
  for (const plan of ['t17-floor', 't17-handle', 't17-fix2']) {
    const v = fix3([settled(0)], V044, plan);
    assert.deepEqual(settleFails(v), [], plan);
    assert.equal(v.counts.settle_rest, undefined, plan);
  }
});

test("the dispatcher reads the version from the run's meta row, its candidate with it", () => {
  const run = (meta, rows) => dropSignalsVerdict({ families: ['electron'], plan: 't17-fix3' }, [...(meta ? [meta] : []), { kind: 'drop-signal-scene', specs: [{ lane: 'cua', cell: 'plain', n: rows.length }] }, ...rows]);
  assert.deepEqual(settleFails(run(pinned(V044), [settled(0, 30)])), []);
  assert.equal(settleFails(run(pinned(V044), [settled(0)])).length, 1);
  assert.deepEqual(settleFails(run(pinned(V043), [settled(0)])), []);
  assert.match(settleFails(run(pinned(V043, { candidate: V044 }), [settled(0)]))[0], /does not stand/);
  assert.match(run(null, [settled(0, 30)]).failed[0], /engine version is unreadable/);
  assert.match(run({ kind: 'meta' }, [settled(0, 30)]).failed[0], /engine version is unreadable/);
});

test('SETTLE_REST names the plan, the first version and the rest', () => {
  assert.deepEqual(SETTLE_REST, { plan: 't17-fix3', since: [0, 4, 4], rest_ms: 30 });
});
