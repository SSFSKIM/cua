// Runner-owned Electron fixture (as ../probe-390/fixture on probe/361-qual): one default window loading the owned page.
// No owner profile, CDP or node access in the page.
const {app,BrowserWindow}=require('electron');
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
if(process.env.PROBE340_PROFILE){app.setPath('userData',process.env.PROBE340_PROFILE);app.setPath('sessionData',process.env.PROBE340_PROFILE);}
app.whenReady().then(async()=>{
 const window=new BrowserWindow({title:'Owned link probe',x:400,y:30,width:620,height:700,show:false,
  webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 window.once('ready-to-show',()=>window.show());
 await window.loadURL(process.env.PROBE340_URL);
 console.log(JSON.stringify({kind:'fixture-ready',pid:process.pid,electron:process.versions.electron,chrome:process.versions.chrome}));
});
app.on('window-all-closed',()=>app.quit());
