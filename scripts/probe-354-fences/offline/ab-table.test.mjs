// Offline collector boundary tests: real files and CLI, no engine or GUI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {abPlan} from '../ab-model.mjs';
import {writeTables} from './ab-table.mjs';

const cli=fileURLToPath(new URL('./ab-table.mjs',import.meta.url));
function fixture(t){const root=mkdtempSync(join(tmpdir(),'probe354-ab-table-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root}
function arm(root,arm,{browser='cft',shard='input',reps=20,rows,coverage,config=true}={}){
 const plan=abPlan({browser,editor:shard,reps});
 rows??=plan.map(c=>({...c,recordKind:'cell',arm,browser,shard,kit:'c'.repeat(40),engine:(arm==='main'?'a':'b').repeat(40),valid:true,correct:true,typeRPC:{raw:{result:{meta:{entered:c.length}}},durationMs:10}}));
 const dir=join(root,`${browser}-${shard}`,arm);mkdirSync(dir,{recursive:true});
 if(config)writeFileSync(join(dir,'config.json'),JSON.stringify({arm,browser,shard,reps,smoke:reps===1,kit:'c'.repeat(40),engine:(arm==='main'?'a':'b').repeat(40),planned:plan.length,coverage:coverage??{planned:plan.length,valid:plan.length,missing:0,complete:true,invalid:0,setupFailures:0,aborted:null}}));
 if(rows.length)writeFileSync(join(dir,'rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 return rows;
}
function run(root,...args){
 const p=spawnSync(process.execPath,[cli,root,...args],{encoding:'utf8'});
 assert.equal(p.signal,null,p.stderr);
 return {...p,summary:JSON.parse(readFileSync(join(root,'summary.json'),'utf8'))};
}
test('a complete 20-rep pair is a successful final collection with explicit coverage',t=>{
 const root=fixture(t);arm(root,'main');arm(root,'branch');
 const r=run(root);
 assert.equal(r.status,0,r.stderr);
 assert.equal(r.summary.collection.complete,true);
 assert.equal(r.summary.collection.arms.length,2);
 assert.ok(r.summary.collection.arms.every(a=>a.planned===280&&a.valid===280&&a.complete));
 assert.equal(r.summary.groups.reduce((n,g)=>n+g.attempted,0),560);
 assert.match(readFileSync(join(root,'cost-ab.tsv'),'utf8'),/cft\t30\tclean-all/);
});

test('an absent arm is conspicuous and non-successful, without hiding the collected rates',t=>{
 const root=fixture(t);arm(root,'main');
 const r=run(root);
 assert.equal(r.status,1,r.stdout+r.stderr);
 assert.equal(r.summary.collection.complete,false);
 assert.match(r.stdout+r.stderr,/INCOMPLETE/i);
 assert.match(JSON.stringify(r.summary.collection),/branch.*missing|missing.*branch/i);
 assert.ok(readFileSync(join(root,'rates.tsv'),'utf8').includes('main\tcft'));
});

test('a calibration-only arm config with no row file cannot disappear from the denominator',t=>{
 const root=fixture(t);arm(root,'main');arm(root,'branch',{rows:[],coverage:{planned:280,valid:0,missing:280,complete:false,invalid:0,setupFailures:1,aborted:'calibration failed'}});
 const r=run(root);
 assert.equal(r.status,1,r.stdout+r.stderr);
 assert.equal(r.summary.collection.complete,false);
 const b=r.summary.collection.arms.find(a=>a.arm==='branch');
 assert.equal(b.planned,280);assert.equal(b.valid,0);assert.equal(b.complete,false);
 assert.match(r.stdout+r.stderr,/INCOMPLETE/i);
});

test('missing cells fail even if the arm config claims complete coverage',t=>{
 const root=fixture(t);const rows=arm(root,'main');arm(root,'branch',{rows:rows.slice(1).map(r=>({...r,arm:'branch',engine:'b'.repeat(40)}))});
 const r=run(root);
 assert.equal(r.status,1,r.stdout+r.stderr);
 const b=r.summary.collection.arms.find(a=>a.arm==='branch');
 assert.equal(b.valid,279);assert.equal(b.complete,false);
 assert.ok(b.missing.includes('race/input/cmd+a/spike/30/1'));
});

test('a complete set of rows does not override an aborted or unfinished per-arm config',t=>{
 for(const coverage of [{planned:280,valid:280,missing:0,complete:false,invalid:0,aborted:'stopped'},null]){
  const root=fixture(t);arm(root,'main');arm(root,'branch');
  const path=join(root,'cft-input/branch/config.json'),config=JSON.parse(readFileSync(path,'utf8'));config.coverage=coverage;writeFileSync(path,JSON.stringify(config));
  const r=run(root);assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(r.summary.collection.complete,false);
 }
});

test('invalid cells and an unexpected replacement cannot satisfy expected plan coverage',t=>{
 const root=fixture(t);const rows=arm(root,'main');
 const branch=rows.map(r=>({...r,arm:'branch',engine:'b'.repeat(40)}));branch[0]={...branch[0],valid:false};branch[1]={...branch[1],id:'unexpected'};
 arm(root,'branch',{rows:branch});
 const r=run(root);assert.equal(r.status,1,r.stdout+r.stderr);
 const b=r.summary.collection.arms.find(a=>a.arm==='branch');
 assert.equal(b.complete,false);assert.ok(b.missing.includes('race/input/cmd+z/spike/30/1'));assert.ok(b.unexpected.includes('unexpected'));
});

test('rows without per-arm config cannot be certified as a final pair',t=>{
 const root=fixture(t);arm(root,'main');arm(root,'branch',{config:false});
 const r=run(root);assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(r.summary.collection.complete,false);
});

test('a valid selective smoke shard is complete without requiring the other eleven shards',t=>{
 const root=fixture(t);arm(root,'main',{browser:'safari',shard:'textarea',reps:1});arm(root,'branch',{browser:'safari',shard:'textarea',reps:1});
 const r=run(root,'--only','safari-textarea');
 assert.equal(r.status,0,r.stderr);assert.equal(r.summary.collection.complete,true);
 assert.deepEqual(r.summary.collection.shards,['safari-textarea']);
 assert.ok(r.summary.collection.arms.every(a=>a.planned===12&&a.valid===12));
});

test('an explicitly expected shard missing both arms is incomplete',t=>{
 const root=fixture(t);arm(root,'main');arm(root,'branch');
 const r=run(root,'--only','cft-input,safari-input');
 assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(r.summary.collection.complete,false);
 assert.ok(r.summary.collection.arms.filter(a=>a.browser==='safari').every(a=>!a.complete));
});

test('diagnostic tables expose the actual refusal reason, not just the expected answer',t=>{
 const root=fixture(t),raw={error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'valueMismatch',expectedLength:10001,actualLength:3333}}}};
 writeTables(root,[{id:'unicode-cap',recordKind:'cell',arm:'branch',browser:'cft',editor:'textarea',part:'truncation',variant:'unicode-cap',expectedAnswer:'typeUnconfirmed',expectedReason:'possiblyTruncated',rep:1,valid:true,contractFailure:true,typeRPC:{raw,durationMs:10}}]);
 const [header,line]=readFileSync(join(root,'diagnostics.tsv'),'utf8').trim().split('\n').map(l=>l.split('\t'));
 const result=Object.fromEntries(header.map((k,i)=>[k,line[i]]));
 assert.equal(result.reason,'valueMismatch');assert.equal(result.expectedReason,'possiblyTruncated');assert.equal(result.contractFailure,'true');
});

test('per-cell incremental tables remain writable before config or the other arm exists',t=>{
 const root=fixture(t);const rows=arm(root,'main',{config:false});
 assert.doesNotThrow(()=>writeTables(root,rows.slice(0,1)));
 assert.equal(JSON.parse(readFileSync(join(root,'summary.json'),'utf8')).groups[0].attempted,1);
});
