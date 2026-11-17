// Hosted-only disposable fixture driver. Import-safe readers are in readers.mjs.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {createInterface} from 'node:readline';
import {mkdirSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {launch,placePid,version} from '../probe-316/browser.mjs';
import {FixtureTransport,FixtureError} from '../probe-354/transport.mjs';
import {cells,diagnosticCells,summary} from './readers.mjs';
import {page,SEED,REQUESTED,assertVisibleOwner} from './page.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only; offline stage must not launch this driver');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1]};
const OUT=arg('out'),BROWSER=arg('browser'),EDITOR=arg('editor'),ENGINE=arg('engine'),TRACED=arg('traced-engine'),TOOL=arg('tool'),WATCH=arg('watch');
const REPS=Number(arg('reps')??20),SMOKE=arg('smoke')==='true',DIAGNOSTIC=arg('diagnostic')&&arg('diagnostic')!=='none'?arg('diagnostic'):null;
if(!OUT||!ENGINE||!TRACED||!TOOL||!WATCH||!['safari','cft','firefox'].includes(BROWSER)||!['textarea','input','contenteditable','compose'].includes(EDITOR))throw Error('missing or invalid arguments');
if(REPS!==20&&!SMOKE&&!DIAGNOSTIC)throw Error('non20 repetitions must be explicitly labelled smoke or diagnostic');
if(DIAGNOSTIC&&(SMOKE||EDITOR!=='textarea'))throw Error('diagnostic is a separate textarea corpus, never smoke');
const planned=DIAGNOSTIC?diagnosticCells({kind:DIAGNOSTIC,reps:REPS,browsers:[BROWSER],scene:arg('scene')??'foreground-equal'}):cells({reps:REPS,browsers:[BROWSER],editors:[EDITOR]});
if(!planned.length)throw Error('empty shard manifest');
mkdirSync(join(OUT,'shots'),{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms))),startedAt=Date.now();
const sh=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8',timeout:20000});if(r.error||r.status!==0)throw Error(cmd+': '+r.stderr);return r.stdout.trim()};
const budget=()=>{if(Date.now()-startedAt>45*60000)throw Error('45minute shard measurement budget exceeded')};
class Wire {
 constructor(socket){this.socket=socket;this.buffer=Buffer.alloc(0);this.pending=new Map();this.serial=0;socket.on('data',d=>{this.buffer=Buffer.concat([this.buffer,d]);while(this.buffer.length>=4){const n=this.buffer.readUInt32LE();if(n>32e6)throw Error('oversized RPC');if(this.buffer.length<n+4)break;const r=JSON.parse(this.buffer.subarray(4,n+4));this.buffer=this.buffer.subarray(n+4);this.pending.get(r.id)?.resolve(r);this.pending.delete(r.id)}});socket.on('error',e=>this.fail(e));socket.on('close',()=>this.fail(Error('engine socket closed')))}
 fail(e){for(const p of this.pending.values())p.reject(e);this.pending.clear()}
 call(method,params){const id=++this.serial,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return new Promise((ok,no)=>{const t=setTimeout(()=>{this.pending.delete(id);no(Error('RPC timeout '+method))},60000);this.pending.set(id,{resolve:r=>{clearTimeout(t);ok(r)},reject:e=>{clearTimeout(t);no(e)}});this.socket.write(Buffer.concat([h,b]))})}
 execute(method,args){return this.call('execute',{method,args,deadlineUnixMilliseconds:Date.now()+55000})}
 close(){this.socket.destroy()}
}
function sidecar(bin){const child=spawn(bin,[],{stdio:['pipe','pipe','inherit']}),pending=[];createInterface({input:child.stdout}).on('line',l=>{const p=pending.shift();if(!p)return;try{p.ok(JSON.parse(l))}catch(e){p.no(e)}});child.on('exit',()=>{for(const p of pending.splice(0))p.no(Error('sidecar exited'))});return {child,ask:q=>new Promise((ok,no)=>{const t=setTimeout(()=>{no(Error('sidecar timeout; abort shard'));child.kill('SIGTERM')},15000);pending.push({ok:r=>{clearTimeout(t);ok(r)},no:e=>{clearTimeout(t);no(e)}});child.stdin.write(JSON.stringify(q)+'\n')})}}
const tool=sidecar(TOOL),watch=sidecar(WATCH);
async function front(pid,activate=true){const r=await tool.ask({op:'front',pid,activate});if(r.error||r.frontmostPid!==pid)throw Error('foreground verification '+JSON.stringify(r));return r}
const transport=new FixtureTransport({onEvent:e=>appendFileSync(join(OUT,'transport.jsonl'),JSON.stringify(e)+'\n')});
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://fixture');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page());return}
 res.setHeader('Content-Type','application/json');
 if(u.pathname==='/cmd'){transport.poll({pageId:u.searchParams.get('pageId'),timeOrigin:Number(u.searchParams.get('timeOrigin'))},res);return}
 if(u.pathname==='/answer'){let b='';for await(const c of req)b+=c;try{const a=JSON.parse(b),ok=a.op==='ready'?transport.register(a):transport.accept(a);res.statusCode=ok?200:409}catch{res.statusCode=400}res.end('{}');return}
 res.statusCode=404;res.end('{}');
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const fixtureURL=`http://127.0.0.1:${server.address().port}/`;
async function until(fn,ms=10000){const deadline=Date.now()+ms;for(;;){const v=await fn();if(v)return v;if(Date.now()>deadline)throw Error('condition timeout');await sleep(5)}}
async function command(q){const startedAt=Date.now(),n=transport.send(q);try{const r=await until(()=>transport.getAnswers(n)[0]);if(r.error)throw new FixtureError(JSON.stringify(r));return {...r,startedAt,endedAt:Date.now()}}finally{transport.cancel(n)}}
let pid,coverPid,browser,engine,w,engineSerial=0;
async function startEngine(bin){
 w?.close();if(engine&&engine.exitCode===null&&engine.signalCode===null){await new Promise((ok,no)=>{const t=setTimeout(()=>no(Error('engine did not stop; abort shard')),5000);engine.once('exit',()=>{clearTimeout(t);ok()});engine.kill('SIGTERM')})}
 const socket=join(process.env.RUNNER_TEMP,`s359-${process.pid}-${++engineSerial}.sock`);rmSync(socket,{force:true});
 engine=spawn(bin,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});engine.stderr.on('data',d=>appendFileSync(join(OUT,'engine-stderr.txt'),d));
 const connectDeadline=Date.now()+15000;
 for(;;){
  try{w=new Wire(await new Promise((ok,no)=>{const s=createConnection(socket);s.once('connect',()=>{s.setTimeout(0);ok(s)});s.once('error',e=>{s.destroy();no(e)});s.setTimeout(Math.max(1,connectDeadline-Date.now()),()=>s.destroy(Error('engine connect timeout')))}));break}
  catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code)||Date.now()>=connectDeadline)throw e;await sleep(25)}
 }
 // Only connecting is retried, never a ping, RPC, or measured action.
 const ping=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});requireOK(ping,'engine ping');
}
async function rpc(method,args={}){const startedAt=Date.now(),raw=await w.execute(method,{pid,...args});return {startedAt,endedAt:Date.now(),error:raw.error??null,meta:raw.result?.meta??raw.error?.data?.meta??raw.error?.meta,timings:raw.result?.timings,probe:raw.result?.probe359,raw}}
const clean=r=>{const {raw,...rest}=r;return rest};
async function bindVisible(){
 const title=await until(async()=>{const r=await tool.ask({op:'window-title',pid});return !r.error&&r.frontmostPid===pid&&/probe354:[a-f0-9]{32}/.test(r.windowTitle??'')?r:false},5000);
 const owner=transport.bindVisible(title.windowTitle);await until(()=>transport.hasPoll());return {owner,title};
}
function requireOK(r,stage){if(r.error)throw Error(stage+': '+JSON.stringify(r.error))}
const rows=[];let consecutiveSetupFailures=0;
async function attempt(c){
 budget();const row={...c,requested:REQUESTED,startedAt:Date.now(),smoke:SMOKE,fixtureOwnershipVersion:3,valid:false};let stage='setup';
 try{
  row.prepareForeground=await front(pid);row.binding=await bindVisible();
  row.reset=await command({op:'reset',id:c.id,editor:EDITOR,key:''});
  const initialCaret=c.initialCaret==='target'?3:SEED.length,expectedForeground=c.foreground?pid:coverPid;
  row.prepare=await command({op:'prepare',id:c.id,editor:EDITOR,key:'',initialCaret});
  // The one real screenshot on this connection supplies both the point and the stale-point guard's lineage.
  const shot=await rpc('get_app_state',{includeScreenshot:true,outputDirectory:join(OUT,'shots',String(rows.length))});requireOK(shot,'observation');
  row.observation=clean(shot); // #366's readiness wait, if cold, completes before any measured interval.
  const state=shot.raw.result,fields=state.nodes.filter(n=>['AXTextArea','AXTextField'].includes(n.role)&&n.frame&&/Draft control|Message Body/.test([n.title,n.description,n.placeholder].join(' ')));
  if(fields.length!==1)throw Error('fixture field AX identity ambiguous/missing '+fields.length);
  const field=fields[0],frame=state.window.frame,scale=state.screenshot.width/frame.width;
  row.point={screen:{x:field.frame.x+35,y:field.frame.y+20},source:'fixture monospace AX text-entry frame +35,+20',intendedOffset:3};
  const observe=c.suite==='trace'||c.suite==='candidate'||c.suite==='isolate';
  row.watchBind=await watch.ask({op:'bind',pid,coverPid,title:'probe354:'+row.binding.owner.pageId,observe});requireOK(row.watchBind,'observer binding');
  row.foregroundTransition=await front(expectedForeground);if(!c.foreground)row.cover=row.foregroundTransition;await sleep(250);
  row.preClickOrder=await watch.ask({op:'mark'});requireOK(row.preClickOrder,'window order');
  if(row.preClickOrder.windows.browserAboveCover!==Boolean(c.foreground))throw Error('browser/cover order does not match the scene');
  row.preClick=await command({op:'read'});
  if(row.preClick.text!==SEED||JSON.stringify(row.preClick.selection)!==JSON.stringify([initialCaret,0])||!row.preClick.focused)throw Error('setup/deactivation changed intended caret');
  row.clockUncertaintyMs=Math.max(2,row.preClick.endedAt-row.preClick.startedAt);
  row.beforeClickForeground=await front(expectedForeground,false);stage='click';
  if(c.suite==='isolate'){const carrierStartedAt=Date.now(),r=await watch.ask({op:'mutate',kind:c.mode,browser:BROWSER});row.click={...r,nativeStartedAt:r.startedAt,nativeEndedAt:r.endedAt,startedAt:carrierStartedAt,endedAt:Date.now()}}
  else if(c.suite==='control'){const at=Date.now();row.click={startedAt:at,endedAt:at,noClick:true}}
  else row.click=clean(await rpc('click',{x:Math.round((row.point.screen.x-frame.x)*scale),y:Math.round((row.point.screen.y-frame.y)*scale),...(observe?{spike359Trace:true}:{}),...(c.suite==='candidate'?{spike359Mode:c.mode}:{})}));
  requireOK(row.click,'measured click');stage='selection';
  // Intentionally no observation, read, cover check or sleep between these calls.
  row.next=c.selection==='script'?await command({op:'select-all',id:c.id}):clean(await rpc('press_key',{key:'cmd+a'}));requireOK(row.next,'selection');
  if(c.suite!=='trace'&&c.suite!=='isolate'){
   stage='type';const typed=await rpc('type_text',{text:REQUESTED});row.type={...clean(typed),answer:typed.raw};
   // #354's honest refusal is a measured answer, not a lost outcome or permission to retry.
   if(row.type.error?.errorName!=='typeUnconfirmed')requireOK(row.type,'type_text');
  }
  stage='tail';const returnedAt=row.type?.endedAt??row.next.endedAt;
  row.samples=[];for(const delay of [0,250,1500]){await sleep(returnedAt+delay-Date.now());const s=await command({op:'read'});row.samples.push({...s,requestedDelayMs:delay,actualDelayMs:s.at-returnedAt})}
  row.events=[...(row.next.trace??[]),...row.samples.flatMap(s=>s.trace??[])];
  row.ax=await watch.ask({op:'stop'});requireOK(row.ax,'observer stop');
  if(row.ax.truncated)throw Error('AX trace truncated');
  row.finalVisibleWindow=await tool.ask({op:'window-title',pid});
  try{assertVisibleOwner(row.finalVisibleWindow.windowTitle,row.binding.owner)}catch(e){row.contextLoss=true;transport.retire('visible-owner-loss');throw e}
  row.afterForeground=await tool.ask({op:'front',pid:expectedForeground,activate:false});
  row.foregroundViolation=row.afterForeground.frontmostPid!==expectedForeground||(!c.foreground&&row.ax.events.some(e=>e.at>=row.click.startedAt&&e.kind==='workspace-activation'&&e.pid===pid));
  row.windowRaiseObserved=!c.foreground&&row.ax.events.some(e=>e.at>=row.click.startedAt&&e.kind==='window-order'&&e.browserAboveCover===true);
  row.valid=true;consecutiveSetupFailures=0;
 }catch(e){row.failureStage=stage;row.problem=String(e.stack??e);if(stage==='setup')consecutiveSetupFailures++;try{row.ax=await watch.ask({op:'stop'})}catch{} }
 finally{row.endedAt=Date.now();rows.push(row);appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n');writeFileSync(join(OUT,'progress.json'),JSON.stringify({attempted:rows.length,requested:planned.length,last:row.id,elapsedMs:Date.now()-startedAt},null,2));console.log('359',row.id,row.valid?'scored':row.problem)}
 if(consecutiveSetupFailures>=3)throw Error('three consecutive invalid setups; abort rather than fabricate coverage');
}
const meta={schema:1,kit:process.env.GITHUB_SHA,engine:process.env.ENGINE_REF,browser:BROWSER,editor:EDITOR,reps:REPS,smoke:SMOKE,diagnostic:DIAGNOSTIC,image:process.env.ImageVersion,startedAt,planned,transport:'354 owner-v3 visible AX title binds nonce/timeOrigin; no hidden Firefox realm',clock:'same hosted machine epoch clocks; monotonic stamps in DOM/Swift; conservative command RTT uncertainty retained',tailMs:1500};
try{
 browser=await launch(BROWSER,fixtureURL,join(OUT,'profile'),{x:400,y:30,w:620,h:720});pid=browser.pid;await until(()=>transport.clients.size>0,30000);await sleep(BROWSER==='cft'?Math.max(0,browser.launchedAt+22000-Date.now()):1500);placePid(pid,{x:400,y:30,w:620,h:720});
 const doc=join(OUT,'cover.txt');writeFileSync(doc,'#359 disposable cover.');sh('open',['-a','TextEdit',doc]);await sleep(1000);coverPid=Number(sh('pgrep',['-x','TextEdit']).split('\n')[0]);if(!coverPid)throw Error('cover unavailable');placePid(coverPid,{x:360,y:25,w:660,h:740});
 meta.version=version(BROWSER);meta.pid=pid;meta.coverPid=coverPid;writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));
 for(const instrumented of [false,true]){
  await startEngine(instrumented?TRACED:ENGINE);
  // A late tree is intentional in the rate/attribution corpus; fresh #341 coverage is a separate future regression run.
  await front(pid);meta.warmups??=[];
  for(let i=0;i<2;i++){const warmup=await rpc('get_app_state',{includeScreenshot:false});requireOK(warmup,'warmup');meta.warmups.push({instrumented,...clean(warmup)});await sleep(1200)}
  // Both cold and late warmups have returned; #366's ~2.5 s first observation is never timed as click latency.
  // Deterministic interleaving by rep/selection/suite, not a whole candidate at a different browser age.
  for(const c of planned.filter(c=>(!['rate','control'].includes(c.suite))===instrumented))await attempt(c);
 }
}catch(e){meta.failure=String(e.stack??e);console.error(meta.failure);process.exitCode=1}
finally{
 meta.finishedAt=Date.now();writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));writeFileSync(join(OUT,'summary.json'),JSON.stringify(summary(rows,planned,{smoke:SMOKE,diagnostic:Boolean(DIAGNOSTIC)}),null,2));
 transport.retire('shutdown');w?.close();engine?.kill('SIGTERM');tool.child.kill('SIGTERM');watch.child.kill('SIGTERM');if(browser)try{process.kill(browser.pid,'SIGTERM')}catch{}
 server.closeAllConnections();server.close();
}
