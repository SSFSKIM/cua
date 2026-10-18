// #115 M2's opening probe (scripts/sandbox-probe/launch-env.mjs): does the environment node_repl hands each child's
// `$CODEX_CLI_PATH sandbox` carry TMPDIR and CODEX_HOME exactly as buildLaunch set them?
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchEnvVerdict, roleOfCommand} from '../../scripts/sandbox-probe/launch-env.mjs';

const launch = {cwd: '/h/run/s1', sessionTmp: '/h/run/s1/tmp', TMPDIR: '/h/run/s1/tmp', CODEX_HOME: '/h/state/codex'};
const call = (script, env, cwd = '/h/run/s1') => ({sub: 'sandbox', cwd, command: ['/r/node', '--experimental-vm-modules', `/h/run/s1/tmp/.tmpAb/${script}`, '/h/run/s1'], envValues: env});
const same = {TMPDIR: '/h/run/s1/tmp', CODEX_HOME: '/h/state/codex'};

test('the role is the script basename after the Node and its options; anything else is the kernel', () => {
  assert.equal(roleOfCommand(['/r/node', '--experimental-vm-modules', '/t/.tmpX/kernel.js', '--session-id', 'x']), 'kernel');
  assert.equal(roleOfCommand(['/r/node', '--experimental-vm-modules', '/t/.tmpX/trusted-worker.js', '/w']), 'worker');
  assert.equal(roleOfCommand(['/r/node', '--experimental-vm-modules', '/t/.tmpX/other.js']), 'kernel');
  assert.equal(roleOfCommand(['/r/node']), 'kernel');
});

test('both children carrying both values as the launch set them is ok', () => {
  const verdict = launchEnvVerdict({launches: [launch], invocations: [call('kernel.js', same), call('trusted-worker.js', same)]});
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.roles, {kernel: {TMPDIR: 'equal', CODEX_HOME: 'equal', calls: 1}, worker: {TMPDIR: 'equal', CODEX_HOME: 'equal', calls: 1}});
});

test('an absent or rewritten value fails, naming the role and the value', () => {
  const verdict = launchEnvVerdict({launches: [launch], invocations: [call('kernel.js', {CODEX_HOME: '/h/state/codex'}), call('trusted-worker.js', {...same, TMPDIR: '/var/folders/x/T/'})]});
  assert.equal(verdict.ok, false);
  assert.equal(verdict.roles.kernel.TMPDIR, 'absent');
  assert.equal(verdict.roles.worker.TMPDIR, 'rewritten');
});

test('no kernel launcher call at all is not ok: there is nothing the compat could read', () => {
  const verdict = launchEnvVerdict({launches: [launch], invocations: [call('trusted-worker.js', same)]});
  assert.equal(verdict.ok, false);
  assert.equal(verdict.roles.kernel, null);
});

test('an invocation is matched to the launch whose run directory it ran in; one matching none fails', () => {
  const other = {...launch, cwd: '/h/run/s2', TMPDIR: '/h/run/s2/tmp', sessionTmp: '/h/run/s2/tmp'};
  const ok = launchEnvVerdict({launches: [other, launch], invocations: [call('kernel.js', same), call('trusted-worker.js', same)]});
  assert.equal(ok.ok, true);
  const stray = launchEnvVerdict({launches: [launch], invocations: [call('kernel.js', same, '/elsewhere'), call('trusted-worker.js', same)]});
  assert.equal(stray.ok, false);
  assert.equal(stray.unmatched, 1);
});

test('an app-server call is not judged (the helper gets node_repl\'s whole environment)', () => {
  const verdict = launchEnvVerdict({launches: [launch], invocations: [{sub: 'app-server', cwd: '/', envValues: {}}, call('kernel.js', same), call('trusted-worker.js', same)]});
  assert.equal(verdict.ok, true);
});
