// The supervisor-side application launch on Linux (#115 M3; Design "Linux computer sessions", contingency 1, selected by
// M0's probe): the trusted worker is confined, and an application sky_linux fork/execs inside it dies at start, so the
// sky wrapper asks the supervisor, outside the sandbox, to launch the desktop entry (`gio launch`, in its own session).
// The supervisor launches only a desktop entry that lies in an XDG applications directory of its own environment, so
// nothing a cell can write (its run directory, its temp) is ever launched unconfined.
import {execFileSync, spawn} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LINUX_ENTRY_REFUSED_PREFIX, LINUX_LAUNCH_FAILED_PREFIX, launchServicesAction, runGioLaunch} from '../../src/repl-host/launch-services.mjs';

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

test('Linux: a launch that fails is answered with launch_app\'s sentence and the failure', async t => {
  const d = desktop(t);
  const path = d.entry(join(d.system, 'applications'), 'broken.desktop');
  const launch = async () => { throw new Error('gio: file:///usr/share/applications/broken.desktop: Failed to execute child process'); };
  await assert.rejects(launchServicesAction({action: 'open_application', application_path: path}, {platform: 'linux', launch, env: d.env}),
    error => error.message === `${LINUX_LAUNCH_FAILED_PREFIX}gio: file:///usr/share/applications/broken.desktop: Failed to execute child process`);
});

// A desktop entry a cell could have written is never launched outside the sandbox, even inside an XDG applications
// directory: its real path must lie in none of the sandbox's write roots (the session's run directory and temp, and every
// root the call's policy makes writable), symlinked roots included.
test('Linux: an entry whose real path lies inside a sandbox write root is refused, even in an XDG applications directory', async t => {
  const d = desktop(t);
  const run = join(d.root, 'run', 's');
  const writable = join(run, 'share');
  mkdirSync(join(writable, 'applications'), {recursive: true});
  const planted = d.entry(join(writable, 'applications'), 'planted.desktop');
  const linkedRoot = join(d.root, 'linked-run');
  symlinkSync(run, linkedRoot);
  const legit = d.entry(join(d.system, 'applications'), 'org.gnome.gedit.desktop');
  const env = {...d.env, XDG_DATA_DIRS: `${writable}:${d.system}`};
  const calls = [];
  const launch = async path => { calls.push(path); };
  const refused = async (path, writeRoots) => { try { await launchServicesAction({action: 'open_application', application_path: path}, {platform: 'linux', launch, env, writeRoots}); return null; } catch (error) { return error.message; } };
  for (const roots of [[run], [linkedRoot]]) assert.match(await refused(planted, roots) ?? '', new RegExp(`^${LINUX_ENTRY_REFUSED_PREFIX}.*writ`), String(roots));
  assert.equal(await refused(legit, [run]), null);
  assert.deepEqual(calls, [legit], 'the planted entry never reached gio');
});

// The gio boundary itself, against a fake `gio` (#598): `gio launch` spawns the application with its own stdin, stdout
// and stderr, and an application that keeps them open (most do) must not hold the launch until the timeout. `body` is
// shell source; `$here` is the fake's directory, where a process it starts records its pid in a `*.pid` file and names
// the directory in its command line, and every process so recorded is stopped when the test ends, whatever the test did.
const commandLineOf = pid => { try { return execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'}); } catch { return ''; } };
function stopRecorded(dir, kill = (pid, signal) => process.kill(pid, signal)) {
  for (const name of readdirSync(dir).filter(name => name.endsWith('.pid'))) {
    const record = readFileSync(join(dir, name), 'utf8').trim();
    const pid = /^[1-9][0-9]*$/.test(record) ? Number(record) : 0;
    if (pid === 0 || pid === process.pid || pid === process.ppid || !commandLineOf(pid).includes(dir)) continue;
    try { kill(pid, 'SIGKILL'); } catch {}
  }
}
function fakeGio(t, body) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-fake-gio-')));
  t.after(() => {
    stopRecorded(dir);
    rmSync(dir, {recursive: true, force: true});
  });
  const gio = join(dir, 'gio');
  writeFileSync(gio, `#!/bin/sh\nhere=$(dirname "$0")\n${body}\n`);
  chmodSync(gio, 0o755);
  return {dir, gio};
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const PATH_ONLY = {PATH: '/usr/bin:/bin'};

// The cleanup trusts no record: a fake that died mid-write leaves an empty or partial one, and `kill(0)` would stop the
// runner's own process group. Only a positive pid whose command line names the fake's directory is signalled.
test('fake gio cleanup: a record that is empty, not a positive pid, the runner itself or a process the fake did not start is never signalled', async t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-fake-gio-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const ours = spawn('/bin/sh', ['-c', 'sleep 30', join(dir, 'app')], {stdio: 'ignore'});
  const stranger = spawn('/bin/sh', ['-c', 'sleep 30', join(tmpdir(), 'cua-not-the-fake')], {stdio: 'ignore'});
  t.after(() => { ours.kill('SIGKILL'); stranger.kill('SIGKILL'); });
  await new Promise(resolve => setTimeout(resolve, 100));
  const records = {'empty.pid': '', 'zero.pid': '0', 'negative.pid': '-1', 'partial.pid': '12ab', 'runner.pid': String(process.pid),
    'parent.pid': String(process.ppid), 'stranger.pid': String(stranger.pid), 'ours.pid': `${ours.pid}\n`};
  for (const [name, record] of Object.entries(records)) writeFileSync(join(dir, name), record);
  const signalled = [];
  stopRecorded(dir, (pid, signal) => signalled.push([pid, signal]));
  assert.deepEqual(signalled, [[ours.pid, 'SIGKILL']]);
});
const sessionOf = stat => readFileSync(stat, 'utf8').split(') ')[1].split(' ')[3];

test('gio: the launch answers once gio has launched the application, which keeps its output open forever on /dev/null', async t => {
  // The application writes to its stdout and stderr every 50 ms and never closes them; gio exits once it is started.
  const {dir, gio} = fakeGio(t, `sh -c 'while :; do echo out; echo err >&2; sleep 0.05; done' "$here/app" &\necho $! > "$here/app.pid"\nexit 0`);
  // The supervisor's temp directory is the session's, which scoped cells may write: the launch leaves nothing in it.
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'cua-launch-temp-')));
  t.after(() => rmSync(temp, {recursive: true, force: true}));
  const savedTemp = process.env.TMPDIR;
  process.env.TMPDIR = temp;
  const started = performance.now();
  try {
    await runGioLaunch('/usr/share/applications/held.desktop', {...PATH_ONLY, MARK: 'desktop'}, {gio});
  } finally {
    if (savedTemp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = savedTemp;
  }
  const elapsed = performance.now() - started;
  const app = Number(readFileSync(join(dir, 'app.pid'), 'utf8'));
  t.diagnostic(`launch answered in ${elapsed.toFixed(0)} ms`);
  assert.ok(elapsed < 2000, `answered in ${elapsed.toFixed(0)} ms, not at gio's 30 s timeout`);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(alive(app), 'the application lives on, writing its output, after the launch answered');
  assert.deepEqual(readdirSync(temp), [], 'nothing of the launch is in the temp directory');
  if (existsSync(`/proc/${app}`)) {
    for (const fd of [0, 1, 2]) assert.equal(readlinkSync(`/proc/${app}/fd/${fd}`), '/dev/null', `the application's fd ${fd} is /dev/null`);
    assert.notEqual(sessionOf(`/proc/${app}/stat`), sessionOf('/proc/self/stat'), 'gio, and the application with it, runs in a session of its own');
    const names = readFileSync(`/proc/${app}/environ`, 'utf8').split('\0').filter(Boolean).map(kv => kv.split('=')[0]);
    assert.deepEqual(names.filter(name => !['PWD', 'SHLVL', '_'].includes(name)).sort(), ['MARK', 'PATH'], 'gio runs with the environment it is given, nothing of cua\'s');
  }
});

// gio's own words go to /dev/null with the application's output: a failure is answered with how gio ended (real gio
// ends 1 on every failure), through launch_app's sentence.
test('gio: a failed launch is answered with gio\'s exit status, through launch_app\'s sentence', async t => {
  const {gio} = fakeGio(t, `echo "gio: file://$2: Failed to execute child process" >&2\nexit 2`);
  await assert.rejects(runGioLaunch('/usr/share/applications/broken.desktop', PATH_ONLY, {gio}),
    error => error.message === 'gio launch /usr/share/applications/broken.desktop exited with status 2');
  const d = desktop(t);
  const path = d.entry(join(d.system, 'applications'), 'broken.desktop');
  await assert.rejects(launchServicesAction({action: 'open_application', application_path: path}, {platform: 'linux', env: d.env, launch: (entry, env) => runGioLaunch(entry, env, {gio})}),
    error => error.message === `${LINUX_LAUNCH_FAILED_PREFIX}gio launch ${path} exited with status 2`);
});

test('gio: a gio ended by a signal, a gio that does not exist, and a gio that hangs are each answered', async t => {
  const killed = fakeGio(t, 'kill -TERM $$').gio;
  await assert.rejects(runGioLaunch('/a.desktop', PATH_ONLY, {gio: killed}), error => error.message === 'gio launch /a.desktop was ended by SIGTERM');
  await assert.rejects(runGioLaunch('/a.desktop', PATH_ONLY, {gio: join(tmpdir(), 'cua-no-such-gio')}), /ENOENT/);
  const {dir, gio: hung} = fakeGio(t, `echo $$ > "$here/gio.pid"\nexec sh -c 'while :; do sleep 1; done' "$here/hung"`);
  const started = performance.now();
  await assert.rejects(runGioLaunch('/a.desktop', PATH_ONLY, {gio: hung, timeoutMs: 300}), error => error.message === 'gio launch /a.desktop did not finish within 300 ms');
  assert.ok(performance.now() - started < 2000, 'answered at its timeout');
  assert.equal(alive(Number(readFileSync(join(dir, 'gio.pid'), 'utf8'))), false, 'the hung gio was stopped');
});
