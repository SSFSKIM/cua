// The compat route's judgement (#115 M2, scripts/accept/compat-route.mjs): what one experiment.mjs native run on the
// macOS vendor host must show for acceptance 6 and the vendor host's share of 2 to 5.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compatRouteAcceptance, compatRouteChecks} from '../scripts/accept/compat-route.mjs';
import {COMPAT_EXECUTABLE} from '../src/runtime/launch.mjs';

const ok = value => ({ok: true, value});
const passing = () => ({
  results: {banner: ok({ready: true}), 'listApps#1': ok({apps: 7}), 'Finder getApp+getAXState#1': ok({chars: 10}), 'listApps#2': ok({apps: 7}), 'Finder getAXState#2': ok({chars: 10}),
    confinement: ok({cwdWrite: 'ok', tmpdirIsSession: true, tmpdirWrite: 'ok', outsideWrite: 'EPERM', trustedWrite: 'EPERM', slashTmpWrite: 'EPERM', listCuaHome: 'EPERM',
      hardLink: 'EPERM', tcp: 'EPERM', unix: 'EPERM', mDNSResponder: 'EPERM', scriptDirs: 1, scriptDirWrite: 'EPERM'})},
  launcher: {codexCliPath: COMPAT_EXECUTABLE, helpers: [{launcherIsTheLaunch: true}]},
  codexDescendants: 0, helpers: {started: 1, quitByThemselves: 1, quitByHarness: 0, stillAlive: 0, uncertain: 0, unclassified: 0, foreignSeen: 0},
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
    'a helper left running': r => { r.helpers = {started: 1, quitByThemselves: 0, quitByHarness: 0, stillAlive: 1, uncertain: 0, unclassified: 0}; },
    'a helper whose ownership was never read still lives': r => { r.helpers = {started: 1, quitByThemselves: 1, quitByHarness: 0, stillAlive: 0, uncertain: 0, unclassified: 1}; },
    'a helper signalled but still alive': r => { r.helpers = {started: 1, quitByThemselves: 0, quitByHarness: 1, stillAlive: 1, uncertain: 0, unclassified: 0}; },
    'a driver error': r => { r.driverError = 'timeout'; },
  };
  for (const [label, change] of Object.entries(cases)) {
    const r = passing();
    change(r);
    assert.equal(compatRouteChecks(r).filter(c => !c.pass).length, 1, label);
  }
});

// The run's timeout (#115 M2 review): the experiment is cancelled cooperatively and given a bounded grace; its evidence
// is removed only when its teardown is proven. Doubles stand in for experiment.mjs: no serve, no native helper.

const DOUBLE_HEAD = `const out = process.argv[process.argv.indexOf('--out') + 1];
const fs = require('node:fs');
const write = r => fs.writeFileSync(out, JSON.stringify(r));
`;
function double(t, body) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-route-double-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = join(dir, 'experiment.cjs');
  writeFileSync(file, DOUBLE_HEAD + body);
  return file;
}
const run = (experiment, extra = {}) => compatRouteAcceptance({home: '/h', userHome: '/u', configHome: '/c', experiment, timeoutMs: 300, graceMs: 300, ...extra});
const keptDirs = new Set();
const kept = r => { if (r.kept) keptDirs.add(r.kept); return r.kept; };
test.after(() => { for (const dir of keptDirs) rmSync(dir, {recursive: true, force: true}); });

test('a run that cancels cooperatively and accounts for its helpers is judged failed, and its scratch removed', async t => {
  const experiment = double(t, `process.on('SIGTERM', () => { write({cancelled: true, driverError: 'cancelled', helpers: {started: 1, quitByThemselves: 0, quitByHarness: 1, stillAlive: 0, uncertain: 0, unclassified: 0}}); process.exit(1); });
setInterval(() => {}, 1000);`);
  const r = await run(experiment);
  assert.equal(r.ok, false);
  assert.ok(r.checks.some(c => !c.pass && /finished within 300 ms/.test(c.label) && /cancelled/.test(c.detail)));
  assert.equal(kept(r), null, 'teardown proven: nothing kept');
});

test('a run that ignores the cancellation is killed after the grace, and its scratch (the ownership log) is kept', async t => {
  const experiment = double(t, `process.on('SIGTERM', () => {}); fs.writeFileSync(require('node:path').join(require('node:path').dirname(out), 'launches.jsonl'), '{}\\n'); setInterval(() => {}, 1000);`);
  const r = await run(experiment);
  assert.equal(r.ok, false);
  assert.ok(r.checks.some(c => /killed after a 300 ms grace/.test(c.detail ?? '')));
  assert.ok(kept(r) && existsSync(join(r.kept, 'launches.jsonl')), 'the evidence stays');
});

test('a run that exits with helpers unaccounted for keeps its scratch; a clean one removes it', async t => {
  const leaky = double(t, `write({helpers: {started: 1, quitByThemselves: 0, quitByHarness: 1, stillAlive: 1, uncertain: 0, unclassified: 0}});`);
  const r = await run(leaky, {timeoutMs: 10_000});
  assert.ok(kept(r) && readdirSync(r.kept).includes('result.json'));
  assert.ok(r.checks.some(c => /teardown is proven/.test(c.label) && !c.pass));
  const clean = double(t, `write({helpers: {started: 1, quitByThemselves: 1, quitByHarness: 0, stillAlive: 0, uncertain: 0, unclassified: 0}});`);
  const c = await run(clean, {timeoutMs: 10_000});
  assert.equal(kept(c), null);
  assert.equal(c.checks.some(x => /teardown is proven/.test(x.label)), false);
});

test('a run that met an unreadable helper ownership keeps its scratch: its teardown is unproven', async t => {
  const experiment = double(t, `write({driverError: 'cannot read the ownership of helper 4242: ps failed', helpers: {started: 0, quitByThemselves: 0, quitByHarness: 0, stillAlive: 0, uncertain: 0, unclassified: 1}});`);
  const r = await run(experiment, {timeoutMs: 10_000});
  assert.ok(kept(r));
  assert.ok(r.checks.some(c => /teardown is proven/.test(c.label) && !c.pass));
});
