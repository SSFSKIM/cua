import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stats, summarize, readRuns, renderMarkdown} from '../../scripts/native-baseline/summary.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/native-baseline.mjs', import.meta.url));
const meta = (n, extra = {}) => ({
  device: 'mini', commit: 'abc1234', complete: true, protocolVersion: '2025-06-18',
  runtime: {release: '26.928.40906-darwin-arm64'}, hardware: {model: 'Mac14,12', chip: 'Apple M2 Pro', memoryBytes: 17179869184},
  os: {name: 'macOS', version: '27.0', build: '26A428'}, display: {pixels: '5120 x 2880', resolution: '2560 x 1440', scale: 2},
  service: {surface: 'computer', answered: 'vendor', helper: 'pinned runtime'},
  started: `2026-10-14T0${n}:00:00Z`, finished: `2026-10-14T0${n}:05:00Z`, ...extra,
});
const range = (n, f) => Array.from({length: n}, (_, i) => f(i + 1));
function rowsFor(run) {
  return [
    ...range(2, s => ({op: 'cold.miss.total', sample: s, ok: true, wallMs: 3000 + s * 100 + run})),
    ...range(3, s => ({op: 'cold.hit.total', sample: s, ok: true, wallMs: 1000 + s * 10})),
    ...range(30, s => ({op: 'warm.noop', sample: s, ok: true, wallMs: 50 + s, inCellMs: 0.02 * s})),
    ...range(29, s => ({op: 'warm.getAXState', sample: s, ok: true, wallMs: 200 + s, inCellMs: 150 + s, chars: 4000 + (s % 3), elements: 40})),
    {op: 'warm.getAXState', sample: 30, ok: false, wallMs: 5, inCellMs: 4, invalid: 'the scratch document was not in front'},
    ...range(2, s => ({op: 'warm.getScreenshot', sample: s, ok: true, wallMs: 90, inCellMs: 45, bytes: 1000 * s, format: 'jpeg', sha256: `h${run}-${s}`})),
    {op: 'warm.listApps', sample: 1, ok: false, wallMs: 90, inCellMs: 10, error: 'server error'},
    ...range(29, s => ({op: 'warm.listApps', sample: s + 1, ok: true, wallMs: 100, inCellMs: 60, apps: 70})),
    ...range(10, s => ({op: 'task.total', sample: s, ok: s !== 4, wallMs: 2000, inCellMs: 1500, actions: 4, ...(s === 4 ? {error: 'text not found'} : {})})),
  ];
}
function fixture(t, metas = [meta(1), meta(2), meta(3)]) {
  const dir = mkdtempSync(join(tmpdir(), 'native-baseline-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  metas.forEach((m, i) => {
    const root = join(dir, `run-${i + 1}`);
    mkdirSync(root);
    writeFileSync(join(root, 'meta.json'), JSON.stringify(m));
    writeFileSync(join(root, 'results.jsonl'), rowsFor(i + 1).map(r => JSON.stringify(r)).join('\n') + '\n');
  });
  return dir;
}

test('stats: median of an even count averages the middle pair; p95 is nearest-rank; empty is null', () => {
  assert.deepEqual(stats([4, 1, 3, 2]), {n: 4, median: 2.5, p95: 4, max: 4});
  assert.deepEqual(stats(range(20, i => i)), {n: 20, median: 10.5, p95: 19, max: 20});
  assert.deepEqual(stats([7]), {n: 1, median: 7, p95: 7, max: 7});
  assert.equal(stats([]), null);
});

test('summarize pools every run per operation: latency over successful samples, errors counted apart', t => {
  const summary = summarize(readRuns(fixture(t)));
  assert.deepEqual(summary.problems, []);
  const op = name => summary.operations.find(o => o.op === name);
  assert.deepEqual(summary.operations.map(o => o.op), ['cold.miss.total', 'cold.hit.total', 'warm.noop', 'warm.listApps', 'warm.getAXState', 'warm.getScreenshot', 'task.total']);
  assert.deepEqual(op('warm.noop').wall, {n: 90, median: 65.5, p95: 79, max: 80});
  assert.equal(op('warm.noop').inCell.max, 0.6);
  assert.deepEqual({samples: op('warm.listApps').samples, ok: op('warm.listApps').ok, errors: op('warm.listApps').errors}, {samples: 90, ok: 87, errors: [{run: 'run-1', sample: 1, error: 'server error'}, {run: 'run-2', sample: 1, error: 'server error'}, {run: 'run-3', sample: 1, error: 'server error'}]});
  assert.equal(op('warm.listApps').wall.n, 87);
  assert.equal(op('cold.miss.total').inCell, null);
  assert.deepEqual(op('cold.miss.total').wall, {n: 6, median: 3152, p95: 3203, max: 3203});
  assert.deepEqual(op('warm.getAXState').details, {chars: {median: 4001, min: 4000, max: 4002}, elements: {median: 40, min: 40, max: 40}});
  // An invalidated sample is neither a success nor an error: kept out of the statistics, listed apart.
  assert.deepEqual({samples: op('warm.getAXState').samples, ok: op('warm.getAXState').ok, errors: op('warm.getAXState').errors.length, wall: op('warm.getAXState').wall.n},
    {samples: 90, ok: 87, errors: 0, wall: 87});
  assert.deepEqual(op('warm.getAXState').invalid, ['run-1', 'run-2', 'run-3'].map(run => ({run, sample: 30, reason: 'the scratch document was not in front'})));
  // A string detail with few values is kept (the screenshot format); one with many is counted.
  assert.deepEqual(op('warm.getScreenshot').details, {bytes: {median: 1500, min: 1000, max: 2000}, format: {values: ['jpeg']}, sha256: {distinct: 6}});
  assert.equal(op('task.total').ok, 27);
  assert.deepEqual(op('task.total').details, {actions: {median: 4, min: 4, max: 4}});
  // A run recorded before host attestation (the 2026-10-14 Mac baseline) has no requested host and no sample plan here.
  assert.deepEqual(summary.attestation, {device: 'mini', commit: 'abc1234', host: null, release: '26.928.40906-darwin-arm64', hardware: 'Mac14,12, Apple M2 Pro, 16 GiB', os: 'macOS 27.0 (26A428)', display: '2560 x 1440 points at scale 2 (5120 x 2880 pixels)', service: 'computer surface, answered by vendor (helper: pinned runtime)', sandbox: null, plan: null});
});

test('a run that requests a host must attest it on every connection it opened', t => {
  const vendor = {host: 'vendor', connections: 2, plan: {samples: 30, cold: 5, tasks: 10}, sandbox: {mode: 'scoped', explicit: false}, hostAttestations: [1, 2].map(() => ({host: 'vendor', serverInfo: {name: 'node_repl', version: '0.1.0'}, _meta: null}))};
  const attested = summarize(readRuns(fixture(t, [meta(1, vendor), meta(2, vendor), meta(3, vendor)])));
  // (This fixture's rows cover only part of a plan; coverage has its own test below.)
  assert.deepEqual(attested.problems.filter(p => !/ covers | lacks /.test(p)), []);
  assert.equal(attested.attestation.sandbox, 'scoped (platform default)');
  assert.equal(attested.attestation.host, 'vendor (initialize: node_repl 0.1.0)');
  assert.equal(attested.attestation.plan, '5 cold, 30 warm, 10 tasks');
  const short = {...vendor, connections: 3};
  const marked = {...vendor, hostAttestations: [{host: 'vendor', serverInfo: {name: 'node_repl', version: '0.1.0'}, _meta: {'cua/replHost': {host: 'cua', version: '0.1.0'}}}, vendor.hostAttestations[1]]};
  const problems = summarize(readRuns(fixture(t, [meta(1, vendor), meta(2, short), meta(3, marked), meta(4, {...vendor, sandbox: undefined})]))).problems;
  assert.ok(problems.includes('run-4 records no sandbox policy'), problems.join(' | '));
  assert.ok(problems.includes('run-2: 3 connections opened, 2 attested'), problems.join(' | '));
  assert.ok(problems.some(p => /^run-3: host attestation missing or mismatched \(requested vendor\)/.test(p)), problems.join(' | '));
});

test('an incomplete run or one that disagrees on commit, release or service is a problem, never silently pooled', t => {
  const summary = summarize(readRuns(fixture(t, [meta(1), meta(2, {complete: false, error: 'boom'}), meta(3, {commit: 'def5678', service: {surface: 'computer', answered: 'cua', helper: 'pinned runtime'}})])));
  assert.deepEqual(summary.problems, ['run-2 is incomplete (boom)', 'run-3 differs in commit (def5678, not abc1234)', 'run-3 differs in service (computer surface, answered by cua (helper: pinned runtime), not computer surface, answered by vendor (helper: pinned runtime))']);
});

test('renderMarkdown writes the attestation, one row per operation and the problems', t => {
  const text = renderMarkdown(summarize(readRuns(fixture(t))));
  assert.match(text, /^# Native baseline summary/m);
  assert.match(text, /\| warm\.noop \| 90 \| 90 \| 0 \| 0 \| 65\.5 \| 79\.0 \| 80\.0 \| 0\.31 \| 0\.58 \| 0\.60 \|/);
  assert.match(text, /\| cold\.miss\.total \| 6 \| 6 \| 0 \| 0 \| 3152\.0 \| 3203\.0 \| 3203\.0 \| – \| – \| – \|/);
  assert.match(text, /Runtime release \| 26\.928\.40906-darwin-arm64/);
  assert.match(text, /\| warm\.getAXState \| 90 \| 87 \| 3 \| 0 \|/);
  assert.match(text, /\| warm\.getScreenshot \| bytes 1500 \(1000–2000\); format jpeg; sha256 6 distinct \|/);
  assert.match(text, /## Invalidated samples\n\n- warm\.getAXState, run-1 sample 30: the scratch document was not in front/);
  assert.match(text, /No problems/);
});

test('the CLI summary command writes summary.md beside the runs', t => {
  const dir = fixture(t);
  const result = spawnSync(process.execPath, [SCRIPT, 'summary', dir], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, 'summary.md'), 'utf8'), /\| task\.total \| 30 \| 27 \| 0 \| 3 \|/);
});

test('a run recorded with host attestation must cover its whole plan; a legacy run is not held to it', t => {
  const plan = {samples: 30, cold: 5, tasks: 10};
  const attested = {host: 'vendor', connections: 1, plan, sandbox: {mode: 'scoped', explicit: false}, hostAttestations: [{host: 'vendor', serverInfo: {name: 'node_repl', version: '0.1.0'}, _meta: null}]};
  const problems = summarize(readRuns(fixture(t, [meta(1, attested)]))).problems;
  // rowsFor covers 30 warm.noop samples and 5 cold connections, and only 2 screenshots, no getState, no tasks' steps.
  assert.ok(!problems.some(p => /warm\.noop|cold connections/.test(p)), problems.join(' | '));
  assert.ok(problems.includes('run-1 covers 2 warm.getScreenshot samples, the plan 30'), problems.join(' | '));
  assert.ok(problems.includes('run-1 covers 0 task.act samples, the plan 10'), problems.join(' | '));
  assert.deepEqual(summarize(readRuns(fixture(t, [meta(1)]))).problems, []);
});
