import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/browser-parity.mjs';
import {deriveTraceAllowances, loadTraceAllowances} from '../../scripts/browser-parity/trace-tolerance.mjs';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';
import {execFileSync} from 'node:child_process';

const base = 'docs/evidence/2026-10-14-own-repl-host-parity/m2/';
const root = new URL('../../', import.meta.url).pathname;
const fixture = JSON.parse(readFileSync(new URL('./repl-host-expected-differences.json', import.meta.url), 'utf8'));
const withFixture = async (value, run) => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-trace-fixture-'));
  try { const file = join(dir, 'expected.json'); writeFileSync(file, JSON.stringify(value)); return await run(file); }
  finally { rmSync(dir, {recursive: true, force: true}); }
};
const capture = async run => {
  const lines = [], log = console.log; console.log = (...args) => lines.push(args.join(' '));
  try { return {code: await run(), lines}; } finally { console.log = log; }
};

test('recorded vendor variance replaces the M2 allowances without losing any of the seven expected traces', async () => {
  const result = await withFixture(fixture, file => capture(() => main(['diff', root + base + 'browser-vendor-host', root + base + 'browser-cua-host', '--expected', file])));
  assert.equal(result.code, 0);
  assert.deepEqual(result.lines, ['0 unexpected differences (59 cases, 151 cells, 7 expected)']);
});

const readRun = path => ({meta: JSON.parse(readFileSync(root + path + '/meta.json', 'utf8')), rows: readFileSync(root + path + '/results.jsonl', 'utf8').trim().split('\n').map(JSON.parse)});
const sourceA = readRun(fixture.pairs[0].a), sourceB = readRun(fixture.pairs[0].b);
const triples = entries => entries.map(e => [e.cases[0], e.cells[0], e.methods[0], e.maxDelta]).sort();

test('the first fixture derives exactly the old scope, with no other case, cell or method tolerated', () => {
  assert.deepEqual(triples(loadTraceAllowances(fixture)), [
    ['actions/slow-budget', 'late', 'Runtime.evaluate', 2],
    ['actions/slow-budget', 'late', 'Runtime.releaseObject', 2],
    ['actions/wait-for', 'visible', 'Runtime.evaluate', 1],
    ['actions/wait-for', 'visible', 'Runtime.releaseObject', 1],
    ['input/coordinates', 'drag', 'Runtime.evaluate', 1],
    ['input/coordinates', 'drag', 'Runtime.releaseObject', 1],
    ['waits/networkidle', 'idle', 'Page.lifecycleEvent', 4],
  ]);
});

test('bounds follow recorded counts rather than hardcoded M2 methods or limits', () => {
  const a = structuredClone(sourceA), b = structuredClone(sourceA);
  const row = b.rows.find(r => r.case === 'input/coordinates' && r.cell === 'drag');
  row.trace.push(...Array.from({length: 3}, () => ({cdp: 'Input.dispatchKeyEvent', kind: 'request'})));
  row.trace.push({cdp: 'Input.dispatchTouchEvent', kind: 'request'});
  assert.deepEqual(triples(deriveTraceAllowances(a, b)), [
    ['input/coordinates', 'drag', 'Input.dispatchKeyEvent', 3],
    ['input/coordinates', 'drag', 'Input.dispatchTouchEvent', 1],
  ]);
});

test('malformed, mixed-host, fake and unattested controls cannot establish vendor variance', () => {
  const mutations = [
    r => { r.meta = null; },
    r => { r.meta.complete = false; },
    r => { r.meta.host = 'cua'; },
    r => { r.meta.observedHost = 'cua'; },
    r => { r.meta.hostAttestations[0].host = 'cua'; },
    r => { r.meta.hostAttestations[0]._meta['cua/replHost'] = {host: 'cua', version: '0.1.0'}; },
    r => { delete r.meta.hostAttestations; },
    r => { r.meta.hostAttestations[0].connection = 'unattested'; },
    r => { r.meta.fake = true; },
    r => { r.meta.backend = 'fake'; },
    r => { r.meta.environment.CUA_REPL_HOST = 'cua'; },
    r => { r.meta.environment.CUA_BROWSER_SERVICE = 'vendor'; },
    r => { r.meta.environment.CUA_SHIM_SURFACES = 'all'; },
    r => { r.meta.dirty = true; },
    r => { r.meta.commit = 'unrecorded'; },
    r => { delete r.meta.release; },
    r => { delete r.meta.hostAttestations[0].executionFacts; },
    r => { r.meta.hostAttestations[0].executionFacts.commit = 'a'.repeat(40); },
    r => { r.meta.hostAttestations[0].executionFacts.dirty = true; },
    r => { r.meta.hostAttestations[0].executionFacts.release = 'other-runtime'; },
    r => { r.meta.attestations[0].service = 'vendor'; },
    r => { r.meta.attestations = []; },
    r => { r.rows[0].fake = true; },
  ];
  for (const mutate of mutations) {
    const a = structuredClone(sourceA); mutate(a);
    assert.throws(() => deriveTraceAllowances(a, sourceB), undefined, mutate.toString());
  }
});

test('even mutually matching bad provenance is rejected rather than treated as a valid context', () => {
  for (const mutate of [
    r => { r.meta.fake = true; },
    r => { r.meta.backend = 'fake'; },
    r => { delete r.meta.release; },
    r => { r.meta.observedHost = 'cua'; },
  ]) {
    const a = structuredClone(sourceA), b = structuredClone(sourceB); mutate(a); mutate(b);
    assert.throws(() => deriveTraceAllowances(a, b), undefined, mutate.toString());
  }
});

test('bad case manifests, traces, cardinality or semantic changes cannot become tolerances', () => {
  for (const mutate of [
    r => { r.meta.cases = []; },
    r => { r.meta.cases.push(r.meta.cases[0]); },
    r => { r.rows[0].value = 'changed'; },
    r => { r.rows.find(row => row.assertion).assertion.ok = false; },
    r => { r.rows.push(r.rows[0]); },
    r => { r.rows.pop(); },
    r => { delete r.rows[0].trace; },
    r => { r.rows[0].trace = [{cdp: 123}]; },
    r => { r.rows[0].trace = [null]; },
    r => { r.rows[0].trace = []; },
    r => { r.rows[0].pollingAllowance = {'Input.dispatchMouseEvent': 99}; },
  ]) {
    const a = structuredClone(sourceA); mutate(a);
    assert.throws(() => deriveTraceAllowances(a, sourceB), undefined, mutate.toString());
  }
  const a = structuredClone(sourceA), b = structuredClone(sourceB);
  a.rows = a.rows.filter(r => r.case !== 'actions/wait-for');
  b.rows = b.rows.filter(r => r.case !== 'actions/wait-for');
  assert.throws(() => deriveTraceAllowances(a, b), /manifest|case|evidence/i);
  assert.throws(() => deriveTraceAllowances(sourceA, sourceB, {cases: ['does/not-exist']}), /scope/);
});

test('fixture schema cannot smuggle in handwritten limits or uncommitted evidence', () => {
  for (const mutate of [
    f => { f.maxDelta = 100; },
    f => { f.pairs[0].methods = ['Runtime.evaluate']; },
    f => { f.pairs[0].cells = ['visible']; },
    f => { f.pairs[0].maxDelta = 100; },
    f => { f.pairs = []; },
    f => { f.pairs[0].a = f.pairs[0].b; },
    f => { f.pairs[0].cases = []; },
    f => { f.revision = 'HEAD'; },
    f => { f.revision = '0'.repeat(40); },
    f => { f.pairs[0].a = '/tmp/uncommitted-evidence'; },
    f => { f.pairs[0].a = 'docs/evidence/../uncommitted-evidence'; },
    f => { f.pairs[0].a = base + 'uncommitted-evidence'; },
    f => { f.pairs[0].b = base + 'browser-cua-host'; },
  ]) {
    const f = structuredClone(fixture); mutate(f);
    assert.throws(() => loadTraceAllowances(f), undefined, mutate.toString());
  }
});

test('every derived limit accepts its boundary and rejects out-of-bound, scope, method and semantic mutations', () => {
  const expected = loadTraceAllowances(fixture);
  for (const e of expected) {
    const row = sourceB.rows.find(r => r.case === e.cases[0] && r.cell === e.cells[0]);
    const a = [structuredClone(row), {case: row.case, assertion: {ok: true}}];
    const b = structuredClone(a);
    b[0].trace.push(...Array.from({length: e.maxDelta}, () => ({cdp: e.methods[0]})));
    const boundary = compareRuns(a, b, {expected});
    assert.equal(boundary.ok, true, JSON.stringify(e));
    assert.equal(boundary.expected.length, 1);
    assert.equal(compareRuns(b, a, {expected}).ok, true, 'the bound is symmetric');
    b[0].trace.push({cdp: e.methods[0]});
    assert.deepEqual(compareRuns(a, b, {expected}).differences.map(d => [d.case, d.cell, d.method]), [[row.case, row.cell, e.methods[0]]]);
    assert.equal(compareRuns(b, a, {expected}).ok, false, 'negative out-of-bound delta is rejected too');
    b[0].trace.pop();
    for (const field of ['case', 'cell']) {
      const x = structuredClone(a), y = structuredClone(b);
      x[0][field] = y[0][field] = 'outside-scope';
      if (field === 'case') x[1].case = y[1].case = 'outside-scope';
      assert.equal(compareRuns(x, y, {expected}).ok, false);
    }
    const changedMethod = structuredClone(a); changedMethod[0].trace.push({cdp: 'Input.dispatchKeyEvent'});
    assert.equal(compareRuns(a, changedMethod, {expected}).ok, false);
    const changedValue = structuredClone(b); changedValue[0].value = 'semantic mutation';
    assert.equal(compareRuns(a, changedValue, {expected}).ok, false);
    assert.equal(compareRuns(a, b.slice(1), {expected}).ok, false);
  }
});

// A Git tree is immutable too, but is not a committed capture and cannot be the fixture's provenance pin.
test('an evidence revision must name a commit rather than an arbitrary tree object', () => {
  const tree = execFileSync('git', ['rev-parse', `${fixture.revision}^{tree}`], {cwd: root, encoding: 'utf8'}).trim();
  assert.throws(() => loadTraceAllowances({...fixture, revision: tree}), /commit/i);
});
