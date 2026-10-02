// The acceptance runner's own rules (scripts/accept/lib.mjs): a status roll-up that never turns a skipped check into
// a pass, the suite summary it reads, the live TextEdit fixture's single permitted approval, the snapshot that proves
// a reinstall changed nothing, and the packaging/tracking policies.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, symlinkSync, utimesSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  diffSnapshots, forbiddenPaths, isTextEditApproval, missingFromPackage, PACKAGE_REQUIRED, rollup, snapshotTree, tapTotals, tokenLike,
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
  assert.equal(tokenLike('key = sk-proj-abcdefghijklmnopqrstuvwxyz012345'), true);
  assert.equal(tokenLike('-----BEGIN OPENSSH PRIVATE KEY-----'), true);
  assert.equal(tokenLike('token ghp_abcdefghijklmnopqrstuvwxyz0123456789'), true);
  assert.equal(tokenLike('capability-token-for-test; sk-short; the sky service'), false);
});
