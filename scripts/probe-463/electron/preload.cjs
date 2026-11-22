// #469's Electron fixture: the page's one bridge, the toolbar button asking the main process for its native menu.
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('probe469', {menu: at => ipcRenderer.send('menu', at)});
