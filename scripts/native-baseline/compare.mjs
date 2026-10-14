// The native baseline's before/after comparison (spec docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// acceptance 8): the vendor REPL host's runs against cua's own host's, on the same machine, runtime release and sample
// plan. Each side is pooled as scripts/native-baseline/summary.mjs pools it; then, per operation:
//   - latency: the candidate's median must be within max(10%, 500 ms) of the baseline's, or faster. The median judged is
//     the harness's wall time (what a model waits); for the cold-connection phases that open the ssh pipe it is net of
//     that side's ssh.roundtrip median, so a slower pipe is not charged to the host. Medians, p95 and max of wall and
//     in-cell time are reported for both sides.
//   - outcome: the candidate succeeds in no smaller share of its valid samples than the baseline; sample counts are
//     kept on both sides.
//   - method cases (method.*): the same observed outcome (what the method did, its error, whether the target survived)
//     or a strictly better one (it returned, the target survived and nothing says the text went missing).
// The ssh pipe itself (ssh.*), approval requests (approval.*; the harness answers at once, so these time the request,
// not a human), the harness's own guards and setup (guard.*, setup.*) and anything only one side has are reported and
// not judged. Runs that are incomplete, unattested, attest another host than their side's, or ran on an unlike machine,
// runtime or plan get no verdict.
import {attestation, operationRank, summarize} from './summary.mjs';

export const TOLERANCE = {ratio: 0.1, floorMs: 500};
export const latencyLimit = median => median + Math.max(TOLERANCE.ratio * median, TOLERANCE.floorMs);
const NOT_JUDGED = /^(ssh|approval|guard|setup)\./;
const NET_OF_SSH = new Set(['cold.miss.initialize', 'cold.miss.total', 'cold.hit.initialize', 'cold.hit.total']);
const COMPARABLE = {device: 'device', release: 'runtime release', hardware: 'hardware', os: 'OS', display: 'display', service: 'native service', plan: 'sample plan'};
const round = ms => (ms === null || ms === undefined ? null : Math.round(ms * 10) / 10);

// What one side's runs are: their pooled summary, their requested host (when every run agrees on one) and its problems.
function sideOf(label, runs, expectedHost) {
  const summary = summarize(runs);
  const problems = summary.problems.map(p => `${label}: ${p}`);
  const hosts = [...new Set(runs.map(r => r.meta.host))];
  for (const run of runs) if (run.meta.host === undefined) problems.push(`${label}: ${run.name} has no requested host (recorded before host attestation; remeasure it)`);
  const host = hosts.length === 1 ? hosts[0] ?? null : null;
  if (host && host !== expectedHost) problems.push(`the ${label} attests the ${host} host, not ${expectedHost} (compare <vendor-dir> <cua-dir>)`);
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

// A method case's observed outcome, one per sample: what the method did, its error, the target window's fate.
const outcomeOf = row => JSON.stringify(row.ok === true
  ? {outcome: row.outcome ?? null, error: row.methodError ?? null, target: row.target ?? null, inserted: row.inserted ?? null}
  : {harness: row.error ?? 'failed'});
const better = row => row.ok === true && row.outcome === 'returned' && row.target !== 'exited' && row.inserted !== false;
function judgeMethod(op, baseline, candidate) {
  const b = baseline.methodRows.get(op) ?? [], c = candidate.methodRows.get(op) ?? [];
  const base = {op, kind: 'method', baseline: {samples: b.length, outcomes: [...new Set(b.map(outcomeOf))].sort()},
    candidate: {samples: c.length, outcomes: [...new Set(c.map(outcomeOf))].sort()}};
  if (!b.length) return {...base, verdict: 'not judged', reasons: ['only the candidate has this method case']};
  if (!c.length) return {...base, verdict: 'fail', reasons: ['no candidate samples']};
  if (JSON.stringify(base.baseline.outcomes) === JSON.stringify(base.candidate.outcomes)) return {...base, verdict: 'pass', reasons: []};
  if (c.every(better) && !b.every(better)) return {...base, verdict: 'pass', reasons: ['better: the method returned, its target survived']};
  return {...base, verdict: 'fail', reasons: [`outcome differs: baseline ${base.baseline.outcomes.join(' | ')}; candidate ${base.candidate.outcomes.join(' | ')}`]};
}

function judgeOperation(op, baseline, candidate) {
  const net = NET_OF_SSH.has(op);
  const b = figures(baseline.summary.operations.find(o => o.op === op), baseline, net);
  const c = figures(candidate.summary.operations.find(o => o.op === op), candidate, net);
  const basis = net ? (baseline.ssh !== null && candidate.ssh !== null ? 'wall median net of ssh.roundtrip median' : 'wall median (no ssh.roundtrip to net out)') : 'wall median';
  const base = {op, kind: 'latency', basis, baseline: b, candidate: c, limitMs: null};
  if (NOT_JUDGED.test(op) || !b) return {...base, basis: null, verdict: 'not judged', reasons: b ? [] : ['only the candidate has this operation']};
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

// -> {baseline, candidate, operations, problems, verdict: 'PASS' | 'FAIL' | 'NO VERDICT'} for two sides' runs
// (summary.mjs readRuns), baseline the vendor host's, candidate cua's.
export function compare(baselineRuns, candidateRuns) {
  const baseline = sideOf('baseline', baselineRuns, 'vendor'), candidate = sideOf('candidate', candidateRuns, 'cua');
  const problems = [...baseline.problems, ...candidate.problems];
  const left = attestation(baselineRuns[0].meta), right = attestation(candidateRuns[0].meta);
  for (const [key, label] of Object.entries(COMPARABLE)) if (left[key] !== right[key]) problems.push(`${label} differs (baseline ${left[key] ?? '–'}, candidate ${right[key] ?? '–'})`);
  const ops = [...new Set([...baseline.summary.operations, ...candidate.summary.operations].map(o => o.op))]
    .sort((a, b) => operationRank(a) - operationRank(b) || a.localeCompare(b));
  const operations = ops.map(op => (op.startsWith('method.') ? judgeMethod(op, baseline, candidate) : judgeOperation(op, baseline, candidate)));
  const verdict = problems.length ? 'NO VERDICT' : operations.some(o => o.verdict === 'fail') ? 'FAIL' : 'PASS';
  const describe = (side, a) => ({host: side.host, serverInfo: side.serverInfo, commits: side.commits, runs: side.summary.runs, attestation: a, sshMedianMs: side.ssh});
  return {baseline: describe(baseline, left), candidate: describe(candidate, right), operations, problems, verdict};
}

const fmt = value => (value === null || value === undefined ? '–' : value < 10 ? value.toFixed(2) : value.toFixed(1));
const triple = s => (s ? `${fmt(s.median)} / ${fmt(s.p95)} / ${fmt(s.max)}` : '–');
const share = f => (f ? `${f.ok}/${f.samples - f.invalid}` : '–');
export function renderComparison(result) {
  const {baseline: b, candidate: c} = result;
  const lines = [
    '# Native baseline comparison', '',
    '| | Baseline | Candidate |', '|---|---|---|',
    `| REPL host | ${b.host ?? '–'} | ${c.host ?? '–'} |`,
    `| initialize answered by | ${b.serverInfo.join(', ') || '–'} | ${c.serverInfo.join(', ') || '–'} |`,
    `| Commit | ${b.commits.join(', ')} | ${c.commits.join(', ')} |`,
    ...['device', 'release', 'hardware', 'os', 'display', 'service', 'plan'].map(key => `| ${key} | ${b.attestation[key] ?? '–'} | ${c.attestation[key] ?? '–'} |`),
    `| Runs | ${b.runs.map(r => r.name).join(', ')} | ${c.runs.map(r => r.name).join(', ')} |`,
    `| ssh.roundtrip median | ${fmt(b.sshMedianMs)} | ${fmt(c.sshMedianMs)} |`, '',
    'Rule (acceptance 8): per operation, the candidate\'s judged median must be at most the baseline\'s plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples. The judged median is wall time around the MCP call; the cold-connection phases that open the ssh pipe are judged net of each side\'s ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.', '',
    '| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...result.operations.filter(o => o.kind === 'latency').map(o => `| ${o.op} | ${o.basis ?? '–'} | ${share(o.baseline)} | ${share(o.candidate)} | ${fmt(o.baseline?.judgedMs)} | ${fmt(o.candidate?.judgedMs)} | ${fmt(o.limitMs)} | ${o.verdict} | ${triple(o.baseline?.wall)} | ${triple(o.candidate?.wall)} | ${triple(o.baseline?.inCell)} | ${triple(o.candidate?.inCell)} |`),
  ];
  const methods = result.operations.filter(o => o.kind === 'method');
  if (methods.length) lines.push('', '## Method cases', '', '| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Verdict |', '|---|---|---|---|---|---|',
    ...methods.map(o => `| ${o.op} | ${o.baseline.samples} | ${o.baseline.outcomes.join('<br>') || '–'} | ${o.candidate.samples} | ${o.candidate.outcomes.join('<br>') || '–'} | ${o.verdict} |`));
  const notes = result.operations.filter(o => o.reasons.length).map(o => `- ${o.op} (${o.verdict}): ${o.reasons.join('; ')}`);
  lines.push('', '## Failures and notes', '', ...(notes.length ? notes : ['None.']));
  lines.push('', '## Problems', '', ...(result.problems.length ? result.problems.map(p => `- ${p}`) : ['None: both sides are complete, attested and comparable.']));
  lines.push('', `Verdict: **${result.verdict}**`);
  return lines.join('\n') + '\n';
}
