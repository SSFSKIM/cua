// Hosted-only qualification of unmodified production engines. No spike routing or native instrumentation.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';import {createConnection} from 'node:net';
import {createInterface} from 'node:readline';import {once} from 'node:events';
import {mkdirSync,writeFileSync,appendFileSync,createWriteStream} from 'node:fs';import {join} from 'node:path';
import {FixtureTransport,FixtureError} from '../probe-354/transport.mjs';
import {launch,placePid,version} from '../probe-316/browser.mjs';
import {pageQualification} from './qualification-page.mjs';
import {plan,classify,calibrate,calKey,setupReasons,ENGINE_REF,MAIN_REF,DELAYS} from './qualification-model.mjs';
import {readQualification} from './qualification-read.mjs';import {bindVisibleFixture} from './setup.mjs';
import {observeProductionAction} from './qualification-action.mjs';import {engineSockets} from './qualification-runtime.mjs';
if(process.platform!=='darwin'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.GITHUB_ACTIONS!=='true')throw Error('GitHub hosted macOS only; never run on an owner device');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1]};
const OUT=arg('out'),SIDE=arg('side'),SMOKE=arg('smoke')==='true',paths={fix:arg('fix-engine'),main:arg('main-engine')};
if(!OUT||!SIDE||!paths.fix||!paths.main||!['true','false'].includes(arg('smoke'))||process.env.QUALIFICATION_ENGINE_REF!==ENGINE_REF||process.env.QUALIFICATION_MAIN_REF!==MAIN_REF)throw Error('invalid paths/smoke/engine pins');
mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms))),startedAt=Date.now(),cells=plan(SMOKE),calibrations=new Map();
const config={mode:'qualification',kit:process.env.GITHUB_SHA,engine:ENGINE_REF,main:MAIN_REF,image:process.env.ImageVersion,smoke:SMOKE,reps:SMOKE?1:20,planned:cells.length,startedAt,
 fixtureOwnershipVersion:3,browser:'firefox',samplingMs:DELAYS,sideWatchMs:5,fastIDs:true,budgetMinutes:90,cleanupMs:500,
 engineMethod:'Unmodified production press_key with only pid and key. Fresh connection per attempt; no forced route, probe arguments, native patch or bare prelude.',
 setup:'Owned visible-title/poll binding; deterministic foreground DOM reset/prepare; foreground/cover setup; 250ms settle; no measured-input retry.',
 oracle:'Owned DOM at 1s against same-repetition fix-foreground calibration. Known four seed keys independently checked. Unchanged valid foreground navigation is N/A, never delivery confirmation. AX caret is not read (#394).',
 safety:'Passive activation/order watch starts before production RPC, stays armed through all DOM samples, then connection close and 500ms cleanup. Requested 5ms ID-only ordering; actual gaps/query spans reported. Shorter flashes and cache lag can remain unseen.',
 price:'Cold route-3 production RPC including holdKeyFocus/guard versus natural main plain posting. Actual inputRoute/activationGuardMs retained. No forced-price lane.'};
const persist=()=>writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));persist();
class Wire {
 static async connect(path){return new Promise((ok,no)=>{const s=createConnection(path);s.once('connect',()=>ok(new Wire(s)));s.once('error',no)})}
 constructor(s){this.s=s;this.id=0;this.buf=Buffer.alloc(0);this.pending=new Map();s.on('data',d=>{this.buf=Buffer.concat([this.buf,d]);while(this.buf.length>=4){const n=this.buf.readUInt32LE();if(n>16*1024*1024){s.destroy(Error('oversized RPC'));break}if(this.buf.length<n+4)break;const r=JSON.parse(this.buf.subarray(4,n+4));this.buf=this.buf.subarray(n+4);this.pending.get(r.id)?.resolve(r);this.pending.delete(r.id)}});s.on('error',()=>{});s.on('close',()=>{for(const p of this.pending.values())p.reject(Error('engine disconnected'));this.pending.clear()})}
 call(method,params){const id=++this.id,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return new Promise((ok,no)=>{const t=setTimeout(()=>{this.pending.delete(id);no(Error('RPC timeout '+method))},30000);this.pending.set(id,{resolve:r=>{clearTimeout(t);ok(r)},reject:e=>{clearTimeout(t);no(e)}});this.s.write(Buffer.concat([h,b]))})}
 execute(method,args){return this.call('execute',{method,args,deadlineUnixMilliseconds:Date.now()+25000})}
 close(){this.s.destroy()}
}
const sockets=engineSockets(process.env.RUNNER_TEMP,Object.keys(paths));// one private directory per engine: production's lock/usage are directory-scoped
const engines={};let side,browser,server,pid,coverPid,sideDead=false;const sidePending=[];
const transport=new FixtureTransport({onEvent:e=>appendFileSync(join(OUT,'transport.jsonl'),JSON.stringify(e)+'\n')});
async function until(fn,ms=10000){const deadline=Date.now()+ms;for(;;){const x=fn();if(x)return x;if(Date.now()>=deadline)throw Error('condition timeout');await sleep(5)}}
async function ask(q){if(sideDead)throw Error('side process exited');return new Promise((resolve,reject)=>{const t=setTimeout(()=>{sideDead=true;for(const p of sidePending.splice(0))p.reject(Error('side timeout '+q.op));side.kill('SIGTERM')},5000);sidePending.push({resolve:r=>{clearTimeout(t);resolve(r)},reject:e=>{clearTimeout(t);reject(e)}});side.stdin.write(JSON.stringify(q)+'\n')})}
async function front(p,activate){const r=await ask({op:'front',pid:p,activate});if(r.error||r.frontmostPid!==p||!r.ok)throw Error('foreground setup/verification failed '+JSON.stringify(r));return r}
async function connect(which){const deadline=Date.now()+20000;while(Date.now()<deadline){try{const w=await Wire.connect(sockets[which]);const p=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(p.error){w.close();throw Error(JSON.stringify(p.error))}return w}catch(e){if(engines[which].exitCode!==null||config.engineLaunchErrors?.[which])throw Error(config.engineLaunchErrors?.[which]??which+' engine exited');await sleep(50)}}throw Error(which+' engine unavailable')}
async function command(q){const n=transport.send(q);try{const r=await until(()=>transport.getAnswers(n)[0]);if(r.error)throw new FixtureError(JSON.stringify(r));return r}finally{transport.cancel(n)}}
async function sample(returnedAt){const n=transport.send({op:'sample',returnedAt,delays:DELAYS});try{return (await until(()=>{const a=transport.getAnswers(n);return a.length===DELAYS.length?a:false},6000)).sort((a,b)=>a.delay-b.delay)}finally{transport.cancel(n)}}
let recorded=0,invalidSetups=0;
function save(r){const calibration=calibrations.get(calKey(r)),s=classify(r,calibration);if(r.engine==='fix'&&r.scene==='foreground')calibrations.set(calKey(r),calibrate(r));appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify({...r,score:s})+'\n');recorded++;writeFileSync(join(OUT,'progress.json'),JSON.stringify({recorded,planned:cells.length,last:r.id,score:s,elapsedMs:Date.now()-startedAt},null,2));console.log('360-qualification',recorded+'/'+cells.length,r.id,r.problem??s.outcome);return s}
async function trial(c){
 const r={...c,startedAt:Date.now(),targetPid:pid,coverPid};let w,watching=false,stage='setup';
 try {
  w=await connect(c.engine);await front(pid,true);
  r.fixtureBindingAttempts=[];r.owner=await bindVisibleFixture({transport,pid,attempts:r.fixtureBindingAttempts,readWindow:()=>ask({op:'window-title',pid})});
  r.foregroundReset=await command({op:'reset',id:c.id,editor:c.editor,key:c.key});
  r.foregroundPrepare=await command({op:'prepare',id:c.id,editor:c.editor,key:c.key});
  await front(c.scene==='foreground'?pid:coverPid,true);await sleep(250);
  r.setup=await command({op:'read'});r.armed=await command({op:'arm'});
  const setupFailed=setupReasons(r);if(setupFailed.length)throw new FixtureError('setup checks failed: '+setupFailed.join(', '));
  r.identityBefore=await ask({op:'window-title',pid});
  if(r.identityBefore.frontmostPid!==(c.scene==='foreground'?pid:coverPid)||!r.identityBefore.windowTitle?.includes('probe354:'+r.owner.pageId))throw new FixtureError('window/focus owner mismatch before key');
  const cover=await ask({op:'window-title',pid:coverPid});
  r.watchStart=await ask({op:'watch-start',targetWindow:r.identityBefore.windowID,coverWindow:cover.windowID,intervalMs:5,fastIDs:true});
  if(r.watchStart.error)throw Error(JSON.stringify(r.watchStart));watching=true;
  await observeProductionAction({wire:w,row:r,pid,key:c.key,sample,read:()=>command({op:'read'}),cleanupMs:500,onPhase:p=>{stage=p}});w=null;
  r.identityAfter=await ask({op:'window-title',pid});r.watch=await ask({op:'watch-stop'});watching=false;
 }catch(e){r.problem=String(e.stack??e);r.failureStage=stage}
 finally {
  // Failed setup has no hold; a failure after posting still closes under the armed watch.
  if(w){w.close();if(watching)await sleep(500)}
  if(watching){try{r.watch=await ask({op:'watch-stop'})}catch(e){r.watchError=String(e)}}
  r.endedAt=Date.now();
 }
 const s=save(r);invalidSetups=r.failureStage==='setup'?invalidSetups+1:0;
 if(s.sideEffect)throw Error('observed activation/order violation; stop without kit repair');
 if(invalidSetups>=3)throw Error('three consecutive setup failures');
 if(stage!=='setup'&&(!r.watch?.complete||!s.sideEffectKnown))throw Error('measurement watch unavailable or stale');
}
async function stop(child){if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return true;const exit=once(child,'exit').then(()=>true);child.kill('SIGTERM');let timer;const timeout=new Promise(ok=>{timer=setTimeout(()=>ok(false),5000)});const result=await Promise.race([exit,timeout]);clearTimeout(timer);return result}
try {
 for(const [which,path]of Object.entries(paths)){const engine=spawn(path,[],{env:{...process.env,CUA_ENGINE_SOCKET:sockets[which]},stdio:['ignore','ignore','pipe']});engines[which]=engine;engine.stderr.pipe(createWriteStream(join(OUT,which+'-engine-stderr.jsonl')));engine.on('error',e=>{config.engineLaunchErrors??={};config.engineLaunchErrors[which]=String(e)})}
 side=spawn(SIDE,[],{stdio:['pipe','pipe','inherit']});
 const sideFailed=e=>{sideDead=true;for(const p of sidePending.splice(0))p.reject(e)};
 side.on('error',sideFailed);side.stdin.on('error',sideFailed);createInterface({input:side.stdout}).on('line',l=>{const p=sidePending.shift();try{p?.resolve(JSON.parse(l))}catch(e){p?.reject(e)}});side.on('exit',()=>sideFailed(Error('side process exited')));
 server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://fixture');
  if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageQualification());return}
  res.setHeader('Content-Type','application/json');
  if(u.pathname==='/cmd'){transport.poll({pageId:u.searchParams.get('pageId'),timeOrigin:Number(u.searchParams.get('timeOrigin'))},res);return}
  if(u.pathname==='/answer'){let b='';for await(const c of req)b+=c;try{const a=JSON.parse(b);const accepted=a.op==='ready'?transport.register(a):transport.accept(a);res.statusCode=accepted?200:409}catch{res.statusCode=400}res.end('{}');return}
  res.statusCode=404;res.end('{}');
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+server.address().port+'/';
 process.env.MOZ_LOG='timestamp,sync,NativeKeyBindings:5,KeyboardHandler:5,IMEHandler:5';process.env.MOZ_LOG_FILE=join(OUT,'gecko.log');
 config.version=version('firefox');browser=await launch('firefox',url,join(OUT,'profile'),{x:400,y:40,w:620,h:700});pid=browser.pid;await until(()=>transport.clients.size>0,30000);
 const doc=join(OUT,'cover.txt');writeFileSync(doc,'Probe #360 production-path cover. No measured input is sent here.');
 const opened=spawnSync('open',['-a','TextEdit',doc],{encoding:'utf8',timeout:10000});if(opened.status!==0)throw Error('cover launch failed');
 coverPid=await until(()=>{const n=Number(spawnSync('pgrep',['-x','TextEdit'],{encoding:'utf8'}).stdout.trim().split('\n')[0]);return n>0?n:false});placePid(coverPid,{x:0,y:40,w:380,h:300});
 await front(pid,true);
 for(const which of Object.keys(paths)){const warm=await connect(which);try{for(let i=0;i<2;i++){const r=await warm.execute('get_app_state',{pid,includeScreenshot:false});if(r.error)throw Error('AX warmup '+JSON.stringify(r.error));await sleep(1200)}}finally{warm.close()}}
 config.targetPid=pid;config.coverPid=coverPid;persist();writeFileSync(join(OUT,'plan.json'),JSON.stringify(cells,null,2));
 for(const c of cells){if(Date.now()-startedAt>90*60000)throw Error('90 minute budget exceeded; partial coverage is not a pass');await trial(c)}
}catch(e){config.failure=String(e.stack??e);console.error(config.failure);process.exitCode=1}
finally {
 transport.retire('shutdown');const stopped={};for(const [which,child]of Object.entries(engines))stopped[which]=await stop(child);
 writeFileSync(join(OUT,'engine-stopped.json'),JSON.stringify({...stopped,stopped:stopped.fix===true&&stopped.main===true,at:Date.now()}));
 await stop(side);await stop(browser);server?.closeAllConnections();server?.close();config.finishedAt=Date.now();config.recorded=recorded;persist();
 const summary=readQualification(OUT);if(!summary.complete)process.exitCode=1;
}
