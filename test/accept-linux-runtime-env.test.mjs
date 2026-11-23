// The environment of M6a's live Linux runs (scripts/accept/linux-runtime-env.mjs, which linux-runtime-env.sh evaluates;
// #171 M6a, T6): nothing of the caller's desktop or session passes in (the harness's app-env.mjs lists), the user HOME is
// fresh and the run's, and CUA_HOME is the run's and fresh too, since the secret store follows HOME.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BUS_VARS, DROPPED_VARS} from '../scripts/linux-engine-diff/app-env.mjs';
import {prepareRun, runEnvironment, shellLines} from '../scripts/accept/linux-runtime-env.mjs';

const RUN = '/w/run';
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
  assert.throws(() => runEnvironment({run: RUN, env: {CUA_HOME: '/w/run/homes/e'}, exists: path => path === '/w/run/homes/e'}), /CUA_HOME \/w\/run\/homes\/e already exists/);
  assert.equal(runEnvironment({run: RUN, env: {CUA_HOME: '/w/run/homes/e'}, exists: none}).set.CUA_HOME, '/w/run/homes/e');
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
