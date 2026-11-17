// Hosted real-engine qualification: no engine source patches, named carrier, forced route or probe timing gate.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync,rmSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {FixtureTransport} from './transport.mjs';
import {Wire} from './wire.mjs';
import {recordSample} from './first-effects.mjs';
import {withFinalEffects,requireCoverFront} from './qualification-effects.mjs';
import {removeProfile} from './first-cleanup.mjs';
import {qualificationPlan,qualificationSummarize,qualificationCoverage} from './qualification-read.mjs';
import {attachWaits} from './qualification-timing.mjs';
import {readEngineWindow} from '../cursor-sitting/signposts.mjs';
import {startCpu2,cpuUsageBetween} from './qualification-load.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1];};
const OUT=resolve(arg('out')),browser=arg('browser'),smoke=arg('smoke')==='true',TOOL=arg('tool');
const diagnostic=arg('diagnostic')==='true',supplement=arg('supplement')==='true',lifecycle=arg('lifecycle')==='true',repair=arg('repair')==='true';
const engines={main:arg('main-engine'),fix:arg('fix-engine')},refs={main:arg('main-ref'),fix:arg('fix-ref')};
const dir=dirname(fileURLToPath(import.meta.url)),fixture=join(dir,'fixture'),electron=browser.startsWith('electron'),start=Date.now();
const sleep=ms=>new Promise(ok=>setTimeout(ok,Math.max(0,ms)));
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(20);}throw Error('condition timeout');}
mkdirSync(OUT,{recursive:true});let transport;
function makeTransport(){return new FixtureTransport({onEvent:e=>appendFileSync(join(OUT,'transport.jsonl'),JSON.stringify(e)+'\n')});}
transport=makeTransport();
const server=createServer(async(req,res)=>{try{
 res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://fixture');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>probe366 starting</title><div id="root"></div><script src="/bundle.js"></script>');return;}
 if(u.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(fixture,'bundle.js')));return;}
 res.setHeader('Content-Type','application/json');
 if(u.pathname==='/cmd'){transport.poll({pageId:u.searchParams.get('pageId'),timeOrigin:Number(u.searchParams.get('timeOrigin'))},res);return;}
 if(u.pathname==='/answer'){let s='';for await(const b of req){s+=b;if(s.length>2000000)throw Error('oversized answer');}const a=JSON.parse(s);res.statusCode=(a.op==='ready'?transport.register(a):transport.accept(a))?200:409;res.end('{}');return;}
 res.statusCode=404;res.end('{}');
}catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+server.address().port+'/';
async function command(q){const n=transport.send(q);try{const a=await until(()=>transport.answer(n));if(a.error)throw Error(a.error);return a;}finally{transport.cancel(n);}}
const helper=spawn(TOOL,[],{stdio:['pipe','pipe','inherit']}),waiters=[];
createInterface({input:helper.stdout}).on('line',line=>{const w=waiters.shift();if(!w)return;clearTimeout(w.timer);try{const a=JSON.parse(line);if(a.error)w.no(Error(a.error));else w.ok(a);}catch(e){w.no(e);}});
function ask(q){return new Promise((ok,no)=>{const w={ok,no,timer:setTimeout(()=>no(Error('native helper timeout')),15000)};waiters.push(w);helper.stdin.write(JSON.stringify(q)+'\n');});}
async function front(pid,activate=true){const r=await ask({op:'front',pid,activate});if(!r.ok||r.frontmostPid!==pid)throw Error('frontmost not verified');return r;}
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return true;child.kill('SIGTERM');try{await until(()=>child.exitCode!==null||child.signalCode!==null,5000);return true;}catch{child.kill('SIGKILL');try{await until(()=>child.exitCode!==null||child.signalCode!==null,2000);return true;}catch{return false;}}}
const cells=qualificationPlan({browser,smoke,supplement,lifecycle,repair}).filter(c=>!diagnostic||(c.group==='value'&&c.engineSide==='fix'&&c.rep===0)),config={schema:2,experiment:diagnostic?'real-engine-cache-diagnostic':repair?'real-engine-cell-recovery':lifecycle?'real-engine-lifecycle-smoke':supplement?'real-engine-matched-supplement':'real-engine-qualification',browser,smoke,diagnostic,supplement,lifecycle,repair,refs,kit:process.env.GITHUB_SHA,image:process.env.ImageVersion,cells,startedAt:start,
 engine:'unmodified source builds; ordinary snapshot element tokens; no probe gating or forced routes',waitEvidence:'post-trial log show; gate inside native request, matched to RPC by method/order; not wall-clock joining',postholdIdleMs:36000,postholdProof:lifecycle?'36s observation should remain owned with no write or substantial wait; endTask is followed by the raw native read (retained, never proof), a cached same-ref action read and Electron setter events, then always a new connection observation and click':'next observation must re-read true/false/unreadable, never owned; 30s grace plus 3s dispatch leeway plus 3s margin',earlyObservationDeadlineMs:1250,effectWindowMs:3000,load:'hosted parity cpu:2; worker CPU-time deltas measured'};
writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));
let cover,coverPid,target,engine,load,w;const rows=[];
async function rpc(pid,method,args={},options={}){const startedAt=Date.now(),raw=await w.execute(method,{pid,...args},options);return {method,startedAt,endedAt:Date.now(),raw};}
async function observe(row,pid,options={}){const r=await rpc(pid,'get_app_state',{includeScreenshot:false,disableDiff:true},options);row.observations.push(r);if(r.raw.error)throw Error('observation '+JSON.stringify(r.raw.error));return r;}
function token(observation,kind){const n=observation.raw.result?.nodes?.find(n=>kind==='value'?n.role==='AXTextField'&&n.title==='Probe search':n.role==='AXButton'&&(n.title==='Run probe button'||n.description==='Run probe button'));if(!n?.token)throw Error('observed target token missing '+kind);return n.token;}
async function measured(row,label,pid,element,method='click'){
 const before=await command({op:'read'}),native=await ask({op:'status',pid,coverPid});
 const call={label,method,element,before,beforeGeometry:native.geometry,samples:[],owner:row.owner,sideEffects:{ownerLost:false}};row.calls.push(call);
 const args={element};if(method==='set_value'){call.expectedValue='qual-'+row.appLaunchId.slice(0,8)+'-'+label;args.value=call.expectedValue;}
 // Side effects are finalized even when a later step throws, so native harm already sampled is never lost.
 return withFinalEffects(call,{owner:row.owner,coverPid},async()=>{
  // The cover must still be frontmost right before this RPC (never reactivated here); otherwise nothing is dispatched.
  requireCoverFront(call,native,coverPid);
  call.loadBefore=load?.sample();Object.assign(call,await rpc(pid,method,args));
  for(const requestedMs of [0,50,250,1000,3000]){
   await sleep(call.endedAt+requestedMs-Date.now());
   const sample=await recordSample(call.samples,requestedMs,{native:()=>ask({op:'status',pid,coverPid,windowID:call.beforeGeometry?.windowID}),renderer:()=>command({op:'read'}),owns:e=>e.pageId===row.owner.pageId&&e.timeOrigin===row.owner.timeOrigin&&e.trial===row.id});
   call.after=sample.effect;call.afterGeometry=sample.geometry;
  }
  call.loadAfter=load?.sample();if(load)call.loadCpuPercent=cpuUsageBetween(call.loadBefore,call.loadAfter);
  call.frontAfter=await ask({op:'title',pid});
  if(label==='early')call.wrongTargetHits=call.after.events.filter(e=>e.type==='click'&&e.wallAt>=call.startedAt&&e.target!=='action');
  return call;
 });
}
try{
 let coverText='';cover=spawn(join(process.env.RUNNER_TEMP,'Probe366 Cover.app/Contents/MacOS/cover366'),['--cover'],{stdio:['ignore','pipe','inherit']});cover.stdout.on('data',d=>coverText+=d);coverPid=await until(()=>{try{return JSON.parse(coverText.trim()).pid;}catch{return null;}});
 const require=createRequire(join(fixture,'package.json')),bin=electron?require('electron'):(process.env.CFT_BIN??'/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
 if(!existsSync(bin))throw Error('browser missing');
 for(const cell of cells){
  if(Date.now()-start>70*60000)throw Error('qualification budget exceeded');
  transport.close();transport=makeTransport();
  const row={...cell,smoke,appLaunchId:randomUUID(),valid:false,startedAt:Date.now(),observations:[],calls:[],coverPid};
  const profile=join(OUT,'profiles',row.appLaunchId),home=join(profile,'engine-home'),socket=join(process.env.RUNNER_TEMP,'q366-'+browser+'.sock');mkdirSync(home,{recursive:true});rmSync(socket,{force:true});
  try{
   if(cell.group==='load')load=await startCpu2();
   row.launchedAt=Date.now();target=electron?spawn(bin,[fixture],{env:{...process.env,PROBE366_URL:url,PROBE366_WINDOW_STYLE:browser==='electron-parity'?'maws':'default',PROBE366_PROFILE:profile},stdio:['ignore','pipe','pipe']}):spawn(bin,['--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen','--disable-features=Translate','--window-position=0,25','--window-size=650,700',url],{stdio:['ignore','pipe','pipe']});
   const pid=target.pid;row.targetPid=pid;row.appInfo=[];let buffer='';
   target.stdout.on('data',d=>{appendFileSync(join(OUT,'app-stdout.txt'),row.appLaunchId+' '+d);buffer+=d;for(;;){const i=buffer.indexOf('\n');if(i<0)break;const l=buffer.slice(0,i);buffer=buffer.slice(i+1);try{if(l.startsWith('{'))row.appInfo.push(JSON.parse(l));}catch{}}});target.stderr.on('data',d=>appendFileSync(join(OUT,'app-stderr.txt'),row.appLaunchId+' '+d));
   await until(()=>transport.clients.size>0,20000);if(electron)await until(()=>row.appInfo.some(x=>x.kind==='fixture-ready'));
   await front(pid);await until(async()=>{const t=await ask({op:'title',pid});try{transport.bind(t.title);return true;}catch{return false;}},10000);row.owner={...transport.owner};
   await command({op:'reset',trial:row.id,scene:'modal'});if(cell.group==='value')await command({op:'focus-field'});
   engine=spawn(engines[cell.engineSide],[],{env:{...process.env,HOME:home,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});row.enginePid=engine.pid;row.engineRef=refs[cell.engineSide];engine.stderr.on('data',d=>appendFileSync(join(OUT,'engine-stderr.txt'),row.appLaunchId+' '+d));
   await until(()=>existsSync(socket));w=await Wire.connect(socket);const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(ping.error)throw Error('engine ping '+JSON.stringify(ping));
   await front(coverPid);await sleep(250);
   const observation=await observe(row,pid,cell.group==='early'?{deadlineMs:1250}:{}),element=token(observation,cell.group==='value'?'value':'press');
   if(diagnostic){
    row.cachedEarly=await ask({op:'cache-diagnostic',pid});
    await sleep(observation.endedAt+2600-Date.now());
    row.modeOnlyCompare=await ask({op:'compare-diagnostic',pid});
   }
   if(cell.group==='value'){
    await measured(row,'value',pid,element,'set_value');
    if(diagnostic){
     row.cachedLate=await ask({op:'compare-diagnostic',pid});
     row.freshObservation=await observe(row,pid);
     row.completeCache=await ask({op:'cache-diagnostic',pid,cacheName:'complete'});
     await measured(row,'fresh-value',pid,token(row.freshObservation,'value'),'set_value');
     row.afterFreshValue=await ask({op:'compare-diagnostic',pid,cacheName:'complete'});
     row.freshClickObservation=await observe(row,pid);
     row.clickCache=await ask({op:'cache-diagnostic',pid,cacheName:'click'});
     await measured(row,'fresh-click',pid,token(row.freshClickObservation,'press'));
     row.afterFreshClick=await ask({op:'compare-diagnostic',pid,cacheName:'click'});
    }
   }
   else if(cell.group==='lifecycle'){
    const first=await measured(row,'cold',pid,element);
    row.idleStartedAt=Date.now();await sleep(first.endedAt+config.postholdIdleMs-Date.now());row.idleEndedAt=Date.now();
    const held=await observe(row,pid);await measured(row,'held',pid,token(held,'press'));
    // The raw native getter is only retained (a computed getter, unreliable as a mode indicator in either direction): it never proves release or blocks the new task.
    // Independent signals: Electron's setter event, and the same cached AX ref's actions read before and after endTask (no fresh walk, no action).
    const evidence=row.releaseEvidence={errors:{}};
    const capture=async(name,fn)=>{try{evidence[name]=await fn();}catch(e){evidence.errors[name]=String(e);}};
    await capture('cachedBefore',()=>ask({op:'cache-diagnostic',pid,cacheName:'lifecycle'}));
    const startedAt=Date.now(),raw=await w.call('endTask',{});row.taskEnd={startedAt,endedAt:Date.now(),raw};
    await capture('cachedAfter',()=>ask({op:'cached-diagnostic',pid,cacheName:'lifecycle'}));
    try{row.releaseRead=await ask({op:'read-enablement',pid,attribute:browser==='cft'?'AXEnhancedUserInterface':'AXManualAccessibility'});}catch(e){evidence.errors.releaseRead=String(e);}
    if(electron){
     const setterWait={startedAt:Date.now(),deadlineMs:3000};
     try{await until(()=>row.appInfo.some(e=>e.kind==='accessibility-support-changed'&&e.pid===pid&&e.enabled===false&&e.at>=startedAt),setterWait.deadlineMs);}catch{}
     setterWait.endedAt=Date.now();evidence.setterWait=setterWait;
    }
    w.close();w=await Wire.connect(socket);
    const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(ping.error)throw Error('new task ping '+JSON.stringify(ping.error));
    const next=await observe(row,pid);await measured(row,'new-task',pid,token(next,'press'));
   }
   else {
    const first=await measured(row,cell.group==='load'?'loaded':cell.group==='early'?'early':'cold',pid,element);
    if(cell.expectedCalls.includes('warm'))await measured(row,'warm',pid,element);
    if(cell.group==='posthold'){
     row.idleStartedAt=Date.now();await sleep(first.endedAt+config.postholdIdleMs-Date.now());row.idleEndedAt=Date.now();
     const eventsBeforeObservation=row.appInfo.filter(e=>e.kind==='accessibility-support-changed'&&e.at>=first.endedAt);
     const again=await observe(row,pid),prior=again.raw.result?.timings?.enablementPrior;
     row.postholdRelease={prior,verified:['true','false','unreadable'].includes(prior),idleFromRequestEndMs:again.startedAt-first.endedAt,eventsBeforeObservation};
     if(!row.postholdRelease.verified)throw Object.assign(Error('release-not-observed: next observation prior '+prior),{stage:'release'});
     await measured(row,'posthold',pid,token(again,'press'));
    }
   }
   row.valid=true;
  }catch(e){row.problem=String(e.stack??e);if(e.stage)row.failureStage=e.stage;}
  finally{
   w?.close();w=null;row.targetStopped=await stop(target);target=null;row.engineStopped=await stop(engine);engine=null;
   if(load){row.load=await load.stop();load=null;}
   row.profileCleanup=row.targetStopped&&row.engineStopped?removeProfile(profile):{attempted:false,ok:null};
   if(row.enginePid){
    await sleep(1000);
    try{const text=await readEngineWindow(new Date(row.startedAt-5000),new Date(Date.now()+5000));appendFileSync(join(OUT,'signposts.ndjson'),text);const attached=attachWaits([...row.observations,...row.calls],text,{enginePid:row.enginePid,engineSide:row.engineSide});if(Array.isArray(attached)){row.observations=attached.slice(0,row.observations.length);row.calls=attached.slice(row.observations.length);}}
    catch(e){row.signpostError=String(e);for(const c of [...row.observations,...row.calls]){c.waitMs=null;c.waitEvidence='missing';}}
   }
   row.endedAt=Date.now();rows.push(row);appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n');writeFileSync(join(OUT,'progress.json'),JSON.stringify({complete:rows.length,planned:cells.length,last:row.id}));
   console.log('qualification',row.id,row.problem??'recorded');
   if(!row.targetStopped||!row.engineStopped)throw Error('owned process failed to stop');await sleep(1000);
  }
 }
 writeFileSync(join(OUT,'summary.json'),JSON.stringify(diagnostic?{diagnostic:true,rows:rows.length,problems:rows.filter(r=>r.problem).map(r=>r.problem)}:qualificationSummarize(rows),null,2));const coverage=diagnostic?{ok:rows.length===cells.length&&rows.every(r=>r.valid),diagnostic:true,rows:rows.length,expected:cells.length}:qualificationCoverage(rows,{browser,smoke});writeFileSync(join(OUT,'coverage.json'),JSON.stringify(coverage,null,2));if(!coverage.ok)process.exitCode=1;
}catch(e){writeFileSync(join(OUT,'fatal.json'),JSON.stringify({error:String(e.stack??e),complete:rows.length,planned:cells.length},null,2));throw e;}
finally{await stop(target);await stop(engine);if(load)await load.stop();await stop(cover);helper.kill();transport.close();server.closeAllConnections();server.close();}
