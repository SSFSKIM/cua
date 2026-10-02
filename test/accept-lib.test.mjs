// The acceptance runner's own rules (scripts/accept/lib.mjs): a status roll-up that never turns a skipped check into
// a pass, the suite summary it reads, the live TextEdit fixture's single permitted approval, the snapshot that proves
// a reinstall changed nothing, and the packaging/tracking policies.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, symlinkSync, utimesSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  approvalObservation, inventoryCheck, PROBE_SECRETS_PHASES, scenarioVerdict,
  diffSnapshots, forbiddenPaths, isTextEditApproval, missingFromPackage, PACKAGE_REQUIRED, rollup, snapshotTree, suiteVerdict, tapTotals, tokenLike,
} from '../scripts/accept/lib.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

test('an item passes only when every check passed; nothing evaluated is blocked, never a pass', () => {
  assert.equal(rollup([]), 'BLOCKED');
  assert.equal(rollup(['PASS', 'PASS']), 'PASS');
  assert.equal(rollup(['PASS', 'BLOCKED']), 'BLOCKED');
  assert.equal(rollup(['BLOCKED', 'FAIL', 'PASS']), 'FAIL');
});

test('the node:test summary is read whole or not at all', () => {
  const summary = '1..3\n# tests 3\n# suites 0\n# pass 2\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 5\n';
  assert.deepEqual(tapTotals(`ok 1 - a\n${summary}`), {tests: 3, pass: 2, fail: 1, cancelled: 0, skipped: 0, todo: 0});
  assert.equal(tapTotals('ok 1 - a\n# tests 3\n'), null);
  assert.equal(tapTotals(''), null);
});

test('a required suite passes only with positive executed coverage: nothing run, skipped or TODO is never a pass', () => {
  const totals = over => ({tests: 10, pass: 10, fail: 0, cancelled: 0, skipped: 0, todo: 0, ...over});
  assert.equal(suiteVerdict({code: 0, totals: totals()}).status, 'PASS');
  assert.equal(suiteVerdict({code: 0, totals: totals({tests: 0, pass: 0})}).status, 'BLOCKED');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9, skipped: 1})}).status, 'BLOCKED');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9, todo: 1})}).status, 'BLOCKED');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9, fail: 1})}).status, 'FAIL');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9, cancelled: 1})}).status, 'FAIL');
  assert.equal(suiteVerdict({code: 1, totals: totals()}).status, 'FAIL');
  assert.equal(suiteVerdict({code: 0, totals: totals({pass: 9})}).status, 'FAIL');
  assert.equal(suiteVerdict({code: 0, totals: null}).status, 'FAIL');
});

const approval = (overrides = {}, meta = {}) => ({
  jsonrpc: '2.0', id: 0, method: 'elicitation/create',
  params: {
    message: 'Allow Computer Use to use "TextEdit"?', mode: 'form', requestedSchema: {type: 'object', properties: {}},
    _meta: {
      codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', persist: ['session', 'always'],
      tool_name: 'get_app_state', tool_params: {app: 'com.apple.TextEdit'},
      tool_params_display: [{name: 'app', display_name: 'App', value: 'TextEdit'}], ...meta,
    },
    ...overrides,
  },
});

test('the live fixture accepts the vendor\'s TextEdit approval and nothing else', () => {
  assert.equal(isTextEditApproval(approval()), true);
  // Another app, by name or by bundle identifier, or a lookalike.
  assert.equal(isTextEditApproval(approval({message: 'Allow Computer Use to use "Notes"?'}, {tool_params: {app: 'com.apple.Notes'}})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'com.apple.Notes'}})), false);
  assert.equal(isTextEditApproval(approval({message: 'Allow Computer Use to use "TextEdit Pro"?'})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'com.apple.TextEdit.evil'}})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'com.apple.TextEdit', extra: 1}})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: undefined})), false);
  // A message that merely contains the right text, a request asking for input, another connector, another method.
  assert.equal(isTextEditApproval(approval({message: 'Please: Allow Computer Use to use "TextEdit"?'})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: {type: 'object', properties: {password: {type: 'string'}}}})), false);
  assert.equal(isTextEditApproval(approval({}, {connector_id: 'something-else'})), false);
  assert.equal(isTextEditApproval({...approval(), method: 'sampling/createMessage'}), false);
  // Only the pinned form shape: not URL mode, not a missing, null or non-object schema.
  assert.equal(isTextEditApproval(approval({mode: 'url', url: 'https://example.com/approve'})), false);
  assert.equal(isTextEditApproval(approval({mode: undefined})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: null})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: undefined})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: {type: 'string', properties: {}}})), false);
  assert.equal(isTextEditApproval(approval({requestedSchema: {type: 'object'}})), false);
  // Near-miss app names and bundle identifiers.
  assert.equal(isTextEditApproval(approval({message: 'Allow Computer Use to use "Textedit"?'})), false);
  assert.equal(isTextEditApproval(approval({message: 'Allow Computer Use to use "TextEdit" ?'})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'com.apple.textedit'}})), false);
  assert.equal(isTextEditApproval(approval({}, {tool_params: {app: 'TextEdit'}})), false);
  assert.equal(isTextEditApproval(null), false);
});

test('a tree snapshot notices added, removed and rewritten entries, and an untouched tree compares equal', async t => {
  const s = scratch();
  t.after(s.cleanup);
  mkdirSync(join(s.dir, 'a', 'b'), {recursive: true});
  writeFileSync(join(s.dir, 'a', 'b', 'file'), 'one');
  symlinkSync('b/file', join(s.dir, 'a', 'link'));
  const before = snapshotTree(s.dir);
  assert.equal(diffSnapshots(before, snapshotTree(s.dir)).same, true);
  writeFileSync(join(s.dir, 'a', 'b', 'file'), 'two');
  utimesSync(join(s.dir, 'a', 'b', 'file'), 1, 1);
  writeFileSync(join(s.dir, 'a', 'new'), '');
  const diff = diffSnapshots(before, snapshotTree(s.dir));
  assert.deepEqual(diff.changed.sort(), ['a', 'a/b/file']);
  assert.deepEqual(diff.added, ['a/new']);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.same, false);
});

test('archives, runtime trees, build output, credentials, logs, sockets and pointers are never tracked or packed', () => {
  const bad = ['ChatGPT-darwin-arm64.zip', 'runtimes/x/node', 'native/keychain/.build/release/cua-keychain', 'node_modules/x/index.js',
    'state/codex/auth.json', '.env', 'server.log', 'run/abc.sock', 'current.json'];
  assert.equal(forbiddenPaths(bad).length, bad.length);
  assert.deepEqual(forbiddenPaths(['src/runtime/install.mjs', 'runtime/releases/26.928.40906-darwin-arm64.json', 'README.md']), []);
});

test('the package must carry what runs, diagnoses and builds the helper', () => {
  const complete = [...PACKAGE_REQUIRED, 'runtime/releases/26.928.40906-darwin-arm64.json'];
  assert.deepEqual(missingFromPackage(complete), []);
  assert.deepEqual(missingFromPackage(complete.filter(p => p !== 'native/keychain/Package.swift')), ['native/keychain/Package.swift']);
  assert.deepEqual(missingFromPackage(PACKAGE_REQUIRED), ['runtime/releases/<release>.json']);
});

test('credential-looking strings are recognized, ordinary text is not', () => {
  // Assembled at run time so this file does not itself hold a token-shaped string the tracked-file scan would flag.
  const join = (...parts) => parts.join('');
  assert.equal(tokenLike(join('key = sk', '-proj-', 'abcdefghijklmnopqrstuvwxyz012345')), true);
  assert.equal(tokenLike(join('-----BEGIN OPENSSH ', 'PRIVATE KEY-----')), true);
  assert.equal(tokenLike(join('token gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789')), true);
  assert.equal(tokenLike('capability-token-for-test; sk-short; the sky service'), false);
});

const allProbeSteps = () => PROBE_SECRETS_PHASES.flatMap(p => p.steps).map(name => ({name, status: 'PASS', detail: ''}));

test('a live phase passes only when every expected step ran and passed; a step that never ran is blocked', () => {
  const steps = allProbeSteps();
  const phase = PROBE_SECRETS_PHASES.find(p => p.name.includes('every connection closed'));
  assert.equal(inventoryCheck(phase.name, steps, phase.steps).status, 'PASS');
  assert.equal(inventoryCheck(phase.name, steps.filter(s => s.name !== 'real serve: close'), phase.steps).status, 'BLOCKED');
  assert.match(inventoryCheck(phase.name, steps.filter(s => s.name !== 'real serve: close'), phase.steps).detail, /not executed: real serve: close/);
  const failed = steps.map(s => s.name === 'replaced value: close' ? {...s, status: 'FAIL'} : s);
  assert.equal(inventoryCheck(phase.name, failed, phase.steps).status, 'FAIL');
});

test('a child scenario\'s own verdict keeps every failure, even of a step no phase expects, and a missing report fails', () => {
  const expected = PROBE_SECRETS_PHASES.flatMap(p => p.steps);
  assert.equal(scenarioVerdict('v', {status: 'PASS', steps: allProbeSteps()}, expected).status, 'PASS');
  const extra = {status: 'FAIL', steps: [...allProbeSteps(), {name: 'unexpected', status: 'FAIL', detail: 'boom'}]};
  const verdict = scenarioVerdict('v', extra, expected);
  assert.equal(verdict.status, 'FAIL');
  assert.match(verdict.detail, /steps no phase expects: unexpected: FAIL/);
  assert.equal(scenarioVerdict('v', {status: 'PASS', steps: [...allProbeSteps(), {name: 'x', status: 'FAIL'}]}, expected).status, 'FAIL', 'a step failure is not hidden by a PASS status');
  assert.equal(scenarioVerdict('v', null, expected).status, 'FAIL');
  assert.equal(scenarioVerdict('v', {status: 'PASS', steps: []}, expected).status, 'FAIL');
  assert.equal(scenarioVerdict('v', {status: 'BLOCKED', steps: allProbeSteps()}, expected).status, 'BLOCKED');
});

test('per-connection approval is observed only with both connections bound, asked, answered and their files handled', () => {
  const conn = (name, over = {}) => ({name, bound: true, approvalRequests: 1, approvalsAccepted: 1, sessionFileWhileOpen: true, sessionFileAfterClose: false, ...over});
  const both = (a = {}, b = {}) => [conn('connection A', a), conn('connection B', b)];
  assert.equal(approvalObservation(both()).status, 'PASS');
  assert.equal(approvalObservation([conn('connection A')]).status, 'BLOCKED');
  assert.equal(approvalObservation(both({}, {bound: false})).status, 'BLOCKED');
  assert.equal(approvalObservation(both({approvalRequests: 0, approvalsAccepted: 0})).status, 'BLOCKED');
  assert.equal(approvalObservation(both({}, {sessionFileAfterClose: true})).status, 'FAIL');
  assert.equal(approvalObservation(both({}, {sessionFileAfterClose: null})).status, 'FAIL');
  assert.equal(approvalObservation(both({sessionFileWhileOpen: false})).status, 'FAIL');
  assert.equal(approvalObservation(both({approvalRequests: 2, approvalsAccepted: 1})).status, 'FAIL');
  assert.equal(approvalObservation(undefined).status, 'BLOCKED');
});
