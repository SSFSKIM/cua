// #469's Electron fixture (package files as probe/433-qual's scripts/probe-433/electron): one window whose page has a
// toolbar with a pop-up button (aria-haspopup="menu") that opens the app's native menu (Menu.popup, as an Electron app's
// toolbar does) and a <select>. The page reports its clicks to the kit's server; the menu's opening is printed.
const path = require('node:path');
const {app, BrowserWindow, Menu, ipcMain} = require('electron');
if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw Error('hosted runners only');
if (process.env.P463_PROFILE) { app.setPath('userData', process.env.P463_PROFILE); app.setPath('sessionData', process.env.P463_PROFILE); }
app.whenReady().then(async () => {
  const window = new BrowserWindow({title: 'probe469 electron', x: 400, y: 30, width: 620, height: 700, show: false,
    webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs')}});
  window.once('ready-to-show', () => window.show());
  ipcMain.on('menu', (_e, at) => {
    console.log(JSON.stringify({kind: 'menu-popup', t: Date.now()}));
    Menu.buildFromTemplate([{label: 'First action'}, {label: 'Second action'}, {type: 'separator'}, {label: 'Third action'}])
      .popup({window, x: Math.round(at.x), y: Math.round(at.y)});
  });
  await window.loadURL(process.env.P463_URL);
  console.log(JSON.stringify({kind: 'fixture-ready', pid: process.pid, electron: process.versions.electron, chrome: process.versions.chrome}));
});
app.on('window-all-closed', () => app.quit());
