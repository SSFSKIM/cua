import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {qualificationPlan,qualificationJudgeCall,qualificationSummarize,qualificationCoverage,lifecycleProduct} from './qualification-read.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const BROWSERS=['electron-parity','electron','cft'];
// group/engineSide -> [launches, expected call labels]
const SPECS={'cold/main':[20,['cold']],'cold/fix':[20,['cold','warm']],'posthold/fix':[10,['cold','posthold']],'value/main':[10,['value']],'value/fix':[10,['value']],'load/fix':[20,['loaded']],'early/fix':[10,['early']]};

const quiet={dialogClosed:false,frontmostChanged:false,raised:false,windowMoved:false,otherPointer:false,ownerLost:false};
const owner={pageId:'a'.repeat(32),timeOrigin:1000};
const presses=(n,m=n+1)=>[{...owner,presses:n},{...owner,presses:m,events:[]}];
// One measured call; `i` orders calls in time.
const call=(label,extra={},i=0)=>{
 const value=label==='value',[before,after]=value?[{...owner,value:'',reactValue:''},{...owner,value:'needle',reactValue:'needle',events:[{type:'search.handler',value:'needle',wallAt:10000+i*100+5}]}]:presses(0);
 return {label,method:value?'set_value':'click',startedAt:10000+i*100,endedAt:10000+i*100+10,raw:{result:{}},before,after,samples:[],waitMs:12,waitEvidence:'signpost',sideEffects:{...quiet},...(value?{expectedValue:'needle'}:{}),
  ...(label==='loaded'?{loadBefore:loadSample(1),loadAfter:loadSample(2),loadCpuPercent:190}:{}),...(label==='early'?{wrongTargetHits:[]}:{}),...extra};
};
const loadSample=at=>({at,workers:[{pid:11,percent:90,cpuSeconds:at},{pid:12,percent:95,cpuSeconds:at}],expected:2,status:'ok'});
const row=(cell,extra={})=>({id:cell.id,browser:cell.browser,group:cell.group,engineSide:cell.engineSide,rep:cell.rep,appLaunchId:'L-'+cell.id,valid:true,owner,observations:[{startedAt:1,endedAt:2,waitMs:5,waitEvidence:'signpost',raw:{result:{timings:cell.group==='early'?{chromiumReady:'deadline'}:{}}}}],
 calls:cell.expectedCalls.map((l,i)=>call(l,l==='posthold'?{startedAt:50000,endedAt:50010}:{},i)),profileCleanup:{attempted:true,ok:true},
 ...(cell.group==='posthold'?{postholdRelease:{prior:'false',verified:true,idleFromRequestEndMs:36500,eventsBeforeObservation:[]}}:{}),...extra});
const cellOf=(spec,browser='electron',rep=0)=>{const [group,engineSide]=spec.split('/');return qualificationPlan({browser}).find(c=>c.group===group&&c.engineSide===engineSide&&c.rep===rep)};
const rowOf=(spec,extra={},browser='electron',rep=0)=>row(cellOf(spec,browser,rep),extra);

test('plan: 100 launches and 130 calls per browser, 14 launches in smoke, unique ids and fresh launches',()=>{
 const all=[];
 for(const browser of BROWSERS) {
  const full=qualificationPlan({browser}),smoke=qualificationPlan({browser,smoke:true});
  assert.equal(full.length,100);assert.equal(smoke.length,14);
  assert.equal(full.reduce((n,c)=>n+c.expectedCalls.length,0),130);assert.equal(smoke.reduce((n,c)=>n+c.expectedCalls.length,0),18);
  for(const [spec,[launches,labels]] of Object.entries(SPECS)) {
   const [group,engineSide]=spec.split('/'),cells=full.filter(c=>c.group===group&&c.engineSide===engineSide);
   assert.equal(cells.length,launches,spec);
   assert.deepEqual(cells.map(c=>c.rep),Array.from({length:launches},(_,i)=>i));
   assert.ok(cells.every(c=>JSON.stringify(c.expectedCalls)===JSON.stringify(labels)&&c.browser===browser&&c.phase==='qualification'));
   assert.deepEqual(smoke.filter(c=>c.group===group&&c.engineSide===engineSide).map(c=>c.rep),[0,1]);
  }
  assert.deepEqual([...new Set(full.map(c=>c.group))].sort(),['cold','early','load','posthold','value']);
  assert.equal(new Set(full.map(c=>c.id)).size,100);
  assert.ok(full.every(c=>c.id===['qualification',browser,c.group,c.engineSide,c.rep].join('/')));
  assert.deepEqual(smoke.map(c=>c.id),full.filter(c=>c.rep<2).map(c=>c.id));
  // The cell order rotates, so no group or engine side always launches first.
  assert.ok(new Set(Array.from({length:10},(_,r)=>full.find(c=>c.rep===r).group+full.find(c=>c.rep===r).engineSide)).size>=4);
  all.push(...full);
 }
 assert.equal(new Set(all.map(c=>c.id)).size,300);
 assert.throws(()=>qualificationPlan({browser:'safari'}));
});
test('recovery isolates the setup-invalid value cell and never replaces its original attempt',()=>{
 const cells=qualificationPlan({browser:'electron',repair:true});
 assert.equal(cells.length,1);
 assert.deepEqual(cells[0],{phase:'qualification-repair',browser:'electron',group:'value',engineSide:'fix',rep:1,expectedCalls:['value'],id:'qualification-repair/electron/value/fix/1',recoveryOf:'qualification/electron/value/fix/1'});
 const r={...row(cells[0]),phase:cells[0].phase,recoveryOf:cells[0].recoveryOf};
 assert.equal(qualificationCoverage([r]).ok,true);
 assert.equal(qualificationCoverage([r],{browser:'electron',repair:true}).expectedCalls,1);
 assert.equal(qualificationSummarize([r]).calls[0].delivered,1);
 assert.equal(qualificationCoverage([r,r]).ok,false);
 assert.equal(qualificationCoverage([{...r,calls:[]}]).ok,false);
 assert.throws(()=>qualificationPlan({browser:'cft',repair:true}));
 assert.equal(qualificationPlan({browser:'electron'}).length,100);
});
test('matched supplement gives both heads warm and genuinely released posthold cells without changing the full plan',()=>{
 const all=[];
 for(const browser of BROWSERS){
  const reps=browser==='electron'?10:5,cells=qualificationPlan({browser,supplement:true});
  assert.equal(cells.length,reps*4);
  for(const group of ['cold','posthold'])for(const side of ['main','fix']){
   const matched=cells.filter(c=>c.group===group&&c.engineSide===side);
   assert.equal(matched.length,reps);
   assert.ok(matched.every(c=>c.phase==='qualification-supplement'&&c.id.startsWith('qualification-supplement/')&&JSON.stringify(c.expectedCalls)===JSON.stringify(['cold',group==='cold'?'warm':'posthold'])));
  }
  const rows=cells.map(c=>({...row(c),phase:c.phase}));
  assert.equal(qualificationCoverage(rows,{browser,supplement:true}).ok,true);
  assert.equal(qualificationCoverage(rows).ok,true);
  const mainWarm=rows.find(r=>r.group==='cold'&&r.engineSide==='main');
  assert.equal(qualificationCoverage(rows.map(r=>r===mainWarm?{...r,calls:r.calls.slice(0,1)}:r)).invalid[0].reason,'calls');
  const mainHold=rows.find(r=>r.group==='posthold'&&r.engineSide==='main');
  assert.equal(qualificationCoverage(rows.map(r=>r===mainHold?{...r,postholdRelease:{...r.postholdRelease,prior:'owned'}}:r)).invalid[0].reason,'posthold-release');
  assert.equal(qualificationCoverage(rows.slice(1),{browser,supplement:true}).missing.length,1);
  assert.equal(qualificationSummarize(rows).calls.filter(c=>c.engineSide==='main').length,4);
  assert.equal(qualificationPlan({browser}).length,100);
  all.push(...rows);
 }
 assert.deepEqual([all.length,all.reduce((n,r)=>n+r.calls.length,0)],[80,160]);
 assert.equal(qualificationCoverage(all).ok,true);
});
// A complete lifecycle launch: cold (waits), 36 s idle, held (owned, no write, no wait), endTask, then a new connection's observation (waits).
const PRESS=['AXPress'],cachedRec=(startedAt,actions=PRESS,actionsError=0)=>({startedAt,endedAt:startedAt+1,cached:{button:{actions,actionsError},field:{actions:null,actionsError:0}}});
const lifeRow=(c,browser,over={})=>({...row(c),phase:c.phase,targetPid:4242,
 appInfo:browser==='cft'?[]:[{kind:'accessibility-support-changed',pid:4242,enabled:true,at:1100},{kind:'accessibility-support-changed',pid:4242,enabled:false,at:55005}],
 calls:[call('cold',{},0),call('held',{startedAt:50100,endedAt:50110},1),call('new-task',{startedAt:58000,endedAt:58010},2)],
 observations:[
  {startedAt:1000,endedAt:9990,waitMs:2501,waitEvidence:'signpost',raw:{result:{timings:{enablementPrior:'false',enablementWrite:'success'}}}},
  {startedAt:50000,endedAt:50010,waitMs:0.01,waitEvidence:'signpost',raw:{result:{timings:{enablementPrior:'owned'}}}},
  {startedAt:55020,endedAt:57990,waitMs:2505,waitEvidence:'signpost',raw:{result:{timings:{enablementPrior:'false',enablementWrite:'success'}}}},
 ],
 taskEnd:{startedAt:55000,endedAt:55010,raw:{result:{released:1}}},
 releaseRead:{startedAt:55013,endedAt:55014,attribute:browser==='cft'?'AXEnhancedUserInterface':'AXManualAccessibility',axError:0,value:false},
 releaseEvidence:{cachedBefore:cachedRec(50200),cachedAfter:cachedRec(55011),...(browser==='cft'?{}:{setterWait:{startedAt:55015,endedAt:55016,deadlineMs:3000}}),errors:{}},
 ...over});
const lifeRows=(browser,over)=>qualificationPlan({browser,lifecycle:true}).map(c=>lifeRow(c,browser,over));
test('lifecycle smoke plan is fix only: cold, held, then a new task after endTask',()=>{
 for(const browser of BROWSERS){
  const cells=qualificationPlan({browser,lifecycle:true});
  assert.equal(cells.length,3);
  assert.ok(cells.every(c=>c.phase==='qualification-lifecycle'&&c.engineSide==='fix'&&c.group==='lifecycle'&&JSON.stringify(c.expectedCalls)===JSON.stringify(['cold','held','new-task'])));
  const rows=lifeRows(browser);
  assert.equal(qualificationCoverage(rows,{browser,lifecycle:true}).ok,true);
  assert.equal(qualificationCoverage(rows).ok,true);
  assert.equal(qualificationSummarize(rows).calls.every(c=>c.valid===3),true);
  const invalid=extra=>qualificationCoverage(lifeRows(browser).map((r,i)=>i===0?{...r,...extra}:r)).invalid[0]?.reason;
  assert.equal(invalid({observations:rows[0].observations.slice(0,2)}),'lifecycle-observations');
  assert.equal(invalid({observations:rows[0].observations.map((o,i)=>i===1?{...o,startedAt:45999}:o)}),'lifecycle-idle');
  assert.equal(invalid({taskEnd:{...rows[0].taskEnd,raw:{}}}),'lifecycle-task-end');
  assert.equal(invalid({releaseRead:undefined}),'lifecycle-release');
  assert.equal(invalid({releaseRead:{...rows[0].releaseRead,endedAt:58001}}),'lifecycle-release');
  assert.equal(invalid({releaseRead:{...rows[0].releaseRead,attribute:'AXFocused'}}),'lifecycle-release');
  assert.equal(invalid({releaseEvidence:undefined}),'lifecycle-cache');
  assert.equal(invalid({releaseEvidence:{...rows[0].releaseEvidence,cachedAfter:undefined}}),'lifecycle-cache');
  assert.equal(invalid({releaseEvidence:{...rows[0].releaseEvidence,cachedBefore:cachedRec(55001)}}),'lifecycle-cache');
  assert.equal(invalid({releaseEvidence:{...rows[0].releaseEvidence,setterWait:undefined}}),browser==='cft'?undefined:'lifecycle-setter');
  assert.equal(invalid({releaseEvidence:{...rows[0].releaseEvidence,errors:{cachedAfter:'boom'}}}),'lifecycle-cache');
  assert.equal(qualificationCoverage(rows.slice(1),{browser,lifecycle:true}).missing.length,1);
 }
});
test('a failed release read or a still-true native getter is retained as evidence and never blocks or proves release',()=>{
 for(const browser of BROWSERS){
  for(const read of [{value:true},{value:null,axError:-25205},{value:false}]){
   const rows=lifeRows(browser,{});rows.forEach(r=>Object.assign(r.releaseRead,read));
   assert.equal(qualificationCoverage(rows).ok,true,JSON.stringify(read));
   const p=lifecycleProduct(rows[0]);
   assert.equal(p.release.native,read.value===false?'false':read.value===true?'true':'unreadable');
   // The native read alone is never an independent release signal.
   assert.equal(p.release.independentSignal,browser==='cft'?'none':'setter-event');
   assert.equal(p.pass,true);
  }
 }
});
test('lifecycle product checks are per stage and separate from coverage: a complete failed smoke stays failed',()=>{
 const good=lifecycleProduct(lifeRows('electron')[0]);
 assert.equal(good.evidenceComplete,true);assert.equal(good.pass,true);
 assert.deepEqual(Object.fromEntries(Object.entries(good.stages).map(([k,v])=>[k,v.pass])),{cold:true,gap:true,held:true,endTask:true,newTask:true});
 assert.equal(good.stages.gap.ms,39990);assert.equal(good.stages.held.prior,'owned');assert.equal(good.stages.held.waitMs,0.01);
 assert.equal(good.stages.newTask.waitMs,2505);assert.equal(good.stages.cold.delivery,'exact');assert.equal(good.stages.endTask.releasedComputed,1);
 const mod=(index,timings,waitMs)=>lifeRows('electron')[0].observations.map((o,i)=>i===index?{...o,waitMs:waitMs??o.waitMs,raw:{result:{timings}}}:o);
 const failed=(observations,stage)=>{const r={...lifeRows('electron')[0],observations},p=lifecycleProduct(r);assert.equal(p.evidenceComplete,true);assert.equal(p.stages[stage].pass,false,stage);assert.equal(p.pass,false);assert.equal(qualificationCoverage([r,...lifeRows('electron').slice(1)]).ok,true);return p};
 failed(mod(1,{enablementPrior:'false'}),'held');
 failed(mod(1,{enablementPrior:'owned',enablementWrite:'success'}),'held');
 failed(mod(1,{enablementPrior:'owned'},2400),'held');
 failed(mod(0,{enablementPrior:'false'}),'cold');
 failed(mod(0,{enablementPrior:'false',enablementWrite:'success'},40),'cold');
 failed(mod(0,{enablementPrior:'false',enablementWrite:'success'},1999),'cold');
 failed(mod(2,{enablementPrior:'false',enablementWrite:'success'},1000),'newTask');
 failed(mod(1,{enablementPrior:'owned'},100),'held');
 failed(mod(2,{enablementPrior:'owned',enablementWrite:'success'}),'newTask');
 failed(mod(2,{enablementPrior:'false'}),'newTask');
 failed(mod(2,{enablementPrior:'false',enablementWrite:'success'},10),'newTask');
 // A failed write keeps the attempted-write fact (so held's no-write check sees it) but is not an accepted write.
 const fw=failed(mod(0,{enablementPrior:'false',enablementWrite:'failed'}),'cold');
 assert.deepEqual([fw.stages.cold.wrote,fw.stages.cold.acceptedWrite],[true,false]);
 assert.equal(failed(mod(2,{enablementPrior:'false',enablementWrite:'failed'}),'newTask').stages.newTask.acceptedWrite,false);
 const hw=failed(mod(1,{enablementPrior:'owned',enablementWrite:'failed'}),'held');
 assert.deepEqual([hw.stages.held.wrote,hw.stages.held.noWrite],[true,false]);
 // An error reply with the handler count still delivered is not a pass.
 for(const [label,stage] of [['cold','cold'],['held','held'],['new-task','newTask']]){
  const r=lifeRows('electron')[0],p=lifecycleProduct({...r,calls:r.calls.map(c=>c.label===label?{...c,raw:{error:{errorName:'x'}}}:c)});
  assert.equal(p.stages[stage].delivery,'exact');assert.equal(p.stages[stage].replyOk,false);assert.equal(p.stages[stage].pass,false,label);assert.equal(p.pass,false);
 }
 const miss=(label,e)=>{const r=lifeRows('electron')[0],p=lifecycleProduct({...r,calls:r.calls.map(c=>c.label===label?{...c,after:{...c.after,presses:0}}:c)});assert.equal(p.stages[e].delivery,'notDelivered');assert.equal(p.stages[e].pass,false);};
 miss('cold','cold');miss('held','held');miss('new-task','newTask');
 const dup=lifeRows('electron')[0],d=lifecycleProduct({...dup,calls:dup.calls.map(c=>c.label==='held'?{...c,after:{...c.after,presses:2}}:c)});
 assert.equal(d.stages.held.delivery,'duplicate');assert.equal(d.stages.held.pass,false);
 const e=lifeRows('electron')[0],err=lifecycleProduct({...e,taskEnd:{...e.taskEnd,raw:{error:{errorName:'x'}}}});
 assert.equal(err.stages.endTask.replied,false);assert.equal(err.pass,false);
 const shortGap=lifecycleProduct({...e,observations:e.observations.map((o,i)=>i===1?{...o,startedAt:30000}:o)});
 assert.equal(shortGap.stages.gap.genuine,false);assert.equal(shortGap.pass,false);
 const unknown=lifecycleProduct({...e,observations:e.observations.map((o,i)=>i===1?{...o,waitEvidence:'missing',waitMs:null}:o)});
 assert.equal(unknown.stages.held.noWait,null);assert.equal(unknown.pass,null);
});
test('release signals are counted apart: native read, cached same-ref action, setter events; a computed released count is labelled computed',()=>{
 const cft=lifeRows('cft')[0],ev=extra=>({...cft.releaseEvidence,...extra});
 const sig=r=>lifecycleProduct(r).release;
 assert.deepEqual([sig(cft).cachedAction,sig(cft).independentSignal,sig(cft).setterFalse],['retained','none',null]);
 const lost=sig({...cft,releaseEvidence:ev({cachedAfter:cachedRec(55011,[])})});
 assert.deepEqual([lost.cachedAction,lost.independentSignal],['lost','cached-action-loss']);
 const inv=sig({...cft,releaseEvidence:ev({cachedAfter:cachedRec(55011,null,-25202)})});
 assert.deepEqual([inv.cachedAction,inv.independentSignal],['refInvalid','none']);
 assert.equal(sig({...cft,releaseEvidence:ev({cachedBefore:cachedRec(50200,[])})}).cachedAction,'no-baseline');
 const el=lifeRows('electron')[0];
 assert.deepEqual([sig(el).setterFalse,sig(el).setterTrue,sig(el).independentSignal],[1,0,'setter-event']);
 // Events outside the endTask..next-observation window, from another pid, or enabling are not release events.
 const f=(at,extra={})=>({kind:'accessibility-support-changed',pid:4242,enabled:false,at,...extra});
 const noise=sig({...el,appInfo:[f(54999),f(55020.5),f(55005,{pid:1}),f(55005,{enabled:true})]});
 assert.deepEqual([noise.setterFalse,noise.setterTrue,noise.independentSignal],[0,1,'none']);
 assert.equal(sig({...el,appInfo:[f(55000),f(55020)]}).setterFalse,2);
 // Summary: tallies per signal, the new-task prior/write/wait beside them, observationFields, and the computed note.
 const rows=[...lifeRows('electron'),...lifeRows('electron').map((r,i)=>i===0?{...r,appInfo:[],releaseRead:{...r.releaseRead,value:true}}:r)].map((r,i)=>({...r,id:r.id+(i>=3?'x':''),appLaunchId:r.appLaunchId+i}));
 const [launch]=qualificationSummarize(rows).launches,l=launch.lifecycle;
 assert.equal(launch.group,'lifecycle');
 assert.deepEqual(l.release.nativeRead,{false:5,true:1});
 assert.deepEqual(l.release.setterFalseEvents,{0:1,1:5});
 assert.deepEqual(l.release.independentSignal,{'setter-event':5,none:1});
 assert.deepEqual(l.release.cachedAction,{retained:6});
 assert.match(l.release.note,/computed/);
 assert.deepEqual(l.stages.endTask.releasedComputed,{1:6});
 assert.deepEqual(l.stages.newTask.prior,{false:6});assert.deepEqual(l.stages.newTask.write,{success:6});assert.equal(l.stages.newTask.waitMs.p50,2505);
 assert.deepEqual(l.stages.held.prior,{owned:6});assert.deepEqual(l.stages.held.write,{absent:6});assert.equal(l.stages.held.waitMs.max,0.01);
 assert.deepEqual(l.stages.gap.genuine,{true:6});
 assert.deepEqual(l.product,{pass:6,fail:0,unknown:0});
 assert.deepEqual(launch.observationFields.map(f=>f.index),[0,1,2]);
 assert.deepEqual(launch.observationFields[1].enablementPrior,{owned:6});assert.deepEqual(launch.observationFields[2].enablementWrite,{success:6});
 assert.equal(launch.observationTimings.length,6*3);
});
test('press oracle is the handler count change; never unchanged-state confirmation',()=>{
 const j=(before,after,extra={})=>{const r=rowOf('cold/main');r.calls[0]={...r.calls[0],before:{...owner,presses:before},after:{...owner,presses:after},...extra};return qualificationJudgeCall(r,r.calls[0])};
 const sig=o=>[o.known,o.delivered,o.exact,o.duplicate,o.falseSuccess,o.error];
 assert.deepEqual(sig(j(0,1)),[true,true,true,false,false,false]);
 assert.deepEqual(sig(j(3,4)),[true,true,true,false,false,false]);
 assert.deepEqual(sig(j(0,2)),[true,true,false,true,false,false]);
 assert.deepEqual(sig(j(2,2)),[true,false,false,false,true,false]);
 // An explicit error reply is its own outcome, not a false success.
 assert.deepEqual(sig(j(0,0,{raw:{error:{name:'refused'}}})),[true,false,false,false,false,true]);
 assert.deepEqual(sig(j(0,1,{raw:{error:{name:'late'}}})),[true,true,true,false,false,true]);
 // Unknown ground truth is unknown, never a known drop.
 for(const [b,a] of [[0,undefined],[undefined,1],[0,null],[0,'1'],[2,1],[0,-1]])
  assert.deepEqual(sig(j(b,a)),[false,false,false,false,false,false],String([b,a]));
 const r=rowOf('cold/main');
 for(const after of [{...owner,pageId:'b'.repeat(32),presses:1},{...owner,timeOrigin:5,presses:1}]) {
  r.calls[0]={...r.calls[0],after};
  assert.equal(qualificationJudgeCall(r,r.calls[0]).known,false);
 }
});
test('value oracle needs DOM value, React value and a matching handler event',()=>{
 const j=(after,extra={})=>{const r=rowOf('value/main');r.calls[0]={...r.calls[0],after:{...r.calls[0].after,...after},...extra};return qualificationJudgeCall(r,r.calls[0])};
 const ev=(value='needle',extra={})=>({type:'search.handler',value,wallAt:10005,...extra});
 const sig=o=>[o.known,o.delivered,o.exact,o.duplicate,o.falseSuccess];
 assert.deepEqual(sig(j({})),[true,true,true,false,false]);
 assert.deepEqual(sig(j({reactValue:''})),[true,false,false,false,true]);
 assert.deepEqual(sig(j({value:''})),[true,false,false,false,true]);
 assert.deepEqual(sig(j({events:[]})),[true,false,false,false,true]);
 assert.deepEqual(sig(j({events:[ev('other')]})),[true,false,false,false,true]);
 assert.deepEqual(sig(j({events:[ev('needle',{type:'pointerdown'})]})),[true,false,false,false,true]);
 assert.deepEqual(sig(j({events:[ev('needle',{wallAt:9000})]})),[true,false,false,false,true]);
 assert.deepEqual(sig(j({events:[ev(),ev()]})),[true,true,false,true,false]);
 assert.deepEqual(sig(j({events:[{kind:'search.handler',value:'needle'}]})),[true,true,true,false,false]);
 // Unknown: events unobserved, expected value missing, or the field already held the value before the call.
 assert.equal(j({events:undefined}).known,false);
 assert.equal(j({value:undefined}).known,false);
 assert.equal(j({},{expectedValue:undefined}).known,false);
 assert.equal(j({},{before:{...owner,value:'needle',reactValue:'needle'}}).known,false);
 assert.equal(j({},{raw:{error:{name:'refused'}}}).error,true);
});
test('actual wait comes only from the signpost; no-gate and missing evidence are never zero',()=>{
 const rows=[0,1,2,3,4].map(i=>rowOf('cold/fix',{},'electron',i)).concat([0,1].map(i=>rowOf('cold/main',{},'electron',i)));
 rows[0].calls[0].waitMs=10;rows[1].calls[0].waitMs=30;
 rows[2].calls[0].waitEvidence='missing';rows[2].calls[0].waitMs=0;
 rows[3].calls[0].waitMs=NaN;
 rows[4].calls[0].waitEvidence='main-no-gate';          // main-no-gate is meaningless for the fix side
 rows[5].calls[0].waitEvidence='main-no-gate';rows[5].calls[0].waitMs=0;
 rows[6].calls[0].waitMs=7;
 const {calls}=qualificationSummarize(rows);
 const fix=calls.find(c=>c.group==='cold'&&c.engineSide==='fix'&&c.label==='cold'),main=calls.find(c=>c.group==='cold'&&c.engineSide==='main');
 assert.deepEqual(fix.wait,{signpost:2,mainNoGate:0,missing:3});
 assert.deepEqual(fix.actualWaitMs,{p50:10,p95:30,max:30});
 assert.deepEqual(main.wait,{signpost:1,mainNoGate:1,missing:0});
 assert.deepEqual(main.actualWaitMs,{p50:7,p95:7,max:7});
});
test('a row is valid only when complete: unique expected call labels, owner, launch id and the posthold idle',()=>{
 const base=rowOf('cold/fix');
 const bad={
  notValid:{valid:false},noLaunchId:{appLaunchId:''},noOwner:{owner:undefined},wrongGroup:{group:'nope'},wrongSide:{engineSide:'main'},
  noCalls:{calls:undefined},missingCall:{calls:[base.calls[0]]},duplicateCall:{calls:[base.calls[0],base.calls[0]]},
  extraCall:{calls:[...base.calls,{...base.calls[0],label:'loaded'}]},wrongLabels:{calls:[base.calls[0],{...base.calls[1],label:'posthold'}]},
  noTimes:{calls:[{...base.calls[0],startedAt:undefined},base.calls[1]]},noReply:{calls:[{...base.calls[0],raw:{}},base.calls[1]]},noRaw:{calls:[{...base.calls[0],raw:undefined},base.calls[1]]},
 };
 for(const [name,extra] of Object.entries(bad)) {
  const {calls}=qualificationSummarize([{...base,...extra}]);
  assert.ok(calls.every(c=>c.valid===0&&c.invalid===1),name);
 }
 assert.ok(qualificationSummarize([base]).calls.every(c=>c.valid===1));
 // The posthold second call must follow at least 36 s after the first call ends.
 const ph=rowOf('posthold/fix'),idle=gap=>({...ph,calls:[{...ph.calls[0],startedAt:1000,endedAt:1010},{...ph.calls[1],startedAt:1010+gap,endedAt:1020+gap}]});
 for(const [gap,valid] of [[36001,1],[36000,1],[35999,0],[30001,0]])assert.ok(qualificationSummarize([idle(gap)]).calls.every(c=>c.valid===valid),String(gap));
});
test('a posthold launch needs a verified release, a readable-or-unreadable prior (not owned) and 36 s idle from the request end',()=>{
 const ph=rowOf('posthold/fix'),valid=extra=>qualificationSummarize([{...ph,postholdRelease:{...ph.postholdRelease,...extra}}]).calls.every(c=>c.valid===1);
 const reason=extra=>qualificationSummarize([{...ph,postholdRelease:extra===null?undefined:{...ph.postholdRelease,...extra}}]).launches[0].invalidByReason;
 // The prior may be true, false or unreadable: a clean-slate (false) prior is not required, and true-only is not assumed.
 for(const prior of ['true','false','unreadable'])assert.equal(valid({prior}),true,prior);
 assert.equal(valid({idleFromRequestEndMs:36000}),true);
 assert.equal(valid({eventsBeforeObservation:[{kind:'accessibility-support-changed'}]}),true);
 // Owned, unknown or mis-typed priors, an unverified release or too short an idle make the launch invalid.
 for(const [name,extra] of Object.entries({owned:{prior:'owned'},undefinedPrior:{prior:undefined},nullPrior:{prior:null},boolPrior:{prior:true},upper:{prior:'True'},
  unverified:{verified:false},noVerified:{verified:undefined},stringVerified:{verified:'true'},
  short:{idleFromRequestEndMs:35999},noIdle:{idleFromRequestEndMs:undefined},nanIdle:{idleFromRequestEndMs:NaN},stringIdle:{idleFromRequestEndMs:'40000'}}))
  assert.deepEqual(reason(extra),{'posthold-release':1},name);
 assert.deepEqual(reason(null),{'posthold-release':1});
 // Other groups need no release record.
 assert.ok(qualificationSummarize([rowOf('cold/fix')]).calls.every(c=>c.valid===1));
 // Coverage reports the invalid launch, and a long idle alone does not replace a verified release.
 const rows=qualificationPlan({browser:'cft',smoke:true}).map(c=>row(c,{smoke:true}));
 const rep=qualificationCoverage(rows.map(r=>r.group==='posthold'&&r.rep===0?{...r,postholdRelease:{...r.postholdRelease,verified:false}}:r),{browser:'cft',smoke:true});
 assert.deepEqual([rep.ok,rep.invalid.map(x=>x.reason)],[false,['posthold-release']]);
});
test('posthold launches summarize the release record and the raw enablement fields of each observation as reported',()=>{
 const t=(prior,write,enabled)=>({raw:{result:{timings:{...(prior===undefined?{}:{enablementPrior:prior}),...(write===undefined?{}:{enablementWrite:write}),...(enabled===undefined?{}:{enabled})}}}});
 const mk=(rep,release,observations)=>rowOf('posthold/fix',{postholdRelease:{prior:'false',verified:true,idleFromRequestEndMs:36500,eventsBeforeObservation:[],...release},observations},'electron',rep);
 const rows=[mk(0,{prior:'true',idleFromRequestEndMs:36100},[t('false','success','AXManualAccessibility'),t('owned',undefined,undefined)]),
  mk(1,{prior:'unreadable',idleFromRequestEndMs:37000},[t('false','success','AXManualAccessibility'),t('true','notImplemented','AXEnhancedUserInterface')]),
  mk(2,{prior:'false',verified:false},[t('false','success','AXManualAccessibility')])];
 const l=qualificationSummarize(rows).launches.find(x=>x.group==='posthold');
 assert.deepEqual(l.release.prior,{true:1,unreadable:1,false:1});
 assert.deepEqual(l.release.verified,{true:2,false:1});
 assert.deepEqual(l.release.idleFromRequestEndMs,{p50:36500,p95:37000,max:37000});
 const f=i=>l.observationFields.find(x=>x.index===i);
 assert.deepEqual(f(0).enablementPrior,{false:3});
 assert.deepEqual(f(0).enablementWrite,{success:3});
 assert.deepEqual(f(0).enabled,{AXManualAccessibility:3});
 // Absent fields are counted as absent, never filled in.
 assert.deepEqual(f(1).enablementPrior,{owned:1,true:1});
 assert.deepEqual(f(1).enablementWrite,{absent:1,notImplemented:1});
 assert.deepEqual(f(1).enabled,{absent:1,AXEnhancedUserInterface:1});
 assert.equal('release' in qualificationSummarize([rowOf('cold/main')]).launches[0],false);
});
test('summary: per browser, group, call label and engine side with exact accounting and tri-state effects over every attempt',()=>{
 const [r0,r1,r2,r3,r4]=[0,1,2,3,4].map(i=>rowOf('cold/fix',{},'electron',i));
 r1.calls[0].after={...owner,presses:0};r1.calls[0].endedAt=r1.calls[0].startedAt+30;                    // false success
 r2.calls[0].raw={error:{name:'refused'}};r2.calls[0].after={...owner,presses:0};                        // explicit error
 r3.calls[0].after={...owner};                                                                           // unknown oracle
 r3.calls[1].after={...owner,presses:2};                                                                 // warm: duplicate (0 -> 2)
 r4.valid=false;r4.calls=[{...r4.calls[0],sideEffects:{...quiet,raised:true,windowMoved:null}}];r4.profileCleanup={attempted:true,ok:false,error:'EBUSY'};
 const rows=[r0,r1,r2,r3,r4,rowOf('cold/main',{},'cft',0)];
 const {calls,launches}=qualificationSummarize(rows);
 const cold=calls.find(c=>c.browser==='electron'&&c.group==='cold'&&c.label==='cold'&&c.engineSide==='fix');
 assert.deepEqual([cold.attempted,cold.valid,cold.invalid],[5,4,1]);
 assert.deepEqual([cold.repliesOK,cold.errors,cold.delivered,cold.exact,cold.falseSuccess,cold.notDelivered,cold.unknown,cold.duplicates],[3,1,1,1,1,2,1,0]);
 assert.deepEqual(cold.rpcMs,{p50:10,p95:30,max:30});
 assert.deepEqual([cold.sideEffects.raised,cold.sideEffectsUnknown.windowMoved,cold.sideEffectsUnknown.ownerLost],[1,1,0]);
 const warm=calls.find(c=>c.group==='cold'&&c.engineSide==='fix'&&c.label==='warm');
 assert.deepEqual([warm.attempted,warm.valid,warm.delivered,warm.duplicates,warm.exact],[5,4,4,1,3]);
 // The invalid row's warm call is missing: its effects are unknown, never clean.
 assert.equal(warm.sideEffectsUnknown.raised,1);
 assert.equal(calls.length,3);
 const l=launches.find(x=>x.group==='cold'&&x.engineSide==='fix');
 assert.deepEqual([l.attempted,l.valid,l.invalid,l.profileCleanupFailures,l.invalidByReason],[5,4,1,1,{'not-valid':1}]);
 assert.equal(launches.find(x=>x.browser==='cft').valid,1);
});
test('posthold observation timings are reported raw beside the summary',()=>{
 const r=rowOf('posthold/fix',{observations:[{raw:{result:{timings:{prior:5,enabled:true}}}},{raw:{result:{}}},{raw:{result:{timings:{prior:40,enabled:false}}}}]});
 const {launches}=qualificationSummarize([r,rowOf('cold/main')]);
 assert.deepEqual(launches.find(l=>l.group==='posthold').observationTimings,[{id:r.id,index:0,timings:{prior:5,enabled:true}},{id:r.id,index:2,timings:{prior:40,enabled:false}}]);
 assert.equal('observationTimings' in launches.find(l=>l.group==='cold'),false);
});
test('a loaded call needs a measured positive CPU load with the expected workers in both samples',()=>{
 const loaded=extra=>{const r=rowOf('load/fix');r.calls[0]={...r.calls[0],...extra};return qualificationSummarize([r]).calls[0]};
 const ok=loaded({});
 assert.deepEqual([ok.valid,ok.invalid,ok.delivered],[1,0,1]);
 const reason=extra=>loaded(extra).invalidByReason;
 for(const [name,extra] of Object.entries({
  zero:{loadCpuPercent:0},negative:{loadCpuPercent:-5},missing:{loadCpuPercent:undefined},nan:{loadCpuPercent:NaN},nul:{loadCpuPercent:null},text:{loadCpuPercent:'190'},
  noBefore:{loadBefore:undefined},noAfter:{loadAfter:undefined},
  fewBefore:{loadBefore:{...loadSample(1),workers:[{pid:11,percent:90,cpuSeconds:1}]}},fewAfter:{loadAfter:{...loadSample(2),workers:[]}},
  noWorkers:{loadAfter:{...loadSample(2),workers:undefined}},noExpected:{loadBefore:{...loadSample(1),expected:undefined}},zeroExpected:{loadBefore:{...loadSample(1),expected:0},loadAfter:{...loadSample(2),expected:0}},
  expectedDiffers:{loadAfter:{...loadSample(2),expected:3,workers:[...loadSample(2).workers,{pid:13,percent:1,cpuSeconds:1}]}},
  noAt:{loadBefore:{...loadSample(1),at:undefined}},
 }))assert.deepEqual(reason(extra),{'load-unmeasured':1},name);
 // Unmeasured load never counts as delivery either way: the launch is invalid, not a known drop or success.
 assert.deepEqual([loaded({loadCpuPercent:0,after:{...owner,presses:0}}).valid,loaded({loadCpuPercent:0}).delivered],[0,0]);
 // Other groups carry no load requirement.
 assert.equal(qualificationSummarize([rowOf('cold/fix')]).calls.every(c=>c.valid===1&&!('loadCpuPercent' in c)),true);
 // The loaded summary reports the actual CPU load of valid launches.
 const rows=[100,150,190,300].map((p,i)=>{const r=rowOf('load/fix',{},'electron',i);r.calls[0].loadCpuPercent=p;return r});
 rows.push((()=>{const r=rowOf('load/fix',{},'electron',4);r.calls[0].loadCpuPercent=0;return r})());
 const s=qualificationSummarize(rows).calls[0];
 assert.deepEqual([s.attempted,s.valid,s.invalid],[5,4,1]);
 assert.deepEqual(s.loadCpuPercent,{p50:150,p95:300,max:300});
});
test('coverage flags missing fix wait evidence as unknown; a signpost zero is valid and main-no-gate is a known zero on main',()=>{
 const rowsFor=(smoke)=>qualificationPlan({browser:'cft',smoke}).map(c=>row(c,{smoke}));
 const ok=rowsFor(true);
 assert.equal(qualificationCoverage(ok,{browser:'cft',smoke:true}).ok,true);
 const withWait=(pick,wait)=>qualificationCoverage(ok.map(r=>pick(r)?{...r,calls:r.calls.map((c,i)=>i===0?{...c,...wait}:c)}:r),{browser:'cft',smoke:true});
 const fixRow=ok.find(r=>r.group==='cold'&&r.engineSide==='fix'),mainRow=ok.find(r=>r.group==='cold'&&r.engineSide==='main');
 const fix=r=>r===fixRow,main=r=>r===mainRow;
 assert.equal(withWait(fix,{waitEvidence:'signpost',waitMs:0}).ok,true);
 assert.equal(withWait(fix,{waitEvidence:'signpost',waitMs:0.4}).ok,true);
 for(const [name,wait] of Object.entries({missing:{waitEvidence:'missing',waitMs:0},noEvidence:{waitEvidence:undefined,waitMs:5},nan:{waitEvidence:'signpost',waitMs:NaN},
  noMs:{waitEvidence:'signpost',waitMs:undefined},noGateOnFix:{waitEvidence:'main-no-gate',waitMs:0},negative:{waitEvidence:'signpost',waitMs:-1}})) {
  const rep=withWait(fix,wait);
  assert.equal(rep.ok,false,name);assert.equal(rep.waitMissing.length,1,name);
  assert.deepEqual(rep.waitMissing[0],{id:ok.find(fix).id,labels:['cold']},name);
  assert.equal(rep.invalid.length,0,name);
 }
 assert.equal(withWait(main,{waitEvidence:'main-no-gate',waitMs:0}).ok,true);
 assert.equal(withWait(main,{waitEvidence:'main-no-gate',waitMs:undefined}).ok,true);
 assert.equal(withWait(main,{waitEvidence:'signpost',waitMs:3}).ok,true);
 assert.equal(withWait(main,{waitEvidence:'missing',waitMs:0}).ok,false);
 // Every call counts, including the second call of a two-call launch.
 const second=qualificationCoverage(ok.map(r=>fix(r)?{...r,calls:[r.calls[0],{...r.calls[1],waitEvidence:'missing'}]}:r),{browser:'cft',smoke:true});
 assert.deepEqual(second.waitMissing[0].labels,['warm']);
 // A clean coverage report has an empty list.
 assert.deepEqual(qualificationCoverage(ok,{browser:'cft',smoke:true}).waitMissing,[]);
});
test('an early call is safe only when it delivers exactly to the action or refuses elementNoLongerValid with zero effect',()=>{
 const e=(extra={},after=1)=>{const r=rowOf('early/fix');r.calls[0]={...r.calls[0],before:{...owner,presses:0},after:{...owner,presses:after},...extra};return qualificationJudgeCall(r,r.calls[0])};
 const nlv={raw:{error:{errorName:'elementNoLongerValid'}}},hit=[{target:'other-button'}];
 assert.equal(e().safeOutcome,'deliveredSameTarget');
 assert.equal(e(nlv,0).safeOutcome,'refusedNoLongerValid');
 // Any observed click on a non-action control is a wrong target, whatever else is known or unknown.
 for(const extra of [{wrongTargetHits:hit},{...nlv,wrongTargetHits:hit}])assert.equal(e(extra,extra.raw?0:1).safeOutcome,'wrongTarget');
 assert.equal(e({wrongTargetHits:hit},NaN).safeOutcome,'wrongTarget');
 // Known, but neither a same-target delivery nor a zero-effect refusal: unsafe.
 assert.equal(e({},2).safeOutcome,'unsafe');                                              // duplicate delivery
 assert.equal(e(nlv,1).safeOutcome,'unsafe');                                             // refusal that had an effect
 assert.equal(e({},0).safeOutcome,'unsafe');                                              // success reply with no effect
 assert.equal(e({raw:{error:{errorName:'backgroundClickRefused'}}},0).safeOutcome,'unsafe');
 assert.equal(e({raw:{error:{errorName:'elementNoLongerValid'}},wrongTargetHits:[]},2).safeOutcome,'unsafe');
 // Unknown stays unknown: no oracle, or no record of wrong-target hits, proves nothing.
 assert.equal(e({},NaN).safeOutcome,null);
 assert.equal(e({wrongTargetHits:undefined}).safeOutcome,null);
 assert.equal(e({wrongTargetHits:null}).safeOutcome,null);
 // Only the early label carries a safe outcome.
 const r=rowOf('cold/fix');assert.equal(qualificationJudgeCall(r,r.calls[0]).safeOutcome,undefined);
});
test('summary counts the early safe outcomes beside the oracle counts, and valueUnconfirmed explicitly',()=>{
 const mk=(rep,extra,after=1)=>{const r=rowOf('early/fix',{},'electron',rep);r.calls[0]={...r.calls[0],before:{...owner,presses:0},after:{...owner,presses:after},...extra};return r};
 const nlv={raw:{error:{errorName:'elementNoLongerValid'}}};
 const rows=[mk(0,{}),mk(1,nlv,0),mk(2,{wrongTargetHits:[{target:'x'}]}),mk(3,{},2),mk(4,{wrongTargetHits:undefined}),mk(5,{},NaN)];
 rows.push({...mk(6,{}),observations:[]});
 const early=qualificationSummarize(rows).calls.find(c=>c.label==='early');
 assert.deepEqual([early.attempted,early.valid,early.invalid,early.invalidByReason],[7,6,1,{'early-not-forced':1}]);
 assert.deepEqual(early.safeOutcome,{deliveredSameTarget:1,refusedNoLongerValid:1,wrongTarget:1,unsafe:1});
 assert.equal(early.unknown,2);
 const value=(rep,error)=>{const r=rowOf('value/fix',{},'electron',rep);if(error)r.calls[0]={...r.calls[0],raw:{error}};return r};
 const v=qualificationSummarize([value(0),value(1,{errorName:'valueUnconfirmed'}),value(2,{errorName:'valueUnconfirmed'}),value(3,{errorName:'elementNoLongerValid'}),value(4,{name:'legacy'})]).calls.find(c=>c.label==='value');
 assert.deepEqual([v.valueUnconfirmed,v.errors,v.errorNames],[2,4,{valueUnconfirmed:2,elementNoLongerValid:1,legacy:1}]);
 // Every call summary carries the count, zero when there is none; non-early summaries carry no safe outcome.
 const cold=qualificationSummarize([rowOf('cold/main')]).calls[0];
 assert.deepEqual([cold.valueUnconfirmed,'safeOutcome' in cold],[0,false]);
});
test('an early launch whose first observation was not forced to the deadline is invalid early-not-forced',()=>{
 const base=rowOf('early/fix');
 const forced=t=>[{raw:{result:{timings:t}}}];
 for(const [name,observations] of Object.entries({none:[],noTimings:[{raw:{result:{}}}],noMarker:forced({chromiumReadyWaitMs:5}),ready:forced({chromiumReady:'ready'}),waited:forced({chromiumReady:'waited'}),
  laterOnly:[{raw:{result:{timings:{}}}},...forced({chromiumReady:'deadline'})]})) {
  const {calls}=qualificationSummarize([{...base,observations}]);
  assert.deepEqual([calls[0].valid,calls[0].invalidByReason],[0,{'early-not-forced':1}],name);
 }
 const ok=qualificationSummarize([base]).calls[0];assert.equal(ok.valid,1);
 // Coverage reports it as an invalid row too; other groups need no such marker.
 const rowsFor=()=>qualificationPlan({browser:'cft',smoke:true}).map(c=>row(c,{smoke:true}));
 const rep=qualificationCoverage(rowsFor().map(r=>r.group==='early'&&r.rep===0?{...r,observations:[]}:r),{browser:'cft',smoke:true});
 assert.deepEqual([rep.ok,rep.invalid.map(x=>x.reason)],[false,['early-not-forced']]);
 assert.equal(qualificationCoverage(rowsFor(),{browser:'cft',smoke:true}).ok,true);
});
test('observation summary per browser, group, side and index reports RPC time and the actual wait beside the reported one',()=>{
 const obs=(ms,extra={},reported)=>({startedAt:1000,endedAt:1000+ms,waitMs:null,waitEvidence:'missing',raw:{result:{timings:{...(reported===undefined?{}:{chromiumReadyWaitMs:reported})}}},...extra});
 const rows=[
  rowOf('cold/fix',{observations:[obs(10,{waitMs:100,waitEvidence:'signpost'},98)]},'electron',0),
  rowOf('cold/fix',{observations:[obs(30,{waitMs:200,waitEvidence:'signpost'},190)]},'electron',1),
  rowOf('cold/fix',{observations:[obs(20,{},50)]},'electron',2),
  rowOf('cold/fix',{observations:[obs(40)]},'electron',3),
  rowOf('cold/main',{observations:[obs(5,{waitMs:0,waitEvidence:'main-no-gate'},0)]},'electron',0),
  rowOf('posthold/fix',{observations:[obs(8,{waitMs:90,waitEvidence:'signpost'},90),obs(9,{waitMs:60,waitEvidence:'signpost'})]},'electron',0),
 ];
 const {observations}=qualificationSummarize(rows);
 const fix=observations.find(o=>o.group==='cold'&&o.engineSide==='fix'&&o.index===0);
 assert.deepEqual([fix.browser,fix.attempted],['electron',4]);
 assert.deepEqual(fix.rpcMs,{p50:20,p95:40,max:40});
 assert.deepEqual(fix.actualWaitMs,{p50:100,p95:200,max:200});
 assert.deepEqual(fix.reportedWaitMs,{p50:98,p95:190,max:190});
 assert.deepEqual(fix.wait,{signpost:2,mainNoGate:0,missing:2});
 // The cross-check lists only observations that have both; nothing is inferred for the others.
 assert.deepEqual(fix.crossCheck,{both:2,maxAbsDiffMs:10});
 const main=observations.find(o=>o.group==='cold'&&o.engineSide==='main');
 assert.deepEqual([main.wait,main.actualWaitMs.max,main.crossCheck.both],[{signpost:0,mainNoGate:1,missing:0},null,0]);
 const posthold=observations.filter(o=>o.group==='posthold').sort((a,b)=>a.index-b.index);
 assert.deepEqual(posthold.map(o=>[o.index,o.attempted,o.actualWaitMs.max,o.reportedWaitMs.max,o.crossCheck.both]),[[0,1,90,90,1],[1,1,60,null,0]]);
});
test('coverage also needs a known wait for every observation, listed by id and index, never inferred from reported timings',()=>{
 const ok=qualificationPlan({browser:'cft',smoke:true}).map(c=>row(c,{smoke:true}));
 const cover=rows=>qualificationCoverage(rows,{browser:'cft',smoke:true});
 const coldFix=ok.find(r=>r.group==='cold'&&r.engineSide==='fix'),coldMain=ok.find(r=>r.group==='cold'&&r.engineSide==='main'),posthold=ok.find(r=>r.group==='posthold');
 const obs=(extra={},reported)=>({startedAt:1,endedAt:2,raw:{result:{timings:reported===undefined?{}:{chromiumReadyWaitMs:reported}}},...extra});
 const swap=(target,observations)=>cover(ok.map(r=>r===target?{...r,observations}:r));
 assert.deepEqual([cover(ok).ok,cover(ok).observationWaitMissing],[true,[]]);
 // Signpost 0 ms is a real wait; main-no-gate is valid on main only.
 assert.equal(swap(coldFix,[obs({waitMs:0,waitEvidence:'signpost'})]).ok,true);
 assert.equal(swap(coldMain,[obs({waitMs:0,waitEvidence:'main-no-gate'})]).ok,true);
 for(const [name,o] of Object.entries({missing:{waitEvidence:'missing',waitMs:null},none:{},nan:{waitEvidence:'signpost',waitMs:NaN},negative:{waitEvidence:'signpost',waitMs:-1},noGateOnFix:{waitEvidence:'main-no-gate',waitMs:0}})) {
  // A reported readiness wait never stands in for the missing signpost.
  const rep=swap(coldFix,[obs(o,2300)]);
  assert.deepEqual([rep.ok,rep.observationWaitMissing,rep.waitMissing,rep.invalid],[false,[{id:coldFix.id,indices:[0]}],[],[]],name);
 }
 assert.equal(swap(coldMain,[obs({waitEvidence:'missing'},0)]).ok,false);
 // Every observation counts: the second of a two-observation launch is listed by its index.
 const good={waitMs:90,waitEvidence:'signpost'};
 assert.deepEqual(swap(posthold,[obs(good),obs({waitEvidence:'missing'})]).observationWaitMissing,[{id:posthold.id,indices:[1]}]);
 assert.deepEqual(swap(posthold,[obs({}),obs({waitEvidence:'missing'})]).observationWaitMissing,[{id:posthold.id,indices:[0,1]}]);
 assert.equal(swap(posthold,[obs(good),obs(good)]).ok,true);
 // An already invalid launch is reported as invalid, not again as a missing wait; the call wait list is separate.
 const bad=cover(ok.map(r=>r===coldFix?{...r,valid:false,observations:[obs({})]}:r));
 assert.deepEqual([bad.observationWaitMissing,bad.invalid.length],[[],1]);
});
test('coverage needs the exact plan, fresh launch ids and complete rows, and imposes no expected delivery',()=>{
 const rowsFor=(browser,smoke)=>qualificationPlan({browser,smoke}).map(c=>row(c,{smoke}));
 const ok=rowsFor('cft',true);
 // A designed failure (main never delivers) is data, not a coverage failure.
 const undelivered=ok.map(r=>r.engineSide==='main'?{...r,calls:r.calls.map(c=>c.label==='value'?{...c,after:{...c.after,value:'',reactValue:'',events:[]}}:{...c,after:{...owner,presses:0}})}:r);
 const rep=qualificationCoverage(undelivered,{browser:'cft',smoke:true});
 assert.deepEqual([rep.ok,rep.expectedLaunches,rep.expectedCalls],[true,14,18]);
 assert.equal(qualificationCoverage(ok.slice(1),{browser:'cft',smoke:true}).missing.length,1);
 const dup=qualificationCoverage([...ok,ok[3]],{browser:'cft',smoke:true});
 assert.deepEqual(dup.duplicates,[ok[3].id]);assert.equal(dup.ok,false);
 const incomplete=qualificationCoverage(ok.map((r,i)=>i===1?{...r,calls:[]}:r),{browser:'cft',smoke:true});
 assert.deepEqual([incomplete.ok,incomplete.invalid.length],[false,1]);
 // A row claiming another cell's group or side is rejected even if self-consistent.
 const swapped=ok.find(r=>r.group==='value'&&r.engineSide==='main'),other=ok.find(r=>r.group==='value'&&r.engineSide==='fix');
 const mismatch=qualificationCoverage(ok.map(r=>r===swapped?{...r,engineSide:'fix'}:r),{browser:'cft',smoke:true});
 assert.deepEqual([mismatch.ok,mismatch.invalid[0].reason],[false,'cell-mismatch']);
 assert.ok(other);
 const reused=qualificationCoverage(ok.map((r,i)=>i===5?{...r,appLaunchId:ok[2].appLaunchId}:r),{browser:'cft',smoke:true});
 assert.deepEqual(reused.reusedLaunchIds,[{appLaunchId:ok[2].appLaunchId,ids:[ok[2].id,ok[5].id]}]);assert.equal(reused.ok,false);
 const extra=qualificationCoverage([...ok,{...ok[0],id:'zzz',appLaunchId:'Lz'}],{browser:'cft',smoke:true});
 assert.deepEqual(extra.unexpected,['zzz']);assert.equal(extra.ok,false);
 assert.equal(qualificationCoverage(ok,{browser:'cft',smoke:false}).missing.length,86);
 const full=qualificationCoverage(rowsFor('electron',false),{browser:'electron'});
 assert.deepEqual([full.expectedLaunches,full.expectedCalls,full.ok],[100,130,true]);
 const two=qualificationCoverage([...rowsFor('cft',true),...rowsFor('electron',true)],{smoke:true});
 assert.deepEqual([two.expectedLaunches,two.ok],[28,true]);
 assert.equal(qualificationCoverage([]).ok,false);
 assert.equal(qualificationCoverage([],{browser:'cft',smoke:true}).ok,false);
});
test('CLI plan, summary and coverage read directories and rows.jsonl as data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'qualification-read-'));
 try {
  const sub=join(dir,'run');mkdirSync(sub);
  const rows=qualificationPlan({browser:'cft',smoke:true}).map(c=>row(c,{smoke:true}));
  writeFileSync(join(sub,'rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const run=(...a)=>spawnSync(process.execPath,[join(here,'qualification-read.mjs'),...a],{encoding:'utf8'});
  const p=run('plan','cft','smoke');assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).length,14);
  const s=run('summary',dir);assert.equal(s.status,0);const out=JSON.parse(s.stdout);assert.deepEqual([out.calls.length,out.launches.length],[9,7]);
  const c=run('coverage',join(sub,'rows.jsonl'));assert.equal(c.status,0,c.stdout+c.stderr);assert.equal(JSON.parse(c.stdout).ok,true);
  writeFileSync(join(sub,'rows.jsonl'),rows.slice(1).map(r=>JSON.stringify(r)).join('\n')+'\n');
  assert.equal(run('coverage',dir).status,1);
  assert.notEqual(run('bogus').status,0);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
