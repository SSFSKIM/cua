// #538's hosted probe of S (scripts/probe-538/, not of record): a file channel through which the probe asks the fixture
// to place its main window, open and key a non-activating panel (`type: 'panel'`), key its main window, and report its
// windows and both pages' pointer counters. Loaded only under --cua-fixture-probe538=<dir> (./main.js); without the
// switch the fixture is the one every recording was taken on.
//
// Requests are <dir>/req-<id>.json {id, op, args}, answered by <dir>/res-<id>.json {id, op, ok, error?, state}, each
// written through a temporary file and a rename. The pages' counters count every pointerdown, mousedown, mouseup and
// click the page receives (capture phase, so nothing the page does can hide one): a pointer posted to a window moves
// them, an accessibility press moves `click` alone.
const {BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const COUNTERS = `(() => { if (window.__p538) return true; const c = window.__p538 = {pointerdown: 0, mousedown: 0, mouseup: 0, click: 0};
for (const t of Object.keys(c)) document.addEventListener(t, () => { c[t] += 1; }, true); return true; })()`;
const PAGE = `JSON.stringify({counters: window.__p538 ?? null, hasFocus: document.hasFocus(),
rects: Object.fromEntries(['pointer', 'button', 'text', 'status', 'list', 'panelButton'].map(id => [id, document.getElementById(id)?.getBoundingClientRect().toJSON() ?? null])),
pointerStatus: document.getElementById('pointer-status')?.textContent ?? null, status: document.getElementById('status')?.textContent ?? null})`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function start(dir, main) {
  let panel = null;
  const install = w => w.webContents.on('did-finish-load', () => w.webContents.executeJavaScript(COUNTERS).catch(() => null));
  install(main);
  const ensurePanel = bounds => {
    if (!panel) {
      panel = new BrowserWindow({type: 'panel', show: false, focusable: true, title: 'cua probe panel', x: 1100, y: 600, width: 360, height: 220, ...(bounds ?? {}),
        webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false}});
      install(panel);
      panel.loadFile(path.join(__dirname, 'panel.html'));
    } else if (bounds) panel.setBounds(bounds);
    return panel;
  };
  const page = async w => {
    try { return JSON.parse(await w.webContents.executeJavaScript(PAGE)); } catch (error) { return {error: String(error?.message ?? error)}; }
  };
  const windowOf = async w => (w && !w.isDestroyed() ? {cgWindow: Number(/^window:(\d+):/.exec(w.getMediaSourceId())?.[1] ?? NaN) || null, bounds: w.getBounds(),
    content: w.getContentBounds(), visible: w.isVisible(), focused: w.isFocused(), page: await page(w)} : null);
  const state = async () => {
    const focused = BrowserWindow.getFocusedWindow();
    return {at: Date.now(), focusedWindow: focused === main ? 'main' : focused && focused === panel ? 'panel' : focused ? 'other' : null,
      main: await windowOf(main), panel: await windowOf(panel)};
  };
  const ops = {
    layout: async ({main: bounds, panel: panelBounds}) => { if (bounds) main.setBounds(bounds); ensurePanel(panelBounds); await sleep(300); },
    'panel-show': async () => { const p = ensurePanel(); p.showInactive(); p.focus(); await sleep(400); },
    'panel-hide': async () => { panel?.hide(); await sleep(200); },
    'main-focus': async () => { main.focus(); await sleep(400); },
    state: async () => {},
  };
  const done = new Set();
  let busy = false;
  const write = (name, value) => {
    const file = path.join(dir, name), temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value) + '\n', {mode: 0o600});
    fs.renameSync(temporary, file);
  };
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      for (const name of fs.readdirSync(dir).filter(n => /^req-[\w-]+\.json$/.test(n)).sort()) {
        if (done.has(name)) continue;
        done.add(name);
        let request = null, out;
        try {
          request = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
          const op = ops[request.op];
          if (!op) throw new Error(`unknown op ${request.op}`);
          await op(request.args ?? {});
          out = {ok: true};
        } catch (error) { out = {ok: false, error: String(error?.message ?? error)}; }
        write(`res-${request?.id ?? name.slice(4, -5)}.json`, {id: request?.id ?? null, op: request?.op ?? null, ...out, state: await state()});
      }
    } catch { /* the directory unreadable for a moment: the next tick reads it again */ }
    busy = false;
  }, 50).unref();
}

module.exports = {start};
