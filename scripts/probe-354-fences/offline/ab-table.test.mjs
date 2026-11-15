// Offline collector boundary tests: real files and CLI, no engine or GUI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {planFor} from '../caret.mjs';
import {writeTables} from './ab-table.mjs';

const cli=fileURLToPath(new URL('./ab-table.mjs',import.meta.url));
function fixture(t){const root=mkdtempSync(join(tmpdir(),'probe354-ab-table-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root}
// `cohort` omitted writes artifacts as before cohorts existed (no cohort field anywhere), which the collector reads as primary.
function arm(root,arm,{browser='cft',shard='input',reps=20,rows,coverage,config=true,cohort}={}){
 const plan=planFor({browser,editor:shard,reps,arm,diagnostic:cohort??'primary'}),tag=cohort?{cohort}:{};
 rows??=plan.map(c=>({...c,recordKind:'cell',...tag,arm,browser,shard,kit:'c'.repeat(40),engine:(arm==='main'?'a':'b').repeat(40),valid:true,correct:true,typeRPC:{raw:{result:{meta:{entered:c.length}}},durationMs:10}}));
 const dir=join(root,`${browser}-${shard}`,arm);mkdirSync(dir,{recursive:true});
 if(config)writeFileSync(join(dir,'config.json'),JSON.stringify({...tag,arm,browser,shard,reps,smoke:reps===1,kit:'c'.repeat(40),engine:(arm==='main'?'a':'b').repeat(40),planned:plan.length,coverage:coverage??{planned:plan.length,valid:plan.length,missing:0,complete:true,invalid:0,setupFailures:0,aborted:null}}));
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

// Follow-up cohort: its own arm-specific plans, one cohort per collection, never pooled with primary evidence.
const followupPair=(root,opts)=>{for(const a of ['main','branch'])arm(root,a,{...opts,cohort:'followup'})};
function rejected(root,...args){
 const p=spawnSync(process.execPath,[cli,root,...args],{encoding:'utf8'});
 assert.equal(p.signal,null,p.stderr);assert.notEqual(p.status,0,p.stdout);assert.equal(existsSync(join(root,'summary.json')),false,'no pooled tables are written');
 return p.stderr;
}

test('follow-up cap retries are arm specific: the control reruns rep 7, the branch reps 1, 4 and 7',t=>{
 const root=fixture(t);followupPair(root,{browser:'cft',shard:'textarea'});
 const r=run(root,'--only','cft-textarea','--cohort','followup');
 assert.equal(r.status,0,r.stderr);assert.equal(r.summary.collection.complete,true);assert.equal(r.summary.collection.cohort,'followup');
 // 40 text controls per head, then the fixed cap retries: one for the control, three for the branch.
 assert.deepEqual(Object.fromEntries(r.summary.collection.arms.map(a=>[a.arm,a.planned])),{main:41,branch:43});
 assert.ok(r.summary.collection.arms.every(a=>a.cohort==='followup'));assert.match(readFileSync(join(root,'coverage.tsv'),'utf8'),/\tfollowup\n/);
});

test('a follow-up arm that ran the other arm\'s retry plan has unexpected cells and is not complete',t=>{
 const root=fixture(t);arm(root,'branch',{browser:'cft',shard:'textarea',cohort:'followup'});
 const rows=planFor({browser:'cft',editor:'textarea',reps:20,arm:'branch',diagnostic:'followup'}).map(c=>({...c,recordKind:'cell',cohort:'followup',arm:'main',browser:'cft',shard:'textarea',kit:'c'.repeat(40),engine:'a'.repeat(40),valid:true,correct:true,typeRPC:{raw:{result:{meta:{}}},durationMs:10}}));
 arm(root,'main',{browser:'cft',shard:'textarea',cohort:'followup',rows});
 const r=run(root,'--only','cft-textarea','--cohort','followup');
 assert.equal(r.status,1,r.stdout+r.stderr);
 const main=r.summary.collection.arms.find(a=>a.arm==='main');
 assert.equal(main.complete,false);assert.deepEqual(main.unexpected,['truncation/textarea/unicode-cap/1','truncation/textarea/unicode-cap/4']);
});

test('cohorts are never pooled: an artifact from another cohort is rejected before any table is written',t=>{
 const followup=fixture(t);followupPair(followup,{browser:'cft',shard:'textarea'});
 assert.match(rejected(followup),/cohort mismatch: collecting primary but .* is followup/);
 const primary=fixture(t);arm(primary,'main');arm(primary,'branch');
 assert.match(rejected(primary,'--cohort','followup'),/cohort mismatch: collecting followup but .* is primary/);
 const mixed=fixture(t);followupPair(mixed,{browser:'cft',shard:'textarea'});arm(mixed,'main');
 assert.match(rejected(mixed,'--cohort','followup'),/cohort mismatch/);
 // Rows alone can carry the cohort: a followup row under a primary config is still mixed evidence.
 const rows=fixture(t),plan=planFor({browser:'cft',editor:'input',reps:20,diagnostic:'primary'});
 arm(rows,'main',{rows:plan.map(c=>({...c,recordKind:'cell',cohort:'followup',arm:'main',browser:'cft',shard:'input',kit:'c'.repeat(40),engine:'a'.repeat(40),valid:true,correct:true,typeRPC:{raw:{result:{meta:{}}},durationMs:10}}))});
 assert.match(rejected(rows),/cohort mismatch: collecting primary but .* row .* is followup/);
 assert.match(rejected(fixture(t),'--cohort','nope'),/usage|unknown cohort/);
});

test('an explicit follow-up scope that was not fully downloaded is incomplete, never certified',t=>{
 const root=fixture(t);followupPair(root,{browser:'cft',shard:'textarea'});
 const r=run(root,'--only','all','--cohort','followup');
 assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(r.summary.collection.shards.length,10);
 assert.equal(r.summary.collection.arms.length,20);assert.equal(r.summary.collection.arms.filter(a=>a.complete).length,2);
 assert.match(r.stderr,/INCOMPLETE/);
});

test('Safari textarea follow-up is a complete 40-cell pair of ending-Return and multiline controls',t=>{
 const root=fixture(t);followupPair(root,{browser:'safari',shard:'textarea'});
 const r=run(root,'--only','safari-textarea','--cohort','followup');
 assert.equal(r.status,0,r.stderr);assert.ok(r.summary.collection.arms.every(a=>a.planned===40&&a.valid===40&&a.complete));
 assert.deepEqual([...new Set(r.summary.groups.map(g=>g.part))].sort(),['ending-return','multiline']);
 // A primary-plan race cell is not part of this shard's plan.
 const stray=fixture(t);followupPair(stray,{browser:'safari',shard:'textarea'});
 const path=join(stray,'safari-textarea/branch/rows.jsonl'),rows=readFileSync(path,'utf8').trim().split('\n').map(l=>JSON.parse(l));
 rows[0]={...rows[0],id:'race/textarea/cmd+a/spike/30/1',part:'race'};writeFileSync(path,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const s=run(stray,'--only','safari-textarea','--cohort','followup');
 assert.equal(s.status,1,s.stdout+s.stderr);assert.ok(s.summary.collection.arms.find(a=>a.arm==='branch').unexpected.includes('race/textarea/cmd+a/spike/30/1'));
});

test('the follow-up collector accepts only its own shards',t=>{
 const root=fixture(t);followupPair(root,{browser:'cft',shard:'textarea'});
 assert.match(rejected(root,'--only','safari-compose','--cohort','followup'),/unknown or empty follow-up shard ids: safari-compose/);
});

test('Safari input follow-up reports plain and trusted-secret no-key cells side by side; primary output does not grow',t=>{
 const root=fixture(t),rows=a=>planFor({browser:'safari',editor:'input',reps:20,arm:a,diagnostic:'followup'}).map(c=>({...c,recordKind:'cell',cohort:'followup',arm:a,browser:'safari',shard:'input',kit:'c'.repeat(40),engine:(a==='main'?'a':'b').repeat(40),valid:true,correct:c.part==='no-key'||a==='main',
  typeRPC:{raw:c.part==='secret'&&a==='branch'?{error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'concealedMismatch'}}}}:{result:{meta:{typeReadback:{confirmed:true}}}},durationMs:10}}));
 for(const a of ['main','branch'])arm(root,a,{browser:'safari',shard:'input',cohort:'followup',rows:rows(a)});
 const r=run(root,'--only','safari-input','--cohort','followup');
 assert.equal(r.status,0,r.stderr);assert.ok(r.summary.collection.arms.every(a=>a.planned===40&&a.valid===40));
 const table=Object.fromEntries(r.summary.noKeyConfirmation.map(x=>[x.arm+'/'+x.part,x]));
 assert.equal(table['main/no-key'].successConfirmed,20);assert.equal(table['branch/no-key'].confirmed,20);
 assert.equal(table['branch/secret'].typeUnconfirmed,20);assert.deepEqual(table['branch/secret'].refusalReasons,{concealedMismatch:20});
 assert.match(readFileSync(join(root,'no-key-confirmation.tsv'),'utf8'),/branch\tsafari\tinput\tno-key\tplain\t20/);
 assert.match(readFileSync(join(root,'diagnostics.tsv'),'utf8'),/no-key\tplain\t1\tconfirmed/);
 // The secret no-key cells keep their privacy audit rows; the plain cell is a public field with nothing to audit.
 const privacy=readFileSync(join(root,'privacy.tsv'),'utf8');assert.match(privacy,/secret\tequality/);assert.doesNotMatch(privacy,/no-key/);
 const primary=fixture(t);arm(primary,'main');arm(primary,'branch');run(primary);
 assert.equal(existsSync(join(primary,'no-key-confirmation.tsv')),false);assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(primary,'summary.json'),'utf8')),'noKeyConfirmation'),false);
});

test('a plain no-key success with a wrong final value is a wrong success like any other cell',t=>{
 const root=fixture(t);
 writeTables(root,[{id:'no-key/input/plain/1',recordKind:'cell',cohort:'followup',arm:'branch',browser:'safari',editor:'input',part:'no-key',key:null,variant:'plain',length:64,rep:1,expectedAnswer:'confirmed',valid:true,correct:false,final:'wrong',typeRPC:{raw:{result:{meta:{typeReadback:{confirmed:true}}}},durationMs:10}}]);
 const s=JSON.parse(readFileSync(join(root,'summary.json'),'utf8'));
 assert.deepEqual(s.wrongSuccesses.map(r=>r.id),['no-key/input/plain/1']);assert.equal(s.groups[0].wrongSuccess,1);
});
