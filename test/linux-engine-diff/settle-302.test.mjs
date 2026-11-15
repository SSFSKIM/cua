// #371: #302 in the settle lane's own judge (M5, T2). An Electron page's key release can reach the tree after
// press_key's settle; a run that shows only that counts toward its series' streak and is listed apart, and a lost key, a
// refusal or an invalid run still fails. The fixtures are the stored S1 and L3b records the design session ruled on
// (sminos 659, 682), and the negative controls are the ones m4/gate/scripts/rejudge-302*-controls.mjs held.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACTIVATING, CELLS, EXPECTED_REFUSALS, FAMILY_SCENES, SCENES, SETTLE_READINGS, cellName, cellsFor, expectsRefusal, judgeSettleSeries, judgesLateKeyUp, lateKeyUpMiss, sittingVerdict,
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
  for (const scene of ['electron-input', 'chrome-input', 'gedit']) {
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
  // an ok on another target is hard too (ruling 650): the requested effect unlanded, and the readings show it elsewhere
  const page = (over = {}) => ({ downs: 0, ups: 0, drags: 0, clicks: 0, context: 0, context_on: 'none', key_downs: 0, key_ups: 0, ...over });
  const wrong = (input, before, after, sent = {}, scene = 'electron-input') => ({ ...run(0, { late_ms: null, before, after }), scene, input, sent });
  const elsewhere = {
    "a right click whose context event named another button": wrong('right_click', page(), page({ context: 1, context_on: 'native' })),
    "a named context action that reached another button than it named": wrong('secondary_action', page(), page({ context: 1, context_on: 'menu' }), { action: 'showContextMenu', on: 'native' }),
    'a coordinate click whose press missed the pad': wrong('click', page(), page({ ups: 1 })),
    "an element's click that reached the pad instead": wrong('click_element', page(), page({ downs: 1, ups: 1 })),
    "an editor's click whose caret landed outside the line": wrong('click', { caret: 4 }, { caret: 90 }, { line: [10, 40] }, 'gedit'),
    // the review's finding 2: a key then a click is a click, its caret judged by the line it aimed at
    "a key_click whose caret landed outside the line": wrong('key_click', { caret: 4 }, { caret: 90 }, { line: [10, 40] }, 'kate'),
    "an editor's drag whose selection lies outside the line": wrong('drag', { selection: [0, 0] }, { selection: [60, 80] }, { line: [10, 40] }, 'writer'),
  };
  for (const [name, miss] of Object.entries(elsewhere)) {
    const v = judgeSettleSeries([miss, ...passes(1, 30).map((r) => ({ ...r, scene: miss.scene, input: miss.input }))], { need: 30 });
    assert.equal(v.reached, false, name);
    assert.equal(v.false_ok[0]?.cls, 'false ok', name);
    assert.match(v.false_ok[0].why, /another target/, name);
  }
  // the right button, the right line: a miss there is the effect's size or its time, honest
  // no effect is judged by the kind's own fields: a pad press is no context event, so the right click had none
  assert.match(judgeSettleSeries([wrong('right_click', page(), page({ downs: 1 }))], { need: 30 }).false_ok[0]?.why ?? '', /no effect/, 'the context event never came');
  assert.deepEqual(judgeSettleSeries([wrong('click', { caret: 4 }, { caret: 20 }, { line: [10, 40] }, 'gedit')], { need: 30 }).false_ok, [], 'the caret inside the line');
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
      // the hard failure: the key never arrived, every answer ok; and so when a counter of another kind moved (the
      // review's finding 1: Blink moves the pointer by itself, so the page's moves can rise with no input of the kind)
      for (const [name, after] of [['the reading unchanged', (b) => ({ ...b })], ['its moves risen, its keys not', (b) => ({ ...b, moves: b.moves + 1 })]]) {
        const v = judge((rows) => { const r = first302(rows, cell); Object.assign(r, { late_ms: null, after: after(r.before) }); });
        assert.ok(v.failed.includes(`${cell} (shipped): 1 of ${before.length} runs were a false ok (trial ${first.trial}: answered ok with no effect)`), `${cell}: ok with no effect, ${name}: ${v.failed.join('; ')}`);
      }
    }
    for (const [name, edit] of Object.entries(RUN_WIDE)) assert.notDeepEqual(judge(edit).failed, [], name);
    assert.match(judge(() => {}, { foreign: ['the harness: 0x00a00003 ConfigureWindow (raised)'] }).failed.join(), /a window the experiment did not open was changed/);
    assert.match(judge(() => {}, { watchdog: { clean: false, reason: 'it stalled for 2.1 s' } }).failed.join(), /watchdog: it stalled/);
  });
}

test("the menu control: an ok where it expects menuUnconfirmed fails the series after 30 good runs, whatever its effect reads", () => {
  const CONTROL = 'electron-input menu_unconfirmed background';
  const stored = () => gateRows(CANDIDATES[3], 'L3b').filter((r) => r.kind === 'settle-run' && r.cell === CONTROL);
  const good = stored();
  assert.equal(good.length, 30);
  assert.ok(good.every((r) => r.ok && r.expected_error && r.answers[0].ok === false), 'the stored runs: each answered menuUnconfirmed');
  assert.equal(judgeSettleSeries(good, { need: 30 }).reached, true);
  // one stored run edited into an unexpected ok: the engine answered ok, and the cell's flag still says it expects an error
  const unexpected = (edit) => {
    const r = stored()[0];
    Object.assign(r, { ok: false, landed: false, late_ms: null, answers: [{ ok: true }] });
    edit(r);
    return [r, ...good.map((g, i) => ({ ...g, trial: i + 1 }))];
  };
  const page = (r) => ({ ...r.before, context: r.before.context + 1 });
  // the page cancels the menu the control asks for, so an ok claims a menu that never appeared: hard whatever the
  // reading shows (the coordinator's ruling, fix 6), the reading's detail kept beside it where it shows one
  const control = /^answered ok where the cell expects its refusal \(menuUnconfirmed\): the page cancels the menu/;
  const elsewhere = {
    'an unexpected ok with no effect': [(r) => { r.after = { ...r.before }; }, /no effect/],
    'an unexpected ok on another target, `sent.on` recorded': [(r) => { r.after = { ...page(r), context_on: 'native' }; r.sent = { ...r.sent, on: 'menu' }; }, /another target: the context event reached native, not menu/],
    'an unexpected ok on another target, as a stored row records `sent` (the control aims at the Menu button)': [(r) => { r.after = { ...page(r), context_on: 'native' }; }, /another target: the context event reached native, not menu/],
    'an unexpected ok with its context event on the Menu button': [(r) => { Object.assign(r, { landed: true, after: { ...page(r), context_on: 'menu' } }); }, null],
    'an unexpected ok whose context event came late (the lane looks for none: its answer is not as expected)': [(r) => { Object.assign(r, { late_ms: 240, after: { ...r.before } }); }, null],
    'an unexpected ok on a run the readers could not judge': [(r) => { Object.assign(r, { invalid: 'a reader failed' }); }, null],
    'an ok after the refusal, two answers': [(r) => { r.answers = [{ ok: false, error: good[0].answers[0].error }, { ok: true }]; r.after = { ...page(r), context_on: 'menu' }; r.landed = true; }, null],
  };
  for (const [name, [edit, detail]] of Object.entries(elsewhere)) {
    const v = judgeSettleSeries(unexpected(edit), { need: 30 });
    assert.equal(v.streak, 30, name);
    assert.equal(v.reached, false, name);
    assert.equal(v.lost, true, name);
    assert.equal(v.false_ok[0]?.trial, 0, name);
    assert.match(v.false_ok[0].why, control, name);
    if (detail) assert.match(v.false_ok[0].why, detail, name);
  }
  // the genuine error stays honest whatever its reading shows: its answer is no ok
  const genuine = stored()[0];
  Object.assign(genuine, { ok: false, landed: false, after: { ...genuine.before } });
  const v = judgeSettleSeries([genuine, ...good.map((g, i) => ({ ...g, trial: i + 1 }))], { need: 30 });
  assert.equal(v.reached, true);
  assert.deepEqual(v.false_ok, []);
  assert.equal(v.judged[0].cls, 'fail');
  // through the sitting: the stored step fails by the control's false ok, by name
  const rows = gateRows(CANDIDATES[3], 'L3b');
  const r = rows.find((x) => x.kind === 'settle-run' && x.cell === CONTROL);
  Object.assign(r, { ok: false, landed: false, late_ms: null, answers: [{ ok: true }], after: { ...r.before } });
  assert.ok(judgeRecord(rows).failed.some((f) => f.startsWith(`${CONTROL} (shipped): 1 of 30 runs were a false ok (trial ${r.trial}: answered ok where the cell expects its refusal`)), judgeRecord(rows).failed.join('; '));
  // the refusal's cell alone: another cell's ok is judged by its effect, as before
  assert.equal(judgeSettleSeries([{ ...stored()[0], input: 'secondary_action', cell: 'electron-input secondary_action background', expected_error: undefined, ok: false, landed: true, answers: [{ ok: true }] }, ...good.map((g, i) => ({ ...g, trial: i + 1 }))], { need: 30 }).false_ok.length, 0);
});

test('every expected-error cell, not the menu control alone: an ok among its answers is hard whatever its effect (sminos 715)', () => {
  const unconfirmed = 'showContextMenu was sent and no menu was seen within 1 s; the application may have shown its own menu or ignored the request; read the window before retrying';
  // each kind the table names expects its refusal, and a run answering ok there fails the series after 30 good runs
  for (const kind of Object.keys(EXPECTED_REFUSALS)) {
    assert.equal(expectsRefusal(kind), true, kind);
    const cell = `electron-input ${kind} background`;
    const good = (trial) => ({ ...run(trial, { ok: true, late_ms: null }), cell, input: kind, expected_error: true, answers: [{ ok: false, error: kind === 'menu_unconfirmed' ? unconfirmed : 'its refusal' }] });
    const okRun = { ...good(0), ok: false, landed: true, answers: [{ ok: true }] };
    const v = judgeSettleSeries([okRun, ...Array.from({ length: 30 }, (_, i) => good(i + 1))], { need: 30 });
    assert.equal(v.reached, false, kind);
    assert.match(v.false_ok[0].why, /expects its refusal/, kind);
  }
  assert.equal(expectsRefusal('secondary_action'), false, 'the confirmed cell expects its menu');
  // a row its run marked as an expected-error cell is judged so, whatever its kind
  const marked = { ...run(0, { late_ms: null }), input: 'right_click', expected_error: true, landed: true, answers: [{ ok: true }] };
  assert.match(judgeSettleSeries([marked], { need: 30 }).false_ok[0]?.why ?? '', /^answered ok where the cell expects its refusal \(an error\)/);
});

test('every settle cell kind has its reading judgment: the requested fields, the other-target fields, whether partial', () => {
  const kinds = new Set(CELLS.map((c) => `${SCENES[c.scene].effects} ${c.kind}`));
  // an entry, or each of its actions' (`byAction`)
  const variants = (entry) => (entry.byAction ? Object.entries(entry.byAction) : [['', entry]]);
  for (const k of kinds) {
    const [effects, kind] = k.split(' ');
    const entry = SETTLE_READINGS[effects]?.[kind];
    assert.ok(entry, `${k}: no entry in SETTLE_READINGS, so it cannot be judged`);
    for (const [action, v] of variants(entry)) {
      const name = `${k}${action ? ` ${action}` : ''}`;
      assert.ok(v.requested.length > 0, name);
      assert.ok(v.minimum.length > 0 && v.minimum.every((f) => v.requested.includes(f)), `${name}: the minimum effect is among the requested fields`);
      assert.equal(typeof v.partial, 'boolean', name);
      for (const f of v.elsewhere) assert.ok(!v.requested.includes(f), `${name}: ${f} is requested and elsewhere`);
    }
  }
  // a named action the table does not know is refused too
  assert.throws(() => judgeSettleSeries([{ ...run(0, { late_ms: null }), scene: 'chrome-input', input: 'secondary_action', sent: { action: 'focus' } }], { need: 30 }), /secondary_action's action focus/);
  // no entry the cells do not run
  for (const [effects, byKind] of Object.entries(SETTLE_READINGS)) for (const kind of Object.keys(byKind)) assert.ok(kinds.has(`${effects} ${kind}`), `${effects} ${kind}: no cell runs it`);
  // a cell missing from the table is refused, not judged by its whole reading
  assert.throws(() => judgeSettleSeries([{ ...run(0, { late_ms: null }), scene: 'gedit', input: 'scroll' }], { need: 30 }), /no reading judgment for scroll in an editor scene/);
  // every field the table names is in the stored readings of each scene and kind the gate records hold
  const seen = new Map();
  for (const out of Object.values(CANDIDATES)) {
    for (const step of ['S1', 'S2', 'S3', 'S4', 'L3a', 'L3b', 'L3c', 'L3d', 'L3e']) {
      let rows;
      try { rows = gateRows(out, step); } catch { continue; }
      for (const r of rows) if (r.kind === 'settle-run' && r.before && !r.before.error) seen.set(`${SCENES[r.scene].effects} ${r.input}`, Object.keys(r.before));
    }
  }
  assert.ok(seen.size >= 40, `the stored records hold ${seen.size} judged kinds`);
  for (const [k, fields] of seen) {
    const [effects, kind] = k.split(' ');
    for (const [, v] of variants(SETTLE_READINGS[effects][kind])) for (const f of [...v.requested, ...v.elsewhere]) assert.ok(fields.includes(f), `${k}: ${f} is not in its reading (${fields.join(', ')})`);
  }
});

test("the effect itself, not its delivery, and a named action judged by what it ran (the re-review of fix 7)", () => {
  const page = (over = {}) => ({ moves: 0, downs: 0, ups: 0, drags: 0, key_downs: 0, key_ups: 0, last_key: 'none', scroll: 0, context: 0, context_on: 'none', clicks: 0, pointer_at: [10, 10], wheels: 0, wheel_legacy: 0, ...over });
  const miss = (scene, input, before, after, sent = {}) => ({ ...run(0, { late_ms: null, before, after }), scene, input, sent, cell: `${scene} ${input} background` });
  const goods = (r) => passes(1, 30).map((g) => ({ ...g, scene: r.scene, input: r.input, cell: r.cell }));
  const judgedAs = (r) => {
    const v = judgeSettleSeries([r, ...goods(r)], { need: 30 });
    return { v, why: v.false_ok[0]?.why ?? v.judged[0].why };
  };
  const hard = {
    // Chromium's context menu on the Native button: a click counted instead is another target
    "showContextMenu with no context event and the Press button's click raised": [miss('chrome-input', 'secondary_action', page(), page({ clicks: 1 }), { action: 'showContextMenu', on: 'native' }), /another target: clicks changed/],
    'showContextMenu with nothing changed': [miss('chrome-input', 'secondary_action', page(), page(), { action: 'showContextMenu', on: 'native' }), /no effect/],
    // Gecko's press of the Press button: its click is the effect, a context event another target
    'press with no click': [miss('firefox-input', 'secondary_action', page(), page({ moves: 2 }), { action: 'press' }), /no effect/],
    'press that raised a context event instead': [miss('firefox-input', 'secondary_action', page(), page({ context: 1, context_on: 'press' }), { action: 'press' }), /another target: context changed/],
    // delivery alone: the wheel events came and the page did not move (ruling 650's no scroll)
    'a scroll whose wheel came and whose page stayed at 0': [miss('firefox-input', 'scroll', page({ wheels: 4 }), page({ wheels: 5, wheel_legacy: -120 }), { direction: 'down', steps: 3 }), /no effect/],
    "a drag whose button pressed and released with no drag": [miss('chrome-input', 'drag', page(), page({ downs: 1, ups: 1 })), /no effect/],
    'a move whose motion event came where the pointer already was': [miss('chrome-input', 'move', page(), page({ moves: 1 })), /no effect/],
    "an activation the application reported with no window manager's": [miss('gedit', 'activate_window', { wm: false, active: false }, { wm: false, active: true }), /no effect/],
    'a key-up with no key-down': [miss('chrome-input', 'press_key', page(), page({ key_ups: 1, last_key: 'x' })), /no effect/],
  };
  for (const [name, [r, reason]] of Object.entries(hard)) {
    const { v, why } = judgedAs(r);
    assert.equal(v.reached, false, name);
    assert.equal(v.false_ok.length, 1, `${name}: ${why}`);
    assert.match(why, reason, name);
  }
  // still honest, a later streak covering it: a right-target effect short of the requested one
  const honest = {
    'a scroll that moved the page on too few wheel steps (L3c)': miss('firefox-input', 'scroll', page({ wheels: 138 }), page({ wheels: 140, scroll: 414 }), { direction: 'down', steps: 3 }),
    "a press whose click counted twice": miss('firefox-input', 'secondary_action', page(), page({ clicks: 2 }), { action: 'press' }),
    'a drag counted with its release not': miss('chrome-input', 'drag', page(), page({ downs: 1, drags: 1 })),
  };
  for (const [name, r] of Object.entries(honest)) {
    const { v, why } = judgedAs(r);
    assert.equal(v.reached, true, `${name}: ${why}`);
    assert.deepEqual(v.false_ok, [], name);
  }
});

test("candidate 2's L3c: its scroll that took two of three wheel steps is a landing miss, not a false ok, so the step stands", () => {
  const v = judgeRecord(gateRows(CANDIDATES[2], 'L3c'));
  assert.deepEqual(v.failed, []);
  const s = v.series.find((x) => x.cell === 'firefox-input scroll dedicated');
  assert.deepEqual(s.false_ok, []);
  assert.equal(s.judged.filter((j) => j.cls === 'fail').length, 1);
  assert.match(s.judged.find((j) => j.cls === 'fail').why, /^class never: a partial effect: wheels, wheel_legacy, scroll changed/, 'its kind is partial-capable');
});
