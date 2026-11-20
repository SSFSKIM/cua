#!/usr/bin/env node
// Task 117 (#171 M5; the design session's ruling 899's condition; rebuilt in wave 4 on the re-review's I6): the engine's
// identification of a drag's source as a Chrome or Chromium browser, with the engine inside cua's Linux worker sandbox
// exactly as the service runs it (the pinned codex-linux-sandbox, its own PID namespace;
// scripts/linux-engine-diff/engine-sandbox.mjs). Three sources, each dragged once with --stats, the hold's record read
// back (`hold.adaptive.source`), and each outcome required:
// - a real Chrome window: identified (its class and role, this host, its accessible application "Google Chrome");
// - the Electron fixture's window: not (its class its own, its role "browser-window");
// - a stub with Chrome's class and role whose accessible application is named otherwise: not (browser-app.py --window).
// It runs on a private display of its own, the gate's (scripts/linux-engine-gate/display.mjs: Xvfb, Openbox, the
// `person` xterm, the display watchdog), with the run's own session bus and accessibility bus (session-bus.mjs
// `startPrivateSession`), every application in the run's launch environment (app-env.mjs `launchEnvironment`: its home,
// TMPDIR and bus the run's), the run's Chrome the harness's own (chrome.mjs `ChromeInstance`, started as the named
// command, its profile in the scratch), and the stub's executable apart from every profile. Everything it starts it
// stops; its scratch is removed at the end. Exit 0 only when all three outcomes hold.
//   node identify-sandboxed.mjs <checkout> <engine> <chrome command> <electron binary> <out.jsonl>
// Run it under the host lock; it puts itself on the private display (the step's files beside the record, `<out>.d/`).
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ON_DISPLAY = 'CUA171_IDENTIFY_ON_DISPLAY';
const [checkout, engineBin, chrome, electron, outFile] = process.argv.slice(2);
if (![checkout, engineBin, chrome, electron, outFile].every(Boolean)) {
  console.error('usage: identify-sandboxed.mjs <checkout> <engine> <chrome command> <electron binary> <out.jsonl>');
  process.exit(2);
}
const harness = (name) => import(pathToFileURL(join(checkout, 'scripts', name)).href);

if (!process.env[ON_DISPLAY]) {
  // the outer process: the private display, this script on it, the display watchdog's verdict
  const { runOnPrivateDisplay } = await harness('linux-engine-gate/display.mjs');
  const dir = `${outFile}.d`;
  if (existsSync(dir)) {
    console.error(`${dir} exists: each run writes a directory of its own`);
    process.exit(2);
  }
  mkdirSync(dir, { recursive: true });
  const [out, err] = ['stdout.log', 'stderr.log'].map((f) => openSync(join(dir, f), 'a'));
  const result = await runOnPrivateDisplay({ dir, label: 'identify', script: fileURLToPath(import.meta.url), args: process.argv.slice(2), cwd: checkout, env: { ...process.env, [ON_DISPLAY]: '1' }, out, err });
  console.log(`identify: exit ${result.code} display ${result.clean ? 'clean' : result.reason}`);
  process.exit(result.code === 0 && result.clean ? 0 : 1);
}

const { sandboxedEngine } = await harness('linux-engine-diff/engine-sandbox.mjs');
const { engineEnvironment, launchEnvironment, runTmp } = await harness('linux-engine-diff/app-env.mjs');
const { startPrivateSession } = await harness('linux-engine-diff/session-bus.mjs');
const { CHROME_ENV, ChromeInstance } = await harness('linux-engine-diff/chrome.mjs');
const { ELECTRON_FIXTURE } = await harness('linux-engine-diff/families.mjs');
const { declareLiveRun, xSpawn } = await harness('linux-engine-diff/xspawn.mjs');
// the display is the private one the outer process started, which this process did not create itself
declareLiveRun("the identification's private display (identify-sandboxed.mjs)");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scratch = mkdtempSync(join(tmpdir(), 'cua171-identify-'));
mkdirSync(runTmp(scratch), { recursive: true, mode: 0o700 });
const children = [];
let session = null;
let browser = null;
const record = (line) => {
  console.log(JSON.stringify(line));
  appendFileSync(outFile, `${JSON.stringify(line)}\n`);
};
let failed = [];
try {
  session = await startPrivateSession({ dir: scratch, display: process.env.DISPLAY, env: launchEnvironment({ scratch, privateDisplay: true, sessionBus: false, app: "the run's session bus" }) });
  const appEnv = (app, extra = {}) => launchEnvironment({ scratch, privateDisplay: true, sessionBus: session.address, app, extra });
  const start = (cmd, args, env) => {
    const child = xSpawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'ignore'] });
    children.push(child);
    return child;
  };
  // the stub: a copy of the interpreter named `chrome`, so where /proc can see it its executable reads as Chrome's; in
  // a directory of its own, apart from every profile
  const python = realpathSync(execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim());
  const stubDir = join(scratch, 'stub');
  mkdirSync(stubDir);
  const stubExe = join(stubDir, 'chrome');
  copyFileSync(python, stubExe);
  const stub = start(stubExe, [join(checkout, 'native/linux-engine/tests/support/browser-app.py'), 'Stub Browser', '--window', 'Google-chrome', 'browser'], appEnv('the stub'));
  const stubReady = JSON.parse(await new Promise((resolve) => createInterface({ input: stub.stdout }).once('line', resolve)));
  // the run's Chrome, started as the named command, on its profile in the scratch
  browser = new ChromeInstance({ scratch, environment: () => appEnv('chrome', CHROME_ENV), command: chrome });
  browser.open('about:blank');
  start(electron, [ELECTRON_FIXTURE, `--cua-fixture-user-data=${join(scratch, 'electron')}`, '--force-renderer-accessibility'], appEnv('electron', CHROME_ENV));
  // a dedicated desktop: each drag raises its own window, the press reaching the source it names
  const launch = sandboxedEngine(engineBin, ['server', '--stats', '--desktop', 'dedicated'], engineEnvironment(process.env, scratch));
  const engine = spawn(launch.command, launch.args, { env: launch.env, cwd: launch.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(engine);
  const answers = createInterface({ input: engine.stdout });
  const stats = [];
  createInterface({ input: engine.stderr }).on('line', (l) => {
    try {
      const v = JSON.parse(l);
      if (v.stats) stats.push(v.stats);
    } catch {
      // not a stats line
    }
  });
  let id = 0;
  const request = (command, input) =>
    new Promise((resolve) => {
      answers.once('line', (l) => resolve(JSON.parse(l)));
      engine.stdin.write(`${JSON.stringify({ id: ++id, command, input })}\n`);
    });
  const find = (windows) => ({
    chrome: windows.find((w) => w.app === 'Google-chrome' && w.id !== stubReady.xid),
    electron: windows.find((w) => w.app === 'cua-electron-fixture'),
    stub: windows.find((w) => w.id === stubReady.xid),
  });
  // each source's window, waited for (Chrome's and Electron's first windows take a few seconds)
  let found = {};
  let windows = [];
  for (let i = 0; i < 60; i++) {
    windows = (await request('list_windows', {})).output ?? [];
    found = find(windows);
    if (found.chrome && found.electron && found.stub) break;
    await sleep(500);
  }
  // what the run's Chrome runs, read while its window shows (chrome.mjs `seen`)
  browser.seen();
  const expected = { chrome: true, electron: false, stub: false };
  for (const [name, identified] of Object.entries(expected)) {
    const w = found[name];
    if (!w) {
      record({ source: name, pass: false, error: 'no window found', windows: windows.map((x) => x.app) });
      failed.push(`${name}: no window`);
      continue;
    }
    await request('activate_window', { window: { id: w.id } });
    const answer = await request('drag', { window: { id: w.id }, path: [{ x: 60, y: 120 }, { x: 100, y: 120 }] });
    await sleep(1000);
    const line = stats.find((s) => s.id === id);
    const identity = line?.hold?.adaptive?.source ?? null;
    const pass = answer.ok === true && identity?.identified === identified;
    if (!pass) failed.push(`${name}: identified ${identity?.identified ?? 'unrecorded'}, expected ${identified}`);
    record({ source: name, pass, expected_identified: identified, app: w.app, window: w.id, ok: answer.ok, notice: answer.notice ?? null, identity, way: line?.hold?.adaptive?.way ?? null, browser_identity: line?.browser_identity ?? null, sandboxed: launch.command.endsWith('codex-linux-sandbox') });
  }
  if (!launch.command.endsWith('codex-linux-sandbox')) failed.push('the engine did not run inside the sandbox');
  engine.stdin.end();
} catch (error) {
  failed.push(`the run failed: ${error.message}`);
} finally {
  for (const c of children.reverse()) c.kill('SIGTERM');
  if (browser) {
    const ended = await browser.stop({ graceMs: 5000 });
    record({ chrome: { browsers: ended.browsers, terminated: ended.terminated, killed: ended.killed, left: ended.left } });
    if (ended.left.length) failed.push(`the run's Chrome left running: ${ended.left.join(', ')}`);
  }
  await sleep(2000);
  for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL');
  if (session) await session.stop();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
record({ outcome: failed.length ? 'fail' : 'pass', failed });
process.exit(failed.length ? 1 : 0);
