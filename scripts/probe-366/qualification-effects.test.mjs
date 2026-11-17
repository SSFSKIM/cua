import test from 'node:test';
import assert from 'node:assert/strict';
import {withFinalEffects,requireCoverFront} from './qualification-effects.mjs';
import {recordSample} from './first-effects.mjs';

const COVER=7,TARGET=9,owner={pageId:'p',timeOrigin:1};
const frame={x:0,y:25,width:650,height:700};
const native=(extra={})=>async()=>({endedAt:5,startedAt:4,ax:{},frontmostPid:COVER,order:{targetAboveCover:false},geometry:{windowFrame:frame},...extra});
const newCall=()=>({label:'cold',samples:[],owner,beforeGeometry:{windowFrame:frame},sideEffects:{ownerLost:false}});

test('a renderer failure after a harmful native sample still records that harm and rethrows the original error',async()=>{
 const call=newCall();
 await assert.rejects(withFinalEffects(call,{owner,coverPid:COVER},async()=>{
  await recordSample(call.samples,0,{native:native({frontmostPid:TARGET,order:{targetAboveCover:true},geometry:{windowFrame:{...frame,x:50}}}),renderer:async()=>{throw Error('renderer gone')},owns:()=>true});
 }),/renderer gone/);
 assert.deepEqual([call.sideEffects.frontmostChanged,call.sideEffects.raised,call.sideEffects.windowMoved,call.sideEffects.ownerLost],[true,true,true,false]);
});
test('observations that never happened stay unknown, never a clean no-side-effect claim',async()=>{
 const early=newCall();
 await assert.rejects(withFinalEffects(early,{owner,coverPid:COVER},async()=>{throw Error('rpc failed')}),/rpc failed/);
 assert.deepEqual([early.sideEffects.frontmostChanged,early.sideEffects.raised,early.sideEffects.windowMoved,early.sideEffects.otherPointer,early.sideEffects.dialogClosed],[null,null,null,null,null]);
 // A clean native sample followed by a renderer failure: native effects are known clean, page-side ones stay unknown.
 const clean=newCall();
 await assert.rejects(withFinalEffects(clean,{owner,coverPid:COVER},async()=>{
  await recordSample(clean.samples,0,{native:native(),renderer:async()=>{throw Error('renderer gone')},owns:()=>true});
 }),/renderer gone/);
 assert.deepEqual([clean.sideEffects.frontmostChanged,clean.sideEffects.raised,clean.sideEffects.windowMoved,clean.sideEffects.dialogClosed,clean.sideEffects.otherPointer],[false,false,false,null,null]);
});
test('the cover must be frontmost before every measured RPC; a lost cover is a precondition failure and dispatches nothing',async()=>{
 for(const label of ['cold','warm','posthold','value','loaded']) {
  const ok=newCall();ok.label=label;let sent=0;
  await withFinalEffects(ok,{owner,coverPid:COVER},async()=>{requireCoverFront(ok,{frontmostPid:COVER,endedAt:9},COVER);sent++});
  assert.deepEqual([sent,ok.precondition,ok.beforeNative],[1,{ok:true},{frontmostPid:COVER,coverPid:COVER,at:9}],label);
  for(const frontmostPid of [TARGET,0,undefined,null,'7']) {
   const lost=newCall();lost.label=label;let dispatched=0;
   await assert.rejects(withFinalEffects(lost,{owner,coverPid:COVER},async()=>{requireCoverFront(lost,{frontmostPid,endedAt:9},COVER);dispatched++}),e=>e.stage==='precondition'&&/not frontmost/.test(e.message));
   // Nothing was dispatched, the native evidence stays on the call, and no handler outcome or effect is invented.
   assert.deepEqual([dispatched,lost.precondition.ok,lost.beforeNative.frontmostPid,lost.raw],[0,false,frontmostPid,undefined],String(frontmostPid));
   assert.deepEqual([lost.sideEffects.frontmostChanged,lost.sideEffects.raised,lost.sideEffects.windowMoved,lost.sideEffects.ownerLost],[null,null,null,false]);
  }
 }
});
test('a successful call is finalized too and keeps its return value',async()=>{
 const call=newCall();
 const value=await withFinalEffects(call,{owner,coverPid:COVER},async()=>{
  const s=await recordSample(call.samples,0,{native:native(),renderer:async()=>({pageId:'p',timeOrigin:1,open:true,events:[]}),owns:()=>true});
  call.after=s.effect;call.frontAfter={title:'probe366:p'};return 'done';
 });
 assert.equal(value,'done');
 assert.deepEqual([call.sideEffects.frontmostChanged,call.sideEffects.raised,call.sideEffects.windowMoved,call.sideEffects.dialogClosed,call.sideEffects.otherPointer,call.sideEffects.ownerLost],[false,false,false,false,false,false]);
});
