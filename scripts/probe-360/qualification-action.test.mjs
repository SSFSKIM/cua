import test from 'node:test';
import assert from 'node:assert/strict';
import {observeProductionAction} from './qualification-action.mjs';

// A forced route or early disconnect would measure a different path; an unwatched disconnect would omit lease release.
test('production action sends only pid/key and keeps its hold through samples, then observes cleanup',async()=>{
 const events=[],r={};let at=100;
 const wire={async execute(method,args){events.push({method,args});at=110;return {result:{meta:{inputRoute:'3',activationGuardMs:7}}}},close(){events.push('close')}};
 await observeProductionAction({wire,row:r,pid:42,key:'alt+Left',now:()=>at,
  sample:async ended=>{events.push(['sample',ended]);at=1110;return [{delay:1000,selection:[24,0]}]},
  settle:async ms=>{events.push(['settle',ms]);at+=ms},read:async()=>{events.push('cleanup-read');return {selection:[24,0]}},cleanupMs:500});
 assert.deepEqual(events,[{method:'press_key',args:{pid:42,key:'alt+Left'}},['sample',110],'close',['settle',500],'cleanup-read']);
 assert.equal(r.action.durationMs,10);assert.equal(r.action.meta.inputRoute,'3');
 assert.equal(r.connectionClosedAt,1110);assert.equal(r.cleanupObservedAt,1610);
 assert.deepEqual(r.cleanup.selection,[24,0]);
});

test('a failed sampling phase still closes and observes release before propagating failure',async()=>{
 const events=[],r={};const error=Error('owned sample expired');
 await assert.rejects(observeProductionAction({wire:{async execute(){return {error:{code:-1,message:'refused'}}},close(){events.push('close')}},row:r,pid:42,key:'Left',
  sample:async()=>{throw error},settle:async()=>events.push('settle'),read:async()=>{events.push('cleanup-read');return {focused:true}}}),e=>e===error);
 assert.deepEqual(events,['close','settle','cleanup-read']);assert.equal(r.action.error.message,'refused');
});

test('even a transport failure releases the connection and records cleanup',async()=>{
 const events=[],r={};await assert.rejects(observeProductionAction({wire:{async execute(){throw Error('disconnected')},close(){events.push('close')}},row:r,pid:42,key:'Home',
  sample:async()=>{throw Error('must not sample')},settle:async()=>events.push('settle'),read:async()=>({focused:true})}),/disconnected/);
 assert.deepEqual(events,['close','settle']);assert.equal(r.cleanup.focused,true);assert.ok(r.connectionClosedAt>0);
});
