// The #228 probes' own Electron app (docs/evidence/2026-11-27-electron-a11y). It turns nothing on by itself.
//   electron <this directory> --probe-dir=<dir>
// <dir>/probe.jsonl gets one JSON line per event: the start, ready, the page's load and show, and every change of
// app.isAccessibilitySupportEnabled() or app.getAccessibilitySupportFeatures(), polled every 50 ms.
// Commands are files <dir>/cmd-1.json, cmd-2.json, ... taken in order, each answered by a `result` line:
//   {"op":"state"}                         the mode now
//   {"op":"enable"} / {"op":"disable"}     app.setAccessibilitySupportEnabled(true / false)
//   {"op":"features","features":[...]}     app.setAccessibilitySupportFeatures(features)
//   {"op":"bench","items":N,"passes":P}    the page's DOM benchmark, with each process's CPU seconds before and after
//   {"op":"metrics"}                       app.getAppMetrics()
//   {"op":"quit"}
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const argument = name => {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
};
const dir = argument('probe-dir');
if (!dir || !path.isAbsolute(dir)) { console.error('--probe-dir=<absolute dir> is required'); process.exit(2); }
fs.mkdirSync(dir, {recursive: true, mode: 0o700});
app.setPath('userData', path.join(dir, 'user-data'));
const log = record => fs.appendFileSync(path.join(dir, 'probe.jsonl'), `${JSON.stringify({at: Date.now(), ...record})}\n`);
// `features` is null on an Electron that has no app.getAccessibilitySupportFeatures (the older builds of versions.py)
const state = () => ({enabled: app.isAccessibilitySupportEnabled(), features: typeof app.getAccessibilitySupportFeatures === 'function' ? app.getAccessibilitySupportFeatures() : null});
const metrics = () => app.getAppMetrics().map(m => ({pid: m.pid, type: m.type, cpuSeconds: m.cpu.cumulativeCPUUsage ?? null, workingSetKb: m.memory.workingSetSize}));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

log({event: 'main-start', argv: process.argv.slice(1), pid: process.pid, electron: process.versions.electron, chrome: process.versions.chrome});
app.on('accessibility-support-changed', (_event, enabled) => log({event: 'accessibility-support-changed', argument: enabled, ...state()}));
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  log({event: 'ready', ...state()});
  const window = new BrowserWindow({x: 100, y: 80, width: 900, height: 640, title: 'cua a11y probe', show: false,
    webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false}});
  window.once('ready-to-show', () => { window.show(); log({event: 'ready-to-show', ...state()}); });
  window.webContents.on('did-finish-load', () => log({event: 'did-finish-load', ...state()}));
  window.loadFile(path.join(__dirname, 'index.html'));

  let last = JSON.stringify(state());
  setInterval(() => {
    const now = JSON.stringify(state());
    if (now !== last) { last = now; log({event: 'mode-changed', ...JSON.parse(now)}); }
  }, 50);

  let next = 1;
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    const file = path.join(dir, `cmd-${next}.json`);
    if (!fs.existsSync(file)) return;
    let command;
    try { command = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
    busy = true;
    const id = next;
    next += 1;
    try {
      let result = null;
      if (command.op === 'enable') app.setAccessibilitySupportEnabled(true);
      else if (command.op === 'disable') app.setAccessibilitySupportEnabled(false);
      else if (command.op === 'features') app.setAccessibilitySupportFeatures(command.features);
      else if (command.op === 'metrics') result = metrics();
      else if (command.op === 'bench') {
        const before = metrics();
        const timings = await window.webContents.executeJavaScript(`window.probeBench(${JSON.stringify({items: command.items ?? 2000, passes: command.passes ?? 5})})`);
        await sleep(command.settleMs ?? 1500);
        result = {timings, before, after: metrics()};
      } else if (command.op === 'quit') { log({event: 'result', id, op: command.op, ...state()}); app.quit(); return; }
      else if (command.op !== 'state') throw new Error(`unknown op ${command.op}`);
      log({event: 'result', id, op: command.op, result, ...state()});
    } catch (error) {
      log({event: 'result', id, op: command.op, error: String(error?.message ?? error), ...state()});
    } finally {
      busy = false;
    }
  }, 25);
});
