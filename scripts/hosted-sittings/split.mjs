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
