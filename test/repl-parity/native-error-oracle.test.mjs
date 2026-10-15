import {test} from 'node:test';import assert from 'node:assert/strict';
import services from './scenarios/services.mjs';
const scenario=services.find(s=>s.id==='cells/native-pipe/data-close-error');
const live={proof:'live-abort',events:['close'],lateEvents:[{event:'close'}],message:null};
const wire={entry:'worker-stdin',observedConnection:true,proof:'boundary-double',events:['error','close'],lateEvents:[{event:'error',message:'fixture transport error'},{event:'close'}],message:'fixture transport error'};
const result=value=>({isError:false,content:[{type:'text',text:JSON.stringify(value)}]});
test('the labelled error-wire oracle rejects a dropped or reordered error and missing late replay',()=>{
 assert.equal(scenario.assert({results:[result(live),result(wire)],timings:[0,0]}).ok,true);
 for(const mutate of [v=>v.events.shift(),v=>v.events.reverse(),v=>v.lateEvents.shift(),v=>v.lateEvents[0].message='lost']){
  const bad=structuredClone(wire);mutate(bad);assert.throws(()=>scenario.assert({results:[result(live),result(bad)],timings:[0,0]}));
 }
});

test('worker stdin injection is refused outside the isolated trusted fixture environment',async()=>{
 const {handleRpc}=await import('./fixtures/trusted-service.mjs');
 const previous=Object.getOwnPropertyDescriptor(globalThis,'nodeRepl');
 Object.defineProperty(globalThis,'nodeRepl',{configurable:true,value:{env:Object.freeze({})}});
 try{await assert.rejects(handleRpc({op:'pipe',mode:'wire-error'}),/harness-only/);}finally{if(previous)Object.defineProperty(globalThis,'nodeRepl',previous);else delete globalThis.nodeRepl;}
});

test('Linux pending connect must expire at its configured budget with the vendor sentence',()=>{
 const timeout=services.find(s=>s.id==='cells/native-pipe/connect-timeout');
 const run=value=>timeout.assert({results:[result({value:'warm'}),{...result(value),_meta:{'codex/nodeReplExecutionDurationMs':1100}}],timings:[0,1100]});
 const valid={refused:true,budget:1000,observation:'timer-expired',platform:'linux',message:'native pipe initial connect timed out',elapsedMatches:true};
 assert.equal(run(valid).ok,true);
 for(const patch of [{elapsedMatches:false},{message:'other timeout'},{budget:10},{observation:'saturated-peer-refused'}])assert.throws(()=>run({...valid,...patch}));
});
