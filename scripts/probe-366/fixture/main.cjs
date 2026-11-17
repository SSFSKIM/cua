// Runner-owned Electron fixture. No owner profile, CDP or node access in the page.
const {app,BrowserWindow}=require('electron');
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
if(process.env.PROBE366_PROFILE){app.setPath('userData',process.env.PROBE366_PROFILE);app.setPath('sessionData',process.env.PROBE366_PROFILE);}
app.whenReady().then(async()=>{
 const {windowOptions}=await import('./window-options.mjs');
 const style=process.env.PROBE366_WINDOW_STYLE??'default',options=windowOptions(style);
 // Do not force accessibility or background throttling here: use the application's defaults and cua's enablement.
 const window=new BrowserWindow(options);
 window.once('ready-to-show',()=>window.show());
 await window.loadURL(process.env.PROBE366_URL);
 console.log(JSON.stringify({pid:process.pid,electron:process.versions.electron,chrome:process.versions.chrome,
  windowStyle:style,options,userData:app.getPath('userData'),sessionData:app.getPath('sessionData'),bounds:window.getBounds(),contentBounds:window.getContentBounds(),backgroundThrottling:window.webContents.getBackgroundThrottling()}));
});
app.on('window-all-closed',()=>app.quit());
