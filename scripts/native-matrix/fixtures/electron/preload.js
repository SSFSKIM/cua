// The fixture's preload: the page reports its focus events to the main process's counters (./counters.js) through one
// bridged function, and nothing else crosses.
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('cuaFixture', {count: event => ipcRenderer.send('cua-fixture:count', String(event))});
