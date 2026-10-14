// The native baseline's summariser: the runs of one evidence directory (run-*/meta.json and results.jsonl, written by
// scripts/native-baseline.mjs) pooled per operation. Latency statistics cover successful samples only (a failed call's
// time says nothing about the operation's cost); failures are counted and listed apart. Harness wall time (around the
// MCP call, on the controlling machine, so it includes the ssh pipe) and in-cell time (performance.now() inside the
// cell, on the device) are reported separately. Numeric details a row carries (AX text length, element count,
// screenshot bytes, action count…) are summarised as median and range. Runs that are incomplete or disagree on what
// they ran against (commit, runtime release, hardware, OS, display, service) are reported as problems.
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';

// The order operations are reported in; anything else follows alphabetically.
export const OPERATION_ORDER = [
  'ssh.roundtrip',
  ...['miss', 'hit'].flatMap(cache => ['initialize', 'tools_list', 'first_js', 'total'].map(phase => `cold.${cache}.${phase}`)),
  'warm.noop', 'warm.getState', 'warm.listApps', 'bind.getApp', 'approval.elicitation', 'warm.getAXState', 'warm.getScreenshot',
  'task.act', 'task.verify', 'task.close', 'task.total', 'end_task',
];
const ROW_KEYS = new Set(['op', 'sample', 'ok', 'wallMs', 'inCellMs', 'error', 'run']);

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
const ATTESTED = ['device', 'commit', 'release', 'hardware', 'os', 'display', 'service'];
// The facts a run attests, as the strings the summary compares and prints.
function attestation(meta) {
  const hw = meta.hardware ?? {}, os = meta.os ?? {}, display = meta.display ?? {}, service = meta.service ?? {};
  return {
    device: meta.device ?? null,
    commit: meta.commit ?? null,
    release: meta.runtime?.release ?? null,
    hardware: [hw.model, hw.chip, hw.memoryBytes ? `${Math.round(hw.memoryBytes / GiB)} GiB` : null].filter(Boolean).join(', ') || null,
    os: os.version ? `${os.name ?? 'macOS'} ${os.version}${os.build ? ` (${os.build})` : ''}` : null,
    display: display.resolution ? `${display.resolution} points at scale ${display.scale ?? '?'}${display.pixels ? ` (${display.pixels} pixels)` : ''}` : null,
    service: service.surface ? `${service.surface} surface, answered by ${service.answered ?? '?'}${service.helper ? ` (helper: ${service.helper})` : ''}` : null,
  };
}

function detailSummary(rows) {
  const fields = new Map();
  for (const row of rows) for (const [key, value] of Object.entries(row)) {
    if (ROW_KEYS.has(key) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (!fields.has(key)) fields.set(key, []);
    fields.get(key).push(value);
  }
  if (!fields.size) return null;
  return Object.fromEntries([...fields].map(([key, values]) => {
    const s = stats(values);
    return [key, {median: s.median, min: Math.min(...values), max: s.max}];
  }));
}

export function summarize(runs) {
  const problems = [];
  const first = attestation(runs[0].meta);
  for (const run of runs) {
    if (run.meta.complete !== true) problems.push(`${run.name} is incomplete${run.meta.error ? ` (${run.meta.error})` : ''}`);
    const own = attestation(run.meta);
    for (const key of ATTESTED) if (own[key] !== first[key]) problems.push(`${run.name} differs in ${key} (${own[key]}, not ${first[key]})`);
  }
  const byOp = new Map();
  for (const run of runs) for (const row of run.rows) {
    if (typeof row.op !== 'string') continue;
    if (!byOp.has(row.op)) byOp.set(row.op, []);
    byOp.get(row.op).push({...row, run: run.name});
  }
  const rank = op => { const i = OPERATION_ORDER.indexOf(op); return i < 0 ? OPERATION_ORDER.length : i; };
  const operations = [...byOp.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map(op => {
    const rows = byOp.get(op), ok = rows.filter(r => r.ok === true);
    return {
      op, samples: rows.length, ok: ok.length,
      errors: rows.filter(r => r.ok !== true).map(r => ({run: r.run, sample: r.sample, error: r.error ?? 'failed'})),
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
    `| Device | ${a.device ?? '–'} |`, `| Host commit | ${a.commit ?? '–'} |`, `| Runtime release | ${a.release ?? '–'} |`,
    `| Hardware | ${a.hardware ?? '–'} |`, `| OS | ${a.os ?? '–'} |`, `| Display | ${a.display ?? '–'} |`, `| Service | ${a.service ?? '–'} |`, '',
    'Milliseconds. Latency columns cover successful samples only; wall is the harness\'s time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.', '',
    '| Operation | Samples | OK | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...summary.operations.map(o => `| ${o.op} | ${o.samples} | ${o.ok} | ${o.errors.length} | ${triple(o.wall).join(' | ')} | ${triple(o.inCell).join(' | ')} |`),
  ];
  const detailed = summary.operations.filter(o => o.details);
  if (detailed.length) {
    lines.push('', '| Operation | Observed (median, range) |', '|---|---|',
      ...detailed.map(o => `| ${o.op} | ${Object.entries(o.details).map(([k, d]) => `${k} ${d.median} (${d.min}–${d.max})`).join('; ')} |`));
  }
  const errors = summary.operations.flatMap(o => o.errors.map(e => `- ${o.op}, ${e.run} sample ${e.sample}: ${e.error}`));
  lines.push('', '## Errors', '', ...(errors.length ? errors : ['None.']));
  lines.push('', '## Problems', '', ...(summary.problems.length ? summary.problems.map(p => `- ${p}`)
    : ['No problems: every run is complete and attests the same commit, release, hardware, OS, display and service.']));
  return lines.join('\n') + '\n';
}
