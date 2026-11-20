#!/usr/bin/env node
// Task 117 (#171 M5; the design session's ruling 899's condition): the engine's identification of a drag's source as a
// Chrome or Chromium browser, with the engine inside cua's Linux worker sandbox exactly as the service runs it (the
// pinned codex-linux-sandbox, its own PID namespace; scripts/linux-engine-diff/engine-sandbox.mjs). Three sources, each
// dragged once with --stats, the hold's record read back (`hold.adaptive.source`):
// - a real Chrome window (identified: its class and role, this host, its accessible application "Google Chrome");
// - the Electron fixture's window (not: its role is "browser-window", its class its own);
// - a stub with Chrome's class and role whose accessible application is named otherwise (not: browser-app.py --window).
// Run on a display and session bus of its own (xvfb-run -a dbus-run-session), under the host lock. Every process it
// starts it stops; the profiles and homes are a scratch directory of its own, removed at the end.
//   node identify-sandboxed.mjs <checkout> <engine> <chrome command> <electron binary> <out.jsonl>
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const [checkout, engineBin, chrome, electron, outFile] = process.argv.slice(2);
const { sandboxedEngine } = await import(pathToFileURL(join(checkout, 'scripts/linux-engine-diff/engine-sandbox.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scratch = mkdtempSync(join(tmpdir(), 'cua171-identify-'));
const children = [];
const env = { ...process.env, HOME: join(scratch, 'home'), ACCESSIBILITY_ENABLED: '1', TMPDIR: scratch };
execFileSync('mkdir', ['-p', env.HOME]);
const start = (cmd, args, opts = {}) => {
  const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
  children.push(child);
  return child;
};
const record = (line) => {
  console.log(JSON.stringify(line));
  appendFileSync(outFile, `${JSON.stringify(line)}\n`);
};
try {
  // the stub first: a copy of the interpreter named `chrome`, so where /proc can see it its executable reads as Chrome's
  const python = realpathSync(execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim());
  const stubExe = join(scratch, 'chrome');
  copyFileSync(python, stubExe);
  const stub = start(stubExe, [join(checkout, 'native/linux-engine/tests/support/browser-app.py'), 'Stub Browser', '--window', 'Google-chrome', 'browser']);
  const stubReady = JSON.parse(await new Promise((resolve) => createInterface({ input: stub.stdout }).once('line', resolve)));
  start(chrome, [`--user-data-dir=${join(scratch, 'chrome')}`, '--force-renderer-accessibility', '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--new-window', 'about:blank']);
  start(electron, [join(checkout, 'scripts/native-matrix/fixtures/electron'), `--cua-fixture-user-data=${join(scratch, 'electron')}`, '--force-renderer-accessibility']);
  await sleep(8000);
  // a dedicated desktop: each drag raises its own window, the press reaching the source it names
  const launch = sandboxedEngine(engineBin, ['server', '--stats', '--desktop', 'dedicated'], env);
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
  const windows = (await request('list_windows', {})).output;
  const pick = (pred) => windows.find(pred);
  const sources = [
    ['chrome', pick((w) => w.app === 'Google-chrome' && w.id !== stubReady.xid)],
    ['electron', pick((w) => /electron/i.test(w.app))],
    ['stub', pick((w) => w.id === stubReady.xid)],
  ];
  for (const [name, w] of sources) {
    if (!w) {
      record({ source: name, error: 'no window found', windows: windows.map((x) => x.app) });
      continue;
    }
    await request('activate_window', { window: { id: w.id } });
    const answer = await request('drag', { window: { id: w.id }, path: [{ x: 60, y: 120 }, { x: 100, y: 120 }] });
    await sleep(1000);
    const line = stats.find((s) => s.id === id);
    record({ source: name, app: w.app, window: w.id, ok: answer.ok, notice: answer.notice ?? null, identity: line?.hold?.adaptive?.source ?? null, way: line?.hold?.adaptive?.way ?? null, browser_identity: line?.browser_identity ?? null, sandboxed: launch.command.endsWith('codex-linux-sandbox') });
  }
  engine.stdin.end();
} finally {
  for (const c of children.reverse()) c.kill('SIGTERM');
  await sleep(2000);
  for (const c of children) c.kill('SIGKILL');
  rmSync(scratch, { recursive: true, force: true });
}
