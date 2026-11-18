// Pure: decodes the engine's `probe395Audit` record (audit.swift) into a classified, comparable schedule. No I/O.
// Classification reuses #354's vocabulary (text-bearing and selection-range attributes, probe-354-fences/audit.swift; a test
// keeps the lists equal) and adds what #395 needs: text-marker attributes, a length class, and walk/role structure reads.
// Counts and orders only. Nothing here can carry a value because the record holds none.
export class AuditError extends Error{constructor(code){super(code);this.name='AuditError';this.code=code}}
export const API=Object.freeze({single:0,batch:1,param:2,write:3,action:4,event:5,phaseBegin:6,phaseEnd:7,names:8,actionNames:9,hit:10});
const API_LABEL=Object.freeze(['r','b','p','w','a','ev','ph+','ph-','n','an','hit']);
// Same lists as probe-354-fences/audit.swift.
export const TEXT_ATTRIBUTES=Object.freeze(['AXValue','AXSelectedText','AXAttributedValue','AXStringForRange','AXAttributedStringForRange']);
export const RANGE_ATTRIBUTES=Object.freeze(['AXSelectedTextRange','AXSelectedTextRanges']);
const LENGTH_ATTRIBUTES=Object.freeze(['AXNumberOfCharacters']);
const ROLE_ATTRIBUTES=Object.freeze(['AXRole','AXSubrole','AXRoleDescription']);
const WALK_ATTRIBUTES=Object.freeze(['AXChildren','AXVisibleChildren','AXFocused','AXFocusedUIElement','AXFocusedWindow','AXMainWindow','AXWindows','AXParent','AXTopLevelUIElement']);
export const CLASSES=Object.freeze(['text','range','marker','length','role','walk','other']);
// Value-bearing classes: a read of any is an attempt to learn content, selection or length.
export const VALUE_BEARING=Object.freeze(['text','range','marker','length']);
export function classOf(name){
 if(/TextMarker/.test(name))return 'marker'; // a rule, not a closed list: a future marker attribute is a marker read
 if(TEXT_ATTRIBUTES.includes(name))return 'text';
 if(RANGE_ATTRIBUTES.includes(name))return 'range';
 if(LENGTH_ATTRIBUTES.includes(name))return 'length';
 if(ROLE_ATTRIBUTES.includes(name))return 'role';
 if(WALK_ATTRIBUTES.includes(name))return 'walk';
 return 'other';
}
// What a marker attribute asks for. Annotation only; counts are always by the attribute's own name as well.
export function markerKind(name){
 if(/(AttributedString|String)ForTextMarkerRange/.test(name))return 'text';
 if(/LengthForTextMarkerRange/.test(name))return 'length';
 if(/BoundsFor/.test(name))return 'bounds';
 if(/(Index)/.test(name))return 'index';
 if(/(Next|Previous|Left|Right|Line|Paragraph|Sentence|Word|Style)/.test(name))return 'navigation';
 return 'range';
}
const NAME=/^[A-Za-z0-9_+]{1,160}$/;
const int=(v,lo,hi)=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
// Decode and validate. Anything malformed is an AuditError code, never a partial schedule.
export function decodeRecord(rec){
 if(rec==null||typeof rec!=='object'||rec.v!==1||typeof rec.id!=='string'||!Array.isArray(rec.names)||!Array.isArray(rec.e))throw new AuditError('audit-record-malformed');
 if(!rec.names.every(n=>typeof n==='string'&&NAME.test(n))||rec.names.length>70000)throw new AuditError('audit-record-malformed');
 for(const k of ['spanNs','overheadNs','dropped','aliasOverflow','aliases','offThread','overlaps'])if(!int(rec[k],0,Number.MAX_SAFE_INTEGER))throw new AuditError('audit-record-malformed');
 const entries=rec.e.map(x=>{
  if(!Array.isArray(x)||x.length!==6||!int(x[0],0,10)||!int(x[1],0,rec.names.length-1)||!int(x[2],-2,100000)||!int(x[3],0,2)||!int(x[4],0,Number.MAX_SAFE_INTEGER)||!int(x[5],0,Number.MAX_SAFE_INTEGER))throw new AuditError('audit-record-malformed');
  const api=x[0],raw=rec.names[x[1]];
  return {api,names:api===API.batch?raw.split('+').filter(Boolean):[raw],alias:x[2],outcome:x[3],atMs:x[4]/1000,durMs:x[5]/1000};
 });
 const labels=o=>Object.fromEntries(Object.entries(o??{}).filter(([k,v])=>/^\d{1,5}$/.test(k)&&typeof v==='string'&&/^AX[A-Za-z]{1,40}$/.test(v)));
 const offThreadCounts=Object.fromEntries(Object.entries(rec.offThreadCounts??{}).filter(([k,v])=>NAME.test(k)&&int(v,0,1e9)));
 return {id:rec.id,spanMs:rec.spanNs/1e6,overheadMs:rec.overheadNs/1e6,entries,dropped:rec.dropped,aliasOverflow:rec.aliasOverflow,aliases:rec.aliases,offThread:rec.offThread,offThreadCounts,overlaps:rec.overlaps,roles:labels(rec.roles),subroles:labels(rec.subroles)};
}
const OUTCOME=['','!absent','!fail'];
// The token an entry contributes to a shape: api, attribute names, element alias, and its outcome when it is not a plain success.
export function token(e){
 const alias=e.alias>=0?'@e'+e.alias:e.alias===-2?'@overflow':'';
 return API_LABEL[e.api]+':'+e.names.join('+')+alias+OUTCOME[e.outcome];
}
const shapeEntries=entries=>entries.filter(e=>e.api!==API.phaseBegin&&e.api!==API.phaseEnd);
// Collapse contiguous repeated blocks (a poll cycle repeated any number of times) to one block with a repetition count.
// Greedy and deterministic: at each position take the period (1..maxPeriod) that covers the most entries, smaller period on a tie.
export function collapse(tokens,maxPeriod=24){
 const out=[];let i=0;
 while(i<tokens.length){
  let best={p:1,reps:1,cover:1};
  for(let p=1;p<=maxPeriod&&i+p<=tokens.length;p++){
   let reps=1;
   outer:for(;i+(reps+1)*p<=tokens.length;reps++){for(let k=0;k<p;k++)if(tokens[i+k]!==tokens[i+reps*p+k])break outer}
   if(reps>1&&reps*p>best.cover)best={p,reps,cover:reps*p}; // only a block that actually repeats is a cycle
  }
  out.push({block:tokens.slice(i,i+best.p),reps:best.reps});i+=best.cover;
 }
 return out;
}
export const shapeOf=runs=>runs.map(r=>'['+r.block.join(' ')+']').join('');
const round=x=>Math.round(x*1000)/1000;
function counters(entries){
 const byName={},byClass=Object.fromEntries(CLASSES.map(c=>[c,0])),markerByName={},markerByKind={},byApi={},writes={},actions={},events={};
 let attempts=0,calls=0;
 for(const e of entries){
  if(e.api===API.phaseBegin||e.api===API.phaseEnd)continue;
  byApi[API_LABEL[e.api]]=(byApi[API_LABEL[e.api]]??0)+1;
  if(e.api===API.event){events[e.names[0]]=(events[e.names[0]]??0)+1;continue}
  if(e.api===API.write){writes[e.names[0]]=(writes[e.names[0]]??0)+1;continue}
  if(e.api===API.action){actions[e.names[0]]=(actions[e.names[0]]??0)+1;continue}
  if(![API.single,API.batch,API.param].includes(e.api))continue;
  calls++;
  for(const n of e.names){
   attempts++;byName[n]=(byName[n]??0)+1;const c=classOf(n);byClass[c]++;
   if(c==='marker'){markerByName[n]=(markerByName[n]??0)+1;const k=markerKind(n);markerByKind[k]=(markerByKind[k]??0)+1}
  }
 }
 return {calls,attempts,byName,byClass,markerByName,markerByKind,byApi,writes,actions,events};
}
const stats=list=>({calls:list.length,callMs:round(list.reduce((s,e)=>s+e.durMs,0)),maxCallMs:round(list.reduce((m,e)=>Math.max(m,e.durMs),0)),
 firstStartMs:list.length?round(Math.min(...list.map(e=>e.atMs))):null,lastEndMs:list.length?round(Math.max(...list.map(e=>e.atMs+e.durMs))):null});
const isRead=e=>[API.single,API.batch,API.param,API.names,API.actionNames,API.hit].includes(e.api);
// Build everything a row keeps of one engine record. `boundary` names the pre-input boundary: the first posted event, or none when
// the build has no event hook (provenance `eventPost:false`), in which case pre-input is reported unavailable, not empty.
export function buildSchedule(rec,{preInputAvailable=true,markerAttemptCap=256,maxPeriod=24}={}){
 const d=typeof rec?.entries==='object'&&rec.id!==undefined&&rec.spanMs!==undefined?rec:decodeRecord(rec);
 const shaped=shapeEntries(d.entries),tokens=shaped.map(token);
 const firstEvent=shaped.findIndex(e=>e.api===API.event),split=firstEvent<0?shaped.length:firstEvent;
 const pre=shaped.slice(0,split),post=shaped.slice(split),preTokens=tokens.slice(0,split);
 const whole=collapse(tokens,maxPeriod),preRuns=collapse(preTokens,maxPeriod),postRuns=collapse(tokens.slice(split),maxPeriod);
 const repeats=whole.filter(r=>r.reps>1).map(r=>({cycle:r.block.length,reps:r.reps}));
 // Cycle windows: the entry index range each collapsed run covers, mapped to the clocks of its first and last entry.
 let at=0;const cycles=[];
 for(const r of whole){const n=r.block.length*r.reps,a=shaped[at],b=shaped[at+n-1];if(r.reps>1)cycles.push({cycle:r.block.length,reps:r.reps,startMs:round(a.atMs),endMs:round(b.atMs+b.durMs)});at+=n}
 const phases={},open=[];
 for(const e of d.entries){
  if(e.api===API.phaseBegin)open.push(e);
  else if(e.api===API.phaseEnd){
   const i=open.findLastIndex(o=>o.names[0]===e.names[0]);
   if(i>=0){const [b]=open.splice(i,1),p=phases[e.names[0]]??=[];
    // Entries between begin and end by clock, owner thread only: the phase's own calls.
    const inside=shaped.filter(x=>x.api!==API.event&&x.atMs>=b.atMs&&x.atMs+x.durMs<=e.atMs+e.durMs);
    p.push({startMs:round(b.atMs),endMs:round(e.atMs+e.durMs),durMs:round(e.atMs+e.durMs-b.atMs),calls:inside.length,callMs:round(inside.reduce((s,x)=>s+x.durMs,0))})}
  }
 }
 const markerEntries=shaped.filter(e=>isRead(e)&&e.names.some(n=>classOf(n)==='marker'));
 const classWindows=Object.fromEntries(CLASSES.map(c=>[c,stats(shaped.filter(e=>isRead(e)&&e.names.some(n=>classOf(n)===c)))]));
 const events=shaped.filter(e=>e.api===API.event);
 return {
  id:d.id,
  complete:d.dropped===0&&d.aliasOverflow===0&&d.overlaps===0,dropped:d.dropped,aliasOverflow:d.aliasOverflow,overlaps:d.overlaps,
  offThread:d.offThread,offThreadCounts:d.offThreadCounts,aliases:d.aliases,roles:d.roles,subroles:d.subroles,
  preInput:{available:preInputAvailable,boundary:firstEvent<0?'none':'event',entries:pre.length,exactKey:preTokens.join('|'),shape:shapeOf(preRuns),...counters(pre),timing:stats(pre)},
  postInput:{entries:post.length,shape:shapeOf(postRuns),...counters(post),timing:stats(post)},
  shape:shapeOf(whole),runs:whole.length,strictKey:tokens.join('|'),repeats,pollCycleReps:repeats.map(r=>r.reps),
  counters:counters(shaped),
  // Clocks are the engine's monotonic clock, relative to the tagged request's begin; they are NOT comparable to any other clock.
  timeline:{spanMs:round(d.spanMs),overheadMs:round(d.overheadMs),firstEntryMs:shaped.length?round(shaped[0].atMs):null,firstEventMs:events.length?round(events[0].atMs):null,lastEventMs:events.length?round(events.at(-1).atMs):null,
   preInputMs:events.length?round(events[0].atMs):null,classWindows,phases,cycles,
   markerAttempts:markerEntries.slice(0,markerAttemptCap).map(e=>({atMs:round(e.atMs),durMs:round(e.durMs),names:e.names.filter(n=>classOf(n)==='marker'),outcome:e.outcome,preInput:shaped.indexOf(e)<split})),markerAttemptsTruncated:markerEntries.length>markerAttemptCap},
 };
}
const diffCounts=(a,b)=>{const out={};for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if((a[k]??0)!==(b[k]??0))out[k]=[a[k]??0,b[k]??0];return out};
// Exact comparison of two built schedules, nothing normalized away beyond what each key defines. `equal` fields are strict.
export function compareSchedules(a,b){
 if(!a||!b)return {comparable:false};
 const ta=a.strictKey.split('|'),tb=b.strictKey.split('|');
 let first=-1;for(let i=0;i<Math.max(ta.length,tb.length);i++)if(ta[i]!==tb[i]){first=i;break}
 const markerA=a.counters.markerByName,markerB=b.counters.markerByName;
 return {comparable:a.complete&&b.complete,
  preInput:{available:a.preInput.available&&b.preInput.available,exactEqual:a.preInput.exactKey===b.preInput.exactKey,shapeEqual:a.preInput.shape===b.preInput.shape,countsDiff:diffCounts(a.preInput.byName,b.preInput.byName)},
  whole:{shapeEqual:a.shape===b.shape,exactEqual:a.strictKey===b.strictKey,firstDivergence:first,namesDiff:diffCounts(a.counters.byName,b.counters.byName),classDiff:diffCounts(a.counters.byClass,b.counters.byClass)},
  marker:{countsEqual:JSON.stringify(Object.entries(markerA).sort())===JSON.stringify(Object.entries(markerB).sort()),diff:diffCounts(markerA,markerB),total:[a.counters.byClass.marker,b.counters.byClass.marker]},
  full:{attemptsEqual:a.counters.attempts===b.counters.attempts,diff:diffCounts(a.counters.byName,b.counters.byName),total:[a.counters.attempts,b.counters.attempts]},
  pollCycleReps:[a.pollCycleReps,b.pollCycleReps]};
}
