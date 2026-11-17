// Hosted-only #367 public-facade live check. Product sources and engine are the same pinned head; no product patches.
import fs from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.platform!=='darwin')throw Error('disposable GitHub-hosted macOS only');
const [source,engine,tool,fixture,out,head,sha]=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
const save=(name,value)=>fs.writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const load=p=>import(pathToFileURL(join(source,p)));
const oracle=(...a)=>JSON.parse(execFileSync(tool,a.map(String),{encoding:'utf8',timeout:10000}));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,accept,ms=12000){const end=Date.now()+ms;let v;do{v=await read();if(accept(v))return {ok:true,value:v};await delay(200);}while(Date.now()<end);return {ok:false,value:v};}
const win=i=>i?.windows?.[0];
const current=i=>i?.managedDisplaySpaces?.[0]?.['Current Space']?.ManagedSpaceID??i?.activeSpace;
const spaceIds=i=>i?.managedDisplaySpaces?.flatMap(d=>(d.Spaces??[]).map(s=>s.ManagedSpaceID))??[];
const err=e=>({name:e.name,errorName:e.errorName??null,message:e.message});
const socketDir=fs.mkdtempSync('/tmp/p367-'),socket=join(socketDir,'s');
const log=fs.openSync(join(out,'engine-stderr.txt'),'w');
const proc=spawn(engine,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore',log]});
const owned=[];
const rows=[];
let raw=null,meta={},emitted=[];
let client;
try{
 const ready=await until(()=>fs.existsSync(socket),Boolean);if(!ready.ok)throw Error('engine socket absent');
 const {nativePipe}=await load('test/helpers/fake-engine.mjs');
 const {createEngineClient}=await load('src/services/engine/client.mjs');
 const {createService}=await load('src/services/engine/service.mjs');
 const {createSkyService}=await load('src/services/sky.mjs');
 const nr={env:{CUA_ENGINE_SCREENSHOTS:join(out,'capture-scratch'),CUA_CURSOR:'0'},nativePipe:nativePipe(),
  launchServices:{openApplication:async()=>{throw Error('probe engine must already listen');}},
  withSuspendedTimeout:fn=>fn(),setResponseMeta:m=>Object.assign(meta,structuredClone(m)),
  createElicitation:async request=>{if(!['com.apple.TextEdit','io.github.ssfskim.cua.fixture.electron'].includes(request.meta?.tool_params?.app))throw Error('unexpected approval');return {action:'accept',content:null,_meta:{persist:'session'}};}};
 client=createEngineClient({nodeRepl:nr,appPath:join(socketDir,'unused.app'),socketPath:socket,expected:{engineVersion:'0.1.0',build:'unbundled'},firstConnectMs:5000,cursor:{enabled:false}});
 const observedClient={get identity(){return client.identity;},execute:async(method,args,options)=>{const r=await client.execute(method,args,options);if(method==='get_app_state')raw=structuredClone(r.result);return r;}};
 const service=createService({nodeRepl:nr,client:observedClient});
 const wrapper=createSkyService({loadVendor:async()=>service,secrets:{read:async()=>undefined},platform:'darwin'});
 globalThis.nodeRepl={rpc:(_name,request)=>wrapper.handleRpc(request),write:async(value,kind)=>{if(kind==='cua.state')emitted.push(value);}};
 const {create_tinysky_alt}=await load('src/cua-api/create-tinysky-alt.mjs');
 const cua=await create_tinysky_alt({browser:false});
 async function call(label,fn,{capture=false}={}){
  raw=null;meta={};emitted=[];
  let value,error;
  try{value=await fn();}catch(e){error=err(e);}
  const bytes=value instanceof Uint8Array?Buffer.from(value):null;
  if(bytes&&capture)fs.writeFileSync(join(out,label+'.jpg'),bytes);
  const row={label,ok:!error,error,value:bytes?{bytes:bytes.length,sha256:hash(bytes)}:typeof value==='string'?value:undefined,
   emitted,meta:structuredClone(meta),raw};
  save(label+'.json',row);return row;
 }
 const document=join(out,'Cua367-owned.txt');fs.writeFileSync(document,'Cua 367 owned window\nStable text for window placement checks.\n');
 for(const scene of ['textedit','electron']){
  const bundle=scene==='textedit'?'com.apple.TextEdit':'io.github.ssfskim.cua.fixture.electron';
  const appPath=scene==='textedit'?'/System/Applications/TextEdit.app':fixture;
  const before=oracle('find',bundle).apps.map(a=>a.pid);
  execFileSync('/usr/bin/open',['-n','-g','-a',appPath,...(scene==='textedit'?[document]:['--args',`--cua-fixture-user-data=${join(out,'profile')}`,'--cua-fixture-bounds=100,200,900,500'])],{timeout:10000});
  const found=await until(()=>oracle('find',bundle),i=>i.apps.some(a=>!before.includes(a.pid)));
  if(!found.ok)throw Error(scene+' no owned PID');
  const pid=found.value.apps.find(a=>!before.includes(a.pid)).pid;owned.push(pid);
  const initial=await until(()=>oracle('info',pid),i=>win(i)?.frame?.width>0);if(!initial.ok)throw Error(scene+' no owned AX window');
  oracle('size',pid,900,500);oracle('move',pid,100,200);oracle('activate','com.apple.finder');
  let bound;
  // Warm Chromium once, then pin the actual stable public getApp/getAXState/getScreenshot outputs.
  await call(scene+'-warm',async()=>{bound=await cua.getApp(bundle);});
  const row={head,sha,scene,pid,appPath};
  row.baselineOracle=oracle('info',pid);
  row.getApp=await call(scene+'-1-getApp',async()=>{bound=await cua.getApp(bundle);});
  row.baseline=await call(scene+'-1-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.baselineScreenshot=await call(scene+'-1-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
  const origin=win(oracle('info',pid)).frame;
  row.offscreenMove=oracle('move',pid,-5000,200);
  const off=await until(()=>oracle('info',pid),i=>win(i)&&!win(i).overlapsDisplay);row.offscreenOracle=off;
  if(off.ok){
   row.offscreenGetApp=await call(scene+'-2-getApp',async()=>{bound=await cua.getApp(bundle);});
   row.offscreen=await call(scene+'-2-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
   row.offscreenDiff=await call(scene+'-2-diff',()=>bound.getAXState({emit:false}));
   row.offscreenScreenshot=await call(scene+'-2-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
   row.offscreenRaiseBefore=oracle('info',pid);
   const index=row.offscreen.raw?.nodes?.find(n=>n.role==='AXWindow')?.token;
   // Use the facade's index printed for the window, not the engine token.
   const rendered=row.offscreen.value??row.offscreenGetApp.emitted.at(-1)??row.baseline.value??'';
   const n=rendered.match(/^\s*(\d+)\s+.*(?:window|container)/mi);
   row.offscreenWindowToken=index??null;
   row.offscreenRaise= n?await call(scene+'-2-raise',()=>bound.performSecondaryAction(Number(n[1]),'Raise')):{ok:false,error:'no rendered window index'};
   await delay(1200);row.offscreenRaiseAfter=oracle('info',pid);
  }
  oracle('move',pid,origin.x,origin.y);
  // Keep 110 points visible, independent of the hosted display's width and the app's actual accepted width.
  const w=win(oracle('info',pid)).frame.width,screen=row.baselineOracle.screens[0];
  row.partialMove=oracle('move',pid,screen.x-w+110,200);row.partialOracle=oracle('info',pid);
  row.partial=await call(scene+'-3-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.partialScreenshot=await call(scene+'-3-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
  oracle('move',pid,origin.x,origin.y);
  row.spaceStart=oracle('info',pid);row.fullscreenSet=oracle('fullscreen',pid,true);
  const full=await until(()=>oracle('info',pid),i=>win(i)?.fullScreen===true&&spaceIds(i).some(s=>!spaceIds(row.spaceStart).includes(s)),15000);
  row.fullscreenCreated=full;
  if(full.ok){
   // Full-screen entry normally takes us there. Activate the owned app only to establish the full-screen Space.
   oracle('activate',bundle);
   const entered=await until(()=>oracle('info',pid),i=>win(i)?.spaces?.includes(current(i))&&current(i)!==current(row.spaceStart));row.spaceEntered=entered;
   let away;
   for(let attempt=0;attempt<3;attempt++){
    oracle('switch-left');away=await until(()=>oracle('info',pid),i=>current(i)!==current(entered.value)&&win(i)?.spaces?.length>0&&!win(i).spaces.includes(current(i))&&!win(i).inOnscreenList,5000);
    if(away.ok)break;
   }
   row.anotherSpaceOracle=away;
   if(away?.ok){
    row.anotherGetApp=await call(scene+'-4-getApp',async()=>{bound=await cua.getApp(bundle);});
    row.another=await call(scene+'-4-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
    row.anotherScreenshot=await call(scene+'-4-screenshot',()=>bound.getScreenshot({emit:false}));
    // main may fail before rendering; its earlier on-screen index remains the public facade's observed window.
    const state=row.another.value??row.baseline.value??'';
    const n=state.match(/^\s*(\d+)\s+.*(?:window|container)/mi);
    row.anotherRaiseBefore=oracle('info',pid);
    row.anotherRaise=n?await call(scene+'-4-raise',()=>bound.performSecondaryAction(Number(n[1]),'Raise')):{ok:false,error:'no rendered window index'};
    await delay(1600);row.anotherRaiseAfter=oracle('info',pid);
   }
  }else{
   // Also try Mission Control's keyboard route, retaining the screen and Space lists as evidence.
   row.missionControl=oracle('mission-control');await delay(1000);row.missionControlOracle=oracle('info',pid);
   execFileSync('/usr/bin/osascript',['-e','tell application "System Events" to key code 53'],{timeout:10000});
  }
  oracle('fullscreen',pid,false);await until(()=>oracle('info',pid),i=>win(i)?.fullScreen!==true,15000);
  oracle('move',pid,origin.x,origin.y);oracle('size',pid,origin.width,origin.height);oracle('activate','com.apple.finder');
  row.hide=oracle('hide',pid);row.hiddenOracle=oracle('info',pid);
  row.hidden=await call(scene+'-5-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.hiddenScreenshot=await call(scene+'-5-screenshot',()=>bound.getScreenshot({emit:false}));
  oracle('unhide',pid);oracle('move',pid,origin.x,origin.y);oracle('activate','com.apple.finder');
  await until(()=>oracle('info',pid),i=>win(i)?.inOnscreenList&&win(i)?.overlapsDisplay);
  row.returnOracle=oracle('info',pid);
  row.returned=await call(scene+'-6-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.returnScreenshot=await call(scene+'-6-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
  row.returnComparison={textEqual:row.returned.value===row.baseline.value,jpegBytesEqual:row.returnScreenshot.value?.sha256===row.baselineScreenshot.value?.sha256,
   byteLengthsEqual:row.returnScreenshot.value?.bytes===row.baselineScreenshot.value?.bytes,dimensionsEqual:JSON.stringify(row.returnScreenshot.raw?.screenshot&&[row.returnScreenshot.raw.screenshot.width,row.returnScreenshot.raw.screenshot.height])===JSON.stringify(row.baselineScreenshot.raw?.screenshot&&[row.baselineScreenshot.raw.screenshot.width,row.baselineScreenshot.raw.screenshot.height])};
  row.cost=[];
  for(let i=0;i<20;i++){
   const start=performance.now();raw=null;
   try{await bound.getAXState({disableDiffing:true,emit:false});row.cost.push({ok:true,elapsedMs:performance.now()-start,timings:raw?.timings});}
   catch(e){row.cost.push({ok:false,error:err(e)});}
  }
  row.costP50WalkMs=row.cost.map(r=>r.timings?.walkMs).filter(Number.isFinite).sort((a,b)=>a-b)[9]??null;
  rows.push(row);save('results.json',rows);
  // These exact PIDs were created above; never terminate any preexisting application.
  process.kill(pid,'SIGTERM');owned.splice(owned.indexOf(pid),1);
 }
 save('config.json',{head,sha,source,engine,fixture,runnerOS:process.env.ImageOS,imageVersion:process.env.ImageVersion,node:process.version,kit:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID});
 console.log(JSON.stringify(rows.map(r=>({head,scene:r.scene,offscreen:r.offscreenOracle.ok,secondSpace:r.fullscreenCreated.ok,anotherSpace:r.anotherSpaceOracle?.ok??false,costP50WalkMs:r.costP50WalkMs,returnComparison:r.returnComparison}))));
}catch(e){save('fatal.json',err(e));throw e;}
finally{
 client?.close();for(const pid of owned){try{process.kill(pid,'SIGTERM');}catch{}}
 proc.kill('SIGTERM');fs.closeSync(log);
}
