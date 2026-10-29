// The Linux native suite's engine lanes, judged (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// The facade suites; M1b): the vendor engine's failure of the two text cases on x64 is a vendor defect declared with the
// engine it was observed on; the cua engine's M1b refusal of them is accepted by the run's assessment only as the exact
// temporary candidate expectation in scripts/repl-parity/expected/native-linux.json; and the diff of the two lanes
// pairs them by engine and accepts only the declared differences.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessAssertions, vendorDefects} from '../../scripts/repl-parity/vendor-defects.mjs';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
import {NATIVE_LINUX_EXPECTED, candidateExpectations, checkEnginePair, validateNativeLinuxExpected} from '../../scripts/repl-parity/native-linux.mjs';

const TYPE = 'native/app/typetext', PASTE = 'native/app/paste', KEY = 'native/app/presskey';
const RELEASE = '26.928.40906-linux-x64';
const text = values => [{type: 'text', text: 'NATIVE:' + JSON.stringify(values)}];
const FORMAT = [{error: 'Linux paste supports only text format.'}, {error: 'Linux paste supports only text format.'}];
const outcome = {
  vendor: {[TYPE]: [{error: 'editable Paste did not insert text'}, false, false], [PASTE]: [...FORMAT, {error: 'editable Paste did not insert text'}, false, false]},
  cua: {[TYPE]: [{error: 'type_text is not available in this engine build'}, false, false], [PASTE]: [...FORMAT, {error: 'type_text is not available in this engine build'}, false, false]},
};
const FAILED = {ok: false, reason: 'unrecognized native input error'};
const ended = id => ({case: id, cell: 'end-task', ok: true, content: [{type: 'text', text: '{"status":"ended"}'}], isError: false, meta: {'cua/replHost': {host: 'cua', version: '0.4.0'}}});
const exercise = (id, values) => ({case: id, cell: 'exercise', ok: true, content: text(values), isError: false, meta: {'cua/replHost': {host: 'cua', version: '0.4.0'}}});
const observed = engine => (engine === 'cua' ? '/w/native/linux-engine/target/release/cua-engine' : `/c/runtimes/${RELEASE}/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64`);
// One lane's run of the two text cases and one passing case, as repl-parity.mjs writes it (rows as emitted).
function lane(engine, {values = outcome[engine]} = {}) {
  const ids = [KEY, TYPE, PASTE];
  const rows = [exercise(KEY, [{inserted: true, cleared: true}]), ended(KEY), {case: KEY, assertion: {ok: true}}];
  for (const id of [TYPE, PASTE]) rows.push(exercise(id, values[id]), ended(id), {case: id, assertion: FAILED});
  const meta = {schema: 1, host: 'cua', platform: 'linux', device: 'cua-171', commit: 'c'.repeat(40), harnessCommit: 'c'.repeat(40), runtimeRelease: RELEASE, suite: 'native',
    engine, engineBin: engine === 'cua' ? observed('cua') : null, caseIds: ids, caseCells: Object.fromEntries(ids.map(id => [id, ['exercise', 'end-task']])),
    caseConfigurations: Object.fromEntries(ids.map(id => [id, {surfaces: ['computer'], sandbox: 'scoped'}])), caseProofs: Object.fromEntries(ids.map(id => [id, 'native-live'])),
    engineAnswered: ids.map(id => ({case: id, requested: engine, expected: observed(engine), error: null, observed: [{exe: observed(engine), kind: engine, parent: 'trusted-worker.mjs'}]})),
    complete: true, connections: ['connection-1'], hostAttestations: [{connection: 'connection-1', host: 'cua', serverInfo: {name: 'cua-repl-host', version: '0.4.0'}, _meta: {'cua/replHost': {host: 'cua', version: '0.4.0'}}, executionFacts: {ownNode: {path: '/n/node', version: 'v24.22.0'}}}]};
  return {meta, tools: {tools: []}, rows};
}

test('the expected file is valid and its temporary candidate expectations name the cua engine and the two text cases alone', () => {
  assert.deepEqual(candidateExpectations.map(c => [c.engine, c.case]), [['cua', TYPE], ['cua', PASTE]]);
  for (const c of candidateExpectations) assert.equal(c.until, 'M2');
  assert.throws(() => validateNativeLinuxExpected({...NATIVE_LINUX_EXPECTED, candidateExpectations: [{...candidateExpectations[0], engine: 'vendor'}]}), /candidate expectation/);
  assert.throws(() => validateNativeLinuxExpected({...NATIVE_LINUX_EXPECTED, candidateExpectations: [{...candidateExpectations[0], case: KEY}]}), /candidate expectation/);
  assert.throws(() => validateNativeLinuxExpected({...NATIVE_LINUX_EXPECTED, declarations: [{...NATIVE_LINUX_EXPECTED.declarations[0], vendorDefect: 'forged'}]}), /declaration/);
  assert.ok(vendorDefects.some(d => d.engine === 'vendor' && d.case === TYPE && d.runtimeRelease === RELEASE));
});

test('the vendor lane on x64: the text cases are the declared vendor defect of the vendor engine, recorded, never passed', () => {
  const run = lane('vendor');
  const assessed = assessAssertions(run.meta, run.rows);
  assert.deepEqual(assessed.unexpectedFailures, []);
  assert.deepEqual(assessed.vendorDefects.map(d => d.case), [TYPE, PASTE]);
  assert.equal(assessed.coveredCases, 1);
  // The declaration names its engine: the cua lane, another release, or another outcome is not that defect.
  for (const mutate of [r => { r.meta.engine = 'cua'; }, r => { r.meta.runtimeRelease = '26.928.40906-linux-arm64'; }, r => { r.rows[3].content = text([{error: 'other'}, false, false]); }, r => { r.rows[3].content = text([{error: 'editable Paste did not insert text'}, true, false]); }]) {
    const changed = lane('vendor'); mutate(changed);
    assert.ok(assessAssertions(changed.meta, changed.rows).unexpectedFailures.some(r => r.case === TYPE));
  }
});

test('the cua lane in M1b: the run accepts exactly the temporary candidate expectations, for exactly the two text cases', () => {
  const run = lane('cua');
  const assessed = assessAssertions(run.meta, run.rows);
  assert.deepEqual(assessed.unexpectedFailures, []);
  assert.deepEqual(assessed.candidateExpectations.map(c => c.case), [TYPE, PASTE]);
  assert.deepEqual(assessed.vendorDefects, []);
  // The text reaching the field, the window gone, another sentence, the vendor lane, or another case: not accepted.
  for (const values of [[{error: 'type_text is not available in this engine build'}, true, false], [{error: 'type_text is not available in this engine build'}, false, true], [{error: 'other'}, false, false]]) {
    const changed = lane('cua', {values: {...outcome.cua, [TYPE]: values}});
    assert.ok(assessAssertions(changed.meta, changed.rows).unexpectedFailures.some(r => r.case === TYPE), JSON.stringify(values));
  }
  const vendorLane = lane('cua'); vendorLane.meta.engine = 'vendor';
  assert.equal(assessAssertions(vendorLane.meta, vendorLane.rows).unexpectedFailures.length, 2);
  const otherCase = lane('cua'); otherCase.rows[2] = {case: KEY, assertion: FAILED};
  assert.ok(assessAssertions(otherCase.meta, otherCase.rows).unexpectedFailures.some(r => r.case === KEY));
});

// Review fix 1: on the cua lane the temporary expectations decide the two text cases, before the shared oracle's
// success counts: the vendor's arm64 crash outcome, which that oracle accepts, is no pass for cua's engine.
test('the cua lane cannot pass the text cases by reproducing the vendor\'s crash', () => {
  const crash = 'D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying';
  for (const error of ['Resource temporarily unavailable (os error 11)', crash]) for (const reached of [null, false]) {
    const run = lane('cua', {values: {[TYPE]: [{error}, reached, true], [PASTE]: [...FORMAT, {error}, reached, true]}});
    for (const id of [TYPE, PASTE]) run.rows.find(r => r.case === id && r.assertion).assertion = {ok: true};
    const assessed = assessAssertions(run.meta, run.rows);
    assert.deepEqual(assessed.unexpectedFailures.map(r => r.case).sort(), [PASTE, TYPE], `${error} ${reached}`);
    assert.equal(assessed.coveredCases, 1);
  }
  // The vendor lane keeps the shared oracle: its arm64 outcome there is a pass.
  const vendor = lane('vendor', {values: {[TYPE]: [{error: 'Resource temporarily unavailable (os error 11)'}, null, true], [PASTE]: outcome.vendor[PASTE]}});
  vendor.rows.find(r => r.case === TYPE && r.assertion).assertion = {ok: true};
  assert.deepEqual(assessAssertions(vendor.meta, vendor.rows).unexpectedFailures, []);
});

test('the diff pairs the lanes by engine and is ok with only the declared text-case differences', () => {
  const result = compareParityRuns(lane('vendor'), lane('cua'), {engineDeclarations: NATIVE_LINUX_EXPECTED.declarations});
  assert.equal(result.ok, true, JSON.stringify(result.differences));
  assert.deepEqual(result.expected.map(e => e.case), [TYPE, PASTE]);
  // Without the declarations the lanes differ on exactly those cases.
  const plain = compareParityRuns(lane('vendor'), lane('cua'));
  assert.equal(plain.ok, false);
  assert.deepEqual([...new Set(plain.differences.map(d => d.case))].sort(), [PASTE, TYPE]);
  // Any other difference is still one.
  const cua = lane('cua'); cua.rows[0] = exercise(KEY, [{inserted: false, cleared: true}]);
  const other = compareParityRuns(lane('vendor'), cua, {engineDeclarations: NATIVE_LINUX_EXPECTED.declarations});
  assert.equal(other.ok, false);
  assert.ok(other.differences.some(d => d.case === KEY));
  // The lanes share their configuration: the Linux computer default on both, compared side to side.
  const sandbox = lane('cua'); sandbox.meta.caseConfigurations[KEY] = {surfaces: ['computer'], sandbox: 'disabled'};
  assert.ok(compareParityRuns(lane('vendor'), sandbox, {engineDeclarations: NATIVE_LINUX_EXPECTED.declarations}).differences.some(d => d.kind === 'configuration' && d.case === KEY));
  // A declaration nothing needed is itself a difference.
  const same = compareParityRuns(lane('vendor'), lane('cua', {values: outcome.vendor}), {engineDeclarations: NATIVE_LINUX_EXPECTED.declarations});
  assert.equal(same.ok, false);
  assert.ok(same.differences.some(d => d.kind === 'overdeclared'));
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
