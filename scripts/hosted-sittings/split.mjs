// Ruling 1227, refined by 1228 (E): sitting C split into one job per run number (C-1, C-2, C-3) and a final judging job.
// The judge job reads the run jobs' artifacts and refuses to judge jobs that ran more than one harness commit, vendor
// version or cua engine version (a pair is compared only with its own run's, but the three runs must be one sitting),
// or two jobs of one run number; beneath filtered reruns (../native-matrix/combine.mjs) a full run of another commit is
// allowed, but no full run job over it. Each job's runner (image, VM, attempt) and hardware are recorded, so venue
// variance shows. A job is re-run only after a recorded infrastructure or harness stop, never for its verdict: every
// attempt the judge is handed is listed.

// The save-sheet cell's id in a filter: its steps run only when it is listed (a filtered run job, ./plan.mjs).
export const SAVE_SHEET_CELL = 'textedit/intervention.saveSheet';

const MATRIX = ({result}) => result?.cell === 'matrix';
const engineOf = r => r.result.lanes?.[0]?.engine ?? null;
// One job's identity as its matrix records name it. -> {dir, runs, runId, attempt, planIds, image, vm, hardware, commit, vendor, cua}.
function jobOf({dir, results, hardware = null}) {
  const matrix = results.filter(MATRIX), first = matrix[0]?.result.meta ?? {};
  const one = values => [...new Set(values.filter(v => v !== undefined && v !== null))];
  const runner = first.runner ?? {};
  return {dir, runs: one(matrix.map(r => r.result.meta?.run)).sort((a, b) => a - b), runId: runner.run?.id ?? null, attempt: runner.run?.attempt ?? null,
    planIds: one(matrix.map(r => r.result.meta?.planId)), image: runner.image ? `${runner.image.name} ${runner.image.version}` : null, vm: runner.vm?.id ?? null, hardware,
    commit: one(matrix.map(r => r.result.meta?.commit)), vendor: one(matrix.filter(r => engineOf(r) === 'vendor').map(r => r.result.lanes[0].version)),
    cua: one(matrix.filter(r => engineOf(r) === 'cua').map(r => r.result.meta?.runner?.engine?.engineVersion ?? r.result.lanes[0].version))};
}

// `jobs`: [{dir, results: [{result}], hardware}] of the run jobs; `base`: the full run beneath filtered reruns, or null.
// -> {refused: [why], jobs: [jobOf], base: jobOf | null}.
export function jobsCheck(jobs, {base = null} = {}) {
  const read = jobs.map(jobOf), under = base ? jobOf(base) : null, refused = [];
  const differ = (label, pick) => {
    const seen = read.flatMap(j => pick(j).map(v => [v, j.dir]));
    if (new Set(seen.map(([v]) => v)).size > 1) refused.push(`the jobs ran more than one ${label}: ${seen.map(([v, dir]) => `${v} (${dir})`).join(', ')}`);
  };
  differ('harness commit', j => j.commit);
  differ('vendor version', j => j.vendor);
  differ('cua engine version', j => j.cua);
  const byRun = new Map();
  for (const j of read) for (const run of j.runs) byRun.set(run, [...(byRun.get(run) ?? []), j.dir]);
  for (const [run, dirs] of byRun) if (dirs.length > 1) refused.push(`run ${run} was run by more than one job (${dirs.join(', ')}): hand the judge one attempt of each`);
  if (under) for (const j of read.filter(x => x.planIds.includes('full'))) refused.push(`${j.dir} is a full run job over a full run beneath it: only filtered reruns combine with one`);
  return {refused, jobs: read, base: under};
}

// The jobs as the sitting report lists them: each job's runs, run id and attempt, runner and hardware, and why the judge
// refused, when it did. -> [line].
export function renderJobs(check) {
  if (!check) return [];
  const hardware = h => (h ? Object.entries(h).map(([k, v]) => `${k} ${v}`).join(', ') : 'unread');
  return ['## The run jobs (ruling 1228)', '', '| job | runs | run id | attempt | image | VM | hardware |', '|---|---|---|---|---|---|---|',
    ...[...(check.base ? [{...check.base, dir: `${check.base.dir} (beneath)`}] : []), ...check.jobs].map(j => `| ${j.dir} | ${j.runs.join(', ')} | ${j.runId} | ${j.attempt} | ${j.image ?? '-'} | ${j.vm ?? '-'} | ${hardware(j.hardware)} |`),
    '', ...(check.refused.length ? [`Refused to judge: ${check.refused.join('; ')}.`, ''] : [])];
}
