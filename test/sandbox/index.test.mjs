// sandboxedLaunch (src/sandbox/index.mjs): what the own host spawns for one child. The command after `--` is the
// child itself (sandbox-exec execs it); the kernel's deny targets exist before its profile is rendered.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
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

test('a kernel without its deny list and a state the port cannot render are refused; Linux renders nothing before M3', t => {
  const {cwd, denyRead} = scratch(t);
  const env = {TMPDIR: join(cwd, 'tmp')};
  assert.throws(() => sandboxedLaunch({platform: 'darwin', state: sandboxState('scoped', cwd), role: 'kernel', command: COMMAND, env, cwd, readPaths: [], denyRead: null}), SandboxStateError);
  assert.throws(() => sandboxedLaunch({platform: 'darwin', state: sandboxState('scoped', cwd), role: 'worker', command: COMMAND, env: {TMPDIR: 'relative'}, cwd, readPaths: [], denyRead}), SandboxStateError);
  assert.throws(() => sandboxedLaunch({platform: 'linux', state: undefined, role: 'worker', command: COMMAND, env, cwd, readPaths: [], denyRead}), {code: 'sandbox_unavailable'});
});
