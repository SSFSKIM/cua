// Hosted-only #367 public-facade live check. Product sources and engine are the same pinned head; no product patches.
import fs from 'node:fs';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {win,usableFrame,offscreenProof,current,spaceIds,anotherSpaceProof,visibleOnSpace,missingAuthorization,windowMatch,windowGeometry,raiseTarget,compareReturn,placementChecks} from './evidence.mjs';
import {offscreenFixture,restoreOriginalFrame,switchToSpace,requestOwnedBounds,returnToWindowSpace} from './fixtures.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.platform!=='darwin')throw Error('disposable GitHub-hosted macOS only');
const [source,engine,tool,fixture,out,head,sha,fixtureManifest]=process.argv.slice(2);
const onlyOtherSpace=process.env.ONLY_OTHER_SPACE==='1';
fs.mkdirSync(out,{recursive:true});
const save=(name,value)=>fs.writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
// Save context before socket startup, imports, permission checks or GUI setup can fail.
const config={head,sha,source,engine,fixture,fixtureManifest,onlyOtherSpace,runnerOS:process.env.ImageOS,imageVersion:process.env.ImageVersion,
 runnerArch:process.env.RUNNER_ARCH,node:process.version,kit:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,
 os:execFileSync('/usr/bin/sw_vers',[],{encoding:'utf8'}),kernel:execFileSync('/usr/bin/uname',['-a'],{encoding:'utf8'})};
save('config.json',config);
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
 const fixtureInfo=JSON.parse(fs.readFileSync(fixtureManifest,'utf8'));
 config.fixtureControl=fixtureInfo.probe367Control;save('config.json',config);
 if(fixtureInfo.appPath!==fixture||!config.fixtureControl)throw Error('owned fixture control manifest does not match the fixture');
 if(hash(fs.readFileSync(join(fixture,'Contents','Resources','app','probe367-control.cjs')))!==config.fixtureControl.controlSourceSha256
  ||hash(fs.readFileSync(join(fixture,'Contents','Resources','app','main.js')))!==config.fixtureControl.instrumentedMainSha256)throw Error('owned fixture control source hashes do not match the manifest');
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
  let value,error;const startedAt=new Date().toISOString(),started=performance.now();
  try{value=await fn();}catch(e){error=err(e);}
  const elapsedMs=performance.now()-started,endedAt=new Date().toISOString();
  const bytes=value instanceof Uint8Array?Buffer.from(value):null;
  if(bytes&&capture)fs.writeFileSync(join(out,label+'.jpg'),bytes);
  const row={label,startedAt,endedAt,elapsedMs,ok:!error,error,value:bytes?{bytes:bytes.length,sha256:hash(bytes),jpeg:bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255}:typeof value==='string'?value:undefined,
   emitted,meta:structuredClone(meta),raw};
  save(label+'.json',row);return row;
 }
 // Both heads open the same file URL; per-head evidence directories must not change the observed document identity.
 const document=join(dirname(out),'Cua367-owned.txt');fs.writeFileSync(document,'Cua 367 owned window\nStable text for window placement checks.\n');
 for(const scene of ['textedit','electron']){
  const bundle=scene==='textedit'?'com.apple.TextEdit':'io.github.ssfskim.cua.fixture.electron';
  const appPath=scene==='textedit'?'/System/Applications/TextEdit.app':fixture;
  const row={head,sha,scene,appPath,onlyOtherSpace,...(scene==='textedit'?{documentPath:document}:{})};rows.push(row);
  const checkpoint=()=>save('results.json',rows);checkpoint();
  const controlDirectory=scene==='electron'?join(out,'fixture-control'):null;
  if(controlDirectory){fs.mkdirSync(controlDirectory,{recursive:true,mode:0o700});row.fixtureBoundsControl={...config.fixtureControl,directory:controlDirectory,operations:[]};}
  const before=oracle('find',bundle).apps.map(a=>a.pid);
  execFileSync('/usr/bin/open',['-n','-g','-a',appPath,...(scene==='textedit'?[document]:['--args',`--cua-fixture-user-data=${join(out,'profile')}`,'--cua-fixture-bounds=100,200,900,500',`--cua367-control-dir=${controlDirectory}`])],{timeout:10000});
  const found=await until(()=>oracle('find',bundle),i=>i.apps.some(a=>!before.includes(a.pid)));
  if(!found.ok)throw Error(scene+' no owned PID');
  const pid=found.value.apps.find(a=>!before.includes(a.pid)).pid;owned.push(pid);row.pid=pid;
  const initial=await until(()=>oracle('info',pid),i=>usableFrame(win(i)?.frame)&&win(i)?.numberResult===0&&win(i)?.number>0);
  row.initialOracle=initial;checkpoint();if(!initial.ok)throw Error(scene+' no independently identifiable owned AX window');
  const number=win(initial.value).number;row.windowNumber=number;
  const sceneOracle=(...a)=>oracle(...a,`--window=${number}`),info=()=>sceneOracle('info',pid);
  const frameIO={read:info,move:(x,y)=>sceneOracle('move',pid,x,y),size:(w,h)=>sceneOracle('size',pid,w,h),
   wait:(accept,ms=12000)=>until(info,accept,ms)};
  if(controlDirectory)frameIO.ownedBounds=async bounds=>{
   const before=info(),operation=await requestOwnedBounds({directory:controlDirectory,bounds,id:randomUUID(),pid,wait:until});
   const event={...operation,before,readback:info()};row.fixtureBoundsControl.operations.push(event);checkpoint();return event;
  };
  // If the actual System Events shortcut does not switch Spaces, stop setup rather than trying more routes.
  const switchTo=target=>switchToSpace(target,{read:info,wait:accept=>until(info,accept,6000),post:command=>oracle(command)});
  const returnToTarget=()=>returnToWindowSpace({read:info,switchTo,wait:accept=>until(info,accept,15000)});
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
  async function onScreenControl(){
   row.onScreenControlState=await call(scene+'-control-before-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
   row.onScreenRaiseBefore=info();row.onScreenRaiseTarget=raiseTarget(row.onScreenControlState,row.onScreenRaiseBefore);
   row.onScreenRaise=row.onScreenRaiseTarget.available
    ?{...await call(scene+'-control-raise',()=>bound.performSecondaryAction(row.onScreenRaiseTarget.index,'Raise')),available:true,attempted:true}
    :unavailable(row.onScreenRaiseTarget.reason);
   if(row.onScreenRaise.attempted)await delay(1600);
   row.onScreenRaiseAfter=info();
   row.onScreenAfter=await call(scene+'-control-after-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
   row.onScreenControlAssertions={observation:row.onScreenControlState.ok,raise:row.onScreenRaise.ok===true,
    ...placementChecks(row.onScreenRaiseBefore,row.onScreenRaiseAfter),afterObservation:row.onScreenAfter.ok};checkpoint();
  }
  if(!onlyOtherSpace){
  row.offscreenSetup=await offscreenFixture(frameIO);row.offscreenMove=row.offscreenSetup.attempts[0].setter;
  const off={ok:row.offscreenSetup.ok,value:row.offscreenSetup.value};row.offscreenOracle=off;checkpoint();
  if(off.ok){
   row.offscreenGetApp=await call(scene+'-2-getApp',async()=>{bound=await cua.getApp(bundle);});
   row.offscreen=await call(scene+'-2-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
   row.offscreenDiff=await call(scene+'-2-diff',()=>bound.getAXState({emit:false}));
   row.offscreenScreenshot=await call(scene+'-2-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
   row.offscreenMatch=windowMatch(row.offscreen,off.value);
   let target=raiseTarget(row.offscreen,off.value,row.offscreenScreenshot.raw);
   if(head==='main'&&(!row.offscreenGetApp.ok||!row.offscreen.ok||!row.offscreenDiff.ok||!row.offscreenScreenshot.raw)){
    // disableDiff failures reset native lineage. Rebuild it via a successful *public facade* observation while visible.
    const setup=row.offscreenRaiseSetup={};setup.restoration=await restoreOriginalFrame(frameIO,origin);
    setup.restoreSize=setup.restoration.size;setup.restore=setup.restoration.move??setup.restoration.boundsControl;setup.visible=setup.restoration.verified;
    if(setup.visible.ok){
     setup.state=await call(scene+'-2-raise-refresh',()=>bound.getAXState({disableDiffing:true,emit:false}));
     setup.observedOracle=info();target=raiseTarget(setup.state,setup.observedOracle);
    }else target={available:false,reason:'original visible frame could not be re-established for lineage refresh'};
    setup.offscreenConstruction=await offscreenFixture(frameIO);setup.moveOffscreen=setup.offscreenConstruction.attempts[0].setter;
    setup.offscreen={ok:setup.offscreenConstruction.ok,value:setup.offscreenConstruction.value};
    if(!setup.offscreen.ok)target={available:false,reason:'refreshed window not independently confirmed off every display: '+setup.offscreenConstruction.reason};
   }
   row.offscreenRaiseTarget=target;row.offscreenWindowToken=target.token??null;row.offscreenRaiseBefore=info();
   row.offscreenRaise=target.available&&offscreenProof(row.offscreenRaiseBefore)
    ?{...await call(scene+'-2-raise',()=>bound.performSecondaryAction(target.index,'Raise')),available:true,attempted:true}
    :unavailable(target.reason??'offscreen precondition no longer proven');
   if(row.offscreenRaise.attempted)await delay(1200);
   row.offscreenRaiseAfter=info();checkpoint();
  }else{
   row.offscreenBlocker={reason:row.offscreenSetup.reason,attemptedRoutes:row.offscreenSetup.attempts.map(a=>a.route)};
   row.offscreenRaise=unavailable(row.offscreenSetup.reason);
  }
  row.offscreenRestoration=await restoreOriginalFrame(frameIO,origin);
  row.restoreSizeAfterOffscreen=row.offscreenRestoration.size;row.restoreAfterOffscreen=row.offscreenRestoration.move??row.offscreenRestoration.boundsControl;
  checkpoint();
  if(!row.offscreenRestoration.verified.ok)throw Error(scene+' original size/frame could not be restored after offscreen setup; subsequent fixtures would not be comparable');
  // Keep 110 points visible, independent of the hosted display's width and the app's actual accepted width.
  const w=win(info())?.frame?.width,screen=row.baselineOracle.screens?.[0];
  if(!Number.isFinite(w)||!usableFrame(screen))throw Error(scene+' partial fixture geometry unavailable');
  row.partialMove=sceneOracle('move',pid,screen.x-w+110,200);row.partialOracle=info();
  row.partial=await call(scene+'-3-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
  row.partialScreenshot=await call(scene+'-3-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
  row.restoreAfterPartial=sceneOracle('move',pid,origin.x,origin.y);
  checkpoint();
  }
  async function measureAnotherSpace(away){
   row.anotherSpaceOracle=away;
   if(!away.ok){
    row.anotherSpaceBlocker={reason:row.spaceRoute==='fullscreen'
     ?'Fullscreen Space was created, but switching to a distinct desktop did not establish the independent another-Space preconditions'
     :'Desktop selection did not establish positive distinct Space membership and on-screen-only list exclusion',
     switchSetup:row.spaceSwitchAway??null};
    row.anotherRaise=unavailable(row.anotherSpaceBlocker.reason);checkpoint();return;
   }
   row.anotherGetApp=await call(scene+'-4-getApp',async()=>{bound=await cua.getApp(bundle);});
   row.anotherGetAppAfter=info();
   row.another=await call(scene+'-4-state',()=>bound.getAXState({disableDiffing:true,emit:false}));
   row.anotherAfter=info();
   row.anotherScreenshot=await call(scene+'-4-screenshot',()=>bound.getScreenshot({emit:false}),{capture:true});
   row.anotherScreenshotAfter=info();
   row.anotherMatch=windowMatch(row.another,away.value);row.anotherMatchGeometry=windowGeometry(away.value);
   let target=raiseTarget(row.another,away.value,row.anotherScreenshot.raw);
   // Either engine may fail its another-Space observation. Keep those failures above; refresh only on the target's Space.
   if(!row.anotherGetApp.ok||!row.another.ok||!row.anotherScreenshot.raw){
    const setup=row.anotherRaiseSetup={};setup.returnToTarget=await returnToTarget();
    setup.entered=setup.returnToTarget.entered??{ok:false,value:setup.returnToTarget.before};
    if(setup.returnToTarget.ok){
     setup.state=await call(scene+'-4-raise-refresh',()=>bound.getAXState({disableDiffing:true,emit:false}));
     setup.observedOracle=info();target=raiseTarget(setup.state,setup.observedOracle);
    }else target={available:false,reason:'target Space not independently entered for successful lineage refresh'};
    if(target.available){
     setup.switchAway=await switchTo(current(away.value));
     setup.away=await until(info,i=>current(i)===current(away.value)&&anotherSpaceProof(i));
     if(!setup.switchAway.ok||!setup.away.ok)target={available:false,reason:'another-Space precondition could not be independently re-established after refresh'};
    }
   }
   row.anotherRaiseTarget=target;row.anotherRaiseBefore=info();
   row.anotherRaise=target.available&&anotherSpaceProof(row.anotherRaiseBefore)
    ?{...await call(scene+'-4-raise',()=>bound.performSecondaryAction(target.index,'Raise')),available:true,attempted:true}
    :unavailable(target.reason??'another-Space precondition no longer proven');
   if(row.anotherRaise.attempted)await delay(1600);
   row.anotherRaiseAfter=info();
   if(onlyOtherSpace)row.anotherRaiseAssertions={expectedAnswer:head==='fix'
    ?row.anotherRaise.attempted===true&&row.anotherRaise.ok===false&&row.anotherRaise.error?.errorName==='windowOnAnotherSpace'
    :row.anotherRaise.ok===true,...placementChecks(row.anotherRaiseBefore,row.anotherRaiseAfter)};
   checkpoint();
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
   const mc=row.missionControlSetup={};mc.returnToTarget=await returnToTarget();
   if(!mc.returnToTarget.ok){row.anotherSpaceBlocker={reason:'cannot return to target Space before fullscreen cleanup',returnToTarget:mc.returnToTarget};checkpoint();throw Error(scene+' target Space unavailable before Mission Control fallback cleanup');}
   mc.exitFullscreen=sceneOracle('fullscreen',pid,false);
   mc.restored=await until(info,i=>win(i)?.fullScreen===false,15000);
   if(!mc.restored.ok){row.anotherSpaceBlocker={reason:'fullscreen cleanup did not complete on the target Space',restored:mc.restored};checkpoint();throw Error(scene+' fullscreen cleanup unavailable before Mission Control fallback');}
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
     if(!mc.switched.ok)mc.blocker='New desktop created; its single selection AXPress did not establish distinct Space membership with on-screen-only list exclusion';
    }else mc.blocker='New managed Space found, but its desktop ordinal is not independently resolvable';
   }else mc.blocker=mc.addDesktop.axPressResult!==0?'Add Desktop AXPress unavailable or failed; see bounded Dock scan and AX result':!mc.created.ok?'Add Desktop pressed; no new managed Space ID observed':!mc.targetVisible.ok?'Target was not proven on its original desktop before creating the new one':'Space creation yielded ambiguous new managed IDs';
   mc.dismiss=oracle('escape');
   if(mc.blocker){row.anotherSpaceBlocker={reason:mc.blocker,addDesktop:mc.addDesktop,created:mc.created};row.anotherRaise=unavailable(mc.blocker);}
  }
  // A failed refresh return is already a recorded capability blocker, not a switching action to retry for cleanup.
  row.cleanupReturnToTarget=row.anotherRaiseSetup?.returnToTarget?.ok===false?row.anotherRaiseSetup.returnToTarget:await returnToTarget();
  row.returnToTarget=row.cleanupReturnToTarget.switched;
  checkpoint();
  if(!row.cleanupReturnToTarget.ok){row.cleanupBlocker={reason:'target Space/AX window unavailable before cleanup',returnToTarget:row.cleanupReturnToTarget};checkpoint();throw Error(scene+' cannot safely clean up before returning to the target Space');}
  row.exitFullscreen=sceneOracle('fullscreen',pid,false);row.fullscreenExited=await until(info,i=>win(i)?.fullScreen===false,15000);
  row.targetSpaceRestored=await until(info,i=>visibleOnSpace(i)&&usableFrame(win(i)?.frame));
  if(!row.fullscreenExited.ok||!row.targetSpaceRestored.ok){row.cleanupBlocker={reason:'fullscreen exit or AX restoration did not complete on the target Space'};checkpoint();throw Error(scene+' fullscreen cleanup failed; remaining on-screen samples unavailable');}
  if(controlDirectory){
   row.fullscreenRestoration=await restoreOriginalFrame(frameIO,origin);
   row.restoreMove=row.fullscreenRestoration.boundsControl;
  }else{row.restoreMove=sceneOracle('move',pid,origin.x,origin.y);row.restoreSize=sceneOracle('size',pid,origin.width,origin.height);}
  row.restoreBackground=oracle('activate','com.apple.finder');
  checkpoint();
  if(onlyOtherSpace)await onScreenControl();
  if(!onlyOtherSpace){
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
  }
  if(onlyOtherSpace){
   const groups={onScreen:row.onScreenControlAssertions??{missing:false},otherSpace:row.anotherRaiseAssertions??{missing:false}};
   row.assertionFailures=Object.entries(groups).flatMap(([group,checks])=>Object.entries(checks).filter(([,ok])=>ok!==true).map(([name])=>group+'.'+name));
   if(row.anotherSpaceOracle?.ok!==true)row.assertionFailures.push('otherSpace.fixture');
   if(row.assertionFailures.length)process.exitCode=1;
   checkpoint();
  }
  // These exact PIDs were created above; never terminate any preexisting application.
  process.kill(pid,'SIGTERM');owned.splice(owned.indexOf(pid),1);
 }
 console.log(JSON.stringify(rows.map(r=>({head,scene:r.scene,onlyOtherSpace,offscreen:r.offscreenOracle?.ok,secondSpace:r.fullscreenCreated?.ok||r.missionControlSetup?.created?.ok===true,
  anotherSpace:r.anotherSpaceOracle?.ok??false,assertionFailures:r.assertionFailures,costP50WalkMs:r.costP50WalkMs,cgCostP50Ms:r.cgCostP50Ms,returnComparison:r.returnComparison}))));
}catch(e){save('fatal.json',err(e));throw e;}
finally{
 save('results.json',rows);
 client?.close();for(const pid of owned){try{process.kill(pid,'SIGTERM');}catch{}}
 proc.kill('SIGTERM');fs.closeSync(log);
}
