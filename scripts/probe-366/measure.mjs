// Hosted only. One cold connection per measured trial; no action retry and no owner profiles.
import {spawn,spawnSync} from 'node:child_process';
import {release} from 'node:os';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync,rmSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline';
import {FixtureTransport} from './transport.mjs';
import {Wire} from './wire.mjs';
import {plan,judge,summarize} from './read.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only; never run on either owner Mac');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1];};
const OUT=resolve(arg('out')),ENGINE=arg('engine'),TOOL=arg('tool'),browser=arg('browser'),smoke=arg('smoke')==='true';
const dir=dirname(fileURLToPath(import.meta.url)),fixture=join(dir,'fixture'),start=Date.now(),cells=plan({browser,smoke});
const sleep=ms=>new Promise(ok=>setTimeout(ok,Math.max(0,ms)));
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(20);}throw Error('condition timeout');}
mkdirSync(OUT,{recursive:true});
const transport=new FixtureTransport({onEvent:e=>appendFileSync(join(OUT,'transport.jsonl'),JSON.stringify(e)+'\n')});
const server=createServer(async(req,res)=>{try {
 res.setHeader('Cache-Control','no-store');const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>probe366 starting</title><div id="root"></div><script src="/bundle.js"></script>');return;}
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(fixture,'bundle.js')));return;}
 res.setHeader('Content-Type','application/json');
 if(url.pathname==='/cmd'){transport.poll({pageId:url.searchParams.get('pageId'),timeOrigin:Number(url.searchParams.get('timeOrigin'))},res);return;}
 if(url.pathname==='/answer'){
  let text='';for await(const chunk of req){text+=chunk;if(text.length>2000000)throw Error('oversized fixture answer');}
  const a=JSON.parse(text);const ok=a.op==='ready'?transport.register(a):transport.accept(a);res.statusCode=ok?200:409;res.end('{}');return;
 }
 res.statusCode=404;res.end('{}');
} catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+'/';
async function command(q){const n=transport.send(q);try {const a=await until(()=>transport.answer(n));if(a.error)throw Error(a.error);return a;}finally{transport.cancel(n);}}
const side=spawn(TOOL,[],{stdio:['pipe','pipe','pipe']}),waiters=[];
side.stderr.pipe(process.stderr);
createInterface({input:side.stdout}).on('line',line=>{const p=waiters.shift();if(!p)return;clearTimeout(p.timer);try{const r=JSON.parse(line);if(r.error)p.no(Error(r.error));else p.ok(r);}catch(e){p.no(e);}});
function ask(q){return new Promise((ok,no)=>{const p={ok,no,timer:setTimeout(()=>{no(Error('AX helper timeout'));side.kill();},15000)};waiters.push(p);side.stdin.write(JSON.stringify(q)+'\n');});}
async function front(pid,activate=true){const r=await ask({op:'front',pid,activate});if(!r.ok||r.frontmostPid!==pid)throw Error('foreground not verified '+JSON.stringify(r));return r;}
let target,cover,engine;
let trace=[],traceBuffer='',coverBuffer='';
const socket=join(process.env.RUNNER_TEMP,'p366-'+browser+'.sock');rmSync(socket,{force:true});
const config={schema:1,browser,smoke,kit:process.env.GITHUB_SHA,engine:process.env.ENGINE_REF,image:process.env.ImageVersion,
 startedAt:start,node:process.version,arch:process.arch,os:release(),cells,fixtureBuild:JSON.parse(readFileSync(join(fixture,'build.json'),'utf8')),electron:'44.4.5',radix:'1.1.15',
 fullRateReps:20,fullDiagnosticReps:3,setup:'foreground DOM reset; AX-window-title owner binding; cold engine connection; 250ms deactivation settle; verified frontmost immediately before action',
 sampleDelays:smoke?[0,50,250,1000]:[0,50,250,1000,3000],confirmation:'offline sampled AX wrappers, actual elapsed time; dialog survival alone is NOT handler proof',
 trace:'instrumented main, logs add overhead; no-click is unsafe mechanism isolation, not a release candidate',
 budgetMinutes:65};
writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));
async function connect(){const w=await Wire.connect(socket);const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(ping.error)throw Error(JSON.stringify(ping));return w;}
async function rpc(w,pid,method,args={}){const startedAt=Date.now(),raw=await w.execute(method,{pid,...args});return {startedAt,endedAt:Date.now(),raw};}
const label=n=>[n.title,n.description,n.identifier,n.domIdentifier].filter(x=>typeof x==='string').join(' ');
async function observe(w,pid){
 let r;
 for(let attempt=0;attempt<4;attempt++){
  r=await rpc(w,pid,'get_app_state',{includeScreenshot:false,disableDiff:true});
  if(r.raw.error)throw Error(JSON.stringify(r.raw.error));
  const nodes=r.raw.result.nodes??[],button=nodes.find(n=>n.role==='AXButton'&&label(n).includes('Run probe button')),
   field=nodes.find(n=>['AXTextField','AXSearchField','AXTextArea'].includes(n.role)&&label(n).includes('Probe search'));
  if(button&&field)return {observation:r,button:button.token,field:field.token};
  await sleep(500);
 }
 throw Error('fixture controls not in engine observation '+JSON.stringify(r.raw).slice(0,12000));
}
let completed=0,invalid=0,consecutiveInvalid=0;
try {
 engine=spawn(ENGINE,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});
 engine.stderr.on('data',d=>{
  appendFileSync(join(OUT,'engine-stderr.txt'),d);traceBuffer+=d;
  for(;;){const i=traceBuffer.indexOf('\n');if(i<0)break;const line=traceBuffer.slice(0,i);traceBuffer=traceBuffer.slice(i+1);
   if(line.startsWith('PROBE366 ')){try{trace.push(JSON.parse(line.slice(9)));}catch{}}
  }
 });
 await until(()=>existsSync(socket));
 cover=spawn(join(process.env.RUNNER_TEMP,'Probe366 Cover.app/Contents/MacOS/cover366'),['--cover'],{stdio:['ignore','pipe','inherit']});cover.stdout.on('data',d=>{coverBuffer+=d;});
 const coverPid=await until(()=>{try{return JSON.parse(coverBuffer.trim()).pid;}catch{return null;}});
 if(browser==='electron') {
  const require=createRequire(join(fixture,'package.json')),bin=require('electron');
  config.browserVersion=JSON.parse(readFileSync(join(fixture,'node_modules/electron/package.json'),'utf8')).version;
  if(config.browserVersion!=='44.4.5')throw Error('Electron version pin drift');
  target=spawn(bin,[fixture],{env:{...process.env,PROBE366_URL:url},stdio:['ignore','pipe','pipe']});
  target.stdout.on('data',d=>appendFileSync(join(OUT,'app-stdout.txt'),d));target.stderr.on('data',d=>appendFileSync(join(OUT,'app-stderr.txt'),d));
 } else {
  const bin=process.env.CFT_BIN??'/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  if(!existsSync(bin))throw Error('Chrome for Testing missing: '+bin);
  const version=spawnSync(bin,['--version'],{encoding:'utf8',timeout:10000});if(version.status!==0)throw Error('cannot read CFT version');config.browserVersion=version.stdout.trim();
  target=spawn(bin,['--user-data-dir='+join(OUT,'cft-profile'),'--no-first-run','--no-default-browser-check','--disable-search-engine-choice-screen','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-features=Translate','--lang=en-US','--window-position=380,50','--window-size=650,700',url],{stdio:['ignore','ignore','pipe']});
  target.stderr.on('data',d=>appendFileSync(join(OUT,'app-stderr.txt'),d));
 }
 for(const child of [engine,cover,target])child.on('error',e=>{writeFileSync(join(OUT,'process-error.txt'),String(e));});
 const pid=target.pid;config.targetPid=pid;config.coverPid=coverPid;
 await until(()=>transport.clients.size>0,20000);await front(pid);
 // Establish accessibility before binding the AX-window nonce. No target input is used for setup.
 const warm=await connect();const initial=await rpc(warm,pid,'get_app_state',{includeScreenshot:false});warm.close();
 writeFileSync(join(OUT,'initial-observation.json'),JSON.stringify(initial,null,2));
 await until(async()=>{const r=await ask({op:'title',pid});try{transport.bind(r.title);return true;}catch{return false;}},10000);
 config.owner={...transport.owner};writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));
 for(const cell of cells) {
  if(Date.now()-start>65*60000)throw Error('65 minute measurement budget exceeded; coverage reader reports remainder');
  const row={...cell,smoke,expected:'needle-'+cell.rep,valid:false,startedAt:Date.now(),targetPid:pid,coverPid};let w;
  let stage='setup';
  try {
   w=await connect();row.prepareForeground=await front(pid);
   const ownerTitle=await ask({op:'title',pid});const owner=transport.bind(ownerTitle.title);
   if(owner.pageId!==config.owner.pageId||owner.timeOrigin!==config.owner.timeOrigin)throw Error('visible fixture realm changed');
   row.reset=await command({op:'reset',trial:cell.id,scene:cell.scene});
   let obs=await observe(w,pid);row.observation=obs.observation;
   row.bound=await ask({op:'bind',pid});
   if(row.bound.ax.dialog!==true||row.bound.ax.value!==''||row.bound.ax.marker!==0)throw Error('AX setup oracle unavailable '+JSON.stringify(row.bound));
   row.transition=await front(cell.foreground?pid:coverPid);await sleep(250);
   if(cell.operation==='warm-press') {
    row.warmup=await rpc(w,pid,'click',{element:obs.button,probe366HoldOnly:true,probe366Id:cell.id+'/warmup'});
    if(row.warmup.raw.error)throw Error('warm hold refused '+JSON.stringify(row.warmup.raw.error));
    row.warmReset=await command({op:'reset',trial:cell.id,scene:cell.scene});
    obs=await observe(w,pid);row.warmObservation=obs.observation;row.bound=await ask({op:'bind',pid});await sleep(250);
   }
   row.before=await command({op:'read'});
   if(row.before.trial!==cell.id||row.before.pageId!==owner.pageId||row.before.timeOrigin!==owner.timeOrigin||row.before.visibility!=='visible'||!row.before.open||row.before.presses!==0||row.before.value!==''||row.before.reactValue!==''||row.before.active!=='action')throw Error('intended state not established '+JSON.stringify(row.before));
   row.frontBefore=await front(cell.foreground?pid:coverPid,false);
   row.valid=true;stage='action';
   if(cell.operation.startsWith('raw-')) {
    const startedAt=Date.now(),r=await ask({op:cell.operation,pid,value:row.expected});
    row.call={startedAt,endedAt:Date.now(),helper:r,raw:r.axError===0?{result:{axError:0}}:{error:{axError:r.axError}}};
   } else {
    row.call=await rpc(w,pid,cell.operation==='value'?'set_value':'click',{
     element:cell.operation==='value'?obs.field:obs.button,value:row.expected,probe366Variant:cell.variant,
     probe366Id:cell.id,probe366HoldOnly:cell.operation==='hold-only'
    });
   }
   stage='readback';row.samples=[];
   for(const requestedMs of config.sampleDelays) {
    await sleep(row.call.endedAt+requestedMs-Date.now());
    const r=await ask({op:'read',pid,coverPid});row.samples.push({requestedMs,at:r.endedAt,startedAt:r.startedAt,ax:r.ax,frontmostPid:r.frontmostPid,order:r.order});
   }
   row.after=await command({op:'read'});row.frontAfter=await ask({op:'title',pid});
   if(row.after.trial!==cell.id||row.after.pageId!==owner.pageId||row.after.timeOrigin!==owner.timeOrigin||!row.frontAfter.title?.includes('probe366:'+owner.pageId))throw Error('fixture ownership changed after action');
   // Screenshot/AX evidence comes AFTER every timed read, never changes the outcome denominator.
   if(cell.rep===0&&cell.phase==='rate') {
    const outputDirectory=join(OUT,'shots',cell.id.replaceAll('/','_'));mkdirSync(outputDirectory,{recursive:true});
    try {row.followup=await rpc(w,pid,'get_app_state',{includeScreenshot:true,outputDirectory});}
    catch(e){row.followupError=String(e);}
   }
  } catch(e) {row.valid=false;row.failureStage=stage;row.problem=String(e.stack??e).slice(0,20000);}
  finally {
   // A request to our cover ends this connection's target hold synchronously, before the next trial.
   if(w){try {row.release=await rpc(w,coverPid,'get_app_state',{includeScreenshot:false});}catch(e){row.releaseError=String(e);}w.close();}
   await sleep(150);
  }
  row.trace=trace.filter(e=>e.trial===cell.id||(row.call&&e.at>=row.call.startedAt&&e.at<=(row.after?.at??row.call.endedAt)));
  trace=[];row.endedAt=Date.now();row.judgment=judge(row);
  appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n');completed++;
  if(!row.judgment.eligible){invalid++;consecutiveInvalid++;}else consecutiveInvalid=0;
  writeFileSync(join(OUT,'progress.json'),JSON.stringify({completed,planned:cells.length,invalid,last:cell.id,elapsedMs:Date.now()-start},null,2));
  console.log('366',cell.id,row.problem??JSON.stringify(row.judgment));
  if(consecutiveInvalid>=3)throw Error('three consecutive invalid cells; stop rather than consume the runner on broken setup');
 }
 const rows=readFileSync(join(OUT,'rows.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 writeFileSync(join(OUT,'summary.json'),JSON.stringify(summarize(rows),null,2));
 if(invalid)process.exitCode=1;
} catch(e) {writeFileSync(join(OUT,'fatal.json'),JSON.stringify({error:String(e.stack??e),completed,planned:cells.length},null,2));throw e;}
finally {
 // Only processes launched by this kit on the disposable runner. Never pkill an app or attach to an owner's instance.
 target?.kill();cover?.kill();engine?.kill();side.kill();transport.close();server.closeAllConnections();server.close();
}
