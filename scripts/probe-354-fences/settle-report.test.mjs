// Offline settle-ab reporting tests: synthetic rows only, no engine, browser or GUI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {summarizeSettle,writeSettleTables} from './settle-report.mjs';

const refusal=(rb={})=>({error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'valueMismatch',...rb}}}});
const success=(rb={})=>({result:{meta:{typeReadback:{confirmed:true,...rb}}}});
function row({arm='branch',browser='cft',editor='textarea',part='race',key='cmd+a',length=30,rep=1,variant='spike',valid=true,correct=true,raw=success(),durationMs=10,cohort='settle-ab',recordKind='cell',...rest}={}){
 return {recordKind,cohort,arm,browser,shard:editor,editor,part,key,length,rep,variant,id:[part,editor,key??'no-key',variant,length,rep].join('/'),valid,correct,engine:'e'.repeat(40),
  ...(raw?{typeRPC:{startedAt:1,endedAt:2,durationMs,raw,meta:raw.result?.meta??raw.error?.meta??null}}:{}),...rest};
}
const find=(list,where)=>list.find(g=>Object.entries(where).every(([k,v])=>g[k]===v));

test('every cell must be settle-ab; warmups and other record kinds are ignored; only race and clean enter the rate and cost core',()=>{
 const good=[row(),row({part:'clean'})];
 assert.throws(()=>summarizeSettle([...good,row({cohort:'primary'})]),/cohort/);
 assert.throws(()=>summarizeSettle([...good,row({cohort:null})]),/cohort/);
 assert.throws(()=>summarizeSettle([...good,row({cohort:'followup'})]),/cohort/);
 assert.throws(()=>summarizeSettle([...good,row({part:'no-key',variant:'plain',key:null,cohort:'followup'})]),/cohort/,'an extra-part cell of another cohort rejects too');
 assert.throws(()=>summarizeSettle([row({arm:'control'})]),/arm/);
 assert.throws(()=>summarizeSettle([row({browser:'chrome'})]),/browser/);
 const s=summarizeSettle([...good,row({recordKind:'warmup',cohort:'primary',part:'clean',id:'warmup/clean30'}),row({recordKind:'foreground-reference'}),
  row({browser:'safari',editor:'input',part:'no-key',variant:'plain',key:null,length:64})]);
 assert.equal(s.cohort,'settle-ab');
 assert.equal(s.ignored.warmupOrOtherRecords,2);
 assert.equal(s.observations.length,3);
 assert.deepEqual(s.overall.map(g=>[g.part,g.attempted]).sort(),[['clean',1],['race',1]]);
 assert.equal(s.cost.length,2);
 assert.deepEqual(s.diagnostics.map(g=>[g.part,g.variant,g.attempted]),[['no-key','plain',1]]);
});

// 11 valid trials, 1 invalid: 4 right successes, 3 false unconfirmed, 1 caught loss, 1 unconfirmed whose correctness is missing,
// 1 other error, 1 wrong success.
function rateRows(extra={}){
 const rs=[];let rep=0;const add=o=>rs.push(row({rep:++rep,...extra,...o}));
 for(let i=0;i<4;i++)add({});
 for(let i=0;i<3;i++)add({raw:refusal(),correct:true});
 add({raw:refusal(),correct:false});
 add({raw:refusal(),correct:null});
 add({raw:{error:{errorName:'engineBusy'}},correct:true});
 add({correct:false});
 add({valid:false,correct:true,raw:refusal(),problem:'setup lost\nmore'});
 return rs;
}
test('false-unconfirmed rate is typeUnconfirmed with correct===true over all valid trials, beside the conditional fraction among refusals',()=>{
 const s=summarizeSettle(rateRows());
 const g=find(s.overall,{browser:'cft',arm:'branch',part:'race'});
 assert.equal(g.attempted,12);assert.equal(g.valid,11);assert.equal(g.invalid,1);assert.equal(g.missingCorrectness,1);
 assert.equal(g.success,5);assert.equal(g.typeUnconfirmed,5);assert.equal(g.otherErrors,1);
 assert.deepEqual(g.falseUnconfirmed,{numerator:3,denominator:11,rate:3/11});
 assert.deepEqual(g.falseUnconfirmedAmongRefusals,{numerator:3,denominator:5,fraction:3/5});
 assert.deepEqual(g.wrongSuccess,{count:1,denominator:11,rate:1/11});
 const c=find(s.cells,{browser:'cft',arm:'branch',editor:'textarea',part:'race',key:'cmd+a',length:30});
 assert.equal(c.falseUnconfirmed.numerator,3);assert.equal(c.falseUnconfirmed.denominator,11);
 assert.equal(s.invalidTrials.length,1);assert.equal(s.invalidTrials[0].problem,'setup lost');
 assert.equal(s.wrongSuccesses.length,1);assert.equal(s.wrongSuccesses[0].arm,'branch');
 const t=summarizeSettle([...rateRows(),row({part:'clean',rep:99,raw:refusal(),correct:true})]);
 assert.equal(find(t.overall,{part:'race'}).falseUnconfirmed.denominator,11,'clean is never pooled with race');
 assert.deepEqual(find(t.overall,{part:'clean'}).falseUnconfirmed,{numerator:1,denominator:1,rate:1});
});

test('a zero denominator reports null rates, and a valid row with a malformed answer is excluded rather than thrown',()=>{
 const s=summarizeSettle([row({valid:false}),row({rep:2,raw:{result:{meta:{}},error:{errorName:'x'}}})]);
 const g=find(s.overall,{part:'race'});
 assert.equal(g.valid,0);assert.equal(g.malformed,1);assert.equal(g.invalid,1);
 assert.deepEqual(g.falseUnconfirmed,{numerator:0,denominator:0,rate:null});
 assert.equal(g.falseUnconfirmedAmongRefusals.fraction,null);
});

test('wrong success is a success with correct===false, in every key and editor, without a leaving-key exemption',()=>{
 const s=summarizeSettle([
  row({editor:'input',key:'cmd+z',correct:false,raw:success({keysUnconfirmed:1,checkpoints:1})}),
  row({editor:'input',key:'cmd+v',rep:2,correct:false,raw:refusal()}),
  row({editor:'input',key:'cmd+v',rep:3,correct:null}),
  row({arm:'main',editor:'input',key:'cmd+v',rep:4,correct:false})]);
 assert.equal(find(s.cells,{arm:'branch',key:'cmd+z'}).wrongSuccess.count,1);
 assert.equal(find(s.cells,{arm:'branch',key:'cmd+z'}).keysUnconfirmed,1);
 assert.equal(find(s.cells,{arm:'branch',key:'cmd+v'}).wrongSuccess.count,0);
 assert.equal(find(s.cells,{arm:'branch',key:'cmd+v'}).wrong,1);
 assert.equal(find(s.cells,{arm:'main',key:'cmd+v'}).wrongSuccess.count,1);
 assert.deepEqual(s.wrongSuccesses.map(w=>[w.arm,w.key]).sort(),[['branch','cmd+z'],['main','cmd+v']]);
});

test('settleReads counts completed additional pairs: absent is unavailable on the old baseline and zero beside a branch readback record',()=>{
 const rs=[
  row({arm:'main',rep:1,raw:success({snapshotMs:4})}),
  row({arm:'branch',rep:1,raw:success({snapshotMs:5})}),
  row({arm:'branch',rep:2,raw:success({snapshotMs:6,settleReads:3})}),
  row({arm:'branch',rep:3,raw:refusal({snapshotMs:7,settleReads:1})}),
  row({arm:'branch',rep:4,raw:{result:{meta:{}}}}),
  row({arm:'branch',rep:5,raw:success({settleReads:'3'})}),
 ];
 const s=summarizeSettle(rs),obs=n=>s.observations.find(o=>o.arm==='branch'&&o.rep===n);
 const m=s.observations.find(o=>o.arm==='main');
 assert.equal(m.settleReads,null);assert.equal(m.settleReadsState,'unavailable');assert.equal(m.settleCapped,null);assert.equal(m.programmedWaitLowerBoundMs,null);
 assert.equal(m.snapshotMs,4);
 assert.equal(obs(1).settleReads,0);assert.equal(obs(1).settleReadsState,'absent-zero');assert.equal(obs(1).settleCapped,false);assert.equal(obs(1).settleCappedState,'absent-false');
 assert.equal(obs(2).settleReads,3);assert.equal(obs(2).settleReadsState,'reported');assert.equal(obs(2).programmedWaitLowerBoundMs,45);
 assert.equal(obs(3).settleReads,1);assert.equal(obs(3).outcome,'typeUnconfirmed');assert.equal(obs(3).programmedWaitLowerBoundMs,15);
 assert.equal(obs(4).settleReads,null,'no readback record: nothing to infer');assert.equal(obs(4).settleReadsState,'unavailable');assert.equal(obs(4).snapshotMs,null);
 assert.equal(obs(5).settleReads,null);assert.equal(obs(5).settleReadsState,'invalid');
 const b=find(s.cost,{arm:'branch',part:'race',key:'cmd+a',length:30}),mc=find(s.cost,{arm:'main'});
 assert.equal(b.readsN,3);assert.equal(b.readsP50,1);assert.equal(b.readsMax,3);
 assert.deepEqual([b.readsReported,b.readsAbsentZero,b.readsUnavailable,b.readsInvalid,b.readsNonzero],[2,1,1,1,2]);
 assert.equal(b.programmedWaitLowerBoundP50,15);
 assert.equal(mc.readsN,0);assert.equal(mc.readsP50,null);assert.equal(mc.readsUnavailable,1);assert.equal(mc.programmedWaitLowerBoundP50,null);
 assert.equal(b.snapshotN,3);
 assert.match(s.notes.join(' '),/lower bound/i);
 assert.match(s.notes.join(' '),/no dedicated settle/i);
});

test('settle fields are plain-only: concealed and secret records stay unavailable, never zero reads, while latency and safety still count',()=>{
 const concealed={confirmed:false,concealed:true,snapshotMs:20,reason:'noFocusedElement'};
 const secret={browser:'safari',editor:'input',key:null,length:64,part:'secret',variant:'equality',correct:null,durationMs:77};
 const s=summarizeSettle([
  row({...secret,rep:1,raw:refusal(concealed)}),
  row({...secret,rep:2,raw:{result:{meta:{typeReadback:{confirmed:true,concealed:true,snapshotMs:9}}}},privacyViolation:true}),
  // a plain-shaped record on a secret cell and a concealed record on a plain cell are equally not evidence of zero
  row({...secret,rep:3,raw:success({snapshotMs:5})}),
  row({rep:4,raw:refusal({concealed:true,snapshotMs:3})}),
  row({rep:5,raw:success({snapshotMs:3})})]);
 const o=n=>s.observations.find(x=>x.rep===n&&(n>3||x.part==='secret'));
 for(const n of [1,2,3]){
  assert.equal(o(n).settleReads,null,'secret '+n);assert.equal(o(n).settleReadsState,'unavailable');
  assert.equal(o(n).settleCapped,null);assert.equal(o(n).settleCappedState,'unavailable');assert.equal(o(n).programmedWaitLowerBoundMs,null);
 }
 assert.equal(o(1).snapshotMs,20);assert.equal(o(1).durationMs,77);assert.equal(o(1).hasReadback,true);
 assert.equal(o(4).settleReadsState,'unavailable');assert.equal(o(4).programmedWaitLowerBoundMs,null);
 assert.equal(o(5).settleReads,0,'an ordinary plain record keeps its wire default');
 const g=find(s.diagnosticCost,{part:'secret',arm:'branch'});
 assert.equal(g.readsN,0);assert.equal(g.readsAbsentZero,0);assert.equal(g.readsUnavailable,3);assert.equal(g.programmedWaitLowerBoundP50,null);
 assert.equal(g.snapshotN,3);assert.equal(g.durationN,3);assert.equal(g.durationP50,77);
 assert.equal(find(s.safety,{browser:'safari',arm:'branch'}).privacyViolations,1);
 assert.equal(find(s.cost,{arm:'branch'}).readsAbsentZero,1);
 // a field a concealed record does report is still preserved as reported
 const r=summarizeSettle([row({...secret,raw:success({concealed:true,settleReads:2})})]);
 assert.equal(r.observations[0].settleReads,2);assert.equal(r.observations[0].settleReadsState,'reported');
});

test('capped reads are counted where reported and an unreported flag beside a branch record is false, never inferred elsewhere',()=>{
 const s=summarizeSettle([
  row({rep:1,raw:success({settleReads:7,settleCapped:true})}),
  row({rep:2,raw:success({settleReads:2})}),
  row({rep:3,raw:success({settleCapped:'yes'})}),
  row({arm:'main',rep:4,raw:success()})]);
 const o=n=>s.observations.find(x=>x.rep===n);
 assert.equal(o(1).settleCapped,true);assert.equal(o(1).settleCappedState,'reported');
 assert.equal(o(2).settleCapped,false);assert.equal(o(3).settleCapped,null);assert.equal(o(3).settleCappedState,'invalid');
 assert.equal(o(4).settleCapped,null);
 const b=find(s.cost,{arm:'branch'});
 assert.equal(b.cappedTrue,1);assert.equal(b.cappedKnown,2);
});

test('cost keeps actual call duration and snapshotMs from valid trials only, grouped and with p50 and p95, without synthesizing missing data',()=>{
 const rs=[10,20,30,40,50].map((d,i)=>row({rep:i+1,durationMs:d,raw:success({snapshotMs:d/10})}));
 rs.push(row({rep:6,durationMs:9999,valid:false,raw:success({snapshotMs:999})}),row({rep:7,durationMs:null,raw:success()}));
 const s=summarizeSettle(rs),g=find(s.cost,{browser:'cft',arm:'branch',part:'race',key:'cmd+a',length:30});
 assert.equal(g.trials,6);
 assert.equal(g.durationN,5);assert.equal(g.durationP50,30);assert.equal(g.durationP95,50);assert.equal(g.durationMax,50);
 assert.equal(g.snapshotN,5);assert.equal(g.snapshotP50,3);
 const inv=s.observations.find(o=>o.rep===6),none=s.observations.find(o=>o.rep===7);
 assert.equal(inv.valid,false);assert.equal(inv.durationMs,9999,'observations keep the actual value of an invalid trial');
 assert.equal(none.durationMs,null);assert.equal(none.snapshotMs,null);
 assert.ok(!('threshold' in s)&&!JSON.stringify(s.cost).includes('pass'));
});

test('matched main and branch deltas use group quantiles and per-trial pairs, and absent data yields no delta',()=>{
 const mk=(arm,rep,d,snap,extra={})=>row({arm,rep,durationMs:d,raw:snap===undefined?success():success({snapshotMs:snap,...extra})});
 const rs=[mk('main',1,10,2),mk('main',2,20,2),mk('main',3,30,2),mk('branch',1,14,5,{settleReads:2}),mk('branch',2,19,3),mk('branch',3,50,3),
  mk('main',4,40,undefined),mk('branch',4,45,undefined),row({arm:'branch',rep:5,durationMs:5}),mk('main',5,5,1),
  row({arm:'main',rep:6,valid:false,durationMs:1}),mk('branch',6,8,1)];
 const s=summarizeSettle(rs);
 const d=find(s.costAB,{browser:'cft',part:'race',key:'cmd+a',length:30,metric:'durationMs'});
 assert.equal(d.mainN,5);assert.equal(d.branchN,6);
 assert.equal(d.mainP50,20);assert.equal(d.branchP50,19);assert.equal(d.deltaP50,-1);
 assert.equal(d.pairedN,5);
 // pairs: rep1 +4, rep2 -1, rep3 +20, rep4 +5, rep5 0 (branch 5 vs main 5)
 assert.equal(d.pairedDeltaP50,4);assert.equal(d.pairedDeltaMax,20);
 const sn=find(s.costAB,{metric:'snapshotMs'});
 assert.equal(sn.pairedN,3,'reps 4 and 5 lack a snapshot in one arm; rep 6 is invalid in main');
 assert.equal(sn.pairedDeltaP50,1);
 assert.equal(sn.deltaP50,sn.branchP50-sn.mainP50);
 const p=s.pairedTrials.find(x=>x.rep===1);
 assert.deepEqual([p.mainDurationMs,p.branchDurationMs,p.durationDeltaMs,p.snapshotDeltaMs,p.branchSettleReads],[10,14,4,3,2]);
 const q=s.pairedTrials.find(x=>x.rep===4);assert.equal(q.snapshotDeltaMs,null);
 const bad=s.pairedTrials.find(x=>x.rep===6);assert.equal(bad.durationDeltaMs,null);
 assert.equal(s.pairedTrials.length,6);
 const only=summarizeSettle([row({arm:'main',durationMs:3})]);
 assert.equal(find(only.costAB,{metric:'durationMs'})?.deltaP50??null,null,'a group missing one arm has no delta rather than a zero');
});

test('duplicated trials cannot be silently double-counted',()=>{
 assert.throws(()=>summarizeSettle([row(),row()]),/duplicate/i);
});

// The coordinator's plan: 12 shards x 120 race/clean cells, plus 40 Safari no-key cells (plain20, trusted-secret equality20) per head.
function fullRows(){
 const rs=[];
 for(const arm of ['main','branch'])for(const browser of ['safari','cft','firefox'])for(const editor of ['textarea','input','contenteditable','compose'])for(let rep=1;rep<=20;rep++){
  for(const key of ['cmd+a','cmd+z','cmd+v'])rs.push(row({arm,browser,editor,rep,key}));
  for(const length of [30,120,500])rs.push(row({arm,browser,editor,rep,part:'clean',length}));
  if(browser==='safari'&&editor==='input'){
   rs.push(row({arm,browser,editor,rep,part:'no-key',variant:'plain',key:null,length:64}));
   rs.push(row({arm,browser,editor,rep,part:'secret',variant:'equality',key:null,length:64}));
   // the after arm alone also runs the large-page public no-key cells
   if(arm==='branch')rs.push(row({arm,browser,editor,rep,part:'large-page',variant:'plain',key:null,length:64,largePageNodes:1600}));
  }
 }
 return rs;
}
test('coverage is explicit per shard for race/clean and separately for the Safari no-key cells; it is informational only',()=>{
 const f=summarizeSettle(fullRows());
 assert.equal(f.coverage.length,24);
 assert.ok(f.coverage.every(x=>x.planned===120&&x.complete&&x.unexpected===0));
 const safariInput=find(f.coverage,{browser:'safari',editor:'input',arm:'main'});
 assert.equal(safariInput.diagnosticPlanned,40);assert.equal(safariInput.diagnosticValid,40);assert.equal(safariInput.diagnosticUnexpected,0);
 assert.deepEqual(safariInput.diagnosticScope,['no-key/plain','secret/equality']);
 const after=find(f.coverage,{browser:'safari',editor:'input',arm:'branch'});
 assert.equal(after.diagnosticPlanned,60);assert.equal(after.diagnosticValid,60);assert.equal(after.diagnosticUnexpected,0);assert.equal(after.diagnosticMissing,0);assert.equal(after.complete,true);
 assert.deepEqual(after.diagnosticScope,['no-key/plain','secret/equality','large-page/plain']);
 const total=arm=>f.coverage.filter(x=>x.arm===arm).reduce((n,x)=>n+x.planned+x.diagnosticPlanned,0);
 assert.equal(total('main'),1480);assert.equal(total('branch'),1500);
 assert.equal(f.coverage.filter(x=>x.arm==='branch').reduce((n,x)=>n+x.observed+x.diagnosticObserved,0),1500);
 assert.equal(f.coverage.reduce((n,x)=>n+x.planned,0),2880,'the race/clean core is unchanged');
 assert.equal(find(f.coverage,{browser:'cft',editor:'input',arm:'main'}).diagnosticPlanned,0);
 // the large-page cells are diagnostics only: never in core rates or cost
 assert.ok(!f.overall.some(g=>g.part==='large-page')&&!f.cost.some(g=>g.part==='large-page'));
 assert.equal(find(f.diagnostics,{arm:'branch',part:'large-page',variant:'plain'}).attempted,20);
 // the main arm, other browsers and other editors never plan them
 const lp=(o)=>row({part:'large-page',variant:'plain',key:null,length:64,largePageNodes:1600,...o});
 const stray=summarizeSettle([lp({arm:'main',browser:'safari',editor:'input'}),lp({arm:'branch',browser:'cft',editor:'input'}),lp({arm:'branch',browser:'safari',editor:'textarea'})]);
 for(const [arm,browser,editor] of [['main','safari','input'],['branch','cft','input'],['branch','safari','textarea']]){
  const c=find(stray.coverage,{arm,browser,editor});assert.equal(c.diagnosticUnexpected,1,arm+browser+editor);assert.equal(c.diagnosticPlanned,arm==='main'?40:0);
 }
 assert.equal(find(stray.coverage,{arm:'branch',browser:'safari',editor:'textarea'}).diagnosticPlanned,0);
 const s=summarizeSettle([row({editor:'textarea'})]);
 const c=find(s.coverage,{browser:'cft',editor:'textarea',arm:'branch'});
 assert.equal(c.planned,120);assert.equal(c.observed,1);assert.equal(c.valid,1);assert.equal(c.missing,119);assert.equal(c.complete,false);
 const odd=summarizeSettle([row({part:'race',key:'cmd+a',length:500}),row({part:'clean',key:'cmd+z',length:30,rep:2}),row({part:'substitution',length:500,rep:3})]);
 assert.equal(find(odd.coverage,{arm:'branch'}).unexpected,2);
 assert.equal(find(odd.coverage,{arm:'branch'}).diagnosticUnexpected,1);
 const small=summarizeSettle([row()],{reps:1});assert.equal(small.coverage[0].planned,6);
});

test('extra same-cohort cells keep their own diagnostic outcomes and never enter the race/clean rates',()=>{
 const base={browser:'safari',editor:'input',key:null,length:64};
 const rs=[
  row({...base,part:'no-key',variant:'plain',rep:1}),
  row({...base,part:'no-key',variant:'plain',rep:2,raw:refusal(),correct:true}),
  row({...base,part:'no-key',variant:'plain',rep:3,valid:false}),
  row({...base,part:'secret',variant:'equality',rep:1}),
  row({...base,part:'secret',variant:'equality',rep:2,raw:{error:{errorName:'engineBusy'}},correct:null})];
 const s=summarizeSettle(rs);
 assert.equal(s.overall.length,0);assert.equal(s.cells.length,0);assert.equal(s.cost.length,0);
 const plain=find(s.diagnostics,{part:'no-key',variant:'plain'});
 assert.deepEqual([plain.attempted,plain.valid,plain.invalid,plain.success,plain.typeUnconfirmed,plain.unexpectedUnconfirmed,plain.expectedUnconfirmed,plain.finalMatch],[3,2,1,1,1,1,0,2]);
 assert.deepEqual(plain.refusalReasons,{valueMismatch:1});
 const secret=find(s.diagnostics,{part:'secret',variant:'equality'});
 assert.equal(secret.otherErrors,1);assert.equal(secret.confirmed,1);
 assert.equal(s.observations.length,5);
 assert.ok(s.observations.every(o=>o.core===false));
 assert.ok(find(s.diagnosticCost,{part:'secret',variant:'equality',arm:'branch'}));
});

test('wrong successes and privacy violations are counted across every valid cell including secret and no-key',()=>{
 const base={browser:'safari',editor:'input',key:null,length:64};
 const rs=[
  row({...base,part:'secret',variant:'equality',rep:1,correct:false}),
  row({...base,part:'no-key',variant:'plain',rep:1,correct:false,arm:'main'}),
  row({...base,part:'secret',variant:'equality',rep:2,privacyViolation:true}),
  row({...base,part:'secret',variant:'equality',rep:3,valid:false,privacyViolation:true}),
  row({...base,part:'secret',variant:'equality',rep:4,privacyFindings:['audited text-read attempts: 1']}),
  row({part:'race',rep:1,correct:false})];
 const s=summarizeSettle(rs);
 assert.deepEqual(s.wrongSuccesses.map(w=>[w.arm,w.part,w.core]).sort(),[['branch','race',true],['branch','secret',false],['main','no-key',false]]);
 const sec=find(s.diagnostics,{part:'secret',arm:'branch'});
 assert.equal(sec.wrongSuccess.count,1);assert.equal(sec.privacyViolations,3);assert.equal(sec.privacyViolationsValid,2);
 const safety=find(s.safety,{browser:'safari',arm:'branch'});
 assert.equal(safety.wrongSuccesses,1);assert.equal(safety.privacyViolations,3);assert.equal(safety.privacyViolationsValid,2);
 assert.equal(find(s.safety,{browser:'cft',arm:'branch'}).wrongSuccesses,1);
 assert.equal(s.privacyViolationTrials.length,3);
});

test('only a known-background Firefox secret typeUnconfirmed is expected limit #394; foreground, unknown or other rows are unexpected',()=>{
 const base={editor:'input',key:null,length:64,part:'secret',variant:'equality',raw:refusal({reason:'concealedMismatch'}),correct:null};
 const rs=[
  row({...base,browser:'firefox',rep:1,contractFailure:true,foregroundSetup:false}),
  row({...base,browser:'firefox',rep:2,contractFailure:true,foregroundSetup:false,raw:success()}),
  row({...base,browser:'safari',rep:1,contractFailure:true,foregroundSetup:false}),
  row({...base,browser:'firefox',rep:3,part:'no-key',variant:'plain',foregroundSetup:false})];
 const s=summarizeSettle(rs);
 const ff=find(s.diagnostics,{browser:'firefox',part:'secret'});
 assert.equal(ff.typeUnconfirmed,1);assert.equal(ff.expectedUnconfirmed,1);assert.equal(ff.unexpectedUnconfirmed,0);
 assert.equal(ff.expectedLimit,'#394');
 assert.equal(ff.contractFailures,1,'the confirmed row with a failure flag still counts');assert.equal(ff.contractFailuresExpectedLimit,1);
 const sf=find(s.diagnostics,{browser:'safari',part:'secret'});
 assert.equal(sf.expectedUnconfirmed,0);assert.equal(sf.unexpectedUnconfirmed,1);assert.equal(sf.contractFailures,1);
 assert.equal(find(s.diagnostics,{browser:'firefox',part:'no-key'}).unexpectedUnconfirmed,1,'only secrets carry the limit');
 const o=s.observations.find(o=>o.browser==='firefox'&&o.part==='secret'&&o.rep===1);
 assert.equal(o.expectedUnconfirmed,true);assert.equal(o.backgroundSetup,true);
 assert.equal(sf.expectedLimit,null);
 // foreground (true) and unknown (absent, null, non-boolean) setup are never the background limit
 for(const [name,extra] of [['foreground',{foregroundSetup:true}],['absent',{}],['null',{foregroundSetup:null}],['string',{foregroundSetup:'false'}]]){
  const n=summarizeSettle([row({...base,browser:'firefox',rep:1,contractFailure:true,...extra})]),g=find(n.diagnostics,{browser:'firefox',part:'secret'});
  assert.equal(g.expectedUnconfirmed,0,name);assert.equal(g.unexpectedUnconfirmed,1,name);assert.equal(g.expectedLimit,null,name);
  assert.equal(g.contractFailures,1,name);assert.equal(g.contractFailuresExpectedLimit,0,name);
  assert.equal(n.observations[0].expectedUnconfirmed,false,name);
  assert.equal(n.safety[0].contractFailures,1,name);
 }
 assert.equal(s.safety.find(x=>x.browser==='firefox').contractFailures,1,'the confirmed row counts, the background refusal does not');
 // all-cell accounting is unchanged by the label
 const w=summarizeSettle([row({...base,browser:'firefox',foregroundSetup:false,raw:success(),correct:false,privacyViolation:true})]);
 assert.equal(w.wrongSuccesses.length,1);assert.equal(w.safety[0].privacyViolations,1);
});

test('writeSettleTables writes only settle-prefixed files and keeps the numerator beside the denominator',t=>{
 const out=mkdtempSync(join(tmpdir(),'settle-report-'));t.after(()=>rmSync(out,{recursive:true,force:true}));
 const extra=row({browser:'safari',editor:'input',part:'secret',variant:'equality',key:null,length:64,correct:false});
 const s=writeSettleTables(out,[...rateRows(),extra,row({arm:'main',rep:50,raw:success({snapshotMs:3}),durationMs:12}),row({arm:'branch',rep:50,raw:success({snapshotMs:6,settleReads:2}),durationMs:30})]);
 const files=readdirSync(out);
 assert.ok(files.length>=10);
 assert.ok(files.every(f=>f.startsWith('settle-')),files.join());
 for(const banned of ['summary.json','rates.tsv','cost.tsv','cost-ab.tsv'])assert.ok(!files.includes(banned));
 assert.equal(s.cohort,'settle-ab');
 const j=JSON.parse(readFileSync(join(out,'settle-summary.json'),'utf8'));
 assert.equal(j.overall.length,s.overall.length);
 const rates=readFileSync(join(out,'settle-rates.tsv'),'utf8').split('\n').filter(Boolean),head=rates[0].split('\t');
 for(const col of ['falseUnconfirmedNumerator','falseUnconfirmedDenominator','falseUnconfirmedRate','refusalFalseUnconfirmedFraction','wrongSuccess','missingCorrectness','invalid'])assert.ok(head.includes(col),col);
 const line=rates.slice(1).map(l=>l.split('\t')).find(c=>c[head.indexOf('arm')]==='branch'&&c[head.indexOf('part')]==='race');
 assert.equal(line[head.indexOf('falseUnconfirmedNumerator')],'3');assert.equal(line[head.indexOf('falseUnconfirmedDenominator')],'12');
 const obs=readFileSync(join(out,'settle-observations.tsv'),'utf8').split('\n');
 assert.ok(obs[0].split('\t').includes('settleReadsState'));
 const wrong=readFileSync(join(out,'settle-wrong-successes.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
 assert.equal(wrong.length,s.wrongSuccesses.length);assert.ok(wrong.some(w=>w.part==='secret'));
 assert.ok(readFileSync(join(out,'settle-cost-ab.tsv'),'utf8').includes('durationMs'));
 assert.ok(readFileSync(join(out,'settle-paired.tsv'),'utf8').includes('durationDeltaMs'));
 assert.ok(readFileSync(join(out,'settle-cost.tsv'),'utf8').split('\n')[0].includes('programmedWaitLowerBoundP50'));
 assert.ok(readFileSync(join(out,'settle-diagnostics.tsv'),'utf8').includes('expectedUnconfirmed'));
 assert.ok(readFileSync(join(out,'settle-safety.tsv'),'utf8').includes('privacyViolations'));
 assert.ok(readFileSync(join(out,'settle-coverage.tsv'),'utf8').includes('diagnosticPlanned'));
});
