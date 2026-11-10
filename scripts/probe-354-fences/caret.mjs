// Isolated observer-effect diagnostic. No engine/browser execution at module load and no primary rate/cost output.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {abPlan} from './ab-model.mjs';
import {matrix} from './matrix.mjs';
export const CARET_MODE='firefox-caret';
export function planFor({browser,editor,reps,diagnostic='primary'}){
 if(diagnostic==='primary')return abPlan({browser,editor,reps});
 if(diagnostic!==CARET_MODE||browser!=='firefox'||editor!=='input'||!Number.isInteger(reps)||reps<1)throw Error('caret cohort requires firefox-input and positive repetitions');
 const out=[],plain='p'.repeat(64),unicode='a𝄞한';
 for(let rep=1;rep<=reps;rep++)for(const c of [
  {variant:'secret-insertion',secret:true,text:'{{secret:PROBE354}}'},
  {variant:'secret-equal',secret:true,fixtureVariant:'equal',text:'{{secret:PROBE354}}'},
  {variant:'secret-different',secret:true,fixtureVariant:'different',text:'{{secret:PROBE354}}'},
  {variant:'plain-identical',text:plain,seed:plain,selection:[0,plain.length]},
  {variant:'plain-insertion',text:'q'.repeat(64),seed:plain,selection:[3,0]},
  {variant:'plain-unicode',text:unicode,seed:unicode,selection:[0,unicode.length]}
 ]){
  const knownUnits=c.secret?undefined:{codePoints:[...c.text].length,utf16:c.text.length,utf8:Buffer.byteLength(c.text),expectedOffsets:{codePoints:(c.selection?.[0]??3)+[...c.text].length,utf16:(c.selection?.[0]??3)+c.text.length,utf8:(c.selection?.[0]??3)+Buffer.byteLength(c.text)}};
  out.push({...c,part:'caret-diagnostic',editor:'input',key:null,length:null,rep,id:`caret/${c.variant}/${rep}`,knownUnits});
 }
 return out;
}
export function matrixFor(only='all',diagnostic='primary'){
 if(diagnostic==='primary')return matrix(only);
 if(diagnostic!==CARET_MODE||!['all','firefox-input'].includes(only.trim()))throw Error('caret cohort matrix must be firefox-input');
 return matrix('firefox-input');
}
export function traceArgs(diagnostic,id){return diagnostic===CARET_MODE?{probe354Audit:id,probe354CaretTrace:true}:{}}
const finite=n=>typeof n==='number'&&Number.isFinite(n),integer=Number.isSafeInteger,decimal=n=>typeof n==='string'&&/^-?\d+$/.test(n);
const object=o=>o!=null&&typeof o==='object'&&!Array.isArray(o);
const only=(o,keys)=>object(o)&&Object.keys(o).every(k=>keys.includes(k));
function rangeReply(r,index,source='production'){
 return only(r,['source','api','attribute','pollIndex','startedAt','endedAt','axError','embeddedAXError','shape','range'])&&r.source===source&&['single','batch'].includes(r.api)&&r.attribute==='AXSelectedTextRange'&&r.pollIndex===index&&finite(r.startedAt)&&finite(r.endedAt)&&integer(r.axError)&&(r.embeddedAXError===undefined||integer(r.embeddedAXError))&&['range','missing','wrongType','axError'].includes(r.shape)&&(r.shape==='range'?only(r.range,['location','length'])&&decimal(r.range.location)&&decimal(r.range.length):r.range===null);
}
function characterReply(r,source='diagnostic-added'){
 return only(r,['source','attribute','queried','startedAt','endedAt','axError','shape','count'])&&r.source===source&&r.attribute==='AXNumberOfCharacters'&&typeof r.queried==='boolean'&&(r.queried?finite(r.startedAt)&&finite(r.endedAt)&&integer(r.axError)&&['number','missing','wrongType'].includes(r.shape):r.startedAt===null&&r.endedAt===null&&r.axError===null&&r.shape==='not-probed')&&(r.shape==='number'?decimal(r.count):r.count===null);
}
function validTrace(t){
 if(!only(t,['id','readerHook','startedAt','typingCompleteAt','endedAt','polls','outsidePollRanges'])||!/^caret\/[a-z-]+\/[1-9]\d*$/.test(t.id??'')||!['none','TypeReadback'].includes(t.readerHook)||!finite(t.startedAt)||!finite(t.endedAt)||!(t.typingCompleteAt===null||finite(t.typingCompleteAt))||!Array.isArray(t.polls)||!Array.isArray(t.outsidePollRanges))return false;
 if(t.readerHook==='none'&&t.polls.length)return false;
 return t.outsidePollRanges.every(r=>rangeReply(r,null))&&t.polls.every((p,i)=>only(p,['index','readerRead','startedAt','endedAt','outcome','rangeRead','ranges','characterCount'])&&p.index===i+1&&integer(p.readerRead)&&p.readerRead>0&&finite(p.startedAt)&&finite(p.endedAt)&&['unreadable','equal','equalUnconsumed','differs','none'].includes(p.outcome)&&Array.isArray(p.ranges)&&p.rangeRead===(p.ranges.length>0)&&p.ranges.every(r=>rangeReply(r,p.index))&&characterReply(p.characterCount));
}
export function parseCaretLine(line){
 let o;try{o=JSON.parse(line)}catch{return {ignored:true}}
 if(!object(o)||!Object.hasOwn(o,'probe354CaretTrace'))return {ignored:true};
 return only(o,['probe354CaretTrace'])&&validTrace(o.probe354CaretTrace)?{trace:o.probe354CaretTrace}:{error:'invalid caret trace'};
}
export function caretLogLine(line){const r=parseCaretLine(line);return r.trace?JSON.stringify({probe354CaretTrace:r.trace}):'[non-diagnostic engine log withheld]'}
export async function lateCaretSnapshot({replyAt,read,now=Date.now,wait=ms=>new Promise(ok=>setTimeout(ok,ms))}){
 await wait(Math.max(0,replyAt+300-now()));const requestedAt=now(),snapshot=await read(),endedAt=now();
 const observedAt=snapshot?.range?.startedAt??snapshot?.characterCount?.startedAt??snapshot?.startedAt??requestedAt;
 const metadata={source:'diagnostic-added-late',replyAt,requestedDelayMs:300,requestedAt,endedAt,actualDelayMs:observedAt-replyAt};
 if(!object(snapshot)||snapshot.valueRead!==false||Object.hasOwn(snapshot,'value')||(snapshot.range&&!rangeReply(snapshot.range,null,'diagnostic-added-late'))||(snapshot.characterCount&&!characterReply(snapshot.characterCount,'diagnostic-added-late')))return {...metadata,error:'unsafe late snapshot'};
 // Sidecar is a guarded, value-free API boundary. Keep only its fixed metadata/observation fields.
 const allowed=['startedAt','endedAt','ok','role','subrole','secure','readable','valueRead','reason','error','range','characterCount'];
 return {...metadata,snapshot:Object.fromEntries(Object.entries(snapshot).filter(([k])=>allowed.includes(k)))};
}
export function sanitizeCaretRow(row){
 const withheld=new Set(['text','seed','expectedFinal','requestedFinal','final','before','actual','expected','value','domText','innerText','html']);
 function copy(v,path=[]){
  if(typeof v==='string'&&(path.includes('typeRPC')||path.includes('raw')||path.includes('secretService'))&&!['jsonrpc','errorName','reason','inputRoute','route','intervention','delivery','name','code'].includes(String(path.at(-1)).split('/').at(-1)))return '[string detail withheld in caret diagnostic]';
  if(v==null||typeof v!=='object')return v;
  if(Array.isArray(v))return v.map((x,i)=>copy(x,[...path,i]));
  const out={};for(const [k,x] of Object.entries(v)){
   if(withheld.has(k)||/excerpt/i.test(k))continue;
   if(['problem','rebindProblem','message'].includes(k)){out[k]='[text-bearing detail withheld in caret diagnostic]';continue}
   out[k]=copy(x,[...path,k]);
  }return out;
 }
 const source={...row};if(source.caretTrace&&!validTrace(source.caretTrace)){source.caretTrace=null;source.traceError='invalid caret trace'}
 const out=copy(source);delete out.trace;
 for(const key of ['reset','setup','settledSetup','priorKeyEffect','samples'])delete out[key];
 out.evidenceClass='observer-effect diagnostic; not primary rates/cost';return out;
}
const tsv=(rows,keys)=>[keys.join('\t'),...rows.map(r=>keys.map(k=>r[k]==null?'':typeof r[k]==='object'?JSON.stringify(r[k]):r[k]).join('\t'))].join('\n')+'\n';
export function writeCaretTables(out,rows){
 mkdirSync(out,{recursive:true});rows=rows.map(sanitizeCaretRow);const cases=[],polls=[],outside=[],final=[];
 for(const r of rows){
  const t=r.caretTrace,raw=r.typeRPC?.raw,rb=(raw?.result?.meta??raw?.error?.meta)?.typeReadback;
  cases.push({id:r.id,arm:r.arm,variant:r.variant,valid:r.valid,readerHook:t?.readerHook??'missing',productionPolls:t?.polls.length??0,outsideRangeReads:t?.outsidePollRanges.length??0,inputRoute:(raw?.result?.meta??raw?.error?.meta)?.inputRoute,engineSocketMs:r.typeRPC?.engineTiming?.durationMs??r.typeRPC?.durationMs,trustedMs:r.secret?r.typeRPC?.durationMs:null,startedAt:t?.startedAt,typingCompleteAt:t?.typingCompleteAt,replyAt:r.typeRPC?.engineTiming?.endedAt??r.typeRPC?.endedAt,replyKind:raw?.error?'error':raw?.result!=null?'result':'missing',errorCode:raw?.error?.code??null,errorName:raw?.error?.errorName??null,reason:rb?.reason??null,typeReadbackReported:rb!=null,confirmed:rb?.confirmed??null,knownUnits:r.knownUnits,unitInterpretation:'unresolved; observations only'});
  for(const p of t?.polls??[])for(const q of p.ranges.length?p.ranges:[null])polls.push({id:r.id,arm:r.arm,variant:r.variant,poll:p.index,readerRead:p.readerRead,pollStartedAt:p.startedAt,pollEndedAt:p.endedAt,outcome:p.outcome,rangeRead:p.rangeRead,rangeSource:q?.source??'production',rangeAPI:q?.api,rangeStartedAt:q?.startedAt,rangeEndedAt:q?.endedAt,axError:q?.axError,embeddedAXError:q?.embeddedAXError,rangeShape:q?.shape,location:q?.range?.location,length:q?.range?.length,countSource:p.characterCount.source,countStartedAt:p.characterCount.startedAt,countEndedAt:p.characterCount.endedAt,countError:p.characterCount.axError,countShape:p.characterCount.shape,numberOfCharacters:p.characterCount.count});
  for(const q of t?.outsidePollRanges??[])outside.push({id:r.id,arm:r.arm,variant:r.variant,phase:'outside-poll',source:q.source,api:q.api,startedAt:q.startedAt,endedAt:q.endedAt,axError:q.axError,embeddedAXError:q.embeddedAXError,shape:q.shape,location:q.range?.location,length:q.range?.length});
  const late=r.lateCaretSnapshot,s=late?.snapshot;
  final.push({id:r.id,arm:r.arm,variant:r.variant,source:late?.source,replyAt:late?.replyAt,requestedDelayMs:late?.requestedDelayMs,actualDelayMs:late?.actualDelayMs,startedAt:s?.startedAt,endedAt:s?.endedAt,guardReason:s?.reason,rangeStartedAt:s?.range?.startedAt,rangeEndedAt:s?.range?.endedAt,countStartedAt:s?.characterCount?.startedAt,countEndedAt:s?.characterCount?.endedAt,rangeError:s?.range?.axError,rangeShape:s?.range?.shape,location:s?.range?.range?.location,length:s?.range?.range?.length,countError:s?.characterCount?.axError,countShape:s?.characterCount?.shape,numberOfCharacters:s?.characterCount?.count});
 }
 writeFileSync(join(out,'summary.json'),JSON.stringify({cohort:CARET_MODE,primaryEvidence:false,observerEffect:true,cases},null,2));
 const write=(name,data,keys)=>writeFileSync(join(out,name),tsv(data,keys));
 write('caret-cases.tsv',cases,['id','arm','variant','valid','readerHook','productionPolls','outsideRangeReads','inputRoute','engineSocketMs','trustedMs','startedAt','typingCompleteAt','replyAt','replyKind','errorCode','errorName','reason','typeReadbackReported','confirmed','knownUnits','unitInterpretation']);
 write('caret-outside.tsv',outside,['id','arm','variant','phase','source','api','startedAt','endedAt','axError','embeddedAXError','shape','location','length']);
 write('caret-polls.tsv',polls,['id','arm','variant','poll','readerRead','pollStartedAt','pollEndedAt','outcome','rangeRead','rangeSource','rangeAPI','rangeStartedAt','rangeEndedAt','axError','embeddedAXError','rangeShape','location','length','countSource','countStartedAt','countEndedAt','countError','countShape','numberOfCharacters']);
 write('caret-final.tsv',final,['id','arm','variant','source','replyAt','requestedDelayMs','actualDelayMs','startedAt','endedAt','guardReason','rangeStartedAt','rangeEndedAt','countStartedAt','countEndedAt','rangeError','rangeShape','location','length','countError','countShape','numberOfCharacters']);
 return {cohort:CARET_MODE,primaryEvidence:false,observerEffect:true,cases:cases.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]!=='matrix')throw Error('usage: caret.mjs matrix <only> <primary|firefox-caret>');
 console.log('matrix='+JSON.stringify(matrixFor(process.argv[3]??'all',process.argv[4]??'primary')));
}
