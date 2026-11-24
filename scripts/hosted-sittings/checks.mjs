// How a sitting's step is read once it ran (#117 M5, T10b′), named by the step's `check` (./plan.mjs):
//   exit         exit 0 passes (a command whose status is its verdict: B's diff, D's steps)
//   expect       the exit the step names
//   record       a measurement (A's baseline runs, B's native-mac runs, C's matrix runs): its record (`record`,
//                meta.json or result.json) complete passes whatever the exit, which is the run's own outcome and the
//                judge's to read; a missing or incomplete record is a runtime error, except a run the capture alert
//                stopped (its producer's incompleteCause 'alert', a reset the alert held, or a harness cell the alert
//                guard refused, ruling 1154), which is NO VERDICT; a native-mac lane, whose refusal ends only its scene,
//                is NO VERDICT only when every problem it holds is a refusal (guardRefused), its other problems
//                failing it, named. Ruling 1149: the record's engine
//                attestations must be the side's (`engine`, sideAttestation): a side answered on another engine, the cua
//                side on the vendor's above all (state 1), is NO VERDICT naming it, complete or not; a complete record
//                that shows no engine is NO VERDICT too. The reader compares the engine's name only: the version and
//                build are each producer's own check (scripts/native-baseline/engine.mjs engineProblem,
//                scripts/repl-parity/native-mac.mjs laneAttestationProblem), which leaves its record incomplete. Ruling
//                1169: both sides of a pair stand on one frame; a step that names its pair's record (`pair`: the other
//                side's run of the same number) is NO VERDICT, naming the scene and both frames, when the two records
//                launched at or read back different frames (./venue.mjs frameAsymmetry); a pair not recorded changes
//                nothing
//   verdict      a judge (A's comparisons, C's compare, D's #216 witness): the last `VERDICT:` line it printed, PASS,
//                FAIL, NO VERDICT (proof is missing) or OWNER (the owner's calls remain); none printed is a runtime error
//   report       a report-writing step (C's summary): its `report` file written; its exit is the verdict the judge step
//                gives
//   saveSheet    #212's save-sheet cell: every run it asked for (`records`) recorded complete, and each sample of `row`
//                judged as the matrix recorded it (saveSheetRow): a sample with no verdict (front-key.mjs sampleCause:
//                activation, unread, alert, keyWindow) or an invalid one is NO VERDICT naming why; one that passed
//                passes; any other fails, naming its findings (probe-plan.mjs saveSheetFindings, as the row kept them).
//                The step is FAIL when a sample failed, else NO VERDICT when one had none, else PASS; its reason says,
//                for every sample, its status, the run's folder, the unsaved proof and the Go To dialog's close. A run
//                missing or incomplete is a runtime error; each run's attestations as `record`'s. Every record is classed
//                before the samples (recordFinding), by one precedence whatever their order: another engine, then a
//                reset the alert held, then a missing or incomplete run, then a complete run that shows no engine; the
//                other records' findings follow in the reason
//   selection    sitting E's lane: the expected exit, with the judge's own report (`report`, removed before the step,
//                so it is this run's) of `lane` holding an observation of every home (macos-selection.mjs HOMES),
//                each selected as the ref expects (expectedHome): before the flip the vendor's default in every home,
//                on the flip cua's engine on cua's host in the default home and each fallback's own reason elsewhere
//   acceptance   accept-native in sitting D: exit 0 passes; otherwise its report (`record`) is read: a run in which the
//                shared alert guard refused a cell of the TextEdit fixture (`alertGuardStop`, rulings 1154, 1160) is NO
//                VERDICT only when every check not passed is one the fixture itself produces (items 5, 6 and 8:
//                ../accept/textedit.mjs isFixtureCheck) and every other item passed; anything else fails, named
//   onboarding   T3b's staged onboarding (sitting D): its record (`record`) judged stage by stage against M4's behaviour
//                (./onboarding-judge.mjs), in ruling 1149's order: a result answered on another engine than the side
//                (`engine`) is NO VERDICT before any FAIL; a missing or incomplete record is NO VERDICT, never a pass
//   diagnostic   C's key-route diagnostic (ruling 1198, ./key-route.mjs): INFO with what its record (`report`) holds, so
//                it never changes the sitting's verdict, whatever the engines did; a cleanup failure is a FAIL naming
//                each, and a record not written is a FAIL too (its cleanup unconfirmed)
//   witnessTap   R3's witness tap readied before C's matrix runs (ruling 1225, ./witness-tap.mjs): INFO, the tap ready or
//                why not (its cells then NO VERDICT); FAIL when its record is missing or the engines' TCC rows changed
// deps: {exit, logText() (the step's log), readJson(path) (null when unreadable), exists(path)}. -> [status, reason].
import {HOMES} from '../accept/macos-selection.mjs';
import {isFixtureCheck} from '../accept/textedit.mjs';
import {sampleCause} from '../native-matrix/front-key.mjs';
import {saveSheetFindings} from '../native-matrix/probe-plan.mjs';
import {classifyAttestedRecord} from '../probe/lib.mjs';
import {keyRouteSummary} from './key-route-report.mjs';
import {judgeOnboarding} from './onboarding-judge.mjs';
import {frameAsymmetry} from './venue.mjs';
import {witnessTapSummary} from './witness-tap.mjs';

// A sample's causes that leave its proof missing, not failed: the key-window requirement's refusal (keyWindow, ruling
// 1169's addition) among them.
const NO_VERDICT_CAUSES = new Set(['activation', 'unread', 'alert', 'keyWindow']);
// accept-native's items its live TextEdit fixture proves (scripts/accept-native.mjs: 5, 6 and 8), the ones the alert
// guard's refusal there leaves unproven.
const FIXTURE_ITEMS = Object.freeze([5, 6, 8]);
const SOUND = new Set(['PASS', 'INFO']);
const VERDICT_LINE = /^VERDICT: (PASS|FAIL|NO VERDICT|OWNER)\b/gm;
const firstProblem = record => record.error ?? record.problems?.[0] ?? record.refused?.[0] ?? 'no reason recorded';

// Ruling 1149: a run's record against the side the step measures (`step.engine`), by the attestations it keeps
// ({attested, unattested}, scripts/native-baseline/engine.mjs attestEngine): the native baseline's meta.json
// (nativeEngine), the matrix's result.json (meta.nativeEngine), the native-mac suite's meta.json (engineAttestation).
// -> null when the step names no side or the record attests it; else {status, reason}: 'missing' (no engine shown),
// or the side answered on another engine ('vendor-on-cua-side', state 1, or 'mismatched'), classifyAttestedRecord's.
function sideAttestation(step, record) {
  if (!step.engine) return null;
  const kept = record.nativeEngine ?? record.meta?.nativeEngine ?? record.engineAttestation ?? null;
  const {status, problem} = kept ? classifyAttestedRecord(kept, {engine: step.engine}) : {status: 'missing', problem: 'the record keeps no engine attestation'};
  return status === 'ok' ? null : {status, reason: `the ${step.engine} side is not measured: ${problem}`};
}
const answeredElsewhere = side => side !== null && side.status !== 'missing';
// Sitting E: what each home of HOMES must select in the ref the step runs on (src/runtime/launch.mjs nativeEngineFor and
// macosComputerHost). Before the flip the vendor's default holds whatever the home holds; on the flip the default home
// selects cua's engine on cua's host and each fallback keeps the vendor's, engine and host, for its own reason.
const PRE_FLIP = Object.freeze({selected: 'vendor', reason: 'default', host: 'vendor', hostReason: 'macos_native_peer_requires_vendor'});
const expectedHome = (kind, flipped) => (!flipped ? PRE_FLIP : HOMES[kind].expect === 'cua' ? {selected: 'cua', reason: 'default', host: 'cua', hostReason: 'cua_engine'}
  : {selected: 'vendor', reason: HOMES[kind].expect, host: 'vendor', hostReason: HOMES[kind].expect});
const selectionWords = s => `the ${s.selected} engine (${s.reason}) on the ${s.host} host (${s.hostReason})`;
// One of #212's samples as the step reads it (`label` names its engine, run and sample): no verdict for a sampleCause
// the step holds as such or an invalid row, the row's ok otherwise, a failure naming its findings; then what it showed.
// -> {status, text}.
function saveSheetRow(row, label) {
  const o = row.outcome ?? {}, shown = saveSheetShown(o), cause = sampleCause(row);
  // Something saved (a file in the run's folder, after the act or at the cancel, or the document on disk) fails the
  // sample whatever else it shows: an early exit carries no front/key reading, and a save must never read NO VERDICT.
  const saved = [o.destinationFiles, o.cancel?.destinationFiles].some(f => Array.isArray(f) && f.length > 0) || o.unsaved?.document === true;
  if (saved) {
    const findings = Array.isArray(o.findings) && o.findings.length ? o.findings : saveSheetFindings(o, row.engine);
    return {status: 'FAIL', text: `${label} FAIL (${findings.length ? findings.join('; ') : 'something was saved'})${shown}`};
  }
  if (cause && NO_VERDICT_CAUSES.has(cause.category)) return {status: 'NO VERDICT', text: `${label} NO VERDICT (${cause.category}: ${cause.detail ?? 'no detail'})${shown}`};
  if (row.invalid) return {status: 'NO VERDICT', text: `${label} NO VERDICT (${row.invalid})${shown}`};
  if (row.ok === true) return {status: 'PASS', text: `${label} PASS${shown}`};
  const findings = Array.isArray(o.findings) ? o.findings : saveSheetFindings(o, row.engine);
  return {status: 'FAIL', text: `${label} FAIL (${findings.length ? findings.join('; ') : 'ok false, no finding named'})${shown}`};
}
// What a sample kept, each part only when the row holds it: the run's folder (after the act, else as the cancel found
// it), the unsaved proof (AXDocument and AXEdited, or why unread), and the Go To dialog's close in the destination cell
// with the part of its reading that failed.
function saveSheetShown(o) {
  const folder = files => (files.length ? `held ${files.join(', ')}` : 'empty');
  const parts = [];
  if (Array.isArray(o.destinationFiles)) parts.push(`the run's folder ${folder(o.destinationFiles)}`);
  else if (Array.isArray(o.cancel?.destinationFiles)) parts.push(`the run's folder ${folder(o.cancel.destinationFiles)} at the cancel`);
  else if (o.cancel || 'destinationFiles' in o) parts.push('the run\'s folder unread');
  if (o.unsaved?.unread) parts.push(`unsaved unread (${o.unsaved.unread})`);
  else if (o.unsaved) parts.push(`AXDocument ${o.unsaved.document === true ? 'names a file' : o.unsaved.document === false ? 'none' : 'unread'}, AXEdited ${o.unsaved.edited} (${o.unsaved.editedFrom ?? 'unnamed'})`);
  const steps = o.goTo ? [`Escape ${o.goTo.escapes}x`, ...(o.goTo.closeClicked ? ['CloseButton clicked'] : []), ...(o.identification ? [o.identification] : [])].join('; ') : null;
  parts.push(o.goTo ? `Go To ${o.goTo.closed ? 'closed' : 'left up'} (${steps})` : 'Go To not recorded');
  return `; ${parts.join('; ')}`;
}
// A run the matrix stopped because the capture alert held its fixture's reset too (../native-matrix/probe-run.mjs
// resetHeldFixture, `blockedBy: 'alert'`, or `unread` when the alert guard could not read the screen): its proof is
// missing, not failed. -> the reason, or null for any other stop.
const resetBlocked = (path, record) => (record.meta?.fixturesHeld ?? []).some(f => f.reset === false && ['alert', 'unread'].includes(f.blockedBy))
  ? `${path} stopped: a fixture's cleanup the capture alert held could not be reset (${firstProblem(record)})` : null;
// A native-baseline run stopped where it needed its TextEdit in front and found the capture alert there (its producer's
// incompleteCause, ../native-baseline/macos.mjs; pilot A, run 45220897246): no verdict, never a failure (rulings 1136,
// 1141). -> the reason, or null for any other stop.
const alertStopped = (path, record) => (record.incompleteCause?.cause === 'alert'
  ? `alert: ${path} stopped at ${record.incompleteCause.at} with ${record.incompleteCause.front?.bundleId} (pid ${record.incompleteCause.front?.pid}) in front (${firstProblem(record)})` : null);
// A run stopped because the alert guard refused an event (rulings 1154, 1160; ./alert-guard.mjs): the matrix's harness
// cell (../native-matrix/run.mjs, result.json's meta.alertGuardStop), the native baseline's click, key or capture
// (../native-baseline/macos.mjs) or the native-mac lane's action (../repl-parity/native-mac.mjs), both in meta.json's own
// alertGuardStop. It never sent where the alert was, so its proof is missing, not failed. -> the reason, or null.
const guardStopped = (path, record) => {
  const stop = record.meta?.alertGuardStop ?? record.alertGuardStop;
  return stop ? `${stop.cause}: ${path} stopped: the alert guard refused ${stop.at ? `${stop.at}` : 'a harness cell'} (${stop.detail})` : null;
};
// A run whose refusal ended only its scene and went on (the native-mac lane: its refusals kept apart in guardRefused)
// may hold failures of its own beside it: its error and problems. -> those, which the refusal does not excuse.
const besideRefusal = record => (Array.isArray(record.guardRefused) ? [record.error, ...(record.problems ?? [])].filter(Boolean) : []);
const noRecord = (path, exit) => ['FAIL', `runtime error: no record at ${path} (exit ${exit})`];

// One of #212's records against the step (`run` {path, record}), by the step's precedence (`rank`): another engine
// (sideAttestation: NO VERDICT, state 1 above all), a stop the capture alert held (NO VERDICT), a missing or incomplete
// record (FAIL), a complete record that shows no engine (NO VERDICT). -> {rank, status, reason}, or null when the record
// is complete and attests its side.
function recordFinding(step, {path, record}, exit) {
  if (!record) return {rank: 2, status: 'FAIL', reason: `runtime error: no record at ${path} (exit ${exit})`};
  const side = sideAttestation(step, record);
  if (answeredElsewhere(side)) return {rank: 0, status: 'NO VERDICT', reason: `${path}: ${side.reason}`};
  if (record.complete !== true) {
    const held = resetBlocked(path, record) ?? guardStopped(path, record);
    return held ? {rank: 1, status: 'NO VERDICT', reason: held} : {rank: 2, status: 'FAIL', reason: `runtime error: ${path} is incomplete (${firstProblem(record)})`};
  }
  return side ? {rank: 3, status: 'NO VERDICT', reason: `${path}: ${side.reason}`} : null;
}

export const CHECKS = Object.freeze({
  exit: (step, {exit}) => (exit === 0 ? ['PASS', null] : ['FAIL', null]),
  expect: (step, {exit}) => (exit === step.expect ? ['PASS', null] : ['FAIL', `exit ${exit}, expected ${step.expect}`]),
  record(step, {exit, readJson}) {
    const record = readJson(step.record);
    if (!record) return noRecord(step.record, exit);
    const side = sideAttestation(step, record);
    if (answeredElsewhere(side)) return ['NO VERDICT', side.reason];
    if (record.complete !== true) {
      const held = resetBlocked(step.record, record) ?? alertStopped(step.record, record) ?? guardStopped(step.record, record);
      const beside = besideRefusal(record);
      if (held && beside.length) return ['FAIL', `runtime error: the run is incomplete (${beside.join('; ')}); the alert guard also refused ${(record.guardRefused ?? []).join(', ')}`];
      return held ? ['NO VERDICT', held] : ['FAIL', `runtime error: the run is incomplete (${firstProblem(record)})`];
    }
    if (side) return ['NO VERDICT', side.reason];
    const apart = step.pair ? frameAsymmetry(record, readJson(step.pair)) : null;
    if (apart) return ['NO VERDICT', `venue: ${step.record} and its pair ${step.pair} did not stand on one frame (${apart})`];
    return ['PASS', exit === 0 ? null : `recorded complete; exit ${exit} is the run's own outcome, which its judge reads`];
  },
  verdict(step, {exit, logText}) {
    const verdict = [...String(logText() ?? '').matchAll(VERDICT_LINE)].at(-1)?.[1];
    return verdict ? [verdict, null] : ['FAIL', `runtime error: no verdict printed (exit ${exit})`];
  },
  report: (step, {exit, exists}) => (exists(step.report) ? ['PASS', exit === 0 ? null : `written; exit ${exit} is its verdict, which the judge step gives`]
    : ['FAIL', `runtime error: no report at ${step.report} (exit ${exit})`]),
  saveSheet(step, {exit, readJson}) {
    const runs = step.records.map(path => ({path, record: readJson(path)}));
    // Every record classed first, then the step's status by precedence, so the records' order changes nothing.
    const findings = runs.map(run => recordFinding(step, run, exit)).filter(Boolean).sort((x, y) => x.rank - y.rank);
    if (findings.length) {
      const [first, ...others] = findings;
      return [first.status, `${first.reason}${others.length ? `; also: ${others.map(f => f.reason).join('; ')}` : ''}`];
    }
    const empty = runs.find(run => !(run.record.rows ?? []).some(row => row.id === step.row));
    if (empty) return ['FAIL', `driver failure: no ${step.row} sample recorded in ${empty.path}`];
    const judged = runs.flatMap(({path, record}) => record.rows.filter(row => row.id === step.row)
      .map(row => saveSheetRow({...row, hosted: record.meta?.hosted === true}, `${row.engine} ${/run-\d+/.exec(path)?.[0] ?? path} sample ${row.sample}`)));
    const status = ['FAIL', 'NO VERDICT', 'PASS'].find(s => judged.some(j => j.status === s));
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    return [status, `${plural(judged.length, 'sample')} over ${plural(runs.length, 'run')}: ${judged.map(j => j.text).join(' | ')}`];
  },
  onboarding: (step, {exit, readJson}) => judgeOnboarding(readJson(step.record), {path: step.record, exit, engine: step.engine}),
  diagnostic(step, {exit, readJson}) {
    const report = readJson(step.report);
    if (!report) return ['FAIL', `the diagnostic's record ${step.report} was not written (exit ${exit}): its cleanup is unconfirmed`];
    if (report.cleanup?.ok !== true) return ['FAIL', `cleanup: ${(report.cleanup?.failures ?? []).join('; ') || 'not confirmed'}`];
    return ['INFO', `a diagnostic, recorded: ${keyRouteSummary(report)}`];
  },
  // R3's witness tap readied before C's matrix runs (ruling 1225, ./witness-tap.mjs): INFO, the tap ready or why not;
  // FAIL only when its record is missing or its cleanup (the engines' TCC rows unchanged) is not confirmed.
  witnessTap(step, {exit, readJson}) {
    const report = readJson(step.report);
    if (!report) return ['FAIL', `the witness tap's record ${step.report} was not written (exit ${exit})`];
    if (report.cleanup?.ok !== true) return ['FAIL', `cleanup: ${(report.cleanup?.failures ?? []).join('; ') || 'not confirmed'}`];
    return ['INFO', witnessTapSummary(report)];
  },
  acceptance(step, {exit, readJson}) {
    if (exit === 0) return ['PASS', null];
    const report = readJson(step.record), stop = report?.alertGuardStop;
    if (!stop) return ['FAIL', null];
    // Check by check: in the fixture's items only the checks the fixture itself produces may go unproven by its stop, and
    // only as BLOCKED: every way a fixture check is left unrun reads BLOCKED (the refused step, an inventory check of a
    // step never run, an approvals observation not made), so a FAIL is a step that ran and failed. Anything else not
    // passed (a fixture check that failed, a secrets CLI check, a lifecycle observation, another item) is a failure.
    const failures = (report.items ?? []).flatMap(item => (FIXTURE_ITEMS.includes(item.id) && Array.isArray(item.checks)
      ? item.checks.filter(c => !SOUND.has(c.status) && !(c.status === 'BLOCKED' && isFixtureCheck(item.id, c.name))).map(c => `item ${item.id}: ${c.name} ${c.status}`)
      : SOUND.has(item.status) ? [] : [`item ${item.id} ${item.status}`]));
    if (failures.length) return ['FAIL', `${failures.join('; ')}; the alert guard also refused ${stop.at}`];
    return ['NO VERDICT', `${stop.cause}: the alert guard refused ${stop.at} in the TextEdit fixture (${stop.detail}); the fixture's checks in items ${FIXTURE_ITEMS.join(', ')} unproven`];
  },
  selection(step, {exit, readJson}) {
    if (exit !== step.expect) return ['FAIL', `exit ${exit}, expected ${step.expect}`];
    const report = readJson(step.report);
    if (!report) return ['FAIL', `no report at ${step.report}: the exit (${exit}) is not its judge's`];
    if (report.lane !== step.lane) return ['FAIL', `the report is the ${report.lane} lane's, not the ${step.lane} lane's`];
    const flipped = step.expect === 0, verdict = flipped ? 'PASS' : 'FAIL', wrong = flipped ? 'not the flip' : 'not the expected red';
    if (report.verdict !== verdict) return ['FAIL', `the judge's verdict is ${report.verdict}, expected ${verdict}`];
    const homes = report.homes ?? {};
    const unobserved = Object.keys(HOMES).filter(kind => !homes[kind]?.selected || !homes[kind]?.host?.host);
    if (unobserved.length) {
      const problems = unobserved.map(kind => homes[kind]?.problem).filter(Boolean);
      return ['FAIL', `${wrong}: no observation of the ${unobserved.join(', ')} home${unobserved.length > 1 ? 's' : ''}${problems.length ? ` (${problems.join('; ')})` : ''}`];
    }
    for (const kind of Object.keys(HOMES)) {
      const want = expectedHome(kind, flipped), home = homes[kind];
      const seen = {selected: home.selected, reason: home.reason, host: home.host.host, hostReason: home.host.reason};
      if (Object.keys(want).some(key => seen[key] !== want[key])) return ['FAIL', `${wrong}: the ${kind} home selects ${selectionWords(seen)}, not ${selectionWords(want)}`];
    }
    return ['PASS', `the judge's ${verdict}: ${flipped ? `the default home selects ${selectionWords(expectedHome('default', true))}, and each fallback home keeps the vendor's for its reason`
      : `every home (${Object.keys(HOMES).join(', ')}) selects ${selectionWords(PRE_FLIP)}`}`];
  },
});
