// The native baseline's summariser: the runs of one evidence directory (run-*/meta.json and results.jsonl, written by
// scripts/native-baseline.mjs) pooled per operation. Latency statistics cover successful samples only (a failed call's
// time says nothing about the operation's cost); failures are counted and listed apart. Harness wall time (around the
// MCP call, on the controlling machine, so it includes the ssh pipe) and in-cell time (performance.now() inside the
// cell, on the device) are reported separately. A sample the harness invalidated (its target was not the scratch
// document) is neither: it is kept out of the statistics and listed apart. Numeric details a row carries (AX text
// length, element count, screenshot bytes, action count…) are summarised as median and range, string details by their
// values when there are few (the screenshot format) or their count otherwise. Runs that are incomplete or disagree on what
// they ran against (commit, REPL host, runtime release, hardware, OS, display, service, sandbox, sample plan) are reported
// as problems, and so is a run whose answering host is not attested on every connection it opened (scripts/bench-summary.mjs
// validateHostAttestations), or, recorded with host attestation, one that lacks its sandbox policy or falls short of its
// plan (coverageProblems). A run recorded before host attestation has no requested host and is summarised as such.
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {validateHostAttestations} from '../bench-summary.mjs';
import {METHOD_CASES} from './linux-cells.mjs';

// The order operations are reported in; anything else follows alphabetically.
export const OPERATION_ORDER = [
  'ssh.roundtrip',
  ...['miss', 'hit'].flatMap(cache => ['initialize', 'tools_list', 'first_js', 'total'].map(phase => `cold.${cache}.${phase}`)),
  'warm.noop', 'warm.getState', 'warm.listApps', 'setup.findWindow', 'bind.getApp', 'approval.elicitation', 'warm.getAXState', 'warm.getScreenshot',
  'task.act', 'task.verify', 'task.close', 'task.clear', 'task.total',
  'method.typeText', 'method.paste', 'method.paste.format', 'method.setValue', 'method.selectText', 'method.scroll.pages', 'end_task',
];
// -> the report position of `op`: OPERATION_ORDER's, else after it (ties broken alphabetically by the caller).
export const operationRank = op => { const i = OPERATION_ORDER.indexOf(op); return i < 0 ? OPERATION_ORDER.length : i; };
const ROW_KEYS = new Set(['op', 'sample', 'ok', 'wallMs', 'inCellMs', 'error', 'invalid', 'note', 'run']);
const FEW_VALUES = 3;

// {n, median, p95, max}; the median of an even count is the mean of the middle pair, p95 is nearest-rank.
export function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const n = sorted.length, mid = Math.floor(n / 2);
  return {n, median: n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, p95: sorted[Math.ceil(0.95 * n) - 1], max: sorted[n - 1]};
}

const jsonl = path => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
// -> [{name, meta, rows}] for every run-* directory under `dir`, in run order.
export function readRuns(dir) {
  const names = readdirSync(dir, {withFileTypes: true}).filter(e => e.isDirectory() && /^run-\d+$/.test(e.name)).map(e => e.name)
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  if (!names.length) throw new Error(`no run-* directories under ${dir}`);
  return names.map(name => {
    const root = join(dir, name);
    if (!existsSync(join(root, 'meta.json')) || !existsSync(join(root, 'results.jsonl'))) throw new Error(`${root}: missing meta.json or results.jsonl`);
    return {name, meta: JSON.parse(readFileSync(join(root, 'meta.json'), 'utf8')), rows: jsonl(join(root, 'results.jsonl'))};
  });
}

const GiB = 1024 ** 3;
const ATTESTED = ['device', 'commit', 'host', 'release', 'hardware', 'os', 'display', 'service', 'sandbox', 'plan'];
// The answering host a run attests: the requested host and what its connections' initialize named, or null for a run
// recorded before host attestation.
function hostAttested(meta) {
  if (meta.host === undefined) return null;
  const answered = [...new Set((meta.hostAttestations ?? []).map(a => `${a?.serverInfo?.name ?? '?'} ${a?.serverInfo?.version ?? '?'}`))].sort();
  return `${meta.host} (initialize: ${answered.join(', ') || 'none recorded'})`;
}
// The facts a run attests, as the strings the summary compares and prints.
export function attestation(meta) {
  const hw = meta.hardware ?? {}, os = meta.os ?? {}, display = meta.display ?? {}, service = meta.service ?? {}, plan = meta.plan ?? {};
  return {
    device: meta.device ?? null,
    commit: meta.commit ?? null,
    host: hostAttested(meta),
    release: meta.runtime?.release ?? null,
    hardware: [hw.model, hw.chip, hw.memoryBytes ? `${Math.round(hw.memoryBytes / GiB)} GiB` : null].filter(Boolean).join(', ') || null,
    os: os.version ? `${os.name ?? 'macOS'} ${os.version}${os.build ? ` (${os.build})` : ''}` : null,
    display: display.resolution ? `${display.resolution} points at scale ${display.scale ?? '?'}${display.pixels ? ` (${display.pixels} pixels)` : ''}` : null,
    service: service.surface ? `${service.surface} surface, answered by ${service.answered ?? '?'}${service.helper ? ` (helper: ${service.helper})` : ''}` : null,
    sandbox: meta.sandbox?.mode ? `${meta.sandbox.mode} (${meta.sandbox.explicit ? 'CUA_SHIM_SANDBOX' : 'platform default'})` : null,
    plan: plan.samples ? `${plan.cold} cold, ${plan.samples} warm, ${plan.tasks} tasks` : null,
  };
}

// What a complete run of `plan` must have recorded, per operation (the task's verify step runs only after a successful
// act, so it is bounded, not fixed): a run whose rows fall short is not evidence of its plan, whatever `complete` says.
// Cold connections are counted across their observed hit/miss labels.
export function coverageProblems(run) {
  const {meta, rows, name} = run, plan = meta.plan ?? {};
  if (!plan.samples || !plan.cold || !plan.tasks) return [`${name} records no sample plan`];
  const count = op => rows.filter(r => r.op === op).length;
  const linux = meta.platform === 'linux';
  const expected = [['ssh.roundtrip', 5], ['warm.noop', plan.samples], ['warm.getState', plan.samples], ['warm.listApps', plan.samples],
    [linux ? 'setup.findWindow' : 'setup.newDocument', 1], ['bind.getApp', 1], ['warm.getAXState', plan.samples], ['warm.getScreenshot', plan.samples],
    ['task.act', plan.tasks], [linux ? 'task.clear' : 'task.close', plan.tasks], ['task.total', plan.tasks],
    ...(linux ? Object.keys(METHOD_CASES).map(op => [op, 1]) : []), ['end_task', 1]];
  const problems = expected.filter(([op, n]) => count(op) !== n).map(([op, n]) => `${name} covers ${count(op)} ${op} sample${count(op) === 1 ? '' : 's'}, the plan ${n}`);
  const cold = rows.filter(r => /^cold\.(miss|hit)\.total$/.test(r.op)).length;
  if (cold !== plan.cold) problems.push(`${name} covers ${cold} cold connections, the plan ${plan.cold}`);
  const verified = count('task.verify'), acted = rows.filter(r => r.op === 'task.act' && r.ok === true).length;
  if (verified !== acted) problems.push(`${name} covers ${verified} task.verify samples for ${acted} successful task.act`);
  return problems;
}

// The problem with a run's host attestation, or null: every connection the run opened attested the requested host.
export function hostProblem(meta, name) {
  if (meta.host === undefined) return null;
  try { validateHostAttestations(meta, meta.host, name); } catch (error) { return error.message; }
  if (Number.isInteger(meta.connections) && meta.hostAttestations.length !== meta.connections)
    return `${name}: ${meta.connections} connections opened, ${meta.hostAttestations.length} attested`;
  return null;
}

function detailSummary(rows) {
  const fields = new Map();
  for (const row of rows) for (const [key, value] of Object.entries(row)) {
    if (ROW_KEYS.has(key) || !(typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))) continue;
    if (!fields.has(key)) fields.set(key, []);
    fields.get(key).push(value);
  }
  if (!fields.size) return null;
  return Object.fromEntries([...fields].map(([key, values]) => {
    if (values.every(v => typeof v === 'number')) {
      const s = stats(values);
      return [key, {median: s.median, min: Math.min(...values), max: s.max}];
    }
    const distinct = [...new Set(values.map(String))].sort();
    return [key, distinct.length <= FEW_VALUES ? {values: distinct} : {distinct: distinct.length}];
  }));
}

export function summarize(runs) {
  const problems = [];
  const first = attestation(runs[0].meta);
  for (const run of runs) {
    if (run.meta.complete !== true) problems.push(`${run.name} is incomplete${run.meta.error ? ` (${run.meta.error})` : ''}`);
    const host = hostProblem(run.meta, run.name);
    if (host) problems.push(host);
    // Evidence recorded with host attestation must also record its sandbox policy and cover its whole plan.
    if (run.meta.host !== undefined) {
      if (!run.meta.sandbox?.mode) problems.push(`${run.name} records no sandbox policy`);
      problems.push(...coverageProblems(run));
    }
    const own = attestation(run.meta);
    for (const key of ATTESTED) if (own[key] !== first[key]) problems.push(`${run.name} differs in ${key} (${own[key]}, not ${first[key]})`);
  }
  const byOp = new Map();
  for (const run of runs) for (const row of run.rows) {
    if (typeof row.op !== 'string') continue;
    if (!byOp.has(row.op)) byOp.set(row.op, []);
    byOp.get(row.op).push({...row, run: run.name});
  }
  const operations = [...byOp.keys()].sort((a, b) => operationRank(a) - operationRank(b) || a.localeCompare(b)).map(op => {
    const rows = byOp.get(op), ok = rows.filter(r => r.ok === true);
    return {
      op, samples: rows.length, ok: ok.length,
      invalid: rows.filter(r => r.ok !== true && r.invalid).map(r => ({run: r.run, sample: r.sample, reason: r.invalid})),
      errors: rows.filter(r => r.ok !== true && !r.invalid).map(r => ({run: r.run, sample: r.sample, error: r.error ?? 'failed'})),
      wall: stats(ok.map(r => r.wallMs)), inCell: stats(ok.map(r => r.inCellMs)), details: detailSummary(ok),
    };
  });
  return {runs: runs.map(r => ({name: r.name, complete: r.meta.complete === true, started: r.meta.started ?? null, finished: r.meta.finished ?? null})),
    attestation: first, operations, problems};
}

const fmt = value => (value === null || value === undefined ? '–' : value < 10 ? value.toFixed(2) : value.toFixed(1));
const triple = s => (s ? [fmt(s.median), fmt(s.p95), fmt(s.max)] : ['–', '–', '–']);
export function renderMarkdown(summary) {
  const a = summary.attestation;
  const lines = [
    '# Native baseline summary', '',
    `Runs: ${summary.runs.map(r => `${r.name} (${r.started ?? '?'} to ${r.finished ?? '?'}${r.complete ? '' : ', incomplete'})`).join('; ')}.`, '',
    '| Attested | Value |', '|---|---|',
    `| Device | ${a.device ?? '–'} |`, `| Host commit | ${a.commit ?? '–'} |`, `| REPL host | ${a.host ?? 'not attested (recorded before host attestation)'} |`, `| Runtime release | ${a.release ?? '–'} |`,
    `| Hardware | ${a.hardware ?? '–'} |`, `| OS | ${a.os ?? '–'} |`, `| Display | ${a.display ?? '–'} |`, `| Service | ${a.service ?? '–'} |`, `| Sandbox | ${a.sandbox ?? '–'} |`, `| Sample plan | ${a.plan ?? '–'} |`, '',
    'Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness\'s time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.', '',
    '| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...summary.operations.map(o => `| ${o.op} | ${o.samples} | ${o.ok} | ${o.invalid.length} | ${o.errors.length} | ${triple(o.wall).join(' | ')} | ${triple(o.inCell).join(' | ')} |`),
  ];
  const detailed = summary.operations.filter(o => o.details);
  if (detailed.length) {
    lines.push('', '| Operation | Observed (median, range) |', '|---|---|',
      ...detailed.map(o => `| ${o.op} | ${Object.entries(o.details).map(([k, d]) => (d.values ? `${k} ${d.values.join(', ')}` : d.distinct ? `${k} ${d.distinct} distinct` : `${k} ${d.median} (${d.min}–${d.max})`)).join('; ')} |`));
  }
  const invalid = summary.operations.flatMap(o => o.invalid.map(i => `- ${o.op}, ${i.run} sample ${i.sample}: ${i.reason}`));
  lines.push('', '## Invalidated samples', '', ...(invalid.length ? invalid : ['None.']));
  const errors = summary.operations.flatMap(o => o.errors.map(e => `- ${o.op}, ${e.run} sample ${e.sample}: ${e.error}`));
  lines.push('', '## Errors', '', ...(errors.length ? errors : ['None.']));
  lines.push('', '## Problems', '', ...(summary.problems.length ? summary.problems.map(p => `- ${p}`)
    : ['No problems: every run is complete and attests the same commit, REPL host, release, hardware, OS, display, service, sandbox and sample plan.']));
  return lines.join('\n') + '\n';
}
