// Offline reader for #366's first-background-AXPress experiment (ruling 757). Fixture-owned evidence only.
// Ground truth is the button handler's own count (after.presses); a surviving or closed dialog is never evidence.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {firstReadiness} from './first-readiness.mjs'; // a cycle by design: only called at runtime, never at load

const BROWSERS=['electron-parity','electron','cft'];
const TEMPERATURES=['cold','warm'],SCENES=['modal','untrapped'],VARIANTS=['main','bare','inert-titlebar','inert-toolbar'];
const EFFECTS=['dialogClosed','frontmostChanged','raised','windowMoved','otherPointer','ownerLost'];

const AGES=['immediate','aged'],AGED_MS=10000;
// Arms of (observeFirst, age) and, per variant, how many repetitions each runs. Exploratory variants and the
// unobserved arms run at spread-out repetition indices rather than all early; the observed main/bare cells run every index.
const FULL=Array.from({length:20},(_,i)=>i),FIVE=[0,4,9,14,19],THREE=[0,9,19];
const ARMS=[
 {observeFirst:true,age:'immediate',reps:{main:FULL,bare:FULL,'inert-titlebar':FIVE,'inert-toolbar':FIVE}},
 {observeFirst:true,age:'aged',reps:{main:FULL,bare:FULL}},
 {observeFirst:false,age:'immediate',reps:{main:THREE,bare:THREE}},
 {observeFirst:false,age:'aged',reps:{main:THREE,bare:THREE}},
];
// One block per repetition index. Arm, scene (trap), temperature and variant orders rotate across indices,
// so no treatment always runs first or on the coldest machine. Smoke is the rep-0 block: every distinct cell once.
export function firstPlan({browser,smoke=false}) {
 if(!BROWSERS.includes(browser))throw Error('unknown browser');
 const blocks=[];
 for(let rep=0;rep<(smoke?1:20);rep++) {
  const scenes=rep%2?[...SCENES].reverse():SCENES,temps=(rep>>1)%2?[...TEMPERATURES].reverse():TEMPERATURES;
  const variants=[...VARIANTS.slice(rep%4),...VARIANTS.slice(0,rep%4)];
  const arms=[...ARMS.slice(rep%4),...ARMS.slice(0,rep%4)];
  const cells=[];blocks.push(cells);
  for(const {observeFirst,age,reps} of arms)for(const scene of scenes)for(const temperature of temps)for(const variant of variants) {
   if(!reps[variant]?.includes(rep))continue;
   cells.push({phase:'first-press',browser,temperature,scene,variant,age,observeFirst,operation:'press',foreground:false,rep,
    id:['first-press',browser,temperature,scene,variant,age,observeFirst?'observed':'unobserved','press','behind',rep].join('/')});
  }
 }
 // The critical observed main/bare cells run first (interleaved by repetition); exploratory cells follow at their assigned indices.
 const critical=c=>c.observeFirst&&(c.variant==='main'||c.variant==='bare');
 return [...blocks.flatMap(b=>b.filter(critical)),...blocks.flatMap(b=>b.filter(c=>!critical(c)))];
}

const q=(xs,p)=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]:null};
const latency=xs=>({p50:q(xs,.5),p95:q(xs,.95),max:q(xs,1)});
const count=v=>Number.isInteger(v)&&v>=0;

export function firstJudge(r) {
 const b=r?.before,a=r?.after,warm=r?.temperature==='warm',p=r?.primer;
 const primerOk=warm?p?.before?.primerPresses===0&&count(p?.after?.primerPresses):p===undefined||p===null;
 const eligible=r?.valid===true&&typeof r.appLaunchId==='string'&&r.appLaunchId!==''&&TEMPERATURES.includes(r.temperature)
  &&r.preMeasureAXPressCount===(warm?1:0)&&primerOk
  &&AGES.includes(r.age)&&typeof r.observeFirst==='boolean'&&r.targetObservationCount===(r.observeFirst?(r.age==='aged'?2:1):0)
  &&(r.age!=='aged'||r.ageAtPressMs>=AGED_MS)
  &&!!b&&!!a&&typeof b.trial==='string'&&b.pageId===a.pageId&&b.timeOrigin===a.timeOrigin&&b.trial===a.trial
  &&b.presses===0&&count(a.presses)
  &&!!r.sideEffects&&r.sideEffects.ownerLost!==true
  &&Number.isFinite(r.call?.startedAt)&&Number.isFinite(r.call?.endedAt)&&!!(r.call.raw?.result||r.call.raw?.error);
 const n=eligible?a.presses:null;
 // A known dropped primer (marker 0) still makes the press warm; excluding it would bias the cohort toward working apps.
 const primerDrop=eligible&&warm&&p.after.primerPresses===0;
 const answeredOK=eligible&&!!r.call.raw.result&&!r.call.raw.error;
 const ran=eligible&&n>0;
 return {eligible,count:n,answeredOK,ran,exact:eligible&&n===1,duplicate:eligible&&n>1,
  falseSuccess:answeredOK&&n===0,errorWithHandler:eligible&&!answeredOK&&ran,
  primerDrop,primerFalseSuccess:primerDrop&&!!p.call?.raw?.result&&!p.call.raw.error};
}

export const firstStats=latency;

// Outcome counters for any set of rows (a cell, a readiness bucket); exact over every attempted row.
export function firstAggregate(rows) {
 const g={attempted:0,valid:0,invalid:0,invalidByStage:{},repliesOK:0,errors:0,ran:0,exact:0,falseSuccess:0,duplicates:0,errorWithHandler:0,primerDrops:0,primerFalseSuccess:0,
  sideEffects:Object.fromEntries(EFFECTS.map(k=>[k,0])),sideEffectsUnknown:Object.fromEntries(EFFECTS.map(k=>[k,0]))},times=[];
 for(const r of rows) {
  const j=firstJudge(r);g.attempted++;
  // Side effects count over every attempted row: invalid readbacks must not hide a harmful treatment.
  // An effect that is not a known boolean (null or absent) is unknown, counted apart from positive harm.
  for(const k of EFFECTS){const v=r.sideEffects?.[k];if(v===true)g.sideEffects[k]++;else if(v!==false)g.sideEffectsUnknown[k]++;}
  if(!j.eligible){g.invalid++;const s=r.failureStage??'state-validation';g.invalidByStage[s]=(g.invalidByStage[s]??0)+1;continue}
  g.valid++;
  if(j.answeredOK)g.repliesOK++;else g.errors++;
  if(j.ran)g.ran++;if(j.exact)g.exact++;if(j.falseSuccess)g.falseSuccess++;if(j.duplicate)g.duplicates++;if(j.errorWithHandler)g.errorWithHandler++;if(j.primerDrop)g.primerDrops++;if(j.primerFalseSuccess)g.primerFalseSuccess++;
  times.push(r.call.endedAt-r.call.startedAt);
 }
 return {...g,callMs:latency(times)};
}

export function firstSummarize(rows) {
 const groups=new Map();
 for(const r of rows.filter(r=>r.phase==='first-press')) {
  const key=[r.browser,r.temperature,r.scene,r.variant,r.age,r.observeFirst].join('/');
  if(!groups.has(key))groups.set(key,{cell:{browser:r.browser,temperature:r.temperature,scene:r.scene,variant:r.variant,age:r.age,observeFirst:r.observeFirst},rows:[]});
  groups.get(key).rows.push(r);
 }
 return [...groups.values()].map(({cell,rows})=>({...cell,...firstAggregate(rows)}));
}

export function firstCoverage(rows,{browser,smoke}={}) {
 smoke??=rows.length>0&&rows.every(r=>r.smoke===true);
 const browsers=browser?[browser]:[...new Set(rows.map(r=>r.browser))];
 const expected=browsers.flatMap(b=>firstPlan({browser:b,smoke})).map(c=>c.id),want=new Set(expected),have=new Set(rows.map(r=>r.id));
 const duplicates=[...new Set(rows.filter((r,i)=>rows.findIndex(x=>x.id===r.id)!==i).map(r=>r.id))];
 const launches=new Map();
 for(const r of rows)if(typeof r.appLaunchId==='string'&&r.appLaunchId)launches.set(r.appLaunchId,[...(launches.get(r.appLaunchId)??[]),r.id]);
 const reusedLaunchIds=[...launches].filter(([,ids])=>ids.length>1).map(([appLaunchId,ids])=>({appLaunchId,ids}));
 const report={smoke,browsers,rows:rows.length,expected:expected.length,
  missing:expected.filter(id=>!have.has(id)),duplicates,unexpected:[...have].filter(id=>!want.has(id)),
  invalid:rows.filter(r=>!firstJudge(r).eligible).map(r=>({id:r.id,failureStage:r.failureStage,problem:r.problem})),reusedLaunchIds};
 report.ok=report.rows>0&&report.expected>0&&!report.missing.length&&!duplicates.length&&!report.unexpected.length&&!report.invalid.length&&!reusedLaunchIds.length;
 return report;
}

function files(path) {
 if(path.endsWith('.jsonl'))return [path];
 return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):e.name==='rows.jsonl'?[join(path,e.name)]:[]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const [mode,...args]=process.argv.slice(2);
 if(mode==='plan')console.log(JSON.stringify(firstPlan({browser:args[0]??'electron',smoke:args[1]==='smoke'}),null,2));
 else if(['summary','coverage','readiness'].includes(mode)&&args.length) {
  const rows=args.flatMap(files).flatMap(p=>readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
  if(mode==='summary')console.log(JSON.stringify(firstSummarize(rows),null,2));
  else if(mode==='readiness')console.log(JSON.stringify(firstReadiness(rows),null,2));
  else {const report=firstCoverage(rows);console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1}
 } else {console.error('first-read.mjs plan [electron|electron-parity|cft] [smoke] | summary|coverage|readiness <artifact-directory-or-rows.jsonl>...');process.exitCode=2}
}
