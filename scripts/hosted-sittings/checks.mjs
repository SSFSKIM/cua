// How a sitting's step is read once it ran (#117 M5, T10b′), named by the step's `check` (./plan.mjs):
//   exit         exit 0 passes (a command whose status is its verdict: B's native-mac runs and diff, D's steps)
//   expect       the exit the step names
//   record       a measurement (A's baseline runs, C's matrix runs): its record (`record`, meta.json or result.json)
//                complete passes whatever the exit, which is the run's own outcome and the judge's to read; a missing
//                or incomplete record is a runtime error
//   verdict      a judge (A's comparisons, C's compare): the last `VERDICT:` line it printed, PASS, FAIL, NO VERDICT
//                (proof is missing) or OWNER (the owner's calls remain); none printed is a runtime error
//   report       a report-writing step (C's summary): its `report` file written; its exit is the verdict the judge step
//                gives
//   observation  #212's observation-only cell: a sample of `observe` that recorded the observation (the Save panel's
//                structure) or ran through passes; samples with no verdict (./native-matrix/front-key.mjs: activation,
//                unread, alert) and none observed is NO VERDICT; anything else is a driver failure
//   selection    sitting E's lane: the expected exit, with the judge's own report (`report`, removed before the step,
//                so it is this run's) of `lane` showing its default home's selection: before the flip the vendor's
//                engine on the vendor's host, on the flip cua's on cua's
// deps: {exit, logText() (the step's log), readJson(path) (null when unreadable), exists(path)}. -> [status, reason].
import {sampleCause} from '../native-matrix/front-key.mjs';

const NO_VERDICT_CAUSES = new Set(['activation', 'unread', 'alert']);
const VERDICT_LINE = /^VERDICT: (PASS|FAIL|NO VERDICT|OWNER)\b/gm;
const firstProblem = record => record.error ?? record.problems?.[0] ?? 'no reason recorded';
const noRecord = (path, exit) => ['FAIL', `runtime error: no record at ${path} (exit ${exit})`];

export const CHECKS = Object.freeze({
  exit: (step, {exit}) => (exit === 0 ? ['PASS', null] : ['FAIL', null]),
  expect: (step, {exit}) => (exit === step.expect ? ['PASS', null] : ['FAIL', `exit ${exit}, expected ${step.expect}`]),
  record(step, {exit, readJson}) {
    const record = readJson(step.record);
    if (!record) return noRecord(step.record, exit);
    if (record.complete !== true) return ['FAIL', `runtime error: the run is incomplete (${firstProblem(record)})`];
    return ['PASS', exit === 0 ? null : `recorded complete; exit ${exit} is the run's own outcome, which its judge reads`];
  },
  verdict(step, {exit, logText}) {
    const verdict = [...String(logText() ?? '').matchAll(VERDICT_LINE)].at(-1)?.[1];
    return verdict ? [verdict, null] : ['FAIL', `runtime error: no verdict printed (exit ${exit})`];
  },
  report: (step, {exit, exists}) => (exists(step.report) ? ['PASS', exit === 0 ? null : `written; exit ${exit} is its verdict, which the judge step gives`]
    : ['FAIL', `runtime error: no report at ${step.report} (exit ${exit})`]),
  observation(step, {exit, readJson}) {
    const record = readJson(step.record);
    if (!record) return noRecord(step.record, exit);
    const hosted = record.meta?.hosted === true;
    const rows = (record.rows ?? []).filter(row => row.id === step.observe);
    if (!rows.length) return ['FAIL', `driver failure: no ${step.observe} sample recorded${record.complete === true ? '' : ` (${firstProblem(record)})`}`];
    const seen = rows.filter(row => row.outcome?.observed || (!row.invalid && row.frontKey && !sampleCause({...row, hosted})));
    if (seen.length) return ['PASS', `observed in ${seen.length} of ${rows.length} samples`];
    const causes = rows.map(row => sampleCause({...row, hosted}));
    if (causes.every(c => c && NO_VERDICT_CAUSES.has(c.category))) {
      const counts = Object.entries(causes.reduce((n, c) => ({...n, [c.category]: (n[c.category] ?? 0) + 1}), {}));
      return ['NO VERDICT', `no sample observed: ${counts.map(([category, n]) => `${category} ${n}`).join(', ')}`];
    }
    return ['FAIL', `driver failure: no observation recorded (${rows.find(row => row.invalid)?.invalid ?? 'no reason recorded'})`];
  },
  selection(step, {exit, readJson}) {
    if (exit !== step.expect) return ['FAIL', `exit ${exit}, expected ${step.expect}`];
    const report = readJson(step.report);
    if (!report) return ['FAIL', `no report at ${step.report}: the exit (${exit}) is not its judge's`];
    if (report.lane !== step.lane) return ['FAIL', `the report is the ${report.lane} lane's, not the ${step.lane} lane's`];
    const home = report.homes?.default;
    const seen = `the default home selects the ${home?.selected ?? 'no'} engine on the ${home?.host?.host ?? 'no'} host`;
    const want = step.expect === 0 ? 'cua' : 'vendor', verdict = step.expect === 0 ? 'PASS' : 'FAIL';
    if (report.verdict !== verdict) return ['FAIL', `the judge's verdict is ${report.verdict}, expected ${verdict}`];
    if (home?.selected !== want || home?.host?.host !== want) return ['FAIL', `${step.expect === 0 ? 'not the flip' : 'not the expected red'}: ${seen}`];
    return ['PASS', `the judge's ${verdict}: ${seen}`];
  },
});
