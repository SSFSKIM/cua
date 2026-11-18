// Pure: cross-row audit gates and distributions for the #395 qualification. Input is persisted rows from audit-capture end().
// Names are made of [A-Za-z0-9_.:-] only (run.mjs's scrub drops any other key): head.page, never head/page.
// Gates are a flat object {name: 'pass'|'fail'|'unknown'}; `unknown` means the evidence needed to decide is missing (a row
// without a complete schedule, a build without the pre-input boundary, a kind not run), and is never a pass.
// Everything labelled informational is reported and never gated. Counts are exact; nothing is normalized beyond what a named key
// defines (a poll phase reduced to its terminal path in `shape`; nothing in `exactHash`/`strictHash`, and the pre-input reads
// are always compared exactly). Keyboard events are never compared: only the first one is recorded, as the pre-input boundary.
import {VALUE_BEARING,WALK_CAP} from './audit-schedule.mjs';
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const dist=a=>a.length?{n:a.length,min:Math.min(...a),p50:median(a),max:Math.max(...a)}:{n:0,min:null,p50:null,max:null};
// Nearest-rank percentiles, for the route durations (no adjustment: the audit's own recording time is inside every duration).
const pct=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.max(0,Math.ceil(q*s.length)-1)]};
const pdist=a=>a.length?{n:a.length,min:Math.min(...a),p50:pct(a,0.5),p95:pct(a,0.95),max:Math.max(...a)}:{n:0,min:null,p50:null,p95:null,max:null};
const phaseMs=(r,name)=>{const w=r.schedule.timeline.phases?.[name];return w?.length?round(w.reduce((t,x)=>t+x.durMs,0)):null};
const phaseDist=(rows,name)=>pdist(rows.map(r=>phaseMs(r,name)).filter(Number.isFinite));
const round=x=>x===null||x===undefined?null:Math.round(x*1000)/1000;
const GATE_KINDS=['plain','secretShort','secretLong'];
const BASELINE_HEAD='main',CANDIDATE_HEAD='fix';
export const MARKER_PAIR=Object.freeze(['AXSelectedTextMarkerRange','AXUIElementForTextMarker']);
// What a row's schedule does with text markers: `none`, the one allowed `pair`, or `invalid` with the reasons.
function routingOf(r){
 const t=r.schedule.timeline,m=t.markerAttempts??[],reasons=[];
 if(t.markerAttemptsTruncated)reasons.push('truncated');
 if(Object.keys(r.schedule.offThreadCounts??{}).some(n=>/TextMarker/.test(n)))reasons.push('off-thread-marker');
 if(m.some(a=>!a.preInput))reasons.push('after-input');
 const [first,second]=m;
 if(m.length){
  const pair=m.length===2&&first.api==='r'&&second.api==='p'&&first.names?.length===1&&second.names?.length===1&&first.names[0]===MARKER_PAIR[0]&&second.names[0]===MARKER_PAIR[1]&&first.alias>=0&&first.alias===second.alias;
  if(!pair)reasons.push(m.length!==2?'not-one-pair':'not-the-allowed-pair');
 }
 return reasons.length?{shape:'invalid',reasons}:{shape:m.length?'pair':'none',reasons};
}
// A comparable form of a row's (or an in-memory built) schedule.
function norm(x){
 const s=x?.schedule!==undefined&&x?.tag!==undefined?x.schedule:x;
 if(!s)return null;
 return {complete:s.complete===true,available:s.preInput?.available===true,preHash:s.preInput?.exactHash??null,preKey:s.preInput?.exactKey??null,preShape:s.preInput?.shape??null,
  shape:s.shape,strictHash:s.strictHash??null,strictKey:s.strictKey??null,counters:s.counters,pollCycleReps:s.pollCycleReps??[],preCounters:s.preInput};
}
const diffCounts=(a,b)=>{const out={};for(const k of new Set([...Object.keys(a??{}),...Object.keys(b??{})]))if((a?.[k]??0)!==(b?.[k]??0))out[k]=[a?.[k]??0,b?.[k]??0];return out};
// Exact comparison of two schedules (rows or built objects). The marker counts are reported apart from the full counts.
export function compareAudits(a,b){
 const x=norm(a),y=norm(b);
 if(!x||!y)return {comparable:false};
 const sameKey=(k,h)=>x[k]!==null&&y[k]!==null?x[k]===y[k]:x[h]!==null&&y[h]!==null?x[h]===y[h]:null;
 let first=null;
 if(x.strictKey!==null&&y.strictKey!==null){const ta=x.strictKey.split('|'),tb=y.strictKey.split('|');for(let i=0;i<Math.max(ta.length,tb.length);i++)if(ta[i]!==tb[i]){first={index:i,a:ta[i]??null,b:tb[i]??null};break}}
 return {comparable:x.complete&&y.complete,
  preInput:{available:x.available&&y.available,exactEqual:sameKey('preKey','preHash'),shapeEqual:x.preShape===y.preShape,countsDiff:diffCounts(x.preCounters?.byName,y.preCounters?.byName)},
  whole:{shapeEqual:x.shape===y.shape,exactEqual:sameKey('strictKey','strictHash'),firstDivergence:first,namesDiff:diffCounts(x.counters.byName,y.counters.byName),classDiff:diffCounts(x.counters.byClass,y.counters.byClass)},
  marker:{countsEqual:Object.keys(diffCounts(x.counters.markerByName,y.counters.markerByName)).length===0,diff:diffCounts(x.counters.markerByName,y.counters.markerByName),total:[x.counters.byClass.marker,y.counters.byClass.marker]},
  full:{attemptsEqual:x.counters.attempts===y.counters.attempts,diff:diffCounts(x.counters.byName,y.counters.byName),total:[x.counters.attempts,y.counters.attempts]},
  pollCycleReps:[x.pollCycleReps,y.pollCycleReps]};
}
// The one excused divergence: the engine's focused-field walk stops at a node or time bound (typeReadbackFocusWalkNodes 200,
// typeReadbackFocusWalkMs 40), so on a page larger than that its length follows the clock, not the page. Two schedules are
// equal up to that bound when, over `scope` ('pre': the reads before the first event; 'whole': the canonical schedule), they have the
// same walk phases and every read outside the walk phases is equal, in order and with its element alias; and in each walk the
// reads of one are exactly a prefix of the other's, the shorter being the one a TIME bound ended, corroborated by its own reads
// (WALK_CAP; the node bound is deterministic for a page, so a walk it ended is never the shorter), the longer held to the bounds too. A difference before the stop,
// after it, in another phase, or with no recorded bound is not excused. Needs the in-memory schedules (`full`).
export function walkBoundDivergence(a,b,scope){
 const A=a?.walk?.[scope],B=b?.walk?.[scope];
 if(!A||!B||A.invalid||B.invalid)return {excused:false,why:'no-walk-evidence'};
 if(!A.segments.length||A.segments.length!==B.segments.length)return {excused:false,why:'walk-phases-differ'};
 const outside=P=>{const out=[];let at=0;for(const g of P.segments){out.push(P.tokens.slice(at,g.start).join('|'));at=g.end}out.push(P.tokens.slice(at).join('|'));return out};
 const oa=outside(A),ob=outside(B),chunk=oa.findIndex((x,i)=>x!==ob[i]);
 if(chunk>=0)return {excused:false,why:'non-walk-reads-differ',chunk};
 const desc=(g,t)=>({bound:g.reason,calls:g.calls,roles:g.roles,children:g.children,durMs:g.durMs,demonstrated:g.demonstrated,next:t??null});
 const walks=[];
 for(let i=0;i<A.segments.length;i++){
  const ga=A.segments[i],gb=B.segments[i],ta=A.tokens.slice(ga.start,ga.end),tb=B.tokens.slice(gb.start,gb.end),n=Math.min(ta.length,tb.length);
  let d=0;while(d<n&&ta[d]===tb[d])d++;
  if(d===ta.length&&d===tb.length)continue;
  if(d<n)return {excused:false,why:'walks-differ-before-the-stop',walk:i,index:d};
  const [shorter,longer]=ta.length<tb.length?[ga,gb]:[gb,ga];
  if(shorter.reason!=='time'||shorter.demonstrated!==true)return {excused:false,why:'stop-not-a-demonstrated-time-bound',walk:i,index:d};
  // The walk that went on is held to the same bounds: no more nodes than the node bound allows, and any bound it recorded corroborated.
  if(longer.roles>WALK_CAP.nodes||(longer.reason!==null&&longer.demonstrated!==true))return {excused:false,why:'longer-walk-not-within-the-bounds',walk:i,index:d};
  walks.push({walk:i,index:d,a:desc(ga,ta[d]),b:desc(gb,tb[d])});
 }
 return walks.length?{excused:true,walks}:{excused:false,why:'identical-walks'};
}
// Pairwise over one representative per distinct schedule: every pair must be equal up to the bound.
function reconcile(reps,scope,full){
 const pairs=[];let ok=reps.length>0;
 for(let i=0;i<reps.length;i++)for(let j=i+1;j<reps.length;j++){
  const x=walkBoundDivergence(full(reps[i].tag),full(reps[j].tag),scope);
  if(!x.excused)ok=false;
  pairs.push({a:reps[i].tag,b:reps[j].tag,...x});
 }
 return {ok,pairs};
}
function setCompare(aRows,bRows,pickA=r=>r.schedule?.shape,pickB=pickA){
 const A=new Map(),B=new Map();
 for(const r of aRows)A.set(pickA(r),(A.get(pickA(r))??0)+1);for(const r of bRows)B.set(pickB(r),(B.get(pickB(r))??0)+1);
 const keysA=[...A.keys()].sort(),keysB=[...B.keys()].sort();
 return {equalSets:keysA.length===keysB.length&&keysA.every((k,i)=>k===keysB[i]),distinctA:keysA.length,distinctB:keysB.length};
}
function repPairs(aRows,bRows,full,excuse=null){
 const byRep=new Map(bRows.map(r=>[r.rep,r]));const unpairedA=aRows.filter(a=>!byRep.has(a.rep)).length,unpairedB=bRows.filter(b=>!aRows.some(a=>a.rep===b.rep)).length;let pairs=0,shapeEqual=0,preEqual=0,markerEqual=0,fullAttemptsEqual=0,example=null,capped=0,cappedExample=null;
 for(const a of aRows){const b=byRep.get(a.rep);if(!b)continue;pairs++;
  const c=compareAudits(full(a.tag)??a,full(b.tag)??b);
  if(c.whole?.shapeEqual)shapeEqual++;else if(excuse){const x=excuse(a,b);if(x.excused){capped++;cappedExample??={a:a.tag,b:b.tag,walks:x.walks}}}if(c.preInput?.exactEqual===true)preEqual++;if(c.marker?.countsEqual)markerEqual++;if(c.full?.attemptsEqual)fullAttemptsEqual++;
  if(example===null&&(!c.whole?.shapeEqual||c.preInput?.exactEqual===false))example={a:a.tag,b:b.tag,preEqual:c.preInput?.exactEqual,shapeEqual:c.whole?.shapeEqual,firstDivergence:c.whole?.firstDivergence,preNamesDiff:c.preInput?.countsDiff,markerDiff:c.marker?.diff};
 }
 return {pairs,unpairedA,unpairedB,shapeEqual,preInputExactEqual:preEqual,markerCountsEqual:markerEqual,fullAttemptsEqual,example,...(excuse?{walkBoundEqual:capped,walkBoundExample:cappedExample}:{})};
}
export function summarizeRows(allRows,{full=()=>null,stray={},securePermitted={}}={}){
 const rows=allRows.filter(r=>r&&typeof r.tag==='string'&&r.rep!==0);
 const out={rows:rows.length,warmupsExcluded:allRows.length-rows.length,modes:[...new Set(rows.map(r=>r.mode))],gates:{},groups:{},informational:{},failures:{},privacy:{violations:0,rowsWithViolations:0,codes:{}},stray};
 for(const r of rows){
  for(const f of r.failures??[])out.failures[f]=(out.failures[f]??0)+1;
  if(!r.ok&&!(r.failures?.length))out.failures['row-not-ok']=(out.failures['row-not-ok']??0)+1;
  const v=r.privacy?.violations??0;out.privacy.violations+=v;if(v>0)out.privacy.rowsWithViolations++;
  for(const [c,n] of Object.entries(r.privacy?.codes??{}))out.privacy.codes[c]=(out.privacy.codes[c]??0)+n;
 }
 out.gates.privacyClean=out.privacy.violations===0&&out.privacy.rowsWithViolations===0&&!Object.keys(stray.findings??{}).length?'pass':'fail';
 out.gates.rowsOk=rows.length>0&&rows.every(r=>r.ok===true)?'pass':'fail';
 const audited=rows.filter(r=>r.mode==='audit');
 const heads=[...new Set(rows.map(r=>r.head))].sort(),pages=[...new Set(rows.map(r=>r.page))].sort();
 const sel=(head,page,kind)=>audited.filter(r=>r.head===head&&r.page===page&&r.kind===kind&&r.schedule);
 for(const head of heads)for(const page of pages)for(const kind of ['plain','secretShort','secretLong','secure']){
  const g=sel(head,page,kind);if(!g.length)continue;
  const shapes=new Map();for(const r of g)shapes.set(r.schedule.shape,(shapes.get(r.schedule.shape)??0)+1);
  const marker=g.map(r=>r.schedule.counters.byClass.marker),attempts=g.map(r=>r.schedule.counters.attempts);
  const mw=g.map(r=>r.schedule.timeline.classWindows.marker),markerWindowMs=mw.filter(w=>w.firstStartMs!==null).map(w=>round(w.lastEndMs-w.firstStartMs));
  out.groups[head+'.'+page+'.'+kind]={rows:g.length,distinctShapes:shapes.size,shapeCounts:[...shapes.values()].sort((a,b)=>b-a),preInputHashes:[...new Set(g.map(r=>r.schedule.preInput.exactHash))].length,
   // Phase structure (where the build's phase markers fell) apart from the call schedule: reported, never compared.
   phaseStructures:[...new Set(g.map(r=>r.schedule.phaseHash))].length,
   // Marker counts apart from the full attempt counts, as the comparison requires.
   markerAttempts:dist(marker),fullAttempts:dist(attempts),pollCycleReps:dist(g.flatMap(r=>r.schedule.pollCycleReps)),
   byClassMedian:Object.fromEntries(Object.keys(g[0].schedule.counters.byClass).map(c=>[c,median(g.map(r=>r.schedule.counters.byClass[c]))])),
   timing:{auditSpanMs:dist(g.map(r=>r.clocks?.auditSpanMs).filter(Number.isFinite)),rpcMs:dist(g.map(r=>r.clocks?.rpcMs).filter(Number.isFinite)),markerWindowMs:dist(markerWindowMs),
    markerCallMs:dist(mw.map(w=>w.callMs)),markerRouteMs:phaseDist(g,'markedField'),walkMs:phaseDist(g,'walk'),snapshotMs:dist(g.map(r=>r.routeTimings?.snapshotMs).filter(Number.isFinite)),auditOverheadMs:dist(g.map(r=>r.schedule.timeline.overheadMs))}};
 }
 // Gate 1: discovery, every read through classification of the resolved field, identical across plain, short and long concealed.
 // Gate 2: the concealed short and long whole-schedule shapes (each poll phase reduced to its terminal path) are equal rep by rep;
 // the sets of shapes are reported beside it, and a set that matches does not excuse a rep that does not.
 for(const head of heads)for(const page of pages){
  const k=head+'.'+page;
  const kinds=GATE_KINDS.map(kind=>sel(head,page,kind)),all=kinds.flat();
  if(all.length){
   // A typed row needs its head's pre-input boundary (both event hooks, per that head's provenance) and an actual first posted event.
   const missing=kinds.some(g=>!g.length),weak=all.some(r=>!r.schedule.complete||!r.schedule.preInput.available),noInput=all.some(r=>r.schedule.preInput.boundary!=='event');
   const hashes=new Set(all.map(r=>r.schedule.preInput.exactHash));
   // Distinct pre-input reads are excused only as one walk that a time bound ended where another went on (walkBoundDivergence).
   const reps=[...new Map(all.map(r=>[r.schedule.preInput.exactHash,r])).values()],bound=!missing&&!weak&&!noInput&&hashes.size>1?reconcile(reps,'pre',full):null;
   out.gates['preInputIdentical:'+k]=missing||weak?'unknown':noInput?'fail':hashes.size===1||bound.ok?'pass':'fail';
   const [,s,l]=kinds,sl=s.concat(l);
   // The poll phase is what normalizes the schedule: without its hook in the build the shapes are not comparable.
   const weak2=sl.some(r=>!r.schedule.complete||!r.schedule.preInput.available||!r.schedule.phasesApplied?.includes('poll'));
   const excuse=(x,y)=>walkBoundDivergence(full(x.tag),full(y.tag),'whole');
   const cmp=s.length&&l.length?setCompare(s,l):null,pairs=s.length&&l.length?repPairs(s,l,full,excuse):null;
   // The sets of shapes match when each shape of one is equal, or equal up to the walk bound, to a shape of the other.
   const setsMatch=()=>{const uniq=rs=>[...new Map(rs.map(r=>[r.schedule.shape,r])).values()],A=uniq(s),B=uniq(l),eq=(x,y)=>x.schedule.shape===y.schedule.shape||excuse(x,y).excused;return A.every(x=>B.some(y=>eq(x,y)))&&B.every(y=>A.some(x=>eq(x,y)))};
   out.gates['concealShortLong:'+k]=!s.length||!l.length||weak2?'unknown'
    :sl.some(r=>r.schedule.preInput.boundary!=='event')||!(cmp.equalSets||setsMatch())||pairs.shapeEqual+pairs.walkBoundEqual!==pairs.pairs?'fail'
    :pairs.pairs===0||pairs.unpairedA+pairs.unpairedB>0?'unknown':'pass';
   out.informational['preInputIdentical:'+k]={distinctPreInputs:hashes.size,...(bound?{walkBound:{ok:bound.ok,pairs:bound.pairs.slice(0,12)}}:{}),perKind:Object.fromEntries(GATE_KINDS.map((kind,i)=>[kind,[...new Set(kinds[i].map(r=>r.schedule.preInput.exactHash))].length])),
    ...(hashes.size>1?{example:(()=>{const base=all[0],other=all.find(r=>r.schedule.preInput.exactHash!==base.schedule.preInput.exactHash),c=compareAudits(full(base.tag)??base,full(other.tag)??other);return {a:base.tag,b:other.tag,preNamesDiff:c.preInput.countsDiff}})()}:{})};
   out.informational['concealShortLong:'+k]={...(cmp??{}),...(pairs??{})};
   // Plain against concealed: informational only, since #354's plain and concealed caret confirmation schedules differ by design.
   out.informational['plainVsConcealed:'+k]=Object.fromEntries([['secretShort',s],['secretLong',l]].map(([name,g])=>[name,g.length&&kinds[0].length?{...setCompare(kinds[0],g),...repPairs(kinds[0],g,full)}:null]));
  }
  // Which bound ended each walk, per row, with the reads that corroborate it (informational; the equality gates above use it).
  const bounded=audited.filter(r=>r.head===head&&r.page===page&&r.schedule?.walks?.segments?.some(g=>g.reason!==null));
  if(bounded.length)out.informational['walkBounds:'+k]={rows:bounded.length,undemonstrated:bounded.filter(r=>r.schedule.walks.segments.some(g=>g.reason!==null&&!g.demonstrated)).length,
   perRow:bounded.slice(0,60).map(r=>({tag:r.tag,kind:r.kind,walks:r.schedule.walks.segments.filter(g=>g.reason!==null)}))};
  // A password field: no text, range, length or marker read is attempted, except marker names the caller permits for this
  // head and page and only before the first input event (the fix's pre-input route on a large page). Every secure row is checked.
  const sec=sel(head,page,'secure');
  if(sec.length){
   const permitted=new Set(securePermitted[k]?.names??[]),bad=[];
   for(const r of sec){
    const c=r.schedule.counters,pre=r.schedule.preInput.byName??{},markerPre=Object.keys(pre).filter(n=>/TextMarker/.test(n)),markerAll=Object.keys(c.markerByName??{});
    const reasons=[];
    for(const cls of ['text','range','length'])if(c.byClass[cls]>0)reasons.push(cls);
    if(markerAll.some(n=>!permitted.has(n)))reasons.push('marker-not-permitted');
    if(markerAll.some(n=>!markerPre.includes(n)||(r.schedule.postInput.byName?.[n]??0)>0))reasons.push('marker-after-input');
    if((r.audit354?.textReadAttempts??0)>0||(r.audit354?.rangeReadAttempts??0)>0)reasons.push('audit354-reads');
    if(!r.audit354)reasons.push('audit354-missing');
    if(reasons.length)bad.push({tag:r.tag,reasons});
   }
   const weak=sec.some(r=>!r.schedule.complete);
   out.gates['secureNoValueReads:'+k]=weak?'unknown':bad.length?'fail':'pass';
   out.informational['secureNoValueReads:'+k]={rows:sec.length,permittedMarkerNames:[...permitted],failing:bad.slice(0,10),
    attemptsByClass:Object.fromEntries(VALUE_BEARING.map(c=>[c,sec.map(r=>r.schedule.counters.byClass[c])])),audit354:sec.map(r=>r.audit354)};
  }
 }
 // Marker routing, over every kind of a head and page (a secure row among them). The baseline head makes no marker operation. The
 // candidate makes, on any page, only the one allowed pair before its first event: the web area's selected-range read, then the
 // element lookup for that range's marker on the same receiver. On the large page every row makes it (the route is what finds the
 // field there); on the small page a row may skip it. Any other marker operation, any after the first event, and any from another
 // thread fails the head and page. Outcomes are not consulted, so what an answer was cannot excuse an extra call.
 for(const head of heads)for(const page of pages){
  const role=head===BASELINE_HEAD?'baseline':head===CANDIDATE_HEAD?'candidate':null;
  const rowsHere=audited.filter(r=>r.head===head&&r.page===page&&r.schedule);
  if(!role||!rowsHere.length)continue;
  const k=head+'.'+page,required=role==='candidate'&&page==='large',verdicts=rowsHere.map(r=>({tag:r.tag,kind:r.kind,...routingOf(r)}));
  const bad=verdicts.filter(v=>role==='baseline'?v.shape!=='none':v.shape==='invalid'||(required&&v.shape==='none'));
  const kindsHere=new Set(rowsHere.map(r=>r.kind)),lacking=required?['plain','secretShort','secretLong','secure'].filter(kind=>!kindsHere.has(kind)):[];
  out.gates['markerRouting:'+k]=rowsHere.some(r=>!r.schedule.complete||!r.schedule.preInput.available)||lacking.length?'unknown':bad.length?'fail':'pass';
  out.informational['markerRouting:'+k]={role,rows:rowsHere.length,withPair:verdicts.filter(v=>v.shape==='pair').length,withoutMarker:verdicts.filter(v=>v.shape==='none').length,
   invalid:verdicts.filter(v=>v.shape==='invalid').length,missingKinds:lacking,failing:bad.slice(0,10).map(v=>({tag:v.tag,kind:v.kind,shape:v.shape,reasons:v.reasons})),
   routeMs:{markerRoute:phaseDist(rowsHere,'markedField'),walk:phaseDist(rowsHere,'walk')}};
 }
 // Head against head, per page and kind: informational.
 if(heads.length>=2)for(const page of pages)for(const kind of ['plain','secretShort','secretLong','secure']){
  const [h1,h2]=heads,a=sel(h1,page,kind),b=sel(h2,page,kind);
  if(a.length&&b.length)out.informational['headDiff:'+h1+'-'+h2+'.'+page+'.'+kind]={...setCompare(a,b),markerAttempts:[dist(a.map(r=>r.schedule.counters.byClass.marker)),dist(b.map(r=>r.schedule.counters.byClass.marker))],fullAttempts:[dist(a.map(r=>r.schedule.counters.attempts)),dist(b.map(r=>r.schedule.counters.attempts))],...repPairs(a,b,full)};
 }
 out.ok=Object.values(out.gates).every(s=>s==='pass')&&out.rows>0;
 return out;
}
