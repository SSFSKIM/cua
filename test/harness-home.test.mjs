// Every harness layout gives its scratch CUA_HOME a user HOME beside it, never inside it (scripts/harness-home.mjs):
// #115 M1's own host refuses a layout whose secret store or ~/.config/cua lies inside CUA_HOME.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {homeOutside, removeScratchHomes, userHomeBeside} from '../scripts/harness-home.mjs';
import {siblingLayout} from '../scripts/repl-parity/prepare-device.mjs';
import {buildLaunch, BROWSER_SERVICE} from '../src/runtime/launch.mjs';
import {assertSandboxFits} from '../src/runtime/sandbox.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {fixturePin} from './fixtures/runtime-fixture.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const SESSION = '7062c419-3288-4b60-970f-a808ecfcf291';

test('the user HOME is the cua home\'s sibling, outside it, and goes with it', t => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'cua-harness-home-')));
  t.after(() => rmSync(parent, {recursive: true, force: true}));
  const cua = join(parent, 'parity-AbC123');
  assert.equal(userHomeBeside(cua), `${cua}.home`);
  assert.equal(homeOutside(cua, userHomeBeside(cua)), true);
  assert.equal(homeOutside(cua, join(cua, 'home')), false, 'the old nested layout');
  assert.equal(homeOutside(join(cua, 'home'), cua), false, 'nor the reverse');
  mkdirSync(cua); mkdirSync(userHomeBeside(cua));
  removeScratchHomes(cua);
  assert.deepEqual([existsSync(cua), existsSync(userHomeBeside(cua))], [false, false]);
});

// No harness layout may nest a user HOME inside its cua home again: each scratch layout takes its HOME from the helper.
test('every prepared harness layout takes its user HOME from userHomeBeside, none as <cua home>/home', () => {
  for (const file of ['scripts/repl-parity/prepare-device.mjs', 'scripts/repl-parity/remote-device.mjs', 'scripts/repl-parity/selection-device.mjs',
    'scripts/browser-parity/capability-home.mjs', 'scripts/native-baseline/prepare.mjs']) {
    const source = readFileSync(join(REPO, file), 'utf8');
    assert.match(source, /userHomeBeside\(/, file);
    assert.doesNotMatch(source, /join\((?:home|endpoint\.home|dir),\s*'home'\)/, `${file} nests no HOME in its cua home`);
  }
});

test('a preparation from a side that still nests its HOME is moved to the sibling layout; a current one is left alone', () => {
  const home = '/u/.local/share/cua-parity-remote/parity-x', nested = `${home}/home`;
  const old = {ownedPreparation: {home}, userHome: nested, environment: {HOME: nested, CHROME_CONFIG_HOME: `${nested}/.config`, XDG_CONFIG_HOME: `${nested}/.config`, CUA_HOME: home, PATH: '/usr/bin'}};
  const {prepared, move} = siblingLayout(old);
  assert.deepEqual(move, [nested, `${home}.home`]);
  assert.equal(prepared.userHome, `${home}.home`);
  assert.deepEqual(prepared.environment, {HOME: `${home}.home`, CHROME_CONFIG_HOME: `${home}.home/.config`, XDG_CONFIG_HOME: `${home}.home/.config`, CUA_HOME: home, PATH: '/usr/bin'});
  const current = {...old, userHome: `${home}.home`, environment: prepared.environment};
  assert.deepEqual(siblingLayout(current), {prepared: current, move: null});
});

// The own host's preflight on the prepared layout: accepted in scoped and default; the old nesting is what it refuses.
test('the own host\'s preflight accepts the sibling layout and refuses the nested one', t => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'cua-harness-home-')));
  t.after(() => rmSync(parent, {recursive: true, force: true}));
  const cua = join(parent, 'parity-AbC123');
  mkdirSync(cua);
  const runtime = runtimeFor({home: cua, pin: parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1})), record: null});
  const launch = HOME => buildLaunch({runtime, home: cua, sessionId: SESSION, ambient: {PATH: '/usr/bin:/bin', HOME, CUA_REPL_HOST: 'vendor'}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
  for (const mode of ['scoped', 'default']) assertSandboxFits(mode, launch(userHomeBeside(cua)));
  for (const mode of ['scoped', 'default']) assert.throws(() => assertSandboxFits(mode, launch(join(cua, 'home'))), {code: 'sandbox_conflict'}, mode);
});
