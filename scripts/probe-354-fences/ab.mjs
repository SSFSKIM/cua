// Hosted-only real-engine A/B mode of the existing #354 spike kit. No shadow reader or fence instrumentation.
import {spawn,spawnSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdirSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch,placePid,version} from '../probe-316/browser.mjs';
import {expectation,CLIP} from '../probe-354/page.mjs';
import {page,SEED} from './page.mjs';
import {createFixture,FixtureLost} from './fixture.mjs';
import {abortReason,coverage} from './classify.mjs';
import {abPlan,answer,privacyFindings} from './ab-model.mjs';
import {writeTables} from './offline/ab-table.mjs';
import {snapshot} from '../probe-354-substitutions/diagnostic.mjs';
import {readbackStatus,qualifiedKeyAnswer,diagnosticContractFailure,needsForegroundReference,referenceKey,publicDOM,renderedVerdict} from './ab-extra.mjs';
import {createSyntheticSecretProbe,resolveBrowserTarget} from './ab-secret.mjs';

if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only; never run GUI steps on a Mac');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1]};
const OUT=arg('out'),ENGINE=arg('engine'),SIDE=arg('side'),KIND=arg('browser'),SHARD=arg('shard'),ARM=arg('arm'),HEAD=arg('head'),REPS=+(arg('reps')??20),SMOKE=arg('smoke')==='true';
if(!OUT||!ENGINE||!SIDE||!['main','branch'].includes(ARM)||!/^[a-f0-9]{40}$/.test(HEAD??''))throw Error('invalid A/B arguments');
const cells=abPlan({browser:KIND,editor:SHARD,reps:REPS});
if(cells.some(c=>c.secret)&&!arg('source'))throw Error('secret diagnostics require the pinned --source tree');
const secretProbe=cells.some(c=>c.secret)?await createSyntheticSecretProbe({sourceRoot:arg('source'),parent:process.env.RUNNER_TEMP}):null;
mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(ok=>setTimeout(ok,Math.max(0,ms))),start=Date.now();
const sh=(c,a)=>spawnSync(c,a,{encoding:'utf8',timeout:20000});
const WIN={x:400,y:30,w:620,h:720};
const sameSel=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
class SetupError extends Error {}
class Abort extends Error {}
class Wire{
 static connect(path){return new Promise((ok,no)=>{const s=createConnection(path);s.once('connect',()=>ok(new Wire(s)));s.once('error',e=>{s.destroy();no(e)})})}
 constructor(s){this.s=s;this.buf=Buffer.alloc(0);this.pending=new Map();this.id=0;s.on('error',()=>{});s.on('data',d=>{this.buf=Buffer.concat([this.buf,d]);while(this.buf.length>=4){const n=this.buf.readUInt32LE();if(this.buf.length<4+n)break;const r=JSON.parse(this.buf.subarray(4,4+n));this.buf=this.buf.subarray(4+n);this.pending.get(r.id)?.(r);this.pending.delete(r.id)}})}
 call(method,params){const id=++this.id,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return new Promise((ok,no)=>{const t=setTimeout(()=>{this.pending.delete(id);no(Error('RPC timeout '+method))},60000);this.pending.set(id,r=>{clearTimeout(t);ok(r)});this.s.write(Buffer.concat([h,b]))})}
 execute(method,args){return this.call('execute',{method,args,deadlineUnixMilliseconds:Date.now()+55000})}
 close(){this.s.destroy()}
}
const socket=join(process.env.RUNNER_TEMP,'ab354.sock');
if(Buffer.byteLength(socket)>=103)throw Error('engine socket path too long');
rmSync(socket,{force:true});
const auditWaiters=new Map();
const engine=spawn(ENGINE,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});
const engineLogLines=createInterface({input:engine.stderr}),engineLogsClosed=new Promise(ok=>engineLogLines.once('close',ok));
engineLogLines.on('line',l=>{appendFileSync(join(OUT,'engine-stderr.txt'),(secretProbe?secretProbe.log(l):l)+'\n');try{const a=JSON.parse(l).probe354Audit;if(a){auditWaiters.get(a.id)?.(a);auditWaiters.delete(a.id)}}catch{}});
function waitAudit(id){return new Promise(ok=>{const t=setTimeout(()=>{auditWaiters.delete(id);ok({id,error:'audit record missing'})},7000);auditWaiters.set(id,a=>{clearTimeout(t);ok(a)})})}
async function connect(){for(let i=0;i<200;i++){if(engine.exitCode!==null||engine.signalCode!==null)throw Error('engine exited before socket readiness');try{const w=await Wire.connect(socket),r=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(r.error){w.close();throw Error(JSON.stringify(r.error))}w.identity=r.result;return w}catch{await sleep(50)}}throw Error('engine unavailable')}
const side=spawn(SIDE,[],{stdio:['pipe','pipe','inherit']}),waiters=[];
createInterface({input:side.stdout}).on('line',l=>{let r;try{r=JSON.parse(l)}catch{r={error:l}}waiters.shift()?.(r)});
const ask=q=>new Promise(ok=>{waiters.push(ok);side.stdin.write(JSON.stringify(q)+'\n')});
async function front(target,activate=true){const r=await ask({op:'front',pid:target,activate});if(r.error||r.frontmostPid!==target)throw new SetupError('foreground verification '+JSON.stringify(r));return {requestedPid:target,...r}}
const titles=async target=>(await ask({op:'titles',pid:target})).titles??[];
let browser,pid,coverPid,secretTarget;
async function rpc(w,method,args){const startedAt=Date.now(),raw=await w.execute(method,{pid,...args}),endedAt=Date.now();return {startedAt,endedAt,durationMs:endedAt-startedAt,raw,meta:raw.result?.meta??raw.error?.meta??null}}
const fixture=await createFixture(page());
const meta={kit:process.env.GITHUB_SHA??null,engine:HEAD,arm:ARM,image:process.env.ImageVersion??null,browser:KIND,shard:SHARD,reps:REPS,smoke:SMOKE,startedAt:start,planned:cells.length,
 answers:'unaltered real engine result/error; typeUnconfirmed is a scored answer, not an invalid cell; no shadow reader or text retry',
 audit:'scratch source wrappers count attempted AXValue/selected-text/attributed-text and selection-range reads only during tagged privacy calls; no new AX requests; no values logged',
 setup:'same visible-owner long-poll transport and Firefox preferences as spike; foreground DOM preparation without a click, cover activation, 250ms settle, DOM check, last frontmost-pid check; passwords stay foreground',
 race:'Cmd+A/Z/V then type_text, no awaited action between key response and type request; expected result from separate key-only control at 500ms',
 clean:'Cmd+A independently settled and its DOM value/range checked at 500ms before type_text; 30/120/500 characters',
 sampling:'DOM at 0/250/1000/3000ms after real type_text response, including refusals; final is last sample',
 substitutions:'runner defaults unchanged: original spike CE500 plus separately labelled deliberate double-space CE500 diagnostic, CFT only; no period-off preference writes',
 extraCells:'ending Return in input: confirmed prefix/checkpoint and keysUnconfirmed; Tab is ONE terminal semantic diagnostic per browser/editor/head (n=1), after every other cell, never a 20-rep rate cell; changed finals require a complete prefix keydown witness; multiline Return is text; unchanged caret controls and cap diagnostics stay separate from 20-rep race/clean rates',
 renderedOracle:'public rendered-text diagnostics require a per-head foreground reference through the same actual type_text route, matching intended editing text and readable post-type AX; measured raw DOM structure/text and post-type AX value are compared to it independently of engine acknowledgements; missing evidence is unscorable; raw innerText/textContent/HTML retained; no secret/password/canvas value evidence',
 secrets:'real trusted wrapper/native service and isolated synthetic HOME; normal-input equality/mismatch, one/three trailing CR, and equal/different same-length private selections; both metadata pairs required to match exactly except snapshotMs, which stays in raw records and timing tables; socket RTT is measured inside the native client separately from trusted-call duration; all latency distributions are informational; Boolean keysUnconfirmed allowed, numeric counts/checkpoints/values/lengths withheld; private fixture states and errors scrubbed in finally before any save or log',
 abort:'3 consecutive invalid cells or 6 setup failures; incomplete coverage and branch contract failures exit nonzero'};
let done=0,valid=0,invalid=0,setupFailures=0,consecutiveInvalid=0,aborted=null;
const compact=[],calibrations=new Map(),foregroundReferences=new Map();
function progress(last){writeFileSync(join(OUT,'progress.json'),JSON.stringify({done,valid,invalid,planned:cells.length,setupFailures,consecutiveInvalid,aborted,last,elapsedMs:Date.now()-start,fixture:{bound:fixture.fx.bound,foreignPolls:fixture.fx.foreignPolls,expired:fixture.fx.expired,bindings:fixture.fx.bindings.length}},null,2))}
function save(row){
 appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n');
 const {samples,trace,reset,setup,settledSetup,priorKeyEffect,...small}=row;
 // Preserve just the pre-effect key witnesses needed by incremental scoring, not the whole text event trace.
 if(['ending-return','ending-tab'].includes(row.part))small.trace=(trace??[]).filter(t=>t.event==='keydown'&&['Enter','Tab'].includes(t.key));
 compact.push(small);writeTables(OUT,compact);
}
const seedFor=c=>c.seed??SEED;
function initial(c){const seed=seedFor(c),undo=c.key==='cmd+z';return {text:seed+(undo?' undo':''),selection:[c.key==='cmd+v'?0:undo?seed.length+5:3,0]}}
function check(s,c,label,intended=initial(c)){
 if(c.secret){secretProbe.checkFixture(s,intended,c.id);return}
 const text=c.privateField?s.matchesExpected===true&&s.length===intended.text.length:s.text===intended.text;
 if(!text||!s.focused||s.cell!==c.id||!sameSel(s.selection,intended.selection))throw new SetupError(c.privateField?'Private fixture state not established.':label+' not established '+JSON.stringify({length:s.length,selection:s.selection,focused:s.focused,cell:s.cell}));
}
async function setup(c,row,privateInitial,{foreground=false}={}){
 row.prepareForeground=await front(pid);
 const intended=privateInitial??initial(c),expected=c.privateField||c.secret?intended.text:undefined;
 row.reset=await fixture.command({op:'reset',cell:c.id,editor:c.editor,seed:privateInitial?.text??c.seed,privateField:c.privateField||c.secret,renderedText:c.renderedText,dropInput:c.secret&&c.variant==='mismatch',preventInput:c.preventInput,expected});
 const selection=c.key==='cmd+z'?[seedFor(c).length,0]:intended.selection;
 row.setup=await fixture.command({op:'prepare',cell:c.id,editor:c.editor,key:c.key,selection,expected});check(row.setup,c,'prepared state',intended);
 if(c.key==='cmd+v'){row.clip=await ask({op:'clip',text:CLIP});if(!row.clip.ok)throw new SetupError('known clipboard not established')}
 row.foregroundSetup=c.editor==='password'||foreground;const target=row.foregroundSetup?pid:coverPid;
 row.foregroundTransition=await front(target);row.setupSettleMs=250;await sleep(250);
 row.settledSetup=await fixture.command({op:'read',cell:c.id,expected});check(row.settledSetup,c,'settled state',intended);
 row.beforeMeasuredForeground=await front(target,false);
}
function semantic(key,s){
 if(typeof s?.text!=='string'||!Array.isArray(s.selection))return false;
 if(key==='cmd+a')return s.text===SEED&&sameSel(s.selection,[0,SEED.length]);
 if(key==='cmd+z')return s.text===SEED&&s.selection[0]+s.selection[1]<=SEED.length;
 return key==='cmd+v'&&s.text===CLIP+SEED&&sameSel(s.selection,[CLIP.length,0]);
}
async function calibrate(key){
 const row={recordKind:'key-only-control',arm:ARM,browser:KIND,editor:SHARD,key,kit:meta.kit,engine:HEAD,attempts:[]};let w;
 try{w=await connect();for(let attempt=1;attempt<=3;attempt++){
  const c={id:'calibration/'+key+'/'+attempt,editor:SHARD,key},trial={attempt};row.attempts.push(trial);
  await setup(c,trial);trial.keyRPC=await rpc(w,'press_key',{key});if(!answer(trial.keyRPC.raw).success)throw new SetupError('calibration key refused');
  await sleep(500);trial.effect=await fixture.command({op:'read',cell:c.id});trial.valid=semantic(key,trial.effect);
  if(trial.valid){row.valid=true;row.effect=trial.effect;calibrations.set(key,row);break}
 }
 if(!row.valid)throw new SetupError('key-only effect unavailable for '+key);
 }finally{w?.close();appendFileSync(join(OUT,'calibrations.jsonl'),JSON.stringify(row)+'\n')}
}
async function captureForegroundReference(c){
 if(!needsForegroundReference(c))throw Error('foreground value evidence is restricted to public rendered-text cells');
 const key=referenceKey(c),row={...c,id:'foreground/'+c.part+'/'+c.variant,recordKind:'foreground-reference',arm:ARM,browser:KIND,shard:SHARD,engine:HEAD,kit:meta.kit};
 let w,reference=null;
 try{
  w=await connect();await setup(c,row,undefined,{foreground:true});
  if(c.key){
   row.keyRPC=await rpc(w,'press_key',{key:c.key});if(!answer(row.keyRPC.raw).success)throw Error('reference key refused');
   await sleep(500);row.priorKeyEffect=await fixture.command({op:'read',cell:c.id});const calibration=calibrations.get(c.key);
   if(row.priorKeyEffect.text!==calibration.effect.text||!sameSel(row.priorKeyEffect.selection,calibration.effect.selection))throw Error('reference prior key not settled');
  }
  row.foregroundBefore=await front(pid,false);
  row.typeRPC=await rpc(w,'type_text',{text:c.text});
  const delays=[0,250,1000,3000],n=fixture.send({op:'sample',cell:c.id,returnedAt:row.typeRPC.endedAt,delays},8500);
  row.samples=(await fixture.collect(n,delays.length,8500)).sort((a,b)=>a.delay-b.delay);
  row.ax=await ask({op:'focusEvidence',pid,mode:'publicValue',lane:'public-rendered'});
  row.foregroundAfter=await front(pid,false);
  reference={id:row.id,browser:KIND,editor:c.editor,arm:ARM,engine:HEAD,text:c.text,route:row.typeRPC.meta?.inputRoute,dom:publicDOM(row.samples.at(-1)),ax:row.ax,foregroundVerified:row.foregroundBefore.frontmostPid===pid&&row.foregroundAfter.frontmostPid===pid&&row.samples.at(-1).focused===true};
  row.reference=reference;row.validation=renderedVerdict({...row},reference,{route:reference.route,dom:reference.dom,ax:reference.ax});
 }catch(e){row.problem=String(e.stack??e).slice(0,3000)}
 finally{w?.close();foregroundReferences.set(key,reference);appendFileSync(join(OUT,'foreground-references.jsonl'),JSON.stringify(row)+'\n')}
}
async function cell(c,{warmup=false}={}){
 if(Date.now()-start>45*60000)throw new Abort('45 minute per-arm budget exceeded');
 const privateInitial=c.part==='secret-selection'?secretProbe.fixture(c.variant):null;
 const calibration=c.key?calibrations.get(c.key):null,expected=expectation(calibration?.effect??{text:seedFor(c),selection:initial(c).selection},c.text),requestedFinal=expected.final;
 if(c.expectedText!==undefined)expected.final=c.expectedText;
 if(c.secret)expected.final=secretProbe.expected(privateInitial?.text??seedFor(c),privateInitial?.selection??initial(c).selection);
 let row={...c,recordKind:warmup?'warmup':'cell',arm:ARM,browser:KIND,shard:SHARD,kit:meta.kit,engine:HEAD,expectedFinal:c.secret?null:expected.final,requestedFinal:c.expectedText!==undefined?requestedFinal:undefined,calibrationKey:calibration?.key??null,startedAt:Date.now()};
 let w,stage='setup',lost=false;
 try{
  w=await connect();await setup(c,row,privateInitial);
  if(c.key){
   stage='key';row.keyRPC=await rpc(w,'press_key',{key:c.key});if(!answer(row.keyRPC.raw).success)throw Error('measured key refused');
   if(c.part!=='race'){
    await sleep(500);row.priorKeyEffect=await fixture.command({op:'read',cell:c.id});
    if(row.priorKeyEffect.text!==calibration.effect.text||!sameSel(row.priorKeyEffect.selection,calibration.effect.selection))throw new SetupError('clean prior key not settled at 500ms');
   }
  }
  stage='type';
  const auditRequested=c.privateField||c.secret||c.auditPositiveControl;
  const auditPromise=auditRequested?waitAudit(c.id):null;
  if(c.secret){
   const startedAt=Date.now(),reply=await secretProbe.run({app:secretTarget.appPath,bundle:secretTarget.bundleIdentifier,pid,id:c.id,returnUnits:c.returnUnits,selectionVariant:c.part==='secret-selection'?c.variant:undefined,pair:c.part+'/'+c.rep,identity:w.identity,execute:(method,args)=>w.execute(method,args)}),endedAt=Date.now();
   row.typeRPC={startedAt,endedAt,durationMs:endedAt-startedAt,engineTiming:reply.timing.engine,trustedTiming:reply.timing.trusted,raw:reply.engineRaw,meta:reply.engineRaw.result?.meta??reply.engineRaw.error?.meta??null};row.secretService=reply.service;row.secretFindings=reply.findings;row.secretReadbackEqual=reply.returnMetadataEqual;row.secretSelectionEqual=reply.selectionMetadataEqual;
  }else row.typeRPC=await rpc(w,'type_text',{text:c.text,...(c.concealed?{concealed:true}:{}),...(auditRequested?{probe354Audit:c.id}:{})});
  row.readbackStatus=readbackStatus(row.typeRPC.raw);
  row.returnedAt=row.typeRPC.endedAt;row.answer=answer(row.typeRPC.raw);row.keyToTypeGapMs=row.keyRPC?row.typeRPC.startedAt-row.keyRPC.endedAt:null;
  // The privacy audit wait is outside type_text's measured time and adds no AX requests.
  if(auditPromise){row.audit=await auditPromise;if(row.audit.error)throw Error(row.audit.error)}
  if(c.auditPositiveControl&&ARM==='branch'&&!(row.audit.textReadAttempts>0))throw Error('audit positive control: branch plaintext read was not counted');
  row.privacyFindings=c.secret?row.secretFindings:privacyFindings(row.typeRPC.raw,{...c,audit:row.audit,knownValues:[seedFor(c),c.text,expected.final]});
  row.privacyViolation=row.privacyFindings.length>0;
  if(row.privacyViolation){
   // Preserve paths/counts, not any accidentally returned private values.
   for(const path of row.privacyFindings){const parts=path.split('.');let target=row.typeRPC.raw;for(const p of parts.slice(0,-1))target=target?.[p];if(target&&Object.hasOwn(target,parts.at(-1)))target[parts.at(-1)]='[redacted-by-harness]'}
  }
  stage='sampling';const delays=[0,250,1000,3000],n=fixture.send({op:'sample',cell:c.id,returnedAt:row.returnedAt,delays,expected:c.privateField||c.secret?expected.final:undefined},8500);
  row.samples=(await fixture.collect(n,delays.length,8500)).sort((a,b)=>a.delay-b.delay);
  const last=row.samples.at(-1);row.final=c.privateField||c.secret?null:last.text;row.correct=c.privateField||c.secret?last.matchesExpected===true:last.text===expected.final;
  row.requestedExact=c.expectedText!==undefined?last.text===requestedFinal:row.correct;
  row.finalSelection=c.privateField||c.secret?null:last.selection;
  row.finalLength=last.length;row.firstSampleDelayMs=row.samples[0].at-row.returnedAt;
  row.trace=[row.settledSetup,row.priorKeyEffect,...row.samples].flatMap(s=>s?.trace??[]).sort((a,b)=>a.seq-b.seq);
  for(const s of [row.reset,row.setup,row.settledSetup,row.priorKeyEffect,...row.samples])if(s)delete s.trace;
  if(needsForegroundReference(c)){
   stage='oracle';
   const ax=await ask({op:'focusEvidence',pid,mode:'publicValue',lane:'public-rendered'});
   row.renderedEvidence={reference:foregroundReferences.get(referenceKey(c))??null,measured:{route:row.typeRPC.meta?.inputRoute,dom:publicDOM(last),ax}};
   row.renderedVerdict=renderedVerdict(row,row.renderedEvidence.reference,row.renderedEvidence.measured);
   if(!row.renderedVerdict.scorable)throw Error('Rendered-text oracle unavailable: '+row.renderedVerdict.reason);
   row.correct=row.renderedVerdict.correct;
  }
  if(c.part==='ending-tab'&&!c.secret&&!c.privateField&&!['password','canvas'].includes(c.editor))row.afterTabFocus={dom:await fixture.command({op:'focus',cell:c.id}),ax:await ask({op:'focusEvidence',pid,mode:'labelsOnly',lane:'terminal-tab'})};
  row.contractFailure=ARM==='branch'&&diagnosticContractFailure(row,row.typeRPC.raw);
  row.valid=true;
  if(ARM==='branch'&&row.answer.success&&!row.correct&&!qualifiedKeyAnswer(row,row.typeRPC.raw))console.error('BRANCH SUCCESS WITH WRONG FINAL VALUE',KIND,SHARD,c.id);
 }catch(e){
  lost=e instanceof FixtureLost;row.valid=false;row.setupFailure=stage==='setup'||e instanceof SetupError||lost;row.fixtureLost=lost;row.failureStage=stage;row.problem=String(e.stack??e).slice(0,3000);
 }finally{
  w?.close();row.endedAt=Date.now();
  if(lost){try{row.rebound=await fixture.bindVisible(()=>titles(pid),8000)}catch(e){row.rebindProblem=String(e).slice(0,500)}}
  // Includes failed setup/sampling: no private fixture state or exception details reach artifacts or console.
  if(c.secret)row=secretProbe.sanitizeFixture(row);
  save(row);console.log('354ab',ARM,KIND,SHARD,c.id,row.valid?'valid':row.problem?.split('\n')[0],row.answer?.errorName??(row.answer?.success?'success':'-'),'correct',row.correct,'typeMs',row.typeRPC?.durationMs);
 }
 if(warmup){if(!row.valid)throw new Abort('warmup invalid');return}
 done++;if(row.valid){valid++;consecutiveInvalid=0}else{invalid++;consecutiveInvalid++;if(row.setupFailure)setupFailures++}progress(c.id);
 const reason=abortReason({consecutiveInvalid,setupFailures});if(reason)throw new Abort(reason);
}
async function stopChild(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 await new Promise((ok,no)=>{const t=setTimeout(()=>no(Error('owned child did not stop: '+child.pid)),5000);child.once('exit',()=>{clearTimeout(t);ok()});child.kill('SIGTERM')});
}
try{
 meta.version=version(KIND);meta.defaultsBefore=snapshot('before',spawnSync);
 browser=await launch(KIND,fixture.url,join(OUT,'profile'),WIN);pid=browser.pid;
 await fixture.waitReady(30000);await sleep(KIND==='cft'?Math.max(0,browser.launchedAt+22000-Date.now()):1500);placePid(pid,WIN);
 const cover=join(OUT,'cover.txt');writeFileSync(cover,'The probe cover.');sh('open',['-a','TextEdit',cover]);await sleep(1000);
 coverPid=+(sh('pgrep',['-x','TextEdit']).stdout.trim().split('\n')[0]);if(!coverPid)throw Error('cover process unavailable');placePid(coverPid,{x:0,y:40,w:380,h:300});
 await front(pid);meta.binding=await fixture.bindVisible(()=>titles(pid),15000);meta.bindingEvidence=fixture.fx.bindings[0];meta.pid=pid;meta.coverPid=coverPid;
 const w=await connect();try{
  if(secretProbe){
   const bundle={safari:'com.apple.Safari',cft:'com.google.chrome.for.testing',firefox:'org.mozilla.firefox'}[KIND];
   const preflight=await resolveBrowserTarget({execute:(method,args)=>w.execute(method,args),pid,bundle});
   meta.secretTargetPreflight=preflight;
   if(!preflight.ok)throw Error('Secret target preflight failed: '+preflight.reason);
   secretTarget=preflight.target;
  }
  for(let i=0;i<2;i++){await rpc(w,'get_app_state',{includeScreenshot:false});await sleep(1200)}
 }finally{w.close()}
 writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));progress(null);
 for(const key of ['cmd+a','cmd+z','cmd+v'])await calibrate(key);
 await cell({...cells.find(c=>c.part==='clean'&&c.length===30),id:'warmup/clean30',auditPositiveControl:true},{warmup:true});
 for(const c of cells)if(needsForegroundReference(c)&&!foregroundReferences.has(referenceKey(c)))await captureForegroundReference(c);
 for(const c of cells)await cell(c);
}catch(e){aborted=String(e.stack??e).slice(0,3000);console.error(aborted)}
finally{
 meta.finishedAt=Date.now();meta.coverage={...coverage({planned:cells.length,valid,aborted:!!aborted}),invalid,setupFailures,aborted};
 meta.fixture={bound:fixture.fx.bound,bindings:fixture.fx.bindings,ready:fixture.fx.ready,foreignPolls:fixture.fx.foreignPolls,foreignAnswers:fixture.fx.foreignAnswers,expired:fixture.fx.expired};
 meta.defaultsAfter=snapshot('after',spawnSync);
 const summary=writeTables(OUT,compact);meta.branchWrongSuccesses=summary.wrongSuccesses.filter(r=>r.arm==='branch').length;
 meta.contractFailures=compact.filter(r=>r.recordKind==='cell'&&(r.privacyViolation||r.contractFailure||(ARM==='branch'&&r.valid&&((['unsupported','truncation'].includes(r.part)&&!r.answer.unconfirmed)||(r.part==='clean'&&(!r.correct||!r.answer.success))||(r.part==='substitution'&&!r.correct&&!r.answer.unconfirmed))))).map(r=>r.id);
 writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));progress(null);console.log('354ab coverage',JSON.stringify(meta.coverage));
 if(!meta.coverage.complete||meta.branchWrongSuccesses||meta.contractFailures.length)process.exitCode=1;
 fixture.close();
 try{
  await stopChild(engine);await engineLogsClosed;await stopChild(side);if(browser){if(KIND==='safari')browser.kill();else await stopChild(browser)}
  meta.secretLogLeaks=secretProbe?.logLeaks??0;if(meta.secretLogLeaks)process.exitCode=1;
  writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));
  writeFileSync(join(OUT,'engine-stopped.json'),JSON.stringify({pid:engine.pid,exitCode:engine.exitCode,signalCode:engine.signalCode,at:Date.now()}));
 }catch(e){console.error(String(e));process.exitCode=1}
 secretProbe?.close();
}
