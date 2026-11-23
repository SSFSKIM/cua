// The Linux native suite's engine lanes (#171, Plan of Work M2): positive cua text cases paired with the vendor
// engine's exact declared x64 defects. No candidate failure is accepted, and no unrelated difference is projected.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessAssertions, vendorDefects} from '../../scripts/repl-parity/vendor-defects.mjs';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
import {NATIVE_LINUX_EXPECTED, checkEnginePair, declarationsFor, validateNativeLinuxExpected} from '../../scripts/repl-parity/native-linux.mjs';
import scenarios from './scenarios/native.mjs';

const TYPE = 'native/app/typetext', PASTE = 'native/app/paste', KEY = 'native/app/presskey';
const RELEASE = '26.928.40906-linux-x64';
// x64's own declarations: a diff applies only those of its runs' release (M5's T4), and arm64's are declared beside them
const X64_DECLARATIONS = declarationsFor(NATIVE_LINUX_EXPECTED, RELEASE);
const text = values => [{type: 'text', text: 'NATIVE:' + JSON.stringify(values)}];
const FORMAT = [{error: 'Linux paste supports only text format.'}, {error: 'Linux paste supports only text format.'}];
const outcome = {
  vendor: {[TYPE]: [{error: 'editable Paste did not insert text'}, 0, false], [PASTE]: [...FORMAT, {error: 'editable Paste did not insert text'}, 0, false]},
  cua: {[TYPE]: ['undefined', 1, false], [PASTE]: [...FORMAT, 'undefined', 1, false]},
};
const ended = id => ({case: id, cell: 'end-task', ok: true, content: [{type: 'text', text: '{"status":"ended"}'}], isError: false, meta: {'cua/replHost': {host: 'cua', version: '0.4.0'}}});
const exercise = (id, values) => ({case: id, cell: 'exercise', ok: true, content: text(values), isError: false, meta: {'cua/replHost': {host: 'cua', version: '0.4.0'}}});
const observed = engine => (engine === 'cua' ? '/w/native/linux-engine/target/release/cua-engine' : `/c/runtimes/${RELEASE}/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64`);
// One lane's emitted rows. Run the real scenario assertion, just as the live runner does, so declarations track its reason.
function lane(engine, {values = outcome[engine]} = {}) {
  const ids = [KEY, TYPE, PASTE];
  const rows = [exercise(KEY, [{inserted: true, cleared: true}]), ended(KEY), {case: KEY, assertion: {ok: true}}];
  for (const id of [TYPE, PASTE]) {
    const result = exercise(id, values[id]); let assertion;
    try {assertion = scenarios.find(s => s.id === id).assert({results: [result, {isError: false, structuredContent: {status: 'ended'}}]});}
    catch (e) {assertion = {ok: false, reason: e.message};}
    rows.push(result, ended(id), {case: id, assertion});
  }
  const meta = {schema: 1, host: 'cua', platform: 'linux', device: 'cua-171', commit: 'c'.repeat(40), harnessCommit: 'c'.repeat(40), runtimeRelease: RELEASE, suite: 'native',
    engine, engineBin: engine === 'cua' ? observed('cua') : null, caseIds: ids, caseCells: Object.fromEntries(ids.map(id => [id, ['exercise', 'end-task']])),
    caseConfigurations: Object.fromEntries(ids.map(id => [id, {surfaces: ['computer'], sandbox: 'scoped'}])), caseProofs: Object.fromEntries(ids.map(id => [id, 'native-live'])),
    engineAnswered: ids.map(id => ({case: id, requested: engine, expected: observed(engine), error: null, observed: [{exe: observed(engine), kind: engine, parent: 'trusted-worker.mjs', service: engine}]})),
    complete: true, connections: ['connection-1'], hostAttestations: [{connection: 'connection-1', host: 'cua', serverInfo: {name: 'cua-repl-host', version: '0.4.0'}, _meta: {'cua/replHost': {host: 'cua', version: '0.4.0'}}, executionFacts: {ownNode: {path: '/n/node', version: 'v24.22.0'}}}]};
  return {meta, tools: {tools: []}, rows};
}

test('the expected file declares exact positive cua results against vendor defects of the same case', () => {
  assert.doesNotThrow(() => validateNativeLinuxExpected(NATIVE_LINUX_EXPECTED));
  const declaration = NATIVE_LINUX_EXPECTED.declarations[0];
  assert.throws(() => validateNativeLinuxExpected({...NATIVE_LINUX_EXPECTED, declarations: [{...declaration, vendorDefect: 'forged'}]}), /declaration/);
  assert.throws(() => validateNativeLinuxExpected({...NATIVE_LINUX_EXPECTED, declarations: [{...declaration, case: PASTE}]}), /declaration/);
  assert.throws(() => validateNativeLinuxExpected({...NATIVE_LINUX_EXPECTED, declarations: [{...declaration, cua: {assertion: {ok: false}, result: declaration.cua?.result}}]}), /declaration/);
  assert.ok(vendorDefects.some(d => d.engine === 'vendor' && d.case === TYPE && d.runtimeRelease === RELEASE));
});

test('the vendor x64 text failures are declared vendor-engine defects, recorded, never passed', () => {
  const run = lane('vendor'), assessed = assessAssertions(run.meta, run.rows);
  assert.deepEqual(assessed.unexpectedFailures, []);
  assert.deepEqual(assessed.vendorDefects.map(d => d.case), [TYPE, PASTE]);
  assert.equal(assessed.coveredCases, 1);
  for (const mutate of [r => {r.meta.engine = 'cua';}, r => {r.meta.runtimeRelease = '26.928.40906-linux-arm64';}, r => {r.rows[3].content = text([{error: 'other'}, 0, false]);}, r => {r.rows[3].content = text([{error: 'editable Paste did not insert text'}, 1, false]);}]) {
    const changed = lane('vendor'); mutate(changed);
    assert.ok(assessAssertions(changed.meta, changed.rows).unexpectedFailures.some(r => r.case === TYPE));
  }
});

test('the cua lane passes the two positive text cases and accepts neither the old refusal nor the vendor crash', () => {
  const run = lane('cua'), assessed = assessAssertions(run.meta, run.rows);
  assert.deepEqual(assessed.unexpectedFailures, []);
  assert.deepEqual(assessed.vendorDefects, []);
  assert.equal(assessed.coveredCases, 3);
  for (const tail of [[{error: 'type_text is not available in this engine build'}, 0, false], [{error: 'Resource temporarily unavailable (os error 11)'}, null, true], ['undefined', 2, false], ['undefined', null, false], ['undefined', 1, true]]) {
    const changed = lane('cua', {values: {...outcome.cua, [TYPE]: tail}});
    assert.ok(assessAssertions(changed.meta, changed.rows).unexpectedFailures.some(r => r.case === TYPE), JSON.stringify(tail));
  }
});

test('the diff accepts only the declared vendor failure versus exact positive cua result', () => {
  const result = compareParityRuns(lane('vendor'), lane('cua'), {engineDeclarations: X64_DECLARATIONS});
  assert.equal(result.ok, true, JSON.stringify(result.differences));
  assert.deepEqual(result.expected.map(e => e.case), [TYPE, PASTE]);
  const plain = compareParityRuns(lane('vendor'), lane('cua'));
  assert.equal(plain.ok, false);
  assert.deepEqual([...new Set(plain.differences.map(d => d.case))].sort(), [PASTE, TYPE]);
  // Even a passing assertion cannot cover an exercise result that is not the declaration's exact positive result.
  for (const values of [[{error: 'type_text is not available in this engine build'}, 0, false], ['undefined', 2, false], ['undefined', 1, true]]) {
    const cua = lane('cua', {values: {...outcome.cua, [TYPE]: values}});
    cua.rows.find(r => r.case === TYPE && r.assertion).assertion = {ok: true};
    assert.ok(compareParityRuns(lane('vendor'), cua, {engineDeclarations: X64_DECLARATIONS}).differences.some(d => d.kind === 'overdeclared' && d.case === TYPE));
  }
  const cua = lane('cua'); cua.rows[0] = exercise(KEY, [{inserted: false, cleared: true}]);
  assert.ok(compareParityRuns(lane('vendor'), cua, {engineDeclarations: X64_DECLARATIONS}).differences.some(d => d.case === KEY));
  const sandbox = lane('cua'); sandbox.meta.caseConfigurations[KEY] = {surfaces: ['computer'], sandbox: 'disabled'};
  assert.ok(compareParityRuns(lane('vendor'), sandbox, {engineDeclarations: X64_DECLARATIONS}).differences.some(d => d.kind === 'configuration' && d.case === KEY));
  // A declaration nothing needed is itself a difference: the vendor now passing cannot use its old defect.
  const same = compareParityRuns(lane('vendor', {values: outcome.cua}), lane('cua'), {engineDeclarations: X64_DECLARATIONS});
  assert.equal(same.ok, false);
  assert.ok(same.differences.some(d => d.kind === 'overdeclared'));
});

test('the declaration projects only content, isError and the case assertion, never other result fields or duplicate rows', () => {
  for (const mutate of [r => {r.rows[3].structuredContent = {unexpected: true};}, r => {r.rows[3].ok = false;}, r => {r.rows.push({...r.rows[3]});}, r => {r.rows.push({case: TYPE, assertion: {ok: false, reason: 'extra failure'}});}]) {
    const cua = lane('cua'); mutate(cua);
    assert.equal(compareParityRuns(lane('vendor'), cua, {engineDeclarations: X64_DECLARATIONS}).ok, false);
  }
});

test('checkEnginePair: one sitting, the vendor lane first and the cua lane second, each attested', () => {
  const [v, c] = [lane('vendor').meta, lane('cua').meta];
  assert.doesNotThrow(() => checkEnginePair(v, c, {declarations: NATIVE_LINUX_EXPECTED.declarations}));
  assert.throws(() => checkEnginePair(c, v, {declarations: NATIVE_LINUX_EXPECTED.declarations}), /vendor-engine run first/);
  assert.throws(() => checkEnginePair(v, {...v}, {declarations: NATIVE_LINUX_EXPECTED.declarations}), /same engine .*no expected/);
  assert.doesNotThrow(() => checkEnginePair(v, {...v}, {declarations: []}));
  assert.throws(() => checkEnginePair(v, {...c, commit: 'd'.repeat(40)}, {}), /two commits/);
  assert.throws(() => checkEnginePair(v, {...c, runtimeRelease: 'other'}, {}), /two vendor runtimes/);
  assert.throws(() => checkEnginePair(v, {...c, device: 'cua-gce'}, {}), /two devices/);
  assert.throws(() => checkEnginePair(v, {...c, engine: undefined}, {}), /names no engine/);
  assert.throws(() => checkEnginePair(v, {...c, engineAnswered: []}, {}), /did not answer.*records no engine observation/);
});

// M4's T4: getAXState's named variant on a minimized window. The declared vendor result fails the real scenario assertion with exactly
// the defect's reason, and the declared cua result passes it, so the declaration tracks the case as it is asserted.
test('the minimized getAXState declaration: the vendor result fails as its defect records, the cua result passes', () => {
  const GETAX = 'native/target-app-decorated-tab/getaxstate/minimized';
  const scenario = scenarios.find(s => s.id === GETAX);
  const declaration = NATIVE_LINUX_EXPECTED.declarations.find(d => d.case === GETAX);
  const defect = vendorDefects.find(d => d.id === declaration.vendorDefect);
  assert.equal(defect.engine, 'vendor');
  assert.equal(defect.runtimeRelease, RELEASE);
  const assess = result => {
    try {return scenario.assert({results: [result, {isError: false, structuredContent: {status: 'ended'}}]});}
    catch (e) {return {ok: false, reason: e.message};}
  };
  assert.deepEqual(assess({isError: false, content: defect.result.content}), defect.assertion);
  assert.deepEqual(assess({isError: false, content: declaration.cua.result.content}), declaration.cua.assertion);
});

// M5's T4: the declarations are per architecture. Each holds for the vendor runtime release its vendor defect names
// (26.928.40906-linux-x64, -linux-arm64), and a diff applies only those of the runs' own release: an arm64 pair is never
// held to x64's declarations, nor x64's to arm64's. arm64's own are declared from task 96's pilot (the arm64 round;
// native-linux-arm64.test.mjs proves them on arm64's outcomes).
const ARM64 = '26.928.40906-linux-arm64';

test('the declarations a diff applies are those of the runs\' own vendor release', () => {
  const x64 = declarationsFor(NATIVE_LINUX_EXPECTED, RELEASE), arm64 = declarationsFor(NATIVE_LINUX_EXPECTED, ARM64);
  assert.deepEqual(x64.map(d => d.id), ['linux-text-typetext-m2', 'linux-text-paste-m2', 'linux-getaxstate-minimized-m4']);
  assert.deepEqual(arm64.map(d => d.id), ['linux-text-typetext-m5-arm64', 'linux-text-paste-m5-arm64', 'linux-getaxstate-minimized-m5-arm64']);
  assert.ok(arm64.every(d => vendorDefects.find(v => v.id === d.vendorDefect).runtimeRelease === ARM64));
  assert.deepEqual(declarationsFor(NATIVE_LINUX_EXPECTED, '26.928.40906-linux-riscv64'), [], 'an architecture with none of its own takes none');
  // one declaration a case a release: a second for the same case and release is refused, as before
  assert.throws(() => validateNativeLinuxExpected({...NATIVE_LINUX_EXPECTED, declarations: [...NATIVE_LINUX_EXPECTED.declarations, {...arm64[0], id: 'again'}]}), /declaration/);
});

test("an x64 pair still passes on its declarations; an arm64 pair with x64's outcomes is held to arm64's and fails closed", () => {
  const x64 = compareParityRuns(lane('vendor'), lane('cua'), {engineDeclarations: X64_DECLARATIONS});
  assert.equal(x64.ok, true, JSON.stringify(x64.differences));
  const arm = engine => {const run = lane(engine); run.meta.runtimeRelease = ARM64; return run;};
  // x64's declarations applied to an arm64 pair: each is reported overdeclared, which the per-release choice avoids
  const all = compareParityRuns(arm('vendor'), arm('cua'), {engineDeclarations: X64_DECLARATIONS});
  assert.ok(all.differences.some(d => d.kind === 'overdeclared'));
  // arm64's own declarations do not hold for x64's outcomes: overdeclared, and the vendor failures undeclared
  const own = compareParityRuns(arm('vendor'), arm('cua'), {engineDeclarations: declarationsFor(NATIVE_LINUX_EXPECTED, ARM64)});
  assert.equal(own.ok, false);
  assert.deepEqual([...new Set(own.differences.filter(d => d.kind === 'overdeclared').map(d => d.case))].sort(), [PASTE, TYPE]);
  assert.ok(own.differences.some(d => d.kind === 'assertion' && d.case === TYPE));
});
