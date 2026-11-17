import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as safari from '../safari-ax.mjs';
const HEAD='3141f1709451ebf77e3b94c5500308d105619f6f',KIT='4ab1ebd6ad275192a2b79cdd7ca2973b2c2528d0';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'safari-ax-collect-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const config={cohort:'safari-no-key-ax',arm:'branch',browser:'safari',shard:'input',engine:HEAD,kit:KIT,reps:1,planned:2,coverage:{planned:2,valid:2,missing:0,complete:true,invalid:0,aborted:null}},rows=['no-key','key-first'].map(variant=>({recordKind:'safari-ax-diagnostic',cohort:'safari-no-key-ax',arm:'branch',browser:'safari',shard:'input',engine:HEAD,kit:KIT,id:`safari-ax/${variant}/1`,variant,rep:1,valid:true}));const save=()=>{writeFileSync(join(root,'config.json'),JSON.stringify(config));writeFileSync(join(root,'safari-ax-rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n')};save();return {root,config,rows,save}}
test('Safari diagnostic collection certifies the branch-only plan, not primary rows',t=>{
 const f=fixture(t);writeFileSync(join(f.root,'rows.jsonl'),'not primary JSON');const r=safari.collectSafariAX(f.root);assert.equal(r.collection.complete,true);assert.equal(r.rows.length,2);assert.equal(r.collection.planned,2);
});
test('missing/invalid diagnostic cases remain explicit and cannot certify ten repetitions',t=>{
 const f=fixture(t);f.rows.pop();f.save();const r=safari.collectSafariAX(f.root);assert.equal(r.collection.complete,false);assert.deepEqual(r.collection.missing,['safari-ax/key-first/1']);
});
test('mixed cohorts, control arms and duplicate observations are rejected',t=>{
 const f=fixture(t);f.rows[0].cohort='primary';f.save();assert.throws(()=>safari.collectSafariAX(f.root),/cohort/);
 f.rows[0].cohort='safari-no-key-ax';f.rows[0].arm='main';f.save();assert.throws(()=>safari.collectSafariAX(f.root),/branch/);
 f.rows[0].arm='branch';f.rows.push({...f.rows[0]});f.save();assert.throws(()=>safari.collectSafariAX(f.root),/duplicate/);
});
