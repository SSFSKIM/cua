// Hosted-only #395 trial and fixture driver. Disposable experiment kit, never product code.
//   node run.mjs <enginePath> <swiftProbePath> <sourceRoot> <outDir> [reps]
// The engine is the pinned native build; the Swift probe is a persistent stdin/stdout newline-JSON tool (ops front, titles,
// measure); sourceRoot is the pinned product tree whose real createSkyService, createService and fileStore carry every
// typed text, so plain, substituted-secret and password cells share one path. reps is 20, or 1 for a smoke run.
//
// Privacy: only synthetic values exist, all generated in memory at run time. Records hold only design parameters, booleans,
// counts, timings, stage names and the probe's scrubbed whitelist result: never field text, typed text, a stored secret, a
// seed, a raw engine reply, an engine or probe log, or an error message. Engine and probe stderr are discarded.
import {spawn,spawnSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdirSync,mkdtempSync,writeFileSync,appendFileSync,rmSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';
import {launch,placePid,version} from '../probe-316/browser.mjs';
import {createFixture,FixtureLost} from '../probe-354-fences/fixture.mjs';
import {resolveBrowserTarget} from '../probe-354-fences/ab-secret.mjs';
import {plan,WARMUPS,LARGE_NODES,CONTROL_REPS,PASSWORD_RANGE_REPS,PASSWORD_RANGE,PASSWORD_RANGE_LENGTHS,CONTROLS,PAIRS,LENGTHS,KINDS,PAGES} from './plan.mjs';
import {page} from './page.mjs';

const SEED='Old draft sentence goes here.',SECRET_LABEL='PROBE395',BUDGET_MS=100*60000,WIN={x:400,y:30,w:620,h:720};
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const sh=(c,a)=>spawnSync(c,a,{encoding:'utf8',timeout:20000});
// Failures carry a stage, never a message: an engine or fixture message could carry a typed or compared value.
class Fail extends Error {}
class Abort extends Error {}

// ---- synthetic values and the leak detector -------------------------------------------------------------------------
// Every synthetic value is registered as its 8-character windows (hex windows must hold a letter, so a run of digits cannot
// match a timestamp). Any string about to be stored is checked against them; a hit is a privacy violation, not data.
const memo=new Map(),windows=new Set();
function addWindows(v){for(let i=0;i+8<=v.length;i++){const w=v.slice(i,i+8);if(/[a-f]/.test(w))windows.add(w)}}
const hexValue=n=>{for(;;){const v=randomBytes(Math.ceil(n/2)).toString('hex').slice(0,n);if((v.match(/[a-f]/g)??[]).length>=2)return v}};
addWindows(SEED);
// Variants a and b of one role and length are the equal-length, different-content pair.
function valueFor(role,length,variant){
 const key=role+'/'+length+'/'+variant;
 if(!memo.has(key)){
  let v=hexValue(length);
  if(variant==='b'){const a=valueFor(role,length,'a');while(v===a)v=hexValue(length)}
  memo.set(key,v);addWindows(v);
 }
 return memo.get(key);
}
function leaks(s){for(let i=0;i+8<=s.length;i++)if(windows.has(s.slice(i,i+8)))return true;return false}

// ---- scrubbing ------------------------------------------------------------------------------------------------------
const STATE_KEYS=['at','exact','selectionOk','kindOk','focused','sameNode','keydowns','inputs','fillerNodes','domNodes','fieldAfterFiller','fillerAboveField','inViewport'];
const pick=s=>Object.fromEntries(STATE_KEYS.map(k=>{const v=s?.[k];return [k,typeof v==='boolean'||Number.isSafeInteger(v)?v:null]}));
const TEXTLIKE=/^(text|value|values|selectedText|selected|excerpt|actual|expected|before|after|content|characters|string)$/i;
// The probe's own whitelist is trusted, not relied on: only booleans, finite numbers, null and short printable strings pass.
function scrub(v,tally,depth=0){
 if(v===null||typeof v==='boolean')return v;
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 if(typeof v==='string'){
  if(leaks(v)){tally.leaks++;return '[withheld]'}
  if(v.length>120||!/^[\x20-\x7e]*$/.test(v)){tally.withheld++;return '[withheld]'}
  return v;
 }
 if(depth>=8)return null; // the probe's nested password diagnostics reach depth 6
 if(Array.isArray(v))return v.slice(0,64).map(x=>scrub(x,tally,depth+1));
 if(typeof v==='object'){
  const out={};
  for(const [k,x] of Object.entries(v).slice(0,64)){
   if(!/^[A-Za-z0-9_.-]{1,48}$/.test(k)){tally.withheld++;continue}
   if(typeof x==='string'&&TEXTLIKE.test(k)){tally.withheld++;out[k]='[withheld]';continue}
   out[k]=scrub(x,tally,depth+1);
  }
  return out;
 }
 return null;
}

// ---- arguments ------------------------------------------------------------------------------------------------------
const [enginePathArg,swiftPathArg,sourceRootArg,outDirArg,repsArg]=process.argv.slice(2);
function parseArgs(){
 if(!enginePathArg||!swiftPathArg||!sourceRootArg||!outDirArg)throw new Error('usage: run.mjs enginePath swiftProbePath sourceRoot outDir [reps]');
 const reps=repsArg===undefined?20:Number(repsArg);
 if(!(reps===20||reps===1))throw new Error('reps must be 20 (measurement) or 1 (smoke)');
 const args={enginePath:resolve(enginePathArg),swiftPath:resolve(swiftPathArg),sourceRoot:resolve(sourceRootArg),outDir:resolve(outDirArg),reps};
 for(const p of [args.enginePath,args.swiftPath])if(!statSync(p).isFile())throw new Error('missing executable');
 if(!statSync(args.sourceRoot).isDirectory())throw new Error('missing source root');
 return args;
}

class Wire{
 static connect(path){return new Promise((ok,no)=>{const s=createConnection(path);s.once('connect',()=>ok(new Wire(s)));s.once('error',e=>{s.destroy();no(e)})})}
 constructor(s){this.s=s;this.buf=Buffer.alloc(0);this.pending=new Map();this.id=0;s.on('error',()=>{});s.on('data',d=>{this.buf=Buffer.concat([this.buf,d]);while(this.buf.length>=4){const n=this.buf.readUInt32LE();if(this.buf.length<4+n)break;const r=JSON.parse(this.buf.subarray(4,4+n));this.buf=this.buf.subarray(4+n);this.pending.get(r.id)?.(r);this.pending.delete(r.id)}})}
 call(method,params){const id=++this.id,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return new Promise((ok,no)=>{const t=setTimeout(()=>{this.pending.delete(id);no(new Fail())},60000);this.pending.set(id,r=>{clearTimeout(t);ok(r)});this.s.write(Buffer.concat([h,b]))})}
 execute(method,args){return this.call('execute',{method,args,deadlineUnixMilliseconds:Date.now()+55000})}
 close(){this.s.destroy()}
}
async function stopChild(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return true;
 return new Promise(ok=>{const t=setTimeout(()=>{try{child.kill('SIGKILL')}catch{}ok(false)},5000);child.once('exit',()=>{clearTimeout(t);ok(true)});child.kill('SIGTERM')});
}

async function main(){
 const args=parseArgs();
 if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw new Error('hosted runners only');
 const {enginePath,swiftPath,sourceRoot,outDir,reps}=args,start=Date.now();
 mkdirSync(outDir,{recursive:true});
 const tmp=mkdtempSync(join(process.env.RUNNER_TEMP||tmpdir(),'p395-')),home=join(tmp,'home'),socket=join(tmp,'e.sock'),env={HOME:home};
 mkdirSync(home,{recursive:true,mode:0o700});
 if(Buffer.byteLength(socket)>=103)throw new Error('socket path too long');

 // The product's own code, from the pinned source tree.
 const load=p=>import(pathToFileURL(join(sourceRoot,p)).href);
 const [skyModule,serviceModule,storeModule,protocolModule]=await Promise.all([load('src/services/sky.mjs'),load('src/services/engine/service.mjs'),load('src/secrets/store.mjs'),load('src/services/engine/protocol.mjs')]);
 const store=storeModule.fileStore({dir:storeModule.storeDir(env)});

 // ---- owned children ----------------------------------------------------------------------------------------------
 const engine=spawn(enginePath,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','ignore']});
 engine.on('error',()=>{});
 const side=spawn(swiftPath,[],{stdio:['pipe','pipe','ignore']}),waiters=[];
 side.on('error',()=>{});
 let sideBroken=false;
 function breakSide(){sideBroken=true;for(const w of waiters.splice(0)){clearTimeout(w.timer);w.reject(new Abort())}}
 createInterface({input:side.stdout}).on('line',l=>{let r;try{r=JSON.parse(l)}catch{r={error:true}}const w=waiters.shift();if(w){clearTimeout(w.timer);w.resolve(r)}});
 side.on('exit',breakSide);side.stdin.on('error',()=>{});
 // One request, one answer line, in order. A late answer would be read as the next request's, so a timeout ends the run.
 const ask=(q,ms=20000)=>new Promise((resolveAsk,reject)=>{
  if(sideBroken){reject(new Abort());return}
  const w={resolve:resolveAsk,reject,timer:setTimeout(breakSide,ms)};waiters.push(w);side.stdin.write(JSON.stringify(q)+'\n');
 });
 // Fixed-label foreground diagnostic of the last request (never a pid), kept on a failed row.
 let lastFront=null;
 async function front(target,activate=true){
  const r=await ask({op:'front',pid:target,activate,safariPid:pid});
  const label=(v,set)=>set.includes(v)?v:'invalid';
  lastFront={target:target===coverPid?'cover':target===pid?'safari':'other',activate,accepted:typeof r.activationAccepted==='boolean'?r.activationAccepted:null,
   workspaceFront:label(r.workspaceFront,['target','none','safari','other']),targetBundle:label(r.targetBundle,['TextEdit','Safari','other','none']),
   targetTerminated:typeof r.targetTerminated==='boolean'?r.targetTerminated:null};
  if(r.error||r.frontmostPid!==target)throw new Fail();
 }
 const titles=async target=>{const r=await ask({op:'titles',pid:target});return Array.isArray(r.titles)?r.titles.filter(t=>typeof t==='string'):[]};
 async function connect(){
  for(let i=0;i<200;i++){
   if(engine.exitCode!==null||engine.signalCode!==null)throw new Fail();
   try{const w=await Wire.connect(socket),r=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(r.error){w.close();throw new Fail()}w.identity=r.result;return w}catch{await sleep(50)}
  }
  throw new Fail();
 }

 let fixture=null;
 const planSeed=randomBytes(4).readUInt32LE(),rounds=plan({reps,seed:planSeed,controlReps:Math.min(reps,CONTROL_REPS),passwordRangeReps:Math.min(reps,PASSWORD_RANGE_REPS)});
 const planned=rounds.reduce((n,r)=>n+r.length,0);
 let browser=null,pid=0,coverPid=0,target=null,order=0,done=0,harnessValid=0,probeValid=0,valid=0,invalid=0,setupFailures=0,consecutiveInvalid=0,privacyViolations=0,storeCleanupFailures=0,aborted=null;
 const failureStages={},probeReasons={},parts={};
 const meta={kit:process.env.GITHUB_SHA??null,engine:process.env.ENGINE_REF??null,source:process.env.SOURCE_REF??null,image:process.env.ImageVersion??null,startedAt:start,reps,planSeed,planned,controlReps:Math.min(reps,CONTROL_REPS),passwordRangeReps:Math.min(reps,PASSWORD_RANGE_REPS),
  design:{pages:PAGES,kinds:KINDS,lengths:LENGTHS,largeNodes:LARGE_NODES,
   controls:CONTROLS.map(c=>({name:c[0],selStart:c[1],selLength:c[2],typedLength:c[3],finalRange:c[4]})),
   pairs:PAIRS.map(p=>({role:p.role,a:p.a,b:p.b})),passwordRange:{lengths:PASSWORD_RANGE_LENGTHS,range:PASSWORD_RANGE}},
  protocol:{
   fixture:'one document and one input node (#probe395-target, class probe395-field) for the whole run; conditions change type, value and selection in place and add or remove the large-before-editor group before it; the page answers booleans and counts only',
   path:'every typed text goes through the real createSkyService and createService over the engine socket in a fresh temporary HOME; secret cells type the literal handle with the value in the temporary fileStore (removed after each call); plain cells type the literal text; password cells are seeded in the DOM and never typed into. A Sky rejection is allowed to proceed only when the engine answered type_text with errorName typeUnconfirmed; the DOM gate below decides validity independently',
   order:'each round holds every unit once, shuffled with a seeded generator; a unit is one cell or a matched pair that is measured back to back (plain and secret of one page, length and repetition; unchanged, content and prefix plain pairs); the matched equal-length content variants (a, b) alternate by repetition',
   cell:'browser forward, DOM setup, cover forward, 250ms settle, DOM re-read, cover frontmost check without activation, witness arm, type (plain and secret only), cover check, DOM confirmation of content, caret and active element, a script selection for non-collapsed plain cells, one probe measure, DOM re-read, cover check, witness disarm; no key is pressed by the harness; the page counts key and input events (zero before typing, unchanged by the select and the probe)',
   retries:'none: no measured text or probe request is retried',
   validity:'harnessValid = every DOM, foreground and event-count check plus a valid arm and disarm witness; probeValid = the probe says valid (a clean route miss is probe-valid); valid = both. Coverage is complete when every planned cell is harnessValid and probeValid, summarized separately',
   privacy:'synthetic values only, kept in memory; rows carry no text, seed, secret, engine reply, log or error message; engine and probe stderr discarded; strings from the probe are scrubbed and checked against every synthetic value',
   abort:'3 consecutive harness-invalid cells, 6 setup failures, a failed secret cleanup, a failed witness cleanup, a stuck probe, or the 100 minute budget'}};
 const budget=()=>{if(Date.now()-start>BUDGET_MS)throw new Abort()};
 const progress=last=>writeFileSync(join(outDir,'progress.json'),JSON.stringify({planned,done,harnessValid,probeValid,valid,invalid,setupFailures,consecutiveInvalid,privacyViolations,storeCleanupFailures,failureStages,probeReasons,aborted:aborted!==null,elapsedMs:Date.now()-start,last},null,2));
 // Final defence: nothing is written that contains a synthetic value.
 function save(row){
  let line=JSON.stringify(row);
  if(leaks(line)){privacyViolations++;line=JSON.stringify({recordKind:row.recordKind,id:row.id,valid:false,harnessValid:false,probeValid:false,failureStage:'privacy',privacyViolation:true})}
  appendFileSync(join(outDir,'rows.jsonl'),line+'\n');
 }
 // The probe's continuous foreground witness: a reply is a valid Boolean and a reason, scrubbed like any probe string.
 async function witness(op){
  const r=await ask(op==='arm'?{op,pid,coverPid}:{op}),tally={leaks:0,withheld:0},result=scrub(r,tally);
  if(tally.leaks)privacyViolations++;
  return {valid:r?.valid===true&&!r?.error,reason:typeof r?.reason==='string'&&/^[A-Za-z0-9 _.:-]{1,60}$/.test(r.reason)&&!leaks(r.reason)?r.reason:null,result};
 }

 // ---- one cell ----------------------------------------------------------------------------------------------------
 // Seeds of the control cells are slices of one long base value, so cells with the same seed variant share their prefix.
 function materialize(c){
  const typed=c.kind!=='password',controlSeed=c.part==='caret-control'||c.part==='pair-control';
  const seed=!typed?valueFor('password-seed',c.seedLength,c.variant):controlSeed?valueFor('control-seed',512,c.seedVariant).slice(0,c.seedLength):SEED;
  const text=typed?valueFor(c.kind==='secret'?'secret':'plain',c.typedLength,c.variant):'';
  const final=typed?seed.slice(0,c.selStart)+text+seed.slice(c.selStart+c.selLength):seed;
  // Typed cells end at a collapsed caret, then (finalRange > 0) a script selects forward from it; a password cell keeps its seed selection.
  const caret=typed?c.selStart+c.typedLength:c.selStart,end=typed?caret+c.finalRange:c.selStart+c.selLength;
  const ok=seed.length===c.seedLength&&text.length===(typed?c.typedLength:0)&&final.length===c.expected.length
   &&c.expected.caret===caret&&c.expected.selectionEnd===end&&caret<=end&&end<=final.length&&c.selStart+c.selLength<=seed.length
   &&(typed||c.finalRange===0)&&(c.pairKey===null)===(c.recipe===null);
  if(!ok)throw new Fail();
  const type=typed?'text':'password';
  return {typed,range:typed&&c.finalRange>0,seed,text,type,
   initial:{value:seed,start:c.selStart,end:c.selStart+c.selLength,type},typedState:{value:final,start:caret,end:caret,type},final:{value:final,start:caret,end,type}};
 }
 // The DOM state is right when content, selection, input kind and the active element all match, the node is the original one,
 // and the page is the size the cell names.
 function stateOk(s,c,{typed}){
  const shape=c.page==='large'?s.fillerNodes===LARGE_NODES&&s.fieldAfterFiller===true&&s.fillerAboveField===true:s.fillerNodes===0&&s.fieldAfterFiller===null;
  const events=typed?s.inputs>0:s.keydowns===0&&s.inputs===0;
  return s.exact===true&&s.selectionOk===true&&s.kindOk===true&&s.focused===true&&s.sameNode===true&&shape&&events;
 }
 const readState=expected=>fixture.command({op:'read',expected},6000);
 // `rec` carries fixed labels only: whether type_text was sent and answered by the engine, whether the engine's exact
 // errorName was typeUnconfirmed (the raw error is never kept), and whether the synthetic store label was removed.
 async function typeThroughSky(w,m,c,rec){
  const secret=c.kind==='secret';
  const nodeRepl={env,setResponseMeta:()=>{},emitContentItem:()=>{},createElicitation:async q=>{if(q.meta?.tool_params?.app!==target.bundleIdentifier)throw new Fail();return {action:'accept'}}};
  const client={identity:w.identity,async execute(method,args){
   const started=performance.now();
   if(method==='type_text')rec.sent++;
   const raw=await w.execute(method,args),engineMs=performance.now()-started;
   if(method==='type_text'){rec.replied++;rec.engine=raw.error?(raw.error?.errorName==='typeUnconfirmed'?'typeUnconfirmed':'other'):'ok'}
   if(method==='resolve_app'&&(raw.result?.pid!==pid||raw.result?.bundleIdentifier!==target.bundleIdentifier))throw new Fail();
   if(raw.error)throw protocolModule.serverError(raw.error);
   return {result:raw.result,engineMs};
  }};
  const native=serviceModule.createService({nodeRepl,client});
  const sky=skyModule.createSkyService({platform:'darwin',env,nodeRepl,secrets:store,loadVendor:async()=>native,setResponseMeta:()=>{}});
  let wrote=false;
  try{
   if(secret){await store.write(SECRET_LABEL,valueFor('secret',c.typedLength,c.variant));wrote=true}
   const originalHome=process.env.HOME,originalConsole={};process.env.HOME=home;
   for(const k of ['log','warn','error','info','debug']){originalConsole[k]=console[k];console[k]=()=>{}}
   const startedAt=Date.now(),t0=performance.now();
   try{await sky.handleRpc({type:'execute',method:'type_text',args:[{app:target.appPath,text:secret?'{{secret:'+SECRET_LABEL+'}}':m.text}]})}
   catch{
    // The expected rejection: the engine answered the one type_text with typeUnconfirmed. Anything else stops the cell.
    if(!(rec.sent===1&&rec.replied===1&&rec.engine==='typeUnconfirmed'))throw new Fail();
    rec.rejected=true;
   }
   finally{Object.assign(console,originalConsole);if(originalHome===undefined)delete process.env.HOME;else process.env.HOME=originalHome}
   return {startedAt,endedAt:Date.now(),durationMs:performance.now()-t0};
  }finally{
   if(wrote){try{await store.remove(SECRET_LABEL);rec.cleanup='removed'}catch{rec.cleanup='failed'}}
  }
 }
 async function cell(c,{warmup=false}={}){
  budget();
  const row={recordKind:warmup?'warmup':'cell',id:c.id,part:c.part,control:c.control??null,rep:c.rep,order:warmup?null:++order,page:c.page,kind:c.kind,length:c.length,tag:c.tag,content:c.variant,large:c.page==='large',
   pairKey:c.pairKey,pairRole:c.pairRole,recipe:c.recipe,
   design:{seedLength:c.seedLength,selStart:c.selStart,selLength:c.selLength,typedLength:c.typedLength,finalRange:c.finalRange,seedVariant:c.seedVariant},expected:c.expected,fixture:{},foreground:{},startedAt:Date.now()};
  let stage='setup',w=null,lost=false,abortErr=null,armed=false,cleanupFailed=false;
  const rec={sent:0,replied:0,engine:null,rejected:false,cleanup:null};
  try{
   const m=materialize(c);
   if(m.typed)row.typeCall=rec;
   await front(pid);row.foreground.browserForPreparation=true;
   const s0=await fixture.command({op:'setup',nodes:c.page==='large'?LARGE_NODES:0,type:m.type,seed:m.seed,start:m.initial.start,end:m.initial.end,expected:m.initial},8000);
   row.fixture.setup=pick(s0);
   if(!stateOk(s0,c,{typed:false}))throw new Fail();
   stage='settle';
   await front(coverPid);row.foreground.coverForward=true;row.settleMs=250;await sleep(250);
   const s1=await readState(m.initial);row.fixture.settled=pick(s1);
   if(!stateOk(s1,c,{typed:false}))throw new Fail();
   await front(coverPid,false);row.foreground.coverBeforeType=true;
   // The witness covers everything from here to the final checks; it is always disarmed again, below or in the cleanup.
   stage='arm';
   armed=true;row.witness={arm:await witness('arm')};
   if(!row.witness.arm.valid)throw new Fail();
   if(m.typed){
    stage='type';
    w=await connect();
    try{row.typeTiming=await typeThroughSky(w,m,c,rec)}finally{if(rec.cleanup==='failed')cleanupFailed=true}
    if(cleanupFailed)throw new Fail();
    stage='after-type';
    await front(coverPid,false);row.foreground.coverAfterType=true;
   }
   stage='confirm';
   const confirmStart=Date.now(),deadline=confirmStart+4000;let s2,polls=0;
   for(;;){
    polls++;s2=await readState(m.typed?m.typedState:m.final);
    if(stateOk(s2,c,{typed:m.typed}))break;
    if(Date.now()>=deadline){row.fixture.confirmed=pick(s2);row.fixture.confirmPolls=polls;throw new Fail()}
    await sleep(25);
   }
   row.fixture.confirmed=pick(s2);row.fixture.confirmPolls=polls;row.fixture.confirmMs=Date.now()-confirmStart;
   let last=s2;
   if(m.range){
    // A script selection in the already focused field: no focus call, no key, no input event.
    stage='select';
    last=await fixture.command({op:'select',start:m.final.start,end:m.final.end,expected:m.final},6000);row.fixture.selected=pick(last);
    if(!stateOk(last,c,{typed:true})||last.keydowns!==s2.keydowns||last.inputs!==s2.inputs)throw new Fail();
    await front(coverPid,false);row.foreground.coverAfterSelect=true;
   }
   stage='measure';
   const nonce=fixture.fx.boundNonce;
   if(typeof nonce!=='string'||!nonce)throw new Fail();
   const measuredAt=Date.now(),answer=await ask({op:'measure',pid,coverPid,nonce,expectedCaret:c.expected.caret,expectedSelectionEnd:c.expected.selectionEnd,expectedLength:c.expected.length,kind:c.kind,large:c.page==='large',
    ...(c.pairKey!==null?{comparisonKey:c.pairKey,recipe:c.recipe}:{})},60000);
   const tally={leaks:0,withheld:0};
   row.probe={roundTripMs:Date.now()-measuredAt,result:scrub(answer,tally)};
   if(tally.leaks){privacyViolations++;row.probe.privacyViolation=true}
   if(tally.withheld)row.probe.withheldFields=tally.withheld;
   row.probeValid=answer?.valid===true&&!answer?.error;
   if(!row.probeValid)row.probeReason=typeof answer?.reason==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(answer.reason)&&!leaks(answer.reason)?answer.reason:'invalid';
   stage='after-measure';
   const s3=await readState(m.final);row.fixture.afterMeasure=pick(s3);
   // The probe must leave the page as it found it: same state, no key or input event of its own.
   if(!stateOk(s3,c,{typed:m.typed})||s3.keydowns!==last.keydowns||s3.inputs!==last.inputs)throw new Fail();
   await front(coverPid,false);row.foreground.coverAfterMeasure=true;
   stage='disarm';
   const closing=await witness('disarm');armed=false;row.witness.disarm=closing;
   if(!closing.valid)throw new Fail();
   row.harnessValid=true;
  }catch(e){
   lost=e instanceof FixtureLost;
   if(e instanceof Abort)abortErr=e;
   if(e instanceof Fail&&stage==='settle')row.foregroundDiag=lastFront;
   row.harnessValid=false;row.failureStage=stage;row.failureKind=e instanceof Abort?'abort':lost?'fixture':e instanceof Fail?'check':'error';row.fixtureLost=lost;
   row.setupFailure=stage==='setup'||stage==='settle'||lost;
  }finally{
   w?.close();
   if(armed){
    // Never leave the witness armed for the next attempt; a disarm that cannot be confirmed ends the run.
    try{const d=await witness('disarm');row.witness={...row.witness,cleanup:d}}catch{row.witnessCleanup='failed';abortErr??=new Abort()}
   }
   if(cleanupFailed){row.harnessValid=false;row.failureKind='cleanup';storeCleanupFailures++;abortErr??=new Abort()}
   row.probeValid??=null;if(row.probeValid!==true)row.probeReason??='not-measured';
   row.valid=row.harnessValid===true&&row.probeValid===true;row.endedAt=Date.now();
   if(lost){try{await fixture.bindVisible(()=>titles(pid),8000);row.rebound=true}catch{row.rebound=false}}
   save(row);
   console.log('395',row.id,row.harnessValid?'ok':'stage '+row.failureStage,'probe',row.probeValid);
  }
  if(!warmup){
   // Counted before any abort is raised, so an aborted row is part of the totals.
   done++;
   const part=parts[c.part]??={done:0,harnessValid:0,probeValid:0,valid:0};part.done++;
   if(row.harnessValid){harnessValid++;part.harnessValid++;consecutiveInvalid=0}else{invalid++;consecutiveInvalid++;if(row.setupFailure)setupFailures++;failureStages[row.failureStage]=(failureStages[row.failureStage]??0)+1}
   if(row.probeValid){probeValid++;part.probeValid++}else probeReasons[row.probeReason]=(probeReasons[row.probeReason]??0)+1;
   if(row.valid){valid++;part.valid++}
   progress(row.id);
  }
  if(abortErr)throw abortErr;
  if(!warmup&&(consecutiveInvalid>=3||setupFailures>=6))throw new Abort();
 }

 // ---- run ---------------------------------------------------------------------------------------------------------
 let stage='start';
 try{
  fixture=await createFixture(page());
  meta.version=version('safari');
  browser=await launch('safari',fixture.url,join(tmp,'profile'),WIN);pid=browser.pid;
  await fixture.waitReady(30000);await sleep(1500);placePid(pid,WIN);
  const cover=join(tmp,'cover.txt');writeFileSync(cover,'The probe cover.');sh('open',['-a','TextEdit',cover]);await sleep(1000);
  coverPid=+(sh('pgrep',['-x','TextEdit']).stdout.trim().split('\n')[0]);if(!coverPid)throw new Fail();placePid(coverPid,{x:0,y:40,w:380,h:300});
  // The cover must be a live TextEdit with the cover document's window before anything depends on it.
  {let ok=false;for(let i=0;i<20&&!ok;i++){ok=(await titles(coverPid)).some(t=>t.includes('cover'));if(!ok)await sleep(250)}
   meta.coverWindow=ok;if(!ok)throw new Fail()}
  stage='bind';
  await front(pid);await fixture.bindVisible(()=>titles(pid),15000);
  stage='preflight';
  const w=await connect();
  try{
   const resolved=await resolveBrowserTarget({execute:(method,a)=>w.execute(method,a),pid,bundle:'com.apple.Safari'});
   if(!resolved.ok)throw new Fail();
   target=resolved.target;
   for(let i=0;i<2;i++){await w.execute('get_app_state',{pid,includeScreenshot:false});await sleep(1200)}
  }finally{w.close()}
  meta.pid=pid;meta.coverPid=coverPid;writeFileSync(join(outDir,'config.json'),JSON.stringify(meta,null,2));progress(null);
  stage='warmup';
  for(const c of WARMUPS)await cell(c,{warmup:true});
  stage='cells';
  for(const roundCells of rounds)for(const c of roundCells)await cell(c);
 }catch{aborted=stage}
 finally{
  meta.finishedAt=Date.now();
  // Harness validity and probe validity are summarized apart; full coverage needs every planned cell valid in both.
  meta.coverage={planned,done,valid,
   harness:{valid:harnessValid,invalid,setupFailures,failureStages},
   probe:{valid:probeValid,invalid:done-probeValid,reasons:probeReasons},
   parts,privacyViolations,storeCleanupFailures,
   complete:aborted===null&&done===planned&&harnessValid===planned&&probeValid===planned&&valid===planned&&privacyViolations===0&&storeCleanupFailures===0,abortedAt:aborted};
  fixture?.close();
  const stopped={engine:await stopChild(engine),probe:await stopChild(side)};
  if(browser){try{browser.kill()}catch{}}
  let homeRemoved=true;try{rmSync(tmp,{recursive:true,force:true})}catch{homeRemoved=false}
  meta.cleanup={...stopped,tempRemoved:homeRemoved};
  writeFileSync(join(outDir,'config.json'),JSON.stringify(meta,null,2));progress(null);
  console.log('395 coverage',JSON.stringify(meta.coverage));
  if(!meta.coverage.complete||privacyViolations||storeCleanupFailures||!stopped.engine||!stopped.probe)process.exitCode=1;
 }
}
process.on('unhandledRejection',()=>{console.error('395 unexpected failure');process.exit(1)});
main().catch(()=>{console.error('395 failed before measurement');process.exitCode=1});
