// #371: #302 in the settle lane's own judge (M5, T2). An Electron page's key release can reach the tree after
// press_key's settle; a run that shows only that counts toward its series' streak and is listed apart, and a lost key, a
// refusal or an invalid run still fails. The fixtures are the stored S1 and L3b records the design session ruled on
// (sminos 659, 682), and the negative controls are the ones m4/gate/scripts/rejudge-302*-controls.mjs held.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACTIVATING, FAMILY_SCENES, cellName, cellsFor, judgeSettleSeries, judgesLateKeyUp, lateKeyUpMiss, sittingVerdict,
} from '../../scripts/linux-engine-diff/action-settle-cells.mjs';
import { CANDIDATES, gateRows } from './gate-rows.mjs';

const keys = (downs, ups, last = 'x') => ({ key_downs: downs, key_ups: ups, last_key: last });
// a run of electron-input press_key background, its before and after readings' key counters
const run = (trial, { ok = false, before = keys(trial, trial), after = keys(trial + 1, ok ? trial + 1 : trial), late_ms = ok ? null : 210, ...rest } = {}) => ({
  kind: 'settle-run', cell: 'electron-input press_key background', scene: 'electron-input', input: 'press_key', route: 'background', lane: 'shipped', load: 0, trial,
  ok, landed: ok, late_ms, answers: [{ ok: true }], before, after, sent: { key: 'x' }, desktop_clean: true, front_active: true, ...rest,
});
const passes = (from, n) => Array.from({ length: n }, (_, i) => run(from + i, { ok: true }));

test('#302 judges only Electron press_key in the shipped lane: a search lane sets the service\'s constants, which #302 must not lower', () => {
  assert.equal(judgesLateKeyUp({ scene: 'electron-input', input: 'press_key', lane: 'shipped' }), true);
  assert.equal(judgesLateKeyUp({ scene: 'electron-text', input: 'press_key', lane: 'shipped' }), true);
  assert.equal(judgesLateKeyUp({ scene: 'electron-input', input: 'press_key', lane: 'settle-100' }), false);
  assert.equal(judgesLateKeyUp({ scene: 'chrome-input', input: 'press_key', lane: 'shipped' }), false);
  assert.equal(judgesLateKeyUp({ scene: 'electron-input', input: 'key_up', lane: 'shipped' }), false);
});

test('a late key-up is #302 only with the key-down inside the settle, the key-up late, and the next before-read caught up', () => {
  const miss = run(2);
  const next = run(3, { ok: true, before: keys(3, 3) });
  assert.equal(lateKeyUpMiss(miss, next), null);
  assert.match(lateKeyUpMiss({ ...miss, late_ms: null }, next), /class never/, 'a lost key');
  assert.match(lateKeyUpMiss({ ...miss, answers: [{ ok: false, error: 'x' }] }, next), /class refused/);
  assert.match(lateKeyUpMiss({ ...miss, invalid: 'a reader failed' }, next), /class invalid/);
  assert.match(lateKeyUpMiss({ ...miss, desktop_clean: false }, next), /the desktop changed/);
  assert.match(lateKeyUpMiss({ ...miss, front_active: false }, next), /the desktop changed/);
  assert.equal(lateKeyUpMiss({ ...miss, front_active: null }, next), null, 'the desktop route has no front window');
  assert.match(lateKeyUpMiss({ ...miss, after: keys(2, 2) }, next), /criterion 1/, 'no key-down in the settle');
  assert.match(lateKeyUpMiss({ ...miss, after: keys(3, 2, 'y') }, next), /criterion 1/, 'another key went down');
  assert.match(lateKeyUpMiss({ ...miss, after: keys(3, 3) }, next), /criterion 2/, 'the key-up already counted, yet not ok');
  assert.match(lateKeyUpMiss(miss, { ...next, before: keys(3, 2) }), /criterion 3/, 'the next before-read still one release short');
  assert.match(lateKeyUpMiss(miss, undefined), /criterion 3: no next before-read/);
  assert.match(lateKeyUpMiss(miss, { ...next, before: undefined, error: 'preparation refused' }), /criterion 3: no next before-read/);
  assert.match(lateKeyUpMiss(miss, { ...next, before: keys(0, 0) }), /criterion 3: no next before-read/, 'a fresh page: the counters started again');
  assert.match(lateKeyUpMiss({ ...miss, before: {} }, next), /no key counters/);
});

test('a series counts a #302 run toward its streak, lists it apart, and leaves one awaiting its next before-read unproven', () => {
  const rows = [...passes(0, 2), run(2), ...passes(3, 28)];
  const v = judgeSettleSeries(rows, { need: 30 });
  assert.equal(v.reached, true);
  assert.equal(v.streak, 31);
  assert.deepEqual(v.late_302, [{ trial: 2, late_ms: 210 }]);
  assert.equal(v.misses, 1, "the lane's miss, listed apart as #302");
  // the last run late: #302 only once the next before-read comes, so the stop rule waits for it (`hopeful`)
  const open = judgeSettleSeries([...passes(0, 29), run(29)], { need: 30 });
  assert.equal(open.reached, false);
  assert.deepEqual(open.judged.at(-1), { trial: 29, cls: 'pending', late_ms: 210 });
  assert.equal(open.hopeful.at(-1), true);
  assert.equal(open.oks.at(-1), false);
  // a run after the series on the same page settles it (a stored record's next cell)
  assert.equal(judgeSettleSeries([...passes(0, 29), run(29)], { need: 30, next: run(30, { ok: true }) }).reached, true);
  assert.equal(judgeSettleSeries(passes(0, 3).map((r) => ({ ...r, ok: false, scene: 'chrome-input' })), { need: 30, max: 60 }).lost, false, '57 runs still to go');
  // a search lane keeps the lane's own rule: #302 is the shipped lane's
  const searched = judgeSettleSeries([...passes(0, 2), run(2), ...passes(3, 28)].map((r) => ({ ...r, lane: 'settle-100' })), { need: 30 });
  assert.equal(searched.streak, 28);
  assert.deepEqual(searched.late_302, []);
});

test('ruling 707: an honest miss breaks the streak in every cell, and a later streak covers it', () => {
  for (const scene of ['electron-input', 'chrome-input']) {
    const at = (rows) => rows.map((r) => ({ ...r, scene, cell: `${scene} press_key background` }));
    for (const [name, miss] of Object.entries({
      'a refusal': run(0, { answers: [{ ok: false, error: 'x' }] }),
      'an invalid run': run(0, { invalid: 'the bus connection closed' }),
      'a late key-up outside #302 (its desktop changed)': run(0, { desktop_clean: false }),
      'a key-down with no key-up within the late bound: a partial effect': run(0, { late_ms: null }),
    })) {
      const v = judgeSettleSeries(at([miss, ...passes(1, 30)]), { need: 30 });
      assert.equal(v.reached, true, `${scene}: ${name}`);
      assert.equal(v.judged[0].cls, 'fail', `${scene}: ${name}`);
      assert.deepEqual(v.false_ok, [], `${scene}: ${name}`);
      assert.equal(judgeSettleSeries(at([...passes(0, 10), miss, ...passes(11, 20)].map((r, i) => ({ ...r, trial: i }))), { need: 30 }).reached, false, `${scene}: ${name}, too late to recover`);
    }
  }
});

test("ruling 650's hard failure, in every cell: an ok with no effect fails the series whatever streak follows", () => {
  // every answer ok, the reading as it was before, nothing late: the input had no effect
  const noEffect = (trial) => run(trial, { late_ms: null, after: keys(trial, trial) });
  for (const scene of ['electron-input', 'chrome-input', 'gedit-text']) {
    const v = judgeSettleSeries([noEffect(0), ...passes(1, 30)].map((r) => ({ ...r, scene })), { need: 30 });
    assert.equal(v.streak, 30, scene);
    assert.equal(v.reached, false, scene);
    assert.equal(v.lost, true, `${scene}: nothing after it can pass the series, so it stops`);
    assert.deepEqual(v.false_ok, [{ trial: 0, cls: 'false ok', why: 'answered ok with no effect' }], scene);
  }
  // in a search lane too: a step whose input had no effect never holds
  assert.equal(judgeSettleSeries([noEffect(0), ...passes(1, 30)].map((r) => ({ ...r, lane: 'settle-25' })), { need: 30 }).reached, false);
  // the menu control's expected menuUnconfirmed is no ok: an honest answer, whatever it shows
  const control = run(0, { answers: [{ ok: false, error: 'showContextMenu was sent and no menu was seen within 1 s' }], expected_error: true, late_ms: null, after: keys(0, 0), scene: 'chrome-input' });
  assert.deepEqual(judgeSettleSeries([control, ...passes(1, 30)], { need: 30 }).false_ok, []);
  // a partial effect is no false ok: a landing miss (ruling 650), which a later streak covers
  const partialScroll = { ...run(0, { late_ms: null }), scene: 'firefox-input', input: 'scroll', before: { wheels: 138, scroll: 0 }, after: { wheels: 140, scroll: 414 } };
  assert.equal(judgeSettleSeries([partialScroll, ...passes(1, 30)], { need: 30 }).reached, true);
});

// ---------------------------------------------------------------------------------------------------------------
// the stored records

/** A stored settle record judged again through the lane's own judge: every series rebuilt from its runs, then the sitting. */
function judgeRecord(rows, { foreign = [], watchdog = { clean: true } } = {}) {
  const runs = rows.filter((r) => r.kind === 'settle-run');
  const meta = rows.find((r) => r.kind === 'meta');
  // the cells the record's candidate planned: the menu_unconfirmed control came with candidate 3 (Decision Log, T18
  // gate: a requested context menu is confirmed)
  const controlled = rows.some((r) => r.kind === 'settle-series' && r.input === 'menu_unconfirmed');
  const planned = cellsFor({ families: meta.families, kinds: meta.kinds, routes: meta.routes }).filter((c) => controlled || c.kind !== 'menu_unconfirmed');
  const series = rows.filter((r) => r.kind === 'settle-series').map((s) => {
    const mine = runs.filter((r) => r.cell === s.cell && r.lane === s.lane && r.load === s.load);
    const last = runs.indexOf(mine.at(-1));
    // the next timed run on the same page after the series, as the record shows it (another cell's first)
    const next = runs.slice(last + 1).find((r) => r.scene === s.scene);
    const judged = judgeSettleSeries(mine, { need: s.need, next });
    return { ...s, runs: judged.runs, misses: judged.misses, streak: judged.streak, reached: judged.reached, late_302: judged.late_302, false_ok: judged.false_ok, judged: judged.judged };
  });
  const skipped = rows.filter((r) => r.kind === 'settle-skipped').flatMap((k) => planned.filter((c) => FAMILY_SCENES[k.family].includes(c.scene)).map((c) => ({ cell: cellName(c), why: k.why })));
  const audited = meta.lanes.includes('shipped') ? planned.filter((c) => c.route === 'background' && !ACTIVATING.includes(c.kind)).map(cellName) : [];
  return { ...sittingVerdict({ series, cells: planned.map(cellName), search: false, skipped, audits: rows.filter((r) => r.kind === 'settle-audit'), audited, foreign, watchdog }), series };
}
const count302 = (verdict, cell) => verdict.series.find((s) => s.cell === cell).late_302.length;
const BG = 'electron-input press_key background';
const DESK = 'electron-input press_key desktop';

// each stored step as ruled: its #302 runs per Electron press_key cell (m4/gate/README.md, "Steps that passed by a ruling")
const RULED = [
  { candidate: 1, step: 'S1', counts: { [BG]: 10 } },
  { candidate: 2, step: 'S1', counts: { [BG]: 7 } },
  { candidate: 3, step: 'S1', counts: { [BG]: 5 } },
  { candidate: 2, step: 'L3b', counts: { [BG]: 2, [DESK]: 6 } },
  { candidate: 3, step: 'L3b', counts: { [BG]: 1, [DESK]: 9 } },
];

for (const { candidate, step, counts } of RULED) {
  test(`candidate ${candidate}'s ${step}: the lane's judge with #302 passes it, with the ruled counts; the judge before #371 failed it`, () => {
    const rows = gateRows(CANDIDATES[candidate], step);
    const stored = rows.find((r) => r.kind === 'settle-verdict');
    assert.equal(stored.pass, false, 'the gate\'s judge as it ran failed the step');
    assert.ok(stored.failed.every((f) => f.startsWith('electron-input press_key')), stored.failed.join('; '));
    const v = judgeRecord(rows);
    assert.deepEqual(v.failed, []);
    for (const [cell, n] of Object.entries(counts)) assert.equal(count302(v, cell), n, cell);
    assert.match(v.md.find((l) => l.startsWith(`| ${BG} |`)), /#302/, 'listed apart in the summary');
  });
}

// the controls: each edits one stored #302 run the way the ruling must refuse. Under ruling 707 the run is then an
// honest miss, which breaks the streak as in every other cell: the step fails where no 30 consecutive passes remain
// without it, and passes, the run no longer #302, where a later streak covers it. An ok with no effect fails it always.
const first302 = (rows, cell) => rows.find((x) => x.kind === 'settle-run' && x.cell === cell && !x.ok && x.late_ms != null);
const nextRun = (rows, r) => rows.find((x) => x.kind === 'settle-run' && x.cell === r.cell && x.lane === r.lane && x.trial === r.trial + 1);
const HONEST_EDITS = {
  'a lost key-up: the key-down landed, no key-up within the late bound': (r) => Object.assign(r, { late_ms: null }),
  'criterion 1: no key-down in the settle': (r) => { r.after.key_downs = r.before.key_downs; },
  'criterion 2: the key-up already counted, yet not ok': (r) => { r.after.key_ups = r.before.key_ups + 1; },
  'criterion 3: the next before-read still one release short': (r, rows) => { const n = nextRun(rows, r); n.before.key_ups = n.before.key_downs - 1; },
  'a refusal': (r) => { r.answers = [{ ok: false }]; },
  'an invalid run': (r) => { r.invalid = 'the bus connection closed'; },
  'the desktop changed (desktop_clean false)': (r) => { r.desktop_clean = false; },
  'its front window not active (front_active false)': (r) => { r.front_active = false; },
};
const familyOf = (rows) => rows.find((x) => x.kind === 'meta').families.find((f) => f !== 'electron') ?? 'electron';
const dropFamily = (rows, family) => {
  const gone = (x) => ['settle-scene', 'settle-run', 'settle-series', 'settle-audit'].includes(x.kind) && String(x.scene ?? x.cell).startsWith(`${family}-`);
  for (let i = rows.length - 1; i >= 0; i--) if (gone(rows[i])) rows.splice(i, 1);
};
const RUN_WIDE = {
  'a family skipped as the run records it': (rows) => { const family = familyOf(rows); dropFamily(rows, family); rows.push({ kind: 'settle-skipped', family, why: `${family} did not start` }); },
  "a family's rows simply gone": (rows) => dropFamily(rows, familyOf(rows)),
  'an audit failed': (rows) => { rows.find((x) => x.kind === 'settle-audit' && x.cell === BG).pass = false; },
  "a background cell's audit gone": (rows) => { rows.splice(rows.findIndex((x) => x.kind === 'settle-audit'), 1); },
};

/** Whether 30 consecutive passes remain in a series once its runs of the indexes `missed` are misses: the lane's rule. */
const coversWithout = (judged, missed) => {
  let streak = 0;
  return judged.some((j, k) => (streak = !missed.includes(k) && (j.cls === 'pass' || j.cls === '#302') ? streak + 1 : 0) >= 30);
};

for (const { candidate, step, counts } of RULED) {
  test(`candidate ${candidate}'s ${step}: every control the re-judge held is no #302 run, and fails the step unless a later streak covers it`, () => {
    const judge = (edit, options) => {
      const rows = gateRows(CANDIDATES[candidate], step);
      edit(rows);
      return judgeRecord(rows, options);
    };
    const stored = judgeRecord(gateRows(CANDIDATES[candidate], step));
    for (const cell of Object.keys(counts)) {
      const first = first302(gateRows(CANDIDATES[candidate], step), cell);
      const before = stored.series.find((s) => s.cell === cell).judged;
      const index = before.findIndex((j) => j.trial === first.trial);
      for (const [name, edit] of Object.entries(HONEST_EDITS)) {
        const v = judge((rows) => edit(first302(rows, cell), rows));
        const after = v.series.find((x) => x.cell === cell).judged;
        assert.equal(after[index].cls, 'fail', `${cell}: ${name}`);
        assert.ok(count302(v, cell) < counts[cell], `${cell}: ${name}: no longer #302`);
        // the edited run, and for the third criterion the run whose before-read was edited (itself #302 or not)
        const missed = after.map((j, k) => (j.cls !== before[k].cls ? k : null)).filter((k) => k !== null);
        assert.ok(missed.every((k) => k === index || k === index + 1), `${cell}: ${name}: only the edited runs move`);
        assert.equal(v.failed.some((f) => f.startsWith(cell)), !coversWithout(before, missed), `${cell}: ${name}: ${v.failed.join('; ') || 'passed'}`);
      }
      // the hard failure: the key never arrived, every answer ok
      const v = judge((rows) => { const r = first302(rows, cell); Object.assign(r, { late_ms: null, after: { ...r.before } }); });
      assert.ok(v.failed.includes(`${cell} (shipped): 1 of ${before.length} runs answered ok with no effect (trial ${first.trial})`), `${cell}: ok with no effect: ${v.failed.join('; ')}`);
    }
    for (const [name, edit] of Object.entries(RUN_WIDE)) assert.notDeepEqual(judge(edit).failed, [], name);
    assert.match(judge(() => {}, { foreign: ['the harness: 0x00a00003 ConfigureWindow (raised)'] }).failed.join(), /a window the experiment did not open was changed/);
    assert.match(judge(() => {}, { watchdog: { clean: false, reason: 'it stalled for 2.1 s' } }).failed.join(), /watchdog: it stalled/);
  });
}

test("candidate 2's L3c: its scroll that took two of three wheel steps is a landing miss, not a false ok, so the step stands", () => {
  const v = judgeRecord(gateRows(CANDIDATES[2], 'L3c'));
  assert.deepEqual(v.failed, []);
  const s = v.series.find((x) => x.cell === 'firefox-input scroll dedicated');
  assert.deepEqual(s.false_ok, []);
  assert.equal(s.judged.filter((j) => j.cls === 'fail').length, 1);
});
