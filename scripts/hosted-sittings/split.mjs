// Ruling 1227, refined by 1228 (E): sitting C split into one job per run number (C-1, C-2, C-3) and a final judging job.
// The judge job reads the run jobs' artifacts and refuses to judge jobs that ran more than one harness commit, vendor
// version or cua engine version (a pair is compared only with its own run's, but the three runs must be one sitting),
// or two jobs of one run number; beneath filtered reruns (../native-matrix/combine.mjs) a full run of another commit is
// allowed, but no full run job over it. Each job's runner (image, VM, attempt) and hardware are recorded, so venue
// variance shows. A job is re-run only after a recorded infrastructure or harness stop, never for its verdict: every
// attempt the judge is handed is listed.

import {readDepartures} from '../native-matrix/departures.mjs';
import {NOT_JUDGED_RULES, notJudgedRuleOf} from '../native-matrix/not-judged.mjs';

// The save-sheet cell's id in a filter: its steps run only when it is listed (a filtered run job, ./plan.mjs).
export const SAVE_SHEET_CELL = 'textedit/intervention.saveSheet';

// The records a run job writes: its matrix lanes, #212's save-sheet cell and the speed-extra cell (F); every one names
// the job's commit and engines, so every one is checked.
const OURS = new Set(['matrix', 'intervention-save-sheet', 'speed-extra']);
const engineOf = r => r.result.lanes?.[0]?.engine ?? null;
// One job's identity as its records name it, its sitting report's save-sheet verdicts (I3 of the split review: a run job
// passes on its harness, its verdicts ride to the judge) and the scenes it brought up (H2: a filtered unit raises its
// own). -> {dir, runs, runId, attempt, planIds, image, vm, hardware, commit, vendor, cua, scenes, saveSheet}.
function jobOf({dir, results, hardware = null, report = null}, scenesOf = () => []) {
  const ours = results.filter(({result}) => OURS.has(result?.cell)), matrix = ours.filter(({result}) => result.cell === 'matrix');
  const first = (matrix[0] ?? ours[0])?.result.meta ?? {};
  const one = values => [...new Set(values.filter(v => v !== undefined && v !== null))];
  const runner = first.runner ?? {};
  const cuaOf = r => `${r.result.meta?.runner?.engine?.engineVersion ?? r.result.lanes[0].version} build ${r.result.lanes[0].build ?? 'unrecorded'}`;
  return {dir, runs: one(ours.map(r => r.result.meta?.run)).sort((a, b) => a - b), runId: runner.run?.id ?? null, attempt: runner.run?.attempt ?? null,
    planIds: one(matrix.map(r => r.result.meta?.planId)), image: runner.image ? `${runner.image.name} ${runner.image.version}` : null, vm: runner.vm?.id ?? null, hardware,
    commit: one(ours.map(r => r.result.meta?.commit)), vendor: one(ours.filter(r => engineOf(r) === 'vendor').map(r => r.result.lanes[0].version)),
    cua: one(ours.filter(r => engineOf(r) === 'cua').map(cuaOf)), scenes: one(ours.flatMap(r => (r.result.meta?.plan ? scenesOf(r.result.meta.plan) : []))),
    saveSheet: (report?.steps ?? []).filter(s => /^save-sheet-/.test(s.id)).map(s => ({id: s.id, status: s.status, reason: s.reason ?? null}))};
}

// `jobs`: [{dir, results: [{result}], hardware, report}] of the run jobs; `base`: the full run beneath filtered reruns,
// or null; `scenesOf`: a recorded plan's scenes (../native-matrix/run.mjs). Ruling 1230: the jobs agree with each other
// on harness commit and engines, and beneath filtered reruns both engines (the vendor's version, cua's engine version
// and build) are the base's exactly; both harness commits are recorded. -> {refused: [why], jobs: [jobOf], base: jobOf |
// null, commits: {jobs, base}}.
export function jobsCheck(jobs, {base = null, scenesOf} = {}) {
  const read = jobs.map(j => jobOf(j, scenesOf)), under = base ? jobOf(base, scenesOf) : null, refused = [];
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
  // The judge runs once the run jobs ended, whatever they did (!cancelled()): a job that stopped on its harness, or wrote
  // no report, is refused by name until it is re-run (the split verification).
  for (const [j, given] of read.map((j, i) => [j, jobs[i]])) {
    const stops = runJobStops(given.report);
    if (stops.length) refused.push(`${j.dir} stopped (${stops.map(s => `${s.id} ${s.status}${s.reason ? `: ${s.reason}` : ''}`).join('; ')}): re-run it before judging`);
  }
  if (under) {
    for (const j of read.filter(x => x.planIds.includes('full'))) refused.push(`${j.dir} is a full run job over a full run beneath it: only filtered reruns combine with one`);
    for (const [label, key] of [['vendor version', 'vendor'], ['cua engine version and build', 'cua']]) {
      for (const j of read) if (j[key].some(v => !under[key].includes(v)) || (j[key].length && under[key].length !== 1)) {
        refused.push(`${j.dir} ran the ${label} ${j[key].join(', ') || 'none'}, the base ${under.dir} ${under[key].join(', ') || 'none'}: a rerun combines only over the same engines (ruling 1230)`);
      }
    }
  }
  return {refused, jobs: read, base: under, commits: {jobs: [...new Set(read.flatMap(j => j.commit))], base: under?.commit ?? null}};
}

// The jobs as the sitting report lists them: each job's runs, run id and attempt, runner and hardware, and why the judge
// refused, when it did. -> [line].
export function renderJobs(check) {
  if (!check) return [];
  const hardware = h => (h ? Object.entries(h).map(([k, v]) => `${k} ${v}`).join(', ') : 'unread');
  const sheet = j => (j.saveSheet?.length ? j.saveSheet.map(s => `${s.id} ${s.status}`).join(', ') : '-');
  return ['## The run jobs (ruling 1228)', '', '| job | runs | run id | attempt | image | VM | hardware | scenes | save sheet |', '|---|---|---|---|---|---|---|---|---|',
    ...[...(check.base ? [{...check.base, dir: `${check.base.dir} (beneath)`}] : []), ...check.jobs].map(j => `| ${j.dir} | ${j.runs.join(', ')} | ${j.runId} | ${j.attempt} | ${j.image ?? '-'} | ${j.vm ?? '-'} | ${hardware(j.hardware)} | ${j.scenes?.join(', ') || '-'} | ${sheet(j)} |`),
    '', ...(check.commits ? [`Harness commits: the jobs ${check.commits.jobs.join(', ') || 'none recorded'}${check.base ? `; the base ${check.commits.base?.join(', ') || 'none recorded'}` : ''}.`, ''] : []),
    ...check.jobs.flatMap(j => (j.saveSheet ?? []).filter(s => s.status !== 'PASS').map(s => `- ${j.dir} ${s.id}: ${s.status}${s.reason ? ` (${s.reason})` : ''}`)),
    ...(check.refused.length ? [`Refused to judge: ${check.refused.join('; ')}.`, ''] : [])];
}

// I3 of the split review: a run job fails only on a harness or infrastructure stop, never on a verdict (its verdicts ride
// in its sitting.json to the judge, saveSheetVerdict): a step whose check found a runtime error, a driver failure, a
// missing or incomplete record or an unconfirmed cleanup, or a step skipped because a step before it stopped. No report
// at all is a stop. -> [{id, status, reason}].
const STOP = /^(runtime error|driver failure|cleanup|the witness tap's record|the diagnostic's record)/;
export function runJobStops(report) {
  if (!report?.steps) return [{id: 'sitting.json', status: 'FAIL', reason: 'the run job wrote no sitting report'}];
  return report.steps.filter(s => s.status === 'SKIP' || (s.status === 'FAIL' && STOP.test(s.reason ?? ''))).map(s => ({id: s.id, status: s.status, reason: s.reason ?? null}));
}

// The judge's save-sheet verdict (I3): every run asked (`runs`, the dispatch's split_runs) on both lanes must have its
// save-sheet step in some run job's report, else NO VERDICT naming it; a step that ended in a harness stop (a runtime
// error, a skip) is a stop, not judged (NO VERDICT), never the cell's FAIL; else the worst the steps recorded, each
// named. `check`: jobsCheck's. -> {verdict, lines}.
export function saveSheetVerdict(check, {runs}) {
  const steps = (check?.jobs ?? []).flatMap(j => (j.saveSheet ?? []).map(s => ({...s, dir: j.dir})));
  const stopped = s => s.status === 'SKIP' || (s.status === 'FAIL' && STOP.test(s.reason ?? ''));
  const missing = runs.flatMap(run => ['vendor', 'cua'].map(engine => `save-sheet-${engine}-${run}`)).filter(id => !steps.some(s => s.id === id));
  const statuses = [...steps.map(s => (stopped(s) ? 'NO VERDICT' : s.status)), ...missing.map(() => 'NO VERDICT')];
  const verdict = ['FAIL', 'NO VERDICT', 'OWNER', 'PASS'].find(v => statuses.includes(v)) ?? 'NO VERDICT';
  return {verdict, lines: [...steps.map(s => `${s.dir} ${s.id}: ${stopped(s) ? 'stopped, not judged' : s.status}${s.reason ? ` (${s.reason})` : ''}`),
    ...missing.map(id => `${id}: not recorded by any run job`)]};
}

// H1: the base read from its committed directory (docs/evidence/…), judged only when every result.json under it is in
// its digests.sha256 (shasum's format, paths relative to the directory) and matches, every listed file is there, and its
// README names the base run id the dispatch gave. `io`: {digests: text | null, readme: text | null, results: [relative
// path of every result.json], sha(path) -> hex | null}. -> [why it refuses].
export function baseCheck(io, {runId}) {
  if (io.digests === null || io.digests === undefined) return ['the base has no digests.sha256: its records cannot be shown to be the base run\'s'];
  const listed = new Map(io.digests.split('\n').map(l => /^([0-9a-f]{64}) [ *](.+)$/.exec(l.trim())).filter(Boolean).map(([, hash, path]) => [path, hash]));
  const out = [];
  for (const path of io.results) if (!listed.has(path)) out.push(`the base's ${path} is not in digests.sha256`);
  for (const [path, hash] of listed) {
    const got = io.sha(path);
    if (got === null) out.push(`the base's ${path}, in digests.sha256, is missing`);
    else if (got !== hash) out.push(`the base's ${path} does not match digests.sha256 (${got.slice(0, 12)}, listed ${hash.slice(0, 12)})`);
  }
  if (!new RegExp(`actions/runs/${String(runId).replace(/\D/g, '')}\\b`).test(io.readme ?? '') || !/^\d+$/.test(String(runId))) out.push(`the base's README does not name run ${runId}: the directory is not that base`);
  return out;
}

// R1 (ruling 1230): the base's stored rows judged by the new judge against its own judgment at its commit (`was`: the
// judge of that commit on the same records), cell by cell. A difference is expected only where this commit's own
// declarations explain it (ruling 1234), never by a list kept beside them:
// - a declared departure (../native-matrix/expected/departures.json) whose row stays judged on both sides and now reads
//   declared;
// - a not-judged rule with a ticket (../native-matrix/not-judged.mjs) whose row leaves the judgment (any verdict, now not
//   judged) and which the rule matches.
// The declaration counts only when it cites its ruling (`ruling`) or already declared the row at the base's commit
// (`declaredAtBase(cell)`): a new entry with no ruling explains nothing. Any other difference refuses the judging, naming
// each cell. -> {differences: [{cell, was, now, expected, by?: {kind, declaration, ticket, ruling, atBase}}], refused: [why]}.
const rowKey = c => `${c.section} ${c.id}`;
const cites = d => typeof d?.ruling === 'string' && /^\d+$/.test(d.ruling);
function explanationOf({cell, was, now}, {departures, rules, declaredAtBase}) {
  const section = cell.slice(0, cell.indexOf(' ')), id = cell.slice(cell.indexOf(' ') + 1);
  const counts = d => cites(d) || declaredAtBase(cell);
  const departure = departures.find(e => rowKey(e) === cell);
  if (departure && was !== 'not judged' && now === 'declared' && counts(departure)) {
    return {kind: 'departure', declaration: departure.decision ?? null, ticket: departure.ticket ?? /#\d+/.exec(departure.decision ?? '')?.[0] ?? null, ruling: departure.ruling ?? null, atBase: !cites(departure)};
  }
  const rule = notJudgedRuleOf({section, id}, rules);
  if (rule && was !== 'not judged' && now === 'not judged' && typeof rule.ticket === 'string' && rule.ticket && counts(rule)) {
    return {kind: 'not judged', declaration: rule.condition, ticket: rule.ticket, ruling: rule.ruling ?? null, atBase: !cites(rule)};
  }
  return null;
}
export function baseRejudge(was, now, {departures = readDepartures(), rules = NOT_JUDGED_RULES, declaredAtBase = () => false} = {}) {
  const before = new Map(was.map(c => [rowKey(c), c.verdict])), after = new Map(now.map(c => [rowKey(c), c.verdict]));
  const differences = [...new Set([...before.keys(), ...after.keys()])].filter(k => before.get(k) !== after.get(k)).map(cell => {
    const d = {cell, was: before.get(cell) ?? 'not judged', now: after.get(cell) ?? 'not judged'};
    const by = explanationOf(d, {departures, rules, declaredAtBase});
    return {...d, expected: by !== null, ...(by ? {by} : {})};
  });
  const unexpected = differences.filter(d => !d.expected);
  return {differences, refused: unexpected.length ? [`the new judge reads the base differently from its own judgment at its commit: ${unexpected.map(d => `${d.cell} ${d.was}, now ${d.now}`).join('; ')}`] : []};
}
const byText = by => `expected: ${by.kind === 'departure' ? 'the declared departure' : `the not-judged rule ${by.declaration}`}, ticket ${by.ticket ?? 'none'}, ${by.atBase ? 'declared at the base\'s commit' : `ruling ${by.ruling}`}${by.kind === 'departure' && by.declaration ? `: ${by.declaration}` : ''}`;
export const renderBaseRejudge = r => (r ? ['## The base re-judged (ruling 1230)', '', `The base's records judged by this commit's judge against the judge of ${r.at ?? 'its commit'} on the same records. A difference is expected only where a declaration of this commit explains it and cites its ruling, or declared the row at the base's commit (ruling 1234).`, '',
  ...(r.differences.length ? r.differences.map(d => `- ${d.cell}: ${d.was}, now ${d.now}${d.by ? ` (${byText(d.by)})` : d.expected ? ' (expected)' : ''}`) : ['- no cell reads differently']), '',
  ...(r.refused.length ? [`Refused to judge: ${r.refused.join('; ')}.`, ''] : [])] : []);

// Ruling 1234: a judge-only dispatch (the workflow's jobs_run_id) judges the run jobs of an earlier run of this
// workflow without re-running them. Before anything is judged: that run is this workflow's in this repo (`pin.repo`),
// completed, at the pinned attempt and drawing commit; every artifact the judge picked is among that run's (the API's
// list: its run id and head commit) and the latest attempt of its run job there, that job (of that attempt) concluded
// success, and its records name that run, that attempt and the drawing commit; the runs, filter and speed_extra this
// dispatch gives are what the records ran (their meta.run, the matrix records' meta.filter as `resolveFilter` resolves
// the dispatch's filter, the save-sheet and speed-extra records being there); and nothing under native/, src/ or
// package.json differs between the drawing and the judging commit (`diff`, the caller's git diff). jobs-check still
// applies as before. `run`, `jobs`, `artifacts`: the API's run, its jobs of every attempt, its artifacts; `picked`:
// [{name, results}] the artifacts the judge took, by artifact name. -> {runId, attempt, workflow, drawing, judging,
// picked: [{run, name, attempt}], compared, refused: [why]}.
export const SOURCE_WORKFLOW = '.github/workflows/m5-sittings.yml';
const RUN_ARTIFACT = /^m5-sitting-c-run-(\d+)-(\d+)$/;
export function sourceRunCheck({run, jobs = [], artifacts = [], picked = [], pin, inputs, resolveFilter, diff, judging}) {
  const id = String(pin.runId), attempt = Number(pin.attempt), refused = [];
  if (String(run?.id) !== id) refused.push(`the API's run is ${run?.id ?? 'none'}, not the pinned ${id}`);
  if (run?.repository?.full_name !== pin.repo) refused.push(`run ${id} is of ${run?.repository?.full_name ?? 'no repository'}, not ${pin.repo}`);
  if (!String(run?.path ?? '').startsWith(SOURCE_WORKFLOW)) refused.push(`run ${id} is of ${run?.path ?? 'no workflow'}, not ${SOURCE_WORKFLOW}`);
  if (run?.status !== 'completed') refused.push(`run ${id} is ${run?.status ?? 'unread'}, not completed`);
  if (Number(run?.run_attempt) !== attempt) refused.push(`run ${id} is at attempt ${run?.run_attempt ?? 'unread'}, not the pinned ${attempt}: an attempt other than the pinned one is not judged`);
  if (run?.head_sha !== pin.commit) refused.push(`run ${id} ran ${run?.head_sha ?? 'no commit'}, not the pinned drawing commit ${pin.commit}`);
  if (!diff?.clean) refused.push(`the drawing commit and the judging commit differ under native, src or package.json${diff?.error ? ` (${diff.error})` : ''}: the jobs ran another harness than this judge reads`);
  let want = null;
  const cells = inputs.only.filter(c => c !== SAVE_SHEET_CELL), wantSheet = !inputs.only.length || inputs.only.includes(SAVE_SHEET_CELL);
  if (cells.length) { try { want = [...resolveFilter(cells)].sort(); } catch (error) { refused.push(`this dispatch's filter does not resolve: ${error.message}`); } }
  const out = [];
  for (const {name, results} of picked) {
    const m = RUN_ARTIFACT.exec(name);
    if (!m) { refused.push(`${name} is not a run job's artifact`); continue; }
    const n = Number(m[1]), at = Number(m[2]);
    out.push({run: n, name, attempt: at});
    const listed = artifacts.find(a => a.name === name);
    if (!listed) refused.push(`${name} is not among run ${id}'s artifacts`);
    else {
      if (String(listed.workflow_run?.id) !== id) refused.push(`${name} is run ${listed.workflow_run?.id ?? 'unknown'}'s artifact, not run ${id}'s`);
      if (listed.workflow_run?.head_sha !== pin.commit) refused.push(`${name} was made at ${listed.workflow_run?.head_sha ?? 'no commit'}, not the pinned drawing commit ${pin.commit}`);
      if (listed.expired) refused.push(`${name} has expired`);
    }
    const latest = Math.max(...artifacts.map(a => RUN_ARTIFACT.exec(a.name)).filter(x => x && Number(x[1]) === n).map(x => Number(x[2])));
    if (latest !== at && Number.isFinite(latest)) refused.push(`run job ${n}'s latest attempt among run ${id}'s artifacts is ${latest}; the judge picked ${at}`);
    if (at > attempt) refused.push(`${name} is of attempt ${at}, past the pinned ${attempt}`);
    const job = jobs.find(j => j.name === `split_run (${n})` && Number(j.run_attempt) === at);
    if (job?.conclusion !== 'success') refused.push(`run job ${n} (attempt ${at}) concluded ${job?.conclusion ?? 'unread'}, not success`);
    const ours = results.filter(r => OURS.has(r.result?.cell));
    const elsewhere = ours.filter(r => String(r.result.meta?.runner?.run?.id) !== id || Number(r.result.meta?.runner?.run?.attempt) !== at);
    if (elsewhere.length) refused.push(`${name}: ${elsewhere.length} record(s) name another run or attempt than ${id} attempt ${at}`);
    const commits = [...new Set(ours.map(r => r.result.meta?.commit))];
    if (commits.length !== 1 || commits[0] !== pin.commit) refused.push(`${name}'s records ran ${commits.join(', ') || 'no commit'}, not the pinned drawing commit ${pin.commit}`);
    if (ours.some(r => r.result.meta?.run !== n)) refused.push(`${name}'s records name another run number than ${n}`);
    // The dispatch's inputs against what the records ran.
    const matrix = ours.filter(r => r.result.cell === 'matrix'), sheet = ours.some(r => r.result.cell === 'intervention-save-sheet'), extra = ours.some(r => r.result.cell === 'speed-extra');
    if (extra !== inputs.speedExtra) refused.push(`${name} ${extra ? 'has' : 'has no'} speed-extra records; this dispatch's speed_extra is ${inputs.speedExtra}`);
    if (sheet !== wantSheet) refused.push(`${name} ${sheet ? 'has' : 'has no'} save-sheet records; this dispatch's filter ${wantSheet ? 'runs' : 'does not run'} the save-sheet cell`);
    if (!inputs.only.length) {
      if (!matrix.length || matrix.some(r => r.result.meta?.planId !== 'full')) refused.push(`${name} is ${matrix.length ? 'a filtered rerun' : 'no matrix run'}; this dispatch's filter is empty`);
    } else if (!cells.length) {
      if (matrix.length) refused.push(`${name} ran matrix cells; this dispatch's filter names the save-sheet cell alone`);
    } else if (want) {
      if (!matrix.length) refused.push(`${name} has no matrix records; this dispatch's filter names ${want.length} matrix cell(s)`);
      for (const r of matrix) {
        const got = [...(r.result.meta?.filter ?? [])].sort();
        if (r.result.meta?.planId !== 'filtered') refused.push(`${name} is a full run job; this dispatch's filter names ${want.length} cell(s)`);
        else if (JSON.stringify(got) !== JSON.stringify(want)) {
          const apart = [...got.filter(c => !want.includes(c)), ...want.filter(c => !got.includes(c))];
          refused.push(`${name} ran the filter of ${got.length} cell(s); this dispatch's filter resolves to ${want.length} (they differ in ${apart.slice(0, 3).join(', ')}${apart.length > 3 ? ', …' : ''})`);
        }
      }
    }
  }
  const handed = [...new Set(out.map(p => p.run))].sort((a, b) => a - b), asked = [...inputs.runs].sort((a, b) => a - b);
  if (JSON.stringify(handed) !== JSON.stringify(asked)) refused.push(`the judge was handed runs ${handed.join(', ') || 'none'}; this dispatch's runs are ${asked.join(', ')}`);
  return {runId: id, attempt, workflow: SOURCE_WORKFLOW, status: run?.status ?? null, drawing: pin.commit, judging, picked: out.sort((a, b) => a.run - b.run),
    compared: 'the runs, filter and speed_extra against the run jobs\' own records (meta.run, the matrix records\' meta.filter, the save-sheet and speed-extra records)', refused: [...new Set(refused)]};
}
export const renderSourceRun = r => (r ? ['## The source run (a judge-only dispatch, ruling 1234)', '',
  `- source run: ${r.runId}, attempt ${r.attempt} (${r.workflow}, ${r.status ?? 'unread'})`, `- drawing commit (the run jobs'): ${r.drawing}`, `- judging commit (this judge's): ${r.judging}`,
  ...r.picked.map(p => `- run ${p.run}: ${p.name}, attempt ${p.attempt}`), `- compared: ${r.compared}`, '',
  ...(r.refused.length ? [`Refused to judge: ${r.refused.join('; ')}.`, ''] : [])] : []);
