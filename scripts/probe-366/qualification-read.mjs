// Offline reader for the engine-fix qualification: the real unpatched engine fix against main, per browser, one fresh launch per row.
// Oracles are page-side only (handler count, or DOM + React value + handler event); an unchanged state never confirms anything.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {firstStats} from './first-read.mjs';

const BROWSERS=['electron-parity','electron','cft'];
const SPECS=[
 {group:'cold',engineSide:'main',launches:20,labels:['cold']},
 {group:'cold',engineSide:'fix',launches:20,labels:['cold','warm']},
 {group:'posthold',engineSide:'fix',launches:10,labels:['cold','posthold']},
 {group:'value',engineSide:'main',launches:10,labels:['value']},
 {group:'value',engineSide:'fix',launches:10,labels:['value']},
 {group:'load',engineSide:'fix',launches:20,labels:['loaded']},
];
const EFFECTS=['dialogClosed','frontmostChanged','raised','windowMoved','otherPointer','ownerLost'];
const POSTHOLD_IDLE_MS=30000;
const finite=Number.isFinite,count=v=>Number.isInteger(v)&&v>=0;
const specOf=r=>SPECS.find(s=>s.group===r?.group&&s.engineSide===r?.engineSide);

// One cell per fresh launch. The cell order rotates by repetition so no group or engine side always launches first.
export function qualificationPlan({browser,smoke=false}) {
 if(!BROWSERS.includes(browser))throw Error('unknown browser');
 const cells=[];
 for(let rep=0;rep<(smoke?2:20);rep++) {
  const here=SPECS.filter(s=>rep<s.launches),k=rep%here.length;
  for(const s of [...here.slice(k),...here.slice(0,k)])
   cells.push({phase:'qualification',browser,group:s.group,engineSide:s.engineSide,rep,expectedCalls:s.labels,id:['qualification',browser,s.group,s.engineSide,rep].join('/')});
 }
 return cells;
}

// The load recipe counts only when its CPU use was measured as positive with the expected workers in both samples.
const loadSampleOk=s=>!!s&&finite(s.at)&&Number.isInteger(s.expected)&&s.expected>0&&Array.isArray(s.workers)&&s.workers.length>=s.expected;
const loadMeasured=c=>finite(c?.loadCpuPercent)&&c.loadCpuPercent>0&&loadSampleOk(c.loadBefore)&&loadSampleOk(c.loadAfter)&&c.loadBefore.expected===c.loadAfter.expected;
// A wait is evidenced by the signpost (finite, so 0 ms is real) or, on main only, by the deliberate no-gate known zero.
const waitEvidenced=(r,c)=>(c.waitEvidence==='signpost'&&finite(c.waitMs)&&c.waitMs>=0)||(c.waitEvidence==='main-no-gate'&&r.engineSide==='main');

// Why a launch row cannot be scored (null when complete): the expected calls, each once and finished, and an established owner.
function rowProblem(r) {
 if(r?.valid!==true)return 'not-valid';
 if(typeof r.appLaunchId!=='string'||r.appLaunchId==='')return 'launch-id';
 const spec=specOf(r);
 if(!spec)return 'group';
 if(typeof r.owner?.pageId!=='string')return 'owner';
 if(!Array.isArray(r.calls)||JSON.stringify(r.calls.map(c=>c?.label).sort())!==JSON.stringify([...spec.labels].sort()))return 'calls';
 if(!r.calls.every(c=>finite(c.startedAt)&&finite(c.endedAt)&&!!(c.raw?.result||c.raw?.error)))return 'call-incomplete';
 if(spec.group==='posthold'){
  const first=r.calls.find(c=>c.label==='cold'),second=r.calls.find(c=>c.label==='posthold');
  if(second.startedAt-first.endedAt<POSTHOLD_IDLE_MS)return 'posthold-idle';
 }
 if(spec.group==='load'&&!loadMeasured(r.calls[0]))return 'load-unmeasured';
 return null;
}

// Outcome of one call from the page-side oracle; `known:false` is unknown ground truth, never a drop.
export function qualificationJudgeCall(r,call) {
 const o=r.owner,b=call?.before,a=call?.after,error=!!call?.raw?.error,answered=!!call?.raw?.result&&!error;
 const out={known:false,delivered:false,exact:false,duplicate:false,falseSuccess:false,error,answered};
 if(!(o&&b&&a&&b.pageId===o.pageId&&a.pageId===o.pageId&&b.timeOrigin===a.timeOrigin&&(o.timeOrigin===undefined||b.timeOrigin===o.timeOrigin)))return out;
 if(call.label==='value') {
  const expected=call.expectedValue;
  if(typeof expected!=='string'||typeof b.value!=='string'||b.value===expected||typeof a.value!=='string'||typeof a.reactValue!=='string'||!Array.isArray(a.events))return out;
  const matches=a.events.filter(e=>(e?.type==='search.handler'||e?.kind==='search.handler')&&e.value===expected&&(!finite(e.wallAt)||e.wallAt>=call.startedAt));
  const delivered=a.value===expected&&a.reactValue===expected&&matches.length>0;
  return {...out,known:true,delivered,exact:delivered&&matches.length===1,duplicate:delivered&&matches.length>1,falseSuccess:answered&&!delivered};
 }
 if(!count(b.presses)||!count(a.presses)||a.presses<b.presses)return out;
 const delta=a.presses-b.presses;
 return {...out,known:true,delivered:delta>0,exact:delta===1,duplicate:delta>1,falseSuccess:answered&&delta===0};
}

const group=(rows,keyOf)=>{const m=new Map();for(const x of rows){const k=keyOf(x),id=JSON.stringify(k);if(!m.has(id))m.set(id,{k,rows:[]});m.get(id).rows.push(x)}return [...m.values()]};
const zero=()=>Object.fromEntries(EFFECTS.map(k=>[k,0]));

export function qualificationSummarize(rows) {
 rows=rows.filter(r=>r&&typeof r==='object');
 const calls=group(rows.flatMap(r=>(specOf(r)?.labels??['unknown']).map(label=>({r,label}))),x=>({browser:x.r.browser,group:x.r.group,engineSide:x.r.engineSide,label:x.label}))
  .map(({k,rows:items}) => {
   const g={...k,attempted:items.length,valid:0,invalid:0,invalidByReason:{},repliesOK:0,errors:0,delivered:0,exact:0,duplicates:0,notDelivered:0,falseSuccess:0,unknown:0,
    wait:{signpost:0,mainNoGate:0,missing:0},sideEffects:zero(),sideEffectsUnknown:zero()},rpc=[],waits=[],loads=[];
   for(const {r,label} of items) {
    const call=r.calls?.find?.(c=>c?.label===label),problem=rowProblem(r);
    // Effects count over every attempt; a missing call or a non-boolean effect is unknown, never clean.
    for(const e of EFFECTS){const v=call?.sideEffects?.[e];if(v===true)g.sideEffects[e]++;else if(v!==false)g.sideEffectsUnknown[e]++;}
    if(problem){g.invalid++;g.invalidByReason[problem]=(g.invalidByReason[problem]??0)+1;continue}
    g.valid++;
    const j=qualificationJudgeCall(r,call);
    if(j.answered)g.repliesOK++;if(j.error)g.errors++;
    if(!j.known)g.unknown++;else if(j.delivered){g.delivered++;if(j.exact)g.exact++;if(j.duplicate)g.duplicates++}else g.notDelivered++;
    if(j.falseSuccess)g.falseSuccess++;
    rpc.push(call.endedAt-call.startedAt);
    // The wait is real only from the signpost. The main side has no gate to measure; anything else is unknown, never zero.
    if(waitEvidenced(r,call)&&call.waitEvidence==='signpost'){g.wait.signpost++;waits.push(call.waitMs)}
    else if(waitEvidenced(r,call))g.wait.mainNoGate++;
    else g.wait.missing++;
    if(k.group==='load')loads.push(call.loadCpuPercent);
   }
   return {...g,rpcMs:firstStats(rpc),actualWaitMs:firstStats(waits),...(k.group==='load'?{loadCpuPercent:firstStats(loads)}:{})};
  });
 const launches=group(rows,r=>({browser:r.browser,group:r.group,engineSide:r.engineSide})).map(({k,rows})=>{
  const g={...k,attempted:rows.length,valid:0,invalid:0,invalidByReason:{},profileCleanupFailures:0};
  for(const r of rows){
   if(r.profileCleanup?.ok===false)g.profileCleanupFailures++;
   const p=rowProblem(r);if(p){g.invalid++;g.invalidByReason[p]=(g.invalidByReason[p]??0)+1}else g.valid++;
  }
  // Posthold observation timings are reported raw, as the controller stored them.
  if(k.group==='posthold')g.observationTimings=rows.flatMap(r=>(r.observations??[]).flatMap((o,index)=>o?.raw?.result?.timings?[{id:r.id,index,timings:o.raw.result.timings}]:[]));
  return g;
 });
 return {calls,launches};
}

export function qualificationCoverage(rows,{browser,smoke}={}) {
 smoke??=rows.length>0&&rows.every(r=>r.smoke===true);
 const browsers=browser?[browser]:[...new Set(rows.map(r=>r.browser))];
 const cells=browsers.flatMap(b=>qualificationPlan({browser:b,smoke})),byId=new Map(cells.map(c=>[c.id,c]));
 const expected=cells.map(c=>c.id),have=new Set(rows.map(r=>r.id));
 const duplicates=[...new Set(rows.filter((r,i)=>rows.findIndex(x=>x.id===r.id)!==i).map(r=>r.id))];
 const launches=new Map();
 for(const r of rows)if(typeof r.appLaunchId==='string'&&r.appLaunchId)launches.set(r.appLaunchId,[...(launches.get(r.appLaunchId)??[]),r.id]);
 const reusedLaunchIds=[...launches].filter(([,ids])=>ids.length>1).map(([appLaunchId,ids])=>({appLaunchId,ids}));
 const problem=r=>{const c=byId.get(r.id);return c&&(c.browser!==r.browser||c.group!==r.group||c.engineSide!==r.engineSide)?'cell-mismatch':rowProblem(r)};
 const report={smoke,browsers,rows:rows.length,expectedLaunches:expected.length,expectedCalls:cells.reduce((n,c)=>n+c.expectedCalls.length,0),
  missing:expected.filter(id=>!have.has(id)),duplicates,unexpected:[...have].filter(id=>!byId.has(id)),
  invalid:rows.map(r=>[r,problem(r)]).filter(([r,p])=>p&&byId.has(r.id)).map(([r,reason])=>({id:r.id,reason,failureStage:r.failureStage,problem:r.problem})),reusedLaunchIds};
 // Every call of an otherwise complete launch needs its wait evidenced; a missing wait is unknown and fails coverage, never zero.
 report.waitMissing=rows.filter(r=>byId.has(r.id)&&!problem(r)).map(r=>({id:r.id,labels:r.calls.filter(c=>!waitEvidenced(r,c)).map(c=>c.label)})).filter(x=>x.labels.length);
 report.ok=report.rows>0&&report.expectedLaunches>0&&!report.missing.length&&!duplicates.length&&!report.unexpected.length&&!report.invalid.length&&!reusedLaunchIds.length&&!report.waitMissing.length;
 return report;
}

function files(path) {
 if(path.endsWith('.jsonl'))return [path];
 return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):e.name==='rows.jsonl'?[join(path,e.name)]:[]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const [mode,...args]=process.argv.slice(2);
 if(mode==='plan')console.log(JSON.stringify(qualificationPlan({browser:args[0]??'electron',smoke:args[1]==='smoke'}),null,2));
 else if(['summary','coverage'].includes(mode)&&args.length) {
  const rows=args.flatMap(files).flatMap(p=>readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
  if(mode==='summary')console.log(JSON.stringify(qualificationSummarize(rows),null,2));
  else {const report=qualificationCoverage(rows);console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1}
 } else {console.error('qualification-read.mjs plan [electron|electron-parity|cft] [smoke] | summary|coverage <artifact-directory-or-rows.jsonl>...');process.exitCode=2}
}
