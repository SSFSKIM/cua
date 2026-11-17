import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {thresholdPlan,thresholdJudge,thresholdSignal,thresholdSummarize,thresholdCoverage} from './threshold-read.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const BROWSERS=['electron-parity','electron','cft'];
const DELAYS=[1500,1750,2000,2250,2500,2750,3000,3500];
const PID=9,WRITE=1000;

const page=(presses=0)=>({pageId:'a'.repeat(32),timeOrigin:1,trial:'t',presses,open:true,events:[]});
const quiet={dialogClosed:false,frontmostChanged:false,raised:false,windowMoved:false,otherPointer:false,ownerLost:false};
const manual={at:WRITE,value:true,error:0};
// A valid, correctly timed row for a plan cell; `delay` is the actual press minus the last owned Manual write.
const row=(cell,extra={},delay=cell.requestedDelayMs+10)=>({...cell,valid:true,appLaunchId:'L-'+cell.id,targetPid:PID,preMeasureAXPressCount:0,targetObservationCount:1,ageAtPressMs:900,
 before:page(),after:page(1),call:{startedAt:5000,endedAt:5010,raw:{result:{}}},sideEffects:{...quiet},measuredAXPressCount:1,
 referenceEnablementWrite:{...manual,attribute:'AXManualAccessibility',pid:PID},actualAXPressAt:WRITE+delay,
 readiness:{manualBucket:'ge2.5s',manual,manualDeltaMs:delay,enhanced:null},thresholdSignal:{pid:PID,value:'Search',error:0,readStartedAt:WRITE+delay-5,at:WRITE+delay-1},...extra});
const cellOf=(delay,browser='electron',rep=0)=>thresholdPlan({browser}).find(c=>c.requestedDelayMs===delay&&c.rep===rep);
const judge=(extra,delay=2000,actual)=>thresholdJudge(row(cellOf(delay),extra,actual));

test('plan: 80 full and 16 smoke cells per browser with unique ids, every factor and rotated delay order',()=>{
 const all=[];
 for(const browser of BROWSERS) {
  const full=thresholdPlan({browser}),smoke=thresholdPlan({browser,smoke:true});
  assert.equal(full.length,80);assert.equal(smoke.length,16);
  assert.ok(smoke.every(c=>c.rep<2));
  assert.deepEqual(smoke.map(c=>c.id),full.filter(c=>c.rep<2).map(c=>c.id));
  assert.equal(new Set(full.map(c=>c.id)).size,80);
  for(const c of full) {
   assert.deepEqual([c.phase,c.browser,c.age,c.observeFirst,c.temperature,c.scene,c.variant,c.operation,c.foreground],
    ['first-press',browser,'immediate',true,'cold','modal','main','press',false]);
   assert.equal(c.id,['threshold',browser,c.requestedDelayMs,c.rep].join('/'));
  }
  for(const d of DELAYS)assert.deepEqual(full.filter(c=>c.requestedDelayMs===d).map(c=>c.rep),[0,1,2,3,4,5,6,7,8,9]);
  assert.equal(new Set(Array.from({length:10},(_,r)=>full.find(c=>c.rep===r).requestedDelayMs)).size,8);
  all.push(...full);
 }
 assert.equal(new Set(all.map(c=>c.id)).size,240);
 assert.throws(()=>thresholdPlan({browser:'safari'}));
});
test('a correctly timed row is scored by the handler marker alone',()=>{
 const ok=judge({});
 assert.deepEqual([ok.eligible,ok.state,ok.exact,ok.ran,ok.falseSuccess,ok.delayMs],[true,'ok',true,true,false,2010]);
 const miss=judge({after:page(0)});
 assert.deepEqual([miss.eligible,miss.ran,miss.falseSuccess],[true,false,true]);
 const dup=judge({after:page(2)});
 assert.deepEqual([dup.exact,dup.duplicate],[false,true]);
 const err=judge({after:page(0),call:{startedAt:1,endedAt:2,raw:{error:{name:'unconfirmed'}}}});
 assert.deepEqual([err.eligible,err.answeredOK,err.falseSuccess],[true,false,false]);
});
test('timing: actual delay within [requested, requested+75] is valid; outside is mistimed and never scored',()=>{
 for(const [actual,state] of [[2000,'ok'],[2075,'ok'],[2076,'mistimed'],[1999,'mistimed'],[2600,'mistimed']]) {
  const j=judge({},2000,actual);
  assert.equal(j.state,state,String(actual));assert.equal(j.delayMs,actual);
  assert.equal(j.eligible,state==='ok');
  if(state==='mistimed')assert.deepEqual([j.exact,j.ran,j.falseSuccess],[false,false,false]);
 }
});
test('unestablished or inconsistent timing evidence is invalid, never a success or a mistiming',()=>{
 const base=row(cellOf(2000));
 const ref=extra=>({...base.referenceEnablementWrite,...extra});
 const cases={
  noReference:{referenceEnablementWrite:undefined},
  referenceError:{referenceEnablementWrite:ref({error:-25211})},
  referenceErrorUnknown:{referenceEnablementWrite:ref({error:undefined})},
  referenceDisabled:{referenceEnablementWrite:ref({value:false})},
  referenceOtherAttribute:{referenceEnablementWrite:ref({attribute:'AXFoo'})},
  referenceOtherPid:{referenceEnablementWrite:ref({pid:PID+1})},
  referenceRewritten:{referenceEnablementWrite:ref({at:WRITE-300})},
  readinessWriteMissing:{readiness:{...base.readiness,manual:null}},
  readinessWriteErrored:{readiness:{...base.readiness,manual:{...manual,error:-1}},referenceEnablementWrite:ref({error:-1})},
  noPress:{actualAXPressAt:undefined},
  badRequested:{requestedDelayMs:1234},
  noReadiness:{readiness:undefined},
 };
 for(const [name,extra] of Object.entries(cases)) {
  const j=thresholdJudge({...base,...extra});
  assert.deepEqual([j.state,j.eligible,j.exact,j.falseSuccess],['invalid',false,false,false],name);
 }
 // The Enhanced attribute is checked against the Enhanced write, never the Manual one.
 const enhanced={at:WRITE,value:true,error:0};
 const viaEnhanced=thresholdJudge({...base,referenceEnablementWrite:ref({attribute:'AXEnhancedUserInterface'}),readiness:{...base.readiness,manual:null,enhanced}});
 assert.deepEqual([viaEnhanced.state,viaEnhanced.eligible],['ok',true]);
 assert.equal(thresholdJudge({...base,referenceEnablementWrite:ref({attribute:'AXEnhancedUserInterface'})}).state,'invalid');
 // The base ownership, observation and handler-state rules still apply.
 for(const bad of [{valid:false,failureStage:'launch'},{appLaunchId:''},{before:{...page(),presses:1}},{after:undefined},{preMeasureAXPressCount:1},{targetObservationCount:0},{sideEffects:{...quiet,ownerLost:true}}])
  assert.equal(thresholdJudge({...base,...bad}).eligible,false,JSON.stringify(Object.keys(bad)));
});
test('the cell and the native call count must match the experiment',()=>{
 const base=row(cellOf(2000));
 for(const bad of [{variant:'bare'},{scene:'untrapped'},{temperature:'warm'},{age:'aged'},{observeFirst:false}])
  assert.equal(thresholdJudge({...base,...bad}).state,'invalid',JSON.stringify(bad));
 assert.equal(thresholdJudge({...base,measuredAXPressCount:0}).state,'invalid');
 assert.equal(thresholdJudge({...base,measuredAXPressCount:2}).state,'invalid');
 assert.equal(thresholdJudge({...base,measuredAXPressCount:undefined}).state,'invalid');
 // An explicit target error is real: no native AXPress needed, and none is fabricated.
 const refused={call:{startedAt:1,endedAt:2,raw:{error:{name:'refused'}}},after:page(0)};
 assert.equal(thresholdJudge({...base,...refused,measuredAXPressCount:0}).eligible,true);
 assert.equal(thresholdJudge({...base,...refused,measuredAXPressCount:1}).eligible,true);
 assert.equal(thresholdJudge({...base,...refused,measuredAXPressCount:2}).eligible,false);
});
test('the gate signal: present only as Search with error 0; missing only when a benign nil is known; the rest unknown',()=>{
 const s=(value,error)=>thresholdSignal({value,error,readStartedAt:1,at:2});
 assert.equal(s('Search',0),'present');
 for(const [v,e] of [[null,0],[undefined,0],['',0],[null,-25212],[null,-25205],['',-25212],[undefined,-25205]])assert.equal(s(v,e),'absent',String([v,e]));
 for(const [v,e] of [['Search',-25204],['Search',undefined],[null,-25204],[null,-25211],[null,-25202],[null,undefined],['Other',0],['search',0],['Search',-25212],[0,0]])assert.equal(s(v,e),'unknown',String([v,e]));
 assert.equal(thresholdSignal(undefined),'unknown');
 assert.equal(thresholdSignal({value:'Search',error:0}),'unknown');
 assert.equal(judge({thresholdSignal:{pid:PID,value:null,error:0,readStartedAt:1,at:2}}).signal,'absent');
});
test('a signal from another target, without a pid, or read after the press cannot establish pre-press presence or absence',()=>{
 const press=3010,ctx={pid:PID,pressAt:press},sig=(extra={})=>({pid:PID,value:'Search',error:0,readStartedAt:press-6,at:press-1,...extra});
 assert.equal(thresholdSignal(sig(),ctx),'present');
 assert.equal(thresholdSignal(sig({at:press}),ctx),'present');
 assert.equal(thresholdSignal(sig({at:press+1}),ctx),'unknown');
 assert.equal(thresholdSignal(sig({pid:PID+1}),ctx),'unknown');
 assert.equal(thresholdSignal(sig({pid:undefined}),ctx),'unknown');
 assert.equal(thresholdSignal(sig({value:null,at:press+1}),ctx),'unknown');
 assert.equal(thresholdSignal(sig({value:null,pid:PID+1}),ctx),'unknown');
 assert.equal(judge({thresholdSignal:{pid:PID+1,value:'Search',error:0,readStartedAt:1,at:2}}).signal,'unknown');
 assert.equal(judge({thresholdSignal:{pid:PID,value:'Search',error:0,readStartedAt:1,at:99999}}).signal,'unknown');
 assert.equal(judge({thresholdSignal:{value:'Search',error:0,readStartedAt:1,at:2}}).signal,'unknown');
});
test('Enhanced may carry -25208 only with a true read-back for the target after the reference and before the press; Manual needs error 0',()=>{
 const enhancedRow=(refError,trace,extra={})=>{
  const raw={at:WRITE,value:true,error:refError};
  return thresholdJudge({...row(cellOf(2000)),referenceEnablementWrite:{...raw,attribute:'AXEnhancedUserInterface',pid:PID},
   readiness:{manualBucket:'unwritten',manual:null,enhanced:raw,manualDeltaMs:null,enhancedDeltaMs:2010},nativeTrace:trace,...extra});
 };
 const read=(extra={})=>({kind:'read',attribute:'AXEnhancedUserInterface',pid:PID,at:WRITE+5,value:true,error:0,...extra});
 assert.deepEqual([enhancedRow(0,undefined).state,enhancedRow(0,[]).eligible],['ok',true]);
 assert.deepEqual([enhancedRow(-25208,[read()]).state,enhancedRow(-25208,[read()]).eligible],['ok',true]);
 // A read-back exactly at the reference, or exactly at the press, counts.
 assert.equal(enhancedRow(-25208,[read({at:WRITE})]).state,'ok');
 assert.equal(enhancedRow(-25208,[read({at:WRITE+2010})]).state,'ok');
 // Anything short of a successful, true, same-target, same-attribute, correctly timed read-back is invalid, never a success.
 for(const [name,trace] of Object.entries({
  none:undefined,empty:[],
  before:[read({at:WRITE-1})],afterPress:[read({at:WRITE+2011})],
  falseValue:[read({value:false})],readError:[read({error:-25204})],readErrorUnknown:[read({error:undefined})],
  otherPid:[read({pid:PID+1})],otherAttribute:[read({attribute:'AXManualAccessibility'})],writeRecord:[read({kind:'write.end'})],
 })) {
  const j=enhancedRow(-25208,trace);
  assert.deepEqual([j.state,j.eligible,j.exact,j.falseSuccess],['invalid',false,false,false],name);
 }
 // Only -25208 is excused; another Enhanced error, or a Manual error, stays invalid even with a read-back.
 assert.equal(enhancedRow(-25211,[read()]).state,'invalid');
 const manualRow=(error,trace)=>{const raw={at:WRITE,value:true,error};return thresholdJudge({...row(cellOf(2000)),referenceEnablementWrite:{...raw,attribute:'AXManualAccessibility',pid:PID},
  readiness:{manualBucket:'write-error',manual:raw,enhanced:null},nativeTrace:trace});};
 assert.equal(manualRow(-25208,[read({attribute:'AXManualAccessibility'})]).state,'invalid');
 assert.equal(manualRow(-25208,[read()]).state,'invalid');
 // The raw reference must still equal the readiness write.
 assert.equal(enhancedRow(-25208,[read()],{readiness:{manualBucket:'unwritten',manual:null,enhanced:{at:WRITE,value:true,error:0}}}).state,'invalid');
});
test('summary groups by browser and requested delay with exact accounting and tri-state side effects',()=>{
 const c0=cellOf(2000,'electron',0),c1=cellOf(2000,'electron',1),c2=cellOf(2000,'electron',2),c3=cellOf(2000,'electron',3),c4=cellOf(2000,'electron',4),c5=cellOf(2000,'electron',5);
 const rows=[
  row(c0,{},2010),
  row(c1,{after:page(0),thresholdSignal:{pid:PID,value:null,error:0,readStartedAt:1,at:2},call:{startedAt:0,endedAt:30,raw:{result:{}}}},2040),
  row(c2,{after:page(2),thresholdSignal:{pid:PID,value:'Search',error:-25204,readStartedAt:1,at:2}},2020),
  row(c3,{},2300,{}),                                   // mistimed, still has side effects that count
  row(c4,{valid:false,failureStage:'launch',sideEffects:{...quiet,raised:true,windowMoved:null},profileCleanup:{attempted:true,ok:false,error:'x'}}),
  row(c5,{referenceEnablementWrite:undefined}),         // invalid timing evidence
  row(cellOf(2000,'cft',0)),
 ];
 rows[3].sideEffects={...quiet,frontmostChanged:true};
 const s=thresholdSummarize(rows);
 assert.equal(s.length,2);
 const g=s.find(x=>x.browser==='electron'&&x.requestedDelayMs===2000);
 assert.deepEqual([g.attempted,g.valid,g.invalid,g.mistimed],[6,3,2,1]);
 assert.deepEqual([g.repliesOK,g.errors,g.delivered,g.exact,g.falseSuccess,g.duplicates],[3,0,2,1,1,1]);
 assert.deepEqual(g.signal,{present:1,absent:1,unknown:1});
 assert.deepEqual(g.actualDelayMs,{p50:2020,p95:2300,max:2300});
 assert.deepEqual(g.callMs,{p50:10,p95:30,max:30});
 assert.deepEqual([g.sideEffects.raised,g.sideEffects.frontmostChanged,g.sideEffectsUnknown.windowMoved,g.profileCleanupFailures],[1,1,1,1]);
 assert.deepEqual(g.invalidByStage,{launch:1,'timing-evidence':1});
 assert.equal(s.find(x=>x.browser==='cft').valid,1);
});
test('coverage needs the exact plan, unique fresh launches, and only correctly timed valid rows',()=>{
 const rowsFor=(browser,smoke)=>thresholdPlan({browser,smoke}).map(c=>row(c,{smoke}));
 const ok=rowsFor('cft',true);
 assert.equal(thresholdCoverage(ok,{browser:'cft',smoke:true}).ok,true);
 assert.equal(thresholdCoverage(ok.slice(1),{browser:'cft',smoke:true}).missing.length,1);
 const dup=thresholdCoverage([...ok,ok[3]],{browser:'cft',smoke:true});
 assert.deepEqual(dup.duplicates,[ok[3].id]);assert.equal(dup.ok,false);
 const mistimed=ok.map((r,i)=>i===2?{...r,actualAXPressAt:r.actualAXPressAt+500}:r);
 const m=thresholdCoverage(mistimed,{browser:'cft',smoke:true});
 assert.deepEqual([m.ok,m.invalid.length,m.invalid[0].state,m.mistimed],[false,1,'mistimed',1]);
 const bad=thresholdCoverage(ok.map((r,i)=>i===0?{...r,referenceEnablementWrite:undefined}:r),{browser:'cft',smoke:true});
 assert.deepEqual([bad.ok,bad.invalid[0].state,bad.mistimed],[false,'invalid',0]);
 const reused=thresholdCoverage(ok.map((r,i)=>i===5?{...r,appLaunchId:ok[2].appLaunchId}:r),{browser:'cft',smoke:true});
 assert.deepEqual(reused.reusedLaunchIds,[{appLaunchId:ok[2].appLaunchId,ids:[ok[2].id,ok[5].id]}]);assert.equal(reused.ok,false);
 const extra=thresholdCoverage([...ok,{...ok[0],id:'zzz',appLaunchId:'Lz'}],{browser:'cft',smoke:true});
 assert.deepEqual(extra.unexpected,['zzz']);assert.equal(extra.ok,false);
 assert.equal(thresholdCoverage(ok,{browser:'cft',smoke:false}).missing.length,64);
 const full=thresholdCoverage(rowsFor('electron',false),{browser:'electron'});
 assert.deepEqual([full.expected,full.ok],[80,true]);
 const two=thresholdCoverage([...rowsFor('cft',true),...rowsFor('electron',true)],{smoke:true});
 assert.deepEqual([two.expected,two.ok],[32,true]);
 assert.equal(thresholdCoverage([]).ok,false);
 assert.equal(thresholdCoverage([],{browser:'cft',smoke:true}).ok,false);
});
test('CLI plan, summary and coverage read directories and rows.jsonl as data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'threshold-read-'));
 try {
  const sub=join(dir,'run');mkdirSync(sub);
  const rows=thresholdPlan({browser:'cft',smoke:true}).map(c=>row(c,{smoke:true}));
  writeFileSync(join(sub,'rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const run=(...a)=>spawnSync(process.execPath,[join(here,'threshold-read.mjs'),...a],{encoding:'utf8'});
  const p=run('plan','cft','smoke');assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).length,16);
  const s=run('summary',dir);assert.equal(s.status,0);assert.equal(JSON.parse(s.stdout).length,8);
  const c=run('coverage',join(sub,'rows.jsonl'));assert.equal(c.status,0,c.stdout+c.stderr);assert.equal(JSON.parse(c.stdout).ok,true);
  writeFileSync(join(sub,'rows.jsonl'),rows.slice(1).map(r=>JSON.stringify(r)).join('\n')+'\n');
  assert.equal(run('coverage',dir).status,1);
  assert.notEqual(run('bogus').status,0);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
