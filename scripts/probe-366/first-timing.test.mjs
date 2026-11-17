import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeTiming} from './first-timing.mjs';

const write=(at,attribute='AXManualAccessibility',extra={})=>({kind:'write.end',at,attribute,pid:9,value:true,error:0,trial:'outside-action',...extra});
const press=(at,trial)=>({kind:'perform.begin',at,action:'AXPress',pid:9,trial});
test('the real API time and outside-action last write govern both presses; a second walk rewrite resets the measured clock',()=>{
 const row={id:'t',targetPid:9,launchedAt:100,age:'aged',observeFirst:true,primer:{},prePressObservation:{startedAt:5000,endedAt:5100}};
 const trace=[write(1000),press(1200,'t/primer'),write(5050),write(5060,'AXEnhancedUserInterface'),write(5070,'AXManualAccessibility',{pid:8}),press(5200,'t'),write(5300)];
 const events=[{kind:'accessibility-support-changed',pid:9,at:5150,enabled:true}];
 finalizeTiming(row,trace,events);
 assert.deepEqual([row.actualAXPressAt,row.actualAXPressAgeMs,row.readiness.manualDeltaMs,row.readiness.manualBucket],[5200,5100,150,'lt2s']);
 assert.deepEqual([row.primer.actualAXPressAt,row.primer.actualAXPressAgeMs,row.primer.readiness.manualDeltaMs],[1200,1100,200]);
 assert.equal(row.readiness.nearestBeforeEnable.offsetMs,50);
 assert.equal(row.primer.readiness.nearestAfterEnable.offsetMs,-3950);
 assert.deepEqual(row.secondWalkManualWrites,[trace[2]]);
 assert.equal(row.nativeTrace.length,7);assert.equal(row.enablementTrace.length,4);
 assert.equal(row.trace.length,1);assert.equal(row.priorTrace.length,1);
});
test('a missing press stays unscored as a press and an uncompleted second walk is unknown, not clean',()=>{
 const row={id:'t',targetPid:9,launchedAt:0,age:'aged',observeFirst:true};
 finalizeTiming(row,[write(1000)],[]);
 assert.equal(row.actualAXPressAt,null);assert.equal(row.actualAXPressAgeMs,null);
 assert.equal(row.readiness.manualBucket,'no-AXPress');assert.equal(row.secondWalkManualWrites,null);
});
