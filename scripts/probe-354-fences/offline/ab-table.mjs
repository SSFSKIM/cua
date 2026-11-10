// Offline + incremental tables for the existing #354 kit's A/B mode. No browser, engine or GUI.
// Final collection: ab-table.mjs <artifact-root> [--only all|browser-editor,...].
// Without --only, scope is the observed shards, not a claim that all workflow shards were downloaded.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {abPlan,summarize,answer} from '../ab-model.mjs';
import {quantiles} from '../classify.mjs';
import {matrix} from '../matrix.mjs';
import {readbackStatus,needsForegroundReference,renderedVerdict} from '../ab-extra.mjs';
function tsv(rows,columns){return [columns.join('\t'),...rows.map(r=>columns.map(k=>r[k]==null?'':typeof r[k]==='object'?JSON.stringify(r[k]):r[k]).join('\t'))].join('\n')+'\n'}
function rescoreRendered(rows){return rows.map(r=>{
 if(r.recordKind!=='cell'||!needsForegroundReference(r))return r;
 const verdict=renderedVerdict(r,r.renderedEvidence?.reference,r.renderedEvidence?.measured);
 return verdict.scorable?{...r,correct:verdict.correct,renderedVerdict:verdict}:{...r,valid:false,correct:null,renderedVerdict:verdict,oracleWarning:verdict.reason};
})}
function secretReports(rows){
 const pairGroups=new Map(),latencyGroups=new Map(),confirmation=new Map();
 for(const r of rows.filter(r=>r.recordKind==='cell')){
  const comparison=r.part==='secret-selection'?'selection':r.part==='secret'&&['one-return','three-returns'].includes(r.variant)?'returns':null;
  if(comparison){
   const d={arm:r.arm,browser:r.browser,comparison},key=JSON.stringify(d),variants=comparison==='selection'?['equal','different']:['one-return','three-returns'];
   if(!latencyGroups.has(key))latencyGroups.set(key,{...d,variants,rows:[]});latencyGroups.get(key).rows.push(r);
   const pairKey=key+'/'+r.rep;if(!pairGroups.has(pairKey))pairGroups.set(pairKey,{...d,rep:r.rep,variants});
   pairGroups.get(pairKey)[r.variant===variants[0]?'left':'right']=r;
  }
  if(r.part!=='secret'||r.variant!=='equality')continue;
  const key=JSON.stringify([r.arm,r.browser]);
  if(!confirmation.has(key))confirmation.set(key,{arm:r.arm,browser:r.browser,attempted:0,valid:0,success:0,confirmed:0,successConfirmed:0,typeUnconfirmed:0,finalMatch:0,otherErrors:0,invalid:0,refusalReasons:{}});
  const g=confirmation.get(key);g.attempted++;
  if(!r.valid){g.invalid++;continue}g.valid++;
  const a=answer(r.typeRPC.raw),status=readbackStatus(r.typeRPC.raw);
  g.success+=+a.success;g.confirmed+=+status.confirmed;g.successConfirmed+=+(a.success&&status.confirmed);g.typeUnconfirmed+=+a.unconfirmed;g.finalMatch+=+(r.correct===true);g.otherErrors+=+(!a.success&&!a.unconfirmed);
  if(!a.success){const reason=status.reason??a.errorName??'(not reported)';g.refusalReasons[reason]=(g.refusalReasons[reason]??0)+1}
 }
 const pairs=[...pairGroups.values()].map(({left,right,variants,...d})=>({...d,leftVariant:variants[0],rightVariant:variants[1],leftId:left?.id??null,rightId:right?.id??null,leftValid:left?.valid??false,rightValid:right?.valid??false,metadataEqual:(d.comparison==='selection'?right?.secretSelectionEqual:right?.secretReadbackEqual)??null}));
 const paths={engineSocket:r=>r.typeRPC?.engineTiming?.durationMs,trusted:r=>r.typeRPC?.durationMs,snapshot:r=>(r.typeRPC?.raw?.result?.meta??r.typeRPC?.raw?.error?.meta)?.typeReadback?.snapshotMs},latency=[];
 for(const {rows,variants,...d} of latencyGroups.values())for(const [path,value] of Object.entries(paths)){
  const stats=variant=>quantiles(rows.filter(r=>r.valid&&r.variant===variant).map(value)),left=stats(variants[0]),right=stats(variants[1]);
  latency.push({...d,path,leftVariant:variants[0],rightVariant:variants[1],leftN:left.n,leftP50:left.p50,leftP95:left.p95,rightN:right.n,rightP50:right.p50,rightP95:right.p95});
 }
 return {secretComparisons:{required:true,excludedFields:['snapshotMs'],latencyInformational:true,pairs,latency},secretConfirmation:[...confirmation.values()]};
}
export function writeTables(out,rows,collection={status:'incremental',complete:false}){
 rows=rescoreRendered(rows);
 const oracleWarnings=rows.filter(r=>r.oracleWarning).map(r=>({id:r.id,arm:r.arm,browser:r.browser,editor:r.editor,reason:r.oracleWarning}));
 mkdirSync(out,{recursive:true});const s=summarize(rows),reports=secretReports(rows),privacy=rows.filter(r=>r.recordKind==='cell'&&['unsupported','secret','secret-selection'].includes(r.part)).map(r=>({id:r.id,arm:r.arm,browser:r.browser,editor:r.editor,part:r.part,variant:r.variant,valid:r.valid,unconfirmed:r.answer?.unconfirmed??false,textReadAttempts:r.audit?.textReadAttempts??null,rangeReadAttempts:r.audit?.rangeReadAttempts??null,privacyViolation:!!r.privacyViolation,findings:r.privacyFindings??[]}));
 writeFileSync(join(out,'summary.json'),JSON.stringify({...s,privacy,collection,oracleWarnings,...reports},null,2));
 writeFileSync(join(out,'oracle-warnings.tsv'),tsv(oracleWarnings,['arm','browser','editor','id','reason']));
 writeFileSync(join(out,'secret-pairs.tsv'),tsv(reports.secretComparisons.pairs,['arm','browser','comparison','rep','leftVariant','rightVariant','leftId','rightId','leftValid','rightValid','metadataEqual']));
 writeFileSync(join(out,'secret-pair-latency.tsv'),tsv(reports.secretComparisons.latency,['arm','browser','comparison','path','leftVariant','rightVariant','leftN','leftP50','leftP95','rightN','rightP50','rightP95']));
 writeFileSync(join(out,'secret-confirmation.tsv'),tsv(reports.secretConfirmation,['arm','browser','attempted','valid','success','confirmed','successConfirmed','typeUnconfirmed','finalMatch','otherErrors','invalid','refusalReasons']));
 writeFileSync(join(out,'rates.tsv'),tsv(s.groups,['arm','browser','editor','part','key','length','variant','attempted','valid','invalid','success','unconfirmed','keysUnconfirmed','otherErrors','wrong','wrongSuccess','falseUnconfirmed','privacyViolations']));
 writeFileSync(join(out,'cost.tsv'),tsv(s.cost,['arm','browser','length','path','n','p50','p95','max']));
 writeFileSync(join(out,'privacy.tsv'),tsv(privacy,['id','arm','browser','editor','part','variant','valid','unconfirmed','textReadAttempts','rangeReadAttempts','privacyViolation','findings']));
 if(collection.arms)writeFileSync(join(out,'coverage.tsv'),tsv(collection.arms,['arm','browser','shard','reps','planned','attempted','valid','complete','missing','invalid','unexpected','secretLogLeaks','contractFailures','problems']));
 writeFileSync(join(out,'wrong-successes.jsonl'),s.wrongSuccesses.map(r=>JSON.stringify(r)).join('\n')+(s.wrongSuccesses.length?'\n':''));
 const paired=[];
 for(const m of s.cost.filter(c=>c.arm==='main')){const b=s.cost.find(c=>c.arm==='branch'&&c.browser===m.browser&&c.length===m.length&&c.path===m.path);if(b)paired.push({browser:m.browser,length:m.length,path:m.path,mainN:m.n,branchN:b.n,mainP50:m.p50,branchP50:b.p50,deltaP50:+(b.p50-m.p50).toFixed(2),mainP95:m.p95,branchP95:b.p95,deltaP95:+(b.p95-m.p95).toFixed(2)})}
 writeFileSync(join(out,'cost-ab.tsv'),tsv(paired,['browser','length','path','mainN','branchN','mainP50','branchP50','deltaP50','mainP95','branchP95','deltaP95']));
 const diagnostics=rows.filter(r=>r.recordKind==='cell'&&r.expectedAnswer).map(r=>({arm:r.arm,browser:r.browser,editor:r.editor,part:r.part,variant:r.variant,rep:r.rep,expectedAnswer:r.expectedAnswer,expectedReason:r.expectedReason??null,errorName:r.typeRPC?.raw?.error?.errorName??null,...readbackStatus(r.typeRPC?.raw),correct:r.correct,requestedExact:r.requestedExact,finalSelection:r.finalSelection,secretReadbackEqual:r.secretReadbackEqual,contractFailure:!!r.contractFailure,privacyViolation:!!r.privacyViolation,serviceError:r.secretService?.error?.code??null}));
 writeFileSync(join(out,'diagnostics.tsv'),tsv(diagnostics,['arm','browser','editor','part','variant','rep','expectedAnswer','expectedReason','errorName','reason','confirmed','keysUnconfirmed','checkpoints','correct','requestedExact','finalSelection','secretReadbackEqual','contractFailure','privacyViolation','serviceError']));
 return s;
}
function collectionCoverage(sets,only){
 const all=matrix('all').include,problems=[];
 const identity=s=>s.config??s.rows[0];
 for(const s of sets){const d=identity(s);if(!d||!['main','branch'].includes(d.arm)||!all.some(c=>c.browser===d.browser&&c.shard===d.shard))problems.push('unrecognized arm/shard in '+s.directory)}
 const observed=all.filter(c=>sets.some(s=>{const d=identity(s);return d?.browser===c.browser&&d?.shard===c.shard}));
 const expected=only===undefined?observed:matrix(only).include;
 if(!expected.length)problems.push('no A/B arm artifacts');
 for(const c of observed)if(!expected.some(e=>e.id===c.id))problems.push('unexpected shard: '+c.id);
 const arms=[];
 for(const {id,browser,shard} of expected){
  const shardSets=sets.filter(s=>{const d=identity(s);return d?.browser===browser&&d?.shard===shard});
  const configs=shardSets.map(s=>s.config).filter(Boolean),reference=configs[0];
  if(configs.some(c=>c.reps!==reference.reps||c.smoke!==reference.smoke||c.kit!==reference.kit))problems.push('unpaired configuration: '+id);
  for(const arm of ['main','branch']){
   const matches=shardSets.filter(s=>identity(s)?.arm===arm),config=matches[0]?.config,rows=matches.flatMap(s=>s.rows),issues=[];
   if(!matches.length)issues.push('missing '+arm+' arm');
   if(matches.length>1)issues.push('multiple artifacts for one arm/shard');
   if(!config)issues.push('missing per-arm config');
   const reps=config?.reps??reference?.reps;
   let plan=[];
   if(![1,20].includes(reps))issues.push('expected 20/full or 1/smoke repetitions');
   else plan=abPlan({browser,editor:shard,reps});
   if(config&&config.smoke!==(reps===1))issues.push('reps/smoke mismatch');
   const expectedCells=new Map(plan.map(c=>[c.id,c])),seen=new Map();
   for(const r of rows){
    if(seen.has(r.id))issues.push('duplicate planned cell: '+r.id);seen.set(r.id,r);
    if(config&&['arm','browser','shard','kit','engine'].some(k=>r[k]!==config[k]))issues.push('row/config identity mismatch: '+r.id);
    const c=expectedCells.get(r.id);
    if(c&&['part','editor','key','length','variant','rep','concealed','privateField','expectedAnswer','expectedReason','preventInput','secret','returnUnits'].some(k=>(r[k]??null)!==(c[k]??null)))issues.push('row/plan mismatch: '+r.id);
   }
   const missing=plan.filter(c=>!seen.has(c.id)).map(c=>c.id),invalid=rows.filter(r=>r.valid!==true).map(r=>r.id),unexpected=rows.filter(r=>!expectedCells.has(r.id)).map(r=>r.id);
   const valid=plan.filter(c=>seen.get(c.id)?.valid===true).length,planned=plan.length||null;
   if(missing.length)issues.push('missing planned cells: '+missing.length);
   if(invalid.length)issues.push('invalid cells: '+invalid.length);
   if(unexpected.length)issues.push('unexpected cells: '+unexpected.length);
   const coverage=config?.coverage;
   if(!coverage?.complete||coverage.aborted||coverage.invalid!==0||coverage.planned!==planned||coverage.valid!==valid||coverage.missing!==planned-valid||config?.planned!==planned)issues.push('per-arm config coverage incomplete or inconsistent');
   arms.push({arm,browser,shard,reps,planned,attempted:rows.length,valid,missing,invalid,unexpected,secretLogLeaks:config?.secretLogLeaks??null,contractFailures:config?.contractFailures??[],complete:issues.length===0,problems:issues});
  }
 }
 const complete=!problems.length&&arms.length>0&&arms.every(a=>a.complete);
 return {status:complete?'COMPLETE':'INCOMPLETE',complete,scope:only===undefined?'observed shards':'explicit selection',shards:expected.map(c=>c.id),problems,arms};
}
export function collect(root,{only}={}){
 const sets=[],paths=[],rows=[],ids=new Set();
 function walk(d){
  const entries=readdirSync(d,{withFileTypes:true}),set={directory:d,rows:[]};
  for(const e of entries){const p=join(d,e.name);if(e.isDirectory())walk(p);
   else if(e.name==='config.json')set.config=JSON.parse(readFileSync(p,'utf8'));
   else if(e.name==='rows.jsonl'){
    paths.push(p);
    for(const line of readFileSync(p,'utf8').split('\n').filter(Boolean)){
     const r=JSON.parse(line);if(r.recordKind!=='cell')continue;
     const key=[r.kit,r.engine,r.arm,r.browser,r.shard,r.id].join('/');if(ids.has(key))throw Error('duplicate attempt in artifacts: '+key);ids.add(key);rows.push(r);set.rows.push(r);
    }
   }
  }
  if(set.config||set.rows.length)sets.push(set);
 }
 walk(root);
 return {paths:paths.sort(),rows:rescoreRendered(rows),collection:collectionCoverage(sets.map(s=>({...s,rows:rescoreRendered(s.rows)})),only)};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,flag,only,...extra]=process.argv.slice(2);
 if(!root||(flag!==undefined&&(flag!=='--only'||!only))||extra.length)throw Error('usage: ab-table.mjs <downloaded-run-directory> [--only all|browser-editor,...]');
 const {paths,rows,collection}=collect(root,{only}),s=writeTables(root,rows,collection);
 console.log(JSON.stringify({status:collection.status,collection,artifacts:paths.length,rows:rows.length,branchWrongSuccesses:s.wrongSuccesses.filter(r=>r.arm==='branch').map(r=>({id:r.id,browser:r.browser,editor:r.editor,engine:r.engine})),groups:s.groups.length}));
 if(!collection.complete){console.error('INCOMPLETE A/B COLLECTION: inspect summary.json collection and coverage.tsv; tables are partial evidence only.');process.exitCode=1}
}
