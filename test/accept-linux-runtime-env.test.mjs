// The environment of M6a's live Linux runs (scripts/accept/linux-runtime-env.mjs, which linux-runtime-env.sh evaluates;
// #171 M6a, T6): nothing of the caller's desktop or session passes in (the harness's app-env.mjs lists), the user HOME is
// fresh and the run's, and CUA_HOME is the run's and fresh too, since the secret store follows HOME.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUS_VARS, DROPPED_VARS} from '../scripts/linux-engine-diff/app-env.mjs';
import {prepareRun, runEnvironment, shellLines} from '../scripts/accept/linux-runtime-env.mjs';

const RUN = '/w/run';
const REPO = fileURLToPath(new URL('..', import.meta.url));
const none = () => false;

test('the run\'s homes: HOME, the XDG directories, the runtime directory and CUA_HOME, all under the run', () => {
  const {set} = runEnvironment({run: RUN, env: {PATH: '/usr/bin'}, exists: none});
  assert.deepEqual(set, {
    HOME: '/w/run/user', XDG_CONFIG_HOME: '/w/run/user/.config', XDG_DATA_HOME: '/w/run/user/.local/share', XDG_STATE_HOME: '/w/run/user/.local/state',
    XDG_CACHE_HOME: '/w/run/user/.cache', XDG_RUNTIME_DIR: '/w/run/xdg-runtime', CUA_HOME: '/w/run/user/.local/share/cua',
  });
});

test('nothing of the caller\'s display, bus, accessibility bus or session manager passes in: app-env.mjs\'s lists and the display\'s own', () => {
  const {unset} = runEnvironment({run: RUN, env: {AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/1/at-spi/bus', SESSION_MANAGER: 'local/x:@/tmp/.ICE-unix/1'}, exists: none});
  for (const name of [...BUS_VARS, ...DROPPED_VARS, 'DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY']) assert.ok(unset.includes(name), name);
  assert.ok(unset.includes('AT_SPI_BUS_ADDRESS') && unset.includes('SESSION_MANAGER'));
});

test('negative control: a HOME that already exists is refused, never reused', () => {
  assert.throws(() => runEnvironment({run: RUN, env: {}, exists: path => path === '/w/run/user'}), /\/w\/run\/user already exists: the run's HOME must be fresh/);
  assert.throws(() => runEnvironment({run: RUN, env: {}, exists: path => path === '/w/run/xdg-runtime'}), /\/w\/run\/xdg-runtime already exists/);
});

test('negative control: a CUA_HOME the caller names must be the run\'s and fresh', () => {
  assert.throws(() => runEnvironment({run: RUN, env: {CUA_HOME: '/home/me/.local/share/cua'}, exists: none}), /CUA_HOME \/home\/me\/\.local\/share\/cua is not inside the run/);
  assert.throws(() => runEnvironment({run: RUN, env: {CUA_HOME: '/w/run/../elsewhere'}, exists: none}), /is not inside the run/);
  assert.throws(() => runEnvironment({run: RUN, env: {CUA_HOME: '/w/run/homes/e'}, exists: path => path === '/w/run/homes/e', realpath: path => path}), /CUA_HOME \/w\/run\/homes\/e already exists/);
  assert.equal(runEnvironment({run: RUN, env: {CUA_HOME: '/w/run/homes/e'}, exists: none}).set.CUA_HOME, '/w/run/homes/e');
});

test('negative control: a CUA_HOME under a symlink that leads out of the run is refused, though it lies in the run by its spelling', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-runtime-env-')));
  try {
    const run = join(root, 'run');
    const outside = join(root, 'outside');
    mkdirSync(run);
    mkdirSync(outside);
    symlinkSync(outside, join(run, 'link'));
    assert.throws(() => runEnvironment({run, env: {CUA_HOME: join(run, 'link', 'cua')}}), /CUA_HOME .*link\/cua is not inside the run.*: it resolves to .*outside\/cua/);
    // A deeper missing path under the link is refused the same way.
    assert.throws(() => runEnvironment({run, env: {CUA_HOME: join(run, 'link', 'a', 'b')}}), /is not inside the run/);
    // A run reached through a symlink is the run: its own CUA_HOME is accepted, and the homes are spelled by its real path.
    symlinkSync(run, join(root, 'run-alias'));
    const aliased = runEnvironment({run: join(root, 'run-alias'), env: {CUA_HOME: join(root, 'run-alias', 'homes', 'e')}});
    assert.equal(aliased.set.CUA_HOME, join(run, 'homes', 'e'));
    assert.equal(aliased.set.HOME, join(run, 'user'));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('negative control: CUA_SHIM_SANDBOX set, even empty, is refused: the runs are scoped', () => {
  assert.throws(() => runEnvironment({run: RUN, env: {CUA_SHIM_SANDBOX: ''}, exists: none}), /CUA_SHIM_SANDBOX is set/);
});

test('the shell lines unset and export with every value quoted', () => {
  assert.equal(shellLines({set: {HOME: "/w/it's"}, unset: ['DISPLAY']}), "unset DISPLAY\nexport HOME='/w/it'\\''s'\n");
});

test('preparing a run creates the fresh homes, the store and the runtime directory 0700, and refuses a second time', () => {
  const run = join(mkdtempSync(join(tmpdir(), 'cua-runtime-env-')), 'run');
  try {
    const {set} = prepareRun({run, env: {}});
    for (const dir of [set.HOME, set.XDG_CONFIG_HOME, set.XDG_DATA_HOME, set.XDG_STATE_HOME, set.XDG_CACHE_HOME]) assert.ok(existsSync(dir), dir);
    assert.equal(statSync(set.XDG_RUNTIME_DIR).mode & 0o777, 0o700);
    assert.equal(statSync(join(set.HOME, '.config', 'claude-secrets')).mode & 0o777, 0o700);
    assert.equal(existsSync(set.CUA_HOME), false);
    assert.throws(() => prepareRun({run, env: {}}), /already exists/);
  } finally {
    rmSync(join(run, '..'), {recursive: true, force: true});
  }
});

test('the run directory may exist (the workflow writes into it first); only the homes must be new', () => {
  const run = mkdtempSync(join(tmpdir(), 'cua-runtime-env-'));
  try {
    mkdirSync(join(run, 'scratch'));
    assert.doesNotThrow(() => prepareRun({run, env: {}}));
  } finally {
    rmSync(run, {recursive: true, force: true});
  }
});

// The bus stage asks doctor's module for its accessibility command by the module's path as an argument, never spliced
// into the program's source: a checkout whose path holds quotes still runs (task 156).
test('the bus stage takes doctor\'s accessibility command from a checkout whose path holds quotes', () => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'cua-env-')));
  try {
    const checkout = join(scratch, 'it\'s a "checkout"');
    mkdirSync(checkout);
    for (const part of ['scripts', 'src']) symlinkSync(join(REPO, part), join(checkout, part));
    const stubs = join(scratch, 'bin');
    mkdirSync(stubs);
    writeFileSync(join(stubs, 'dbus-send'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
    const run = spawnSync('bash', [join(checkout, 'scripts', 'accept', 'linux-runtime-env.sh'), '--bus-stage', '--', 'printf', 'ran'],
      {encoding: 'utf8', env: {...process.env, PATH: `${stubs}:${process.env.PATH}`}});
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, 'ran');
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
});
