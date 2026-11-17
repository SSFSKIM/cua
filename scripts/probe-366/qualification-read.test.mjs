import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {qualificationPlan,qualificationJudgeCall,qualificationSummarize,qualificationCoverage} from './qualification-read.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const BROWSERS=['electron-parity','electron','cft'];
// group/engineSide -> [launches, expected call labels]
const SPECS={'cold/main':[20,['cold']],'cold/fix':[20,['cold','warm']],'posthold/fix':[10,['cold','posthold']],'value/main':[10,['value']],'value/fix':[10,['value']],'load/fix':[20,['loaded']]};

const quiet={dialogClosed:false,frontmostChanged:false,raised:false,windowMoved:false,otherPointer:false,ownerLost:false};
const owner={pageId:'a'.repeat(32),timeOrigin:1000};
const presses=(n,m=n+1)=>[{...owner,presses:n},{...owner,presses:m,events:[]}];
// One measured call; `i` orders calls in time.
const call=(label,extra={},i=0)=>{
 const value=label==='value',[before,after]=value?[{...owner,value:'',reactValue:''},{...owner,value:'needle',reactValue:'needle',events:[{type:'search.handler',value:'needle',wallAt:10000+i*100+5}]}]:presses(0);
 return {label,method:value?'set_value':'click',startedAt:10000+i*100,endedAt:10000+i*100+10,raw:{result:{}},before,after,samples:[],waitMs:12,waitEvidence:'signpost',sideEffects:{...quiet},...(value?{expectedValue:'needle'}:{}),
  ...(label==='loaded'?{loadBefore:loadSample(1),loadAfter:loadSample(2),loadCpuPercent:190}:{}),...extra};
};
const loadSample=at=>({at,workers:[{pid:11,percent:90,cpuSeconds:at},{pid:12,percent:95,cpuSeconds:at}],expected:2,status:'ok'});
const row=(cell,extra={})=>({id:cell.id,browser:cell.browser,group:cell.group,engineSide:cell.engineSide,rep:cell.rep,appLaunchId:'L-'+cell.id,valid:true,owner,observations:[],
 calls:cell.expectedCalls.map((l,i)=>call(l,l==='posthold'?{startedAt:50000,endedAt:50010}:{},i)),profileCleanup:{attempted:true,ok:true},...extra});
const cellOf=(spec,browser='electron',rep=0)=>{const [group,engineSide]=spec.split('/');return qualificationPlan({browser}).find(c=>c.group===group&&c.engineSide===engineSide&&c.rep===rep)};
const rowOf=(spec,extra={},browser='electron',rep=0)=>row(cellOf(spec,browser,rep),extra);

test('plan: 90 launches and 120 calls per browser, 12 launches in smoke, unique ids and fresh launches',()=>{
 const all=[];
 for(const browser of BROWSERS) {
  const full=qualificationPlan({browser}),smoke=qualificationPlan({browser,smoke:true});
  assert.equal(full.length,90);assert.equal(smoke.length,12);
  assert.equal(full.reduce((n,c)=>n+c.expectedCalls.length,0),120);assert.equal(smoke.reduce((n,c)=>n+c.expectedCalls.length,0),16);
  for(const [spec,[launches,labels]] of Object.entries(SPECS)) {
   const [group,engineSide]=spec.split('/'),cells=full.filter(c=>c.group===group&&c.engineSide===engineSide);
   assert.equal(cells.length,launches,spec);
   assert.deepEqual(cells.map(c=>c.rep),Array.from({length:launches},(_,i)=>i));
   assert.ok(cells.every(c=>JSON.stringify(c.expectedCalls)===JSON.stringify(labels)&&c.browser===browser&&c.phase==='qualification'));
   assert.deepEqual(smoke.filter(c=>c.group===group&&c.engineSide===engineSide).map(c=>c.rep),[0,1]);
  }
  assert.deepEqual([...new Set(full.map(c=>c.group))].sort(),['cold','load','posthold','value']);
  assert.equal(new Set(full.map(c=>c.id)).size,90);
  assert.ok(full.every(c=>c.id===['qualification',browser,c.group,c.engineSide,c.rep].join('/')));
  assert.deepEqual(smoke.map(c=>c.id),full.filter(c=>c.rep<2).map(c=>c.id));
  // The cell order rotates, so no group or engine side always launches first.
  assert.ok(new Set(Array.from({length:10},(_,r)=>full.find(c=>c.rep===r).group+full.find(c=>c.rep===r).engineSide)).size>=4);
  all.push(...full);
 }
 assert.equal(new Set(all.map(c=>c.id)).size,270);
 assert.throws(()=>qualificationPlan({browser:'safari'}));
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
 // The posthold second call must follow a >30 s idle after the first.
 const ph=rowOf('posthold/fix'),idle=gap=>({...ph,calls:[{...ph.calls[0],startedAt:1000,endedAt:1010},{...ph.calls[1],startedAt:1010+gap,endedAt:1020+gap}]});
 for(const [gap,valid] of [[30001,1],[30000,1],[29999,0]])assert.ok(qualificationSummarize([idle(gap)]).calls.every(c=>c.valid===valid),String(gap));
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
test('coverage needs the exact plan, fresh launch ids and complete rows, and imposes no expected delivery',()=>{
 const rowsFor=(browser,smoke)=>qualificationPlan({browser,smoke}).map(c=>row(c,{smoke}));
 const ok=rowsFor('cft',true);
 // A designed failure (main never delivers) is data, not a coverage failure.
 const undelivered=ok.map(r=>r.engineSide==='main'?{...r,calls:r.calls.map(c=>c.label==='value'?{...c,after:{...c.after,value:'',reactValue:'',events:[]}}:{...c,after:{...owner,presses:0}})}:r);
 const rep=qualificationCoverage(undelivered,{browser:'cft',smoke:true});
 assert.deepEqual([rep.ok,rep.expectedLaunches,rep.expectedCalls],[true,12,16]);
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
 assert.equal(qualificationCoverage(ok,{browser:'cft',smoke:false}).missing.length,78);
 const full=qualificationCoverage(rowsFor('electron',false),{browser:'electron'});
 assert.deepEqual([full.expectedLaunches,full.expectedCalls,full.ok],[90,120,true]);
 const two=qualificationCoverage([...rowsFor('cft',true),...rowsFor('electron',true)],{smoke:true});
 assert.deepEqual([two.expectedLaunches,two.ok],[24,true]);
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
  const p=run('plan','cft','smoke');assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).length,12);
  const s=run('summary',dir);assert.equal(s.status,0);const out=JSON.parse(s.stdout);assert.deepEqual([out.calls.length,out.launches.length],[8,6]);
  const c=run('coverage',join(sub,'rows.jsonl'));assert.equal(c.status,0,c.stdout+c.stderr);assert.equal(JSON.parse(c.stdout).ok,true);
  writeFileSync(join(sub,'rows.jsonl'),rows.slice(1).map(r=>JSON.stringify(r)).join('\n')+'\n');
  assert.equal(run('coverage',dir).status,1);
  assert.notEqual(run('bogus').status,0);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
