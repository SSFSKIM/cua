// Hosted-only #354 measurement. Disposable experiment kit, never product code.
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync,writeFileSync,appendFileSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {launch,placePid,version} from '../probe-316/browser.mjs';
import {page,expectation,SEED,CLIP} from './page.mjs';
if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('hosted runners only');
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1]};
const OUT=arg('out'),ENGINE=arg('engine'),TOOL=arg('tool'),OCR=arg('ocr'),KIND=arg('browser'),PHASE=arg('phase')??'all',REPS=+(arg('reps')??20),SMOKE=arg('smoke')==='true';
if(!['all','rate','partial'].includes(PHASE)||!Number.isInteger(REPS)||REPS<1)throw Error('invalid phase/reps');
const editorChoices=KIND==='native'?['TextEdit']:['textarea','input','contenteditable','compose'];
const editors=arg('editors')?arg('editors').split(','):editorChoices;
if(!editors.length||editors.some(e=>!editorChoices.includes(e))||new Set(editors).size!==editors.length)throw Error('invalid editor filter');
function completedIds(input){const ids=Array.isArray(input)?input:input?.completedIds;if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id.length))throw Error('skip-completed must contain a JSON string array or {completedIds:[...]}');return new Set(ids)}
const skipCompletedFile=arg('skip-completed'),skipInput=skipCompletedFile?JSON.parse(readFileSync(skipCompletedFile,'utf8')):[],skipIds=completedIds(skipInput);
mkdirSync(OUT,{recursive:true});if(skipCompletedFile)writeFileSync(join(OUT,'resume-input.json'),JSON.stringify(skipInput,null,2));const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms))),start=Date.now();
// The measurement gets at most 125 minutes; the workflow leaves separate build/upload margin.
const budget=()=>{if(Date.now()-start>125*60000)throw Error('125 minute measurement budget exceeded')};
const sh=(c,a)=>spawnSync(c,a,{encoding:'utf8',timeout:20000});
const WIN={x:400,y:30,w:620,h:720};
class Wire{
 static async connect(p){return new Promise((ok,no)=>{let s=createConnection(p);s.once('connect',()=>ok(new Wire(s)));s.once('error',no)})}
 constructor(s){this.s=s;this.buf=Buffer.alloc(0);this.pending=new Map();this.id=0;s.on('data',d=>{this.buf=Buffer.concat([this.buf,d]);while(this.buf.length>=4){let n=this.buf.readUInt32LE();if(this.buf.length<4+n)break;let r=JSON.parse(this.buf.subarray(4,4+n));this.buf=this.buf.subarray(4+n);this.pending.get(r.id)?.(r);this.pending.delete(r.id)}});s.on('error',()=>{})}
 call(method,params){let id=++this.id,b=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params})),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return new Promise((ok,no)=>{let t=setTimeout(()=>{this.pending.delete(id);no(Error('RPC timeout '+method))},60000);this.pending.set(id,r=>{clearTimeout(t);ok(r)});this.s.write(Buffer.concat([h,b]))})}
 execute(method,args){return this.call('execute',{method,args,deadlineUnixMilliseconds:Date.now()+55000})}
 close(){this.s.destroy()}
}
const socket=join(process.env.RUNNER_TEMP,'s354.sock');rmSync(socket,{force:true});
let engineError='';const engine=spawn(ENGINE,[],{env:{...process.env,CUA_ENGINE_SOCKET:socket},stdio:['ignore','ignore','pipe']});engine.stderr.on('data',d=>{engineError+=d;writeFileSync(join(OUT,'engine-stderr.txt'),engineError)});
async function connect(){for(let i=0;i<200;i++){try{let w=await Wire.connect(socket);let r=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(r.error)throw Error(JSON.stringify(r));return w}catch{await sleep(50)}}throw Error('engine unavailable')}
const side=spawn(TOOL,[],{stdio:['pipe','pipe','inherit']}),waiters=[];
createInterface({input:side.stdout}).on('line',l=>{let r;try{r=JSON.parse(l)}catch{r={error:l}}waiters.shift()?.(r)});
const ask=q=>new Promise(ok=>{waiters.push(ok);side.stdin.write(JSON.stringify(q)+'\n')});
async function front(target,activate=true){const r=await ask({op:'front',pid:target,activate});if(r.error||r.frontmostPid!==target)throw Error('foreground verification '+JSON.stringify(r));return {requestedPid:target,...r}}
let cmdNo=0,poll=null,queue=[],answers=[];
const server=createServer(async(req,res)=>{if(req.url==='/'){res.end(page());return}if(req.url==='/cmd'){if(queue.length)res.end(JSON.stringify(queue.shift()));else{poll=res;res.on('close',()=>{if(poll===res)poll=null})}return}if(req.url==='/answer'){let b='';for await(const c of req)b+=c;try{answers.push({...JSON.parse(b),receivedAt:Date.now()})}catch{}res.end('ok');return}res.statusCode=404;res.end()});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const URL=`http://127.0.0.1:${server.address().port}/`;
function send(q){const c={n:++cmdNo,...q};if(poll){poll.end(JSON.stringify(c));poll=null}else queue.push(c);return c.n}
async function until(fn,ms=10000){const deadline=Date.now()+ms;for(;;){let v=fn();if(v)return v;if(Date.now()>=deadline)throw Error('condition timeout');await sleep(5)}}
async function command(q){const rpcStartedAt=Date.now(),n=send(q),r=await until(()=>answers.find(a=>a.cmd===n));answers=answers.filter(a=>a!==r);if(r.error)throw Error('fixture '+JSON.stringify(r));return {...r,rpcStartedAt,rpcReturnedAt:Date.now()}}
const meta={browser:KIND,phase:PHASE,editors,reps:REPS,smoke:SMOKE,kit:process.env.GITHUB_SHA,engine:process.env.ENGINE_REF,image:process.env.ImageVersion,startedAt:start,
 resume:{skipCompletedFile:skipCompletedFile??null,completedIdCount:skipIds.size,sourceRun:skipInput.sourceRun??null},setupProtocol:'fixture-only-v2: no browser engine click; real deactivation settles 250ms, intended DOM state checked before key',calibrationRetries:'at most 3 separately logged key-only controls; require semantic transition; never retry measured keys or requested typed text',
 rateSampling:'requested 0 and 500ms; mismatches re-read at 3000ms; actual timestamps recorded',partialSampling:'requested 0/250/1000/3000ms; prior cmd+a settled and confirmed independently',
 candidateBudgetMs:1000,candidateBudgetKind:'soft1000ms plus in-flight AX requests (100ms timeout each); overruns logged',candidatePollMs:5,
 oracle:'separately logged key-only per-browser/editor/key calibration after 500ms; browser final uses DOM replacement, native final uses AX replacement; key candidate uses focused AX, including editor-specific newlines',
 calibrationLimitation:'experiment-only known key effect, not a general undo-confirmation implementation; missing AX oracle is unconfirmable, not success',
 deliveryPolicy:'no automatic typed-text retry; candidate refusals are counterfactual and typing continues for scoring',
 nativeGroundTruth:'named TextEdit document AXTextArea is retained across empty/unfocused states; focused AX candidate oracle never uses retained/tree fallback',
 clickOrder:'separate part:click-order, textarea/all browser shard only,10 reps; foreground click -> selection-only script -> baseline type; expected replacement is script intent; 0/250/1000/3000ms samples',
 observations:'first and second get_app_state both includeScreenshot:true; screenshotAXContains describes AX, never pixels; OCR is visibility-only after all timed samples; Safari may be blank; long inputs can be offscreen',
 preparation:'every browser is truly foreground for fixture reset/focus/selection/undo setup; no engine click or deferred caret; cover is brought forward, deactivation settles250ms, intended state is verified, then actual frontmost PID is checked without activation immediately before key',
 originalSmokeEvidence:'run-42750046305 and run-42758470642 preserved separately; fixture-only-v2 removes both background-click refusal and deferred-click caret contamination from key-ordering coverage'};
// Persist evidence, not full trace-bearing rows in memory; this mitigates potential controller memory pressure.
let rowCount=0,validRows=0,skippedCompletedCells=0,first20SetupFailures=0;
function save(row){rowCount++;if(row.valid)validRows++;if(rowCount<=20&&row.setupFailure)first20SetupFailures++;appendFileSync(join(OUT,'rows.jsonl'),JSON.stringify(row)+'\n');writeFileSync(join(OUT,'progress.json'),JSON.stringify({meta,rows:rowCount,validRows,skippedCompletedCells,first20SetupFailures,processMemoryBytes:process.memoryUsage(),elapsedMs:Date.now()-start,last:row.id},null,2));console.log('354',row.id,row.problem??'ok','final',row.correct,'state',row.stateContains,'keywait',row.key?.probe?.ms,'typewait',row.type?.probe?.ms)}
let browser,coverPid,pid,native=KIND==='native';
const nativeDocument=join(OUT,'control.txt');
const modes=['baseline','ax-noop','key-effect','typed','combined'];
const keys=['cmd+a','cmd+z','cmd+x','cmd+v','cmd+Left','alt+Left','cmd+shift+Left','Left'];
const sentence=n=>('New typed sentence goes here. Every word is delivered in order. ').repeat(Math.ceil(n/62)).slice(0,n);
function brief(raw,startedAt,endedAt){return {startedAt,endedAt,durationMs:endedAt-startedAt,error:raw.error??null,meta:raw.result?.meta??raw.error?.meta??raw.error?.data?.meta,timings:raw.result?.timings??null,probe:raw.result?.probe354??null}}
async function rpc(w,method,args){if(args.outputDirectory)mkdirSync(args.outputDirectory,{recursive:true});let t=Date.now(),r=await w.execute(method,{pid,...args});return {...brief(r,t,Date.now()),raw:r}}
function clean(r){if(!r)return r;let {raw,...v}=r;return v}
function values(raw){return (raw?.result?.nodes??[]).filter(n=>['AXTextArea','AXTextField','AXStaticText'].includes(n.role)).map(n=>({role:n.role,value:n.value,title:n.title,description:n.description,frame:n.frame}))}
function readable(s){return typeof s?.text==='string'&&Array.isArray(s.selection)&&s.selection.length===2&&s.selection.every(n=>Number.isInteger(n)&&n>=0)&&s.selection[0]+s.selection[1]<=s.text.length}
function sameEffect(a,b){return a?.text===b?.text&&JSON.stringify(a?.selection)===JSON.stringify(b?.selection)}
function initial(key,scene='normal'){let pos=3,len=0;if(['cmd+Left','alt+Left','cmd+shift+Left','Left','cmd+z'].includes(key))pos=SEED.length;if(key==='cmd+x'||scene==='already-selected'){pos=0;len=SEED.length}if(key==='cmd+v')pos=0;return {text:key==='cmd+z'?SEED+' undo':SEED,selection:[pos+(key==='cmd+z'?5:0),len]}}
async function nativeState(){const r=await ask({op:'read',pid,documentPath:nativeDocument,allowTextEditFallback:true});if(r.error||!readable(r.state))throw Error('native AX read '+JSON.stringify(r));return r.state}
async function focusedAX(){const r=await ask({op:'focused',pid});return {...r,oracleAvailable:!r.error&&readable(r.state)}}
async function setupNative(w,key,row,scene){
 const reset=await ask({op:'reset',pid,text:SEED,range:[3,0],documentPath:nativeDocument,allowTextEditFallback:true});row.nativeReset=reset;
 if(reset.error||reset.setValue!==0||reset.setRange!==0)throw Error('native reset '+JSON.stringify(reset));
 const intended=initial(key,scene),range=key==='cmd+z'?[SEED.length,0]:intended.selection;
 const set=await ask({op:'range',pid,range,documentPath:nativeDocument,allowTextEditFallback:true});row.nativeRange=set;
 if(set.error||set.setRange!==0)throw Error('native range '+JSON.stringify(set));
 if(key==='cmd+z'){row.undoSetup=clean(await rpc(w,'type_text',{text:' undo'}));if(row.undoSetup.error)throw Error('native undo insertion '+JSON.stringify(row.undoSetup.error));await sleep(500)}
 return nativeState();
}
async function prepare(w,{id,editor,key,scene='normal'},row){
 row.prepareForeground=await front(pid);
 if(native)row.setup=await setupNative(w,key,row,scene);
 else{
  row.browserSetupMechanism='foreground fixture DOM focus/selection; no engine click';
  row.fixtureReset=await command({op:'reset',id,editor,key});
  row.setup=await command({op:'prepare',id,editor,key,scene});
 }
 if(!sameEffect(row.setup,initial(key,scene))||!readable(row.setup)||(!native&&!row.setup.focused))throw Error('intended initial state not established '+JSON.stringify(row.setup));
 if(key==='cmd+v'){row.clip=await ask({op:'clip',text:CLIP});if(!row.clip.ok)throw Error('clipboard setup '+JSON.stringify(row.clip))}
}
async function settleSetup({key,scene='normal',foreground=false},row){
 row.foregroundTransition=await front(foreground?pid:coverPid);
 row.setupSettleMs=250;await sleep(250);
 row.settledSetup=native?await nativeState():await command({op:'read'});
 if(!readable(row.settledSetup)||!sameEffect(row.settledSetup,initial(key,scene))||(!native&&!row.settledSetup.focused))throw Error('intended state changed during setup/deactivation settle '+JSON.stringify(row.settledSetup));
}
const calibrations=new Map(),calibrationKey=(editor,key,foreground)=>[editor,key,foreground?'front':'behind'].join('/');
function calibrationFailure(key,before,effect){
 if(!readable(before)||!readable(effect))return 'unreadable calibration state';
 if(sameEffect(before,effect))return 'no semantic transition';
 const [pos,len]=effect.selection,n=SEED.length;
 if(key==='cmd+x')return effect.text===''&&pos===0&&len===0?null:'cut did not empty selected seed';
 if(key==='cmd+v')return effect.text===CLIP+SEED&&pos===CLIP.length&&len===0?null:'paste did not insert known clipboard at intended start';
 if(effect.text!==SEED)return 'key did not preserve/restore seed';
 if(key==='cmd+a')return pos===0&&len===n?null:'select-all did not select full seed';
 if(key==='cmd+z')return null; // Undo's exact restored range remains calibrated, not assumed portable.
 if(key==='Left')return pos===n-1&&len===0?null:'left did not move one seed character';
 if(key==='cmd+Left')return pos===0&&len===0?null:'line-start did not reach seed start';
 if(key==='cmd+shift+Left')return len>0&&pos+len===n?null:'line selection did not extend from seed end';
 if(key==='alt+Left')return pos<n&&len===0?null:'word movement did not move left from seed end';
 return 'unsupported calibration key';
}
async function calibrate(editor,key,foreground=false){
 budget();const id='calibration/'+KIND+'/'+calibrationKey(editor,key,foreground),row={id,browser:KIND,phase:PHASE,editor,keyName:key,foreground,startedAt:Date.now(),settleMs:500,attempts:[]};let w;
 try{
  w=await connect();
  for(let attempt=1;attempt<=3;attempt++){
   const trial={attempt,attemptStartedAt:Date.now()};row.attempts.push(trial);
   await prepare(w,{id,editor,key},trial);await settleSetup({key,foreground},trial);
   trial.beforeKeyForeground=await front(foreground?pid:coverPid,false);
   trial.key=clean(await rpc(w,'press_key',{key,spike354Mode:'baseline'}));
   if(trial.key.error)throw Error('calibration key '+JSON.stringify(trial.key.error));
   await sleep(500);trial.effect=native?await nativeState():await command({op:'read'});trial.ax=await focusedAX();
   trial.semanticFailure=calibrationFailure(key,trial.settledSetup,trial.effect);
   trial.sampleAfterKeyReturnMs=trial.effect.at-trial.key.endedAt;trial.axOracleAvailable=trial.ax.oracleAvailable;
   // Missing focused AX is unconfirmable; DOM ground truth is never substituted into the AX candidate.
   trial.axValue=trial.axOracleAvailable?trial.ax.state.text:null;trial.axRange=trial.axOracleAvailable?trial.ax.state.selection:null;
   trial.attemptEndedAt=Date.now();Object.assign(row,trial);
   if(!trial.semanticFailure){row.valid=true;calibrations.set(calibrationKey(editor,key,foreground),row);break}
   console.error('354 invalid key-only control',id,attempt,trial.semanticFailure);
   if(attempt===3)throw Error('calibration semantic effect unavailable after 3 key-only controls: '+trial.semanticFailure);
   // Reset the entire control before retrying. No measured key or requested typed text is retried.
  }
 }catch(e){row.problem=String(e.stack??e);row.valid=false;throw e}
 finally{w?.close();row.endedAt=Date.now();appendFileSync(join(OUT,'calibrations.jsonl'),JSON.stringify(row)+'\n');console.log('354 calibration',id,row.valid?'ok':'INVALID','AX oracle',row.axOracleAvailable??false)}
}
function screenshotPath(descriptor){const url=typeof descriptor==='string'?descriptor:descriptor?.url;if(!url)return null;return url.startsWith('file:')?fileURLToPath(url):url}
async function observe(w,row,label,directory){
 const r=await rpc(w,'get_app_state',{includeScreenshot:true,outputDirectory:directory});
 const ax=values(r.raw),available=!r.error&&ax.some(n=>typeof n.value==='string');
 row[label]=clean(r);row[label+'Values']=ax;row[label+'Timings']=r.raw.result?.timings??null;
 row[label+'Screenshot']=r.raw.result?.screenshot??null;row[label+'ScreenshotPath']=screenshotPath(row[label+'Screenshot']);
 if(label==='state')row.stateContains=available?ax.some(n=>n.value?.includes(row.text)):null;
 else{row.screenshotAXContains=available?ax.some(n=>n.value?.includes(row.text)):null;row.screenshotPath=row[label+'ScreenshotPath']}
 if(r.error||!available){const error=r.error??'observation has no readable AX text values';(row.observationErrors??=[]).push({label,error});console.error('354 observation unavailable',row.id,label,JSON.stringify(error))}
}
async function nativeSample(delay,returnedAt){await sleep(returnedAt+delay-Date.now());const requestedAt=Date.now(),s=await nativeState();return {delay,returnedAt,requestedAt,...s,actualDelayMs:s.at-returnedAt}}
function ocr(path){
 const startedAt=Date.now();if(!path||!OCR)return {startedAt,endedAt:Date.now(),error:!path?'no screenshot path':'OCR executable unavailable'};
 const r=sh(OCR,[path]);let parsed;try{parsed=JSON.parse(r.stdout)}catch{parsed={error:'invalid OCR output',stderr:r.stderr,exitCode:r.status}}
 return {path,startedAt,endedAt:Date.now(),durationMs:Date.now()-startedAt,...parsed};
}
async function clickThenSelect(w,row){
 const shot=await rpc(w,'get_app_state',{includeScreenshot:true,outputDirectory:join(OUT,'click-order-setup')});
 row.clickObservation=clean(shot);row.clickObservationScreenshot=shot.raw.result?.screenshot??null;
 if(shot.error)throw Error('click-order observation '+JSON.stringify(shot.error));
 const sky=shot.raw.result,field=sky.nodes.find(n=>n.role==='AXTextArea'&&n.frame&&/Draft control/.test([n.title,n.description,n.placeholder].join(' ')))??sky.nodes.find(n=>n.role==='AXTextArea'&&n.frame);
 if(!field)throw Error('click-order textarea missing');
 const f=sky.window.frame,scale=sky.screenshot.width/f.width;
 row.clickIntent={caretOffset:3,point:{x:field.frame.x+35,y:field.frame.y+20},coordinateSource:'fixture monospace textarea AX frame +35,+20'};
 row.click=clean(await rpc(w,'click',{x:Math.round((row.clickIntent.point.x-f.x)*scale),y:Math.round((row.clickIntent.point.y-f.y)*scale)}));
 if(row.click.error)throw Error('measured click-order click refused/failed '+JSON.stringify(row.click.error));
 row.scriptSelection=await command({op:'select-all',id:row.id});
 row.scriptIntent={selection:[0,SEED.length],expectedFinal:row.text,meaning:'fixture script intent, not proof that the click caret or selection was delivered'};
 row.clickToScriptGapMs=row.scriptSelection.rpcStartedAt-row.click.endedAt;
}
async function cell({part,editor,key,mode,rep,length=30,sameRPC=false,foreground=false,scene='normal'}){
 const clickOrder=part==='click-order',text=sentence(length),id=[part,editor,scene,clickOrder?'no-key':key,mode,length,sameRPC?'one':'two',foreground?'front':'behind',rep].join('/');
 if(skipIds.has(id)){skippedCompletedCells++;return}
 budget();const row={id,part,editor,scene,keyName:clickOrder?null:key,mode,rep,length,sameRPC,foreground,text,effectPredicatePreSatisfied:scene==='already-selected',startedAt:Date.now()};let w,stage='setup',sampling;
 try{
  const calibration=clickOrder?null:calibrations.get(calibrationKey(editor,key,foreground));
  if(!clickOrder&&!calibration?.valid)throw Error('required calibration unavailable');
  row.calibrationId=calibration?.id??null;row.expectedSource=clickOrder?'script-intent':'calibrated-key-effect';
  row.expected=expectation(clickOrder?{text:SEED,selection:[0,SEED.length]}:calibration.effect,text);row.axOracleAvailable=calibration?.axOracleAvailable??null;
  const options={spike354Mode:mode,spike354Value:calibration?.axValue??null,spike354Range:calibration?.axRange??null};
  w=await connect();await prepare(w,{id,editor,key,scene},row);await settleSetup({key,scene,foreground},row);
  if(scene==='already-selected'){
   row.preSatisfiedAX=await focusedAX();
   row.effectPredicatePreSatisfied=calibration.axOracleAvailable&&row.preSatisfiedAX.oracleAvailable?sameEffect(row.preSatisfiedAX.state,{text:calibration.axValue,selection:calibration.axRange}):null;
   row.selectionAlreadyTrueInSetup=true;
  }
  // Last setup RPC: assert the real frontmost PID. The rate arm has no awaited RPC or pause after key return.
  row.beforeKeyForeground=await front(foreground?pid:coverPid,false);
  stage=clickOrder?'click':'key';
  if(clickOrder){
   await clickThenSelect(w,row);
  }else if(part==='partial'){
   row.key=clean(await rpc(w,'press_key',{key,spike354Mode:'baseline'}));
   if(row.key.error)throw Error('partial control key '+JSON.stringify(row.key.error));
   await sleep(500);
   const effect=native?await nativeState():await command({op:'read'}),ax=await focusedAX();
   row.priorKeyControl={kind:'settled-before-typing',settleMs:500,mode:'baseline',effect,ax,confirmed:sameEffect(effect,calibration.effect),axMatchesCalibration:calibration.axOracleAvailable&&ax.oracleAvailable?sameEffect(ax.state,{text:calibration.axValue,selection:calibration.axRange}):null};
   if(!row.priorKeyControl.confirmed)throw Error('partial phase prior key effect not settled/confirmed');
   // Deliberately no type retry: typed/combined differ here only in their post-text candidate.
  }else if(!sameRPC){
   row.key=clean(await rpc(w,'press_key',{key,...options}));
   if(row.key.error)throw Error('measured key '+JSON.stringify(row.key.error));
  }
  stage='type';const typed=await rpc(w,'type_text',{text,...options,...(sameRPC?{spike354PreKey:key}:{})});
  row.type=clean(typed);row.preKey=typed.raw.result?.preKey354??null;
  row.returnedAt=row.type.endedAt;row.keyToTypeGapMs=row.key?row.type.startedAt-row.key.endedAt:null;
  if(clickOrder)row.scriptToTypeGapMs=row.type.startedAt-row.scriptSelection.rpcReturnedAt;
  if(row.type.error)throw Error('measured type '+JSON.stringify(row.type.error));
  stage='sampling';
  const extendedSamples=part==='partial'||clickOrder,delays=extendedSamples?[0,250,1000,3000]:[0,500];
  if(native){
   // Send the first AX read immediately at type return, BEFORE any observation or screenshot.
   const requestedAt=Date.now(),s=await nativeState();row.samples=[{delay:0,returnedAt:row.returnedAt,requestedAt,...s,actualDelayMs:s.at-row.returnedAt}];
   sampling=(async()=>{for(const delay of delays.slice(1))row.samples.push(await nativeSample(delay,row.returnedAt));return row.samples})().then(samples=>({samples}),error=>({error}));
  }else{
   const sampleNo=send({op:'sample',returnedAt:row.returnedAt,delays});
   sampling=until(()=>{const ss=answers.filter(a=>a.cmd===sampleNo);return ss.length===delays.length?ss:false},10000).then(samples=>{answers=answers.filter(a=>a.cmd!==sampleNo);return {samples:samples.sort((a,b)=>a.delay-b.delay)}},error=>({error}));
  }
  await observe(w,row,'state',join(OUT,'state-shots'));
  await observe(w,row,'screenshot',join(OUT,'shots',id.replace(/[^a-z0-9]+/gi,'_')));
  const result=await sampling;if(result.error)throw result.error;row.samples=result.samples;
  if(!row.samples.every(readable))throw Error('unreadable timed sample');
  let last=row.samples.at(-1);
  if(!extendedSamples&&last.text!==row.expected.final){await sleep(row.returnedAt+3000-Date.now());last=native?await nativeSample(3000,row.returnedAt):await command({op:'read'});last={...last,delay:3000,returnedAt:row.returnedAt,actualDelayMs:last.at-row.returnedAt};row.samples.push(last)}
  if(!readable(last))throw Error('unreadable final sample');
  row.final=last.text;row.correct=row.final===row.expected.final;
  row.trace=[...(row.scriptSelection?.trace??[]),...row.samples.flatMap(s=>s.trace??[])].sort((a,b)=>a.at-b.at||(a.seq??0)-(b.seq??0));
  const first=row.samples[0],properPrefix=s=>s.text.length<row.expected.final.length&&row.expected.final.startsWith(s.text);
  row.firstSampleAt=first.at;row.firstSampleDelayMs=first.at-row.returnedAt;
  row.partialAtFirstSample=properPrefix(first);row.prefixLaterCompleted=properPrefix(first)&&row.correct;
  row.permanentPrefixDeficit=!row.correct&&properPrefix(last);
  row.finalClassification=row.correct?'exact':row.permanentPrefixDeficit?'proper-prefix-deficit':'transformation-or-corruption';
  row.confirmed=typeof row.type.probe?.confirmed==='boolean'?row.type.probe.confirmed:null;
  row.keyConfirmed=typeof row.key?.probe?.confirmed==='boolean'?row.key.probe.confirmed:null;
  row.wouldRefuseKey=row.key?.probe?.status==='keyUnconfirmed';row.wouldRefuseType=row.type.probe?.status==='typeUnconfirmed';
  row.valid=true;
  if(part==='partial'){
   // OCR runs only AFTER all timed (including 3000ms) samples. It measures visible pixels, not delivery.
   row.pixelEvidence={classification:'visibility-only',offscreenTextPossible:length===500,safariMayBeBlank:KIND==='safari',state:ocr(row.stateScreenshotPath),screenshot:ocr(row.screenshotPath)};
  }
 }catch(e){row.valid=false;row.setupFailure=stage==='setup'||(part==='partial'&&stage==='key');row.failureStage=stage;row.problem=String(e.stack??e).slice(0,3000)}
 finally{if(sampling)await sampling;w?.close();row.endedAt=Date.now();save(row)}
 if(rowCount<=20&&first20SetupFailures>=3)throw Error('aborting invalid coverage: at least 3 setup failures within first 20 measurement cells');
}
try{
 if(native){writeFileSync(nativeDocument,SEED);sh('open',['-a','TextEdit',nativeDocument]);await sleep(1500);pid=+(sh('pgrep',['-x','TextEdit']).stdout.trim().split('\n')[0]);coverPid=+(sh('pgrep',['-x','Finder']).stdout.trim().split('\n')[0]);placePid(pid,WIN);await front(pid)}
 else{
  meta.version=version(KIND);browser=await launch(KIND,URL,join(OUT,'profile'),WIN);pid=browser.pid;
  await until(()=>answers.some(a=>a.op==='ready'),30000);await sleep(KIND==='cft'?Math.max(0,browser.launchedAt+22000-Date.now()):1500);placePid(pid,WIN);
  const doc=join(OUT,'cover.txt');writeFileSync(doc,'The probe cover.');sh('open',['-a','TextEdit',doc]);await sleep(1000);coverPid=+(sh('pgrep',['-x','TextEdit']).stdout.trim().split('\n')[0]);placePid(coverPid,{x:0,y:40,w:380,h:300});
  const w=await connect();for(let i=0;i<2;i++){await rpc(w,'get_app_state',{includeScreenshot:false});await sleep(1200)}w.close();
 }
 meta.pid=pid;meta.coverPid=coverPid;writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));
 // Calibrations are controls, not measurement repetitions; failures abort rather than invent an effect oracle.
 for(const editor of editors){for(const key of (PHASE==='partial'?['cmd+a']:keys))await calibrate(editor,key);if(PHASE!=='rate')await calibrate(editor,'cmd+a',true)}
 if(PHASE!=='partial')for(let rep=1;rep<=REPS;rep++)for(const editor of editors){
  for(const key of keys)for(const mode of modes)await cell({part:'rate',editor,key,mode,rep});
  // A matching state cannot acknowledge a key whose effect was already true before posting.
  for(const mode of ['baseline','key-effect','combined'])await cell({part:'rate',editor,key:'cmd+a',mode,rep,scene:'already-selected'});
 }
 if(PHASE!=='rate'){
  for(let rep=1;rep<=REPS;rep++)for(const editor of editors)for(const length of [30,120,500])for(const mode of ['baseline','typed','combined'])await cell({part:'partial',editor,key:'cmd+a',mode,rep,length});
  for(let rep=1;rep<=REPS;rep++)for(const editor of editors){await cell({part:'mechanism',editor,key:'cmd+a',mode:'baseline',rep,sameRPC:true});await cell({part:'mechanism',editor,key:'cmd+a',mode:'baseline',rep,foreground:true})}
 }
 if(!native&&PHASE==='all'&&editors.includes('textarea'))for(let rep=1;rep<=10;rep++)await cell({part:'click-order',editor:'textarea',key:'cmd+a',mode:'baseline',rep,foreground:true,scene:'click-then-script-select'});
}catch(e){meta.failure=String(e.stack??e);console.error(meta.failure);process.exitCode=1}
finally{meta.finishedAt=Date.now();meta.measuredCells=rowCount;meta.validRows=validRows;meta.skippedCompletedCells=skippedCompletedCells;writeFileSync(join(OUT,'config.json'),JSON.stringify(meta,null,2));engine.kill('SIGTERM');side.kill('SIGTERM');if(browser){try{process.kill(browser.pid,'SIGTERM')}catch{}}server.closeAllConnections();server.close();}
