// A minimal Electron app of the differential harness (#171 M1a.4): one window showing the page its argument names, so
// an Electron window can host a harness page (the drag scene) as Chrome and Firefox do. Run with
// `electron <this directory> --cua-page=<file URL> --cua-user-data=<dir> --force-renderer-accessibility`; the page
// takes its title from the URL's fragment. A context-menu request the page lets through opens a native menu, as
// Chrome's own does (candidate 3: the input page's Native button, a confirmed menu); Electron shows none by itself.
const { app, BrowserWindow, Menu } = require('electron');

const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const userData = argument('cua-user-data');
if (userData) app.setPath('userData', userData);

app.whenReady().then(() => {
  const window = new BrowserWindow({ x: 0, y: 0, width: 1050, height: 780, show: true });
  window.setMenuBarVisibility(false);
  const menu = Menu.buildFromTemplate([{ label: 'Back' }, { label: 'Reload' }, { type: 'separator' }, { label: 'Inspect' }]);
  window.webContents.on('context-menu', () => menu.popup({ window }));
  window.loadURL(argument('cua-page'));
});
app.on('window-all-closed', () => app.quit());
