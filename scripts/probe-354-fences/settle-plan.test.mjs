import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SETTLE_MODE,settlePlan,measurementRefs} from './settle-plan.mjs';
import {planFor,matrixFor,buildArmsFor,runArmsFor,validateRunInputs} from './caret.mjs';
import {collect} from './offline/ab-table.mjs';
const before='3141f1709451ebf77e3b94c5500308d105619f6f',after='1bac401717e99877c34969b44f8e73952691b6f3';
const refs={main:'9020bb18acb9091f817a4b648f7c332174b11153',branch:before,before,after};
test('race/clean comparison preserves the full 20-rep grid and adds only both Safari no-key forms',()=>{
 let total=0;for(const arm of ['main','branch'])for(const {browser,shard} of matrixFor('all',SETTLE_MODE).include){
  const p=settlePlan({browser,editor:shard,arm,reps:20});total+=p.length;
  assert.equal(p.filter(c=>c.part==='race').length,60);assert.equal(p.filter(c=>c.part==='clean').length,60);
  for(const key of ['cmd+a','cmd+z','cmd+v'])assert.equal(p.filter(c=>c.part==='race'&&c.key===key).length,20);
  for(const length of [30,120,500])assert.equal(p.filter(c=>c.part==='clean'&&c.length===length).length,20);
  const extra=p.filter(c=>!['race','clean'].includes(c.part));
  if(browser==='safari'&&shard==='input'){assert.equal(extra.length,arm==='branch'?60:40);assert.equal(extra.filter(c=>c.part==='no-key'&&!c.secret).length,20);assert.equal(extra.filter(c=>c.secret&&c.variant==='equality').length,20);assert.equal(extra.filter(c=>c.part==='large-page'&&c.largePageNodes>=1500&&!c.secret).length,arm==='branch'?20:0);assert.ok(extra.every(c=>c.key===null));}
  else assert.deepEqual(extra,[]);
  assert.equal(new Set(p.map(c=>c.id)).size,p.length);
  assert.deepEqual(planFor({browser,editor:shard,arm,reps:20,diagnostic:SETTLE_MODE}),p);
 }
 assert.equal(total,2980);assert.deepEqual(buildArmsFor(SETTLE_MODE),['main','branch']);
 assert.deepEqual(runArmsFor(SETTLE_MODE,'safari','textarea'),['main','branch']);
 assert.deepEqual(runArmsFor(SETTLE_MODE,'safari','input'),['branch','main']);
 assert.throws(()=>validateRunInputs({diagnostic:SETTLE_MODE,reps:10,smoke:false}));
});
test('unconfirmed after pin refuses before build; selected references cannot silently use the historical main control',()=>{
 assert.throws(()=>measurementRefs(SETTLE_MODE,{...refs,after:''}),/immutable|supplied|confirmed/);
 assert.deepEqual(measurementRefs(SETTLE_MODE,refs),{main:before,branch:after});
 assert.deepEqual(measurementRefs('firefox-caret',refs),{main:refs.main,branch:before});
 assert.throws(()=>measurementRefs(SETTLE_MODE,{...refs,after:before}),/differ/);
 const cli=fileURLToPath(new URL('./caret.mjs',import.meta.url)),env={...process.env,MAIN_REF:refs.main,BRANCH_REF:before,SETTLE_BEFORE_REF:before,SETTLE_AFTER_REF:''};
 const held=spawnSync(process.execPath,[cli,'refs',SETTLE_MODE],{env,encoding:'utf8'});assert.notEqual(held.status,0);assert.equal(held.stdout,'');
 const ready=spawnSync(process.execPath,[cli,'refs',SETTLE_MODE],{env:{...env,SETTLE_AFTER_REF:after},encoding:'utf8'});assert.equal(ready.status,0,ready.stderr);assert.equal(ready.stdout,`main_ref=${before}\nbranch_ref=${after}\n`);
});
test('collector certifies both new-head arms and cannot hide a missing Safari secret retry',t=>{
 const root=mkdtempSync(join(tmpdir(),'settle-grid-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let secretFile,secretRows;
 for(const arm of ['main','branch'])for(const {browser,shard} of matrixFor('all',SETTLE_MODE).include){
  const plan=settlePlan({browser,editor:shard,arm,reps:20}),dir=join(root,browser+'-'+shard,arm);mkdirSync(dir,{recursive:true});
  const identity={cohort:SETTLE_MODE,arm,browser,shard,kit:'c'.repeat(40),engine:arm==='main'?before:after};
  const rows=plan.map(c=>({...c,...identity,recordKind:'cell',valid:true,correct:true,typeRPC:{raw:{result:{meta:{typeReadback:{confirmed:true,snapshotMs:20}}}},durationMs:50}}));
  writeFileSync(join(dir,'config.json'),JSON.stringify({...identity,reps:20,smoke:false,planned:plan.length,coverage:{planned:plan.length,valid:plan.length,missing:0,invalid:0,complete:true,aborted:null}}));
  const path=join(dir,'rows.jsonl');writeFileSync(path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');if(arm==='branch'&&browser==='safari'&&shard==='input'){secretFile=path;secretRows=rows}
 }
 const complete=collect(root,{only:'all',cohort:SETTLE_MODE});assert.equal(complete.collection.complete,true);assert.equal(complete.rows.length,2980);
 const cli=fileURLToPath(new URL('./offline/ab-table.mjs',import.meta.url));
 const rendered=spawnSync(process.execPath,[cli,root,'--only','all','--cohort',SETTLE_MODE],{encoding:'utf8'});assert.equal(rendered.status,0,rendered.stderr);
 const report=JSON.parse(readFileSync(join(root,'settle-summary.json'),'utf8'));
 assert.equal(report.scope.reps,20);assert.equal(report.safety.reduce((n,g)=>n+g.validCells,0),2980);assert.equal(report.overall.reduce((n,g)=>n+g.valid,0),2880);
 assert.ok(report.overall.every(g=>g.falseUnconfirmed.numerator===0&&g.falseUnconfirmed.denominator===240));
 assert.equal(report.safety.reduce((n,g)=>n+g.wrongSuccesses,0),0);
 const large=secretRows.find(r=>r.part==='large-page');large.largePageNodes=12;writeFileSync(secretFile,secretRows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 assert.equal(collect(root,{only:'all',cohort:SETTLE_MODE}).collection.complete,false);large.largePageNodes=1600;
 const missing=secretRows.find(r=>r.secret);writeFileSync(secretFile,secretRows.filter(r=>r!==missing).map(r=>JSON.stringify(r)).join('\n')+'\n');
 const partial=collect(root,{only:'all',cohort:SETTLE_MODE});assert.equal(partial.collection.complete,false);assert.ok(partial.collection.arms.find(a=>a.arm==='branch'&&a.browser==='safari'&&a.shard==='input').missing.includes(missing.id));
 assert.throws(()=>collect(root,{only:'all',cohort:'primary'}),/cohort mismatch/);
});
