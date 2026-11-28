// #228 task 2, fix wave 1: one Electron process with two windows of the same title, side by side, each its own page
// with its own button. The engine tells such windows apart by their position or their active state (cua's own routes,
// not the vendor's title match), so the wait's later reads must be confirmed again to answer each window its own page.
// It turns nothing on of itself.
const {app, BrowserWindow} = require('electron');

const TITLE = 't180 twins';
const page = side => 'data:text/html,' + encodeURIComponent(
  `<!doctype html><title>${TITLE}</title><body><h1>${side}</h1><button>${side} button</button></body>`);

app.whenReady().then(() => {
  for (const [side, x] of [['Left', 40], ['Right', 560]]) {
    const w = new BrowserWindow({x, y: 80, width: 480, height: 360, title: TITLE});
    w.on('page-title-updated', e => e.preventDefault());
    w.loadURL(page(side));
  }
});
