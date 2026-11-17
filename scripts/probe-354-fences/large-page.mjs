// Public, after-only observer cell. A DOM count is not an AX count; the post-type sidecar records AX size separately.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export function largePagePrefix(n){
 if(!Number.isSafeInteger(n)||n<0||n>5000)throw Error('invalid public filler size');
 if(n===0)return '';
 return '<div id="large-before-editor" role="group" aria-label="Filler controls">'+Array.from({length:n},(_,i)=>`<button type="button" tabindex="-1" id="large-node-${i}">Filler ${i}</button>`).join('')+'</div>';
}
export function largeMarkerEvidence(s,{pid,coverPid}){
 if(s?.schema!=='probe354.safariLargeMarker.v1'||s.pid!==pid||s.frontmostPidBefore!==coverPid||s.frontmostPidAfter!==coverPid||s.frontmost?.activationDetected===true||s.frontmost?.changed===true||!Array.isArray(s.queries)||!Number.isFinite(s.startedAt)||!Number.isFinite(s.endedAt))throw Error('large-page marker scope/foreground evidence unavailable');
 return s;
}
export async function observeLargeMarker({read,replyAt,pid,coverPid,now=Date.now,timeoutMs=8000}){
 const requestedAt=now();let timer,result;
 try{result=await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('large-page marker timeout'),{fatalDiagnostic:true})),timeoutMs)})])}finally{clearTimeout(timer)}
 const receivedAt=now(),evidence={...result,transport:{requestedAt,receivedAt,roundTripMs:receivedAt-requestedAt,afterReplyMs:requestedAt-replyAt}};
 try{return largeMarkerEvidence(evidence,{pid,coverPid})}catch(e){e.diagnosticEvidence=evidence;throw e}
}
const scalar=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v).replaceAll('\t','\\t').replaceAll('\n','\\n');
const tsv=(rs,keys)=>[keys.join('\t'),...rs.map(r=>keys.map(k=>scalar(r[k])).join('\t'))].join('\n')+'\n';
export function writeLargePageTables(out,rows){
 const cases=[],queries=[];
 for(const r of rows.filter(r=>r.part==='large-page')){
  const s=r.largeMarker,raw=r.typeRPC?.raw,rb=(raw?.result?.meta??raw?.error?.meta)?.typeReadback;
  cases.push({id:r.id,rep:r.rep,valid:r.valid,correct:r.correct,contractFailure:r.contractFailure,reply:raw?.error?'error':raw?.result?'result':'missing',errorName:raw?.error?.errorName,reason:rb?.reason,confirmed:rb?.confirmed,typeMs:r.typeRPC?.durationMs,requestedFiller:r.largePageNodes,dom:r.settledSetup?.largePage,largeAXElements:r.largeAXElements,largeAXSizeVerified:r.largeAXSizeVerified,nativeWalks:r.walkTrace?.walks??null,traceError:r.walkTraceError,textMarker:s?.textMarker,largeGroup:s?.largeGroup,elements:s?.elements,markerSnapshotMs:Number.isFinite(s?.startedAt)&&Number.isFinite(s?.endedAt)?s.endedAt-s.startedAt:null,transport:s?.transport,frontmost:s?.frontmost});
  for(const q of s?.queries??[])queries.push({...q,id:r.id,rep:r.rep});
 }
 if(!cases.length)return {cases:0};mkdirSync(out,{recursive:true});
 writeFileSync(join(out,'large-page-summary.json'),JSON.stringify({primaryEvidence:false,observerEffect:true,cases},null,2));
 writeFileSync(join(out,'large-page-cases.tsv'),tsv(cases,Object.keys(cases[0])));
 const keys=[...new Set(['id','rep','phase','path','attribute','axError','valueType','startedAt','endedAt','durationMs',...queries.flatMap(q=>Object.keys(q))])];
 writeFileSync(join(out,'large-page-markers.tsv'),tsv(queries,keys));return {cases:cases.length};
}
