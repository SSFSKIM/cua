import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/browser-parity.mjs';
import {deriveTraceAllowances, loadTraceAllowances} from '../../scripts/browser-parity/trace-tolerance.mjs';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';
import {execFileSync, spawnSync} from 'node:child_process';

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
const cdpRequest = cdp => ({kind: 'request', method: 'executeCdp', cdp});
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
  row.trace.push(...Array.from({length: 3}, () => cdpRequest('Input.dispatchKeyEvent')));
  row.trace.push(cdpRequest('Input.dispatchTouchEvent'));
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
    b[0].trace.push(...Array.from({length: e.maxDelta}, () => cdpRequest(e.methods[0])));
    const boundary = compareRuns(a, b, {expected});
    assert.equal(boundary.ok, true, JSON.stringify(e));
    assert.equal(boundary.expected.length, 1);
    assert.equal(compareRuns(b, a, {expected}).ok, true, 'the bound is symmetric');
    b[0].trace.push(cdpRequest(e.methods[0]));
    assert.deepEqual(compareRuns(a, b, {expected}).differences.map(d => [d.case, d.cell, d.method]), [[row.case, row.cell, e.methods[0]]]);
    assert.equal(compareRuns(b, a, {expected}).ok, false, 'negative out-of-bound delta is rejected too');
    b[0].trace.pop();
    for (const field of ['case', 'cell']) {
      const x = structuredClone(a), y = structuredClone(b);
      x[0][field] = y[0][field] = 'outside-scope';
      if (field === 'case') x[1].case = y[1].case = 'outside-scope';
      assert.equal(compareRuns(x, y, {expected}).ok, false);
    }
    const changedMethod = structuredClone(a); changedMethod[0].trace.push(cdpRequest('Input.dispatchKeyEvent'));
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

test('derived tolerances cannot erase an out-of-bound difference by losing either or both cell traces', async t => {
  const expected = loadTraceAllowances(fixture);
  for (const side of ['a', 'b', 'both']) for (const mutation of ['empty', 'delete']) {
    await t.test(`${side} trace ${mutation}`, () => {
      for (const e of expected) {
        const row = sourceB.rows.find(r => r.case === e.cases[0] && r.cell === e.cells[0]);
        const a = [structuredClone(row), {case: row.case, assertion: {ok: true}}], b = structuredClone(a);
        b[0].trace.push(...Array.from({length: e.maxDelta + 1}, () => cdpRequest(e.methods[0])));
        assert.equal(compareRuns(a, b, {expected}).ok, false, 'the intact out-of-bound trace fails first');
        const missingSides = side === 'both' ? ['a', 'b'] : [side];
        for (const missing of missingSides) {
          const changed = missing === 'a' ? a : b;
          if (mutation === 'empty') changed[0].trace = [];
          else delete changed[0].trace;
        }
        const result = compareRuns(a, b, {expected});
        assert.equal(result.ok, false);
        assert.deepEqual(result.differences.map(d => [d.kind, d.side, d.case, d.cell]), missingSides.map(missing => ['trace-availability', missing, row.case, row.cell]));
        assert.deepEqual(result.expected, [], 'count tolerances cannot waive missing trace evidence');
      }
    });
  }
});

test('CLI host comparisons reject missing or empty cell traces with and without derived tolerances', async t => {
  const own = readRun(base + 'browser-cua-host');
  for (const host of ['vendor', 'cua', 'both']) for (const mutation of ['empty', 'delete']) for (const withExpected of host === 'both' ? [true] : [true, false]) {
    await t.test(`${host} trace ${mutation}, expected=${withExpected}`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'cua-trace-target-'));
      try {
        for (const [name, original] of [['vendor', sourceB], ['cua', own]]) {
          const run = structuredClone(original);
          if (name === host || host === 'both') {
            const row = run.rows.find(r => r.case === 'actions/wait-for' && r.cell === 'visible');
            if (mutation === 'empty') row.trace = [];
            else delete row.trace;
          }
          mkdirSync(join(dir, name));
          writeFileSync(join(dir, name, 'meta.json'), JSON.stringify(run.meta));
          writeFileSync(join(dir, name, 'results.jsonl'), run.rows.map(JSON.stringify).join('\n') + '\n');
        }
        const args = [root + 'scripts/browser-parity.mjs', 'diff', join(dir, 'vendor'), join(dir, 'cua'), '--scenarios', 'actions/wait-for.mjs'];
        if (withExpected) args.push('--expected', new URL('./repl-host-expected-differences.json', import.meta.url).pathname);
        const result = spawnSync(process.execPath, args, {encoding: 'utf8'});
        assert.equal(result.status, 1, result.stdout + result.stderr);
        const differences = result.stdout.trim().split('\n').slice(0, -1).map(JSON.parse);
        assert.deepEqual(differences.map(d => [d.kind, d.side, d.case, d.cell]), (host === 'both' ? ['a', 'b'] : [host === 'vendor' ? 'a' : 'b']).map(side => ['trace-availability', side, 'actions/wait-for', 'visible']));
      } finally { rmSync(dir, {recursive: true, force: true}); }
    });
  }
});


test('uncalibrated getters accept empty arrays but reject absent host evidence; legacy services keep optional tracing', () => {
  const expected = loadTraceAllowances(fixture);
  const getter = sourceB.rows.find(r => r.case === 'tabs/discovery' && r.cell === 'list');
  assert.deepEqual(getter.trace, []);
  const a = [structuredClone(getter), {case: getter.case, assertion: {ok: true}}], b = structuredClone(a);
  assert.equal(compareRuns(a, b, {expected, requireTraceParity: true}).ok, true);
  delete b[0].trace;
  assert.deepEqual(compareRuns(a, b, {expected, requireTraceParity: true}).differences.map(d => [d.kind, d.side]), [['trace-availability', 'b']]);
  const legacy = structuredClone(a); legacy[0].trace = [cdpRequest('Runtime.evaluate')];
  assert.equal(compareRuns(legacy, b).ok, true);
});


const malformedTraces = [
  ['string', 'not-a-trace'],
  ['object', {0: cdpRequest('Runtime.releaseObject'), length: 1}],
  ['number', 1],
  ['null trace', null],
  ['primitive entry', [1]],
  ['null entry', [null]],
  ['array entry', [[]]],
  ['empty record', [{}]],
  ['missing kind', [{method: 'executeCdp', cdp: 'Runtime.releaseObject'}]],
  ['missing method', [{kind: 'request', cdp: 'Runtime.releaseObject'}]],
  ['null CDP field', [{...cdpRequest('Runtime.releaseObject'), cdp: null}]],
  ['invalid kind', [{...cdpRequest('Runtime.releaseObject'), kind: 'unknown'}]],
  ['invalid method', [{...cdpRequest('Runtime.releaseObject'), method: 1}]],
  ['invalid CDP type', [{...cdpRequest('Runtime.releaseObject'), cdp: 1}]],
  ['empty CDP token', [{...cdpRequest('Runtime.releaseObject'), cdp: ''}]],
  ['unsafe CDP token', [{...cdpRequest('Runtime.releaseObject'), cdp: 'Runtime.evaluate payload'}]],
];

test('host target trace schema is validated before counting and cannot consume a derived allowance', async t => {
  const expected = loadTraceAllowances(fixture);
  for (const side of ['a', 'b']) for (const [label, trace] of malformedTraces) {
    await t.test(`${side}: ${label}`, () => {
      const row = {case: 'input/coordinates', cell: 'drag', ok: true, value: 'stable', trace: [cdpRequest('Runtime.releaseObject')]};
      const a = [row, {case: row.case, assertion: {ok: true}}], b = structuredClone(a);
      (side === 'a' ? a : b)[0].trace = trace;
      const result = compareRuns(a, b, {expected});
      assert.equal(result.ok, false);
      assert.deepEqual(result.differences.map(d => [d.kind, d.side, d.case, d.cell]), [['configuration', side, row.case, row.cell]]);
      assert.deepEqual(result.expected, []);
    });
  }
});

test('CLI rejects malformed host target traces as evidence errors rather than allowances or crashes', async t => {
  const own = readRun(base + 'browser-cua-host');
  for (const host of ['vendor', 'cua']) for (const [label, trace] of malformedTraces) {
    await t.test(`${host}: ${label}`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'cua-trace-schema-'));
      try {
        for (const [name, original] of [['vendor', sourceB], ['cua', own]]) {
          const run = structuredClone(original);
          if (name === host) run.rows.find(r => r.case === 'actions/wait-for' && r.cell === 'visible').trace = trace;
          mkdirSync(join(dir, name));
          writeFileSync(join(dir, name, 'meta.json'), JSON.stringify(run.meta));
          writeFileSync(join(dir, name, 'results.jsonl'), run.rows.map(JSON.stringify).join('\n') + '\n');
        }
        for (const withExpected of [true, false]) {
          const args = [root + 'scripts/browser-parity.mjs', 'diff', join(dir, 'vendor'), join(dir, 'cua'), '--scenarios', 'actions/wait-for.mjs'];
          if (withExpected) args.push('--expected', new URL('./repl-host-expected-differences.json', import.meta.url).pathname);
          const result = spawnSync(process.execPath, args, {encoding: 'utf8'});
          assert.equal(result.status, 1, result.stdout + result.stderr);
          assert.equal(result.stderr, '', 'invalid trace evidence is reported without crashing the diff');
          const differences = result.stdout.trim().split('\n').slice(0, -1).map(JSON.parse);
          assert.deepEqual(differences.map(d => [d.kind, d.side, d.case, d.cell]), [['configuration', host === 'vendor' ? 'a' : 'b', 'actions/wait-for', 'visible']]);
        }
      } finally { rmSync(dir, {recursive: true, force: true}); }
    });
  }
});

test('the recorded host trace union preserves requests and notifications with and without CDP methods', () => {
  const rows = sourceB.rows.flatMap(r => r.trace ?? []);
  const union = [
    rows.find(r => r.kind === 'request' && r.cdp),
    rows.find(r => r.kind === 'request' && !r.cdp),
    rows.find(r => r.kind === 'notification' && r.cdp),
    rows.find(r => r.kind === 'notification' && !r.cdp),
  ];
  assert.equal(union.every(Boolean), true);
  const a = [{case: 'trace/union', cell: 'events', ok: true, value: 'same', trace: union}, {case: 'trace/union', assertion: {ok: true}}];
  assert.equal(compareRuns(a, structuredClone(a), {requireTraceParity: true}).ok, true);
  const control = structuredClone(sourceA); control.rows[0].trace = [{}];
  assert.throws(() => deriveTraceAllowances(control, sourceB), /trace/i);
});


test('host cells require trace arrays even for getters while assertions and legacy service cells may omit them', () => {
  const getter = sourceB.rows.find(r => r.case === 'tabs/discovery' && r.cell === 'list');
  const a = [structuredClone(getter), {case: getter.case, assertion: {ok: true}}], b = structuredClone(a);
  delete a[0].trace; delete b[0].trace;
  assert.deepEqual(compareRuns(a, b, {requireTraceParity: true}).differences.map(d => [d.kind, d.side]), [['trace-availability', 'a'], ['trace-availability', 'b']]);
  assert.equal(compareRuns(a, b).ok, true);
});

test('malformed present legacy traces are invalid evidence too, not the legacy missing-trace exception', () => {
  for (const [label, trace] of malformedTraces) {
    const a = [{case: 'trace/legacy', cell: 'read', ok: true, value: 'same', trace}, {case: 'trace/legacy', assertion: {ok: true}}];
    const result = compareRuns(a, structuredClone(a));
    assert.equal(result.ok, false, label);
    assert.deepEqual(result.differences.map(d => [d.kind, d.side]), [['configuration', 'a'], ['configuration', 'b']], label);
  }
});

test('bounded CDP tokens allowed by the host producer are counted without object-prototype collisions', () => {
  for (const cdp of ['__proto__', 'constructor']) {
    const a = [{case: 'trace/token', cell: 'read', ok: true, trace: [cdpRequest(cdp)]}, {case: 'trace/token', assertion: {ok: true}}];
    const b = structuredClone(a); b[0].trace.push(cdpRequest(cdp));
    const result = compareRuns(a, b, {requireTraceParity: true});
    assert.deepEqual(result.differences.map(d => [d.kind, d.method, d.a, d.b]), [['trace', cdp, 1, 2]]);
  }
});
