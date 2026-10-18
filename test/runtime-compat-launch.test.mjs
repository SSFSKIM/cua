// The macOS vendor host's launch through cua's compat executable (#115 M2, spec Design "The compat executable"):
// CODEX_CLI_PATH names bin/cua-codex-compat by its real path, CUA_COMPAT_NODE the vendor's pinned Node, and the
// session's compat settings are written once per launch and removed with its session temp. The vendor-host preflight
// refuses a launch whose CODEX_CLI_PATH is not an executable file, since node_repl then runs its children unconfined.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BIN_DIR, COMPAT_EXECUTABLE, SANDBOX_DIR, buildLaunch, createLaunchDirs, removeLaunchDirs, BROWSER_SERVICE} from '../src/runtime/launch.mjs';
import {assertSandboxFits} from '../src/runtime/sandbox.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {claimRunSession} from '../src/runtime/run-dir.mjs';
import {compatFiles, locateSettings, readSettings} from '../src/sandbox/compat-settings.mjs';
import {fixturePin, linuxFixturePin, scratch, scratchUserHome} from './fixtures/runtime-fixture.mjs';

const SESSION = '6f1c2d3e-0000-4000-8000-0000000000c2';

function runtimeOf(t, pinJson) {
  const s = scratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  return {home, runtime: runtimeFor({home, pin: parsePin(pinJson), record: null})};
}
const darwin = t => runtimeOf(t, fixturePin({sha256: 'a'.repeat(64), length: 1}));
const ambient = t => ({HOME: scratchUserHome(t), PATH: '/usr/bin:/bin', LANG: 'C.UTF-8'});
const outcome = fn => { try { fn(); return null; } catch (error) { return error; } };

test('the macOS vendor host names the compat executable and its Node; bin/ is trusted code for both hosts', t => {
  const {home, runtime} = darwin(t);
  assert.equal(COMPAT_EXECUTABLE, realpathSync(fileURLToPath(new URL('../bin/cua-codex-compat', import.meta.url))));
  assert.equal(BIN_DIR, realpathSync(fileURLToPath(new URL('../bin', import.meta.url))));
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: ambient(t)});
  assert.equal(launch.env.CODEX_CLI_PATH, COMPAT_EXECUTABLE);
  assert.equal(launch.env.CUA_COMPAT_NODE, runtime.paths.node);
  assert.equal(launch.env.CODEX_HOME, join(home, 'state', 'codex'));
  assert.deepEqual(launch.env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').slice(0, 3), [runtime.paths.moduleDir, SANDBOX_DIR, BIN_DIR]);
  assert.deepEqual(launch.compat, {home, sessionId: SESSION, node: runtime.paths.node});
  const own = buildLaunch({runtime, home, sessionId: SESSION, ambient: ambient(t), replHost: {host: 'cua', reason: 'explicit', node: '/n/node'}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
  assert.ok(own.env.CUA_REPL_TRUSTED_CODE_PATHS.split(':').includes(BIN_DIR));
  assert.deepEqual([own.env.CODEX_CLI_PATH, own.env.CUA_COMPAT_NODE, own.compat], [undefined, undefined, null]);
});

test('Linux has no compat executable: its own host names no Codex CLI, compat Node or settings', t => {
  const {home, runtime} = runtimeOf(t, linuxFixturePin({arch: 'x64', sha256: 'a'.repeat(64), length: 1}));
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: ambient(t), resolveOwnNode: () => '/opt/node-24/bin/node'});
  assert.deepEqual([launch.env.CODEX_CLI_PATH, launch.env.CODEX_HOME, launch.env.CUA_COMPAT_NODE, launch.compat], [undefined, undefined, undefined, null]);
});

test('createLaunchDirs writes the session\'s compat settings beside the session temp; the compat reads them back from the launch\'s environment', t => {
  const {home, runtime} = darwin(t);
  for (const sandbox of ['scoped', 'disabled']) {
    const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: ambient(t), sandbox});
    createLaunchDirs(launch);
    const files = compatFiles({home, sessionId: SESSION});
    assert.equal(readFileSync(files.node, 'utf8'), `${runtime.paths.node}\n`);
    assert.deepEqual(readSettings(locateSettings(launch.env), launch.env), {denyRead: launch.denyRead, sessionTmp: launch.sessionTmp, home}, sandbox);
    assert.equal(sandbox === 'disabled' ? launch.denyRead : 'list', sandbox === 'disabled' ? null : 'list');
    removeLaunchDirs(launch);
    assert.equal(existsSync(files.json) || existsSync(files.node) || existsSync(launch.cwd), false, `${sandbox}: removed with the run directory`);
  }
});

test('the session\'s release removes its compat settings with its run directory', t => {
  const {home, runtime} = darwin(t);
  const claim = claimRunSession(home, SESSION);
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: ambient(t)});
  createLaunchDirs(launch);
  const files = compatFiles({home, sessionId: SESSION});
  assert.ok(existsSync(files.json) && existsSync(files.node));
  assert.deepEqual(claim.release(), []);
  assert.equal(existsSync(files.json) || existsSync(files.node) || existsSync(launch.cwd), false);
});

test('the vendor-host preflight refuses a CODEX_CLI_PATH that is unset, missing, a directory or not executable, under scoped and default', t => {
  const {home, runtime} = darwin(t);
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: ambient(t)});
  assertSandboxFits('scoped', launch);
  const plain = join(home, 'plain');
  writeFileSync(plain, '');
  chmodSync(plain, 0o644);
  mkdirSync(join(home, 'dir'));
  for (const [label, value] of [['unset', undefined], ['missing', join(home, 'absent')], ['a directory', join(home, 'dir')], ['not executable', plain], ['relative', 'bin/cua-codex-compat']]) {
    const env = {...launch.env};
    if (value === undefined) delete env.CODEX_CLI_PATH; else env.CODEX_CLI_PATH = value;
    for (const mode of ['scoped', 'default']) {
      const refused = outcome(() => assertSandboxFits(mode, {...launch, env}));
      assert.equal(refused?.code, 'sandbox_unavailable', `${label}, ${mode}`);
      assert.match(refused.message, /CODEX_CLI_PATH/);
    }
    assertSandboxFits('disabled', {...launch, env});
  }
});

test('a write root over the compat settings is refused by name', t => {
  const {home, runtime} = darwin(t);
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: ambient(t)});
  const refused = outcome(() => assertSandboxFits('scoped', {...launch, env: {...launch.env, TMPDIR: join(home, 'state', 'compat')}}));
  assert.equal(refused?.code, 'sandbox_conflict');
  assert.match(refused.message, /the vendor host's compat settings/);
});
