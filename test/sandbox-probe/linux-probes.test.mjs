// The Linux probes' pure parts (scripts/sandbox-probe/linux-probes.mjs): the helper argv and the profiles they run
// under, the nesting variants' deny lists, and the three verdicts. The probes themselves run live on the Linux box.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {helperArgs, workerProfile, kernelProfile, nestingVariants, xshmVerdict, launchVerdict, nestingVerdict} from '../../scripts/sandbox-probe/linux-probes.mjs';
import {homeLayout} from '../../src/runtime/layout.mjs';

const special = kind => ({path: {type: 'special', value: {kind}}, access: kind === 'root' ? 'read' : 'write'});
const path = (p, access) => ({path: {type: 'path', path: p}, access});

test('the helper argv is the spec\'s direct invocation, the profile as JSON, then the command', () => {
  assert.deepEqual(helperArgs({cwd: '/h/run/s', profile: {x: 1}, command: ['/n', 'a.mjs']}),
    ['--sandbox-policy-cwd', '/h/run/s', '--command-cwd', '/h/run/s', '--permission-profile', '{"x":1}', '--', '/n', 'a.mjs']);
});

test('the worker\'s shape is scoped with the network enabled; the kernel\'s is scoped, restricted, with the deny list', () => {
  assert.deepEqual(workerProfile(), {type: 'managed', file_system: {type: 'restricted', entries: [special('root'), special('project_roots'), special('tmpdir')]}, network: 'enabled'});
  const kernel = kernelProfile({deny: ['/h'], reexposeRead: ['/h/runtimes'], writes: ['/h/run/s'], explicitWrites: false});
  assert.equal(kernel.network, 'restricted');
  assert.deepEqual(kernel.file_system.entries.slice(3), [path('/h', 'none'), path('/h/runtimes', 'read')]);
  const explicit = kernelProfile({deny: ['/h'], reexposeRead: [], writes: ['/h/run/s', '/h/run/s/tmp'], explicitWrites: true});
  assert.deepEqual(explicit.file_system.entries.slice(3), [path('/h', 'none'), path('/h/run/s', 'write'), path('/h/run/s/tmp', 'write')]);
});

test('the nesting variants: the design denies the whole home; the fallback denies state/, remote/, chrome/ and run/', () => {
  const home = '/h', layout = homeLayout(home);
  const variants = nestingVariants({home, layout, runtimeRoot: '/h/runtimes/r', helperDir: '/h/sandbox/t', otherRun: '/h/run/other', store: '/s/store',
    seeds: {state: '/h/state/x', remote: '/h/remote/device.json', chrome: '/h/chrome/x', store: '/s/store/K'}, session: {cwd: '/h/run/s', tmp: '/h/run/s/tmp'}, scratch: '/s'});
  const denied = v => v.profile.file_system.entries.filter(e => e.access === 'none').map(e => e.path.path);
  assert.deepEqual(denied(variants.home), ['/h', '/s/store']);
  assert.deepEqual(denied(variants.fallback), ['/h/state', '/h/remote', '/h/chrome', '/h/run', '/s/store']);
  assert.deepEqual(variants.home.profile.file_system.entries.filter(e => e.access === 'read' && e.path.type === 'path').map(e => e.path.path), ['/h/runtimes', '/h/node', '/h/sandbox/t']);
  assert.deepEqual(variants.fallback.profile.file_system.entries.filter(e => e.access === 'write' && e.path.type === 'path').map(e => e.path.path), ['/h/run/s', '/h/run/s/tmp']);
  // The fallback leaves the home's top level and current.json readable; the design denies both. Both deny another
  // session's run directory and the private directories.
  const expect = (v, label) => [...v.plan.denyReads.map(([l]) => [l, 'denied']), ...v.plan.allowReads.map(([l]) => [l, 'ok'])].find(([l]) => l === label)[1];
  assert.equal(expect(variants.home, 'the home'), 'denied');
  assert.equal(expect(variants.fallback, 'the home'), 'ok');
  assert.equal(expect(variants.fallback, 'current.json'), 'ok');
  for (const v of [variants.home, variants.fallback]) assert.equal(expect(v, 'another session\'s run directory'), 'denied');
});

test('xshm: sky_linux\'s own screenshot decides; the raw client\'s outcome is reported beside it', () => {
  assert.match(xshmVerdict({skyScreenshotInside: {ok: false}, xshmInside: {}}), /^breaks/);
  assert.match(xshmVerdict({skyScreenshotInside: {ok: true}, xshmInside: {extension: true, attachError: 'BadAccess'}}), /^proceed for sky_linux.*refused inside \(BadAccess\)/);
  assert.match(xshmVerdict({skyScreenshotInside: {ok: true}, xshmInside: {extension: true, attachError: 'none', imageArrived: false}}), /never reaches the client's segment/);
  assert.match(xshmVerdict({skyScreenshotInside: {ok: true}, xshmInside: {extension: true, attachError: 'none', imageArrived: true}}), /MIT-SHM works inside$/);
});

test('launch: a sandboxed launch must start an application that lives and is not held in the worker\'s sandbox', () => {
  const lives = {launch: {ok: true}, newProcess: true, aliveBeforeSkyEnds: true, samePidNamespace: true, survivesSkyEnd: true};
  assert.match(launchVerdict([lives, lives]), /^proceed/);
  assert.match(launchVerdict([]), /^breaks: sky_linux's launch_app failed/);
  assert.match(launchVerdict([{...lives, launch: {ok: false}}]), /launch_app failed/);
  assert.match(launchVerdict([lives, {...lives, aliveBeforeSkyEnds: false}]), /^breaks: 1 of 2 .* died at start/);
  assert.match(launchVerdict([lives, {...lives, newProcess: false}]), /died at start/);
  assert.match(launchVerdict([{...lives, samePidNamespace: false, survivesSkyEnd: false}]), /^breaks: 1 of 1 .* ran inside the worker's sandbox/);
});

test('nesting: judged against a control that read every sentinel; the design, then explicit writes, then the fallback', () => {
  const ok = {attempts: [{label: 'read a', expect: 'denied', outcome: 'EACCES'}, {label: 'read b', expect: 'ok', outcome: 'ok'}]};
  const bad = {attempts: [{label: 'read b', expect: 'ok', outcome: 'ENOENT'}]};
  const failed = {launch: {code: 1, stderr: 'bwrap: execvp …: No such file or directory'}};
  const control = {attempts: [{label: 'read a', outcome: 'ok'}, {label: 'read b', outcome: 'ok'}, {label: 'write x', outcome: 'ok'}]};
  assert.match(nestingVerdict({control, home: ok, homeExplicit: ok, fallback: ok}).verdict, /^expressible:/);
  assert.match(nestingVerdict({control, home: failed, homeExplicit: ok, fallback: ok}).verdict, /^expressible only with explicit write entries/);
  const fallback = nestingVerdict({control, home: failed, homeExplicit: failed, fallback: ok, homeDiagnostic: bad});
  assert.match(fallback.verdict, /^not expressible: the fallback applies on Linux, and it holds with run\/ denied too/);
  assert.deepEqual(fallback.judged.homeDiagnostic, {holds: false, wrong: ['read b: ENOENT']});
  assert.equal(fallback.judged.home.why, 'the helper did not run the check (exit 1)');
  assert.match(nestingVerdict({control, home: failed, homeExplicit: failed, fallback: bad}).verdict, /fallback with run\/ denied does not hold either/);
  assert.match(nestingVerdict({control: {attempts: [{label: 'read a', outcome: 'EACCES'}]}, home: ok, homeExplicit: ok, fallback: ok}).verdict, /^invalid/);
});

test('the launch probe records the app listing as a count and two booleans, never the inventory', async () => {
  const {appInventory} = await import('../../scripts/sandbox-probe/linux-probes.mjs');
  assert.deepEqual(appInventory(['org.gnome.gedit.desktop', 'a.desktop', 'b.desktop']), {count: 3, listed: {gedit: true, zenity: false}});
  assert.deepEqual(appInventory([]), {count: 0, listed: {gedit: false, zenity: false}});
});
