import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {pressReadiness,firstReadiness} from './first-readiness.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const PID=9;
const w=(at,value=true,error=0,attribute='AXManualAccessibility',pid=PID)=>({kind:'write.end',attribute,pid,at,value,error});
const bucket=(trace,pressAt)=>pressReadiness(trace,[],pressAt,PID).manualBucket;

test('the last completed Manual write at or before the press sets readiness; a rewrite resets the clock',()=>{
 const r=pressReadiness([w(1000),w(3400),w(3600)],[],3500,PID);
 assert.deepEqual([r.manual.at,r.manual.value,r.manual.error,r.manualDeltaMs,r.manualBucket],[3400,true,0,100,'lt2s']);
 // The earlier write alone would have been ge2.5s; the rewrite, not app age, decides.
 assert.equal(bucket([w(1000)],3500),'ge2.5s');
 assert.equal(bucket([w(1000),w(3400)],3500),'lt2s');
 // A write exactly at the press counts; one after it does not; other pids, attributes and record kinds are ignored.
 assert.equal(pressReadiness([w(500),w(700)],[],700,PID).manual.at,700);
 const noise=[w(900,true,0,'AXManualAccessibility',PID+1),{...w(950),kind:'write.begin'},{...w(960),kind:'read'},w(970,true,0,'AXEnhancedUserInterface')];
 assert.deepEqual([bucket(noise,1000)],['unwritten']);
 // Unordered input resolves to the latest `at`.
 assert.equal(pressReadiness([w(800),w(300)],[],1000,PID).manual.at,800);
});
test('bucket boundaries: <2000 lt2s, 2000..2499 transition, >=2500 ge2.5s',()=>{
 for(const [delta,expected] of [[0,'lt2s'],[1999,'lt2s'],[2000,'transition'],[2499,'transition'],[2500,'ge2.5s'],[60000,'ge2.5s']])
  assert.equal(bucket([w(1000)],1000+delta),expected,String(delta));
 assert.equal(pressReadiness([w(1000)],[],3750,PID).manualDeltaMs,2750);
});
test('disabled, write errors, unknown outcomes, no write and no press are separate buckets',()=>{
 assert.equal(bucket([w(1000),w(1500,false)],3000),'disabled');
 assert.equal(bucket([w(1000,true,-25205)],3000),'write-error');
 assert.equal(bucket([{...w(1000),error:undefined}],3000),'write-error');
 assert.equal(bucket([{...w(1000),error:null}],3000),'write-error');
 assert.equal(bucket([{...w(1000),value:undefined}],3000),'write-error');
 assert.equal(bucket([w(1000,false,-1)],3000),'write-error');
 assert.equal(bucket([],3000),'unwritten');
 assert.equal(bucket(undefined,3000),'unwritten');
 for(const press of [undefined,null,NaN,Infinity,'3000'])assert.equal(bucket([w(1000)],press),'no-AXPress');
 const np=pressReadiness([w(1000)],[{kind:'accessibility-support-changed',enabled:true,at:900,pid:PID}],undefined,PID);
 assert.deepEqual([np.manualDeltaMs,np.events[0].offsetMs,np.nearestBeforeEnable,np.nearestAfterEnable],[null,null,null,null]);
});
test('the last Enhanced write is raw supplemental evidence and never a Manual success',()=>{
 const r=pressReadiness([w(1000,true,0,'AXEnhancedUserInterface'),w(1200,false,0,'AXEnhancedUserInterface'),w(5000,true,0,'AXEnhancedUserInterface')],[],4000,PID);
 assert.equal(r.manualBucket,'unwritten');assert.equal(r.manual,null);
 assert.deepEqual([r.enhanced.at,r.enhanced.value,r.enhanced.error,r.enhancedDeltaMs],[1200,false,0,2800]);
 const both=pressReadiness([w(1000),w(1900,true,0,'AXEnhancedUserInterface')],[],4000,PID);
 assert.deepEqual([both.manualBucket,both.manualDeltaMs,both.enhancedDeltaMs],['ge2.5s',3000,2100]);
 assert.equal(pressReadiness([w(1000)],[],4000,PID).enhanced,null);
});
test('every actual mode-change event gets a signed offset; events after the press are negative; none is invented',()=>{
 const info=[{kind:'fixture-ready',at:500,accessibilitySupportEnabled:true},
  {kind:'accessibility-support-changed',enabled:true,at:1000,pid:PID},{kind:'accessibility-support-changed',enabled:false,at:1800,pid:PID},
  {kind:'accessibility-support-changed',enabled:true,at:2600,pid:PID},{kind:'accessibility-support-changed',enabled:true,at:1500,pid:PID+1}];
 const r=pressReadiness([w(1000)],info,2000,PID);
 assert.deepEqual(r.events.map(e=>[e.enabled,e.at,e.offsetMs]),[[true,1000,1000],[false,1800,200],[true,2600,-600]]);
 assert.deepEqual([r.nearestBeforeEnable.at,r.nearestBeforeEnable.offsetMs,r.nearestAfterEnable.at,r.nearestAfterEnable.offsetMs],[1000,1000,2600,-600]);
 assert.deepEqual([r.fixtureReady.at,r.fixtureReady.accessibilitySupportEnabled],[500,true]);
 // The initial getter is reported as such and is neither an event nor readiness.
 const quiet=pressReadiness([],[info[0]],2000,PID);
 assert.deepEqual([quiet.events,quiet.nearestBeforeEnable,quiet.nearestAfterEnable,quiet.manualBucket],[[],null,null,'unwritten']);
 assert.equal(pressReadiness([],[],2000,PID).fixtureReady,null);
});

const page=(presses=0)=>({pageId:'a'.repeat(32),timeOrigin:1,trial:'t',presses,open:true,events:[]});
const quietEffects={dialogClosed:false,frontmostChanged:false,raised:false,windowMoved:false,otherPointer:false,ownerLost:false};
let n=0;
const row=(extra={})=>{
 const age=extra.age??'immediate',observeFirst=extra.observeFirst??true;n++;
 return {id:'r'+n,phase:'first-press',operation:'press',foreground:false,browser:'electron',temperature:'cold',scene:'modal',variant:'main',age,observeFirst,rep:0,
  valid:true,appLaunchId:'L'+n,preMeasureAXPressCount:0,targetObservationCount:observeFirst?(age==='aged'?2:1):0,ageAtPressMs:age==='aged'?10500:900,actualAXPressAgeMs:age==='aged'?10400:800,
  before:page(),after:page(1),call:{startedAt:0,endedAt:10,raw:{result:{}}},sideEffects:{...quietEffects},readiness:{manualBucket:'lt2s'},secondWalkManualWrites:[],...extra};
};
test('readiness groups by browser and bucket first, then cell factors, independent of assigned age',()=>{
 const rows=[
  row({age:'immediate',actualAXPressAgeMs:100}),row({age:'aged',actualAXPressAgeMs:10000}),row({age:'aged',actualAXPressAgeMs:12000,after:page(0)}),
  row({readiness:{manualBucket:'ge2.5s'}}),row({variant:'bare'}),row({browser:'cft'}),
  row({valid:false,failureStage:'launch',readiness:undefined,after:undefined,sideEffects:{...quietEffects,raised:true}}),
 ];
 const out=firstReadiness(rows);
 const g=out.groups.find(x=>x.browser==='electron'&&x.manualBucket==='lt2s'&&x.variant==='main'&&x.observeFirst===true);
 assert.deepEqual([g.temperature,g.scene],['cold','modal']);
 assert.deepEqual([g.attempted,g.valid,g.exact,g.falseSuccess],[3,3,2,1]);
 assert.deepEqual(Object.keys(g.byAge).sort(),['aged','immediate']);
 assert.deepEqual([g.byAge.immediate.n,g.byAge.aged.n],[1,2]);
 assert.deepEqual(g.byAge.aged.actualAXPressAgeMs,{p50:10000,p95:12000,max:12000});
 // The row with no readiness has an explicit unknown bucket and its side effects still count.
 const u=out.groups.find(x=>x.manualBucket==='unknown');
 assert.deepEqual([u.attempted,u.invalid,u.sideEffects.raised],[1,1,1]);
 // Bucket rollups and exact by-cell denominators are retained.
 assert.deepEqual(out.buckets.map(b=>[b.browser,b.manualBucket,b.attempted]).sort(),[['cft','lt2s',1],['electron','ge2.5s',1],['electron','lt2s',4],['electron','unknown',1]]);
 assert.equal(out.cells.reduce((a,c)=>a+c.attempted,0),7);
 assert.ok(out.cells.every(c=>'age' in c));
});
test('second-walk Manual rewrites are counted over rows and writes',()=>{
 const aged=[row({age:'aged',secondWalkManualWrites:[w(1),w(2)]}),row({age:'aged',secondWalkManualWrites:[]}),row({age:'aged',secondWalkManualWrites:[w(3)]}),row({age:'aged',secondWalkManualWrites:undefined})];
 assert.deepEqual(firstReadiness(aged).secondWalk,{rows:3,rowsRewrote:2,writes:3,unknownRows:1});
 // Rows outside the aged observed arm take no second walk: they are neither counted nor unknown, even with writes recorded.
 const others=[row({age:'immediate',secondWalkManualWrites:undefined}),row({age:'immediate',secondWalkManualWrites:[w(9)]}),
  row({age:'aged',observeFirst:false,secondWalkManualWrites:undefined}),row({age:'aged',observeFirst:false,secondWalkManualWrites:[w(8)]})];
 assert.deepEqual(firstReadiness(others).secondWalk,{rows:0,rowsRewrote:0,writes:0,unknownRows:0});
 assert.deepEqual(firstReadiness([...aged,...others]).secondWalk,{rows:3,rowsRewrote:2,writes:3,unknownRows:1});
});
test('CLI readiness mode reads directories and rows.jsonl',()=>{
 const dir=mkdtempSync(join(tmpdir(),'first-readiness-'));
 try {
  const sub=join(dir,'run');mkdirSync(sub);
  writeFileSync(join(sub,'rows.jsonl'),[row(),row({age:'aged'})].map(r=>JSON.stringify(r)).join('\n')+'\n');
  const r=spawnSync(process.execPath,[join(here,'first-read.mjs'),'readiness',dir],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const out=JSON.parse(r.stdout);
  assert.deepEqual([out.groups.length,out.groups[0].attempted,out.secondWalk.rows],[1,2,1]);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
