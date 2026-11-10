// Hosted-only #354 fence spike harness. Disposable experiment kit, never product code.
// One shard: one browser, one editor (the textarea shard also runs the unreadable lane). Rows are appended to
// rows.jsonl as each cell ends; nothing trace-bearing is kept in memory across cells. Coverage is complete only when
// every planned cell is valid; anything less exits non-zero with its artifacts kept.
import {spawn,spawnSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdirSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch,placePid,version} from '../probe-316/browser.mjs';
import {page,SEED} from './page.mjs';
import {plan,modeSpec,expectedFinal,initialSelection,analyzeTrace,readbackVerdict,privacyViolation,READBACK_VALUE_KEYS,setupForeground,measuredFrontPid,FOREGROUND_REASON,abortReason,coverage,sentence,BUDGET_MS} from './classify.mjs';
import {createFixture,FixtureLost} from './fixture.mjs';

if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1]};
const OUT=arg('out'),ENGINE=arg('engine'),SIDE=arg('side'),KIND=arg('browser'),SHARD=arg('shard'),REPS=+(arg('reps')??20),SMOKE=arg('smoke')==='true';
const LANES=(arg('lanes')??'fence,readback,unreadable').split(',').map(s=>s.trim()).filter(Boolean);
if(!['safari','cft','firefox'].includes(KIND)||!['textarea','input','contenteditable','compose'].includes(SHARD)||!Number.isInteger(REPS)||REPS<1||!LANES.length||LANES.some(l=>!['fence','readback','unreadable'].includes(l)))throw Error('invalid arguments');
mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms))),start=Date.now(),MEASURE_MS=50*60000;
const budget=()=>{if(Date.now()-start>MEASURE_MS)throw new Abort('50 minute measurement budget exceeded')};
const sh=(c,a)=>spawnSync(c,a,{encoding:'utf8',timeout:20000});
const WIN={x:400,y:30,w:620,h:720},sameSel=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a[0]===b[0]&&a[1]===b[1];
class SetupError extends Error {}
class Abort extends Error {}

class Wire{
 static async connect(p){return new Promise((ok,no)=>{let s=createConnection(p);s.once('connect',()=>ok(new Wire(s)));s.once('error',no)})}
 constructor(s){this.s=s;this.buf=Buffer.alloc(0);this.pending=new Map();this.id=0;s.on('data',d=>{this.buf=Buffer.concat([this.buf,d]);while(this.buf.length>=4){let n=this.buf.readUInt32LE();if(this.buf.length<4+n)break;let r=JSON.parse(this.buf.subarray(4,4+n));this.buf=this.buf.subarray(4+n);this.pending.get(r.id)?.(r);this.pending.delete(r.id)}});s.on('error',()=>{})}
 call(method,params){let id=++this.id,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return new Promise((ok,no)=>{let t=setTimeout(()=>{this.pending.delete(id);no(Error('RPC timeout '+method))},60000);this.pending.set(id,r=>{clearTimeout(t);ok(r)});this.s.write(Buffer.concat([h,b]))})}
 execute(method,args){return this.call('execute',{method,args,deadlineUnixMilliseconds:Date.now()+55000})}
 close(){this.s.destroy()}
}
const socket=join(process.env.RUNNER_TEMP,'f354.sock');
if(Buffer.byteLength(socket)>=103)throw Error('engine socket path too long: '+socket);
rmSync(socket,{force:true});
const engine=spawn(ENGINE,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});
engine.stderr.on('data',d=>appendFileSync(join(OUT,'engine-stderr.txt'),d));
async function connect(){for(let i=0;i<200;i++){try{let w=await Wire.connect(socket);let r=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(r.error)throw Error(JSON.stringify(r));return w}catch{await sleep(50)}}throw Error('engine unavailable')}
const side=spawn(SIDE,[],{stdio:['pipe','pipe','inherit']}),waiters=[];
createInterface({input:side.stdout}).on('line',l=>{let r;try{r=JSON.parse(l)}catch{r={error:l}}waiters.shift()?.(r)});
const ask=q=>new Promise(ok=>{waiters.push(ok);side.stdin.write(JSON.stringify(q)+'\n')});
async function front(target,activate=true){const r=await ask({op:'front',pid:target,activate});if(r.error||r.frontmostPid!==target)throw new SetupError('foreground verification '+JSON.stringify(r));return {requestedPid:target,...r}}
const titles=async target=>(await ask({op:'titles',pid:target})).titles??[];
function brief(raw,startedAt,endedAt){const res=raw.result??null;return {startedAt,endedAt,durationMs:endedAt-startedAt,error:raw.error??null,meta:res?.meta??raw.error?.meta??raw.error?.data?.meta??null,fence:res?.fence354??null,readback:res?.readback354??null}}
let browser,coverPid,pid;
async function rpc(w,method,args){const t=Date.now(),r=await w.execute(method,{pid,...args});return brief(r,t,Date.now())}

const fixture=await createFixture(page());
const cells=plan({shard:SHARD,reps:REPS,lanes:LANES});
const meta={kit:process.env.GITHUB_SHA??null,engine:process.env.ENGINE_REF??null,image:process.env.ImageVersion??null,browser:KIND,shard:SHARD,lanes:LANES,reps:REPS,smoke:SMOKE,startedAt:start,planned:cells.length,
 setupProtocol:'foreground fixture DOM focus/selection, no engine click; cover brought forward, 250ms real deactivation settle, strict DOM state re-read, actual frontmost pid checked without activation as the last step before the measured key (or text); password cells keep the browser frontmost (row.foregroundSetup)',
 fixtureProtocol:'explicit visible owner: the page whose title nonce the browser window AX title shows is bound; no document takes over; only the bound document is handed commands; commands expire; Cache-Control no-store',
 immediacy:'no awaited operation between key return and type_text except the measured fence (marker-ack waits for the page; ax waits inside press_key)',
 fences:{'marker':'F20 posted behind cmd+a in the same press_key; marker-ack waits soft 1000ms for the page keydown acknowledgement (cooperative page instrumentation, not a generic capability)',
  'ax':'AXObserver registered on the app element (selected text, value, focus, menu traffic) and the focused field (selected text) before the route activation hold; acknowledgement = an AXSelectedTextChanged arriving at or after the first posted key event, soft 1000ms; none registered = keyUnconfirmed before text',
  'ax-control':'cmd+F20: same route and key-equivalent path, no selection effect; any acknowledgement is a false one'},
 readback:'type_text snapshots the focused field (role, subrole; value and range only when not secure) immediately before posting; expected = before with the selected UTF-16 range replaced by the text; polls that same field soft 1000ms (5ms, 100ms AX timeout) for exact equality; secure/concealed/unreadable = typeUnconfirmed with actual null',
 sampling:{fence:'DOM at 0 and 500ms after type return, 3000ms re-read on mismatch',readback:'DOM at 0/250/1000/3000ms',unreadable:'DOM at 0/250/1000/3000ms; the password page answers length and match only'},
 retries:'none: no measured key or text is retried; an unconfirmed fence or readback still types and is scored as a counterfactual refusal',
 abort:'3 consecutive invalid cells or 6 setup failures abort the shard; incomplete coverage exits non-zero'};
let done=0,valid=0,invalid=0,setupFailures=0,consecutiveInvalid=0,privacyViolations=0,aborted=null;
function progress(last){writeFileSync(join(OUT,'progress.json'),JSON.stringify({planned:cells.length,done,valid,invalid,setupFailures,consecutiveInvalid,privacyViolations,aborted,elapsedMs:Date.now()-start,last,
 fixture:{bound:fixture.fx.bound,foreignPolls:fixture.fx.foreignPolls,foreignAnswers:fixture.fx.foreignAnswers.length,expired:fixture.fx.expired,bindings:fixture.fx.bindings.length,ready:fixture.fx.ready.length}},null,2))}
function save(row){appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n')}

async function setup(row){
 const expected=row.editor==='password'?SEED:undefined;
 row.prepareForeground=await front(pid);
 row.reset=await fixture.command({op:'reset',cell:row.id,editor:row.editor,expected});
 row.setup=await fixture.command({op:'prepare',cell:row.id,editor:row.editor,selection:row.initialSelection,expected});
 check(row.setup,row,'prepared');
 // Behind the cover unless the cell keeps the browser frontmost (classify.mjs setupForeground); the row says which.
 const measuredFront=measuredFrontPid(row,{pid,coverPid});
 row.foregroundTransition=await front(measuredFront);
 row.setupSettleMs=250;await sleep(250);
 row.settledSetup=await fixture.command({op:'read',cell:row.id,expected});
 check(row.settledSetup,row,'settled');
 row.beforeMeasuredForeground=await front(measuredFront,false);
}
function check(s,row,label){
 const text=row.editor==='password'?s.matchesExpected===true&&s.length===SEED.length:s.text===SEED;
 if(!text||!sameSel(s.selection,row.initialSelection)||!s.focused||s.cell!==row.id)throw new SetupError(`intended ${label} state not established `+JSON.stringify({text:s.text,length:s.length,matches:s.matchesExpected,selection:s.selection,focused:s.focused,cell:s.cell}));
}
const domText=(row,s)=>row.editor==='password'?null:s.text,domCorrect=(row,s)=>row.editor==='password'?s.matchesExpected===true:s.text===row.expectedFinal;
async function samples(row,delays){
 const ms=delays.at(-1)+5000,k=fixture.send({op:'sample',cell:row.id,returnedAt:row.returnedAt,delays,expected:row.editor==='password'?row.expectedFinal:undefined},ms);
 return (await fixture.collect(k,delays.length,ms)).sort((a,b)=>a.delay-b.delay);
}

async function cell(c,{warmup=false}={}){
 budget();
 const text=sentence(c.length),spec=c.part==='fence'?modeSpec(c.mode):null;
 const row={recordKind:warmup?'warmup':'cell',id:c.id,part:c.part,browser:KIND,shard:SHARD,editor:c.editor,scene:c.scene,mode:c.mode,length:c.length,rep:c.rep,text,
  key:c.part==='unreadable'?null:(spec?.key??'cmd+a'),fence:spec?.fence??'none',readback:spec?spec.readback:true,concealed:c.mode==='readback-concealed',
  initialSelection:initialSelection(c.scene),expectedFinal:expectedFinal(c,text),foregroundSetup:setupForeground(c),
  foregroundReason:setupForeground(c)?FOREGROUND_REASON:null,fixtureDoc:fixture.fx.bound,startedAt:Date.now()};
 let w,stage='setup',lost=false;
 try{
  w=await connect();await setup(row);
  if(row.key){
   stage='key';
   const arm=fixture.armMarker(row.id,'keydown');  // armed before posting; only marker-ack waits on it
   row.keyRPC=await rpc(w,'press_key',{key:row.key,spike354Fence:row.fence});
   if(row.keyRPC.error)throw Error('measured key '+JSON.stringify(row.keyRPC.error));
   if(spec?.waitMarker){
    const hit=await fixture.awaitMarker(arm,row.keyRPC.endedAt+BUDGET_MS),at=Date.now();
    row.markerFence={cooperative:true,confirmed:!!hit,status:hit?'confirmed':'keyUnconfirmed',reason:hit?null:'noPageAcknowledgementWithinBudget',
     fenceMs:hit?Math.max(0,hit.receivedAt-row.keyRPC.endedAt):at-row.keyRPC.endedAt,ackPageAt:hit?.at??null,ackReceivedAt:hit?.receivedAt??null,ackSelection:hit?.selection??null};
   }
   if(c.part==='readback'){
    // The readback lane prices exact readback alone: the select-all is settled and confirmed before typing.
    await sleep(500);row.priorKeyEffect=await fixture.command({op:'read',cell:row.id});
    if(!(row.priorKeyEffect.text===SEED&&sameSel(row.priorKeyEffect.selection,[0,SEED.length])))throw new SetupError('prior select-all not settled at 500ms '+JSON.stringify(row.priorKeyEffect.selection));
   }
  }
  stage='type';
  row.typeRPC=await rpc(w,'type_text',{text,...(row.readback?{spike354Readback:'exact'}:{}),...(row.concealed?{concealed:true}:{})});
  row.returnedAt=row.typeRPC.endedAt;
  if(row.typeRPC.error)throw Error('measured type '+JSON.stringify(row.typeRPC.error));
  const rb=row.typeRPC.readback;
  if(row.readback&&!rb?.active)throw Error('readback requested but not run: '+JSON.stringify(row.typeRPC.meta?.inputRoute??null));
  if(privacyViolation(rb,{passwordField:row.editor==='password'})){row.privacyViolation=true;privacyViolations++;for(const k of READBACK_VALUE_KEYS)if(rb[k]!=null)rb[k]='[redacted-by-harness]'}
  stage='sampling';
  const delays=c.part==='fence'?[0,500]:[0,250,1000,3000];
  row.samples=await samples(row,delays);
  let last=row.samples.at(-1);
  if(c.part==='fence'&&!domCorrect(row,last)){await sleep(row.returnedAt+3000-Date.now());const r=await fixture.command({op:'read',cell:row.id,expected:row.editor==='password'?row.expectedFinal:undefined});last={...r,delay:3000,returnedAt:row.returnedAt,actualDelayMs:r.at-row.returnedAt};row.samples.push(last)}
  row.trace=[row.settledSetup,row.priorKeyEffect,...row.samples].flatMap(s=>s?.trace??[]).sort((a,b)=>a.seq-b.seq);
  for(const s of [row.reset,row.setup,row.settledSetup,row.priorKeyEffect,...row.samples])if(s)delete s.trace;
  row.markerAcks=fixture.disarm()?.all??[];
  row.final=domText(row,last);row.correct=domCorrect(row,last);
  const first=row.samples[0],prefix=s=>typeof s.text==='string'&&s.text.length<row.expectedFinal.length&&row.expectedFinal.startsWith(s.text);
  row.firstSampleDelayMs=first.at-row.returnedAt;row.partialAtFirstSample=prefix(first);
  row.firstCorrectSampleDelay=row.samples.find(s=>domCorrect(row,s))?.delay??null;
  row.finalClassification=row.correct?'exact':prefix(last)?'proper-prefix-deficit':'transformation-or-corruption';
  row.analysis=row.key?analyzeTrace(row.trace,{scene:c.scene,key:row.key}):null;
  row.fenceStatus=row.markerFence?.status??row.keyRPC?.fence?.status??null;row.fenceConfirmed=row.markerFence?.confirmed??row.keyRPC?.fence?.confirmed??null;
  row.fenceMs=row.markerFence?.fenceMs??row.keyRPC?.fence?.fenceMs??null;
  row.verdict=readbackVerdict(rb,{correct:row.correct,intent:row.expectedFinal});
  row.keyToTypeGapMs=row.keyRPC?row.typeRPC.startedAt-row.keyRPC.endedAt:null;
  row.keyPostedToTextPostedMs=row.keyRPC?.meta?.endedAt&&row.typeRPC.meta?.startedAt?row.typeRPC.meta.startedAt-row.keyRPC.meta.endedAt:null;
  row.valid=true;
 }catch(e){
  lost=e instanceof FixtureLost;row.valid=false;row.setupFailure=stage==='setup'||e instanceof SetupError||lost;row.fixtureLost=lost;row.failureStage=stage;row.problem=String(e.stack??e).slice(0,3000);
  if(e instanceof Abort)throw e;
 }finally{
  w?.close();fixture.disarm();row.endedAt=Date.now();
  if(lost){try{row.rebound=await fixture.bindVisible(()=>titles(pid),8000)}catch(e){row.rebindProblem=String(e).slice(0,500)}}
  save(row);
  const f=row.analysis,rb=row.typeRPC?.readback;
  console.log('354f',row.id,row.problem?row.problem.split('\n')[0]:'ok','correct',row.correct,'fence',row.fenceStatus,row.fenceMs==null?'':Math.round(row.fenceMs),'readback',rb?.status??'-',rb?.reason??'',rb?.readbackMs==null?'':Math.round(rb.readbackMs),'late',f?.lateEffect??'-');
 }
 if(warmup)return;
 done++;if(row.valid){valid++;consecutiveInvalid=0}else{invalid++;consecutiveInvalid++;if(row.setupFailure)setupFailures++}
 progress(row.id);
 const why=abortReason({consecutiveInvalid,setupFailures});if(why)throw new Abort('aborting: '+why);
}

try{
 meta.version=version(KIND);
 browser=await launch(KIND,fixture.url,join(OUT,'profile'),WIN);pid=browser.pid;
 await fixture.waitReady(30000);
 await sleep(KIND==='cft'?Math.max(0,browser.launchedAt+22000-Date.now()):1500);placePid(pid,WIN);
 const doc=join(OUT,'cover.txt');writeFileSync(doc,'The probe cover.');sh('open',['-a','TextEdit',doc]);await sleep(1000);
 coverPid=+(sh('pgrep',['-x','TextEdit']).stdout.trim().split('\n')[0]);placePid(coverPid,{x:0,y:40,w:380,h:300});
 await front(pid);
 meta.binding=await fixture.bindVisible(()=>titles(pid),15000);meta.bindingEvidence=fixture.fx.bindings[0];
 const w=await connect();for(let i=0;i<2;i++){await rpc(w,'get_app_state',{includeScreenshot:false});await sleep(1200)}w.close();
 meta.pid=pid;meta.coverPid=coverPid;writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));progress(null);
 const warm=LANES.includes('fence')||LANES.includes('readback')?{part:'fence',editor:SHARD,scene:'normal',mode:'baseline',length:30,rep:0}:{part:'unreadable',editor:'canvas',scene:'normal',mode:'readback',length:30,rep:0};
 await cell({...warm,id:'warmup/'+[warm.part,warm.editor,warm.mode].join('/')},{warmup:true});
 for(const c of cells)await cell(c);
}catch(e){aborted=String(e.stack??e).slice(0,3000);console.error(aborted)}
finally{
 meta.finishedAt=Date.now();meta.coverage={...coverage({planned:cells.length,valid,aborted:!!aborted}),invalid,setupFailures,privacyViolations,aborted};
 meta.fixture={bound:fixture.fx.bound,bindings:fixture.fx.bindings,ready:fixture.fx.ready,foreignPolls:fixture.fx.foreignPolls,foreignAnswers:fixture.fx.foreignAnswers,expired:fixture.fx.expired};
 writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));progress(null);
 console.log('354f coverage',JSON.stringify(meta.coverage));
 if(!meta.coverage.complete||privacyViolations)process.exitCode=1;
 engine.kill('SIGTERM');side.kill('SIGTERM');
 if(browser){try{KIND==='safari'?browser.kill():process.kill(browser.pid,'SIGTERM')}catch{}}
 fixture.close();
}
