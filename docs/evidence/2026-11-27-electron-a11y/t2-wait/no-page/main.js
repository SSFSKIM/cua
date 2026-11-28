// #228 task 2: an Electron window with no page. A BaseWindow has no web contents; with `--t180-overlay` Chromium
// draws its window controls itself, so its tree, once the app's accessibility is on, is Chromium's views and their
// buttons with no document. With `--t180-panels` it has no menu and no controls either: its tree is panels alone.
// It turns nothing on of itself.
const {app, BaseWindow, Menu} = require('electron');

app.whenReady().then(() => {
  const overlay = process.argv.includes('--t180-overlay');
  if (process.argv.includes('--t180-panels')) Menu.setApplicationMenu(null);
  new BaseWindow({width: 480, height: 320, title: 't180 base window', ...(overlay ? {titleBarStyle: 'hidden', titleBarOverlay: true} : {})});
});
