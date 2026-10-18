// The compat route's judgement (#115 M2, scripts/accept/compat-route.mjs): what one experiment.mjs native run on the
// macOS vendor host must show for acceptance 6 and the vendor host's share of 2 to 5.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compatRouteChecks} from '../scripts/accept/compat-route.mjs';
import {COMPAT_EXECUTABLE} from '../src/runtime/launch.mjs';

const ok = value => ({ok: true, value});
const passing = () => ({
  results: {banner: ok({ready: true}), 'listApps#1': ok({apps: 7}), 'Finder getApp+getAXState#1': ok({chars: 10}), 'listApps#2': ok({apps: 7}), 'Finder getAXState#2': ok({chars: 10}),
    confinement: ok({cwdWrite: 'ok', tmpdirIsSession: true, tmpdirWrite: 'ok', outsideWrite: 'EPERM', trustedWrite: 'EPERM', slashTmpWrite: 'EPERM', listCuaHome: 'EPERM',
      hardLink: 'EPERM', tcp: 'EPERM', unix: 'EPERM', mDNSResponder: 'EPERM', scriptDirs: 1, scriptDirWrite: 'EPERM'})},
  launcher: {codexCliPath: COMPAT_EXECUTABLE, helpers: [{launcherIsTheLaunch: true}]},
  codexDescendants: 0, helpers: {started: 1, quitByThemselves: 1, quitByHarness: 0, foreignSeen: 0},
});

test('a run through the compat executable with every expectation met passes every check', () => {
  const checks = compatRouteChecks(passing());
  assert.deepEqual(checks.filter(c => !c.pass), []);
  assert.ok(checks.length >= 15);
});

test('each departure fails its own check', () => {
  const cases = {
    'a native call failed': r => { r.results['listApps#2'] = {ok: false, error: 'Computer Use server error -10005'}; },
    'the Codex CLI named': r => { r.launcher.codexCliPath = '/h/runtimes/r/CodexCLI.app/Contents/MacOS/codex'; },
    'no helper of the run seen': r => { r.launcher.helpers = []; },
    'a helper with another launcher': r => { r.launcher.helpers.push({launcherIsTheLaunch: false}); },
    'TMPDIR not the session\'s': r => { r.results.confinement.value.tmpdirIsSession = false; },
    'the script directory writable': r => { r.results.confinement.value.scriptDirWrite = 'ok'; },
    'no script directory found': r => { r.results.confinement.value.scriptDirs = null; },
    'cua\'s home listable': r => { r.results.confinement.value.listCuaHome = 'ok'; },
    'a link succeeded': r => { r.results.confinement.value.hardLink = 'ok'; },
    'a socket reached': r => { r.results.confinement.value.unix = 'ok'; },
    'a codex process ran': r => { r.codexDescendants = 1; },
    'a helper left running': r => { r.helpers = {started: 1, quitByThemselves: 0, quitByHarness: 0}; },
    'a driver error': r => { r.driverError = 'timeout'; },
  };
  for (const [label, change] of Object.entries(cases)) {
    const r = passing();
    change(r);
    assert.equal(compatRouteChecks(r).filter(c => !c.pass).length, 1, label);
  }
});
