#!/usr/bin/env node
// Live Linux secret fixture (issue #66, acceptance 4): over `cua serve` on stdio it binds one fixture window by X11
// window id, enters `{{secret:<KEY>}}` with typeText (the cua API's paste sends the same `type_text {window, text}`),
// and checks what the target received without the value ever crossing the MCP stream. gedit: the expected value's
// SHA-256 and length go into the readback cell, which hashes every same-length run of the window's accessibility text
// and returns only whether one matched. zenity (an entry dialog, whose accessibility text does not show the entry's
// value): the cell clicks OK (by its element index; Return was not delivered to the dialog), and zenity prints the
// entry to its stdout, which this process compares. It then scans the whole MCP transcript and the server's stderr for the value (raw and its
// base64 forms), ends the task and checks that the connection left nothing under $CUA_HOME/run.
// The key must already be stored in this process's $HOME store (`cua secrets set <KEY>`); its value is read here only
// to hash it and to scan for it, and is never printed. GUI footprint: one fixture process on a file (gedit) or an entry
// dialog (zenity) it starts, ended in `finally`, and a directory under /tmp it removes. On arm64, gedit's GTK3 text
// view crashed under the helper's typeText in Phase F; the fixture records whether the window survived rather than
// assuming either outcome (whether the bound window is still listed; a crashed process can linger as a zombie). Run it in the X session's environment (DISPLAY, XAUTHORITY):
//   node scripts/accept/linux-secret.mjs --key CUA_TEST_SECRET [--app gedit|zenity]   JSON report; exit 0 when all pass
import {spawn} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {findTool} from '../../src/runtime/tools.mjs';
import {fileStore, storeDir} from '../../src/secrets/store.mjs';
import {fingerprintable, fingerprints, textLeaks, UNFINGERPRINTABLE} from '../probe/leak-scan.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const {values: options} = parseArgs({options: {key: {type: 'string'}, app: {type: 'string', default: 'gedit'}}, strict: true});
const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const home = process.env.CUA_HOME ?? defaultHome();
const runEntries = () => (existsSync(join(home, 'run')) ? readdirSync(join(home, 'run')).sort() : []);
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
const report = {home, app: options.app, key: options.key ?? null, steps};
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

const dir = mkdtempSync('/tmp/cua-linux-secret-');
const title = `cua-secret-${randomBytes(3).toString('hex')}`;
let fixture = null;
let session = null;
let value = null;
try {
  const tool = ['gedit', 'zenity'].includes(options.app) ? findTool(options.app, process.env.PATH) : null;
  try { value = options.key ? await fileStore({dir: storeDir()}).read(options.key) : null; } catch (error) { report.storeError = error.code; }
  // The value becomes a leak fingerprint, so it must be one that can be scanned for (fingerprintable).
  const usable = fingerprintable(value);
  if (!step('preconditions', process.platform === 'linux' && !!process.env.DISPLAY && !!tool && usable,
    {platform: process.platform, display: process.env.DISPLAY ?? null, app: tool ?? null, stored: typeof value === 'string', store: storeDir(),
      ...(typeof value === 'string' && !usable ? {value: `the stored value ${UNFINGERPRINTABLE}`} : {})})) throw new Error('preconditions');
  const prints = fingerprints(value);
  if (options.app === 'gedit') {
    const file = join(dir, `${title}.txt`);
    writeFileSync(file, '');
    fixture = spawn(tool, ['--standalone', file], {detached: true, stdio: 'ignore'});
  } else {
    fixture = spawn(tool, ['--entry', '--title', title, '--text', 'cua secret fixture'], {detached: true, stdio: ['ignore', 'pipe', 'ignore']});
    fixture.output = '';
    fixture.stdout.on('data', data => { fixture.output += data; });
    fixture.exited = new Promise(resolve => fixture.once('exit', code => resolve(code)));
  }
  const runBefore = runEntries();
  session = openSession({args: [CLI, 'serve'], env: process.env, clientName: 'cua-linux-secret'});
  await session.initialize();

  const bind = await session.js(`const deadline = Date.now() + 20000; let win;
    while (!win && Date.now() < deadline) { win = (await cua.listWindows({emit: false})).find(w => (w.title ?? '').includes(${JSON.stringify(title)})); if (!win) await new Promise(r => setTimeout(r, 500)); }
    if (!win) throw new Error('the fixture window did not appear');
    globalThis.fixtureApp = await cua.getApp({windowId: win.id}); await fixtureApp.getAXState({emit: false});
    nodeRepl.write(JSON.stringify({windowId: win.id, app: win.app, title: win.title}));`, 90_000);
  const bound = /\{"windowId".*\}$/m.exec(resultText(bind))?.[0];
  if (!step('bind the fixture window by X11 id', !bind.result?.isError && !!bound, bound ? JSON.parse(bound) : resultText(bind).slice(0, 600))) throw new Error('bind');

  const typed = await session.js(`await fixtureApp.typeText(${JSON.stringify(`{{secret:${options.key}}}`)}); nodeRepl.write('{"typed":true}');`, 90_000);
  const typedText = resultText(typed);
  const leakedAtType = textLeaks(session.transcript.join('\n') + session.stderr, prints);
  report.typeResult = {isError: !!typed.result?.isError || !!typed.error, timedOut: !!typed.timedOut, text: typedText.split(value).join('<value>').slice(0, 600)};
  step('typeText({{secret:KEY}}) through the trusted wrapper', !typed.result?.isError && !typed.timedOut && /"typed":true/.test(typedText) && !leakedAtType, report.typeResult);
  await new Promise(r => setTimeout(r, 1500));
  const listed = await session.js(`nodeRepl.write(JSON.stringify({windowPresent: (await cua.listWindows({emit: false})).some(w => w.id === ${JSON.parse(bound).windowId})}));`, 60_000);
  const survived = /"windowPresent":true/.test(resultText(listed));
  step('the fixture window survived the input', survived, {windowListed: survived});

  if (survived && options.app === 'zenity') {
    const pressed = await session.js(`const __tree = await fixtureApp.getAXState({emit: false, disableDiffing: true});
      const __ok = /^\\s*(\\d+) button[^\\n]*\\bOK$/m.exec(__tree)?.[1];
      if (!__ok) throw new Error('no OK button in the dialog');
      await fixtureApp.click(__ok); nodeRepl.write('{"pressed":true}');`, 60_000);
    const code = await Promise.race([fixture.exited, new Promise(r => setTimeout(() => r('timeout'), 10_000))]);
    const got = fixture.output.endsWith('\n') ? fixture.output.slice(0, -1) : fixture.output;
    step('the app received exactly the stored value (zenity printed its entry on OK; compared outside the MCP stream)', /"pressed":true/.test(resultText(pressed)) && code === 0 && got === value,
      {exit: code, printedChars: [...got].length, expectedChars: [...value].length, exact: got === value});
  } else if (survived) {
    await new Promise(r => setTimeout(r, 1000));
    const observe = await session.js(`const __tree = await fixtureApp.getAXState({emit: false, disableDiffing: true});
      const {createHash} = await import('node:crypto');
      const __want = ${JSON.stringify(sha256(value))}, __chars = [...__tree], __n = ${[...value].length};
      let __found = false;
      for (let i = 0; !__found && i + __n <= __chars.length; i++) __found = createHash('sha256').update(__chars.slice(i, i + __n).join(''), 'utf8').digest('hex') === __want;
      nodeRepl.write(JSON.stringify({source: /Accessibility source: (\\S+)/.exec(__tree)?.[1] ?? null, treeChars: __chars.length, valueFound: __found}));`, 90_000);
    const seen = /\{"source".*\}$/m.exec(resultText(observe))?.[0];
    const parsed = seen ? JSON.parse(seen) : null;
    step('the window\'s accessibility text holds exactly the stored value (compared by hash inside the cell)', !observe.result?.isError && parsed?.valueFound === true, parsed ?? resultText(observe).split(value).join('<value>').slice(0, 600));
  }

  const ended = await session.call('end_task');
  step('end_task', ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
  const exit = await session.terminate();
  const leaks = textLeaks(session.transcript.join('\n') + session.stderr, prints);
  session = null;
  step('the value appears nowhere in the MCP transcript or the server\'s stderr (raw or base64)', leaks === 0, {fingerprints: prints.length, found: leaks});
  step('cua serve exited cleanly', exit.code === 0 && !exit.forced, exit);
  step('no run entry left for the connection', JSON.stringify(runEntries()) === JSON.stringify(runBefore), {before: runBefore, after: runEntries()});
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, value ? String(error.message).split(value).join('<value>') : error.message);
} finally {
  if (session) await session.terminate();
  if (fixture?.pid && alive(fixture.pid)) try { process.kill(fixture.pid, 'SIGTERM'); } catch {}
  rmSync(dir, {recursive: true, force: true});
}
report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
const text = JSON.stringify(report, null, 1);
console.log(value ? text.split(value).join('<value>') : text);
process.exitCode = report.status === 'PASS' ? 0 : 1;
