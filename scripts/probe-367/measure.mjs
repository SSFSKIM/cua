// Hosted-only #367 public-facade live check. Product sources and engine are the same pinned head; no product patches.
import fs from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {win,usableFrame,sameFrame,offscreenProof,current,spaceIds,anotherSpaceProof,visibleOnSpace,missingAuthorization,windowMatch,raiseTarget,compareReturn} from './evidence.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.platform!=='darwin')throw Error('disposable GitHub-hosted macOS only');
const [source,engine,tool,fixture,out,head,sha]=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
const save=(name,value)=>fs.writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
// Save context before socket startup, imports, permission checks or GUI setup can fail.
save('config.json',{head,sha,source,engine,fixture,runnerOS:process.env.ImageOS,imageVersion:process.env.ImageVersion,
 runnerArch:process.env.RUNNER_ARCH,node:process.version,kit:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,
 os:execFileSync('/usr/bin/sw_vers',[],{encoding:'utf8'}),kernel:execFileSync('/usr/bin/uname',['-a'],{encoding:'utf8'})});
const hash=b=>createHash('sha256').update(b).digest('hex');
const load=p=>import(pathToFileURL(join(source,p)));
const err=e=>({name:e.name,errorName:e.errorName??null,message:e.message});
const oracleEvents=[];
const oracle=(...a)=>{
 const event={at:new Date().toISOString(),args:a};oracleEvents.push(event);
 try{return event.result=JSON.parse(execFileSync(tool,a.map(String),{encoding:'utf8',timeout:10000}));}
 catch(e){event.error=err(e);throw e;}
 finally{save('oracle-events.json',oracleEvents);}
};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,accept,ms=12000){const end=Date.now()+ms;let v;do{v=await read();if(accept(v))return {ok:true,value:v};await delay(200);}while(Date.now()<end);return {ok:false,value:v};}
const unavailable=reason=>({ok:null,available:false,attempted:false,reason});
const socketDir=fs.mkdtempSync('/tmp/p367-'),socket=join(socketDir,'s');
const log=fs.openSync(join(out,'engine-stderr.txt'),'w');
const proc=spawn(engine,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore',log]});
const owned=[],rows=[];
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
 // status is the production client's non-prompting status RPC. Never call engine permission-request methods.
 const preflight={oracle:oracle('preflight')};save('preflight.json',preflight);
 try{preflight.engine=await client.status();}catch(e){preflight.engineError=err(e);}
 preflight.missing=missingAuthorization(preflight.oracle,preflight.engine);save('preflight.json',preflight);
 if(preflight.missing.length){
  save('capability-blocked.json',{head,sha,phase:'pre-GUI authorization',missing:preflight.missing,preflight,guiLaunched:false});
  throw Object.assign(Error('capability-blocked: '+preflight.missing.join(', ')),{name:'CapabilityBlocked'});
 }
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
  const row={label,ok:!error,error,value:bytes?{bytes:bytes.length,sha256:hash(bytes),jpeg:bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255}:typeof value==='string'?value:undefined,
   emitted,meta:structuredClone(meta),raw};
  save(label+'.json',row);return row;
 }
 const document=join(out,'Cua367-owned.txt');fs.writeFileSync(document,'Cua 367 owned window\nStable text for window placement checks.\n');
 for(const scene of ['textedit','electron']){
  const bundle=scene==='textedit'?'com.apple.TextEdit':'io.github.ssfskim.cua.fixture.electron';
  const appPath=scene==='textedit'?'/System/Applications/TextEdit.app':fixture;
  const row={head,sha,scene,appPath};rows.push(row);
  const checkpoint=()=>save('results.json',rows);checkpoint();
  const before=oracle('find',bundle).apps.map(a=>a.pid);
  execFileSync('/usr/bin/open',['-n','-g','-a',appPath,...(scene==='textedit'?[document]:['--args',`--cua-fixture-user-data=${join(out,'profile')}`,'--cua-fixture-bounds=100,200,900,500'])],{timeout:10000});
  const found=await until(()=>oracle('find',bundle),i=>i.apps.some(a=>!before.includes(a.pid)));
  if(!found.ok)throw Error(scene+' no owned PID');
  const pid=found.value.apps.find(a=>!before.includes(a.pid)).pid;owned.push(pid);row.pid=pid;
  const initial=await until(()=>oracle('info',pid),i=>usableFrame(win(i)?.frame)&&win(i)?.numberResult===0&&win(i)?.number>0);
  row.initialOracle=initial;checkpoint();if(!initial.ok)throw Error(scene+' no independently identifiable owned AX window');
  const number=win(initial.value).number;row.windowNumber=number;
  const sceneOracle=(...a)=>oracle(...a,`--window=${number}`),info=()=>sceneOracle('info',pid);
  // Setup may cross several known adjacent Spaces, but never retries a failed transition or a measured Raise.
  async function switchTo(target){
   const steps=[];let now=info();
   for(let step=0;step<8&&current(now)!==target;step++){
    const ids=now.managedDisplaySpaces?.[0]?.Spaces?.map(s=>s.ManagedSpaceID)??[];
    const from=ids.indexOf(current(now)),to=ids.indexOf(target);
    if(from<0||to<0)return {ok:false,reason:'cannot resolve active/target Space in the managed display list',steps,value:now};
    const command=from<to?'switch-right':'switch-left',posted=oracle(command),was=current(now);
    const changed=await until(info,i=>current(i)!==null&&current(i)!==was,6000);steps.push({before:now,posted,after:changed});
    now=changed.value;if(!changed.ok)return {ok:false,reason:'one posted Space transition did not complete; not retried',steps,value:now};
   }
   return {ok:current(now)===target,steps,value:now};
  }
  row.initialSize=sceneOracle('size',pid,900,500);row.initialMove=sceneOracle('move',pid,100,200);row.initialActivate=oracle('activate','com.apple.finder');
  let bound;
  // Warm Chromium once, then pin the actual stable public getApp/getAXState/getScreenshot outputs.
  row.warm=await call(scene+'-warm',async()=>{bound=await cua.getApp(bundle);});
  row.baselineOracle=info();
  row.getApp=await call(scene+'-1-getApp',async()=>{bound=await cua.getApp(bundle);});
  row.baseline=await call(scene+'-1-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.baselineScreenshot=await call(scene+'-1-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
  row.baselineMatch=windowMatch(row.baseline,row.baselineOracle);
  const origin=win(info())?.frame;if(!usableFrame(origin))throw Error(scene+' original frame unknown');
  checkpoint();
  row.offscreenMove=sceneOracle('move',pid,-5000,200);
  const off=await until(info,offscreenProof);row.offscreenOracle=off;checkpoint();
  if(off.ok){
   row.offscreenGetApp=await call(scene+'-2-getApp',async()=>{bound=await cua.getApp(bundle);});
   row.offscreen=await call(scene+'-2-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
   row.offscreenDiff=await call(scene+'-2-diff',()=>bound.getAXState({emit:false}));
   row.offscreenScreenshot=await call(scene+'-2-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
   row.offscreenMatch=windowMatch(row.offscreen,off.value);
   let target=raiseTarget(row.offscreen,off.value,row.offscreenScreenshot.raw);
   if(head==='main'&&(!row.offscreenGetApp.ok||!row.offscreen.ok||!row.offscreenDiff.ok||!row.offscreenScreenshot.raw)){
    // disableDiff failures reset native lineage. Rebuild it via a successful *public facade* observation while visible.
    const setup=row.offscreenRaiseSetup={};setup.restore=sceneOracle('move',pid,origin.x,origin.y);
    setup.visible=await until(info,i=>sameFrame(win(i)?.frame,origin)&&win(i)?.overlapsDisplay===true&&win(i)?.inOnscreenList===true);
    if(setup.visible.ok){
     setup.state=await call(scene+'-2-raise-refresh',()=>bound.getAXState({disableDiffing:true,emit:false}));
     setup.observedOracle=info();target=raiseTarget(setup.state,setup.observedOracle);
    }else target={available:false,reason:'original visible frame could not be re-established for lineage refresh'};
    setup.moveOffscreen=sceneOracle('move',pid,-5000,200);setup.offscreen=await until(info,offscreenProof);
    if(!setup.offscreen.ok)target={available:false,reason:'refreshed window not independently confirmed off every display'};
   }
   row.offscreenRaiseTarget=target;row.offscreenWindowToken=target.token??null;row.offscreenRaiseBefore=info();
   row.offscreenRaise=target.available&&offscreenProof(row.offscreenRaiseBefore)
    ?{...await call(scene+'-2-raise',()=>bound.performSecondaryAction(target.index,'Raise')),available:true,attempted:true}
    :unavailable(target.reason??'offscreen precondition no longer proven');
   if(row.offscreenRaise.attempted)await delay(1200);
   row.offscreenRaiseAfter=info();checkpoint();
  }else row.offscreenRaise=unavailable('offscreen fixture not independently established');
  row.restoreAfterOffscreen=sceneOracle('move',pid,origin.x,origin.y);
  // Keep 110 points visible, independent of the hosted display's width and the app's actual accepted width.
  const w=win(info())?.frame?.width,screen=row.baselineOracle.screens?.[0];
  if(!Number.isFinite(w)||!usableFrame(screen))throw Error(scene+' partial fixture geometry unavailable');
  row.partialMove=sceneOracle('move',pid,screen.x-w+110,200);row.partialOracle=info();
  row.partial=await call(scene+'-3-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.partialScreenshot=await call(scene+'-3-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
  row.restoreAfterPartial=sceneOracle('move',pid,origin.x,origin.y);
  checkpoint();
  async function measureAnotherSpace(away){
   row.anotherSpaceOracle=away;
   if(!away.ok){row.anotherRaise=unavailable('distinct active/window Spaces and false independent CG visibility not established');checkpoint();return;}
   row.anotherGetApp=await call(scene+'-4-getApp',async()=>{bound=await cua.getApp(bundle);});
   row.another=await call(scene+'-4-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
   row.anotherScreenshot=await call(scene+'-4-screenshot',()=>bound.getScreenshot({emit:false}));
   row.anotherMatch=windowMatch(row.another,away.value);
   let target=raiseTarget(row.another,away.value,row.anotherScreenshot.raw);
   if(head==='main'&&(!row.anotherGetApp.ok||!row.another.ok||!row.anotherScreenshot.raw)){
    const setup=row.anotherRaiseSetup={};setup.activate=oracle('activate',bundle);
    setup.entered=await until(info,visibleOnSpace,15000);
    if(setup.entered.ok){
     setup.state=await call(scene+'-4-raise-refresh',()=>bound.getAXState({disableDiffing:true,emit:false}));
     setup.observedOracle=info();target=raiseTarget(setup.state,setup.observedOracle);
    }else target={available:false,reason:'target Space not independently entered for successful lineage refresh'};
    setup.switchAway=await switchTo(current(away.value));
    setup.away=await until(info,anotherSpaceProof);
    if(!setup.switchAway.ok||!setup.away.ok)target={available:false,reason:'another-Space precondition could not be independently re-established after refresh'};
   }
   row.anotherRaiseTarget=target;row.anotherRaiseBefore=info();
   row.anotherRaise=target.available&&anotherSpaceProof(row.anotherRaiseBefore)
    ?{...await call(scene+'-4-raise',()=>bound.performSecondaryAction(target.index,'Raise')),available:true,attempted:true}
    :unavailable(target.reason??'another-Space precondition no longer proven');
   if(row.anotherRaise.attempted)await delay(1600);
   row.anotherRaiseAfter=info();checkpoint();
  }
  row.spaceStart=info();row.fullscreenSet=sceneOracle('fullscreen',pid,true);
  const full=await until(info,i=>win(i)?.fullScreen===true&&spaceIds(i).some(s=>!spaceIds(row.spaceStart).includes(s)),15000);
  row.fullscreenCreated=full;checkpoint();
  if(full.ok){
   row.spaceRoute='fullscreen';row.spaceActivate=oracle('activate',bundle);
   const entered=await until(info,i=>visibleOnSpace(i)&&current(i)!==current(row.spaceStart));row.spaceEntered=entered;
   if(entered.ok){
    row.spaceSwitchAway=await switchTo(current(row.spaceStart));
    const away=await until(info,anotherSpaceProof);away.ok=away.ok&&row.spaceSwitchAway.ok;
    await measureAnotherSpace(away);
   }else row.anotherRaise=unavailable('fullscreen Space created but target could not be independently entered');
  }else{
   // Real Mission Control fallback: one Add Desktop AXPress attempt, then prove a new managed ID and select it by AX.
   const mc=row.missionControlSetup={};mc.exitFullscreen=sceneOracle('fullscreen',pid,false);
   mc.restored=await until(info,i=>win(i)?.fullScreen===false,15000);
   mc.activate=oracle('activate',bundle);mc.targetVisible=await until(info,visibleOnSpace);
   mc.before=info();row.missionControl=oracle('mission-control');await delay(1000);
   mc.addDesktop=oracle('add-desktop');
   mc.created=await until(info,i=>spaceIds(i).some(s=>!spaceIds(mc.before).includes(s)),10000);
   row.missionControlOracle=mc.created.value;
   const added=spaceIds(mc.created.value).filter(s=>!spaceIds(mc.before).includes(s));
   if(mc.addDesktop.axPressResult===0&&mc.created.ok&&added.length===1&&mc.targetVisible.ok){
    const display=mc.created.value.managedDisplaySpaces?.find(d=>d.Spaces?.some(s=>s.ManagedSpaceID===added[0]));
    const desktops=display?.Spaces?.filter(s=>s.type===0)??[],ordinal=desktops.findIndex(s=>s.ManagedSpaceID===added[0])+1;
    mc.newSpaceId=added[0];mc.desktopOrdinal=ordinal;
    if(ordinal>0){
     mc.selectDesktop=oracle('select-desktop',ordinal);
     mc.switched=await until(info,i=>current(i)===added[0]&&anotherSpaceProof(i));
     row.spaceRoute='mission-control';await measureAnotherSpace(mc.switched);
     if(!mc.switched.ok)mc.blocker='New desktop created; its single selection AXPress did not establish distinct active/window Spaces with false CG visibility';
    }else mc.blocker='New managed Space found, but its desktop ordinal is not independently resolvable';
   }else mc.blocker=mc.addDesktop.axPressResult!==0?'Add Desktop AXPress unavailable or failed; see bounded Dock scan and AX result':!mc.created.ok?'Add Desktop pressed; no new managed Space ID observed':!mc.targetVisible.ok?'Target was not proven on its original desktop before creating the new one':'Space creation yielded ambiguous new managed IDs';
   mc.dismiss=oracle('escape');
   if(mc.blocker){row.anotherSpaceBlocker={reason:mc.blocker,addDesktop:mc.addDesktop,created:mc.created};row.anotherRaise=unavailable(mc.blocker);}
  }
  row.exitFullscreen=sceneOracle('fullscreen',pid,false);row.fullscreenExited=await until(info,i=>win(i)?.fullScreen===false,15000);
  row.returnToTarget=oracle('activate',bundle);row.targetSpaceRestored=await until(info,visibleOnSpace);
  row.restoreMove=sceneOracle('move',pid,origin.x,origin.y);row.restoreSize=sceneOracle('size',pid,origin.width,origin.height);row.restoreBackground=oracle('activate','com.apple.finder');
  checkpoint();
  row.hide=sceneOracle('hide',pid);row.hiddenOracle=info();
  row.hidden=await call(scene+'-5-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.hiddenScreenshot=await call(scene+'-5-screenshot',()=>bound.getScreenshot({emit:false}));
  row.unhide=sceneOracle('unhide',pid);row.returnMove=sceneOracle('move',pid,origin.x,origin.y);row.returnBackground=oracle('activate','com.apple.finder');
  row.returnVisible=await until(info,i=>win(i)?.inOnscreenList===true&&win(i)?.overlapsDisplay===true);
  row.returnOracle=info();
  row.returned=await call(scene+'-6-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.returnScreenshot=await call(scene+'-6-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
  row.returnComparison=compareReturn(row.baseline,row.returned,row.baselineScreenshot,row.returnScreenshot);
  row.cgCost=sceneOracle('cg-cost',pid);
  row.cost=[];
  for(let i=0;i<20;i++){
   const start=performance.now();raw=null;
   try{await bound.getAXState({disableDiffing:true,emit:false});row.cost.push({ok:true,elapsedMs:performance.now()-start,timings:raw?.timings});}
   catch(e){row.cost.push({ok:false,error:err(e)});}
  }
  const p50=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.floor((a.length-1)/2)]:null;};
  row.costP50WalkMs=p50(row.cost.map(r=>r.timings?.walkMs));row.costP50ElapsedMs=p50(row.cost.filter(r=>r.ok).map(r=>r.elapsedMs));
  row.cgCostP50Ms=p50(row.cgCost.samples?.filter(s=>s.found).map(s=>s.elapsedMs)??[]);
  checkpoint();
  // These exact PIDs were created above; never terminate any preexisting application.
  process.kill(pid,'SIGTERM');owned.splice(owned.indexOf(pid),1);
 }
 console.log(JSON.stringify(rows.map(r=>({head,scene:r.scene,offscreen:r.offscreenOracle.ok,secondSpace:r.fullscreenCreated.ok||r.missionControlSetup?.created?.ok===true,
  anotherSpace:r.anotherSpaceOracle?.ok??false,costP50WalkMs:r.costP50WalkMs,cgCostP50Ms:r.cgCostP50Ms,returnComparison:r.returnComparison}))));
}catch(e){save('fatal.json',err(e));throw e;}
finally{
 save('results.json',rows);
 client?.close();for(const pid of owned){try{process.kill(pid,'SIGTERM');}catch{}}
 proc.kill('SIGTERM');fs.closeSync(log);
}
