// The sandbox the own host launches its kernel under: the recovered `codex sandbox` argv, rendered as the pinned
// node_repl renders it (its live command lines on the mini, 2026-10-14), for cua's three modes; and the trusted roots
// the scoped preflight protects for each host.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SandboxStateError, sandboxArgs, sandboxPolicy, sandboxState, trustedCodePathsOf} from '../../src/runtime/sandbox.mjs';

const CWD = '/private/tmp/cua-cap-x/run/s';
const READS = ['/R/cua_node/bin', '/R/cua_node/lib/node_modules', '/var/folders/T/.tmpK'];
const COMMAND = ['/R/cua_node/bin/node', '--experimental-vm-modules', '/var/folders/T/.tmpK/kernel.js', '--session-id', 'abc', '--working-dir', CWD];
const HEAD = ['sandbox', '-c', 'shell_environment_policy.inherit="all"', '-c', 'default_permissions="node_repl"', '-c'];

test('scoped: the vendor\'s exact argv, read paths and profile entries in byte order, the network off', () => {
  const policy = sandboxPolicy(sandboxState('scoped', CWD), {readPaths: READS});
  assert.equal(policy.cwd, CWD);
  assert.deepEqual(sandboxArgs(policy, COMMAND), [...HEAD,
    'permissions.node_repl={filesystem = {"/R/cua_node/bin" = "read", "/R/cua_node/lib/node_modules" = "read", "/var/folders/T/.tmpK" = "read", ":root" = "read", ":tmpdir" = "write", ":workspace_roots" = {"." = "write"}}, network = {enabled = false}}',
    '--', ...COMMAND]);
});

test('default (no sandbox state on the call): everything readable, nothing writable', () => {
  const policy = sandboxPolicy(undefined, {readPaths: READS});
  assert.equal(policy.cwd, null);
  assert.equal(sandboxArgs(policy, COMMAND)[6],
    'permissions.node_repl={filesystem = {"/R/cua_node/bin" = "read", "/R/cua_node/lib/node_modules" = "read", "/var/folders/T/.tmpK" = "read", ":root" = "read"}, network = {enabled = false}}');
});

test('disabled is an explicit unconfined launch; a state the host cannot render is refused, never run unconfined', () => {
  assert.deepEqual(sandboxPolicy(sandboxState('disabled', CWD), {readPaths: READS}), {disabled: true, cwd: CWD});
  const refused = state => assert.throws(() => sandboxPolicy(state, {readPaths: READS}), SandboxStateError);
  refused(null);
  refused({permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries: []}}});
  refused({permissionProfile: {type: 'external'}, sandboxCwd: 'file:///x'});
  refused({permissionProfile: {type: 'managed', file_system: {type: 'unrestricted'}}, sandboxCwd: 'file:///x'});
  refused({permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries: [{path: {type: 'special', value: {kind: 'nowhere'}}, access: 'write'}]}}, sandboxCwd: 'file:///x'});
  refused({permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries: [{path: {type: 'path', path: 'relative'}, access: 'write'}]}}, sandboxCwd: 'file:///x'});
  refused({permissionProfile: {type: 'disabled'}, sandboxCwd: 'https://x'});
  assert.throws(() => sandboxPolicy(null), /invalid type: null, expected struct SandboxState/);
});

test('each host\'s launch is checked against its own trusted roots: cua\'s under its owned name, the vendor\'s under NODE_REPL_', () => {
  const env = {CUA_REPL_TRUSTED_CODE_PATHS: '/own/src/repl-host:/own/src/services', NODE_REPL_TRUSTED_CODE_PATHS: '/vendor/node_modules'};
  assert.deepEqual(trustedCodePathsOf({replHost: {host: 'cua'}, env}), ['/own/src/repl-host', '/own/src/services']);
  assert.deepEqual(trustedCodePathsOf({replHost: {host: 'vendor'}, env}), ['/vendor/node_modules']);
  assert.deepEqual(trustedCodePathsOf({env}), ['/vendor/node_modules'], 'a launch record without a host is the vendor\'s, as before the selection existed');
  assert.deepEqual(trustedCodePathsOf({replHost: {host: 'cua'}, env: {NODE_REPL_TRUSTED_CODE_PATHS: '/vendor'}}), [], 'the vendor\'s name never stands in for the own host\'s');
});
