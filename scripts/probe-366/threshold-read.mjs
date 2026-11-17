// Offline reader for the #366 enablement-delay threshold sweep: a fresh cold observed app, modal trap, main variant,
// one press at a requested delay after the last owned accessibility-enable write. Delivery is the handler marker alone.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {firstJudge,firstAggregate,firstStats} from './first-read.mjs';

const BROWSERS=['electron-parity','electron','cft'];
const DELAYS=[1500,1750,2000,2250,2500,2750,3000,3500],WINDOW_MS=75;
const ATTRIBUTES={AXManualAccessibility:'manual',AXEnhancedUserInterface:'enhanced'};
const BENIGN_NIL=[-25212,-25205]; // kAXErrorNoValue, kAXErrorAttributeUnsupported
const ENHANCED_OWNED_ERROR=-25208;
const finite=Number.isFinite;

// One block per repetition; the delay order rotates so no delay always runs first. Smoke is two repetitions.
export function thresholdPlan({browser,smoke=false}) {
 if(!BROWSERS.includes(browser))throw Error('unknown browser');
 const cells=[];
 for(let rep=0;rep<(smoke?2:10);rep++)
  for(const requestedDelayMs of [...DELAYS.slice(rep%8),...DELAYS.slice(0,rep%8)])
   cells.push({phase:'first-press',browser,age:'immediate',observeFirst:true,temperature:'cold',scene:'modal',variant:'main',operation:'press',foreground:false,
    requestedDelayMs,rep,id:['threshold',browser,requestedDelayMs,rep].join('/')});
 return cells;
}

// present iff Search with error 0; absent only for a known nil/empty on success or a benign no-value/unsupported error; else unknown.
// With a context, the read must belong to the target pid and complete no later than the press.
export function thresholdSignal(s,{pid,pressAt}={}) {
 if(!s||!finite(s.at)||!finite(s.readStartedAt))return 'unknown';
 if(finite(pid)&&s.pid!==pid)return 'unknown';
 if(finite(pressAt)&&s.at>pressAt)return 'unknown';
 if(s.value==='Search'&&s.error===0)return 'present';
 const nil=s.value===null||s.value===undefined||s.value==='';
 return nil&&(s.error===0||BENIGN_NIL.includes(s.error))?'absent':'unknown';
}

const invalid=(base,reason)=>({...base,eligible:false,state:'invalid',reason,delayMs:null,signal:'unknown',ran:false,exact:false,duplicate:false,falseSuccess:false,errorWithHandler:false,answeredOK:false});

export function thresholdJudge(r) {
 const base=firstJudge(r);
 if(!base.eligible)return invalid(base,'base');
 if(!(r.age==='immediate'&&r.observeFirst===true&&r.temperature==='cold'&&r.scene==='modal'&&r.variant==='main'))return invalid(base,'cell');
 if(!DELAYS.includes(r.requestedDelayMs))return invalid(base,'requested-delay');
 // One native AXPress when the reply succeeded; an explicit target error may carry none, but never more than one.
 const calls=r.measuredAXPressCount,answered=!!r.call?.raw?.result&&!r.call.raw.error;
 if(!Number.isInteger(calls)||calls>1||(answered&&calls!==1))return invalid(base,'native-call-count');
 // The reference enablement must be the actual last owned write of its attribute before this press, and a clean enable.
 const ref=r.referenceEnablementWrite,key=ATTRIBUTES[ref?.attribute],last=key&&r.readiness?.[key];
 // Manual must return 0. Chrome's Enhanced may return -25208 yet be owned when the engine then read true back.
 const excused=key==='enhanced'&&ref?.error===ENHANCED_OWNED_ERROR;
 if(!ref||!key||!finite(ref.at)||ref.value!==true||(ref.error!==0&&!excused))return invalid(base,'reference-enablement');
 if(finite(r.targetPid)&&ref.pid!==r.targetPid)return invalid(base,'reference-pid');
 if(!last||last.at!==ref.at||last.value!==ref.value||last.error!==ref.error)return invalid(base,'reference-mismatch');
 if(!finite(r.actualAXPressAt))return invalid(base,'no-press-time');
 if(excused&&!(r.nativeTrace??[]).some(t=>t?.kind==='read'&&t.attribute===ref.attribute&&t.pid===ref.pid&&t.value===true&&t.error===0&&finite(t.at)&&t.at>=ref.at&&t.at<=r.actualAXPressAt))
  return invalid(base,'reference-readback');
 const delayMs=r.actualAXPressAt-last.at,ok=delayMs>=r.requestedDelayMs&&delayMs<=r.requestedDelayMs+WINDOW_MS;
 const signal=thresholdSignal(r.thresholdSignal,{pid:r.targetPid,pressAt:r.actualAXPressAt});
 return ok?{...base,state:'ok',reason:null,delayMs,signal}
  :{...base,eligible:false,state:'mistimed',reason:'delay-window',delayMs,signal,ran:false,exact:false,duplicate:false,falseSuccess:false,errorWithHandler:false,answeredOK:false};
}

export function thresholdSummarize(rows) {
 const groups=new Map();
 for(const r of rows.filter(r=>r.phase==='first-press')) {
  const key=r.browser+'/'+r.requestedDelayMs;
  if(!groups.has(key))groups.set(key,{browser:r.browser,requestedDelayMs:r.requestedDelayMs,rows:[]});
  groups.get(key).rows.push(r);
 }
 return [...groups.values()].map(({browser,requestedDelayMs,rows}) => {
  const js=rows.map(r=>[r,thresholdJudge(r)]),valid=js.filter(([,j])=>j.state==='ok').map(([r])=>r);
  const all=firstAggregate(rows),outcome=firstAggregate(valid),invalidByStage={};
  for(const [r,j] of js)if(j.state==='invalid'){const s=j.reason==='base'?(r.failureStage??'state-validation'):'timing-evidence';invalidByStage[s]=(invalidByStage[s]??0)+1}
  const signal={present:0,absent:0,unknown:0};
  for(const [,j] of js)if(j.state==='ok')signal[j.signal]++;
  return {browser,requestedDelayMs,attempted:rows.length,valid:valid.length,invalid:js.filter(([,j])=>j.state==='invalid').length,mistimed:js.filter(([,j])=>j.state==='mistimed').length,invalidByStage,
   repliesOK:outcome.repliesOK,errors:outcome.errors,delivered:outcome.ran,exact:outcome.exact,falseSuccess:outcome.falseSuccess,duplicates:outcome.duplicates,errorWithHandler:outcome.errorWithHandler,
   signal,
   // Actual delays are reported for every row whose timing could be computed, so a mistiming is visible.
   actualDelayMs:firstStats(js.filter(([,j])=>finite(j.delayMs)).map(([,j])=>j.delayMs)),callMs:outcome.callMs,
   // Effects and cleanup trouble count over every attempt: invalid or mistimed rows must not hide a harmful treatment.
   sideEffects:all.sideEffects,sideEffectsUnknown:all.sideEffectsUnknown,profileCleanupFailures:all.profileCleanupFailures};
 });
}

export function thresholdCoverage(rows,{browser,smoke}={}) {
 smoke??=rows.length>0&&rows.every(r=>r.smoke===true);
 const browsers=browser?[browser]:[...new Set(rows.map(r=>r.browser))];
 const expected=browsers.flatMap(b=>thresholdPlan({browser:b,smoke})).map(c=>c.id),want=new Set(expected),have=new Set(rows.map(r=>r.id));
 const duplicates=[...new Set(rows.filter((r,i)=>rows.findIndex(x=>x.id===r.id)!==i).map(r=>r.id))];
 const launches=new Map();
 for(const r of rows)if(typeof r.appLaunchId==='string'&&r.appLaunchId)launches.set(r.appLaunchId,[...(launches.get(r.appLaunchId)??[]),r.id]);
 const reusedLaunchIds=[...launches].filter(([,ids])=>ids.length>1).map(([appLaunchId,ids])=>({appLaunchId,ids}));
 const judged=rows.map(r=>[r,thresholdJudge(r)]).filter(([,j])=>j.state!=='ok');
 const report={smoke,browsers,rows:rows.length,expected:expected.length,
  missing:expected.filter(id=>!have.has(id)),duplicates,unexpected:[...have].filter(id=>!want.has(id)),
  invalid:judged.map(([r,j])=>({id:r.id,state:j.state,reason:j.reason,failureStage:r.failureStage,problem:r.problem})),
  mistimed:judged.filter(([,j])=>j.state==='mistimed').length,reusedLaunchIds};
 report.ok=report.rows>0&&report.expected>0&&!report.missing.length&&!duplicates.length&&!report.unexpected.length&&!report.invalid.length&&!reusedLaunchIds.length;
 return report;
}

function files(path) {
 if(path.endsWith('.jsonl'))return [path];
 return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):e.name==='rows.jsonl'?[join(path,e.name)]:[]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const [mode,...args]=process.argv.slice(2);
 if(mode==='plan')console.log(JSON.stringify(thresholdPlan({browser:args[0]??'electron',smoke:args[1]==='smoke'}),null,2));
 else if(['summary','coverage'].includes(mode)&&args.length) {
  const rows=args.flatMap(files).flatMap(p=>readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
  if(mode==='summary')console.log(JSON.stringify(thresholdSummarize(rows),null,2));
  else {const report=thresholdCoverage(rows);console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1}
 } else {console.error('threshold-read.mjs plan [electron|electron-parity|cft] [smoke] | summary|coverage <artifact-directory-or-rows.jsonl>...');process.exitCode=2}
}
