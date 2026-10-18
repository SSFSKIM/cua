#!/usr/bin/env node
// Live Linux native fixture for acceptance 9 (Phase F) and #115's acceptance 7 (the Linux computer route under cua's
// own sandbox, the scoped default): over `cua serve` on stdio it binds a gedit window by X11 window id, types a marker
// into it, reads the marker back through the accessibility tree, takes a screenshot, ends the task and checks the
// connection left nothing under $CUA_HOME/run. In the same session it checks that the kernel is confined (it cannot
// read cua's private state or the secret store, nor connect to the X display, TCP or the session bus, while sky_linux in
// the trusted worker drives the display), and that `cua.computer.launch_app` launches an application outside the
// sandbox (#115's supervisor-side launch): a harness-owned desktop entry running zenity with the run's marker, whose
// process must start in this machine's PID namespace and outlive the call. And it checks that `CUA_REPL_HOST=vendor` is
// refused on Linux with a sentence. Its whole GUI footprint: one standalone gedit process (`gedit --standalone`) on an
// empty file in a directory it creates under /tmp, and one zenity dialog carrying the marker (its desktop entry under
// ~/.local/share/applications, named for the run); both are ended (zenity only when its own command line carries the
// marker) and both files removed in `finally`. It types with pressKey, one X keysym per character, because the
// helper's typeText and paste crash GTK3 text views (F2). Run it in the X session's environment (DISPLAY, XAUTHORITY;
// the session bus is derived from XDG_RUNTIME_DIR):
//   node scripts/accept/linux-native.mjs [--screenshot <file>]     prints a JSON report; exit 0 when every step passes
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {findTool} from '../../src/runtime/tools.mjs';
import {keysymsFor} from './linux-native-lib.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const screenshotPath = process.argv.includes('--screenshot') ? process.argv[process.argv.indexOf('--screenshot') + 1] : null;
const home = process.env.CUA_HOME ?? defaultHome();
const runEntries = () => (existsSync(join(home, 'run')) ? readdirSync(join(home, 'run')).sort() : []);
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
const report = {home, sandbox: process.env.CUA_SHIM_SANDBOX ?? '(unset: the platform default)', steps};

const marker = `cua-f2-${randomBytes(4).toString('hex')}`;
const dir = mkdtempSync('/tmp/cua-linux-native-');
const file = join(dir, `fixture-${randomBytes(3).toString('hex')}.txt`);
const applications = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'applications');
const entryId = `cua-accept-${marker}.desktop`;
const entry = join(applications, entryId);
// The processes whose command line carries the marker: the zenity the launch started, never anyone else's.
const marked = () => readdirSync('/proc').filter(name => /^\d+$/.test(name)).filter(pid => {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes(`--text=${marker}`); } catch { return false; }
}).map(Number);
let gedit = null;
let session = null;
try {
  const gEditPath = findTool('gedit', process.env.PATH);
  if (!step('preconditions', process.platform === 'linux' && !!process.env.DISPLAY && !!gEditPath,
    {platform: process.platform, display: process.env.DISPLAY ?? null, gedit: gEditPath ?? null})) throw new Error('preconditions');
  writeFileSync(file, '');
  gedit = spawn(gEditPath, ['--standalone', file], {detached: true, stdio: 'ignore'});
  const runBefore = runEntries();
  session = openSession({args: [CLI, 'serve'], env: process.env, clientName: 'cua-linux-native'});
  await session.initialize();

  // Bind the fixture's own window: poll the window list (bounded) for its title, then getApp by window id.
  const bind = await session.js(`const deadline = Date.now() + 20000; let win;
    while (!win && Date.now() < deadline) { win = (await cua.listWindows({emit: false})).find(w => (w.title ?? '').includes(${JSON.stringify(basename(file))})); if (!win) await new Promise(r => setTimeout(r, 500)); }
    if (!win) throw new Error('the fixture window did not appear');
    globalThis.fixtureApp = await cua.getApp({windowId: win.id}); await fixtureApp.getAXState({emit: false});
    nodeRepl.write(JSON.stringify({windowId: win.id, app: win.app, title: win.title}));`, 90_000);
  const bound = /\{"windowId".*\}$/m.exec(resultText(bind))?.[0];
  if (!step('bind the fixture window by X11 id', !bind.result?.isError && !!bound, bound ? JSON.parse(bound) : resultText(bind).slice(0, 600))) throw new Error('bind');

  const typed = await session.js(`for (const key of ${JSON.stringify(keysymsFor(marker))}) await fixtureApp.pressKey(key);
    const tree = await fixtureApp.getAXState({emit: false, disableDiffing: true});
    nodeRepl.write(JSON.stringify({source: /Accessibility source: (\\S+)/.exec(tree)?.[1] ?? null, readBack: tree.includes(${JSON.stringify(marker)})}));`, 90_000);
  const observed = /\{"source".*\}$/m.exec(resultText(typed))?.[0];
  const seen = observed ? JSON.parse(observed) : null;
  step('type the marker and read it back from the accessibility tree', !typed.result?.isError && seen?.readBack === true, seen ?? resultText(typed).slice(0, 600));

  // The kernel is confined: no private state, no store, no socket (X11, TCP, the bus), while the worker drives X above.
  const xSocket = `/tmp/.X11-unix/X${(process.env.DISPLAY ?? ':0').replace(/^.*:/, '').split('.')[0]}`;
  const confined = await session.js(`const fs = await import('node:fs'), net = await import('node:net');
    const r = f => { try { f(); return 'ok'; } catch (e) { return e.code ?? 'error'; } };
    const c = o => new Promise(done => { const s = net.connect(o); s.once('connect', () => { s.destroy(); done('ok'); }); s.once('error', e => done(e.code)); });
    nodeRepl.write(JSON.stringify({state: r(() => fs.readdirSync(${JSON.stringify(join(home, 'state'))})), store: r(() => fs.readdirSync(${JSON.stringify(join(homedir(), '.config', 'claude-secrets'))})),
      x11: await c({path: ${JSON.stringify(xSocket)}}), tcp: await c({host: '127.0.0.1', port: 22}), bus: await c({path: ${JSON.stringify(join(process.env.XDG_RUNTIME_DIR ?? '/run/user/0', 'bus'))}})}));`, 60_000);
  const kernelSeen = /\{"state".*\}$/m.exec(resultText(confined))?.[0];
  const k = kernelSeen ? JSON.parse(kernelSeen) : null;
  step('the kernel is confined: no private state or store, no X11, TCP or session-bus connect', !confined.result?.isError && !!k
    && ['state', 'store'].every(key => ['EACCES', 'EPERM', 'ENOENT'].includes(k[key])) && ['x11', 'tcp', 'bus'].every(key => k[key] !== 'ok'), k ?? resultText(confined).slice(0, 600));

  const shot = await session.js('await fixtureApp.getScreenshot();', 60_000);
  const image = (shot.result?.content ?? []).find(c => c.type === 'image');
  if (image && screenshotPath) writeFileSync(screenshotPath, Buffer.from(image.data, 'base64'));
  step('screenshot of the window', !shot.result?.isError && !!image, image ? {mimeType: image.mimeType, bytes: Buffer.from(image.data, 'base64').length, savedTo: screenshotPath} : resultText(shot).slice(0, 600));

  // launch_app runs outside the sandbox (the supervisor's `gio launch`): the application starts in this PID namespace
  // and outlives the call.
  mkdirSync(applications, {recursive: true});
  writeFileSync(entry, `[Desktop Entry]\nType=Application\nName=cua acceptance ${marker}\nExec=/usr/bin/zenity --info --text=${marker}\nTerminal=false\n`);
  const launched = await session.js(`await cua.computer.launch_app({app: ${JSON.stringify(entryId)}}); nodeRepl.write('launched');`, 60_000);
  let pids = [];
  for (let i = 0; i < 40 && !pids.length; i++) { await new Promise(r => setTimeout(r, 250)); pids = marked(); }
  await new Promise(r => setTimeout(r, 1500));
  const sameNamespace = pids.length > 0 && pids.every(pid => { try { return readlinkSync(`/proc/${pid}/ns/pid`) === readlinkSync('/proc/self/ns/pid'); } catch { return false; } });
  step('launch_app starts the application outside the sandbox (this PID namespace), and it outlives the call',
    !launched.result?.isError && pids.length === 1 && sameNamespace && marked().length === 1, {result: resultText(launched).slice(-200), processes: pids.length, sameNamespace});
  for (const pid of marked()) try { process.kill(pid, 'SIGTERM'); } catch {}

  const ended = await session.call('end_task');
  step('end_task', ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
  const exit = await session.terminate();
  session = null;
  step('cua serve exited cleanly', exit.code === 0 && !exit.forced, exit);
  step('no run entry left for the connection', JSON.stringify(runEntries()) === JSON.stringify(runBefore), {before: runBefore, after: runEntries()});

  // The vendor host is retired on Linux (#115, #135): an explicit CUA_REPL_HOST=vendor is refused with a sentence.
  const vendor = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_REPL_HOST: 'vendor'}, clientName: 'cua-linux-native-vendor'});
  const vendorInit = await vendor.initialize().then(() => null, error => error.message);
  const vendorExit = await vendor.terminate();
  step('CUA_REPL_HOST=vendor is refused on Linux with a sentence', /CUA_REPL_HOST=vendor is not supported on Linux/.test(vendor.stderr) && vendorExit.code !== 0,
    {initialize: vendorInit, exit: vendorExit, stderr: vendor.stderr.trim().split('\n').filter(line => /CUA_REPL_HOST/.test(line)).slice(0, 2)});
  report.marker = marker;
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, error.message);
} finally {
  if (session) await session.terminate();
  if (gedit?.pid) try { process.kill(gedit.pid, 'SIGTERM'); } catch {}
  for (const pid of marked()) try { process.kill(pid, 'SIGTERM'); } catch {}
  rmSync(entry, {force: true});
  rmSync(dir, {recursive: true, force: true});
}
report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.status === 'PASS' ? 0 : 1;
