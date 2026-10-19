// The Electron fixture app's main process (the own native engine spec, Verification system part 2): one window with a
// text field, a list and a button, its own user-data directory, its own bundle id (the builder's rewrite), and nothing
// that turns accessibility on (no setAccessibilitySupportEnabled, no --force-renderer-accessibility): the engine's
// AXManualAccessibility is what the scene proves.
//
// Arguments (through `open -n -g -a <app> --args ...`):
//   --cua-fixture-user-data=<dir>   the user-data directory; without it the app makes a scratch one itself under the
//                                   temporary directory, so a launch by the engine (no arguments) is in its fixed state
//   --cua-fixture-bounds=x,y,w,h    the window's frame in points; else the default below
//
// The side-effect counters (./counters.js) live in the user-data directory as cua-fixture-counters.json: the app's
// activation events and the window's focus events counted here, the page's and the text field's reported by the
// renderer through the preload bridge.
const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {PAGE_EVENTS, createCounters} = require('./counters.js');

const argument = name => {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
};
const DEFAULT_BOUNDS = {x: 160, y: 140, width: 640, height: 480};
function bounds() {
  const parts = (argument('cua-fixture-bounds') ?? '').split(',').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isInteger) || parts[2] < 200 || parts[3] < 200) return DEFAULT_BOUNDS;
  const [x, y, width, height] = parts;
  return {x, y, width, height};
}

const given = argument('cua-fixture-user-data');
const userData = given && path.isAbsolute(given) ? given : fs.mkdtempSync(path.join(os.tmpdir(), 'cua-electron-fixture-'));
fs.mkdirSync(userData, {recursive: true, mode: 0o700});
app.setPath('userData', userData);
const counters = createCounters(path.join(userData, 'cua-fixture-counters.json'));
app.on('did-become-active', () => counters.bump('appDidBecomeActive'));
app.on('did-resign-active', () => counters.bump('appDidResignActive'));
ipcMain.on('cua-fixture:count', (_event, name) => { if (Object.hasOwn(PAGE_EVENTS, name)) counters.bump(PAGE_EVENTS[name]); });

app.whenReady().then(() => {
  // Shown without activation, so bringing the scene up never takes the focus (the harness activates it when a cell needs it).
  const window = new BrowserWindow({
    ...bounds(), title: 'cua Electron fixture', show: false,
    webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js')},
  });
  window.on('focus', () => counters.bump('windowFocus'));
  window.on('blur', () => counters.bump('windowBlur'));
  window.once('ready-to-show', () => window.showInactive());
  window.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
