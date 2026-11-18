// #171 M5, T4's arm64 round, item (a): R1's arm64 vendor outcomes declared, scoped to the pinned arm64 release
// (26.928.40906-linux-arm64), in the per-architecture form T4's static round built. Measured by task 96 (the R1 pilot
// and three reruns of its vendor lane, 4 runs): typeText ends gedit on every run, answering either of two error texts
// (D-Bus ServiceUnknown 3 of 4, `Resource temporarily unavailable (os error 11)` 1 of 4); paste ends its own gedit 4 of
// 4 (ServiceUnknown); getAXState on a minimized window is x64's defect, 4 of 4. A declared outcome is a recorded vendor
// defect, never a pass, and is never applied to x64's runs, nor x64's to arm64's.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assessAssertions, vendorDefects } from '../../scripts/repl-parity/vendor-defects.mjs';
import { compareParityRuns } from '../../scripts/repl-parity/compare.mjs';
import { NATIVE_LINUX_EXPECTED, declarationsFor, validateNativeLinuxExpected } from '../../scripts/repl-parity/native-linux.mjs';
import scenarios from './scenarios/native.mjs';

const TYPE = 'native/app/typetext', PASTE = 'native/app/paste', MIN = 'native/target-app-decorated-tab/getaxstate/minimized', KEY = 'native/app/presskey';
const ARM64 = '26.928.40906-linux-arm64', X64 = '26.928.40906-linux-x64';
const text = (values) => [{ type: 'text', text: 'NATIVE:' + JSON.stringify(values) }];
const FORMAT = [{ error: 'Linux paste supports only text format.' }, { error: 'Linux paste supports only text format.' }];
const unknown = (name) => ({ error: `D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name ${name} was not provided by any .service files` });
const EAGAIN = { error: 'Resource temporarily unavailable (os error 11)' };
const MIN_VENDOR = [{ listed: false, others: true, focusedFront: true }, { error: 'Window <id> is unavailable.' }, { error: 'Window <id> is unavailable.' }, { error: 'Window <id> is unavailable.' }, { error: 'Window <id> is unavailable.' }, { restored: false }, { error: 'Window <id> is unavailable.' }];
const MIN_CUA = [{ listed: true, others: true, focusedFront: true }, { full: true, source: true, owned: true }, { error: 'Screenshot unavailable for window <id>.' }, { error: 'Window <id> is minimized; activate it first' }, 'undefined', { restored: true }, { bytes: true }];
// the arm64 pilot's own answers (task 96's R1 and its reruns)
const arm = { [TYPE]: [unknown(':1.63'), null, true], [PASTE]: [...FORMAT, unknown(':1.66'), null, true], [MIN]: MIN_VENDOR };
const cua = { [TYPE]: ['undefined', 1, false], [PASTE]: [...FORMAT, 'undefined', 1, false], [MIN]: MIN_CUA };

const ended = (id) => ({ case: id, cell: 'end-task', ok: true, content: [{ type: 'text', text: '{"status":"ended"}' }], isError: false });
const exercise = (id, values) => ({ case: id, cell: 'exercise', ok: true, content: text(values), isError: false });
/** One lane's rows, each case's assertion the real scenario's, as the live runner makes it. */
function lane(engine, values, release = ARM64) {
  const ids = [KEY, TYPE, PASTE, MIN];
  const rows = [exercise(KEY, [{ inserted: true, cleared: true }]), ended(KEY), { case: KEY, assertion: { ok: true } }];
  for (const id of [TYPE, PASTE, MIN]) {
    const result = exercise(id, values[id]);
    let assertion;
    try {
      assertion = scenarios.find((s) => s.id === id).assert({ results: [result, { isError: false, structuredContent: { status: 'ended' } }] });
    } catch (e) {
      assertion = { ok: false, reason: e.message };
    }
    rows.push(result, ended(id), { case: id, assertion });
  }
  const bin = engine === 'cua' ? '/w/cua-engine' : `/c/runtimes/${release}/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64`;
  const meta = { schema: 1, host: 'cua', platform: 'linux', device: 'cua-171-arm64', commit: 'c'.repeat(40), harnessCommit: 'c'.repeat(40), runtimeRelease: release, suite: 'native',
    engine, engineBin: engine === 'cua' ? bin : null, caseIds: ids, caseCells: Object.fromEntries(ids.map((id) => [id, ['exercise', 'end-task']])),
    caseConfigurations: Object.fromEntries(ids.map((id) => [id, { surfaces: ['computer'], sandbox: 'scoped' }])), caseProofs: Object.fromEntries(ids.map((id) => [id, 'native-live'])),
    engineAnswered: ids.map((id) => ({ case: id, requested: engine, expected: bin, error: null, observed: [{ exe: bin, kind: engine, parent: 'trusted-worker.mjs', service: engine }] })),
    complete: true, connections: ['connection-1'], hostAttestations: [{ connection: 'connection-1', host: 'cua', serverInfo: { name: 'cua-repl-host', version: '0.5.0' }, _meta: { 'cua/replHost': { host: 'cua', version: '0.5.0' } }, executionFacts: { ownNode: { path: '/n/node', version: 'v24.22.1' } } }] };
  return { meta, tools: { tools: [] }, rows };
}
const unexpected = (run) => assessAssertions(run.meta, run.rows).unexpectedFailures.map((r) => r.case);

test("arm64's three vendor outcomes are declared vendor defects of the arm64 release, recorded, never passed", () => {
  const run = lane('vendor', arm);
  const assessed = assessAssertions(run.meta, run.rows);
  assert.deepEqual(assessed.unexpectedFailures, []);
  assert.deepEqual(assessed.vendorDefects.map((d) => d.case), [TYPE, PASTE, MIN]);
  assert.equal(assessed.coveredCases, 1, 'only presskey passes');
  // typeText's second admitted text, and any session-bus unique name in the ServiceUnknown text
  assert.deepEqual(unexpected(lane('vendor', { ...arm, [TYPE]: [EAGAIN, null, true] })), []);
  assert.deepEqual(unexpected(lane('vendor', { ...arm, [TYPE]: [unknown(':1.7'), null, true], [PASTE]: [...FORMAT, unknown(':1.120'), null, true] })), []);
});

test("an arm64 vendor outcome other than the declared one is an unexpected failure: the declaration is exact", () => {
  for (const [what, values, failing] of [
    ['typeText with a third error text', { [TYPE]: [{ error: 'editable Paste did not insert text' }, null, true] }, TYPE],
    ['typeText that left gedit alive', { [TYPE]: [unknown(':1.63'), 0, false] }, TYPE],
    ['typeText whose marker landed', { [TYPE]: [EAGAIN, 1, true] }, TYPE],
    ['a ServiceUnknown naming a well-known name, not a unique one', { [TYPE]: [unknown('org.a11y.Bus'), null, true] }, TYPE],
    ["paste with typeText's other text, never seen on paste", { [PASTE]: [...FORMAT, EAGAIN, null, true] }, PASTE],
    ['paste that left gedit alive', { [PASTE]: [...FORMAT, unknown(':1.66'), null, false] }, PASTE],
    ['the minimized window listed', { [MIN]: [{ ...MIN_VENDOR[0], listed: true }, ...MIN_VENDOR.slice(1)] }, MIN],
  ]) assert.deepEqual(unexpected(lane('vendor', { ...arm, ...values })), [failing], what);
  // the arm64 declarations never hold on another release (x64's minimized outcome is x64's own declared defect, the
  // same text), nor on the cua engine
  assert.deepEqual(unexpected(lane('vendor', arm, X64)).sort(), [PASTE, TYPE].sort());
  assert.deepEqual(assessAssertions(lane('vendor', arm, X64).meta, lane('vendor', arm, X64).rows).vendorDefects.map((d) => d.id), ['linux-x64-vendor-engine-minimized-window-unavailable']);
  const asCua = lane('vendor', arm);
  asCua.meta.engine = 'cua';
  assert.deepEqual(unexpected(asCua).sort(), [MIN, PASTE, TYPE].sort());
});

test('an arm64 pair passes on its own declarations alone; x64 and arm64 never take each other\'s', () => {
  const own = declarationsFor(NATIVE_LINUX_EXPECTED, ARM64);
  assert.deepEqual(own.map((d) => d.case).sort(), [MIN, PASTE, TYPE].sort());
  assert.ok(own.every((d) => vendorDefects.find((v) => v.id === d.vendorDefect).runtimeRelease === ARM64));
  assert.ok(declarationsFor(NATIVE_LINUX_EXPECTED, X64).every((d) => !own.includes(d)));
  const pair = compareParityRuns(lane('vendor', arm), lane('cua', cua), { engineDeclarations: own });
  assert.equal(pair.ok, true, JSON.stringify(pair.differences));
  assert.deepEqual(pair.expected.map((e) => e.case).sort(), [MIN, PASTE, TYPE].sort());
  assert.equal(pair.allAssertionsPassed, false, 'declared outcomes are listed apart, never passes');
  // the second admitted text holds too
  assert.equal(compareParityRuns(lane('vendor', { ...arm, [TYPE]: [EAGAIN, null, true] }), lane('cua', cua), { engineDeclarations: own }).ok, true);
  // a cua lane that crashed too is never covered by the vendor's declaration
  const crashed = compareParityRuns(lane('vendor', arm), lane('cua', { ...cua, [TYPE]: [EAGAIN, null, true] }), { engineDeclarations: own });
  assert.equal(crashed.ok, false);
  assert.ok(crashed.differences.some((d) => d.case === TYPE));
  // the vendor now passing: a declaration nothing needed is itself a difference
  assert.ok(compareParityRuns(lane('vendor', { ...arm, [TYPE]: cua[TYPE] }), lane('cua', cua), { engineDeclarations: own }).differences.some((d) => d.kind === 'overdeclared' && d.case === TYPE));
});

test('each arm64 vendor defect states its counts and its evidence, and every admitted content fails the real assertion', () => {
  const arm64 = vendorDefects.filter((d) => d.engine === 'vendor' && d.runtimeRelease === ARM64);
  assert.deepEqual(arm64.map((d) => d.case).sort(), [MIN, PASTE, TYPE].sort());
  for (const d of arm64) {
    const contents = d.result.contents ?? [d.result.content];
    assert.equal(d.counts.outcomes.length, contents.length, d.id);
    assert.equal(d.counts.outcomes.reduce((a, b) => a + b, 0), d.counts.runs, `${d.id}: every run counted once`);
    assert.match(d.evidence, /^docs\/evidence\/2026-10-28-own-linux-engine\/m5\/arm64\/pilot\//, d.id);
    for (const content of contents) {
      const scenario = scenarios.find((s) => s.id === d.case);
      let assertion;
      try {
        assertion = scenario.assert({ results: [{ isError: false, content }, { isError: false, structuredContent: { status: 'ended' } }] });
      } catch (e) {
        assertion = { ok: false, reason: e.message };
      }
      assert.deepEqual(assertion, d.assertion, d.id);
    }
  }
  assert.doesNotThrow(() => validateNativeLinuxExpected(NATIVE_LINUX_EXPECTED));
});
