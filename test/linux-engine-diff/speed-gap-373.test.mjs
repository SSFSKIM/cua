// #373 in the verdict run's own judge (M5, T2; the design session, sminos 666 and 667). activate_window answers only once
// its window is raised (task 63), so the next input cannot reach the window that covered it; the vendor builds answer
// before the raise. Its speed loss is a declared gap with no closing route: **declared gap**, listed apart and never a
// pass, and only while its every other part holds as the vendor builds' do. The fixtures are the stored V3 records of
// candidates 1 and 3, and the controls are the ones m4/gate/scripts/rejudge-gap*-controls.mjs held.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SPEED_GAPS, closesText, declaredSpeedGap } from '../../scripts/linux-engine-diff/deviations.mjs';
import { medianDifferenceInterval } from '../../scripts/linux-engine-diff/events.mjs';
import { rejudge } from '../../scripts/linux-engine-diff/rejudge.mjs';
import { declaredGapVerdict, judgeWithDecisions, lifecycleAudit, planOps, plannedVerdicts } from '../../scripts/linux-engine-diff/run.mjs';
import { stepNamed, verdictOps } from '../../scripts/linux-engine-gate/steps.mjs';
import { renderSummary } from '../../scripts/linux-engine-diff/report.mjs';
import { judgeSceneEnds } from '../../scripts/linux-engine-diff/scene-ended.mjs';
import { runOutcome, verdictLine } from '../../scripts/linux-engine-diff/stats.mjs';
import { CANDIDATES, gateRows } from './gate-rows.mjs';

const VENDORS = ['pinned', 'newest'];

test("the declaration: activate_window's cold and warm requests on the window route, #373, with no closing route", () => {
  for (const series of ['cold', 'warm']) {
    const gap = declaredSpeedGap({ op: 'activate_window', route: 'window', series });
    assert.equal(gap.issue, '#373');
    assert.match(gap.reason, /raise/);
    assert.equal(closesText(gap.closes), 'no closing route; tracked by #373');
  }
  assert.deepEqual([...new Set(SPEED_GAPS.map((g) => g.op))], ['activate_window'], 'the only declared request');
  assert.equal(declaredSpeedGap({ op: 'activate_window', route: 'window', series: 'first' }), null, "the events experiment's series are not the verdict run's");
});

// ---------------------------------------------------------------------------------------------------------------
// the stored records

/**
 * The audits as the run holds them (run.mjs), from the record's audit rows, per engine: `forbidden` the judge's one
 * collection (the requests' names, the foreign changes and the watcher's error), and beside it the engine's own
 * forbidden requests (`sent`), the foreign changes, and whether the audit observed at all (`observed`).
 */
const auditsOf = (rows, scene, op) => Object.fromEntries(rows.filter((a) => a.kind === 'audit' && a.scene === scene && a.op === op).map((a) => {
  const sent = a.forbidden.map((f) => f.what);
  const foreign = a.foreign ?? [];
  const error = typeof a.ancestry === 'string' ? a.ancestry : null;
  return [a.engine, { clean: a.clean, oks: a.oks, answered: a.answered, forbidden: [...new Set([...sent, ...foreign, ...(error ? [error] : [])])], sent, foreign, observed: { traced: a.traced, watched: error === null, error } }];
}));

/** One operation of a stored verdict run judged again as run.mjs judges it: its samples, speed decisions and audits. */
function judgeOp(rows, scene, op) {
  const opRows = rows.filter((r) => r.kind === 'sample' && r.scene === scene && r.op === op && [...VENDORS, 'cua'].includes(r.engine));
  const decided = new Map(rows.filter((d) => d.kind === 'speed-decision' && d.scene === scene && d.op === op && d.candidate === 'cua').map((d) => [`${d.candidate}|${d.series}`, d]));
  const audits = auditsOf(rows, scene, op);
  const verdict = judgeWithDecisions(opRows, { vendors: VENDORS, candidate: 'cua', audits, judgeSpeed: true, noise: medianDifferenceInterval, parity: [] }, decided);
  return { ...verdict, ...(declaredGapVerdict(verdict, { op, candidate: 'cua', rows: opRows, audits }) ?? {}) };
}

/** The verdicts the gate's V3 step owes: its plan as the step's own arguments give it (steps.mjs), cua its one lane. */
const V3_PLANNED = plannedVerdicts(planOps(stepNamed('V3').scenes, verdictOps(stepNamed('V3'))), ['cua']);

/**
 * The stored run's outcome at its finalization (stats.mjs runOutcome, as run.mjs calls it), its activate_window
 * verdicts judged again: what the run would have ended with.
 */
function outcomeOf(rows, { foreign = [], planned = V3_PLANNED } = {}) {
  const verdicts = rows.filter((r) => r.kind === 'verdict').map((v) => (v.op === 'activate_window' && !v.device && v.candidate === 'cua' ? { ...v, ...judgeOp(rows, v.scene, v.op) } : v));
  const faults = rows.find((r) => r.kind === 'prepare-faults');
  return runOutcome(verdicts, { valid: rows.find((r) => r.kind === 'end').valid, faults, foreign, planned });
}

const at = (rows, kind, engine) => rows.filter((x) => x.kind === kind && x.scene === 'chrome-input' && x.op === 'activate_window' && x.engine === engine);
const verdictRow = (rows, op) => rows.find((x) => x.kind === 'verdict' && x.scene === 'chrome-input' && x.op === op && x.candidate === 'cua' && !x.device);

for (const candidate of [1, 3]) {
  test(`candidate ${candidate}'s V3: activate_window is a declared gap, listed apart, and the run passes; the judge before it failed the run`, () => {
    const rows = gateRows(CANDIDATES[candidate], 'V3');
    const end = rows.find((r) => r.kind === 'end');
    assert.deepEqual(end.failed, ['chrome-input activate_window cua'], "the gate's judge as it ran");
    const v = judgeOp(rows, 'chrome-input', 'activate_window');
    assert.equal(v.verdict, 'declared gap');
    assert.equal(v.pass, false, 'never a pass');
    assert.deepEqual(v.reasons, []);
    assert.equal(v.gap.issue, '#373');
    assert.equal(v.declared_gap.length, 2, 'the cold and the warm loss, kept');
    const outcome = outcomeOf(rows);
    assert.deepEqual(outcome.failed, []);
    assert.equal(outcome.code, 0);
    assert.deepEqual(outcome.declared['declared gap'], ['chrome-input activate_window cua']);
    assert.match(verdictLine(outcome), /^no verdict FAIL; declared refusal \(a loss, not a pass\): chrome-input drag cua; .*declared gap \(a loss, not a pass\): chrome-input activate_window cua/);
    if (candidate === 3) assert.match(verdictLine(outcome), /declared unconfirmed \(a loss, not a pass\): chrome-input right_click_fallback cua, chrome-input secondary_action cua/);
  });

  test(`candidate ${candidate}'s V3: every control the re-judge held fails`, () => {
    const opControls = {
      'a missed effect': (r) => { at(r, 'sample', 'cua')[3].effect = false; },
      'a failed answer': (r) => { at(r, 'sample', 'cua')[7].ok = false; },
      "a witness field the vendors' never changed": (r) => { const s = at(r, 'sample', 'cua')[0]; s.witness_changes = [...(s.witness_changes ?? []), { field: 'mapped', t_ms: 3 }]; },
      'an audit request the vendors do not send': (r) => { at(r, 'audit', 'cua')[0].forbidden.push({ what: 'XTEST FakeInput' }); },
      'a foreign change in the audit': (r) => { at(r, 'audit', 'cua')[0].foreign = [{ window: 1 }]; },
      'an audit that did not answer ok': (r) => { at(r, 'audit', 'cua')[0].oks = [true, false]; },
      'no audit of cua': (r) => { r.splice(r.indexOf(at(r, 'audit', 'cua')[0]), 1); },
      "the output differs from the vendor's": (r) => { at(r, 'sample', 'cua')[2].equal = false; },
      // an observer that failed in every lane is no request the vendor builds send too (the review's reproduction)
      "the ancestry watcher failed to start in every lane's audit": (r) => { for (const a of r.filter((x) => x.kind === 'audit' && x.scene === 'chrome-input' && x.op === 'activate_window')) a.ancestry = 'the ancestry watcher did not start: xprobe watch exited 1'; },
      "the ancestry watcher failed in cua's audit alone": (r) => { at(r, 'audit', 'cua')[0].ancestry = 'the ancestry watcher ended before the audit did (exit 1)'; },
      "the trace saw no request in any lane's audit": (r) => { for (const a of r.filter((x) => x.kind === 'audit' && x.scene === 'chrome-input' && x.op === 'activate_window')) a.traced = false; },
    };
    for (const [name, edit] of Object.entries(opControls)) {
      const rows = gateRows(CANDIDATES[candidate], 'V3');
      edit(rows);
      const v = judgeOp(rows, 'chrome-input', 'activate_window');
      assert.equal(v.verdict, 'fail', name);
      assert.ok(outcomeOf(rows).failed.includes('chrome-input activate_window cua'), name);
    }
    const runControls = {
      'another row failing (stands)': (r) => Object.assign(verdictRow(r, 'move'), { verdict: 'fail', pass: false }),
      'preparation failures over the cap': (r) => Object.assign(r.find((x) => x.kind === 'prepare-faults'), { pass: false, reasons: ['chrome-input scroll: 5 of 120 samples resampled or invalid'] }),
      ...(candidate === 3 ? {
        'right_click_fallback stored as fail, not declared unconfirmed': (r) => Object.assign(verdictRow(r, 'right_click_fallback'), { verdict: 'fail', pass: false }),
        'secondary_action stored as fail, not declared unconfirmed': (r) => Object.assign(verdictRow(r, 'secondary_action'), { verdict: 'fail', pass: false }),
      } : {}),
    };
    for (const [name, edit] of Object.entries(runControls)) {
      const rows = gateRows(CANDIDATES[candidate], 'V3');
      edit(rows);
      assert.notDeepEqual(outcomeOf(rows).failed, [], name);
    }
    assert.notDeepEqual(outcomeOf(gateRows(CANDIDATES[candidate], 'V3'), { foreign: ['the harness: 0x00a00003 ConfigureWindow (raised)'] }).failed, [], "a change to a window the harness did not open, at the run's cleanup");
    // a planned operation whose rows and verdict are gone (rejudge-gap-c3-controls.mjs): the run's finalization fails it,
    // where an outcome without the plan, the boundary before, passed it
    const gone = gateRows(CANDIDATES[candidate], 'V3').filter((r) => !(r.scene === 'minimized' && r.op === 'minimized_scroll'));
    assert.deepEqual(outcomeOf(gone).failed, ['minimized minimized_scroll cua: no verdict']);
    assert.deepEqual(outcomeOf(gone, { planned: null }).failed, [], 'the boundary before: nothing missed it');
  });
}

test("the verdicts a plan owes: a device case's for cua, a block operation's for each candidate lane, the cases' and their bus trace for cua", () => {
  const plan = [{ scene: 'device-gtk4', op: 'gtk4_click_shared' }, { scene: 'chrome-input', op: 'click' }, { scene: 'chrome-textarea', op: 'focus_change' }];
  assert.deepEqual(plannedVerdicts(plan, ['cua', 'cua:variant']), [
    'device-gtk4 gtk4_click_shared cua', 'chrome-input click cua', 'chrome-input click cua:variant', 'chrome-textarea focus_change cua', 'cases bus_trace cua',
  ]);
  assert.deepEqual(plannedVerdicts([{ scene: 'chrome-input', op: 'click' }], ['cua']), ['chrome-input click cua'], 'no case, no bus trace');
});

test("the run's end carries both: T2's declared losses and planned verdicts beside T4's text windows a lane ended", () => {
  const rows = gateRows(CANDIDATES[3], 'V3');
  const verdicts = rows.filter((r) => r.kind === 'verdict').map((v) => (v.op === 'activate_window' && !v.device && v.candidate === 'cua' ? { ...v, ...judgeOp(rows, v.scene, v.op) } : v));
  const options = { valid: true, faults: rows.find((r) => r.kind === 'prepare-faults'), planned: V3_PLANNED };
  const restart = { kind: 'scene-ended', engine: 'pinned', scene: 'gedit', op: 'type_text', block: 0, i: 1, ended: 'gone', last: { op: 'type_text', block: 0, i: 0 }, restart: { old_pid: 7, new_pid: 8, old_id: 42, new_id: 100, warm_up: null } };
  const outcome = runOutcome(verdicts, { ...options, sceneEnds: judgeSceneEnds([restart], [...VENDORS, 'cua'], VENDORS) });
  assert.equal(outcome.code, 0, outcome.failed.join('; '));
  assert.deepEqual(outcome.declared['declared gap'], ['chrome-input activate_window cua']);
  assert.deepEqual(outcome.sceneEnds, { pinned: 1, newest: 0, cua: 0 });
  const line = verdictLine(outcome);
  assert.match(line, /declared gap \(a loss, not a pass\): chrome-input activate_window cua; .*text windows a lane ended \(a vendor's restarted, never scored\): pinned 1, newest 0, cua 0$/);
  // the summary reads the end row as run.mjs writes it: `declared` and `scene_ends` together
  const end = { kind: 'end', run: 'r', valid: true, pass: outcome.pass, failed: outcome.failed, parity: outcome.parity, refused: outcome.refused, declared: outcome.declared, restores: { pinned: 0, newest: 0, cua: 0 }, scene_ends: outcome.sceneEnds };
  const summary = renderSummary([{ kind: 'meta', run: 'r', engines: [] }, end]);
  assert.match(summary, /\*\*declared gap\*\* \(a loss, not a pass\): chrome-input activate_window cua/);
  assert.match(summary, /text windows a lane ended \(a vendor's restarted, never scored\): pinned 1, newest 0, cua 0/);
  // either side's failure still fails the run: a candidate's ended window, a planned verdict gone
  assert.ok(runOutcome(verdicts, { ...options, sceneEnds: judgeSceneEnds([{ ...restart, engine: 'cua', restart: undefined }], [...VENDORS, 'cua'], VENDORS) }).failed.some((f) => /cua's own gedit window ended/.test(f)));
  assert.deepEqual(runOutcome(verdicts.filter((v) => v.op !== 'minimized_scroll'), { ...options, sceneEnds: judgeSceneEnds([restart], [...VENDORS, 'cua'], VENDORS) }).failed, ['minimized minimized_scroll cua: no verdict']);
});

test("a declared gap's audit observed in every lifecycle: a trace, a watcher, a watcher's error, in any one of them, fails it", () => {
  const rows = gateRows(CANDIDATES[3], 'V3');
  const stored = at(rows, 'audit', 'cua')[0];
  // the stored audit split into two lifecycles (scene-ended.mjs auditInSegments), each judged as run.mjs judges one
  const lifecycle = (over = {}) => ({
    audited: { clean: stored.clean, traced: true, requests: stored.requests / 2, forbidden: stored.forbidden },
    judgedForeign: { foreign: [] },
    ancestry: { watched: true },
    watch: { chain: stored.ancestry },
    ...over,
  });
  const judge = (second) => {
    const { judged } = lifecycleAudit([lifecycle(), lifecycle(second)]);
    const opRows = rows.filter((r) => r.kind === 'sample' && r.scene === 'chrome-input' && r.op === 'activate_window' && [...VENDORS, 'cua'].includes(r.engine));
    const audits = { ...auditsOf(rows, 'chrome-input', 'activate_window'), cua: { oks: stored.oks, answered: stored.answered, ...judged } };
    const verdict = verdictRow(rows, 'activate_window');
    return { judged, gap: declaredGapVerdict({ ...verdict, verdict: 'fail', pass: false, reasons: judgeOp(rows, 'chrome-input', 'activate_window').declared_gap }, { op: 'activate_window', candidate: 'cua', rows: opRows, audits }) };
  };
  const both = judge();
  assert.equal(both.gap.verdict, 'declared gap', 'two lifecycles that each observed');
  assert.deepEqual(both.judged.observed, { traced: true, watched: true, error: null });
  const error = 'the ancestry watcher ended before the audit did (exit 1)';
  for (const [name, second, reason] of [
    ["the second lifecycle's trace with no request of the engine", { audited: { ...lifecycle().audited, traced: false } }, /trace holds no request/],
    ["the second lifecycle's watcher failed", { ancestry: { watched: false, error } }, /window watcher failed \(the ancestry watcher ended/],
    ['the second lifecycle with no watcher', { watch: null }, /window watcher failed/],
  ]) {
    const { judged, gap } = judge(second);
    assert.equal(gap.verdict, 'fail', name);
    assert.ok(gap.reasons.some((r) => reason.test(r)), `${name}: ${gap.reasons.join('; ')}`);
    assert.ok(!judged.sent.includes(error), `${name}: a watcher's error is never an engine request`);
  }
  // the watcher's error stays in the judge's one collection, apart from the engine's requests
  const failed = judge({ ancestry: { watched: false, error } }).judged;
  assert.ok(failed.forbidden.includes(error));
  assert.equal(failed.clean, false);
});

test('the offline re-judge keeps a declared gap while each speed loss is a series it declares', () => {
  const rows = gateRows(CANDIDATES[1], 'V3').map((r) => (r.kind === 'verdict' && r.op === 'activate_window' ? { ...r, ...judgeOp(gateRows(CANDIDATES[1], 'V3'), r.scene, r.op) } : r));
  assert.equal(verdictRow(rows, 'activate_window').verdict, 'declared gap');
  assert.deepEqual(rejudge(rows, 'm4-gate-V3').changed, []);
});

test('a gap covers only its own operation\'s speed: another operation\'s loss, and a reason beside the speed, still fail', () => {
  const rows = gateRows(CANDIDATES[3], 'V3');
  const v = judgeOp(rows, 'chrome-input', 'activate_window');
  const speed = v.declared_gap;
  const base = { verdict: 'fail', pass: false, engines: v.engines };
  assert.equal(declaredGapVerdict({ ...base, reasons: speed }, { op: 'click', candidate: 'cua', rows: [], audits: {} }), null, 'no gap declares a click');
  const opRows = rows.filter((r) => r.kind === 'sample' && r.scene === 'chrome-input' && r.op === 'activate_window');
  const audits = auditsOf(rows, 'chrome-input', 'activate_window');
  const beside = declaredGapVerdict({ ...base, reasons: [...speed, 'cua: the witness changed'] }, { op: 'activate_window', candidate: 'cua', rows: opRows, audits });
  assert.deepEqual(beside.reasons, ['cua: the witness changed']);
  assert.equal(beside.verdict, 'fail');
  assert.equal(declaredGapVerdict({ ...v, verdict: 'pass', pass: true, reasons: [] }, { op: 'activate_window', candidate: 'cua', rows: opRows, audits }), null, 'a pass stays a pass');
});
