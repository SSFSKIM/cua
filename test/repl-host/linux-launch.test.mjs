// The supervisor-side application launch on Linux (#115 M3; Design "Linux computer sessions", contingency 1, selected by
// M0's probe): the trusted worker is confined, and an application sky_linux fork/execs inside it dies at start, so the
// sky wrapper asks the supervisor, outside the sandbox, to launch the desktop entry (`gio launch`, in its own session).
// The supervisor launches only a desktop entry that lies in an XDG applications directory of its own environment, so
// nothing a cell can write (its run directory, its temp) is ever launched unconfined.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LINUX_ENTRY_REFUSED_PREFIX, LINUX_LAUNCH_FAILED_PREFIX, launchServicesAction} from '../../src/repl-host/launch-services.mjs';

function desktop(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-launch-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const home = join(root, 'home');
  const system = join(root, 'usr', 'share');
  for (const dir of [join(home, '.local', 'share', 'applications'), join(system, 'applications'), join(root, 'run', 's')]) mkdirSync(dir, {recursive: true});
  const entry = (dir, name) => { const path = join(dir, name); writeFileSync(path, '[Desktop Entry]\nType=Application\nExec=/usr/bin/true\n'); return path; };
  return {root, home, system, entry, env: {HOME: home, XDG_DATA_DIRS: `${system}:${join(root, 'missing')}`, DISPLAY: ':0', XAUTHORITY: join(home, '.Xauthority'),
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1/bus', XDG_RUNTIME_DIR: '/run/user/1', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8',
    CUA_SECRETS_DIR: '/secret/store', CUA_REPL_TRUSTED_SERVICES: '{}'}};
}

test('Linux: a desktop entry in an XDG applications directory is launched with gio, in the desktop session\'s environment only', async t => {
  const d = desktop(t);
  const user = d.entry(join(d.home, '.local', 'share', 'applications'), 'mine.desktop');
  const system = d.entry(join(d.system, 'applications'), 'org.gnome.gedit.desktop');
  const calls = [];
  const launch = async (path, env) => { calls.push({path, env}); };
  for (const path of [user, system]) await launchServicesAction({action: 'open_application', application_path: path}, {platform: 'linux', launch, env: d.env});
  assert.deepEqual(calls.map(c => c.path), [user, system]);
  assert.deepEqual(Object.keys(calls[0].env).sort(), ['DBUS_SESSION_BUS_ADDRESS', 'DISPLAY', 'HOME', 'LANG', 'PATH', 'XAUTHORITY', 'XDG_DATA_DIRS', 'XDG_RUNTIME_DIR'],
    'the launched application gets the desktop session, never cua\'s settings or the secret store\'s path');
});

test('Linux: anything but a desktop entry inside an XDG applications directory is refused before gio runs', async t => {
  const d = desktop(t);
  const outside = d.entry(join(d.root, 'run', 's'), 'planted.desktop');
  mkdirSync(join(d.system, 'applications', 'kde'));
  const nested = d.entry(join(d.system, 'applications', 'kde'), 'okular.desktop');
  symlinkSync(outside, join(d.system, 'applications', 'linked.desktop'));
  const notEntry = join(d.system, 'applications', 'readme.txt');
  writeFileSync(notEntry, 'x');
  const calls = [];
  const launch = async path => { calls.push(path); };
  const refused = async message => { try { await launchServicesAction(message, {platform: 'linux', launch, env: d.env}); return null; } catch (error) { return error.message; } };
  assert.equal(await refused({action: 'open_application', application_path: nested}), null, 'a subdirectory of applications/ is an XDG location (kde-okular.desktop)');
  for (const path of [outside, join(d.system, 'applications', 'linked.desktop'), notEntry, join(d.system, 'applications', 'absent.desktop')])
    assert.ok((await refused({action: 'open_application', application_path: path}))?.startsWith(LINUX_ENTRY_REFUSED_PREFIX), path);
  assert.match(await refused({action: 'open_application', bundle_identifier: 'org.gnome.gedit.desktop'}), /desktop entry's path/);
  assert.deepEqual(calls, [nested], 'nothing refused reached gio');
});

test('Linux: a launch gio reports failed is answered with its last line', async t => {
  const d = desktop(t);
  const path = d.entry(join(d.system, 'applications'), 'broken.desktop');
  const launch = async () => { throw new Error('gio: file:///usr/share/applications/broken.desktop: Failed to execute child process'); };
  await assert.rejects(launchServicesAction({action: 'open_application', application_path: path}, {platform: 'linux', launch, env: d.env}),
    error => error.message === `${LINUX_LAUNCH_FAILED_PREFIX}gio: file:///usr/share/applications/broken.desktop: Failed to execute child process`);
});
