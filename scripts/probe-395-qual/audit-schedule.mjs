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
 // The recorder keeps only the first posted event; a record with more would carry a count of what was typed.
 if(entries.filter(e=>e.api===API.event).length>1)throw new AuditError('audit-record-malformed');
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
// A poll phase is the only place a schedule is normalized. readbackPoll repeats one iteration (role, subrole, value read; a
// caret read joins an iteration that sees the expected value) until the value is confirmed, so how many iterations ran depends on
// timing, not on what was typed. The canonical form keeps the terminal path: from the first caret-bearing iteration (the last
// iteration when none has a caret read), adjacent identical iterations folded. Of what precedes it, only a leading run of
// iterations identical to the terminal iteration without its caret read (the plain role, subrole, value loop) is dropped;
// any other earlier iteration is a different set of calls and stays, in order. So ABC, ABCABC and ABCABCABC all read as ABC;
// ABCDABC and ABCABCDABC both read as ABCD ABC (D being the caret read); ABXABCDABC does not.
// Reads outside the phase and their order are left exactly as recorded. The phase markers carry no weight in a comparison.
const isCall=e=>e.api!==API.phaseBegin&&e.api!==API.phaseEnd&&e.api!==API.event;
const readsRange=e=>[API.single,API.batch,API.param].includes(e.api)&&e.names.some(n=>classOf(n)==='range');
function pollEnd(items,begin){
 let depth=0;
 for(let k=begin+1;k<items.length;k++){
  const e=items[k];
  if((e.api!==API.phaseBegin&&e.api!==API.phaseEnd)||e.names[0]!==items[begin].names[0])continue;
  if(e.api===API.phaseBegin)depth++;
  else if(e.api===API.phaseEnd){if(depth===0)return k;depth--}
 }
 return -1;
}
export function canonicalPoll(body){
 if(!body.length)return {entries:[],iterations:0};
 const first=token(body[0]),iterations=[];
 for(const e of body){if(token(e)===first||!iterations.length)iterations.push([]);iterations.at(-1).push(e)}
 const key=it=>it.map(token).join('|'),caretAt=iterations.findIndex(it=>it.some(readsRange)),terminal=caretAt>=0?caretAt:iterations.length-1;
 const loop=key(iterations[terminal].filter(e=>!readsRange(e)));
 let start=0;while(start<terminal&&key(iterations[start])===loop)start++;
 const kept=[];
 for(const it of iterations.slice(start))if(!kept.length||key(kept.at(-1))!==key(it))kept.push(it);
 return {entries:kept.flat(),iterations:iterations.length};
}
// The ordered AX schedule (calls and phase markers; never keyboard events) with each `poll` phase canonical: its entries, and the
// raw iteration count of each poll phase.
export function canonicalEntries(items,poll='poll'){
 const entries=[],iterations=[];
 for(let i=0;i<items.length;i++){
  const e=items[i];
  if(e.api===API.phaseBegin&&e.names[0]===poll){
   const j=pollEnd(items,i);
   if(j>i){const c=canonicalPoll(items.slice(i+1,j));entries.push(e,...c.entries,items[j]);iterations.push(c.iterations);i=j;continue}
  }
  entries.push(e);
 }
 return {entries,iterations};
}
// The focused-field walk's two bounds, as the pinned sources set them (typeReadbackFocusWalkNodes and typeReadbackFocusWalkMs in
// TypeReadback.swift at main f2c30fc5 and fix 60327d46). The audit patch records which one ended a walk (audit.swift `walkCap`:
// a zero-length `walkCapNodes` or `walkCapTime` phase inside the walk phase, written in the bound's own branch after the engine
// has decided, with no clock read of its own). A bound is DEMONSTRATED only when the walk's own reads agree with the marker:
// one AXRole read per visited node, so exactly `nodes` of them for the node bound; for the time bound fewer than that, in a
// phase at least `ms` long (the phase opens before the engine's clock starts and closes after its last check).
export const WALK_CAP=Object.freeze({nodes:200,ms:40,phase:'walk',markers:Object.freeze({walkCapNodes:'nodes',walkCapTime:'time'})});
const readsOf=(tokens,name)=>tokens.reduce((n,t)=>n+(t.split(':')[1]?.split(/[@!]/)[0].split('+').includes(name)?1:0),0);
// Walk phases of an ordered entry list: the call tokens, and each walk phase as a [start,end) range of them with the bound that
// ended it. `invalid` when the phases do not nest as the patch writes them (a walk inside a walk, an unclosed one, a bound marker
// outside a walk or two inside one): such a schedule is never excused.
export function walkParts(entries){
 const tokens=[],segments=[];let open=null,invalid=false;
 for(const e of entries){
  const name=e.names[0];
  if(e.api===API.phaseBegin&&name===WALK_CAP.phase){if(open)invalid=true;open={start:tokens.length,at:e.atMs,reason:null};continue}
  if(e.api===API.phaseEnd&&name===WALK_CAP.phase){
   if(!open){invalid=true;continue}
   const body=tokens.slice(open.start);
   segments.push({start:open.start,end:tokens.length,reason:open.reason,calls:body.length,roles:readsOf(body,'AXRole'),children:readsOf(body,'AXChildren'),durMs:round(e.atMs+e.durMs-open.at)});
   open=null;continue;
  }
  if(e.api===API.phaseBegin&&WALK_CAP.markers[name]!==undefined){if(!open||open.reason)invalid=true;else open.reason=WALK_CAP.markers[name];continue}
  if(e.api===API.phaseEnd&&WALK_CAP.markers[name]!==undefined)continue;
  if(isCall(e))tokens.push(token(e));
 }
 if(open)invalid=true;
 for(const g of segments)g.demonstrated=g.reason==='nodes'?g.roles===WALK_CAP.nodes:g.reason==='time'?g.roles<WALK_CAP.nodes&&g.durMs>=WALK_CAP.ms:false;
 return {tokens,segments,invalid};
}
// The comparable keys of a list of entries: the calls alone (what a comparison uses) and, apart, with the phase markers.
const keysOf=entries=>({calls:entries.filter(isCall).map(token).join('|'),phased:entries.map(token).join('|')});
// Build everything a row keeps of one engine record. `preInputAvailable` is false when the build lacks an event hook (that
// head's provenance), in which case pre-input is reported unavailable, not empty. The boundary is the first posted event (the
// only one the recorder keeps); a refusal with no event is all pre-input.
export function buildSchedule(rec,{preInputAvailable=true,markerAttemptCap=256}={}){
 const d=typeof rec?.entries==='object'&&rec.id!==undefined&&rec.spanMs!==undefined?rec:decodeRecord(rec);
 const firstEvent=d.entries.findIndex(e=>e.api===API.event),split=firstEvent<0?d.entries.length:firstEvent;
 const preItems=d.entries.slice(0,split),postAll=d.entries.slice(split),postItems=postAll.filter(e=>e.api!==API.event);
 const items=[...preItems,...postItems],calls=d.entries.filter(isCall);
 const whole=canonicalEntries(items),preCanon=canonicalEntries(preItems),postCanon=canonicalEntries(postItems),wholeKeys=keysOf(whole.entries);
 const pre=preItems.filter(isCall),post=postAll.filter(isCall);
 const phases={},open=[];
 for(const e of d.entries){
  if(e.api===API.phaseBegin)open.push(e);
  else if(e.api===API.phaseEnd){
   const i=open.findLastIndex(o=>o.names[0]===e.names[0]);
   if(i>=0){const [b]=open.splice(i,1),p=phases[e.names[0]]??=[];
    // Entries between begin and end by clock, owner thread only: the phase's own calls.
    const inside=calls.filter(x=>x.atMs>=b.atMs&&x.atMs+x.durMs<=e.atMs+e.durMs);
    p.push({startMs:round(b.atMs),endMs:round(e.atMs+e.durMs),durMs:round(e.atMs+e.durMs-b.atMs),calls:inside.length,callMs:round(inside.reduce((s,x)=>s+x.durMs,0))})}
  }
 }
 const at=new Map(d.entries.map((e,i)=>[e,i]));
 const markerEntries=calls.filter(e=>isRead(e)&&e.names.some(n=>classOf(n)==='marker'));
 const classWindows=Object.fromEntries(CLASSES.map(c=>[c,stats(calls.filter(e=>isRead(e)&&e.names.some(n=>classOf(n)===c)))]));
 const event=firstEvent<0?null:d.entries[firstEvent];
 return {
  id:d.id,
  complete:d.dropped===0&&d.aliasOverflow===0&&d.overlaps===0,dropped:d.dropped,aliasOverflow:d.aliasOverflow,overlaps:d.overlaps,
  offThread:d.offThread,offThreadCounts:d.offThreadCounts,aliases:d.aliases,roles:d.roles,subroles:d.subroles,
  preInput:{available:preInputAvailable,boundary:event?'event':'none',entries:pre.length,exactKey:keysOf(preItems).calls,shape:keysOf(preCanon.entries).calls,...counters(pre),timing:stats(pre)},
  postInput:{entries:post.length,shape:keysOf(postCanon.entries).calls,...counters(postAll),timing:stats(post)},
  shape:wholeKeys.calls,phaseKey:wholeKeys.phased,strictKey:keysOf(items).calls,
  // The walk phases and what ended each, over the pre-input reads (compared exactly) and the canonical whole (compared as the shape). In memory only: tokens are not persisted.
  walk:{pre:walkParts(preItems),whole:walkParts(whole.entries)},
  // Raw iteration count of each poll phase: informational, never part of a shape.
  pollCycleReps:whole.iterations,
  counters:counters(d.entries),
  // Clocks are the engine's monotonic clock, relative to the tagged request's begin; they are NOT comparable to any other clock.
  timeline:{spanMs:round(d.spanMs),overheadMs:round(d.overheadMs),firstEntryMs:calls.length?round(calls[0].atMs):null,firstEventMs:event?round(event.atMs):null,
   preInputMs:event?round(event.atMs):null,classWindows,phases,
   markerAttempts:markerEntries.slice(0,markerAttemptCap).map(e=>({atMs:round(e.atMs),durMs:round(e.durMs),api:API_LABEL[e.api],alias:e.alias,names:e.names.filter(n=>classOf(n)==='marker'),outcome:e.outcome,preInput:at.get(e)<split})),markerAttemptsTruncated:markerEntries.length>markerAttemptCap},
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
