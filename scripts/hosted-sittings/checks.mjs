// How a sitting's step is read once it ran (#117 M5, T10b′), named by the step's `check` (./plan.mjs):
//   exit         exit 0 passes (a command whose status is its verdict: B's diff, D's steps)
//   expect       the exit the step names
//   record       a measurement (A's baseline runs, B's native-mac runs, C's matrix runs): its record (`record`,
//                meta.json or result.json) complete passes whatever the exit, which is the run's own outcome and the
//                judge's to read; a missing or incomplete record is a runtime error, except a run the capture alert
//                stopped (its producer's incompleteCause 'alert', a reset the alert held, or a harness cell the alert
//                guard refused, ruling 1154), which is NO VERDICT. Ruling 1149: the record's engine
//                attestations must be the side's (`engine`, sideAttestation): a side answered on another engine, the cua
//                side on the vendor's above all (state 1), is NO VERDICT naming it, complete or not; a complete record
//                that shows no engine is NO VERDICT too. The reader compares the engine's name only: the version and
//                build are each producer's own check (scripts/native-baseline/engine.mjs engineProblem,
//                scripts/repl-parity/native-mac.mjs laneAttestationProblem), which leaves its record incomplete
//   verdict      a judge (A's comparisons, C's compare, D's #216 witness): the last `VERDICT:` line it printed, PASS,
//                FAIL, NO VERDICT (proof is missing) or OWNER (the owner's calls remain); none printed is a runtime error
//   report       a report-writing step (C's summary): its `report` file written; its exit is the verdict the judge step
//                gives
//   observation  #212's observation-only cell: every run it asked for (`records`) recorded complete, and a sample of
//                `observe` among them holding the observation (the Save panel's structure, panelObserved) passes;
//                samples with no verdict (./native-matrix/front-key.mjs: activation, unread, alert) and none observed is
//                NO VERDICT; a run missing or incomplete is a runtime error whatever it observed (its observations stay in
//                its record, uncertified), and anything else is a driver failure; each run's attestations as `record`'s.
//                Every record is classed before the step's status (recordFinding), by one precedence whatever their order:
//                another engine, then a reset the alert held, then a missing or incomplete run, then a complete run that
//                shows no engine; the other records' findings follow in the reason
//   selection    sitting E's lane: the expected exit, with the judge's own report (`report`, removed before the step,
//                so it is this run's) of `lane` holding an observation of every home (macos-selection.mjs HOMES),
//                each selected as the ref expects (expectedHome): before the flip the vendor's default in every home,
//                on the flip cua's engine on cua's host in the default home and each fallback's own reason elsewhere
//   onboarding   T3b's staged onboarding (sitting D): its record (`record`) judged stage by stage against M4's behaviour
//                (./onboarding-judge.mjs), in ruling 1149's order: a result answered on another engine than the side
//                (`engine`) is NO VERDICT before any FAIL; a missing or incomplete record is NO VERDICT, never a pass
// deps: {exit, logText() (the step's log), readJson(path) (null when unreadable), exists(path)}. -> [status, reason].
import {HOMES} from '../accept/macos-selection.mjs';
import {sampleCause} from '../native-matrix/front-key.mjs';
import {classifyAttestedRecord} from '../probe/lib.mjs';
import {judgeOnboarding} from './onboarding-judge.mjs';

const NO_VERDICT_CAUSES = new Set(['activation', 'unread', 'alert']);
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
// #212's observation: the Save panel's structure as the destination cell read it (probe-plan.mjs savePanelStructure,
// before or after the Go To dialog), at least one element line of it.
const panelObserved = observed => [observed?.before, observed?.after].some(s => s?.count > 0 && Array.isArray(s.lines) && s.lines.length > 0);
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
// A matrix run stopped because the alert guard refused a harness cell (../native-matrix/run.mjs `alertGuardStop`; ruling
// 1154): it never clicked where the alert was, so its proof is missing, not failed. -> the reason, or null.
const guardStopped = (path, record) => (record.meta?.alertGuardStop
  ? `${record.meta.alertGuardStop.cause}: ${path} stopped: the alert guard refused a harness cell (${record.meta.alertGuardStop.detail})` : null);
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
      return held ? ['NO VERDICT', held] : ['FAIL', `runtime error: the run is incomplete (${firstProblem(record)})`];
    }
    if (side) return ['NO VERDICT', side.reason];
    return ['PASS', exit === 0 ? null : `recorded complete; exit ${exit} is the run's own outcome, which its judge reads`];
  },
  verdict(step, {exit, logText}) {
    const verdict = [...String(logText() ?? '').matchAll(VERDICT_LINE)].at(-1)?.[1];
    return verdict ? [verdict, null] : ['FAIL', `runtime error: no verdict printed (exit ${exit})`];
  },
  report: (step, {exit, exists}) => (exists(step.report) ? ['PASS', exit === 0 ? null : `written; exit ${exit} is its verdict, which the judge step gives`]
    : ['FAIL', `runtime error: no report at ${step.report} (exit ${exit})`]),
  observation(step, {exit, readJson}) {
    const runs = step.records.map(path => ({path, record: readJson(path)}));
    const rows = runs.flatMap(({record}) => (record?.rows ?? []).filter(row => row.id === step.observe).map(row => ({...row, hosted: record.meta?.hosted === true})));
    const seen = rows.filter(row => panelObserved(row.outcome?.observed)).length;
    const kept = seen ? `; ${seen} panel observation${seen > 1 ? 's' : ''} kept in the records` : '';
    // Every record classed first, then the step's status by precedence, so the records' order changes nothing.
    const findings = runs.map(run => recordFinding(step, run, exit)).filter(Boolean).sort((x, y) => x.rank - y.rank);
    if (findings.length) {
      const [first, ...others] = findings;
      return [first.status, `${first.reason}${others.length ? `; also: ${others.map(f => f.reason).join('; ')}` : ''}${kept}`];
    }
    const empty = runs.find(run => !(run.record.rows ?? []).some(row => row.id === step.observe));
    if (empty) return ['FAIL', `driver failure: no ${step.observe} sample recorded in ${empty.path}`];
    if (seen) return ['PASS', `the Save panel's structure observed in ${seen} of ${rows.length} samples over ${runs.length} run${runs.length > 1 ? 's' : ''}`];
    const causes = rows.map(row => sampleCause(row));
    if (causes.every(c => c && NO_VERDICT_CAUSES.has(c.category))) {
      const counts = Object.entries(causes.reduce((n, c) => ({...n, [c.category]: (n[c.category] ?? 0) + 1}), {}));
      return ['NO VERDICT', `no sample observed: ${counts.map(([category, n]) => `${category} ${n}`).join(', ')}`];
    }
    return ['FAIL', `driver failure: no observation recorded (${rows.find(row => row.invalid)?.invalid ?? 'no reason recorded'})`];
  },
  onboarding: (step, {exit, readJson}) => judgeOnboarding(readJson(step.record), {path: step.record, exit, engine: step.engine}),
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
