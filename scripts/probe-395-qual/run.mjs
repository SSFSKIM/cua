// Hosted-only #395 qualification driver. Disposable experiment kit, never product code.
//   PROBE395_PHASE=stock|audit node run.mjs <tool> <out> <mainSource> <mainEngine> <fixSource> <fixEngine> [reps]
// tool: the compiled scripts/probe-395/marker.swift binary (cover, foreground witness, supplemental marker walk).
// mainSource/fixSource: the two product trees; mainEngine/fixEngine: their native engine builds. Each head gets its own
// engine process, socket and temporary HOME, and types through its own source's real createSkyService, createService and
// fileStore, into one Safari, one fixture page and one owned cover. reps is 1..20 (default 20).
// Phase: `stock` runs unmodified builds (outcome and privacy evidence); `audit` runs scratch-instrumented builds
// (schedule evidence only, never outcome evidence). Run them one after the other, each with its own output directory.
//
// Matrix (per repetition, 8 paired units, each typed once per head, head order alternating per unit and repetition):
//   page small|large x kind plain|secretShort|secretLong into the same normal input, plus kind secure on both pages into
//   an input parsed as type=password (never type-switched). Every cell starts from the same 29-unit seed and a caret at 3.
// Expected: main small confirms, main large is typeUnconfirmed, fix confirms on both pages, secure is typeUnconfirmed with
// reason `secure` on both heads, except main's large secure control: typeUnconfirmed with reason `noFocusedElement` (its DOM content is recorded, not required). The scores are strict: outcome, reason, DOM equality, no wrong success.
//
// Privacy: only synthetic values, generated in memory. Rows hold fixed labels, booleans, counts, timings and the audit
// module's scrubbed row: never a raw engine reply, a typed or compared value, a secret length or offset, marker bytes, or
// stderr. A final attestation scans the output directory.
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdirSync,mkdtempSync,writeFileSync,appendFileSync,rmSync,statSync,readFileSync,readdirSync,copyFileSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';
import {launch,placePid,version} from '../probe-316/browser.mjs';
import {createFixture,FixtureLost} from '../probe-354-fences/fixture.mjs';
import {resolveBrowserTarget} from '../probe-354-fences/ab-secret.mjs';
import {createAuditCapture} from './audit-capture.mjs';
import {digest} from './audit-scan.mjs';
import {page} from './fixture.mjs';

// ---- the matrix (pure) ----------------------------------------------------------------------------------------------
export const HEADS=Object.freeze(['main','fix']);
export const PAGES=Object.freeze(['small','large']);
export const KINDS=Object.freeze(['plain','secretShort','secretLong','secure']);
// Typed text lengths are design parameters; plain and secretShort share one so their field geometry matches.
export const LENGTH=Object.freeze({plain:32,secretShort:32,secretLong:128,secure:32});
export const SEED='Old draft sentence goes here.',CARET=3,LARGE_NODES=1600;
// A unit is a (page, kind) measured once per head per repetition. The secure control runs on both pages.
export const UNITS=Object.freeze([['small','plain'],['small','secretShort'],['small','secretLong'],['large','plain'],['large','secretShort'],['large','secretLong'],['small','secure'],['large','secure']].map(u=>Object.freeze(u)));
export function mulberry32(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function shuffle(list,random){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
export const cellId=(rep,head,page,kind)=>[head,page,kind,'r'+String(rep).padStart(2,'0')].join('/');
// The audit tag is the id with `/` as `-`; audit-capture reads the repetition from a trailing `-rNN`/`/rNN`.
export const tagOf=id=>id.replaceAll('/','-');
// One round per repetition: the units in a seeded order; within a unit the two heads alternate (balanced over repetitions).
export function plan({reps,seed,passwordLiteral=false}){
 if(!Number.isInteger(reps)||reps<1||reps>(passwordLiteral?40:20))throw Error('invalid repetitions');
 const random=mulberry32(seed),ids=new Set();
 const units=UNITS.map((_,i)=>i).filter(i=>!passwordLiteral||UNITS[i].join('/')==='large/secure');
 const rounds=Array.from({length:reps},(_,i)=>{
  const rep=i+1,out=[];
  for(const ui of shuffle(units,random)){
   const [pg,kind]=UNITS[ui],order=(rep+(passwordLiteral?0:ui))%2?[...HEADS]:[...HEADS].reverse();
   order.forEach((head,position)=>{
    const id=cellId(rep,head,pg,kind);if(ids.has(id))throw Error('duplicate cell');ids.add(id);
    const expected=expectationFor(head,pg,kind);
    if(passwordLiteral)expected.domRequired=true;
    out.push({id,tag:tagOf(id),part:'main',rep,head,page:pg,kind,unit:pg+'/'+kind,pairKey:rep+'/'+pg+'/'+kind,position,expected});
   });
  }
  return out;
 });
 return rounds;
}
// What each cell should do. `firm` marks the expectations the qualification rests on.
// `domRequired:false` records the page's content without requiring it (main's large secure control, whose engine answer
// is noFocusedElement: whether it keyed is not part of the contract).
export function expectationFor(head,pg,kind){
 if(kind==='secure'){
  if(head==='main'&&pg==='large')return {outcome:'unconfirmed',reason:'noFocusedElement',firm:true,domRequired:false};
  return {outcome:'unconfirmed',reason:'secure',firm:true};
 }
 if(head==='main'&&pg==='large')return {outcome:'unconfirmed',reason:null,firm:true};
 return {outcome:'ok',reason:null,firm:true};
}
// The engine's own answer to type_text, by label.
// A success counts as `ok` only when the engine's own typeReadback says confirmed; a bare result is `okUnconfirmedMeta`.
export function outcomeOf(raw,readback=null){
 if(raw?.error)return raw.error.errorName==='typeUnconfirmed'?'unconfirmed':'error';
 if(!raw||typeof raw!=='object'||!Object.hasOwn(raw,'result'))return 'none';
 return confirmedOf(readback)===true?'ok':'okUnconfirmedMeta';
}
// The record's `confirmed` boolean, searched a few levels deep, else null.
export function confirmedOf(record,depth=0){
 if(record===null||typeof record!=='object'||depth>3)return null;
 if(typeof record.confirmed==='boolean')return record.confirmed;
 for(const v of Object.values(record)){const r=confirmedOf(v,depth+1);if(r!==null)return r}
 return null;
}
const REASON=/^[a-z][A-Za-z0-9_-]{0,31}$/;
// The reason a typeReadback record gives, as a label, or null. The record is searched a few levels deep for a `reason`.
export function reasonOf(record,depth=0){
 if(record===null||typeof record!=='object'||depth>3)return null;
 if(typeof record.reason==='string'&&REASON.test(record.reason))return record.reason;
 for(const v of Object.values(record)){const r=reasonOf(v,depth+1);if(r)return r}
 return null;
}
// Strict row score. `domEqual` is the page's own exact content, caret and input-event check; a wrong success is a success claim
// over a page that does not hold the typed text. `confirmed` is the engine's own (raw) readback, `forwarded` the one sky
// forwarded in the response meta, `sky` whether sky returned ('ok') or threw. A positive needs a successful sky and both
// confirmations true; a refusal needs both explicitly false. Two that disagree, an error with a confirmation true, or any
// other `conflict` the caller found (a reason that differs) is never strict, and over a mismatching page is a wrong success.
export function scoreRow({expected,outcome,reason,confirmed=null,forwarded=null,sky=null,conflict=false,domEqual,domKnown=true,harnessValid}){
 const outcomeMatches=outcome===expected.outcome,reasonMatches=expected.reason===null||reason===expected.reason;
 const claimsSuccess=outcome==='ok'||confirmed===true||forwarded===true;
 const disagree=conflict===true||(confirmed!==null&&forwarded!==null&&confirmed!==forwarded)||(outcome!=='ok'&&claimsSuccess);
 // A page that was never read cannot make a success wrong; the row is simply not strict.
 const wrongSuccess=domKnown&&claimsSuccess&&!domEqual,falseUnconfirmed=outcome==='unconfirmed'&&expected.outcome==='ok',falseConfirm=outcome==='ok'&&expected.outcome==='unconfirmed';
 const confirmationOk=expected.outcome==='ok'?sky==='ok'&&confirmed===true&&forwarded===true:confirmed===false&&forwarded===false;
 return {outcomeMatches,reasonMatches,domEqual,wrongSuccess,falseUnconfirmed,falseConfirm,confirmationOk,conflict:disagree,
  strict:harnessValid===true&&domKnown&&outcomeMatches&&reasonMatches&&confirmationOk&&!disagree&&(domEqual===true||expected.domRequired===false)&&!wrongSuccess};
}
const median=a=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?s[s.length>>1]:null};
export function summarize(rows,{phase=null,planned=null}={}){
 const cells=rows.filter(r=>r.recordKind==='cell'),groups={},pairs={};
 for(const r of cells){
  const g=groups[r.head+'/'+r.page+'/'+r.kind]??={head:r.head,page:r.page,kind:r.kind,expected:r.expected,n:0,harnessValid:0,axValid:0,strict:0,outcomeMatches:0,domEqual:0,wrongSuccess:0,falseUnconfirmed:0,falseConfirm:0,outcomes:{},reasons:{},durations:[]};
  g.n++;if(r.harnessValid)g.harnessValid++;if(r.supplemental?.axValid===true)g.axValid++;
  const s=r.score;
  if(s){if(s.strict)g.strict++;if(s.outcomeMatches)g.outcomeMatches++;if(s.domEqual)g.domEqual++;if(s.wrongSuccess)g.wrongSuccess++;if(s.falseUnconfirmed)g.falseUnconfirmed++;if(s.falseConfirm)g.falseConfirm++}
  g.outcomes[r.actual?.outcome??'none']=(g.outcomes[r.actual?.outcome??'none']??0)+1;
  if(r.actual?.reason)g.reasons[r.actual.reason]=(g.reasons[r.actual.reason]??0)+1;
  if(Number.isFinite(r.typeTiming?.durationMs))g.durations.push(r.typeTiming.durationMs);
  const p=pairs[r.unit]??={unit:r.unit,reps:{}};(p.reps[r.rep]??={})[r.head]=r.score?.strict===true;
 }
 const out=Object.values(groups).map(({durations,...g})=>({...g,medianDurationMs:median(durations)}));
 const pairTable=Object.values(pairs).map(p=>{
  const v=Object.values(p.reps);
  return {unit:p.unit,pairs:v.length,bothStrict:v.filter(x=>x.main===true&&x.fix===true).length,mainStrict:v.filter(x=>x.main===true).length,fixStrict:v.filter(x=>x.fix===true).length};
 });
 const firm=cells.filter(r=>r.expected?.firm);
 return {phase,planned,cells:cells.length,harnessValid:cells.filter(r=>r.harnessValid).length,strict:cells.filter(r=>r.score?.strict).length,
  firmCells:firm.length,firmStrict:firm.filter(r=>r.score?.strict).length,wrongSuccess:cells.filter(r=>r.score?.wrongSuccess).length,
  fixCells:cells.filter(r=>r.head==='fix').length,fixStrict:cells.filter(r=>r.head==='fix'&&r.score?.strict).length,
  // Outcome qualification rests on stock rows only; audit rows are schedule evidence.
  outcomeEvidence:phase==='stock',groups:out,pairs:pairTable};
}
// Audit gates from the audit module's summary: every gate must say pass (an unknown gate is not a pass).
export function gateVerdicts(a){
 const out=[];
 if(a&&typeof a==='object'&&a.error===true)out.push(['audit-summary','fail']);
 if(a?.ok===false)out.push(['audit-ok','fail']);
 const gates=a?.gates;
 if(gates&&typeof gates==='object')for(const [k,v] of Object.entries(gates)){
  const verdict=typeof v==='string'?v:typeof v==='boolean'?(v?'pass':'fail'):v?.status??(v?.pass===true?'pass':v?.pass===false?'fail':v?.ok===true?'pass':v?.ok===false?'fail':'unknown');
  out.push([k,verdict]);
 }
 return out;
}
// The qualification contracts, apart from coverage. Stock rows carry the outcome contracts; audit rows the schedule gates; both
// phases need every harness-valid cell's raw privacy capture (`captureMissing` counts those without one), the audit rows ok and
// the capture's cross-row privacy gate (which includes stderr that arrived after the last cell) clean.
export function contractsOf(summary,{phase,auditFailures=0,captureMissing=0}){
 const secure=summary.groups.filter(g=>g.kind==='secure'),c={wrongSuccessZero:summary.wrongSuccess===0};
 const gates=gateVerdicts(summary.audit),gate=name=>gates.find(([k])=>k===name)?.[1];
 if(phase==='stock'){
  c.firmAllStrict=summary.firmCells>0&&summary.firmStrict===summary.firmCells;
  c.secureAllStrict=secure.length>0&&secure.every(g=>!g.expected.firm||g.strict===g.n);
 }else c.auditGatesPass=gates.length>0&&gates.every(([,v])=>v==='pass');
 c.rawCaptureComplete=captureMissing===0&&summary.audit!==undefined&&summary.audit?.error!==true;
 c.auditRowsOk=auditFailures===0&&gate('rowsOk')==='pass';
 c.auditPrivacyClean=gate('privacyClean')==='pass';
 return {...c,ok:Object.values(c).every(Boolean)};
}
export function parseCli(argv,env){
 const [tool,out,mainSource,mainEngine,fixSource,fixEngine,repsArg]=argv;
 if(!tool||!out||!mainSource||!mainEngine||!fixSource||!fixEngine)throw new Error('usage: run.mjs tool out mainSource mainEngine fixSource fixEngine [reps]');
 const reps=repsArg===undefined?20:Number(repsArg),passwordLiteral=env.PROBE395_PASSWORD_LITERAL==='1';
 if(!Number.isInteger(reps)||reps<1||reps>(passwordLiteral?40:20))throw new Error('invalid repetitions');
 const phase=env.PROBE395_PHASE??'stock';
 if(phase!=='stock'&&phase!=='audit')throw new Error('PROBE395_PHASE must be stock or audit');
 if(passwordLiteral&&phase!=='stock')throw new Error('literal password diagnostic requires stock engines');
 return {tool:resolve(tool),outDir:resolve(out),heads:{main:{source:resolve(mainSource),engine:resolve(mainEngine)},fix:{source:resolve(fixSource),engine:resolve(fixEngine)}},reps,phase,passwordLiteral};
}

// ---- synthetic values, the leak detector and scrubbing --------------------------------------------------------------
// Every synthetic value is registered as its 8-character windows (a window of only digits is skipped, so a timestamp cannot
// match). Any string about to be stored is checked against them; a hit is a privacy violation, not data.
const memo=new Map(),windows=new Set();
function addWindows(v){for(let i=0;i+8<=v.length;i++){const w=v.slice(i,i+8);if(/[a-f]/.test(w))windows.add(w)}}
const hexValue=n=>{for(;;){const v=randomBytes(Math.ceil(n/2)).toString('hex').slice(0,n);if((v.match(/[a-f]/g)??[]).length>=2)return v}};
addWindows(SEED);
// One value per kind and repetition, shared by the two heads of a pair, independent between kinds.
function valueFor(kind,rep){
 const key=kind+'/'+rep;
 if(!memo.has(key)){const v=hexValue(LENGTH[kind]);memo.set(key,v);addWindows(v)}
 return memo.get(key);
}
function leaks(s){for(let i=0;i+8<=s.length;i++)if(windows.has(s.slice(i,i+8)))return true;return false}
// A stored fixture state holds booleans and the filler's DOM counts only. Keydown, input-event and mutation counts stay in
// memory (the cell's checks read the raw state) and are stored as their comparisons.
const STATE_BOOLEANS=['exact','selectionOk','kindOk','focused','sameNode','fillerAboveField','inViewport','secureType','secureLoaded'],STATE_COUNTS=['fillerNodes','domNodes'];
const pick=s=>({...Object.fromEntries(STATE_BOOLEANS.map(k=>[k,typeof s?.[k]==='boolean'?s[k]:null])),...Object.fromEntries(STATE_COUNTS.map(k=>[k,Number.isSafeInteger(s?.[k])?s[k]:null])),
 noKeydowns:s?.keydowns===0,inputSeen:Number.isSafeInteger(s?.inputs)&&s.inputs>0,noTypeMutations:s?.typeMutations===0});
const TEXTLIKE=/^(text|value|values|selectedText|selected|excerpt|actual|expected|before|after|content|characters|string|raw|reply|stderr|message)$/i;
// Booleans, finite numbers, null and short printable strings pass; anything text-like or matching a synthetic value is withheld.
function scrub(v,tally,depth=0){
 if(v===null||typeof v==='boolean')return v;
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 if(typeof v==='string'){
  if(leaks(v)){tally.leaks++;return '[withheld]'}
  if(v.length>160||!/^[\x20-\x7e]*$/.test(v)){tally.withheld++;return '[withheld]'}
  return v;
 }
 if(depth>=9)return null;
 if(Array.isArray(v))return v.slice(0,64).map(x=>scrub(x,tally,depth+1));
 if(typeof v==='object'){
  const out={};
  for(const [k,x] of Object.entries(v).slice(0,96)){
   if(!/^[A-Za-z0-9_.:-]{1,64}$/.test(k)){tally.withheld++;continue}
   if(typeof x==='string'&&TEXTLIKE.test(k)){tally.withheld++;out[k]='[withheld]';continue}
   out[k]=scrub(x,tally,depth+1);
  }
  return out;
 }
 return null;
}
// The supplemental marker walk, reduced to classification and route-correctness labels: no endpoint, byte or offset field.
function supplementalOf(answer,tally){
 const route=answer?.route,w=answer?.walk;
 const keep={valid:answer?.valid===true&&!answer?.error,reason:typeof answer?.reason==='string'&&REASON.test(answer.reason.replaceAll(' ','-'))?answer.reason:null,
  correctTarget:answer?.correctTarget??null,wrongField:answer?.wrongField??null,targetRole:answer?.targetRole??null,targetClass:answer?.targetClass??null,
  witnesses:answer?.witnesses??null,webkitWitness:answer?.webkitWitness??null,ownerDeterminable:answer?.ownerDeterminable??null,
  route:route?{originClass:route.originClass??null,startMarker:route.startMarker??null,ms:route.ms??null,endpointMs:route.endpointMs??null}:null,
  walk:w?{reason:w.reason??null,correctTarget:w.correctTarget??null,nodes:w.nodes??null,ms:w.ms??null}:null,scopeMs:answer?.scopeMs??null};
 const out=scrub(keep,tally);
 // Same document, field found by its DOM id with the class this cell expects (the tool refuses the measure otherwise).
 out.axValid=keep.valid;
 return out;
}
// ---- the published audit row ----------------------------------------------------------------------------------------
// A fixed projection of the audit capture's row: only what is named here is ever written. Never the engine reply, the sky
// raw copies, the surfaces, a string of free text, a secret length, a key, input or event count, or an opaque byte run.
// The type-readback is published whole (the scanner already sanitized it; a concealed or secure record is cut to its allowed
// keys). A value that does not fit its slot is dropped and marks the row `withheld`, never published.
const TOKEN_STR=/^[A-Za-z][A-Za-z0-9_.:+@!\/-]{0,63}$/,SHAPE_STR=/^[A-Za-z0-9_+:@!| .\/-]*$/,CODE=/^[a-z][a-z0-9-]{0,39}$/,KEY_NAME=/^[A-Za-z0-9_.:+-]{1,64}$/;
const num=x=>Number.isFinite(x)?x:null,int=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const bool=x=>typeof x==='boolean'?x:null;
const renameKey=k=>FORBIDDEN_KEY.test(k)||FORBIDDEN_UNLESS_FLAG.test(k)?k+'Field':k;
const SECRET_READBACK={confirmed:'bool',reason:'reason',snapshotMs:'number',concealed:'true',secure:'true',keysUnconfirmed:'bool',stoppedBeforeKey:'bool'};
// Plain readbacks only: scalars of the fixed shapes, nested objects and complete arrays; anything else is dropped.
function publicTree(v,state,depth=0){
 if(v===null||v===undefined)return null;
 if(typeof v==='boolean')return v;
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 if(typeof v==='string'){
  if(v==='[plain quote withheld]')return v;
  if(TOKEN_STR.test(v)&&!leaks(v))return v;
  state.dirty=true;return null;
 }
 if(depth>=6){state.dirty=true;return null}
 if(Array.isArray(v))return v.map(x=>publicTree(x,state,depth+1));
 if(typeof v==='object'){
  const out={};
  for(const [k,x] of Object.entries(v)){
   if(!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k)||leaks(k)){state.dirty=true;continue}
   out[renameKey(k)]=publicTree(x,state,depth+1);
  }
  return out;
 }
 state.dirty=true;return null;
}
function readbackOf(rec,lane,state){
 if(rec===null||rec===undefined)return null;
 if(typeof rec!=='object'||Array.isArray(rec)){state.dirty=true;return null}
 if(lane==='plain')return publicTree(rec,state);
 const out={};
 for(const [k,x] of Object.entries(rec)){
  const rule=SECRET_READBACK[k];
  const ok=rule==='bool'?typeof x==='boolean':rule==='true'?x===true:rule==='number'?Number.isFinite(x):rule==='reason'?typeof x==='string'&&REASON.test(x)&&!leaks(x):false;
  if(ok)out[k]=x;else state.dirty=true;
 }
 return out;
}
function countMap(o,state,classes=false){
 const out={};
 for(const [k,v] of Object.entries(o??{})){
  if(KEY_NAME.test(k)&&!leaks(k)&&int(v)!==null)out[classes?k+'Reads':renameKey(k)]=v;else state.dirty=true;
 }
 return out;
}
// AX-only counts: calls, attempts and the attribute, class and marker tallies; never the event, write or action tallies.
const countersOf=(c,state)=>({calls:int(c?.calls),attempts:int(c?.attempts),byName:countMap(c?.byName,state),byClass:countMap(c?.byClass,state,true),markerByName:countMap(c?.markerByName,state),markerByKind:countMap(c?.markerByKind,state)});
const windowOf=w=>({calls:int(w?.calls),callMs:num(w?.callMs),maxCallMs:num(w?.maxCallMs),firstStartMs:num(w?.firstStartMs),lastEndMs:num(w?.lastEndMs)});
// An ordered shape (tokens of attribute names, aliases and outcomes joined by `|`) is published in full when short, and always
// as its hash; a longer one (a large page's walk) is published as the hash alone. Anything outside the token alphabet is withheld.
const SHAPE_FULL_MAX=1500;
const shapeFields=(v,state)=>{
 if(v===null||v===undefined)return {text:null,hash:null};
 if(typeof v!=='string'||!SHAPE_STR.test(v)||leaks(v)){state.dirty=true;return {text:null,hash:null}}
 return {text:v.length<=SHAPE_FULL_MAX?v:null,hash:digest(v)};
};
const nameList=(a,state)=>(Array.isArray(a)?a:[]).filter(n=>{const ok=typeof n==='string'&&KEY_NAME.test(n)&&!leaks(n);if(!ok)state.dirty=true;return ok});
const hash16=h=>typeof h==='string'&&/^[0-9a-f]{16}$/.test(h)?h:null;
function scheduleOf(sc,state){
 if(sc===null||sc===undefined)return null;
 if(typeof sc!=='object'){state.dirty=true;return null}
 const t=sc.timeline??{},pre=sc.preInput??{},post=sc.postInput??{};
 const phases={};
 for(const [name,list] of Object.entries(t.phases??{})){
  if(!KEY_NAME.test(name)||leaks(name)||!Array.isArray(list)){state.dirty=true;continue}
  phases[name]=list.map(p=>({startMs:num(p?.startMs),endMs:num(p?.endMs),durMs:num(p?.durMs),calls:int(p?.calls),callMs:num(p?.callMs)}));
 }
 const preShape=shapeFields(pre.shape,state),postShape=shapeFields(post.shape,state),wholeShape=shapeFields(sc.shape,state);
 return {complete:sc.complete===true,dropped:int(sc.dropped),aliasOverflow:int(sc.aliasOverflow),overlaps:int(sc.overlaps),boundaryProvenance:sc.boundaryProvenance==='known'?'known':'unknown',
  preInput:{available:pre.available===true,boundary:pre.boundary==='event'?'event':'none',shape:preShape.text,shapeHash:preShape.hash,hash:hash16(pre.exactHash),...countersOf(pre,state),timing:windowOf(pre.timing)},
  postInput:{shape:postShape.text,shapeHash:postShape.hash,...countersOf(post,state),timing:windowOf(post.timing)},
  shape:wholeShape.text,shapeHash:wholeShape.hash,strictHash:hash16(sc.strictHash),
  counters:countersOf(sc.counters,state),
  // Raw iteration count of each poll phase, in order (the audit module already keeps keyboard events out of the trace).
  pollCycleReps:(Array.isArray(sc.pollCycleReps)?sc.pollCycleReps:[]).map(n=>{const v=int(n);if(v===null)state.dirty=true;return v}),
  timeline:{spanMs:num(t.spanMs),overheadMs:num(t.overheadMs),firstEntryMs:num(t.firstEntryMs),preInputMs:num(t.preInputMs),
   classWindows:Object.fromEntries(Object.entries(t.classWindows??{}).filter(([k])=>KEY_NAME.test(k)).map(([k,w])=>[k+'Reads',windowOf(w)])),phases,
   markerAttempts:(Array.isArray(t.markerAttempts)?t.markerAttempts:[]).map(m=>({atMs:num(m?.atMs),durMs:num(m?.durMs),api:typeof m?.api==='string'&&/^[a-z+-]{1,4}$/.test(m.api)?m.api:null,alias:Number.isSafeInteger(m?.alias)?m.alias:null,names:nameList(m?.names,state),outcome:int(m?.outcome),preInput:bool(m?.preInput)})),markerAttemptsTruncated:t.markerAttemptsTruncated===true}};
}
// -> {row, publishable, withheld}.
export function publicAuditRow(a){
 const state={dirty:false};
 if(!a||typeof a!=='object'||typeof a.tag!=='string')return {row:{ok:false,privacy:{ok:false,codes:[]}},publishable:false,withheld:true};
 const priv=a.privacy??{},privacyOk=priv.ok===true&&!(Number(priv.violations)>0),stripped=a.engine===null||a.engine===undefined;
 const lane=['plain','secret','secure'].includes(a.lane)?a.lane:'secret',code=v=>typeof v==='string'&&CODE.test(v)?v:'other';
 const e=a.engine??{},token=v=>typeof v==='string'&&TOKEN_STR.test(v)&&!leaks(v)?v:null;
 const rt=a.routeTimings&&typeof a.routeTimings==='object'?Object.fromEntries(Object.entries(a.routeTimings).filter(([k,v])=>(/^[A-Za-z]{1,30}Ms$/.test(k)&&Number.isFinite(v))||((k==='inputRoute'||k==='route')&&token(v)!==null)).map(([k,v])=>[k,typeof v==='string'?v:v])):null;
 const row={mode:a.mode==='stock'?'stock':'audit',lane,ok:a.ok===true,failures:(Array.isArray(a.failures)?a.failures:[]).map(code),
  privacy:{ok:privacyOk,codes:Object.keys(priv.codes??{}).map(code)},
  engine:stripped?null:{outcome:['success','error'].includes(e.outcome)?e.outcome:null,errorName:token(e.errorName),errorCode:Number.isSafeInteger(e.errorCode)?e.errorCode:null},
  typeReadback:readbackOf(a.typeReadback,lane,state),skyTypeReadback:readbackOf(a.skyTypeReadback,lane,state),concealed:bool(a.typeReadbackConcealed),
  // The literal diagnostic only: whether the canonical wire meta named the keyed route (a boolean; the route itself is never kept).
  ...(typeof a.keyedRoute==='boolean'?{keyedRoute:a.keyedRoute}:{}),
  schedule:scheduleOf(a.schedule,state),
  audit354:a.audit354?{textReadAttempts:int(a.audit354.textReadAttempts),rangeReadAttempts:int(a.audit354.rangeReadAttempts),byAttribute:countMap(a.audit354.byAttribute,state)}:null,
  clocks:a.clocks?{rpcMs:num(a.clocks.rpcMs),routeWallMs:num(a.clocks.routeWallMs),auditSpanMs:num(a.clocks.auditSpanMs),checks:{auditWithinRpc:bool(a.clocks.checks?.auditWithinRpc),routeWithinRpc:bool(a.clocks.checks?.routeWithinRpc)}}:null,
  routeTimings:rt,typeTextOnce:a.requests?.typeText===1};
 const withheld=state.dirty||stripped;
 return {row,publishable:privacyOk&&!withheld,withheld};
}
// Keys the attestation forbids by name (a class of reads called `text`) are renamed in the cross-row summary.
export function renameKeys(v){
 if(Array.isArray(v))return v.map(renameKeys);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[renameKey(k),renameKeys(x)]));
 return v;
}
// The labelled actual of a cell: the engine's raw readback is canonical; the forwarded one (sky's response meta) must agree.
export function actualOf({outcome,engineRecord,forwarded}){
 const rawReason=label(reasonOf(engineRecord),REASON),fwdReason=label(reasonOf(forwarded),REASON);
 return {outcome:outcome??null,reason:rawReason??fwdReason,confirmed:confirmedOf(engineRecord),forwarded:confirmedOf(forwarded),conflict:rawReason!==null&&fwdReason!==null&&rawReason!==fwdReason};
}

const FORBIDDEN_KEY=/^(raw|reply|rawReply|stderr|stdout|seed|text|value|values|excerpt|offset|offsets|bytes|markerBytes)$/i,FORBIDDEN_UNLESS_FLAG=/^(secret|secrets|password)$/i;
// Output attestation: no synthetic-value window in any file, no forbidden key, no long string.
export function attestText(text){
 let leakHits=0,forbidden=0,long=0;
 const walk=v=>{
  if(typeof v==='string'){if(leaks(v))leakHits++;if(v.length>2000)long++;return}
  if(Array.isArray(v)){v.forEach(walk);return}
  if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(FORBIDDEN_KEY.test(k)||(FORBIDDEN_UNLESS_FLAG.test(k)&&typeof x!=='boolean'&&x!==null))forbidden++;if(leaks(k))leakHits++;walk(x)}
 };
 for(const line of text.split('\n')){if(!line.trim())continue;try{walk(JSON.parse(line))}catch{if(leaks(line))leakHits++}}
 return {leakHits,forbidden,long};
}
// The fixed publication verdict, written into attestation.json: `publishable` only if the scan found no leak, forbidden key or
// long string, no row recorded a privacy violation or withheld a value, and the raw capture's own privacy gate is clean and
// complete. `blockers` are fixed codes, so an unpublishable phase still exports a diagnostic with no raw content.
export function publication(scan,{privacyViolations=0,auditWithheld=0,contracts={}}={}){
 const blockers=[];
 if(scan.leakHits>0)blockers.push('leak');
 if(scan.forbidden>0)blockers.push('forbidden-key');
 if(scan.long>0)blockers.push('long-string');
 if(privacyViolations>0)blockers.push('privacy-violation');
 if(auditWithheld>0)blockers.push('audit-withheld');
 if(contracts.rawCaptureComplete!==true)blockers.push('capture-incomplete');
 if(contracts.auditPrivacyClean!==true)blockers.push('audit-privacy');
 return {...scan,publishable:blockers.length===0&&scan.ok===true,blockers};
}
export function attestDir(dir){
 const files=readdirSync(dir).filter(f=>/\.(json|jsonl|md|txt)$/.test(f)&&f!=='attestation.json'),total={leakHits:0,forbidden:0,long:0};
 for(const f of files){const t=readFileSync(join(dir,f),'utf8'),a=attestText(f.endsWith('.json')?JSON.stringify(JSON.parse(t))+'\n':t);total.leakHits+=a.leakHits;total.forbidden+=a.forbidden;total.long+=a.long}
 return {files:files.length,...total,ok:total.leakHits===0&&total.forbidden===0&&total.long===0};
}

// ---- runtime --------------------------------------------------------------------------------------------------------
const SECRET_LABEL='PROBE395Q',BUDGET_MS=120*60000,SETUP_FAILURE_CAP=25,CONSECUTIVE_CAP=4,WIN={x:400,y:30,w:620,h:720};
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const COVER_PLIST=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>org.cua.probe395.cover</string>
<key>CFBundleName</key><string>Probe395 Cover</string>
<key>CFBundleExecutable</key><string>cover395</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`;
// Failures carry a stage, never a message: an engine or fixture message could carry a typed or compared value.
class Fail extends Error {}
class Abort extends Error {}
const ERROR_NAMES=['Fail','Abort','FixtureLost','Error','TypeError','RangeError','SyntaxError','ReferenceError'];
const errorName=e=>{const n=e?.constructor?.name;return ERROR_NAMES.includes(n)?n:'other'};
const errorCode=e=>typeof e?.code==='string'&&/^E[A-Z0-9]{2,20}$/.test(e.code)?e.code:null;
const exitLabel=(code,signal)=>({exitCode:Number.isSafeInteger(code)?code:null,signal:typeof signal==='string'&&/^SIG[A-Z0-9]{2,10}$/.test(signal)?signal:null});
const label=(v,re)=>typeof v==='string'&&re.test(v)&&!leaks(v)?v:null;
// A sky-level error is stored by one of the names sky admits, else `other`: never a free-form name or message.
const SKY_ERRORS=new Set(['typeUnconfirmed','concealedInputUnavailable','inputFailed','inputFailedUnentered','userIntervened','inputSourceChanged','activationFailed','windowMinimized','secretUnavailable','secretUnusable','unknownError']);
const skyErrorLabel=e=>{const n=e?.errorName??e?.code??e?.name;return SKY_ERRORS.has(n)?n:'other'};

// The engine child's whole environment: the head's temporary HOME and TMPDIR, its socket and a fixed minimum.
export function engineEnv({home,tmpdir:tmpDir,socket,from=process.env}){
 const keep={};for(const k of ['PATH','LANG','LC_ALL','USER','LOGNAME','__CF_USER_TEXT_ENCODING'])if(typeof from[k]==='string')keep[k]=from[k];
 return {...keep,HOME:home,TMPDIR:tmpDir,CUA_ENGINE_SOCKET:socket};
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
 const args=parseCli(process.argv.slice(2),process.env);
 if(process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw new Error('hosted runners only');
 for(const p of [args.tool,args.heads.main.engine,args.heads.fix.engine])if(!statSync(p).isFile())throw new Error('missing executable');
 for(const h of HEADS)if(!statSync(args.heads[h].source).isDirectory())throw new Error('missing source root');
 const {tool,outDir,reps,phase,passwordLiteral}=args,start=Date.now();
 mkdirSync(outDir,{recursive:true});
 const tmp=mkdtempSync(join(process.env.RUNNER_TEMP||tmpdir(),'q395-'));
 const audit=createAuditCapture({mode:phase});
 // Audit phase: each head's build provenance (the stdout JSON of audit-patch.mjs, which hooks applied) goes to the capture
 // before its first tag, from PROBE395_AUDIT_PATCH_MAIN / _FIX (paths). PROBE395_SECURE_PERMITTED, when set, is the JSON of
 // summarize's securePermitted option (marker attribute names permitted before input on a secure row); default none.
 if(phase==='audit')for(const name of HEADS){
  const file=process.env['PROBE395_AUDIT_PATCH_'+name.toUpperCase()];
  if(file)audit.setProvenance(name,JSON.parse(readFileSync(file,'utf8')));
 }
 const securePermitted=process.env.PROBE395_SECURE_PERMITTED?JSON.parse(process.env.PROBE395_SECURE_PERMITTED):null;

 // ---- one head: its own source modules, HOME, secret store and engine process ----------------------------------------
 const heads={};
 for(const name of HEADS){
  const {source,engine:enginePath}=args.heads[name],load=p=>import(pathToFileURL(join(source,p)).href);
  const [skyModule,serviceModule,storeModule,protocolModule]=await Promise.all([load('src/services/sky.mjs'),load('src/services/engine/service.mjs'),load('src/secrets/store.mjs'),load('src/services/engine/protocol.mjs')]);
  // The native engine takes an exclusive lock `engine.lock` in its socket's parent directory, so each head has its own short
  // socket directory (never the shared temp root). Each engine gets only the temporary HOME, a head-local TMPDIR and the
  // minimum of the runner's environment: nothing of the runner's secrets, tokens or configuration is inherited.
  const home=join(tmp,name,'home'),sockDir=join(tmp,name[0]),socket=join(sockDir,'e.sock'),env={HOME:home};
  mkdirSync(home,{recursive:true,mode:0o700});mkdirSync(sockDir,{recursive:true,mode:0o700});
  if(Buffer.byteLength(socket)>=103)throw new Error('socket path too long');
  const store=storeModule.fileStore({dir:storeModule.storeDir(env)});
  // stderr is piped and always drained, into the audit capture only; it is never kept here.
  const child=spawn(enginePath,[],{env:engineEnv({home,tmpdir:sockDir,socket}),cwd:sockDir,stdio:['ignore','ignore','pipe']});
  const closed=new Promise(ok=>child.once('close',()=>ok(true)));
  child.on('error',()=>{});child.stderr.on('data',d=>audit.stderr(name,d));child.stderr.on('error',()=>{});
  heads[name]={name,home,socket,env,store,child,closed,skyModule,serviceModule,protocolModule,target:null};
 }

 // ---- owned side processes ---------------------------------------------------------------------------------------
 const side=spawn(tool,[],{stdio:['pipe','pipe','pipe']}),waiters=[];
 side.on('error',()=>{});
 // Startup only: the tool's and the cover's boot stderr, before any synthetic value exists; kept as shape only.
 const startup={},boot={marker:'',cover:''};let bootOpen=true;
 const collect=(stream,key)=>{stream.on('data',d=>{if(bootOpen&&boot[key].length<4000)boot[key]+=d});stream.on('error',()=>{})};
 collect(side.stderr,'marker');
 side.on('exit',(code,signal)=>{startup.marker=exitLabel(code,signal)});
 let sideBroken=false;
 function breakSide(){sideBroken=true;for(const w of waiters.splice(0)){clearTimeout(w.timer);w.reject(new Abort())}}
 createInterface({input:side.stdout}).on('line',l=>{let r;try{r=JSON.parse(l)}catch{r={error:true}}const w=waiters.shift();if(w){clearTimeout(w.timer);w.resolve(r)}});
 side.on('exit',breakSide);side.stdin.on('error',()=>{});
 // One request, one answer line, in order. A late answer would be read as the next request's, so a timeout ends the run.
 const ask=(q,ms=20000)=>new Promise((resolveAsk,reject)=>{
  if(sideBroken){reject(new Abort());return}
  const w={resolve:resolveAsk,reject,timer:setTimeout(breakSide,ms)};waiters.push(w);side.stdin.write(JSON.stringify(q)+'\n');
 });
 let browser=null,coverProc=null,pid=0,coverPid=0,fixture=null,lastFront=null;
 async function front(target,activate=true){
  const r=await ask({op:'front',pid:target,activate,safariPid:pid});
  const lab=(v,set)=>set.includes(v)?v:'invalid';
  lastFront={target:target===coverPid?'cover':target===pid?'safari':'other',activate,accepted:typeof r.activationAccepted==='boolean'?r.activationAccepted:null,
   workspaceFront:lab(r.workspaceFront,['target','none','safari','other']),targetBundle:lab(r.targetBundle,['Cover','Safari','other','none']),targetTerminated:typeof r.targetTerminated==='boolean'?r.targetTerminated:null};
  if(r.error||r.frontmostPid!==target)throw new Fail();
 }
 // Activation can be accepted yet leave the browser front, so a bounded number of retries.
 async function frontCover(){for(let i=1;;i++){try{await front(coverPid);return i}catch(e){if(!(e instanceof Fail)||i>=4)throw e;await sleep(300)}}}
 const titles=async target=>{const r=await ask({op:'titles',pid:target});return Array.isArray(r.titles)?r.titles.filter(t=>typeof t==='string'):[]};
 async function connect(head){
  for(let i=0;i<200;i++){
   if(head.child.exitCode!==null||head.child.signalCode!==null)throw new Fail();
   try{const w=await Wire.connect(head.socket),r=await w.call('ping',{clientApiVersion:'cua-engine-1',desktop:'shared'});if(r.error){w.close();throw new Fail()}w.identity=r.result;return w}catch{await sleep(50)}
  }
  throw new Fail();
 }

 const planSeed=randomBytes(4).readUInt32LE(),rounds=plan({reps,seed:planSeed,passwordLiteral}),planned=rounds.reduce((n,r)=>n+r.length,0);
 let order=0,done=0,harnessValid=0,strict=0,invalid=0,setupFailures=0,consecutiveInvalid=0,privacyViolations=0,auditFailures=0,auditWithheld=0,storeCleanupFailures=0,aborted=null;
 const failureStages={},rows=[],auditRaw=[];
 const meta={kit:process.env.GITHUB_SHA??null,image:process.env.ImageVersion??null,phase,startedAt:start,reps,planSeed,planned,heads:HEADS,
  ...(passwordLiteral?{diagnostic:'literal-large-password',pages:['large'],kinds:['secure']}:{pages:PAGES,kinds:KINDS}),
  units:[...new Set(rounds[0].map(c=>c.unit))],sources:{main:process.env.MAIN_REF??null,fix:process.env.FIX_REF??null},
  design:{
   fixture:'one document, three inputs parsed in the markup: a plain text input (the normal field), a plain setup input and an input parsed as type=password; no input is type-switched (the page counts writes to the password input\'s type attribute)',
   heads:'each head has its own engine process, socket, temporary HOME and fileStore, and types through its own source\'s real createSkyService, createService and fileStore; both heads drive the same Safari, page and owned cover',
   order:'each repetition holds every unit once in a seeded order; within a unit the two heads run back to back and their order alternates by repetition and unit, so each head leads half of every unit\'s repetitions; the two heads of a pair type the same synthetic value',
   cell:'browser forward, DOM setup (secure cell: a plain setup input focused), cover forward (up to 4 activations), 250ms settle, DOM re-read, witness arm; secure cell only: under the verified cover the already-password-typed input takes its seed and focus; one real type_text (plain: the literal text; secretShort and secretLong: the secret handle with the value in the head\'s temporary fileStore; secure: the handle); cover check; DOM confirmation and exact scoring; then, for public plain rows only, the independent marker walk as supplemental evidence (never on a secret or secure row); DOM re-read; witness disarm. The AX identity of a concealed or secure row rests on the DOM node checks, the continuous foreground witness and, for secure, the engine own reason. The harness presses no key.',
   expected:'main small confirms, main large is typeUnconfirmed, fix confirms on both pages, secure is typeUnconfirmed with reason secure on both heads, except main\'s large secure control (reason noFocusedElement, DOM content recorded but not required)',
   scoring:'strict = harness valid, engine outcome as expected (a success needs a successful sky call and both the engine\'s raw and sky\'s forwarded typeReadback confirmed true, a refusal both explicitly false, a disagreement or an error with a confirmation is never strict, and any confirmed readback over a mismatching page is a wrong success), reason as expected (secure), DOM exactly the expected content with the expected caret and input events, no wrong success (engine success over a page without the text)',
   evidence:'stock rows are the outcome and privacy evidence; audit rows (scratch builds) are schedule evidence only',
   privacy:'synthetic values only, in memory; rows hold labels, booleans, counts, timings and a fixed projection of the audit row (publicAuditRow: the sanitized typeReadbacks, coded findings and the schedule, never the reply, surfaces, event or input counts or opaque bytes); each engine has its own socket directory and an environment of only a temporary HOME and TMPDIR; an attestation scans the output and sets publishable',
   abort:CONSECUTIVE_CAP+' consecutive harness-invalid cells, '+SETUP_FAILURE_CAP+' setup failures, a failed secret cleanup or witness cleanup, a stuck tool, or the 120 minute budget'}};
 // The password-literal diagnostic types public synthetic text, so its design differs from the qualification's in these respects.
 if(passwordLiteral)Object.assign(meta.design,{
  order:'each repetition holds one cell per head on the large page: the two heads run back to back and their order alternates by repetition, so each head leads half of the repetitions; the two heads of a pair type the same synthetic value',
  cell:'browser forward, DOM setup (a plain setup input focused), cover forward (up to 4 activations), 250ms settle, DOM re-read, witness arm; under the verified cover the already-password-typed input takes its seed and focus; exactly one real type_text with the synthetic text itself as a literal argument (no secret handle, no fileStore entry, no concealed flag); cover check; DOM confirmation and exact scoring on both heads; one DOM re-read; witness disarm. No supplemental marker walk. There are no ordinary warmups: exactly one type_text per head per repetition.',
  expected:'both heads: typeUnconfirmed with reason secure on the large page, except main (reason noFocusedElement); the DOM of both heads is scored against the full typed text and caret for every row',
  scoring:'strict = harness valid, engine outcome and reason as expected, the engine\'s raw and sky\'s forwarded typeReadback both explicitly false, and (the DOM being required on every row) the DOM exactly the seed with the text inserted at the caret, the caret after it and input events seen, with no wrong success. A row whose DOM is not exact is not strict; its only browser diagnostic is the mismatch category and size delta described under privacy.',
  evidence:'stock rows only: this diagnostic has no scratch (audit-patch) build and no schedule evidence; its stock capture is the privacy and outcome evidence',
  privacy:'the typed text is public synthetic data but every surface is still scanned in the secure lane and fails closed. Two known refusal-metadata fields are validated and discarded at their actual positions only (the raw reply\'s result or error meta, the thrown wrapper error\'s meta, sky\'s merged meta): the readback\'s pollMs and reads must be exactly 0, and entered (cua/entered in sky\'s meta) must be a safe integer from 0 to the typed length, which counts the synthetic units posted and is not the DOM or readback length. A nonzero poll or read, a malformed or out-of-range count, an actual/expected field length or any other unexpected field is a privacy violation. A DOM that is not exact is described only by a category (shorter, longer, reordered, same-size-different) and the size delta from one browser read taken after exact scoring (post-only: no earlier comparison exists); because the text is synthetic and the page a fixed fixture, that category and delta disclose nothing about any secret, and no value, substring, index or absolute length leaves the page.'});
 const budget=()=>{if(Date.now()-start>BUDGET_MS)throw new Abort()};
 const progress=last=>writeFileSync(join(outDir,'progress.json'),JSON.stringify({phase,planned,done,harnessValid,strict,invalid,setupFailures,consecutiveInvalid,privacyViolations,auditFailures,auditWithheld,storeCleanupFailures,failureStages,aborted:aborted!==null,elapsedMs:Date.now()-start,last},null,2));
 // Final defence: nothing is written that contains a synthetic value.
 function save(row){
  let line=JSON.stringify(row);
  if(leaks(line)){privacyViolations++;row.privacyViolation=true;line=JSON.stringify({recordKind:row.recordKind,id:row.id,tag:row.tag,head:row.head,harnessValid:false,failureStage:'privacy',privacyViolation:true})}
  appendFileSync(join(outDir,'rows.jsonl'),line+'\n');
 }
 async function witness(op){
  const r=await ask(op==='arm'?{op,pid,coverPid}:{op}),tally={leaks:0,withheld:0},result=scrub(r,tally);
  if(tally.leaks)privacyViolations++;
  return {valid:r?.valid===true&&!r?.error,reason:typeof r?.reason==='string'&&/^[A-Za-z0-9 _.:-]{1,60}$/.test(r.reason)&&!leaks(r.reason)?r.reason:null,result};
 }

 // ---- one cell ----------------------------------------------------------------------------------------------------
 function materialize(c){
  const secure=c.kind==='secure',text=valueFor(c.kind,c.rep);
  if(text.length!==LENGTH[c.kind]||SEED.length!==29)throw new Fail();
  const final=SEED.slice(0,CARET)+text+SEED.slice(CARET),caret=CARET+text.length,type=secure?'password':'text';
  return {secure,text,type,initial:{value:SEED,start:CARET,end:CARET,type},final:{value:final,start:caret,end:caret,type},
   // The secure cell's first state: an empty plain setup input.
   prep:{value:'',start:0,end:0,type:'text'},caret,length:final.length};
 }
 // The page is in the right shape: the node is the original one with the focus, the input kind is right, the page is the
 // size the cell names and the right inputs are shown. Content and caret are scored apart (`domEqual`).
 function shapeOk(s,c){
  const sized=c.page==='large'?s.fillerNodes===LARGE_NODES&&s.fillerAboveField===true:s.fillerNodes===0;
  const secureOk=c.kind==='secure'?s.secureLoaded===true&&s.typeMutations===0&&s.visibleFields===2:s.visibleFields===1;
  return s.kindOk===true&&s.focused===true&&s.sameNode===true&&sized&&secureOk;
 }
 const contentOk=s=>s.exact===true&&s.selectionOk===true;
 const readState=(expected,diagnose=false)=>fixture.command({op:'read',expected,diagnose},6000);
 const conceal=c=>!passwordLiteral&&c.kind!=='plain';
 // Types the cell's text through the head's own production path. `rec` carries labels only.
 async function typeThrough(head,c,m,rec){
  const concealed=conceal(c);
  const respMeta={},content=[],logged=[];
  // Content items and console output are captured for the audit's privacy scan, never kept or written.
  const nodeRepl={env:head.env,setResponseMeta:x=>{if(x&&typeof x==='object')Object.assign(respMeta,x)},emitContentItem:item=>{content.push(item)},createElicitation:async q=>{if(q.meta?.tool_params?.app!==head.target.bundleIdentifier)throw new Fail();return {action:'accept'}}};
  const w=await connect(head);
  try{
   const client={identity:w.identity,async execute(method,a){
    const started=performance.now();
    // The audit capture's wire hook: the tag and the audit flags go on the engine's params only, never into sky's request.
    const wireArgs=audit.engineArgs(c.tag,method,a);
    if(method==='type_text')rec.sent++;
    const raw=await w.execute(method,wireArgs),engineMs=performance.now()-started;
    audit.engineReply(c.tag,method,raw);
    if(method==='type_text'){rec.replied++;rec.engineRecord=raw?.error?.meta?.typeReadback??raw?.result?.meta?.typeReadback??null;rec.outcome=outcomeOf(raw,rec.engineRecord)}
    if(method==='resolve_app'&&(raw.result?.pid!==pid||raw.result?.bundleIdentifier!==head.target.bundleIdentifier))throw new Fail();
    if(raw.error)throw head.protocolModule.serverError(raw.error);
    return {result:raw.result,engineMs};
   }};
   const native=head.serviceModule.createService({nodeRepl,client});
   const sky=head.skyModule.createSkyService({platform:'darwin',env:head.env,nodeRepl,secrets:head.store,loadVendor:async()=>native,setResponseMeta:x=>{if(x&&typeof x==='object')Object.assign(respMeta,x)}});
   let wrote=false;
   try{
    if(concealed){await head.store.write(SECRET_LABEL,m.text);wrote=true}
    const originalHome=process.env.HOME,originalConsole={};process.env.HOME=head.home;
    for(const k of ['log','warn','error','info','debug']){originalConsole[k]=console[k];console[k]=(...a)=>{logged.push(a)}}
    const startedAt=Date.now(),t0=performance.now();
    let rendered,error=null;
    try{rendered=await sky.handleRpc({type:'execute',method:'type_text',args:[{app:head.target.appPath,text:concealed?'{{secret:'+SECRET_LABEL+'}}':m.text}]})}
    catch(e){error=e}
    finally{Object.assign(console,originalConsole);if(originalHome===undefined)delete process.env.HOME;else process.env.HOME=originalHome}
    const durationMs=performance.now()-t0;
    // Labels of the sky-level end: threw or not, and the error's admitted name or code.
    rec.sky=error?'threw':'ok';
    if(error)rec.skyError=skyErrorLabel(error);
    audit.sky(c.tag,{rendered,error,meta:respMeta});
    audit.surface(c.tag,'content',content);audit.surface(c.tag,'console',logged);
    rec.forwarded=respMeta['cua/typeReadback']??null;
    return {startedAt,endedAt:Date.now(),durationMs};
   }finally{
    if(wrote){try{await head.store.remove(SECRET_LABEL);rec.cleanup='removed'}catch{rec.cleanup='failed'}}
   }
  }finally{w.close()}
 }
 async function cell(c,{warmup=false}={}){
  budget();
  const head=heads[c.head],m=materialize(c);
  const row={recordKind:warmup?'warmup':'cell',id:c.id,tag:c.tag,part:c.part,rep:c.rep,order:warmup?null:++order,head:c.head,page:c.page,kind:c.kind,unit:c.unit??null,pairKey:c.pairKey??null,position:c.position??null,
   expected:c.expected,large:c.page==='large',fixture:{},foreground:{},startedAt:Date.now()};
  let stage='setup',lost=false,abortErr=null,armed=false,cleanupFailed=false,auditOpen=false,auditRow=null;
  const rec={sent:0,replied:0,outcome:null,sky:null,skyError:null,cleanup:null,forwarded:null,engineRecord:null};
  try{
   await front(pid);row.foreground.browserForPreparation=true;
   const first=m.secure?m.prep:m.initial;
   const s0=await fixture.command({op:'setup',mode:m.secure?'secure':'text',nodes:c.page==='large'?LARGE_NODES:0,seed:m.initial.value,start:m.initial.start,end:m.initial.end,expected:first},8000);
   row.fixture.setup=pick(s0);
   if(!shapeOk(s0,c)||!contentOk(s0)||s0.inputs!==0||s0.keydowns!==0)throw new Fail();
   stage='settle';
   row.foreground.coverAttempts=await frontCover();row.foreground.coverForward=true;row.settleMs=250;await sleep(250);
   const s1=await readState(first);row.fixture.settled=pick(s1);
   if(!shapeOk(s1,c)||!contentOk(s1))throw new Fail();
   await front(coverPid,false);row.foreground.coverBeforeType=true;
   // The witness covers everything from here to the final checks; it is always disarmed again, below or in the cleanup.
   stage='arm';
   armed=true;row.witness={arm:await witness('arm'),armAttempts:1};
   while(!row.witness.arm.valid&&row.witness.armAttempts<3&&/^(cover-not-front|owner-not-cover)-at-arm$/.test(row.witness.arm.reason??'')&&row.witness.arm.result?.witnesses===0){
    await sleep(300);await frontCover();await front(coverPid,false);
    row.witness.armAttempts++;row.witness.arm=await witness('arm');
   }
   if(!row.witness.arm.valid)throw new Fail();
   if(m.secure){
    // Under the verified cover: the already-password-typed input takes its seed and the focus; its type is never written.
    stage='secure';
    const sc=await fixture.command({op:'secure',seed:m.initial.value,start:m.initial.start,end:m.initial.end,expected:m.initial},8000);row.fixture.secure=pick(sc);
    if(!shapeOk(sc,c)||!contentOk(sc)||sc.secureType!==true||sc.inputs!==0||sc.keydowns!==0)throw new Fail();
    await front(coverPid,false);row.foreground.coverAfterSecure=true;
    await sleep(250);
    const s1b=await readState(m.initial);row.fixture.secureSettled=pick(s1b);
    if(!shapeOk(s1b,c)||!contentOk(s1b)||s1b.secureType!==true)throw new Fail();
    await front(coverPid,false);row.foreground.coverAfterSecureSettle=true;
   }
   stage='type';
   // Every secret-lane value is known to the audit capture before anything is typed.
   audit.registerSecret(SEED,'seed');
   audit.registerSecret(m.text,c.kind==='plain'?'plain':'secret');
   audit.begin(c.tag,{head:c.head,page:c.page,kind:c.kind,length:m.text.length,rep:c.rep,secureField:m.secure,fieldLengths:[m.length],expectConcealed:conceal(c),literal:passwordLiteral});auditOpen=true;
   try{row.typeTiming=await typeThrough(head,c,m,rec)}finally{if(rec.cleanup==='failed')cleanupFailed=true}
   if(cleanupFailed)throw new Fail();
   if(rec.sent!==1||rec.replied!==1)throw new Fail();
   stage='after-type';
   await front(coverPid,false);row.foreground.coverAfterType=true;
   // Exact scoring first: the page's own content, caret and input events, polled until equal or 4 s.
   stage='confirm';
   const confirmStart=Date.now(),deadline=confirmStart+4000;let s2,polls=0;
   for(;;){
    polls++;s2=await readState(m.final);
    if(contentOk(s2)&&s2.inputs>0)break;
    if(Date.now()>=deadline)break;
    await sleep(25);
   }
   row.fixture.confirmed=pick(s2);row.fixture.confirmPolls=polls;row.fixture.confirmMs=Date.now()-confirmStart;
   row.dom={known:true,exact:s2.exact===true,caret:s2.selectionOk===true,inputEvents:s2.inputs>0,equal:contentOk(s2)&&s2.inputs>0};
   if(!shapeOk(s2,c))throw new Fail();
   row.engine={sent:rec.sent,replied:rec.replied,sky:rec.sky,skyError:rec.skyError,cleanup:rec.cleanup};
   row.actual=actualOf(rec);
   // A harness-valid row is scored below once the disarm has confirmed the background; the score is set provisionally here.
   // Supplemental only, after the exact scoring: the independent marker walk, reduced to labels.
   stage='measure';
   if(c.kind==='plain'){
    // Public literal rows only: the tool decodes non-secure endpoint bytes and runs secure string, count and index queries,
    // which never touch a secret or secure row (the candidate path forbids them).
    const nonce=fixture.fx.boundNonce;
    if(typeof nonce!=='string'||!nonce)throw new Fail();
    const measuredAt=Date.now(),answer=await ask({op:'measure',pid,coverPid,nonce,expectedCaret:m.caret,expectedSelectionEnd:m.caret,expectedLength:m.length,kind:'plain',large:c.page==='large'},60000);
    const tally={leaks:0,withheld:0};
    row.supplemental={roundTripMs:Date.now()-measuredAt,...supplementalOf(answer,tally)};
    if(tally.leaks){privacyViolations++;row.supplemental.privacyViolation=true}
   }else row.supplemental={skipped:'concealed'};
   stage='after-measure';
   // The tool must leave the page as it found it: same content and caret, no key or input event of its own.
   const s3=await readState(m.final,passwordLiteral&&s2.exact!==true);row.fixture.afterMeasure=pick(s3);
   if(!shapeOk(s3,c)||contentOk(s3)!==contentOk(s2)||s3.keydowns!==s2.keydowns||s3.inputs!==s2.inputs)throw new Fail();
   if(passwordLiteral&&s3.exact!==true&&Number.isSafeInteger(s3.mismatch?.sizeDelta)&&['shorter','longer','reordered','same-size-different'].includes(s3.mismatch.shape)){
    row.dom.mismatch={shape:s3.mismatch.shape,sizeDelta:s3.mismatch.sizeDelta};
   }
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
   row.setupFailure=stage==='setup'||stage==='settle'||stage==='arm'||lost;
   row.engine??={sent:rec.sent,replied:rec.replied,sky:rec.sky,skyError:rec.skyError,cleanup:rec.cleanup};
   row.actual??=actualOf(rec);
  }finally{
   if(armed){
    // Never leave the witness armed for the next attempt; a disarm that cannot be confirmed ends the run.
    try{const d=await witness('disarm');row.witness={...row.witness,cleanup:d}}catch{row.witnessCleanup='failed';abortErr??=new Abort()}
   }
   if(cleanupFailed){row.harnessValid=false;row.failureKind='cleanup';storeCleanupFailures++;abortErr??=new Abort()}
   // The audit row is awaited for every opened tag, whatever happened to the cell.
   if(auditOpen){
    try{
     auditRow=await audit.end(c.tag);
     if(!warmup)auditRaw.push(auditRow);
     let bad=false;
     try{audit.assertClean(auditRow)}catch{bad=true}
     const pub=publicAuditRow(auditRow);
     row.audit=pub.row;row.auditOk=auditRow?.ok===true;
     if(!pub.publishable&&!pub.withheld)bad=true;
     if(pub.withheld){row.auditWithheld=true;auditWithheld++}
     if(bad){privacyViolations++;row.privacyViolation=true}
     if(!row.auditOk)auditFailures++;
    }catch{row.auditOk=false;row.auditError=true;auditFailures++}
   }
   row.dom??={known:false,exact:false,caret:false,inputEvents:false,equal:false};
   row.actual??={outcome:null,reason:null,confirmed:null};
   row.score=scoreRow({expected:c.expected,outcome:row.actual.outcome,reason:row.actual.reason,confirmed:row.actual.confirmed,forwarded:row.actual.forwarded,conflict:row.actual.conflict,sky:rec.sky,domEqual:row.dom.equal,domKnown:row.dom.known,harnessValid:row.harnessValid===true});
   row.valid=row.harnessValid===true;row.endedAt=Date.now();
   if(lost){try{await fixture.bindVisible(()=>titles(pid),8000);row.rebound=true}catch{row.rebound=false}}
   save(row);if(!warmup)rows.push(row);
   console.log('395q',row.id,row.harnessValid?'ok':'stage '+row.failureStage,row.actual.outcome??'-',row.score.strict?'strict':'not-strict');
  }
  consecutiveInvalid=row.harnessValid?0:consecutiveInvalid+1;
  if(!warmup){
   // Counted before any abort is raised, so an aborted row is part of the totals.
   done++;
   if(row.harnessValid){harnessValid++}else{invalid++;if(row.setupFailure)setupFailures++;failureStages[row.failureStage]=(failureStages[row.failureStage]??0)+1}
   if(row.score.strict)strict++;
   progress(row.id);
  }
  if(abortErr)throw abortErr;
  if(consecutiveInvalid>=CONSECUTIVE_CAP||(!warmup&&setupFailures>=SETUP_FAILURE_CAP))throw new Abort();
 }

 // ---- run ---------------------------------------------------------------------------------------------------------
 let stage='fixture';
 const BOOT_LABELS={exception:/exception|uncaught/i,abort:/abort|fatal|assert/i,windowServer:/window ?server|CGS|connection/i,appKit:/appkit|NSApplication|nswindow/i,permission:/permission|not permitted|denied|trust/i,signature:/signature|code ?sign|quarantine|gatekeeper/i};
 const bootShape=t=>({lines:t.split('\n').filter(l=>l.trim()).length,matched:Object.keys(BOOT_LABELS).filter(k=>BOOT_LABELS[k].test(t))});
 try{
  fixture=await createFixture(page());
  meta.version=version('safari');
  stage='browser-launch';
  browser=await launch('safari',fixture.url,join(tmp,'profile'),WIN);pid=browser.pid;
  stage='ready';
  await fixture.waitReady(30000);await sleep(1500);
  stage='placement';
  placePid(pid,WIN);
  // Owned AppKit cover: a disposable .app bundle holding a copy of the tool, run in its own --cover mode.
  stage='cover-build';
  const bundle=join(tmp,'Probe395 Cover.app'),macos=join(bundle,'Contents','MacOS'),exe=join(macos,'cover395');
  mkdirSync(macos,{recursive:true});
  writeFileSync(join(bundle,'Contents','Info.plist'),COVER_PLIST);
  copyFileSync(tool,exe);chmodSync(exe,0o755);
  stage='cover-launch';
  coverProc=spawn(exe,['--cover'],{stdio:['ignore','pipe','pipe']});coverProc.on('error',e=>{startup.coverSpawnError=errorCode(e)??errorName(e)});
  collect(coverProc.stderr,'cover');coverProc.on('exit',(code,signal)=>{startup.cover=exitLabel(code,signal)});
  let text='';coverProc.stdout.on('data',d=>{text+=d});
  stage='cover-hello';
  for(let i=0;i<60&&!coverPid&&coverProc.exitCode===null&&coverProc.signalCode===null;i++){
   try{const v=JSON.parse(text.split('\n')[0]);if(v.pid===coverProc.pid)coverPid=v.pid}catch{}
   if(!coverPid)await sleep(250);
  }
  startup.coverHello=coverPid>0;
  if(!coverPid)throw new Fail();
  stage='cover-state';
  let state=null;
  for(let i=0;i<20;i++){
   state=await ask({op:'cover',pid:coverPid});
   if(state.bundleOk===true&&state.onScreen===true)break;
   await sleep(250);
  }
  stage='cover-check';
  startup.bundleOk=typeof state?.bundleOk==='boolean'?state.bundleOk:null;startup.onScreen=typeof state?.onScreen==='boolean'?state.onScreen:null;
  meta.coverWindow=startup.bundleOk===true&&startup.onScreen===true;
  if(!meta.coverWindow)throw new Fail();
  stage='bind';
  await front(pid);await fixture.bindVisible(()=>titles(pid),15000);
  stage='preflight';bootOpen=false;
  // Each head's engine resolves the same Safari, and observes it twice.
  for(const name of HEADS){
   const h=heads[name],w=await connect(h);
   try{
    const resolved=await resolveBrowserTarget({execute:(method,a)=>w.execute(method,a),pid,bundle:'com.apple.Safari'});
    if(!resolved.ok)throw new Fail();
    h.target=resolved.target;
    for(let i=0;i<2;i++){await w.execute('get_app_state',{pid,includeScreenshot:false});await sleep(1200)}
   }finally{w.close()}
  }
  meta.pid=pid;meta.coverPid=coverPid;writeFileSync(join(outDir,'config.json'),JSON.stringify(meta,null,2));progress(null);
  stage='warmup';
  // Unscored repetition-0 warmups. The password-only diagnostic types nothing outside its scored cells (exactly one type_text
  // per head per repetition), so it has none; the preflight above is its only preparation.
  if(!passwordLiteral)for(const h of HEADS)for(const pg of meta.pages){
   const id=['warmup',h,pg].join('/'),kind='plain';
   await cell({id,tag:tagOf(id),part:'warmup',rep:0,head:h,page:pg,kind,expected:expectationFor(h,pg,kind)},{warmup:true});
  }
  stage='cells';
  for(const r of rounds)for(const c of r)await cell(c);
 }catch(e){aborted=stage;startup.stage=stage;startup.errorName=errorName(e);startup.errorCode=errorCode(e)}
 finally{
  bootOpen=false;
  meta.finishedAt=Date.now();
  if(aborted!==null&&startup.stage){
   startup.marker??=exitLabel(side.exitCode,side.signalCode);startup.cover??=coverProc?exitLabel(coverProc.exitCode,coverProc.signalCode):null;
   startup.sideBroken=sideBroken;startup.boot={marker:bootShape(boot.marker),cover:bootShape(boot.cover)};
   meta.startup=startup;
  }
  // The engines stop first and their stderr drains to close; only then is the capture flushed and summarized, so a late stray
  // line is in the final privacy verdict.
  const stopped={main:await stopChild(heads.main.child),fix:await stopChild(heads.fix.child)};
  for(const h of HEADS)stopped[h+'Drained']=await Promise.race([heads[h].closed,sleep(3000).then(()=>false)]);
  for(const h of HEADS){try{audit.stderr(h,null)}catch{}}
  const summary=summarize(rows,{phase,planned});
  // The audit module's cross-row gates (schedule shape, pre-input discovery) over the audit rows it produced.
  try{
   if(auditRaw.length){const tally={leaks:0,withheld:0};summary.audit=renameKeys(scrub(audit.summarize(auditRaw,securePermitted?{securePermitted}:undefined),tally));if(tally.leaks)privacyViolations++}
  }catch{summary.audit={error:true}}
  const captureMissing=rows.filter(r=>r.harnessValid&&r.auditOk!==true).length;
  summary.contracts=contractsOf(summary,{phase,auditFailures,captureMissing});
  meta.coverage={planned,done,harnessValid,strict,invalid,setupFailures,failureStages,privacyViolations,auditFailures,auditWithheld,storeCleanupFailures,
   complete:aborted===null&&done===planned&&harnessValid===planned&&privacyViolations===0&&storeCleanupFailures===0&&auditFailures===0&&auditWithheld===0,abortedAt:aborted};
  fixture?.close();
  try{audit.close()}catch{}
  stopped.probe=await stopChild(side);stopped.cover=await stopChild(coverProc);
  if(browser){try{browser.kill()}catch{}}
  let homeRemoved=true;try{rmSync(tmp,{recursive:true,force:true})}catch{homeRemoved=false}
  meta.cleanup={...stopped,tempRemoved:homeRemoved};
  writeFileSync(join(outDir,'summary.json'),JSON.stringify(summary,null,2));
  writeFileSync(join(outDir,'config.json'),JSON.stringify(meta,null,2));progress(null);
  // The output is attested last, after every file is written; a failed attestation fails the run.
  const attestation=publication(attestDir(outDir),{privacyViolations,auditWithheld,contracts:summary.contracts});
  writeFileSync(join(outDir,'attestation.json'),JSON.stringify(attestation,null,2));
  console.log('395q coverage',JSON.stringify(meta.coverage));
  for(const g of summary.groups)console.log('395q',g.head,g.page,g.kind,'n',g.n,'strict',g.strict,'outcomes',JSON.stringify(g.outcomes),'wrongSuccess',g.wrongSuccess);
  console.log('395q attestation',JSON.stringify(attestation));
  console.log('395q contracts',JSON.stringify(summary.contracts));
  // Coverage, the qualification contracts and the output attestation each fail the run on their own.
  if(!meta.coverage.complete||!summary.contracts.ok||!attestation.publishable||!Object.values(stopped).every(Boolean))process.exitCode=1;
 }
}
// Run only when invoked as the script, so the pure helpers can be imported.
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 process.on('unhandledRejection',()=>{console.error('395q unexpected failure');process.exit(1)});
 main().catch(()=>{console.error('395q failed before measurement');process.exitCode=1});
}
