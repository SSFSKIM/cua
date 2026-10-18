// A cua home whose private entries are symlinked out of it (#115 M1, PR review): the kernel is denied each entry's real
// target, not only the home, on macOS (where the home is denied whole) and on Linux (where its private directories are
// listed one by one); the re-exposed entries (runtimes/, node/, this session's run directory) keep their real paths as
// re-exposures; a home that cannot be listed refuses. And no host read root may reopen what the kernel is denied: a
// root inside a deny target, outside every re-exposed path, refuses the kernel launch. On a Mac, sandbox-exec itself
// confirms the denial by real path.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sandboxState} from '../../src/runtime/sandbox.mjs';
import {sandboxedLaunch} from '../../src/sandbox/index.mjs';
import {denyListFor, realDenyList, roleProfile} from '../../src/sandbox/policy.mjs';
import {STORE_RELATIVE} from '../../src/secrets/store.mjs';

const SESSION = '7062c419-3288-4b60-970f-a808ecfcf291';
const OTHER = '0b4f6f43-2f5a-4c55-9c39-5d0bd0a1f0a2';
const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const onMac = {skip: (process.platform !== 'darwin' || !existsSync(SANDBOX_EXEC)) && 'needs macOS sandbox-exec'};

// A cua home and user home in a scratch directory, with `linked` entries of the home symlinked to directories outside
// it (`outside/<name>`, each holding a SENTINEL file). `run` linked keeps this session's and another session's run
// directories at the target.
function layout(t, linked = []) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-home-links-')));
  t.after(() => { chmodSync(join(root, 'cuahome'), 0o700); rmSync(root, {recursive: true, force: true}); });
  const home = join(root, 'cuahome'), user = join(root, 'user'), outside = join(root, 'outside');
  for (const dir of [home, join(user, STORE_RELATIVE), join(user, '.config', 'cua'), join(outside, 'control')]) mkdirSync(dir, {recursive: true});
  writeFileSync(join(outside, 'control', 'SENTINEL'), 'synthetic\n');
  for (const name of ['state', 'remote', 'chrome', 'staging', 'runtimes', 'node', 'run']) {
    const dir = linked.includes(name) ? join(outside, name) : join(home, name);
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'SENTINEL'), 'synthetic\n');
    if (linked.includes(name)) symlinkSync(dir, join(home, name));
  }
  const cwd = join(home, 'run', SESSION), sessionTmp = join(cwd, 'tmp'), other = join(home, 'run', OTHER);
  for (const dir of [sessionTmp, other]) mkdirSync(dir, {recursive: true});
  writeFileSync(join(other, 'SENTINEL'), 'synthetic\n');
  writeFileSync(join(cwd, 'SENTINEL'), 'synthetic\n');
  return {root, home, user, outside, cwd, sessionTmp, other};
}
const listFor = (l, platform = 'darwin') => realDenyList(denyListFor({home: l.home, env: {HOME: l.user}, sessionId: SESSION, sessionTmp: l.sessionTmp, platform}));
const launchFor = (l, {mode = 'scoped', denyRead = listFor(l), readPaths = [join(l.home, 'runtimes')], command = ['/usr/bin/true']} = {}) =>
  sandboxedLaunch({platform: 'darwin', state: sandboxState(mode, l.cwd) ?? undefined, role: 'kernel', command, env: {HOME: l.user, TMPDIR: l.sessionTmp, PATH: '/usr/bin:/bin'}, cwd: l.cwd, readPaths, denyRead});

const PRIVATE = ['state', 'remote', 'chrome', 'staging'];

test('macOS: each private entry symlinked out of the cua home is denied at its real target; re-exposed ones stay re-exposed', t => {
  const l = layout(t, [...PRIVATE, 'runtimes', 'node', 'run']);
  const list = listFor(l);
  for (const name of PRIVATE) assert.ok(list.deny.includes(join(l.outside, name)), `${name}: ${JSON.stringify(list.deny)}`);
  assert.ok(list.deny.includes(join(l.outside, 'run')), 'run/ linked out: its target is denied (other sessions)');
  for (const name of ['runtimes', 'node']) {
    assert.equal(list.deny.includes(join(l.outside, name)), false, `${name} is re-exposed, never denied`);
    assert.ok(list.reexpose.includes(join(l.outside, name)), `${name} re-exposed at its real path`);
  }
  assert.ok(list.reexpose.includes(join(l.outside, 'run', SESSION)), 'this session\'s run directory, re-exposed at its real path');
  assert.equal(list.deny.includes(join(l.outside, 'control')), false);
});

test('Linux: a symlinked state/, remote/, chrome/ or run/ is denied at its real target', t => {
  const l = layout(t, ['state', 'remote', 'chrome', 'run']);
  const list = listFor(l, 'linux');
  for (const name of ['state', 'remote', 'chrome', 'run']) assert.ok(list.deny.includes(join(l.outside, name)), `${name}: ${JSON.stringify(list.deny)}`);
  assert.ok(list.reexpose.includes(join(l.outside, 'run', SESSION)));
});

test('a cua home that cannot be listed refuses the confined launch, naming the home', {skip: process.getuid?.() === 0 && 'root reads any directory'}, t => {
  const l = layout(t, ['state']);
  chmodSync(l.home, 0o300);
  assert.throws(() => denyListFor({home: l.home, env: {HOME: l.user}, sessionId: SESSION, sessionTmp: l.sessionTmp, platform: 'darwin'}),
    error => error.code === 'sandbox_state_invalid' && error.message.includes(`the cua home ${l.home}`) && /EACCES/.test(error.message));
});

const READS = 'for p in "$@"; do cat "$p" >/dev/null 2>&1 && echo "$p allow" || echo "$p deny"; done';
const readsUnder = (l, mode, targets) => {
  const {command, args, env, cwd} = launchFor(l, {mode, command: ['/bin/sh', '-c', READS, 'probe', ...targets]});
  return Object.fromEntries(execFileSync(command, args, {env, cwd, encoding: 'utf8'}).trim().split('\n').map(line => line.split(' ')));
};

test('on a Mac, sandbox-exec denies the kernel each private entry\'s target by its real path, under scoped and default', onMac, t => {
  const l = layout(t, PRIVATE);
  const targets = [...PRIVATE.flatMap(name => [join(l.outside, name, 'SENTINEL'), join(l.home, name, 'SENTINEL')]), join(l.outside, 'control', 'SENTINEL')];
  for (const mode of ['scoped', 'default']) {
    const expected = Object.fromEntries(targets.map(path => [path, 'deny']));
    expected[join(l.outside, 'control', 'SENTINEL')] = 'allow';
    assert.deepEqual(readsUnder(l, mode, targets), expected, mode);
  }
});

// A run/ linked out: scoped is refused already (the port supports no symlinked writable root, and this session's run
// directory is one); under default the kernel reads its own run directory and no other session's.
test('on a Mac, a run/ symlinked out denies another session\'s run directory by its real path and keeps this one\'s', onMac, t => {
  const l = layout(t, ['run']);
  assert.throws(() => launchFor(l, {mode: 'scoped'}), /symlinked writable roots are not supported/);
  const own = join(l.outside, 'run', SESSION, 'SENTINEL'), other = join(l.outside, 'run', OTHER, 'SENTINEL');
  assert.deepEqual(readsUnder(l, 'default', [own, other, join(l.home, 'run', OTHER, 'SENTINEL')]), {[own]: 'allow', [other]: 'deny', [join(l.home, 'run', OTHER, 'SENTINEL')]: 'deny'});
});

test('a host read root inside a deny target, outside every re-exposed path, refuses the kernel launch', t => {
  const l = layout(t);
  const denyRead = listFor(l);
  for (const root of [join(l.home, 'state', 'node', 'bin'), join(l.home, 'run', OTHER, 'node', 'bin')]) {
    mkdirSync(root, {recursive: true});
    for (const mode of ['scoped', 'default']) {
      assert.throws(() => launchFor(l, {mode, denyRead, readPaths: [root]}),
        error => error.code === 'sandbox_conflict' && error.message.includes(root) && /JavaScript cells may not read/.test(error.message), `${root} (${mode})`);
      assert.throws(() => roleProfile({state: sandboxState(mode, l.cwd) ?? undefined, role: 'kernel', readPaths: [root], denyRead}), {code: 'sandbox_conflict'});
    }
    assert.ok(roleProfile({state: undefined, role: 'worker', readPaths: [root], denyRead}), 'the worker is denied nothing, so any root is its own');
  }
  // Inside a re-exposed path, or outside every target: fine.
  for (const root of [join(l.home, 'node'), join(l.home, 'runtimes', 'r', 'modules'), l.cwd, join(l.outside, 'control')]) {
    mkdirSync(root, {recursive: true});
    assert.ok(launchFor(l, {denyRead, readPaths: [root]}), root);
  }
});
