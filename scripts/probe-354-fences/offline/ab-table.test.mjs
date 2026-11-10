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
 assert.ok(r.summary.collection.arms.every(a=>a.planned===301&&a.valid===301&&a.complete));
 assert.equal(r.summary.groups.reduce((n,g)=>n+g.attempted,0),602);
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
 const root=fixture(t);arm(root,'main');arm(root,'branch',{rows:[],coverage:{planned:301,valid:0,missing:301,complete:false,invalid:0,setupFailures:1,aborted:'calibration failed'}});
 const r=run(root);
 assert.equal(r.status,1,r.stdout+r.stderr);
 assert.equal(r.summary.collection.complete,false);
 const b=r.summary.collection.arms.find(a=>a.arm==='branch');
 assert.equal(b.planned,301);assert.equal(b.valid,0);assert.equal(b.complete,false);
 assert.match(r.stdout+r.stderr,/INCOMPLETE/i);
});

test('missing cells fail even if the arm config claims complete coverage',t=>{
 const root=fixture(t);const rows=arm(root,'main');arm(root,'branch',{rows:rows.slice(1).map(r=>({...r,arm:'branch',engine:'b'.repeat(40)}))});
 const r=run(root);
 assert.equal(r.status,1,r.stdout+r.stderr);
 const b=r.summary.collection.arms.find(a=>a.arm==='branch');
 assert.equal(b.valid,300);assert.equal(b.complete,false);
 assert.ok(b.missing.includes('race/input/cmd+a/spike/30/1'));
});

test('a complete set of rows does not override an aborted or unfinished per-arm config',t=>{
 for(const coverage of [{planned:301,valid:301,missing:0,complete:false,invalid:0,aborted:'stopped'},null]){
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

test('both heads rescore a successful rendered reply with divergent AX as a real wrong success',t=>{
 const root=fixture(t),dom={text:'First line\n',innerText:'First line\n\n',domText:'First line',html:'<span>First line</span><div><span><br></span></div>'};
 const rows=['main','branch'].map(arm=>{
  const cell={id:arm+'/return',recordKind:'cell',part:'ending-return',editor:'contenteditable',browser:'cft',arm,engine:(arm==='main'?'a':'b').repeat(40),renderedText:true,text:'First line\n',valid:true,correct:true};
  const reference={...cell,foregroundVerified:true,route:"2'",dom,ax:{readable:true,secure:false,valueRead:true,value:'First line\n'}};
  return {...cell,typeRPC:{raw:{result:{meta:{typeReadback:{confirmed:true}}}},durationMs:10},renderedEvidence:{reference,measured:{route:"2'",dom,ax:{...reference.ax,value:'First line\n\n'}}}};
 });
 writeTables(root,rows);const s=JSON.parse(readFileSync(join(root,'summary.json'),'utf8'));
 assert.deepEqual(s.wrongSuccesses.map(r=>r.arm).sort(),['branch','main']);assert.ok(s.wrongSuccesses.every(r=>r.renderedVerdict.axMatches===false));assert.deepEqual(s.oracleWarnings,[]);
});

test('historical rendered rows without foreground/post-type AX evidence are unscorable oracle warnings',t=>{
 const root=fixture(t);
 writeTables(root,[{id:'historical-return',recordKind:'cell',arm:'branch',browser:'cft',editor:'contenteditable',part:'ending-return',renderedText:true,text:'First line\n',valid:true,correct:false,final:'First line\n\n',typeRPC:{raw:{result:{meta:{typeReadback:{confirmed:true}}}},durationMs:10}}]);
 const s=JSON.parse(readFileSync(join(root,'summary.json'),'utf8'));
 assert.equal(s.groups[0].valid,0);assert.equal(s.groups[0].invalid,1);assert.deepEqual(s.wrongSuccesses,[]);
 assert.equal(s.oracleWarnings[0].id,'historical-return');assert.match(s.oracleWarnings[0].reason,/reference/i);
});

test('selection pairs report exact per-rep results with socket, trusted and snapshot latency side by side',t=>{
 const root=fixture(t),rows=[];
 for(let rep=1;rep<=3;rep++)for(const variant of ['equal','different']){
  const ms=(variant==='equal'?0:30)+rep*10;
  rows.push({id:variant+'/'+rep,recordKind:'cell',part:'secret-selection',secret:true,arm:'branch',browser:'cft',editor:'input',variant,rep,valid:true,correct:true,secretSelectionEqual:variant==='different'?rep!==2:null,
   typeRPC:{raw:{result:{meta:{typeReadback:{confirmed:true,snapshotMs:ms/10}}}},durationMs:ms*10,engineTiming:{durationMs:ms}}});
 }
 writeTables(root,rows);const summary=JSON.parse(readFileSync(join(root,'summary.json'),'utf8'));
 assert.equal(summary.secretComparisons.pairs.length,3);assert.equal(summary.secretComparisons.pairs.find(p=>p.rep===2).metadataEqual,false);
 const latency=summary.secretComparisons.latency;
 assert.deepEqual(latency.find(r=>r.path==='engineSocket'),{arm:'branch',browser:'cft',comparison:'selection',path:'engineSocket',leftVariant:'equal',rightVariant:'different',leftN:3,leftP50:20,leftP95:30,rightN:3,rightP50:50,rightP95:60});
 assert.equal(latency.find(r=>r.path==='trusted').leftP50,200);assert.equal(latency.find(r=>r.path==='snapshot').rightP95,6);
 assert.match(readFileSync(join(root,'secret-pair-latency.tsv'),'utf8'),/engineSocket/);assert.match(readFileSync(join(root,'secret-pairs.tsv'),'utf8'),/false/);
});

test('normal secret confirmation summary retains safe-but-noisy refusals and their actual reasons',t=>{
 const root=fixture(t),base={recordKind:'cell',part:'secret',variant:'equality',secret:true,arm:'branch',browser:'firefox',editor:'input',valid:true,correct:true};
 const raw=(confirmed=true)=>({result:{meta:{typeReadback:{confirmed}}}}),refused=reason=>({error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason}}}});
 const rows=[{...base,id:'confirmed',typeRPC:{raw:raw()}},{...base,id:'unqualified-success',typeRPC:{raw:raw(false)}},
  {...base,id:'honest-unchanged',typeRPC:{raw:refused('unchanged')}},{...base,id:'honest-field-change',typeRPC:{raw:refused('fieldChanged')}},
  {...base,id:'other',correct:false,typeRPC:{raw:{error:{errorName:'intervened'}}}},{...base,id:'invalid',valid:false}];
 writeTables(root,rows);const summary=JSON.parse(readFileSync(join(root,'summary.json'),'utf8'));
 assert.deepEqual(summary.secretConfirmation,[{arm:'branch',browser:'firefox',attempted:6,valid:5,success:2,confirmed:1,successConfirmed:1,typeUnconfirmed:2,finalMatch:4,otherErrors:1,invalid:1,refusalReasons:{unchanged:1,fieldChanged:1,intervened:1}}]);
 assert.deepEqual(summary.wrongSuccesses,[]);assert.match(readFileSync(join(root,'secret-confirmation.tsv'),'utf8'),/fieldChanged/);
});

test('per-cell incremental tables remain writable before config or the other arm exists',t=>{
 const root=fixture(t);const rows=arm(root,'main',{config:false});
 assert.doesNotThrow(()=>writeTables(root,rows.slice(0,1)));
 assert.equal(JSON.parse(readFileSync(join(root,'summary.json'),'utf8')).groups[0].attempted,1);
});
