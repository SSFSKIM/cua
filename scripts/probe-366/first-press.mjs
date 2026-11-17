// Ruling 757: one fresh owned app per measured press. No marker-free success predicate.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync,rmSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {FixtureTransport} from './transport.mjs';
import {Wire} from './wire.mjs';
import {firstPlan,firstJudge,firstSummarize,firstCoverage} from './first-read.mjs';
import {firstReadiness} from './first-readiness.mjs';
import {finalizeTiming} from './first-timing.mjs';
import {recordSample,deriveEffects} from './first-effects.mjs';
import {windowOptions} from './fixture/window-options.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1];};
const OUT=resolve(arg('out')),ENGINE=arg('engine'),TOOL=arg('tool'),browser=arg('browser'),smoke=arg('smoke')==='true';
const dir=dirname(fileURLToPath(import.meta.url)),fixture=join(dir,'fixture'),start=Date.now(),cells=firstPlan({browser,smoke});
const electron=browser.startsWith('electron'),style=browser==='electron-parity'?'maws':'default';
const sleep=ms=>new Promise(ok=>setTimeout(ok,Math.max(0,ms)));
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(20);}throw Error('condition timeout');}
mkdirSync(OUT,{recursive:true});
let transport;
function newTransport(){return new FixtureTransport({onEvent:e=>appendFileSync(join(OUT,'transport.jsonl'),JSON.stringify(e)+'\n')});}
transport=newTransport();
const server=createServer(async(req,res)=>{try {
 res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://fixture');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>probe366 starting</title><div id="root"></div><script src="/bundle.js"></script>');return;}
 if(u.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(fixture,'bundle.js')));return;}
 res.setHeader('Content-Type','application/json');
 if(u.pathname==='/cmd'){transport.poll({pageId:u.searchParams.get('pageId'),timeOrigin:Number(u.searchParams.get('timeOrigin'))},res);return;}
 if(u.pathname==='/answer'){let text='';for await(const b of req){text+=b;if(text.length>2000000)throw Error('oversized fixture answer');}const a=JSON.parse(text);res.statusCode=(a.op==='ready'?transport.register(a):transport.accept(a))?200:409;res.end('{}');return;}
 res.statusCode=404;res.end('{}');
} catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+'/';
async function command(q){const n=transport.send(q);try{const a=await until(()=>transport.answer(n));if(a.error)throw Error(a.error);return a;}finally{transport.cancel(n);}}
const side=spawn(TOOL,[],{stdio:['pipe','pipe','pipe']}),waiters=[];
side.stderr.pipe(process.stderr);
createInterface({input:side.stdout}).on('line',line=>{const p=waiters.shift();if(!p)return;clearTimeout(p.timer);try{const r=JSON.parse(line);if(r.error)p.no(Error(r.error));else p.ok(r);}catch(e){p.no(e);}});
function ask(q){return new Promise((ok,no)=>{const p={ok,no,timer:setTimeout(()=>{no(Error('AX helper timeout'));side.kill();},15000)};waiters.push(p);side.stdin.write(JSON.stringify(q)+'\n');});}
async function front(pid,activate=true){const r=await ask({op:'front',pid,activate});if(!r.ok||r.frontmostPid!==pid)throw Error('frontmost not verified '+JSON.stringify(r));return r;}
const socket=join(process.env.RUNNER_TEMP,'p366-first-'+browser+'.sock');rmSync(socket,{force:true});
let trace=[],traceBuffer='',engine,cover,coverPid,target;
async function connect(){const w=await Wire.connect(socket),p=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(p.error)throw Error(JSON.stringify(p));return w;}
async function rpc(w,pid,method,args={}){const startedAt=Date.now(),raw=await w.execute(method,{pid,...args});return {startedAt,endedAt:Date.now(),raw};}
async function fullObservation(w,pid,row){
 row.targetObservationCount++;
 const r=await rpc(w,pid,'get_app_state',{includeScreenshot:false,disableDiff:true});
 if(r.raw.error)throw Error('full observation '+JSON.stringify(r.raw.error));
 return r;
}
async function ageGate(row){
 if(row.age!=='aged')return;
 await sleep(row.launchedAt+10000-Date.now());
 await until(()=>Date.now()-row.launchedAt>=10000,1000);
}
async function stopOwned(child){
 if(!child)return true;if(child.exitCode!==null||child.signalCode!==null)return true;
 child.kill('SIGTERM');
 try{await until(()=>child.exitCode!==null||child.signalCode!==null,5000);return true;}
 catch{child.kill('SIGKILL');try{await until(()=>child.exitCode!==null||child.signalCode!==null,2000);return true;}catch{return false;}}
}
const config={schema:4,experiment:'first-press-readiness',ruling:757,browser,smoke,kit:process.env.GITHUB_SHA,engine:process.env.ENGINE_REF,
 image:process.env.ImageVersion,startedAt:start,cells,windowStyle:electron?style:'browser',windowOptions:electron?windowOptions(style):null,
 cold:'fresh app/profile; no earlier native AXPress',warm:'fresh app/profile; one earlier foreground bare primer AXPress, marker-checked even if dropped; no activation hold',
 observation:'aged+observed: early full getState then another just before press; immediate+observed: one just before; unobserved: no pre-press full walk, only minimal target lookup; smoke screenshots follow the entire 3s effect window',
 observationCount:'targetObservationCount counts only pre-press full walks',
 age:'aged waits until at least 10s since launch; actual last enablement-write delta, not assigned age, is the primary axis',
 repetitions:'observed main/bare 20, immediate inside-point controls 5, no-observation directional controls 3; critical observed cells first',sampleDelays:[0,50,250,1000,3000],
 carrier:'probe-only named AXButton resolution, then production input enablement, actionRoute, cursor announcement and elementActionClick in every arm',
 confirmation:'only the handler marker; dialog survival is never confirmation',timelineClock:'renderer wallAt, Electron main Date.now and native wall clock; events within 1ms unordered',
 pointCandidates:'native probe copy: titlebar 75% across visible window top+14; toolbar visible web area x+min(400,width/2) top+22; original window ID retained',
 sideEffectOtherPointer:'a page pointer outside action/primer, or changed active owned-window title',budgetMinutes:75};
writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));
let complete=0,invalid=0,consecutiveInvalid=0;
try {
 engine=spawn(ENGINE,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});
 engine.stderr.on('data',d=>{appendFileSync(join(OUT,'engine-stderr.txt'),d);traceBuffer+=d;for(;;){const i=traceBuffer.indexOf('\n');if(i<0)break;const l=traceBuffer.slice(0,i);traceBuffer=traceBuffer.slice(i+1);if(l.startsWith('PROBE366 '))try{trace.push(JSON.parse(l.slice(9)));}catch{}}});
 await until(()=>existsSync(socket));
 let coverOut='';cover=spawn(join(process.env.RUNNER_TEMP,'Probe366 Cover.app/Contents/MacOS/cover366'),['--cover'],{stdio:['ignore','pipe','inherit']});cover.stdout.on('data',d=>{coverOut+=d;});
 coverPid=await until(()=>{try{return JSON.parse(coverOut.trim()).pid;}catch{return null;}});
 const require=createRequire(join(fixture,'package.json'));
 const bin=electron?require('electron'):(process.env.CFT_BIN??'/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
 if(!existsSync(bin))throw Error('browser binary missing');
 config.browserVersion=electron?JSON.parse(readFileSync(join(fixture,'node_modules/electron/package.json'),'utf8')).version:spawnSync(bin,['--version'],{encoding:'utf8',timeout:10000}).stdout.trim();
 writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));
 for(const cell of cells) {
  if(Date.now()-start>75*60000)throw Error('75 minute budget exceeded; critical observed cells precede exploratory cells');
  transport.close();transport=newTransport();trace=[];
  const row={...cell,smoke,appLaunchId:randomUUID(),valid:false,targetObservationCount:0,startedAt:Date.now(),sideEffects:{dialogClosed:false,frontmostChanged:false,raised:false,windowMoved:false,otherPointer:false,ownerLost:false}};
  const profile=join(OUT,'profiles',row.appLaunchId);mkdirSync(profile,{recursive:true});
  let w,stage='launch',appInfo=[];
  try {
   row.launchedAt=Date.now();
   target=electron?spawn(bin,[fixture],{env:{...process.env,PROBE366_URL:url,PROBE366_WINDOW_STYLE:style,PROBE366_PROFILE:profile},stdio:['ignore','pipe','pipe']}):
    spawn(bin,['--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen','--disable-features=Translate','--window-position=0,25','--window-size=650,700',url],{stdio:['ignore','pipe','pipe']});
   const pid=target.pid;row.targetPid=pid;row.coverPid=coverPid;
   target.on('error',e=>{row.processError=String(e);});
   let appBuffer='';target.stdout.on('data',d=>{appendFileSync(join(OUT,'app-stdout.txt'),row.appLaunchId+' '+d);appBuffer+=d;for(;;){const i=appBuffer.indexOf('\n');if(i<0)break;const l=appBuffer.slice(0,i);appBuffer=appBuffer.slice(i+1);if(l.startsWith('{'))try{appInfo.push(JSON.parse(l));}catch{}}});
   target.stderr.on('data',d=>appendFileSync(join(OUT,'app-stderr.txt'),row.appLaunchId+' '+d));
   await until(()=>transport.clients.size>0,20000);
   if(electron){const info=await until(()=>appInfo.find(i=>i.kind==='fixture-ready'));if(info.electron!=='44.4.5'||info.userData!==profile||info.sessionData!==profile)throw Error('fresh pinned Electron profile not established '+JSON.stringify(info));}
   await front(pid);stage='setup';
   w=await connect();
   // Cold aged unobserved apps receive no AX ownership/title request until the age gate.
   if(cell.age==='aged'&&!cell.observeFirst&&cell.temperature==='cold')await ageGate(row);
   row.ownerBindingStartedAt=Date.now();
   await until(async()=>{const t=await ask({op:'title',pid});try{transport.bind(t.title);return true;}catch{return false;}},10000);
   row.ownerBindingEndedAt=Date.now();row.owner={...transport.owner};
   if(cell.age==='aged'&&cell.observeFirst)row.earlyObservation=await fullObservation(w,pid,row);
   const initial=await command({op:'read'});
   if(initial.open||initial.primerPresses!==0)throw Error('fresh app primer state not empty');
   if(cell.temperature==='warm') {
    row.primer={before:initial};
    row.primer.call=await rpc(w,pid,'click',{probe366NamedButton:'Prime probe button',probe366Variant:'bare',probe366Id:cell.id+'/primer'});
    row.primer.immediate=await command({op:'read'});
    await sleep(row.primer.call.endedAt+3000-Date.now());
    row.primer.after=await command({op:'read'}); // Full 3s window, no input retry; even a dropped primer is a prior API call.
   }
   await ageGate(row);
   row.reset=await command({op:'reset',trial:cell.id,scene:cell.scene});
   row.frontTransition=await front(coverPid);await sleep(250);
   if(cell.observeFirst)row.prePressObservation=await fullObservation(w,pid,row);
   const nativeBefore=await ask({op:'status',pid,coverPid});row.beforeGeometry=nativeBefore.geometry;
   row.before=await command({op:'read'});
   if(row.before.pageId!==row.owner.pageId||row.before.timeOrigin!==row.owner.timeOrigin||row.before.trial!==cell.id||!row.before.open||row.before.presses!==0||row.before.active!=='action')throw Error('initial measured state not established');
   if(electron&&(row.before.chrome?.toolbarHeight!==44||row.before.chrome?.toolbarRegion!=='drag'||row.before.chrome?.controlRegion!=='no-drag'))throw Error('toolbar parity not established');
   row.preMeasureAXPressCount=trace.filter(e=>e.kind==='perform.begin'&&e.action==='AXPress').length;
   if(row.preMeasureAXPressCount!==(cell.temperature==='warm'?1:0))throw Error('unexpected previous native AXPress count '+row.preMeasureAXPressCount);
   row.frontBefore=await front(coverPid,false);row.ageAtPressMs=Date.now()-row.launchedAt;
   row.valid=true;stage='action';
   row.call=await rpc(w,pid,'click',{probe366NamedButton:'Run probe button',probe366Variant:cell.variant,probe366Id:cell.id});
   stage='readback';row.samples=[];
   for(const requestedMs of config.sampleDelays) {
    await sleep(row.call.endedAt+requestedMs-Date.now());
    // The native observation is persisted before the renderer is asked, so a renderer failure keeps any raise/frontmost harm.
    const sample=await recordSample(row.samples,requestedMs,{native:()=>ask({op:'status',pid,coverPid,windowID:row.beforeGeometry?.windowID}),
     renderer:()=>command({op:'read'}),owns:e=>e.pageId===row.owner.pageId&&e.timeOrigin===row.owner.timeOrigin&&e.trial===cell.id});
    row.after=sample.effect;if(sample.geometry)row.afterGeometry=sample.geometry;
   }
   row.frontAfter=await ask({op:'title',pid});
   row.trace=trace.filter(e=>e.trial===cell.id);row.priorTrace=trace.filter(e=>e.trial===cell.id+'/primer');
   row.measuredAXPressCount=row.trace.filter(e=>e.kind==='perform.begin'&&e.action==='AXPress').length;
   stage='route-validation';
   if(row.measuredAXPressCount>1||(!row.call.raw.error&&row.measuredAXPressCount!==1))throw Error('successful call was not exactly one AXPress: '+row.measuredAXPressCount+' '+JSON.stringify(row.call.raw));
   if(smoke) {
    const outputDirectory=join(OUT,'shots',cell.id.replaceAll('/','_'));mkdirSync(outputDirectory,{recursive:true});
    try{row.followup=await rpc(w,pid,'get_app_state',{includeScreenshot:true,outputDirectory});}catch(e){row.followupError=String(e);}
   }
  } catch(e){row.valid=false;row.failureStage=stage;row.problem=String(e.stack??e).slice(0,20000);if(stage==='readback')row.sideEffects.ownerLost=true;}
  finally {
   if(w){try{row.release=await rpc(w,coverPid,'get_app_state',{includeScreenshot:false});}catch(e){row.releaseError=String(e);}w.close();}
   row.appInfo=appInfo;row.trace??=trace.filter(e=>e.trial===cell.id);row.priorTrace??=trace.filter(e=>e.trial===cell.id+'/primer');
   row.stopped=await stopOwned(target);if(row.stopped)rmSync(profile,{recursive:true,force:true});
   if(row.targetPid)await ask({op:'forget',pid:row.targetPid});
   target=null;
  }
  finalizeTiming(row,trace,appInfo);
  row.inertClicks=row.trace.filter(e=>e.kind==='activation.click');
  Object.assign(row.sideEffects,deriveEffects(row,coverPid));
  row.endedAt=Date.now();row.judgment=firstJudge(row);
  appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n');complete++;
  if(!row.judgment.eligible){invalid++;consecutiveInvalid++;}else consecutiveInvalid=0;
  writeFileSync(join(OUT,'progress.json'),JSON.stringify({complete,planned:cells.length,invalid,last:cell.id,elapsedMs:Date.now()-start},null,2));
  console.log('first-press',cell.id,row.problem??JSON.stringify(row.judgment));
  if(!row.stopped)throw Error('owned app did not stop; refusing to launch another');
  if(consecutiveInvalid>=3)throw Error('three consecutive invalid cells; stop on broken setup');
 }
 const rows=readFileSync(join(OUT,'rows.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 writeFileSync(join(OUT,'summary.json'),JSON.stringify(firstSummarize(rows),null,2));
 writeFileSync(join(OUT,'coverage.json'),JSON.stringify(firstCoverage(rows,{browser,smoke}),null,2));
 writeFileSync(join(OUT,'readiness.json'),JSON.stringify(firstReadiness(rows),null,2));
 if(invalid)process.exitCode=1;
} catch(e){writeFileSync(join(OUT,'fatal.json'),JSON.stringify({error:String(e.stack??e),complete,planned:cells.length},null,2));throw e;}
finally{await stopOwned(target);cover?.kill();engine?.kill();side.kill();transport.close();server.closeAllConnections();server.close();}
