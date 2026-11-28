// The sky wrapper's Linux launch_app (#115 M3): sky_linux's own launch would fork/exec the application inside the
// trusted worker's sandbox, where it dies, so the wrapper resolves the inventory id to its desktop entry and asks the
// supervisor to launch it outside (nodeRepl.launchServices.openApplication). Ids sky_linux does not list fail with
// sky_linux's own sentence; a request in any other shape is refused before anything is asked or sent (#228), so no
// launch reaches the engine's own launch_app. Every launch asks its approval first, keyed by the app id
// (test/services-sky-linux-policy.test.mjs); the client here accepts and the asks are recorded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSkyService, desktopEntryFor, LINUX_LAUNCH_SHAPE_REFUSED} from '../src/services/sky.mjs';
import {fakeLinuxEngine} from './helpers/fake-linux-engine.mjs';

const APPS = [{id: 'org.gnome.gedit.desktop', name: 'gedit', windows: []}, {id: 'kde-okular.desktop', name: 'Okular', windows: []}, {id: 'mine.desktop', name: 'Mine', windows: []}];
const launchApp = (input, extra = {}) => ({type: 'execute', method: 'launch_app', args: [input], ...extra});

function desktop(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-sky-launch-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const home = join(root, 'home'), share = join(root, 'share');
  const write = path => { mkdirSync(join(path, '..'), {recursive: true}); writeFileSync(path, '[Desktop Entry]\n'); return path; };
  return {
    env: {HOME: home, XDG_DATA_DIRS: `${share}:${join(root, 'other')}`},
    gedit: write(join(share, 'applications', 'org.gnome.gedit.desktop')),
    okular: write(join(share, 'applications', 'kde', 'okular.desktop')),
    mine: write(join(home, '.local', 'share', 'applications', 'mine.desktop')),
    shadowed: write(join(share, 'applications', 'mine.desktop')),
  };
}

function harness(t, {apps = APPS} = {}) {
  const d = desktop(t);
  const received = [], launched = [], asked = [];
  const vendor = {handleRpc: async request => { received.push(request); return request.method === 'list_apps' ? apps : 'vendor'; }};
  const nodeRepl = {requestMeta: {}, createElicitation: async request => { asked.push(request.meta.tool_params.app); return {action: 'accept', content: {}}; }};
  const service = createSkyService({loadVendor: async () => vendor, secrets: {read: async () => assert.fail('no secret is read')}, platform: 'linux', env: d.env,
    nodeRepl, openApplication: async target => { launched.push(target); return {}; }});
  return {d, service, received, launched, asked};
}

test('desktopEntryFor resolves a desktop file id as the XDG specification does: user data first, subdirectories as dash prefixes', t => {
  const d = desktop(t);
  assert.equal(desktopEntryFor('org.gnome.gedit.desktop', d.env), d.gedit);
  assert.equal(desktopEntryFor('kde-okular.desktop', d.env), d.okular);
  assert.equal(desktopEntryFor('mine.desktop', d.env), d.mine, 'XDG_DATA_HOME (~/.local/share) comes before XDG_DATA_DIRS');
  for (const id of ['absent.desktop', 'org.gnome.gedit', '../applications/org.gnome.gedit.desktop', 'kde/okular.desktop', '.desktop', ''])
    assert.equal(desktopEntryFor(id, d.env), null, id);
});

test('Linux launch_app: a listed id is launched by the supervisor from its desktop entry, and answers as the vendor does', async t => {
  const {d, service, received, launched, asked} = harness(t);
  assert.equal(await service.handleRpc(launchApp({app: 'org.gnome.gedit.desktop'})), undefined);
  assert.equal(await service.handleRpc(launchApp({app: 'kde-okular.desktop'})), undefined);
  assert.deepEqual(launched, [{applicationPath: d.gedit}, {applicationPath: d.okular}]);
  assert.deepEqual(asked, ['org.gnome.gedit.desktop', 'kde-okular.desktop'], 'each launch approved by its app id');
  assert.deepEqual(received.map(r => r.method), ['list_apps', 'list_apps'], 'sky_linux is asked for its inventory, never to launch');
});

test('Linux launch_app: an id sky_linux does not list, or without a desktop entry, fails with sky_linux\'s sentence and launches nothing', async t => {
  const {service, launched, asked} = harness(t, {apps: [...APPS, {id: 'listed-without-entry.desktop', name: 'x', windows: []}]});
  for (const app of ['cua-m4-nonexistent-fixture-application', 'listed-without-entry.desktop'])
    await assert.rejects(service.handleRpc(launchApp({app})), {message: `launchable application "${app}" was not found`});
  assert.deepEqual(launched, []);
  assert.deepEqual(asked, [], 'nothing found, nothing asked');
});

// #228 (review of T4): a launch_app in any shape but the pinned one is refused here, before an approval is asked and
// before the service is reached: it would otherwise reach cua-engine's own launch_app, which starts the application
// from the confined worker, inside its sandbox. Both routes set ACCESSIBILITY_ENABLED=1; the supervisor's is kept
// because it launches outside the sandbox.
test('Linux launch_app in any other shape is refused before anything is asked or sent; macOS goes to the vendor', async t => {
  const {service, received, launched, asked} = harness(t);
  for (const request of [launchApp({app: 'org.gnome.gedit.desktop', extra: 1}), launchApp({app: 'org.gnome.gedit.desktop'}, {more: 1}),
    {type: 'execute', method: 'launch_app', args: [{app: 'org.gnome.gedit.desktop'}, {}]}, launchApp({app: 7}), {type: 'execute', method: 'launch_app', args: []},
    {type: 'execute', method: 'launch_app'}, launchApp('org.gnome.gedit.desktop'),
    // the method by the key the service looks it up by: an array naming launch_app is launch_app
    {type: 'execute', method: ['launch_app'], args: [{app: 'org.gnome.gedit.desktop'}]}])
    await assert.rejects(service.handleRpc(request), {message: LINUX_LAUNCH_SHAPE_REFUSED});
  assert.deepEqual([launched, received, asked], [[], [], []], 'nothing launched, nothing sent, nothing asked');
  const darwin = createSkyService({loadVendor: async () => ({handleRpc: async () => 'vendor'}), secrets: {}, platform: 'darwin', openApplication: async () => assert.fail('macOS never launches here')});
  assert.equal(await darwin.handleRpc(launchApp({app: 'com.apple.TextEdit'})), 'vendor');
  assert.equal(await darwin.handleRpc({type: 'execute', method: 'launch_app', args: [{app: 'com.apple.TextEdit'}, {}]}), 'vendor');
});

test('Linux launch_app through cua\'s own Linux service: an extra positional input never reaches cua-engine\'s launch_app', async t => {
  const engine = fakeLinuxEngine(t);
  engine.behave(`export function answer(command) { if (command === 'list_apps') return {output: ${JSON.stringify(APPS)}}; }`);
  const d = desktop(t);
  const launched = [], asked = [];
  // a service of its own (the module's one-per-worker instance is the next test's), closed with the test
  const {createService} = await import('../src/services/engine/linux/service.mjs');
  const cua = createService({env: {CUA_ENGINE_BIN: engine.path}});
  t.after(() => cua.close());
  const nodeRepl = {requestMeta: {}, createElicitation: async request => { asked.push(request.meta.tool_params.app); return {action: 'accept', content: {}}; }};
  const service = createSkyService({loadVendor: async () => cua, secrets: {read: async () => assert.fail('no secret is read')}, platform: 'linux', env: d.env,
    nodeRepl, openApplication: async target => { launched.push(target); return {}; }});
  for (const [method, args] of [['launch_app', [{app: 'org.gnome.gedit.desktop'}, {}]], ['launch_app', [{app: 'org.gnome.gedit.desktop'}, 'extra']],
    [['launch_app'], [{app: 'org.gnome.gedit.desktop'}]]])
    await assert.rejects(service.handleRpc({type: 'execute', method, args}), {message: LINUX_LAUNCH_SHAPE_REFUSED});
  assert.deepEqual([launched, asked], [[], []]);
  assert.deepEqual(engine.requests().filter(r => r.command === 'launch_app'), [], 'cua-engine was never asked to launch');
  assert.equal(await service.handleRpc(launchApp({app: 'org.gnome.gedit.desktop'})), undefined);
  assert.deepEqual(launched, [{applicationPath: d.gedit}], 'the pinned shape launches through the supervisor, as before');
  assert.deepEqual(engine.requests().filter(r => r.command === 'launch_app'), []);
});

// The late-take watch's acting-request rule reaches this launch too (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Decision Log 2026-10-31): the launch changes the desktop by the supervisor's route, not the engine's, so right before
// it the wrapper asks cua's Linux service for the engine's preflight, an acting request that sends nothing. A late drag
// and drop (or a failed watch) the engine has not reported yet is then the launch's answer, and nothing is launched.
// The vendor's service has no preflight, and nothing changes there (the tests above).
test('Linux launch_app through cua\'s own Linux service: a pending late drag-and-drop notice is the launch\'s answer and nothing is launched; without one it launches', async t => {
  const notice = 'Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop; this preflight request was not run, so read the window before sending it again';
  const engine = fakeLinuxEngine(t);
  const pending = join(engine.dir, 'pending');
  engine.behave(`import {existsSync, unlinkSync} from 'node:fs';
    export function answer(command) {
      if (command === 'list_apps') return {output: ${JSON.stringify(APPS)}};
      if (command === 'preflight' && existsSync(${JSON.stringify(pending)})) {
        unlinkSync(${JSON.stringify(pending)});
        return {error: ${JSON.stringify(notice)}};
      }
    }`);
  const d = desktop(t);
  const launched = [], order = [];
  const saved = process.env.CUA_ENGINE_BIN;
  process.env.CUA_ENGINE_BIN = engine.path;
  t.after(() => { if (saved === undefined) delete process.env.CUA_ENGINE_BIN; else process.env.CUA_ENGINE_BIN = saved; });
  // the module CUA_SKY_SERVICE names on Linux, loaded as the wrapper loads it
  const cua = await import('../src/services/engine/linux/service.mjs');
  const nodeRepl = {requestMeta: {}, createElicitation: async () => { order.push('approved'); return {action: 'accept', content: {}}; }};
  const service = createSkyService({loadVendor: async () => cua, secrets: {read: async () => assert.fail('no secret is read')}, platform: 'linux', env: d.env,
    nodeRepl, openApplication: async target => { order.push('launched'); launched.push(target); return {}; }});

  writeFileSync(pending, '');
  await assert.rejects(service.handleRpc(launchApp({app: 'org.gnome.gedit.desktop'})), {message: notice});
  assert.deepEqual(launched, [], 'nothing launched');
  assert.equal(await service.handleRpc(launchApp({app: 'org.gnome.gedit.desktop'})), undefined);
  assert.deepEqual(launched, [{applicationPath: d.gedit}], 'launched as today');
  const commands = engine.requests().map(r => r.command).filter(c => c !== 'capabilities' && c !== 'list_windows');
  assert.deepEqual(commands, ['list_apps', 'preflight', 'list_apps', 'preflight'], 'the inventory, then the preflight before each launch');
  assert.deepEqual(order, ['approved', 'approved', 'launched'], 'the preflight comes after the approval, right before the launch');
});
