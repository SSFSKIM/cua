// #228 task 2: an Electron window whose page is empty (about:blank), for the shapes probe.
const {app, BrowserWindow} = require('electron');

app.whenReady().then(() => {
  const w = new BrowserWindow({width: 480, height: 320, title: 't180 blank'});
  w.on('page-title-updated', e => e.preventDefault());
  w.loadURL('about:blank');
});
