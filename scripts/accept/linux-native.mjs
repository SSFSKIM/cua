#!/usr/bin/env node
// Live Linux native fixture for acceptance 9 (and, run with CUA_SHIM_SANDBOX=scoped, acceptance 11): over `cua serve`
// on stdio it binds a gedit window by X11 window id, types a marker into it, reads the marker back through the
// accessibility tree, takes a screenshot, ends the task and checks the connection left nothing under $CUA_HOME/run.
// Its whole GUI footprint: one standalone gedit process (`gedit --standalone`) on an empty file in a directory it
// creates under /tmp; that process is ended and the directory removed in `finally`. It types with pressKey, one X
// keysym per character, because the helper's typeText and paste crash GTK3 text views (F2). Run it in the X session's
// environment (DISPLAY, XAUTHORITY; the session bus is derived from XDG_RUNTIME_DIR):
//   node scripts/accept/linux-native.mjs [--screenshot <file>]     prints a JSON report; exit 0 when every step passes
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
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

  const shot = await session.js('await fixtureApp.getScreenshot();', 60_000);
  const image = (shot.result?.content ?? []).find(c => c.type === 'image');
  if (image && screenshotPath) writeFileSync(screenshotPath, Buffer.from(image.data, 'base64'));
  step('screenshot of the window', !shot.result?.isError && !!image, image ? {mimeType: image.mimeType, bytes: Buffer.from(image.data, 'base64').length, savedTo: screenshotPath} : resultText(shot).slice(0, 600));

  const ended = await session.call('end_task');
  step('end_task', ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
  const exit = await session.terminate();
  session = null;
  step('cua serve exited cleanly', exit.code === 0 && !exit.forced, exit);
  step('no run entry left for the connection', JSON.stringify(runEntries()) === JSON.stringify(runBefore), {before: runBefore, after: runEntries()});
  report.marker = marker;
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, error.message);
} finally {
  if (session) await session.terminate();
  if (gedit?.pid) try { process.kill(gedit.pid, 'SIGTERM'); } catch {}
  rmSync(dir, {recursive: true, force: true});
}
report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.status === 'PASS' ? 0 : 1;
