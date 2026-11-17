// Offline side of the focused-field walk trace for the after-only Safari large-page probe. Pure: no engine, browser or GUI.
// The wire is {probe354FocusWalkTrace:{id,walks:[...]}} on engine stderr; every field is a number, a boolean or a fixed
// reason name, so nothing text-bearing can pass the strict parser. A request with no walker invocation has walks:[].
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
// Every way the pinned walk (a7529ee0) can stop: three bounds, three failed reads, a second focused field, or it read everything.
export const WALK_REASONS=Object.freeze(['node','time','depth','role-failed','focus-failed','children-failed','multiple','no-candidate','finished']);
const BOUND=['node','time','depth'],FAILED=['role-failed','focus-failed','children-failed'];
const WALK_KEYS=['index','visited','queued','elapsedMs','leaves','focused','claimed','cutShort','reason','depthReached','failedAXError'];
export const WALK_ID=/^large-page\/input\/plain\/[1-9]\d*$/;
const object=o=>o!=null&&typeof o==='object'&&!Array.isArray(o);
const count=n=>Number.isSafeInteger(n)&&n>=0;
const exactly=(o,keys)=>object(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
// Only the plain, non-concealed large-page input cell is traced; every other cell gets no extra argument.
export function walkArgs(cell){
 if(!object(cell)||typeof cell.id!=='string'||!WALK_ID.test(cell.id))return {};
 if(cell.part!==undefined&&cell.part!=='large-page')return {};
 if(cell.secret||cell.concealed||cell.privateField)return {};
 return {probe354WalkTrace:cell.id};
}
function validWalk(w,i){
 if(!exactly(w,WALK_KEYS)||w.index!==i+1||!count(w.visited)||!count(w.queued)||w.visited>w.queued)return false;
 if(typeof w.elapsedMs!=='number'||!Number.isFinite(w.elapsedMs)||w.elapsedMs<0)return false;
 if(!count(w.leaves)||!count(w.focused)||w.focused>w.leaves||w.leaves>w.visited)return false;
 if(!WALK_REASONS.includes(w.reason)||w.claimed!==(w.reason==='finished')||w.cutShort!==BOUND.includes(w.reason))return false;
 // The focused count tells the exits apart: a claim has one, no candidate none, a second one stops the walk at two.
 if(w.reason==='finished'&&w.focused!==1||w.reason==='no-candidate'&&w.focused!==0||w.reason==='multiple'&&w.focused!==2||!['multiple','finished','no-candidate'].includes(w.reason)&&w.focused>1)return false;
 // A failed read keeps the system's AX error (0: the call succeeded but the value was missing or of the wrong type).
 if(FAILED.includes(w.reason)?!Number.isSafeInteger(w.failedAXError):w.failedAXError!==null)return false;
 return w.depthReached===null?w.visited===0:count(w.depthReached)&&w.visited>0;
}
export function validWalkTrace(t){
 return exactly(t,['id','walks'])&&typeof t.id==='string'&&WALK_ID.test(t.id)&&Array.isArray(t.walks)&&t.walks.every(validWalk);
}
// Rejected lines are reported by a fixed message, never echoed: a bad line may carry arbitrary text.
export function parseWalkLine(line){
 let o;try{o=JSON.parse(line)}catch{return {ignored:true}}
 if(!object(o)||!Object.hasOwn(o,'probe354FocusWalkTrace'))return {ignored:true};
 return Object.keys(o).length===1&&validWalkTrace(o.probe354FocusWalkTrace)?{trace:o.probe354FocusWalkTrace}:{error:'invalid walk trace'};
}
export const walkLogLine=line=>{const r=parseWalkLine(line);return r.trace?JSON.stringify({probe354FocusWalkTrace:r.trace}):'[non-diagnostic engine log withheld]'};
const tsv=(rows,keys)=>[keys.join('\t'),...rows.map(r=>keys.map(k=>r[k]==null?'':r[k]).join('\t'))].join('\n')+'\n';
const isLargePage=r=>object(r)&&typeof r.id==='string'&&WALK_ID.test(r.id);
// Reads row.walkTrace only. A missing trace is "missing", an unparseable one "invalid"; neither is turned into a cutoff.
export function writeWalkTables(out,rows){
 mkdirSync(out,{recursive:true});
 const cases=[],walks=[];
 for(const r of rows.filter(isLargePage)){
  const t=r.walkTrace,ok=validWalkTrace(t)&&t.id===r.id,list=ok?t.walks:[];
  cases.push({id:r.id,arm:r.arm??null,valid:r.valid??null,trace:t==null?'missing':ok?'valid':'invalid',walkerRan:ok?list.length>0:null,walks:ok?list.length:null,
   anyCutShort:ok?list.some(w=>w.cutShort):null,anyFailedRead:ok?list.some(w=>w.failedAXError!==null):null,anyClaimed:ok?list.some(w=>w.claimed):null,reasons:ok?list.map(w=>w.reason).join(','):''});
  for(const w of list)walks.push({id:r.id,arm:r.arm??null,walk:w.index,visited:w.visited,queued:w.queued,elapsedMs:w.elapsedMs,leaves:w.leaves,focused:w.focused,claimed:w.claimed,cutShort:w.cutShort,reason:w.reason,depthReached:w.depthReached,failedAXError:w.failedAXError});
 }
 writeFileSync(join(out,'walk-summary.json'),JSON.stringify({cohort:'safari-large-page-walk',observationOnly:true,cases},null,2));
 writeFileSync(join(out,'walk-cases.tsv'),tsv(cases,['id','arm','valid','trace','walkerRan','walks','anyCutShort','anyFailedRead','anyClaimed','reasons']));
 writeFileSync(join(out,'walk-walks.tsv'),tsv(walks,['id','arm','walk','visited','queued','elapsedMs','leaves','focused','claimed','cutShort','reason','depthReached','failedAXError']));
 return {cases:cases.length,walks:walks.length};
}
