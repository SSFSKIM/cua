// Runner-owned Electron fixture. No profile, owner data, CDP or node access in the page.
const {app,BrowserWindow}=require('electron');
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.whenReady().then(async()=>{
 app.setAccessibilitySupportEnabled(true);
 const window=new BrowserWindow({x:380,y:50,width:650,height:700,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
 await window.loadURL(process.env.PROBE366_URL);
 console.log(JSON.stringify({pid:process.pid,electron:process.versions.electron,chrome:process.versions.chrome}));
});
app.on('window-all-closed',()=>app.quit());
