// Hosted-only #360 key-only experiment. #354's owned transport is reused unchanged.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';import {createConnection} from 'node:net';
import {createInterface} from 'node:readline';import {once} from 'node:events';
import {mkdirSync,writeFileSync,appendFileSync,rmSync,createWriteStream} from 'node:fs';import {join} from 'node:path';
import {FixtureTransport,FixtureError} from '../probe-354/transport.mjs';
import {launch,placePid,version} from '../probe-316/browser.mjs';import {SEED} from '../probe-354/page.mjs';
import {page360} from './page.mjs';import {plan,classify,ENGINE_REF,DELAYS} from './model.mjs';import {readEvidence} from './read.mjs';
import {bindVisibleFixture} from './setup.mjs';
if(process.platform!=='darwin'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.GITHUB_ACTIONS!=='true')throw Error('GitHub hosted macOS only; never run on an owner device');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1]};
const OUT=arg('out'),ENGINE=arg('engine'),SIDE=arg('side'),SMOKE=arg('smoke')==='true';
if(!OUT||!ENGINE||!SIDE||!['true','false'].includes(arg('smoke'))||process.env.ENGINE_REF!==ENGINE_REF)throw Error('invalid paths/smoke/engine pin');
mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms))),startedAt=Date.now(),cells=plan(SMOKE);
const config={kit:process.env.GITHUB_SHA,engine:ENGINE_REF,image:process.env.ImageVersion,smoke:SMOKE,reps:SMOKE?1:20,planned:cells.length,startedAt,
 fixtureOwnershipVersion:3,browser:'firefox',samplingMs:DELAYS,sideWatchMs:20,budgetMinutes:75,
 baseline:'pinned current-main engine preflight and original EventPoster.event/keyPresses, forced route 2-prime; no inherited focus hold',
 setup:'bounded visible-title/poll read wait (3s, no activation/input retry); foreground fixture DOM setup without engine clicks; cover foreground; 250ms settle; verify owned document/selection then arm trace',
 expected:'ASCII seed end: Left [28,0], Option+Left [24,0], Cmd+Left [0,0], Cmd+Shift+Left [0,29]; foreground cells independently check these expectations',
 noRetry:'Every planned row is attempted once; setup failures/posted failures stay in the denominator. Three consecutive invalid setups stop the run.',
 safety:'No activation/raise calls in measured engine branch; equivalent-prelude is synthetic subtype1/inert-outside-click/keys/subtype2 only, not full production held route3. Requested 20ms passive foreground/order sampling; actual timestamps retained, stop on any observed violation. Scheduling gaps and cache lag can miss brief flashes.',
 ax:'Retain focused field before key; raw AXSelectedTextRange only, never values/selected text; same-field CFEqual checked each read. DOM-only baseline controls reader observer effect. No secret fields tested.',
 caveat:'This is an intervention study, not instrumentation inside Gecko. Stock NativeKeyBindings/KeyboardHandler/IMEHandler logs are collected; missing logs are not evidence of absence.'};
const persist=()=>writeFileSync(join(OUT,'config.json'),JSON.stringify(config,null,2));persist();
class Wire {
 static async connect(path){return new Promise((ok,no)=>{const s=createConnection(path);s.once('connect',()=>ok(new Wire(s)));s.once('error',no)})}
 constructor(s){this.s=s;this.id=0;this.buf=Buffer.alloc(0);this.pending=new Map();s.on('data',d=>{this.buf=Buffer.concat([this.buf,d]);while(this.buf.length>=4){const n=this.buf.readUInt32LE();if(n>16*1024*1024){s.destroy(Error('oversized RPC'));break}if(this.buf.length<n+4)break;const r=JSON.parse(this.buf.subarray(4,n+4));this.buf=this.buf.subarray(n+4);this.pending.get(r.id)?.resolve(r);this.pending.delete(r.id)}});s.on('error',()=>{});s.on('close',()=>{for(const p of this.pending.values())p.reject(Error('engine disconnected'));this.pending.clear()})}
 call(method,params){const id=++this.id,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return new Promise((ok,no)=>{const t=setTimeout(()=>{this.pending.delete(id);no(Error('RPC timeout '+method))},30000);this.pending.set(id,{resolve:r=>{clearTimeout(t);ok(r)},reject:e=>{clearTimeout(t);no(e)}});this.s.write(Buffer.concat([h,b]))})}
 execute(method,args){return this.call('execute',{method,args,deadlineUnixMilliseconds:Date.now()+25000})}
 close(){this.s.destroy()}
}
const socket=join(process.env.RUNNER_TEMP,'s360.sock');rmSync(socket,{force:true});
let engine,side,browser,server,pid,coverPid,sideDead=false,stopped=false;const sidePending=[];
const transport=new FixtureTransport({onEvent:e=>appendFileSync(join(OUT,'transport.jsonl'),JSON.stringify(e)+'\n')});
async function until(fn,ms=10000){const deadline=Date.now()+ms;for(;;){const x=fn();if(x)return x;if(Date.now()>=deadline)throw Error('condition timeout');await sleep(5)}}
async function ask(q){if(sideDead)throw Error('side process exited');return new Promise((resolve,reject)=>{const t=setTimeout(()=>{sideDead=true;for(const p of sidePending.splice(0))p.reject(Error('side timeout '+q.op));side.kill('SIGTERM')},5000);sidePending.push({resolve:r=>{clearTimeout(t);resolve(r)},reject:e=>{clearTimeout(t);reject(e)}});side.stdin.write(JSON.stringify(q)+'\n')})}
async function front(p,activate){const r=await ask({op:'front',pid:p,activate});if(r.error||r.frontmostPid!==p||!r.ok)throw Error('foreground setup/verification failed '+JSON.stringify(r));return r}
async function connect(){const deadline=Date.now()+20000;while(Date.now()<deadline){try{const w=await Wire.connect(socket);const p=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(p.error){w.close();throw Error(JSON.stringify(p.error))}return w}catch(e){if(engine.exitCode!==null||config.engineLaunchError)throw Error(config.engineLaunchError??'engine exited');await sleep(50)}}throw Error('engine unavailable')}
async function command(q){const n=transport.send(q);try{const r=await until(()=>transport.getAnswers(n)[0]);if(r.error)throw new FixtureError(JSON.stringify(r));return r}finally{transport.cancel(n)}}
async function sample(returnedAt){const n=transport.send({op:'sample',returnedAt,delays:DELAYS});try{return (await until(()=>{const a=transport.getAnswers(n);return a.length===DELAYS.length?a:false},6000)).sort((a,b)=>a.delay-b.delay)}finally{transport.cancel(n)}}
async function axSamples(returnedAt){const rows=[];for(const delay of DELAYS){await sleep(returnedAt+delay-Date.now());rows.push({delay,actualDelayMs:Date.now()-returnedAt,...await ask({op:'range',pid})})}return rows}
let recorded=0,invalidSetups=0;
function save(r){const s=classify(r);appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify({...r,score:s})+'\n');recorded++;writeFileSync(join(OUT,'progress.json'),JSON.stringify({recorded,planned:cells.length,last:r.id,score:s,elapsedMs:Date.now()-startedAt},null,2));console.log('360',recorded+'/'+cells.length,r.id,r.problem??(s.scorable?(s.effect?'effect':'NO EFFECT'):'INVALID'));return s}
async function trial(c){
 const r={...c,startedAt:Date.now(),targetPid:pid,coverPid};let w,watching=false,stage='setup',sampling;
 try {
  w=await connect();await front(pid,true);
  r.fixtureBindingAttempts=[];
  r.owner=await bindVisibleFixture({transport,pid,attempts:r.fixtureBindingAttempts,readWindow:()=>ask({op:'window-title',pid})});
  r.foregroundReset=await command({op:'reset',id:c.id,editor:c.editor,key:c.key});
  r.foregroundPrepare=await command({op:'prepare',id:c.id,editor:c.editor,key:c.key,scene:c.boundary?'boundary':'normal'});
  await front(c.scene==='foreground'?pid:coverPid,true);await sleep(250);
  r.setup=await command({op:'read'});
  const startRange=c.boundary?[0,0]:[SEED.length,0];
  if(r.setup.text!==SEED||JSON.stringify(r.setup.selection)!==JSON.stringify(startRange)||!r.setup.focused||r.setup.visibility!=='visible')throw Error('initial state not established');
  if(c.reader)r.axBefore=await ask({op:'bind',pid});
  r.armed=await command({op:'arm'});r.identityBefore=await front(c.scene==='foreground'?pid:coverPid,false);
  // front() above identifies the current app's window; separately bind Firefox's exact target window.
  r.identityBefore=await ask({op:'window-title',pid});
  if(r.identityBefore.frontmostPid!==(c.scene==='foreground'?pid:coverPid)||!r.identityBefore.windowTitle?.includes('probe354:'+r.owner.pageId))throw new FixtureError('window/focus owner mismatch before key');
  const cover=await ask({op:'window-title',pid:coverPid});
  const armed=await ask({op:'watch-start',targetWindow:r.identityBefore.windowID,coverWindow:cover.windowID});if(armed.error)throw Error(JSON.stringify(armed));watching=true;
  stage='key';const began=Date.now();
  const raw=await w.execute('press_key',{pid,key:c.key,probe360Variant:c.variant,probe360Range:c.expected,probe360Id:c.id,probe360Trace:c.reader});
  const ended=Date.now();r.action={startedAt:began,endedAt:ended,durationMs:ended-began,error:raw.error??null,meta:raw.result?.meta??raw.error?.meta??raw.error?.data?.meta,probe:raw.result?.probe360??null};
  stage='samples';
  // Observe Gecko without more typing, clicking, activation, or a screenshot in the measured interval.
  sampling=Promise.all([sample(ended),c.reader?axSamples(ended):Promise.resolve([])]);
  [r.samples,r.axSamples]=await sampling;
  r.identityAfter=await ask({op:'window-title',pid});r.watch=await ask({op:'watch-stop'});watching=false;
 } catch(e) {r.problem=String(e.stack??e);r.failureStage=stage;}
 finally {
  if(sampling)await sampling.catch(()=>{});
  if(watching){try{r.watch=await ask({op:'watch-stop'})}catch(e){r.watchError=String(e)}}
  w?.close();r.endedAt=Date.now();
 }
 const score=save(r);invalidSetups=r.failureStage==='setup'?invalidSetups+1:0;
 if(score.sideEffect)throw Error('observed foreground/order violation; stopping without any repair/raise');
 if(invalidSetups>=3)throw Error('three consecutive setup failures; refusing invalid coverage');
 if(!r.watch?.complete&&stage!=='setup')throw Error('passive watch unavailable after action');
}
async function stop(child){if(!child?.pid)return true;if(child.exitCode!==null||child.signalCode!==null)return true;const exit=once(child,'exit').then(()=>true);child.kill('SIGTERM');let t;const timeout=new Promise(ok=>{t=setTimeout(()=>ok(false),5000)});const result=await Promise.race([exit,timeout]);clearTimeout(t);return result}
try {
 engine=spawn(ENGINE,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});engine.stderr.pipe(createWriteStream(join(OUT,'engine-stderr.jsonl')));
 engine.on('error',e=>{config.engineLaunchError=String(e)});
 side=spawn(SIDE,[],{stdio:['pipe','pipe','inherit']});
 const sideFailed=e=>{sideDead=true;for(const p of sidePending.splice(0))p.reject(e)};
 side.on('error',sideFailed);side.stdin.on('error',sideFailed);
 createInterface({input:side.stdout}).on('line',l=>{const p=sidePending.shift();try{p?.resolve(JSON.parse(l))}catch(e){p?.reject(e)}});
 side.on('exit',()=>{sideDead=true;for(const p of sidePending.splice(0))p.reject(Error('side process exited'))});
 server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://fixture');
  if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page360());return}
  res.setHeader('Content-Type','application/json');
  if(u.pathname==='/cmd'){transport.poll({pageId:u.searchParams.get('pageId'),timeOrigin:Number(u.searchParams.get('timeOrigin'))},res);return}
  if(u.pathname==='/answer'){let b='';for await(const c of req)b+=c;try{const a=JSON.parse(b);const accepted=a.op==='ready'?transport.register(a):transport.accept(a);res.statusCode=accepted?200:409}catch{res.statusCode=400}res.end('{}');return}
  res.statusCode=404;res.end('{}');
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/';
 process.env.MOZ_LOG='timestamp,sync,NativeKeyBindings:5,KeyboardHandler:5,IMEHandler:5';process.env.MOZ_LOG_FILE=join(OUT,'gecko.log');
 config.version=version('firefox');browser=await launch('firefox',url,join(OUT,'profile'),{x:400,y:40,w:620,h:700});pid=browser.pid;
 await until(()=>transport.clients.size>0,30000);
 const doc=join(OUT,'cover.txt');writeFileSync(doc,'Probe #360 cover. No measured input is sent to this app.');
 const opened=spawnSync('open',['-a','TextEdit',doc],{encoding:'utf8',timeout:10000});if(opened.status!==0)throw Error('cover launch failed');
 coverPid=await until(()=>{const n=Number(spawnSync('pgrep',['-x','TextEdit'],{encoding:'utf8'}).stdout.trim().split('\n')[0]);return n>0?n:false});
 placePid(coverPid,{x:0,y:40,w:380,h:300});
 await front(pid,true);const warm=await connect();
 for(let i=0;i<2;i++){const r=await warm.execute('get_app_state',{pid,includeScreenshot:false});if(r.error)throw Error('AX warmup '+JSON.stringify(r.error));await sleep(1200)}warm.close();
 config.targetPid=pid;config.coverPid=coverPid;persist();
 writeFileSync(join(OUT,'plan.json'),JSON.stringify(cells,null,2));
 for(const c of cells){if(Date.now()-startedAt>75*60000)throw Error('75 minute measurement budget exceeded (partial coverage is not a pass)');await trial(c)}
} catch(e){config.failure=String(e.stack??e);console.error(config.failure);process.exitCode=1;}
finally {
 transport.retire('shutdown');stopped=await stop(engine);writeFileSync(join(OUT,'engine-stopped.json'),JSON.stringify({stopped,at:Date.now()}));
 await stop(side);await stop(browser);server?.closeAllConnections();server?.close();
 config.finishedAt=Date.now();config.recorded=recorded;persist();const summary=readEvidence(OUT);if(!summary.complete)process.exitCode=1;
}
