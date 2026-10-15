import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {compareRuns, validTrace} from './compare.mjs';
import {validateAttestations} from '../repl-parity/compare.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const contextKeys = ['service', 'backend', 'device', 'profile', 'release', 'platform'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const uniqueStrings = values => Array.isArray(values) && values.length > 0 && values.every(nonempty) && new Set(values).size === values.length;
const onlyKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));

function validateControl(run) {
  if (!run?.meta || !Array.isArray(run.rows)) throw new Error('Invalid trace variance evidence');
  const {meta, rows} = run;
  validateAttestations(meta);
  if (meta.host !== 'vendor' || meta.observedHost !== 'vendor') throw new Error('Trace variance requires vendor-against-vendor evidence');
  if (meta.fake !== false || meta.backend !== 'live' || meta.dirty !== false || !/^[0-9a-f]{40}$/.test(meta.commit ?? '')
    || contextKeys.some(k => !nonempty(meta[k])) || !['vendor', 'cua'].includes(meta.service)) throw new Error('Invalid trace variance provenance');
  if (meta.environment?.CUA_REPL_HOST !== 'vendor' || meta.environment.CUA_BROWSER_SERVICE !== meta.service
    || meta.environment.CUA_SHIM_SURFACES !== 'browser') throw new Error('Trace variance environment mismatch');
  for (const attestation of meta.hostAttestations) {
    if (!nonempty(attestation.serverInfo.name) || !nonempty(attestation.serverInfo.version)
      || ['checkout', 'home', 'commit', 'dirty', 'release', 'node', 'runtimeNode', 'platform'].some(k => meta[k] === undefined
        || !isDeepStrictEqual(attestation.executionFacts?.[k], meta[k]))) throw new Error('Trace variance connection provenance mismatch');
  }
  if (!uniqueStrings(meta.cases) || !Array.isArray(meta.attestations)
    || meta.cases.some(id => !meta.attestations.some(a => a.case === id))
    || meta.attestations.some(a => !meta.cases.includes(a.case) || a.service !== meta.service || !nonempty(a.header)
      || (meta.service === 'cua') !== /^cua browser service [0-9]+\.[0-9]+\.[0-9]+$/.test(a.marker ?? ''))) throw new Error('Invalid trace variance service attestation or case manifest');
  if (rows.some(r => !r || !meta.cases.includes(r.case) || r.fake)
    || meta.cases.some(id => !rows.some(r => r.case === id && r.assertion))) throw new Error('Trace variance rows differ from case manifest');
  for (const row of rows) if (row.cell) {
    if (!validTrace(row.trace)) throw new Error('Malformed trace variance trace');
  }
  if (!compareRuns(rows, rows).ok) throw new Error('Invalid trace variance evidence results');
}

// Both sides are raw, attested vendor runs. No expected differences are used to establish variance: a non-trace
// difference means this is not a variance control. The case subset never drops a cell or assertion inside a case.
export function deriveTraceAllowances(a, b, {cases} = {}) {
  validateControl(a); validateControl(b);
  for (const key of contextKeys) if (!isDeepStrictEqual(a.meta[key], b.meta[key])) throw new Error(`Trace variance context mismatch: ${key}`);
  if (!isDeepStrictEqual(a.meta.hostAttestations[0].serverInfo, b.meta.hostAttestations[0].serverInfo)) throw new Error('Trace variance host version mismatch');
  const ids = cases ?? a.meta.cases;
  if (!uniqueStrings(ids) || ids.some(id => !a.meta.cases.includes(id) || !b.meta.cases.includes(id))) throw new Error('Invalid trace variance case scope');
  if (!cases && !isDeepStrictEqual([...a.meta.cases].sort(), [...b.meta.cases].sort())) throw new Error('Trace variance case manifests differ');
  const select = run => run.rows.filter(r => ids.includes(r.case));
  const left = select(a), right = select(b);
  for (const row of left) if (row.cell) {
    const other = right.find(r => r.case === row.case && r.cell === row.cell);
    if (other && Boolean(row.trace.length) !== Boolean(other.trace.length)) throw new Error('Trace variance evidence has unavailable trace');
  }
  const result = compareRuns(left, right);
  if (result.differences.some(d => d.kind !== 'trace')) throw new Error('Trace variance evidence has non-trace differences');
  return result.differences.map(d => ({axis: 'repl-host', cases: [d.case], cells: [d.cell], kind: 'trace', methods: [d.method], maxDelta: Math.abs(d.a - d.b), reason: 'Recorded vendor-against-vendor trace variance'}));
}

// Resolve evidence from immutable Git objects, not editable working-tree captures. The manifest contains only pair
// references and optional whole-case scopes; methods and bounds are always computed from the recorded traces.
export function loadTraceAllowances(fixture, {repo = root, targetMetas = []} = {}) {
  if (!onlyKeys(fixture, ['axis', 'kind', 'revision', 'pairs']) || fixture.axis !== 'repl-host' || fixture.kind !== 'vendor-trace-variance'
    || !/^[0-9a-f]{40}$/.test(fixture.revision ?? '') || !Array.isArray(fixture.pairs) || !fixture.pairs.length) throw new Error('Invalid trace variance fixture');
  let type;
  try { type = execFileSync('git', ['cat-file', '-t', fixture.revision], {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim(); }
  catch { throw new Error(`Trace variance evidence commit unavailable: ${fixture.revision}`); }
  if (type !== 'commit') throw new Error('Trace variance evidence revision must name a commit');
  const runs = new Map(), entries = new Map();
  const sourcePath = path => nonempty(path) && path.startsWith('docs/evidence/') && path.split('/').every(p => /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(p));
  function readRun(path) {
    if (!sourcePath(path)) throw new Error('Invalid trace variance evidence path');
    if (!runs.has(path)) {
      const read = file => {
        try { return execFileSync('git', ['show', `${fixture.revision}:${path}/${file}`], {cwd: repo, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}); }
        catch { throw new Error(`Committed trace variance evidence unavailable: ${path}/${file} at ${fixture.revision}`); }
      };
      const meta = JSON.parse(read('meta.json'));
      const rows = read('results.jsonl').trim().split('\n').filter(Boolean).map(JSON.parse);
      for (const target of targetMetas) for (const key of contextKeys) if (!isDeepStrictEqual(target[key], meta[key])) throw new Error(`Trace variance target context mismatch: ${key}`);
      runs.set(path, {meta, rows});
    }
    return runs.get(path);
  }
  for (const pair of fixture.pairs) {
    if (!onlyKeys(pair, ['a', 'b', 'cases']) || pair.a === pair.b || (pair.cases !== undefined && !uniqueStrings(pair.cases))) throw new Error('Invalid trace variance pair');
    const allowances = deriveTraceAllowances(readRun(pair.a), readRun(pair.b), {cases: pair.cases});
    for (const entry of allowances) {
      const key = JSON.stringify([entry.cases[0], entry.cells[0], entry.methods[0]]);
      const previous = entries.get(key);
      if (!previous || entry.maxDelta > previous.maxDelta) entries.set(key, {...entry, reason: `${entry.reason}: ${fixture.revision}, ${pair.a} versus ${pair.b}`});
    }
  }
  return [...entries.values()].sort((a, b) => JSON.stringify([a.cases, a.cells, a.methods]).localeCompare(JSON.stringify([b.cases, b.cells, b.methods])));
}
