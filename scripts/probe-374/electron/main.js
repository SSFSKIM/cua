// #374's Electron fixture: one window at the URL given as PROBE374_URL. A context menu the page does not cancel pops up
// as a native menu (Menu.popup), as Electron apps that offer one do; Electron shows none without this handler. A page
// that cancels contextmenu (preventDefault) gets no 'context-menu' event, so no native menu.
const {app, BrowserWindow, Menu} = require('electron');

app.whenReady().then(() => {
  const window = new BrowserWindow({x: 420, y: 60, width: 620, height: 600, title: 'probe374 Electron'});
  window.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([{label: 'Copy', role: 'copy'}, {label: 'Paste', role: 'paste'}, {label: 'Select All', role: 'selectAll'}]).popup({window});
  });
  window.loadURL(process.env.PROBE374_URL);
});
app.on('window-all-closed', () => app.quit());
