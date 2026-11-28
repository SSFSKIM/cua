// #228 task 2: an Electron window with no page. A BaseWindow has no web contents; with `titleBarOverlay` Chromium
// draws its window controls itself, so its tree, once the app's accessibility is on, is Chromium's views and their
// buttons with no document. It turns nothing on of itself.
const {app, BaseWindow} = require('electron');

app.whenReady().then(() => {
  const overlay = process.argv.includes('--t180-overlay');
  new BaseWindow({width: 480, height: 320, title: 't180 base window', ...(overlay ? {titleBarStyle: 'hidden', titleBarOverlay: true} : {})});
});
