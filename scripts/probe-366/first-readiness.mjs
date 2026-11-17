// Readiness of the target app's accessibility tree at the native press, from the native trace's actual
// AXManualAccessibility writes. App age never stands in for readiness: a later rewrite resets the clock.
import {firstAggregate,firstStats,firstSummarize} from './first-read.mjs';

const MANUAL='AXManualAccessibility',ENHANCED='AXEnhancedUserInterface';
const finite=Number.isFinite;

// Last completed write of `attribute` for `pid` at or before the press (all of them when the press time is unknown).
function lastWrite(trace,attribute,pid,pressAt) {
 let best=null;
 for(const t of trace??[])
  if(t?.kind==='write.end'&&t.attribute===attribute&&t.pid===pid&&finite(t.at)&&(!finite(pressAt)||t.at<=pressAt)&&(!best||t.at>=best.at))best=t;
 return best&&{at:best.at,value:best.value,error:best.error};
}
const delta=(pressAt,w)=>finite(pressAt)&&w?pressAt-w.at:null;

export function pressReadiness(nativeTrace,appInfo,pressAt,pid) {
 const manual=lastWrite(nativeTrace,MANUAL,pid,pressAt),enhanced=lastWrite(nativeTrace,ENHANCED,pid,pressAt);
 const manualDeltaMs=delta(pressAt,manual);
 let manualBucket;
 if(!finite(pressAt))manualBucket='no-AXPress';
 else if(!manual)manualBucket='unwritten';
 else if(manual.error!==0)manualBucket='write-error';
 else if(manual.value===false)manualBucket='disabled';
 else if(manual.value!==true)manualBucket='write-error';
 else manualBucket=manualDeltaMs<2000?'lt2s':manualDeltaMs<2500?'transition':'ge2.5s';
 // Only recorded mode-change events; the fixture's initial getter is reported apart and is not an event.
 const events=(appInfo??[]).filter(e=>e?.kind==='accessibility-support-changed'&&(e.pid===undefined||e.pid===null||e.pid===pid))
  .map(e=>({enabled:e.enabled,at:e.at,offsetMs:finite(pressAt)&&finite(e.at)?pressAt-e.at:null}));
 const enables=events.filter(e=>e.enabled===true&&e.offsetMs!==null);
 const pick=(list,better)=>list.reduce((a,e)=>!a||better(e,a)?e:a,null);
 return {manualBucket,manual,manualDeltaMs,enhanced,enhancedDeltaMs:delta(pressAt,enhanced),events,
  nearestBeforeEnable:pick(enables.filter(e=>e.offsetMs>=0),(e,a)=>e.offsetMs<a.offsetMs),
  nearestAfterEnable:pick(enables.filter(e=>e.offsetMs<0),(e,a)=>e.offsetMs>a.offsetMs),
  fixtureReady:(appInfo??[]).find(e=>e?.kind==='fixture-ready')??null};
}

const bucketOf=r=>r.readiness?.manualBucket??'unknown';
const group=(rows,keyOf)=>{const m=new Map();for(const r of rows){const k=keyOf(r),id=JSON.stringify(k);if(!m.has(id))m.set(id,{k,rows:[]});m.get(id).rows.push(r)}return [...m.values()]};

// Primary grouping is browser + readiness bucket, then the cell factors; the assigned age is secondary.
// By-cell summaries are retained for exact denominators.
export function firstReadiness(rows) {
 rows=rows.filter(r=>r.phase==='first-press');
 const groups=group(rows,r=>({browser:r.browser,manualBucket:bucketOf(r),variant:r.variant,temperature:r.temperature,scene:r.scene,observeFirst:r.observeFirst}))
  .map(({k,rows})=>({...k,...firstAggregate(rows),byAge:Object.fromEntries(group(rows,r=>r.age).map(({k,rows})=>[k,{n:rows.length,actualAXPressAgeMs:firstStats(rows.map(r=>r.actualAXPressAgeMs))}]))}));
 const buckets=group(rows,r=>({browser:r.browser,manualBucket:bucketOf(r)})).map(({k,rows})=>({...k,...firstAggregate(rows)}));
 // Only aged observed rows take a second full walk; elsewhere the field has no meaning, so it is not an unknown.
 const walks=rows.filter(r=>r.age==='aged'&&r.observeFirst===true).map(r=>r.secondWalkManualWrites),known=walks.filter(Array.isArray);
 // 250 ms bins of the successful enabled Manual write delta; every bin is listed, empty ones with zero counts.
 const ok=['lt2s','transition','ge2.5s'],binOf=r=>{const d=r.readiness?.manualDeltaMs;return ok.includes(bucketOf(r))&&finite(d)?Math.floor((d-1500)/250):-1};
 const deltaBins=[...new Set(rows.map(r=>r.browser))].flatMap(browser=>Array.from({length:6},(_,i)=>({browser,fromMs:1500+250*i,toMs:1750+250*i,
  ...firstAggregate(rows.filter(r=>r.browser===browser&&binOf(r)===i))})));
 return {groups,buckets,deltaBins,cells:firstSummarize(rows),
  secondWalk:{rows:known.length,rowsRewrote:known.filter(w=>w.length>0).length,writes:known.reduce((n,w)=>n+w.length,0),unknownRows:walks.length-known.length}};
}
