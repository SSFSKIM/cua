// Offline + incremental tables for the existing #354 kit's A/B mode. No browser, engine or GUI.
// Final collection: ab-table.mjs <artifact-root> [--only all|browser-editor,...].
// Without --only, scope is the observed shards, not a claim that all workflow shards were downloaded.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {abPlan,summarize} from '../ab-model.mjs';
import {matrix} from '../matrix.mjs';
function tsv(rows,columns){return [columns.join('\t'),...rows.map(r=>columns.map(k=>r[k]==null?'':typeof r[k]==='object'?JSON.stringify(r[k]):r[k]).join('\t'))].join('\n')+'\n'}
export function writeTables(out,rows,collection={status:'incremental',complete:false}){
 mkdirSync(out,{recursive:true});const s=summarize(rows),privacy=rows.filter(r=>r.recordKind==='cell'&&['unsupported','secret'].includes(r.part)).map(r=>({id:r.id,arm:r.arm,browser:r.browser,editor:r.editor,part:r.part,variant:r.variant,valid:r.valid,unconfirmed:r.answer?.unconfirmed??false,textReadAttempts:r.audit?.textReadAttempts??null,rangeReadAttempts:r.audit?.rangeReadAttempts??null,privacyViolation:!!r.privacyViolation,findings:r.privacyFindings??[]}));
 writeFileSync(join(out,'summary.json'),JSON.stringify({...s,privacy,collection},null,2));
 writeFileSync(join(out,'rates.tsv'),tsv(s.groups,['arm','browser','editor','part','key','length','variant','attempted','valid','invalid','success','unconfirmed','keysUnconfirmed','otherErrors','wrong','wrongSuccess','falseUnconfirmed','privacyViolations']));
 writeFileSync(join(out,'cost.tsv'),tsv(s.cost,['arm','browser','length','path','n','p50','p95','max']));
 writeFileSync(join(out,'privacy.tsv'),tsv(privacy,['id','arm','browser','editor','part','variant','valid','unconfirmed','textReadAttempts','rangeReadAttempts','privacyViolation','findings']));
 if(collection.arms)writeFileSync(join(out,'coverage.tsv'),tsv(collection.arms,['arm','browser','shard','reps','planned','attempted','valid','complete','missing','invalid','unexpected','secretLogLeaks','contractFailures','problems']));
 writeFileSync(join(out,'wrong-successes.jsonl'),s.wrongSuccesses.map(r=>JSON.stringify(r)).join('\n')+(s.wrongSuccesses.length?'\n':''));
 const paired=[];
 for(const m of s.cost.filter(c=>c.arm==='main')){const b=s.cost.find(c=>c.arm==='branch'&&c.browser===m.browser&&c.length===m.length&&c.path===m.path);if(b)paired.push({browser:m.browser,length:m.length,path:m.path,mainN:m.n,branchN:b.n,mainP50:m.p50,branchP50:b.p50,deltaP50:+(b.p50-m.p50).toFixed(2),mainP95:m.p95,branchP95:b.p95,deltaP95:+(b.p95-m.p95).toFixed(2)})}
 writeFileSync(join(out,'cost-ab.tsv'),tsv(paired,['browser','length','path','mainN','branchN','mainP50','branchP50','deltaP50','mainP95','branchP95','deltaP95']));
 const diagnostics=rows.filter(r=>r.recordKind==='cell'&&r.expectedAnswer).map(r=>({arm:r.arm,browser:r.browser,editor:r.editor,part:r.part,variant:r.variant,rep:r.rep,expectedAnswer:r.expectedAnswer,errorName:r.answer?.errorName??null,confirmed:r.readbackStatus?.confirmed??false,keysUnconfirmed:r.readbackStatus?.keysUnconfirmed??0,checkpoints:r.readbackStatus?.checkpoints??0,correct:r.correct,requestedExact:r.requestedExact,contractFailure:!!r.contractFailure,privacyViolation:!!r.privacyViolation,serviceError:r.secretService?.error?.code??null}));
 writeFileSync(join(out,'diagnostics.tsv'),tsv(diagnostics,['arm','browser','editor','part','variant','rep','expectedAnswer','errorName','confirmed','keysUnconfirmed','checkpoints','correct','requestedExact','contractFailure','privacyViolation','serviceError']));
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
    if(c&&['part','editor','key','length','variant','rep','concealed','privateField'].some(k=>(r[k]??null)!==(c[k]??null)))issues.push('row/plan mismatch: '+r.id);
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
 return {paths:paths.sort(),rows,collection:collectionCoverage(sets,only)};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,flag,only,...extra]=process.argv.slice(2);
 if(!root||(flag!==undefined&&(flag!=='--only'||!only))||extra.length)throw Error('usage: ab-table.mjs <downloaded-run-directory> [--only all|browser-editor,...]');
 const {paths,rows,collection}=collect(root,{only}),s=writeTables(root,rows,collection);
 console.log(JSON.stringify({status:collection.status,collection,artifacts:paths.length,rows:rows.length,branchWrongSuccesses:s.wrongSuccesses.filter(r=>r.arm==='branch').map(r=>({id:r.id,browser:r.browser,editor:r.editor,engine:r.engine})),groups:s.groups.length}));
 if(!collection.complete){console.error('INCOMPLETE A/B COLLECTION: inspect summary.json collection and coverage.tsv; tables are partial evidence only.');process.exitCode=1}
}
