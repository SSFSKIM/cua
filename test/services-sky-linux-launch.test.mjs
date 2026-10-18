// The sky wrapper's Linux launch_app (#115 M3): sky_linux's own launch would fork/exec the application inside the
// trusted worker's sandbox, where it dies, so the wrapper resolves the inventory id to its desktop entry and asks the
// supervisor to launch it outside (nodeRepl.launchServices.openApplication). Ids sky_linux does not list fail with
// sky_linux's own sentence; requests in any other shape go to the vendor unchanged.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSkyService, desktopEntryFor} from '../src/services/sky.mjs';

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
  const received = [], launched = [];
  const vendor = {handleRpc: async request => { received.push(request); return request.method === 'list_apps' ? apps : 'vendor'; }};
  const service = createSkyService({loadVendor: async () => vendor, secrets: {read: async () => assert.fail('no secret is read')}, platform: 'linux', env: d.env,
    openApplication: async target => { launched.push(target); return {}; }});
  return {d, service, received, launched};
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
  const {d, service, received, launched} = harness(t);
  assert.equal(await service.handleRpc(launchApp({app: 'org.gnome.gedit.desktop'})), undefined);
  assert.equal(await service.handleRpc(launchApp({app: 'kde-okular.desktop'})), undefined);
  assert.deepEqual(launched, [{applicationPath: d.gedit}, {applicationPath: d.okular}]);
  assert.deepEqual(received.map(r => r.method), ['list_apps', 'list_apps'], 'sky_linux is asked for its inventory, never to launch');
});

test('Linux launch_app: an id sky_linux does not list, or without a desktop entry, fails with sky_linux\'s sentence and launches nothing', async t => {
  const {service, launched} = harness(t, {apps: [...APPS, {id: 'listed-without-entry.desktop', name: 'x', windows: []}]});
  for (const app of ['cua-m4-nonexistent-fixture-application', 'listed-without-entry.desktop'])
    await assert.rejects(service.handleRpc(launchApp({app})), {message: `launchable application "${app}" was not found`});
  assert.deepEqual(launched, []);
});

test('Linux launch_app in any other shape, and every request on macOS, goes to the vendor unchanged', async t => {
  const {service, received, launched} = harness(t);
  for (const request of [launchApp({app: 7}), launchApp({app: 'org.gnome.gedit.desktop', extra: 1}), launchApp({app: 'org.gnome.gedit.desktop'}, {more: 1}),
    {type: 'execute', method: 'launch_app', args: []}, {type: 'execute', method: 'launch_app', args: [{app: 'org.gnome.gedit.desktop'}, {}]}])
    assert.equal(await service.handleRpc(request), 'vendor');
  assert.deepEqual(launched, []);
  assert.equal(received.length, 5);
  const darwin = createSkyService({loadVendor: async () => ({handleRpc: async () => 'vendor'}), secrets: {}, platform: 'darwin', openApplication: async () => assert.fail('macOS never launches here')});
  assert.equal(await darwin.handleRpc(launchApp({app: 'com.apple.TextEdit'})), 'vendor');
});
