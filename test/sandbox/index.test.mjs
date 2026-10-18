// sandboxedLaunch (src/sandbox/index.mjs): what the own host spawns for one child. The command after `--` is the
// child itself (sandbox-exec execs it); the kernel's deny targets exist before its profile is rendered.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SandboxStateError, sandboxState} from '../../src/runtime/sandbox.mjs';
import {sandboxedLaunch} from '../../src/sandbox/index.mjs';

function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-launch-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const cwd = join(root, 'cua', 'run', 's');
  mkdirSync(join(cwd, 'tmp'), {recursive: true});
  return {root, cwd, denyRead: {deny: [join(root, 'home', 'store'), join(root, 'cua')], reexpose: [cwd, join(cwd, 'tmp')], metadataOnly: [join(root, 'cua'), join(root, 'cua', 'run')], tiers: []}};
}
const COMMAND = ['/fixture/node', '--experimental-vm-modules', '/fixture/kernel.mjs'];

test('macOS: sandbox-exec runs the command itself under the role\'s profile, with the sandbox\'s environment rule', t => {
  const {root, cwd, denyRead} = scratch(t);
  const env = {HOME: join(root, 'home'), TMPDIR: join(cwd, 'tmp'), PATH: '/usr/bin:/bin', NODE_REPL_AUTH_TOKEN: 'synthetic'};
  const kernel = sandboxedLaunch({platform: 'darwin', state: sandboxState('scoped', cwd), role: 'kernel', command: COMMAND, env, cwd: '/elsewhere', readPaths: ['/fixture'], denyRead});
  assert.equal(kernel.command, '/usr/bin/sandbox-exec');
  assert.equal(kernel.cwd, cwd, 'the state\'s sandbox cwd');
  assert.deepEqual(kernel.args.slice(kernel.args.indexOf('--') + 1), COMMAND);
  assert.deepEqual(kernel.env, {HOME: env.HOME, TMPDIR: env.TMPDIR, PATH: env.PATH, CODEX_SANDBOX: 'seatbelt', CODEX_SANDBOX_NETWORK_DISABLED: '1'});
  assert.equal(existsSync(join(root, 'home', 'store')), false, 'macOS creates no deny target: a missing one is denied at its path');
  assert.deepEqual(kernel.args.filter(a => a.startsWith('-DREADABLE_ROOT_3')), ['-DREADABLE_ROOT_3=/', `-DREADABLE_ROOT_3_EXCLUDED_0=${join(root, 'cua')}`,
    `-DREADABLE_ROOT_3_EXCLUDED_1=${join(root, 'home', 'store')}`], 'the kernel\'s profile excludes the deny list from /');
  assert.deepEqual(kernel.args.filter(a => a.startsWith('-DWRITABLE_ROOT_') && !a.includes('EXCLUDED')), [`-DWRITABLE_ROOT_0=${join(cwd, 'tmp')}`, `-DWRITABLE_ROOT_1=${cwd}`],
    'the run directory and its temp stay writable inside the denied home');
  const worker = sandboxedLaunch({platform: 'darwin', state: sandboxState('scoped', cwd), role: 'worker', command: COMMAND, env, cwd, readPaths: ['/fixture'], denyRead});
  assert.ok(!worker.args.some(a => a.startsWith('-DREADABLE_ROOT') || a.startsWith('-DREEXPOSED')), 'the worker\'s profile denies nothing');
  assert.match(worker.args[1], /\(allow file-read\*\)/, 'full read');
});

test('disabled runs the command as it is, in the given working directory, with the environment untouched', t => {
  const {cwd, denyRead} = scratch(t);
  const env = {TMPDIR: join(cwd, 'tmp'), NODE_REPL_AUTH_TOKEN: 'kept'};
  assert.deepEqual(sandboxedLaunch({platform: 'darwin', state: sandboxState('disabled', cwd), role: 'kernel', command: COMMAND, env, cwd: '/work', readPaths: [], denyRead}),
    {command: COMMAND[0], args: COMMAND.slice(1), env, cwd: '/work'});
});

test('a kernel without its deny list and a state the port cannot render are refused; Linux refuses a launch that names no helper', t => {
  const {cwd, denyRead} = scratch(t);
  const env = {TMPDIR: join(cwd, 'tmp')};
  assert.throws(() => sandboxedLaunch({platform: 'darwin', state: sandboxState('scoped', cwd), role: 'kernel', command: COMMAND, env, cwd, readPaths: [], denyRead: null}), SandboxStateError);
  assert.throws(() => sandboxedLaunch({platform: 'darwin', state: sandboxState('scoped', cwd), role: 'worker', command: COMMAND, env: {TMPDIR: 'relative'}, cwd, readPaths: [], denyRead}), SandboxStateError);
  assert.throws(() => sandboxedLaunch({platform: 'linux', state: undefined, role: 'worker', command: COMMAND, env, cwd, readPaths: [], denyRead}), {code: 'sandbox_unavailable'});
});

// Linux (#115 M3): the pinned helper runs the command with the role's profile as JSON; the kernel's denies its deny list
// (Linux's per-directory shape) with no network, the worker's denies nothing and has the network it is given; the helper
// is checked against its pinned hash first, and a missing deny target is created before the kernel's launch.
function linuxScratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-linux-launch-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const home = join(root, 'home'), cuaHome = join(root, 'cua'), cwd = join(cuaHome, 'run', 's');
  mkdirSync(join(cwd, 'tmp'), {recursive: true});
  mkdirSync(home);
  const helper = join(cuaHome, 'sandbox', 'rust-v0.163.0', 'codex-linux-sandbox');
  mkdirSync(join(helper, '..'), {recursive: true});
  writeFileSync(helper, '#!/bin/sh\nexec "$@"\n', {mode: 0o755});
  const deny = [join(home, '.config', 'claude-secrets'), join(home, '.config', 'cua'), ...['state', 'remote', 'chrome', 'run'].map(d => join(cuaHome, d))];
  return {root, home, cuaHome, cwd, helper: {path: helper, sha256: createHash('sha256').update(readFileSync(helper)).digest('hex')},
    denyRead: {deny, reexpose: [cwd, join(cwd, 'tmp')], metadataOnly: [], tiers: []}};
}
const entriesOf = profile => Object.fromEntries(profile.file_system.entries.map(e => [e.path.type === 'path' ? e.path.path : `:${e.path.value.kind}`, e.access]));

test('Linux: the pinned helper runs each role under its profile JSON, the kernel denied its deny list, only the worker on the network', t => {
  const {home, cuaHome, cwd, helper, denyRead} = linuxScratch(t);
  const env = {HOME: home, TMPDIR: join(cwd, 'tmp'), PATH: '/usr/bin:/bin:/usr/sbin:/sbin', NODE_REPL_AUTH_TOKEN: 'synthetic'};
  for (const [mode, state] of [['scoped', sandboxState('scoped', cwd)], ['default', undefined]]) {
    const kernel = sandboxedLaunch({platform: 'linux', state, role: 'kernel', command: COMMAND, env, cwd, readPaths: ['/fixture'], denyRead, helper});
    assert.equal(kernel.command, helper.path);
    assert.equal(kernel.cwd, cwd);
    assert.deepEqual(kernel.args.slice(0, 5), ['--sandbox-policy-cwd', cwd, '--command-cwd', cwd, '--permission-profile']);
    assert.deepEqual(kernel.args.slice(kernel.args.indexOf('--') + 1), COMMAND);
    const profile = JSON.parse(kernel.args[5]);
    assert.equal(profile.network, 'restricted', `${mode}: the kernel never has the network`);
    const access = entriesOf(profile);
    for (const path of denyRead.deny) assert.equal(access[path], 'none', `${mode}: ${path}`);
    assert.deepEqual([access[':root'], access['/fixture'], access[cwd]], ['read', 'read', 'read']);
    assert.deepEqual([access[':project_roots'], access[':tmpdir']], mode === 'scoped' ? ['write', 'write'] : [undefined, undefined]);
    assert.deepEqual(kernel.env, {HOME: home, TMPDIR: env.TMPDIR, PATH: env.PATH, CODEX_SANDBOX_NETWORK_DISABLED: '1'}, 'no seatbelt marker on Linux; the original\'s stripped names stay stripped');
    for (const network of ['restricted', 'enabled']) {
      const worker = sandboxedLaunch({platform: 'linux', state, role: 'worker', command: COMMAND, env, cwd, readPaths: ['/fixture'], denyRead, network, helper});
      const workerProfile = JSON.parse(worker.args[5]);
      assert.equal(workerProfile.network, network);
      assert.ok(!workerProfile.file_system.entries.some(e => e.access === 'none'), 'the worker denies nothing');
      assert.equal('CODEX_SANDBOX_NETWORK_DISABLED' in worker.env, network === 'restricted');
    }
  }
  for (const path of denyRead.deny.filter(p => p !== join(cuaHome, 'run'))) assert.equal(statSync(path).mode & 0o777, 0o700, `Linux created the missing deny target ${path}`);
  assert.equal(statSync(join(cuaHome, 'run')).mode & 0o777, 0o755, 'an existing target is left as it is');
  assert.equal(existsSync(join(cuaHome, 'sandbox')), true);
});

test('Linux: a helper that is missing or whose hash is not the pinned one refuses before anything is created', t => {
  const {home, cwd, helper, denyRead} = linuxScratch(t);
  const env = {HOME: home, TMPDIR: join(cwd, 'tmp')};
  const launch = which => () => sandboxedLaunch({platform: 'linux', state: sandboxState('scoped', cwd), role: 'kernel', command: COMMAND, env, cwd, readPaths: [], denyRead, helper: which});
  assert.throws(launch({...helper, sha256: '0'.repeat(64)}), error => error.code === 'sandbox_unavailable' && /not the pinned/.test(error.message));
  assert.throws(launch({...helper, path: `${helper.path}-absent`}), error => error.code === 'sandbox_unavailable' && /is not installed/.test(error.message));
  assert.equal(existsSync(denyRead.deny[0]), false, 'no deny target was created for a refused launch');
});
