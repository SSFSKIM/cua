import {test} from 'node:test';import assert from 'node:assert/strict';
import services from './scenarios/services.mjs';
const scenario=services.find(s=>s.id==='cells/native-pipe/data-close-error');
const live={proof:'live-abort',events:['close'],lateEvents:[{event:'close'}],message:null};
const wire={entry:'worker-stdin',observedConnection:true,proof:'boundary-double',events:['error','close'],lateEvents:[{event:'error',message:'fixture transport error'},{event:'close'}],message:'fixture transport error'};
const result=value=>({isError:false,content:[{type:'text',text:JSON.stringify(value)}]});
const longValue=platform=>platform==='darwin'?{bytes:[65,13,10,128,255,0],message:null,pathBytes:192,platform,status:'connected',sunPathBytes:104}:{bytes:[],message:'failed to connect native pipe: path must be shorter than SUN_LEN',pathBytes:192,platform,status:'refused',sunPathBytes:108};
test('over-limit native pipe preserves the platform outcome, exact bytes and exact refusal sentence',()=>{
 const s=services.find(s=>s.id==='cells/native-pipe/absolute-path');assert.ok(s.cells.some(c=>c.label==='connect-over-limit'));
 const text=text=>({isError:false,content:[{type:'text',text}]});
 for(const platform of ['darwin','linux']){
  const run=last=>s.assert({results:[text('true'),text('native pipe path unavailable: No such file or directory (os error 2)'),last],timings:[0,0,0],platform});
  const valid=longValue(platform);assert.equal(run(result(valid)).ok,true);
  for(const patch of [{status:platform==='darwin'?'refused':'connected'},{status:'fixture-timeout'},{message:'failed to connect native pipe: Invalid argument (os error 22)'},{message:'invented sentence'},{bytes:platform==='darwin'?[]:[65,13,10,128,255,0]},{bytes:[0,255,128,10,13,65]},{pathBytes:80},{sunPathBytes:1},{platform:'other'}])assert.throws(()=>run(result({...valid,...patch})));
  assert.throws(()=>run({...result(valid),isError:true}));assert.throws(()=>run(text('wrong error sentence')));
 }
});
test('missing native pipe oracle rejects a successful connect and changed OS sentence on each platform',()=>{
 const s=services.find(s=>s.id==='cells/native-pipe/absolute-path');
 assert.ok(s.cells.some(c=>c.label==='stat-missing'));
 const text=text=>({isError:false,content:[{type:'text',text}]});
 for(const platform of ['darwin','linux']){
  const run=message=>s.assert({results:[text('true'),text(message),result(longValue(platform))],timings:[0,0,0],platform});
  assert.equal(run('native pipe path unavailable: No such file or directory (os error 2)').ok,true);
  for(const bad of ['CONNECTED','native pipe path unavailable: no such file or directory','failed to connect native pipe: No such file or directory (os error 2)'])assert.throws(()=>run(bad));
 }
});
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

test('Linux live non-blocking connect refuses within its configured budget with the exact vendor sentence',()=>{
 const timeout=services.find(s=>s.id==='cells/native-pipe/connect-timeout');
 const run=value=>timeout.assert({results:[result({value:'warm'}),{...result(value),_meta:{'codex/nodeReplExecutionDurationMs':1100}}],timings:[0,1100]});
 const valid={refused:true,budget:1000,observation:'saturated-peer-refused',platform:'linux',message:'failed to connect native pipe: Resource temporarily unavailable (os error 11)',boundedRefusal:true};
 assert.equal(run(valid).ok,true);
 for(const patch of [{boundedRefusal:false},{message:'other timeout'},{budget:10},{observation:'timer-expired'}])assert.throws(()=>run({...valid,...patch}));
});

test('Linux abort preserves error-before-close and late replay from the real vendor observation',()=>{
 const message='Connection reset by peer (os error 104)',linux={proof:'live-abort',events:['error','close'],lateEvents:[{event:'error',message},{event:'close'}],message};
 assert.equal(scenario.assert({results:[result(linux),result(wire)],timings:[0,0],platform:'linux'}).ok,true);
 assert.throws(()=>scenario.assert({results:[result(live),result(wire)],timings:[0,0],platform:'linux'}));
});
