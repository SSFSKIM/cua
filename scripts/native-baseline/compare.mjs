// The native baseline's before/after comparison (spec docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// acceptance 8): the vendor REPL host's runs against cua's own host's, on the same machine, runtime release and sample
// plan. Each side is pooled as scripts/native-baseline/summary.mjs pools it; then, per operation:
//   - latency: the candidate's median must be within max(10%, 500 ms) of the baseline's, or faster. The median judged is
//     the harness's wall time (what a model waits); for the cold-connection phases that open the ssh pipe it is net of
//     that side's ssh.roundtrip median, so a slower pipe is not charged to the host. Medians, p95 and max of wall and
//     in-cell time are reported for both sides.
//   - outcome: the candidate succeeds in no smaller share of its valid samples than the baseline; sample counts are
//     kept on both sides.
//   - method cases (method.*): the same observed outcomes sample for sample (what the method did, its error, whether its
//     window survived, whether its text was read back), or the same with some samples strictly better (it returned, its
//     window survived and its text was observed there); and their timing under the same latency rule.
// The ssh pipe itself (ssh.*), approval requests (approval.*; the harness answers at once, so these time the request,
// not a human), the harness's own guards and setup (guard.*, setup.*) and anything only one side has are reported and
// not judged, except that an operation only the candidate has fails when any of its samples failed (the runner writes
// some rows, such as a cold connection's end_task, only on failure). There is no verdict unless each side has three runs, each complete, attested and covering its whole plan
// (summary.mjs coverageProblems), the baseline the vendor host's and the candidate cua's, on a like machine, runtime,
// native service, sandbox policy and plan.
//
// compareSameHost (#115 acceptance 11) judges one host's runs after a change against its runs before it on the same
// machine: the cold first_js rows (SAME_HOST_JUDGED) by the same limit and outcome rule, every other row reported. Each
// side must be a whole, attested triple of one sitting; across the sides everything must match except what the change
// is: the commit, the sitting, and the configuration differences acceptance 11 permits, each recorded in the result
// (`permitted`): the sandbox launcher (the Codex CLI to cua's own or its compat executable), TMPDIR (the caller's to the
// session's own), and on Linux computer sessions the platform-default sandbox mode from disabled to scoped. Only runs of
// the harness's default plan (summary.mjs DEFAULT_PLAN) are acceptance evidence: a comparison of smaller runs is
// labelled DIAGNOSTIC, with the verdict it would have had, and is never a PASS.
//
// compareLanes (#117, docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part 1) judges
// two of the three macOS lanes, each named by its REPL host and native engine, in one of three modes (LANE_MODES): A
// (--engines) the vendor host and engine against the vendor host with cua's engine, B (--hosts) that against cua's host
// and engine, C (--end-to-end) the two ends. Every row is judged as compare() judges it. Each side must be a whole,
// attested triple of its lane (engine attestation included, engine.mjs engineProblem), both sides of one sitting; every
// attested field must be equal across the sides except those the mode names (`differ`), which the result lists with
// both values (`permitted`). A comparison of smaller runs than the default plan is a DIAGNOSTIC, as for the same host.
import {isDeepStrictEqual} from 'node:util';
import {attestation, DEFAULT_PLAN, isDefaultPlan, operationRank, summarize, surfaceOf} from './summary.mjs';
import {comparisonEnvironment, environmentProblems, sameEnvironmentValue} from './environment.mjs';
import {baselineMethodCases} from '../repl-parity/native-linux.mjs';

export const TOLERANCE = {ratio: 0.1, floorMs: 500};
export const latencyLimit = median => median + Math.max(TOLERANCE.ratio * median, TOLERANCE.floorMs);
const NOT_JUDGED = /^(ssh|approval|guard|setup)\./;
const NET_OF_SSH = new Set(['cold.miss.initialize', 'cold.miss.total', 'cold.hit.initialize', 'cold.hit.total']);
const COMPARABLE = {device: 'device', engine: 'native engine', approvedEngine: 'approved engine', release: 'runtime release', hardware: 'hardware', os: 'OS', display: 'display', service: 'native service', sandbox: 'sandbox', plan: 'sample plan'};
const RUNS = 3;
// A row that is part of another's cost: macOS's bind retry (macos.mjs: the vendor's first getApp of a TextEdit it launches
// can hit timeoutReached, and the retry binds). Each side's bind.getApp is judged as the first attempt plus the retry,
// whichever side retried; the retry row stays in the report, not judged.
const FOLDED = {'bind.getApp.retry': 'bind.getApp'};
function foldRetries(runs) {
  return runs.map(run => {
    const rows = run.rows.map(row => ({...row}));
    for (const [retryOp, op] of Object.entries(FOLDED)) for (const retry of rows.filter(r => r.op === retryOp)) {
      const first = rows.find(r => r.op === op && r.sample === retry.sample);
      if (!first) continue;
      const add = key => (first[key] === undefined && retry[key] === undefined ? undefined : (first[key] ?? 0) + (retry[key] ?? 0));
      Object.assign(first, {ok: retry.ok, wallMs: add('wallMs'), inCellMs: add('inCellMs'), retried: true, firstError: first.error ?? null});
      if (retry.ok === true) delete first.error; else first.error = retry.error ?? 'the retry failed';
      if (first.inCellMs === undefined) delete first.inCellMs;
    }
    return {...run, rows};
  });
}
const round = ms => (ms === null || ms === undefined ? null : Math.round(ms * 10) / 10);

// What one side's runs are: their pooled summary, their requested host (when every run agrees on one) and its problems.
function sideOf(label, recorded, expectedHost, usage = 'compare <vendor-dir> <cua-dir>', judgedBy = 'acceptance 8') {
  const runs = foldRetries(recorded);
  const summary = summarize(runs);
  const problems = summary.problems.map(p => `${label}: ${p}`);
  if (runs.length !== RUNS) problems.push(`${label}: ${runs.length} run${runs.length === 1 ? '' : 's'}, ${judgedBy} needs three`);
  const hosts = [...new Set(runs.map(r => r.meta.host))];
  for (const run of runs) if (run.meta.host === undefined) problems.push(`${label}: ${run.name} has no requested host (recorded before host attestation; remeasure it)`);
  const host = hosts.length === 1 ? hosts[0] ?? null : null;
  if (host && host !== expectedHost) problems.push(`the ${label} attests the ${host} host, not ${expectedHost} (${usage})`);
  const ssh = summary.operations.find(o => o.op === 'ssh.roundtrip')?.wall?.median ?? null;
  const methodRows = new Map();
  for (const run of runs) for (const row of run.rows) if (typeof row.op === 'string' && row.op.startsWith('method.')) {
    if (!methodRows.has(row.op)) methodRows.set(row.op, []);
    methodRows.get(row.op).push(row);
  }
  return {label, summary, host, ssh, methodRows, problems, commits: [...new Set(runs.map(r => r.meta.commit))],
    serverInfo: [...new Set(runs.flatMap(r => (r.meta.hostAttestations ?? []).map(a => `${a?.serverInfo?.name ?? '?'} ${a?.serverInfo?.version ?? '?'}`)))]};
}

const valid = f => f.samples - f.invalid;
function figures(o, side, net) {
  if (!o) return null;
  const judgedMs = o.wall ? round(o.wall.median - (net && side.ssh !== null ? side.ssh : 0)) : null;
  return {samples: o.samples, ok: o.ok, invalid: o.invalid.length, errors: o.errors.length, wall: o.wall, inCell: o.inCell, judgedMs};
}

function judgeOperation(op, baseline, candidate) {
  const net = NET_OF_SSH.has(op);
  const b = figures(baseline.summary.operations.find(o => o.op === op), baseline, net);
  const c = figures(candidate.summary.operations.find(o => o.op === op), candidate, net);
  const basis = net ? (baseline.ssh !== null && candidate.ssh !== null ? 'wall median net of ssh.roundtrip median' : 'wall median (no ssh.roundtrip to net out)') : 'wall median';
  const base = {op, kind: 'latency', basis, baseline: b, candidate: c, limitMs: null};
  if (FOLDED[op]) return {...base, basis: null, verdict: 'not judged', reasons: [`counted in ${FOLDED[op]}, the first attempt plus the retry`]};
  // A row the runner writes only on failure (a cold connection's end_task) has no baseline counterpart on a clean
  // baseline: an operation only the candidate has fails when any of its samples failed, and is reported otherwise.
  if (!b) {
    const failed = c.samples - c.ok - c.invalid;
    return {...base, basis: null, verdict: failed ? 'fail' : 'not judged',
      reasons: [failed ? `only the candidate has this operation, and ${failed} of its ${c.samples} samples failed` : 'only the candidate has this operation']};
  }
  if (NOT_JUDGED.test(op)) return {...base, basis: null, verdict: 'not judged', reasons: []};
  if (!c) return {...base, verdict: 'fail', reasons: ['no candidate samples']};
  const reasons = [];
  if (c.ok * valid(b) < b.ok * valid(c)) reasons.push(`${c.ok}/${valid(c)} succeeded, the baseline ${b.ok}/${valid(b)}`);
  let limitMs = null;
  if (b.judgedMs !== null) {
    limitMs = round(latencyLimit(b.judgedMs));
    if (c.judgedMs === null) reasons.push('no successful candidate sample to time');
    else if (c.judgedMs > limitMs) reasons.push(`median ${c.judgedMs} ms is above the limit ${limitMs} ms (baseline ${b.judgedMs} ms + max(10%, 500 ms))`);
  }
  return {...base, limitMs, verdict: reasons.length ? 'fail' : 'pass', reasons};
}

// A method case's observed outcome, one per sample: what the method did, its error, its window's fate, the read-back.
const outcomeOf = row => JSON.stringify(row.ok === true
  ? {outcome: row.outcome ?? null, error: row.methodError ?? null, target: row.target ?? null, inserted: row.inserted ?? null}
  : {harness: row.error ?? 'failed'});
// Strictly better than a failure: the method returned, its window survived and its text was observed there.
const better = row => row.ok === true && row.outcome === 'returned' && row.target === 'survived' && row.inserted === true;
const tally = rows => rows.reduce((m, row) => m.set(outcomeOf(row), (m.get(outcomeOf(row)) ?? 0) + 1), new Map());
const listed = m => [...m].sort(([a], [b]) => a.localeCompare(b)).map(([key, n]) => `${n}x ${key}`);
// The candidate's outcomes are the baseline's, sample for sample, except that some samples may be strictly better.
function methodOutcome(b, c) {
  const bt = tally(b), ct = tally(c);
  if (b.length !== c.length) return `${c.length} candidate samples, the baseline ${b.length}`;
  if (JSON.stringify(listed(bt)) === JSON.stringify(listed(ct))) return null;
  const others = (rows, tallied) => new Map([...tallied].filter(([key]) => !rows.some(r => better(r) && outcomeOf(r) === key)));
  const bOther = others(b, bt), cOther = others(c, ct);
  const contained = [...cOther].every(([key, n]) => n <= (bOther.get(key) ?? 0));
  if (contained && c.filter(better).length > b.filter(better).length) return 'better';
  return `outcome differs: baseline ${listed(bt).join(' | ')}; candidate ${listed(ct).join(' | ')}`;
}
function judgeMethod(op, baseline, candidate, {linux = false} = {}) {
  const b = baseline.methodRows.get(op) ?? [], c = candidate.methodRows.get(op) ?? [];
  const timing = judgeOperation(op, baseline, candidate);
  const base = {...timing, kind: 'method', baseline: timing.baseline && {...timing.baseline, outcomes: listed(tally(b))},
    candidate: timing.candidate && {...timing.candidate, outcomes: listed(tally(c))}};
  if (!b.length) return c.some(r => r.ok !== true) ? {...base, verdict: 'fail', reasons: [`only the candidate has this method case, and ${c.filter(r => r.ok !== true).length} of its ${c.length} samples failed`]}
    : {...base, verdict: 'not judged', reasons: ['only the candidate has this method case']};
  if (!c.length) return {...base, verdict: 'fail', reasons: ['no candidate samples']};
  // A Linux engine comparison's typeText and paste method cases (#171): until M2, exactly M1b's temporary candidate
  // outcome on every cua sample (scripts/repl-parity/expected/native-linux.json baselineMethodCases), and only while no
  // vendor-engine sample succeeded; still timed by the same rule.
  const declared = linux ? baselineMethodCases.find(m => m.op === op) : null;
  if (declared && c.every(r => outcomeOf(r) === JSON.stringify(declared.outcome)) && !b.some(better)) {
    const timed = timing.reasons.filter(r => !/succeeded, the baseline/.test(r));
    return {...base, verdict: timed.length ? 'fail' : 'declared', reasons: [...timed, `M1b's temporary candidate outcome (until ${declared.until}) on all ${c.length} cua samples: ${declared.outcome.outcome}, "${declared.outcome.error}", window ${declared.outcome.target}; the vendor engine's: ${listed(tally(b)).join(' | ')}`]};
  }
  const outcome = methodOutcome(b, c);
  const reasons = [...(outcome && outcome !== 'better' ? [outcome] : []), ...timing.reasons.filter(r => !/succeeded, the baseline/.test(r)),
    ...(outcome === 'better' ? ['better: the method returned, its window survived and its text was read back'] : [])];
  return {...base, verdict: reasons.some(r => !r.startsWith('better')) ? 'fail' : 'pass', reasons};
}

// -> {baseline, candidate, operations, problems, verdict: 'PASS' | 'FAIL' | 'NO VERDICT'} for two sides' runs
// (summary.mjs readRuns), baseline the vendor host's, candidate cua's.
export function compare(baselineRuns, candidateRuns) {
  const baseline = sideOf('baseline', baselineRuns, 'vendor'), candidate = sideOf('candidate', candidateRuns, 'cua');
  const problems = [...baseline.problems, ...candidate.problems, ...environmentProblems([...baselineRuns.map(r=>({...r,name:'baseline '+r.name})), ...candidateRuns.map(r=>({...r,name:'candidate '+r.name}))])];
  const left = attestation(baselineRuns[0].meta), right = attestation(candidateRuns[0].meta);
  for (const [key, label] of Object.entries(COMPARABLE)) if (left[key] !== right[key]) problems.push(`${label} differs (baseline ${left[key] ?? '–'}, candidate ${right[key] ?? '–'})`);
  const ops = [...new Set([...baseline.summary.operations, ...candidate.summary.operations].map(o => o.op))]
    .sort((a, b) => operationRank(a) - operationRank(b) || a.localeCompare(b));
  const operations = ops.map(op => (op.startsWith('method.') ? judgeMethod(op, baseline, candidate) : judgeOperation(op, baseline, candidate)));
  const verdict = problems.length ? 'NO VERDICT' : operations.some(o => o.verdict === 'fail') ? 'FAIL' : 'PASS';
  const describe = (side, a) => ({host: side.host, serverInfo: side.serverInfo, commits: side.commits, runs: side.summary.runs, attestation: a, sshMedianMs: side.ssh});
  return {baseline: describe(baseline, left), candidate: describe(candidate, right), operations, problems, verdict};
}

export const SAME_HOST_JUDGED = ['cold.miss.first_js', 'cold.hit.first_js'];
// The configuration changes acceptance 11 permits between before and after, as {field, baseline, candidate, reason}, and
// the problems for any other: the sandbox mode (Linux computer sessions, platform default, disabled -> scoped), the
// launcher and TMPDIR (the sandbox launch witness, scripts/native-baseline/provenance.mjs sandboxLaunchOf).
const LAUNCHER_MOVES = [['codex-cli', 'cua'], ['codex-cli', 'cua-compat']];
// The per-session TMPDIR is the permitted change whatever the baseline had: a prepared serve starts from `env -i`
// (scripts/native-baseline/remote.mjs nativeEnvironment), so a baseline launch has no TMPDIR at all ('unset'); an
// unprepared one copies the caller's ('inherited').
const TMPDIR_MOVES = [['inherited', 'session'], ['unset', 'session']];
function permittedChanges(before, after) {
  const permitted = [], problems = [];
  const mode = s => (s?.mode ? `${s.mode} (${s.explicit ? 'CUA_SHIM_SANDBOX' : 'platform default'})` : null);
  if (!isDeepStrictEqual(before.sandbox, after.sandbox)) {
    const linuxComputer = before.platform === 'linux' && after.platform === 'linux' && surfaceOf(before) === 'computer' && surfaceOf(after) === 'computer';
    if (linuxComputer && isDeepStrictEqual(before.sandbox, {mode: 'disabled', explicit: false}) && isDeepStrictEqual(after.sandbox, {mode: 'scoped', explicit: false}))
      permitted.push({field: 'sandbox mode', baseline: mode(before.sandbox), candidate: mode(after.sandbox), reason: 'Linux computer sessions default to scoped with the confined kernel (#115), the change being measured'});
    else problems.push(`sandbox differs (baseline ${mode(before.sandbox) ?? '–'}, candidate ${mode(after.sandbox) ?? '–'}); only a Linux computer session's platform default may move from disabled to scoped`);
  }
  const witness = [before.sandboxLaunch, after.sandboxLaunch];
  if (witness.some(w => !w?.launcher || !w?.tmpdir)) problems.push('a side records no sandbox launch witness (launcher and TMPDIR); remeasure it');
  else for (const [field, key, moves, reason] of [['sandbox launcher', 'launcher', LAUNCHER_MOVES, 'cua\'s own launcher replaces the Codex CLI (#115)'],
    ['TMPDIR', 'tmpdir', TMPDIR_MOVES, 'each session gets its own TMPDIR (#115)']]) {
    const [b, c] = witness.map(w => w[key]);
    if (b === c) continue;
    if (moves.some(([x, y]) => x === b && y === c)) permitted.push({field, baseline: b, candidate: c, reason});
    else problems.push(`${field} differs (baseline ${b}, candidate ${c}); only ${moves.map(([x, y]) => `${x} -> ${y}`).join(' or ')} is permitted`);
  }
  return {permitted, problems};
}

// -> compare()'s result for one host's runs before a change (`baselineRuns`) and after it (`candidateRuns`), with
// `mode: 'same-host'`, the permitted differences found (`permitted`) and, for runs of another plan than the default,
// verdict 'DIAGNOSTIC' and `diagnostic: {verdict, reason}` (the verdict the rule gives them, never acceptance).
export function compareSameHost(baselineRuns, candidateRuns) {
  const expected = baselineRuns[0]?.meta?.host ?? null;
  const usage = 'compare --same-host compares one host before and after';
  const baseline = sideOf('baseline', baselineRuns, expected, usage), candidate = sideOf('candidate', candidateRuns, expected, usage);
  const named = (label, runs) => runs.map(r => ({...r, name: `${label} ${r.name}`}));
  const problems = [...baseline.problems, ...candidate.problems,
    ...environmentProblems(named('baseline', baselineRuns)), ...environmentProblems(named('candidate', candidateRuns))];
  for (const [label, runs] of [['baseline', baselineRuns], ['candidate', candidateRuns]])
    for (const run of runs.slice(1)) if (!isDeepStrictEqual(run.meta.sandboxLaunch, runs[0].meta.sandboxLaunch)) problems.push(`${label}: ${run.name} records another sandbox launch witness than ${runs[0].name}`);
  const before = baselineRuns[0].meta, after = candidateRuns[0].meta;
  const left = attestation(before), right = attestation(after);
  for (const [key, label] of Object.entries(COMPARABLE)) if (key !== 'sandbox' && left[key] !== right[key]) problems.push(`${label} differs (baseline ${left[key] ?? '–'}, candidate ${right[key] ?? '–'})`);
  const [envBefore, envAfter] = [before, after].map(comparisonEnvironment);
  for (const key of Object.keys(envBefore)) if (!['sandbox', 'experiment'].includes(key) && !sameEnvironmentValue(key, envBefore[key], envAfter[key])) problems.push(`${key} environment differs between the baseline and the candidate`);
  const changes = permittedChanges(before, after);
  problems.push(...changes.problems);
  const ops = [...new Set([...baseline.summary.operations, ...candidate.summary.operations].map(o => o.op))]
    .sort((a, b) => operationRank(a) - operationRank(b) || a.localeCompare(b));
  const operations = ops.map(op => {
    const judged = judgeOperation(op, baseline, candidate);
    if (!SAME_HOST_JUDGED.includes(op)) return {...judged, limitMs: null, verdict: 'not judged', reasons: []};
    if (!judged.baseline) return {...judged, verdict: 'fail', reasons: ['no baseline samples']};
    return judged;
  });
  for (const op of SAME_HOST_JUDGED) if (!ops.includes(op)) operations.push({op, kind: 'latency', basis: null, baseline: null, candidate: null, limitMs: null, verdict: 'fail', reasons: ['no samples on either side']});
  const ruled = problems.length ? 'NO VERDICT' : operations.some(o => o.verdict === 'fail') ? 'FAIL' : 'PASS';
  const diagnostic = plainPlan([...baselineRuns, ...candidateRuns], ruled);
  const describe = (side, a) => ({host: side.host, serverInfo: side.serverInfo, commits: side.commits, runs: side.summary.runs, attestation: a, sshMedianMs: side.ssh});
  return {mode: 'same-host', baseline: describe(baseline, left), candidate: describe(candidate, right), operations, permitted: changes.permitted, problems,
    verdict: diagnostic ? 'DIAGNOSTIC' : ruled, ...(diagnostic ? {diagnostic} : {})};
}

const plainPlan = (runs, ruled) => {
  const small = runs.filter(r => !isDefaultPlan(r.meta.plan));
  return ruled !== 'NO VERDICT' && small.length
    ? {verdict: ruled, reason: `runs of another plan than the default (${DEFAULT_PLAN.cold} cold, ${DEFAULT_PLAN.samples} warm, ${DEFAULT_PLAN.tasks} tasks) are diagnostics, not acceptance evidence`} : null;
};

// #117's comparisons: each mode's two lanes ({host, engine}, the run's --host and --engine) and the attested fields that
// may differ between them; every other field must be equal.
const VV = Object.freeze({host: 'vendor', engine: 'vendor'}), VC = Object.freeze({host: 'vendor', engine: 'cua'}), CC = Object.freeze({host: 'cua', engine: 'cua'}), CV = Object.freeze({host: 'cua', engine: 'vendor'});
export const LANE_MODES = Object.freeze({
  engines: {id: 'A', title: 'engine and service', flag: '--engines', usage: '<vv-dir> <vc-dir>', baseline: VV, candidate: VC, differ: ['engine', 'service'],
    note: 'The engine is the one variable: cua\'s service loaded in the vendor trusted worker against the vendor\'s, on the vendor host.'},
  hosts: {id: 'B', title: 'host only', flag: '--hosts', usage: '<vc-dir> <cc-dir>', baseline: VC, candidate: CC, differ: ['host', 'sandbox'],
    note: 'The host is the one variable: cua\'s engine under the vendor host against it under cua\'s own host, with the sandbox launch each host makes.'},
  'end-to-end': {id: 'C', title: 'end to end', flag: '--end-to-end', usage: '<vv-dir> <cc-dir>', baseline: VV, candidate: CC, differ: ['host', 'sandbox', 'engine', 'service'],
    note: 'The product verdict: host and engine are two variables at once, so a regression here is located by A and B, not by C.'},
});
// Linux's one comparison (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, The facade suites;
// Acceptance 10): Linux serves one host, cua's own, so the engine is the lanes' one difference until M3 makes cua's
// service the candidate's too.
export const LINUX_LANE_MODES = Object.freeze({
  engines: {id: 'A', title: 'engine (Linux)', flag: '--engines', usage: '<cv-dir> <cc-dir>', baseline: CV, candidate: CC, differ: ['engine'], linux: true,
    note: 'The engine is the one variable: the vendor engine against cua\'s, both driven by the vendor service in cua\'s own host, the only one Linux serves.'},
});
// The operations a Linux computer run's engine answers (each reaches it through the vendor service): on these the Linux
// comparison also fails when cua's median is above the vendor engine's (Acceptance 10). The cold phases, warm.noop and
// the binder's own refusals never reach an engine, so they keep the tolerance rule alone.
export const ENGINE_ANSWERED = Object.freeze(['warm.getState', 'warm.listApps', 'bind.getApp', 'warm.getAXState', 'warm.getScreenshot', 'task.act', 'task.verify', 'task.clear', 'task.total', 'method.typeText', 'method.paste']);
// The attested fields a lane comparison holds equal unless its mode permits them to differ, in report order.
const LANE_FIELDS = {device: 'device', commit: 'commit', host: 'REPL host', engine: 'engine', service: 'native service', sandbox: 'sandbox',
  approvedEngine: 'approved engine', release: 'runtime release', hardware: 'hardware', os: 'OS', display: 'display', plan: 'sample plan'};
// One run's value of a lane field: attestation()'s, but the sandbox also carries the launch witness (launcher, TMPDIR).
function laneValue(meta, key) {
  const a = attestation(meta);
  if (key !== 'sandbox') return a[key] ?? null;
  const launch = meta.sandboxLaunch;
  return `${a.sandbox ?? '–'}, launcher ${launch?.launcher ?? '–'}, TMPDIR ${launch?.tmpdir ?? '–'}`;
}

// -> compare()'s result for the lanes `mode` (a LANE_MODES key) names, with `mode`, `lane` (the mode), `permitted` (each
// field the mode lets differ, {field, label, baseline, candidate, same}) and the DIAGNOSTIC rule of compareSameHost.
export function compareLanes(mode, baselineRuns, candidateRuns) {
  const linux = baselineRuns[0]?.meta?.platform === 'linux';
  const lane = (linux ? LINUX_LANE_MODES : LANE_MODES)[mode];
  if (!lane && linux) throw new Error(`Linux has one host, cua's own, so one lane comparison: compare --engines ${LINUX_LANE_MODES.engines.usage}`);
  if (!lane) throw new Error(`no lane comparison ${mode}; the modes are ${Object.keys(LANE_MODES).join(', ')}`);
  const usage = `compare ${lane.flag} ${lane.usage}`;
  const sides = [['baseline', baselineRuns, lane.baseline], ['candidate', candidateRuns, lane.candidate]].map(([label, runs, expected]) => {
    const side = sideOf(label, runs, expected.host, usage, `comparison ${lane.id}`);
    for (const run of runs) if (!run.meta.nativeEngine) side.problems.push(`${label}: ${run.name} has no requested engine (recorded before engine attestation; remeasure it)`);
    const engines = [...new Set(runs.map(r => r.meta.nativeEngine?.requested).filter(Boolean))];
    if (engines.length > 1) side.problems.push(`${label}: its runs requested ${engines.join(' and ')} engines`);
    else if (engines.length && engines[0] !== expected.engine) side.problems.push(`the ${label} attests the ${engines[0]} engine, not ${expected.engine} (${usage})`);
    side.problems.push(...environmentProblems(runs.map(r => ({...r, name: `${label} ${r.name}`}))));
    for (const run of runs.slice(1)) if (!isDeepStrictEqual(run.meta.sandboxLaunch, runs[0].meta.sandboxLaunch)) side.problems.push(`${label}: ${run.name} records another sandbox launch witness than ${runs[0].name}`);
    return side;
  });
  const [baseline, candidate] = sides;
  const problems = [...baseline.problems, ...candidate.problems];
  const before = baselineRuns[0].meta, after = candidateRuns[0].meta;
  const only = `comparison ${lane.id} permits only ${lane.differ.join(' and ').replace(/ and (?=.* and )/g, ', ')} to differ`;
  for (const [key, label] of Object.entries(LANE_FIELDS)) {
    const [b, c] = [before, after].map(meta => laneValue(meta, key));
    if (!lane.differ.includes(key) && b !== c) problems.push(`${label} differs (baseline ${b ?? '–'}, candidate ${c ?? '–'}); ${only}`);
  }
  const permitted = lane.differ.map(key => {
    const [b, c] = [before, after].map(meta => laneValue(meta, key));
    return {field: key, label: LANE_FIELDS[key], baseline: b, candidate: c, same: b === c};
  });
  // One sitting, one machine and configuration: the environment is equal across the sides (the sandbox excepted where
  // the mode permits it), the experiment included.
  const [envBefore, envAfter] = [before, after].map(comparisonEnvironment);
  for (const key of Object.keys(envBefore)) if (!(key === 'sandbox' && lane.differ.includes('sandbox')) && !sameEnvironmentValue(key, envBefore[key], envAfter[key]))
    problems.push(`${key} environment differs between the baseline and the candidate`);
  const ops = [...new Set([...baseline.summary.operations, ...candidate.summary.operations].map(o => o.op))]
    .sort((a, b) => operationRank(a) - operationRank(b) || a.localeCompare(b));
  const operations = ops.map(op => (op.startsWith('method.') ? judgeMethod(op, baseline, candidate, {linux: lane.linux}) : judgeOperation(op, baseline, candidate)));
  // Linux (Acceptance 10): no cua median above the vendor engine's on an operation the engine answers; every operation
  // where cua's median is above is listed, whichever rule judged it.
  const above = lane.linux ? operations.filter(o => o.verdict !== 'not judged' && o.baseline?.judgedMs != null && o.candidate?.judgedMs != null && o.candidate.judgedMs > o.baseline.judgedMs)
    .map(o => ({op: o.op, baseline: o.baseline.judgedMs, candidate: o.candidate.judgedMs, engineAnswered: ENGINE_ANSWERED.includes(o.op)})) : null;
  for (const a of above ?? []) {
    const o = operations.find(each => each.op === a.op);
    if (a.engineAnswered && ['pass', 'declared'].includes(o.verdict)) { o.verdict = 'fail'; o.reasons.push(`cua's median ${a.candidate} ms is above the vendor engine's ${a.baseline} ms on an operation the engine answers (Acceptance 10)`); }
  }
  const ruled = problems.length ? 'NO VERDICT' : operations.some(o => o.verdict === 'fail') ? 'FAIL' : 'PASS';
  const diagnostic = plainPlan([...baselineRuns, ...candidateRuns], ruled);
  const describe = side => ({host: side.host, serverInfo: side.serverInfo, commits: side.commits, runs: side.summary.runs, attestation: side.summary.attestation, sshMedianMs: side.ssh});
  return {mode, lane, baseline: describe(baseline), candidate: describe(candidate), operations, permitted, problems, ...(above ? {above} : {}),
    verdict: diagnostic ? 'DIAGNOSTIC' : ruled, ...(diagnostic ? {diagnostic} : {})};
}

const fmt = value => (value === null || value === undefined ? '–' : value < 10 ? value.toFixed(2) : value.toFixed(1));
const triple = s => (s ? `${fmt(s.median)} / ${fmt(s.p95)} / ${fmt(s.max)}` : '–');
const share = f => (f ? `${f.ok}/${f.samples - f.invalid}` : '–');
export function renderComparison(result) {
  const {baseline: b, candidate: c} = result;
  const sameHost = result.mode === 'same-host', lane = result.lane;
  const flags = l => `\`--host ${l.host} --engine ${l.engine}\``;
  const engines = b.attestation.engine || c.attestation.engine || b.attestation.approvedEngine || c.attestation.approvedEngine;
  const lines = [
    sameHost ? '# Native baseline comparison, same host (before and after)' : lane ? `# Native baseline comparison ${lane.id}: ${lane.title}` : '# Native baseline comparison', '',
    '| | Baseline | Candidate |', '|---|---|---|',
    `| REPL host | ${b.host ?? '–'} | ${c.host ?? '–'} |`,
    ...(engines ? [`| Engine | ${b.attestation.engine ?? '–'} | ${c.attestation.engine ?? '–'} |`, `| Approved engine | ${b.attestation.approvedEngine ?? '–'} | ${c.attestation.approvedEngine ?? '–'} |`] : []),
    `| initialize answered by | ${b.serverInfo.join(', ') || '–'} | ${c.serverInfo.join(', ') || '–'} |`,
    `| Commit | ${b.commits.join(', ')} | ${c.commits.join(', ')} |`,
    ...['device', 'release', 'hardware', 'os', 'display', 'service', 'sandbox', 'plan'].map(key => `| ${key} | ${b.attestation[key] ?? '–'} | ${c.attestation[key] ?? '–'} |`),
    `| Runs | ${b.runs.map(r => r.name).join(', ')} | ${c.runs.map(r => r.name).join(', ')} |`,
    `| ssh.roundtrip median | ${fmt(b.sshMedianMs)} | ${fmt(c.sshMedianMs)} |`, '',
    lane
      ? `Rule (${lane.linux ? '#171' : '#117'} comparison ${lane.id}, ${lane.title}): the baseline runs ${flags(lane.baseline)}, the candidate ${flags(lane.candidate)}; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but ${lane.differ.join(', ')} (below). ${lane.note} Per operation (method cases included), the candidate\'s judged median must be at most the baseline\'s plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side\'s ssh.roundtrip median.${lane.linux ? ` On an operation the engine answers (${ENGINE_ANSWERED.join(', ')}) the candidate\'s judged median must also be at most the baseline\'s (Acceptance 10), and the typeText and paste method cases accept, until M2, exactly M1b\'s temporary candidate outcome (scripts/repl-parity/expected/native-linux.json baselineMethodCases), verdict "declared".` : ''} ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.`
      : sameHost
      ? `Rule (#115 acceptance 11): one host, three complete, attested runs a side covering the same plan, on the same machine and configuration except the permitted differences below; the judged rows are ${SAME_HOST_JUDGED.join(' and ')}: the candidate\'s median must be at most the baseline\'s plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples. Every other row is reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.`
      : 'Rule (acceptance 8): three complete, attested runs a side covering the same plan; per operation (method cases included), the candidate\'s judged median must be at most the baseline\'s plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples. The judged median is wall time around the MCP call; the cold-connection phases that open the ssh pipe are judged net of each side\'s ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.', '',
    '| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...result.operations.filter(o => o.kind === 'latency').map(o => `| ${o.op} | ${o.basis ?? '–'} | ${share(o.baseline)} | ${share(o.candidate)} | ${fmt(o.baseline?.judgedMs)} | ${fmt(o.candidate?.judgedMs)} | ${fmt(o.limitMs)} | ${o.verdict} | ${triple(o.baseline?.wall)} | ${triple(o.candidate?.wall)} | ${triple(o.baseline?.inCell)} | ${triple(o.candidate?.inCell)} |`),
  ];
  const methods = result.operations.filter(o => o.kind === 'method');
  if (methods.length) lines.push('', '## Method cases', '', 'Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.', '',
    '| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |', '|---|---|---|---|---|---|---|---|---|',
    ...methods.map(o => `| ${o.op} | ${o.baseline?.samples ?? 0} | ${o.baseline?.outcomes.join('<br>') || '–'} | ${o.candidate?.samples ?? 0} | ${o.candidate?.outcomes.join('<br>') || '–'} | ${triple(o.baseline?.wall)} | ${triple(o.candidate?.wall)} | ${fmt(o.limitMs)} | ${o.verdict} |`));
  if (sameHost) lines.push('', '## Permitted configuration differences', '',
    ...(result.permitted.length ? result.permitted.map(p => `- ${p.field}: ${p.baseline} -> ${p.candidate} (${p.reason})`) : ['None: the configuration is unchanged.']));
  if (result.above) lines.push('', '## Where cua\'s median is above the vendor engine\'s', '',
    ...(result.above.length ? result.above.map(a => `- ${a.op}: cua ${fmt(a.candidate)} ms, vendor ${fmt(a.baseline)} ms (${a.engineAnswered ? 'an operation the engine answers: it fails' : 'no engine answers it: judged by the tolerance alone'})`) : ['None: no cua median is above the vendor engine\'s.']));
  if (lane) lines.push('', '## What differs, by design', '',
    ...result.permitted.map(p => `- ${p.field}: ${p.baseline ?? '–'} -> ${p.candidate ?? '–'}${p.same ? ' (the same in these runs)' : ''}`));
  const notes = result.operations.filter(o => o.reasons.length).map(o => `- ${o.op} (${o.verdict}): ${o.reasons.join('; ')}`);
  lines.push('', '## Failures and notes', '', ...(notes.length ? notes : ['None.']));
  lines.push('', '## Problems', '', ...(result.problems.length ? result.problems.map(p => `- ${p}`) : ['None: both sides are complete, attested and comparable.']));
  lines.push('', `Verdict: **${result.verdict}**${result.diagnostic ? ` (the rule gives ${result.diagnostic.verdict}; ${result.diagnostic.reason})` : ''}`);
  return lines.join('\n') + '\n';
}
