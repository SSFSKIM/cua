// Branch-only, public-fixture AX path diagnosis. Never primary-rate or control-pool evidence.
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {matrix} from './matrix.mjs';
import {NO_KEY_TEXT} from './followup.mjs';
export const SAFARI_AX_MODE='safari-no-key-ax';
export function safariAXPlan({browser,editor,arm,reps}){
 if(browser!=='safari'||editor!=='input'||arm!=='branch'||!Number.isInteger(reps)||reps<1)throw Error('Safari AX diagnostic requires branch/safari-input and positive repetitions');
 const out=[];for(let rep=1;rep<=reps;rep++)for(const variant of ['no-key','key-first'])out.push({part:'safari-ax-diagnostic',editor:'input',variant,rep,id:`safari-ax/${variant}/${rep}`,key:null,holdKey:variant==='key-first'?'cmd+a':null,text:NO_KEY_TEXT,length:NO_KEY_TEXT.length});return out;
}
export function safariAXMatrix(only='all'){
 if(!['all','safari-input'].includes(only.trim()))throw Error('Safari AX diagnostic matrix must be safari-input');return matrix('safari-input');
}
export function collectSafariAX(root){
 const rows=[],configs=[],paths=[],seen=new Set();
 function cohort(found){if(found!==SAFARI_AX_MODE)throw Error('Safari AX cohort mismatch')}
 function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name==='config.json'){const c=JSON.parse(readFileSync(p,'utf8'));cohort(c.cohort);configs.push(c)}else if(e.name==='safari-ax-rows.jsonl'){
  paths.push(p);for(const line of readFileSync(p,'utf8').split('\n').filter(Boolean)){const r=JSON.parse(line);cohort(r.cohort);if(r.recordKind!=='safari-ax-diagnostic'||r.arm!=='branch')throw Error('Safari AX branch-only diagnostic row required');const key=JSON.stringify([r.engine,r.id]);if(seen.has(key))throw Error('duplicate Safari AX observation');seen.add(key);rows.push(r)}
 }}}walk(root);
 if(!rows.length)throw Error('no Safari AX diagnostic observations');
 const problems=[];if(configs.length!==1)problems.push('expected one branch config');const c=configs[0];
 if(c&&c.arm!=='branch')throw Error('Safari AX branch config required');
 const plan=c?safariAXPlan({browser:c.browser,editor:c.shard,arm:c.arm,reps:c.reps}):[],expected=new Set(plan.map(r=>r.id));
 const missing=plan.filter(p=>!rows.some(r=>r.id===p.id)).map(r=>r.id),invalid=rows.filter(r=>r.valid!==true).map(r=>r.id),unexpected=rows.filter(r=>!expected.has(r.id)).map(r=>r.id);
 if(missing.length)problems.push('missing cells');if(invalid.length)problems.push('invalid cells');if(unexpected.length)problems.push('unexpected cells');
 if(c&&rows.some(r=>r.engine!==c.engine||r.kit!==c.kit||r.browser!==c.browser||r.shard!==c.shard))problems.push('row/config mismatch');
 if(!c?.coverage?.complete||c.coverage.aborted||c.coverage.valid!==rows.filter(r=>r.valid).length||c.coverage.planned!==plan.length||c.planned!==plan.length)problems.push('config coverage incomplete or inconsistent');
 return {rows,paths,collection:{cohort:SAFARI_AX_MODE,complete:problems.length===0,planned:plan.length,attempted:rows.length,valid:rows.filter(r=>r.valid).length,missing,invalid,unexpected,problems}};
}
export async function observeSafariCase(cell,io){
 const out={holdVerified:false};
 try{
  if(cell.holdKey){
   out.holdRPC=await io.hold(cell.holdKey);
   if(out.holdRPC.raw?.error||out.holdRPC.raw?.result==null)throw Error('Command hold request failed');
   out.holdReference=await io.verifyAndRestore();
   if(out.holdReference.verified!==true)throw Error('Command hold reference not established');
   out.holdVerified=true;
  }
  for(const phase of ['before','after']){
   let timer,s;try{s=await Promise.race([io.snapshot(phase),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Safari AX snapshot timeout'),{fatalDiagnostic:true})),io.snapshotTimeoutMs??8000)})])}finally{clearTimeout(timer)}
   out[phase+'AX']=s;
   if(s?.schema!=='probe354.safariAXPaths.v1'||s.pid!==io.pid||s.frontmostPidBefore!==io.coverPid||s.frontmostPidAfter!==io.coverPid||s.frontmost?.activationDetected===true||s.frontmost?.changed===true||!Array.isArray(s.queries)||!Number.isFinite(s.startedAt)||!Number.isFinite(s.endedAt))throw Error('Safari AX snapshot scope/foreground evidence unavailable');
   await io.assertCovered();if(phase==='before')out.typeRPC=await io.type();
  }
  out.afterDOM=await io.readDOM();return out;
 }catch(e){e.diagnosticEvidence=out;throw e}
}
const scalar=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v).replaceAll('\t','\\t').replaceAll('\n','\\n');
const tsv=(rows,keys)=>[keys.join('\t'),...rows.map(r=>keys.map(k=>scalar(r[k])).join('\t'))].join('\n')+'\n';
const duration=s=>Number.isFinite(s?.startedAt)&&Number.isFinite(s?.endedAt)?s.endedAt-s.startedAt:null;
export function writeSafariAXTables(out,rows){
 mkdirSync(out,{recursive:true});const cases=[],queries=[],walks=[];
 for(const r of rows){
  const raw=r.typeRPC?.raw,meta=raw?.result?.meta??raw?.error?.meta,rb=meta?.typeReadback;
  cases.push({id:r.id,variant:r.variant,rep:r.rep,valid:r.valid,holdKey:r.holdKey,holdRoute:r.holdRPC?.meta?.inputRoute,holdVerified:r.holdVerified===true,answerKind:raw?.error?'error':raw?.result!=null?'result':'missing',errorName:raw?.error?.errorName,reason:rb?.reason,confirmed:rb?.confirmed===true,typeMs:r.typeRPC?.durationMs,finalMatch:r.correct,beforeSnapshotMs:duration(r.beforeAX),afterSnapshotMs:duration(r.afterAX),flags:r.beforeAX?.flags});
  for(const [phase,s]of [['before',r.beforeAX],['after',r.afterAX]])if(s){
   for(const q of s.queries??[])queries.push({...q,id:r.id,variant:r.variant,rep:r.rep,phase,queryPhase:q.phase,snapshotOrdinal:s.ordinal,frontmostPidBefore:s.frontmostPidBefore,frontmostPidAfter:s.frontmostPidAfter});
   for(const [walk,detail]of Object.entries(s.walks??{}))walks.push({...detail,id:r.id,variant:r.variant,rep:r.rep,phase,walk,snapshotOrdinal:s.ordinal});
  }
 }
 writeFileSync(join(out,'summary.json'),JSON.stringify({cohort:SAFARI_AX_MODE,primaryEvidence:false,observerEffect:true,cases},null,2));
 writeFileSync(join(out,'safari-ax-cases.tsv'),tsv(cases,['id','variant','rep','valid','holdKey','holdRoute','holdVerified','answerKind','errorName','reason','confirmed','typeMs','finalMatch','beforeSnapshotMs','afterSnapshotMs','flags']));
 const qkeys=[...new Set(['id','variant','rep','phase','path','attribute','startedAt','endedAt','axError','valueType','value','frontmostPidBefore','frontmostPidAfter',...queries.flatMap(q=>Object.keys(q))])];
 writeFileSync(join(out,'safari-ax-paths.tsv'),tsv(queries,qkeys));
 const wkeys=[...new Set(['id','variant','rep','phase','walk',...walks.flatMap(w=>Object.keys(w))])];writeFileSync(join(out,'safari-ax-walks.tsv'),tsv(walks,wkeys));
 return {cohort:SAFARI_AX_MODE,primaryEvidence:false,observerEffect:true,cases:cases.length,valid:cases.filter(c=>c.valid).length};
}
