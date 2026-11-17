import test from 'node:test';
import assert from 'node:assert/strict';
import {recordSample,deriveEffects} from './first-effects.mjs';
import {firstJudge,firstSummarize} from './first-read.mjs';

const COVER=7,TARGET=9;
const frame={x:0,y:25,width:650,height:700};
const sample=(extra={})=>({frontmostPid:COVER,order:{targetAboveCover:false},...extra});
const row=(extra={})=>({call:{startedAt:100,endedAt:110},owner:{pageId:'p'},frontAfter:{title:'probe366:p'},after:{open:true,events:[]},
 beforeGeometry:{windowFrame:frame},afterGeometry:{windowFrame:frame},samples:[sample(),sample()],trace:[],sideEffects:{ownerLost:false},...extra});
const fx=(extra,cover=COVER)=>deriveEffects(row(extra),cover);

test('a renderer failure cannot erase the native observation already taken',async()=>{
 const samples=[],native={endedAt:5,startedAt:4,ax:{marker:0,dialog:true},frontmostPid:TARGET,order:{targetAboveCover:true},geometry:{windowFrame:frame}};
 await assert.rejects(recordSample(samples,0,{native:async()=>native,renderer:async()=>{throw Error('renderer gone')},owns:()=>true}),/renderer gone/);
 assert.equal(samples.length,1);
 assert.deepEqual([samples[0].frontmostPid,samples[0].order.targetAboveCover,samples[0].geometry.windowFrame],[TARGET,true,frame]);
 assert.equal(samples[0].effect,undefined);
 // An owner mismatch also keeps the native sample, without attaching foreign renderer state.
 await assert.rejects(recordSample(samples,50,{native:async()=>native,renderer:async()=>({pageId:'other'}),owns:()=>false}),/another fixture owner/);
 assert.equal(samples.length,2);assert.equal(samples[1].effect,undefined);
 // The harm survives into the derived effects of that failed row.
 const e=deriveEffects(row({samples,after:undefined}),COVER);
 assert.deepEqual([e.frontmostChanged,e.raised],[true,true]);
 // The happy path attaches the renderer evidence to the same sample.
 const s=await recordSample([],0,{native:async()=>native,renderer:async()=>({presses:1}),owns:()=>true});
 assert.equal(s.effect.presses,1);
});
test('observed and clean effects are plain booleans',()=>{
 assert.deepEqual(fx(),{dialogClosed:false,frontmostChanged:false,raised:false,windowMoved:false,otherPointer:false,ownerLost:false});
 const bad=fx({after:{open:false,events:[{wallAt:105,type:'pointerdown',target:'outside'}]},samples:[sample({frontmostPid:TARGET,order:{targetAboveCover:true}})],
  afterGeometry:{windowFrame:{...frame,x:40}}});
 assert.deepEqual(bad,{dialogClosed:true,frontmostChanged:true,raised:true,windowMoved:true,otherPointer:true,ownerLost:false});
 assert.equal(fx({trace:[{kind:'perform.begin',action:'AXRaise'}]}).raised,true);
});
test('missing observations stay unknown, never a clean false',()=>{
 const unknown=fx({samples:[sample({order:{targetAboveCover:null},frontmostPid:0})],beforeGeometry:{windowFrame:null},afterGeometry:undefined,after:undefined,frontAfter:undefined});
 assert.deepEqual(unknown,{dialogClosed:null,frontmostChanged:null,raised:null,windowMoved:null,otherPointer:null,ownerLost:false});
 assert.deepEqual([fx({samples:[]}).frontmostChanged,fx({samples:[]}).raised],[null,null]);
 assert.equal(fx({afterGeometry:{windowFrame:null}}).windowMoved,null);
 // A later sample's geometry stands in when the row never recorded afterGeometry.
 assert.equal(fx({afterGeometry:undefined,samples:[sample(),sample({geometry:{windowFrame:{...frame,y:90}}})]}).windowMoved,true);
 assert.equal(fx({afterGeometry:undefined,samples:[sample(),sample({geometry:{windowFrame:frame}})]}).windowMoved,false);
});
test('every sampled frame and the cached final frame count: a preserved move is never hidden by a clean cache',()=>{
 const moved={windowFrame:{...frame,x:60}},clean={windowFrame:frame};
 // Stale clean afterGeometry, then a later moved native sample whose renderer read failed (no effect attached).
 assert.equal(fx({afterGeometry:clean,samples:[sample({geometry:moved})]}).windowMoved,true);
 // Moved then returned: the transient move shows in an earlier sample although the final frame matches.
 assert.equal(fx({afterGeometry:clean,samples:[sample({geometry:moved}),sample({geometry:clean})]}).windowMoved,true);
 // A move in the cached frame alone still counts, and agreeing frames are clean.
 assert.equal(fx({afterGeometry:moved,samples:[sample({geometry:clean})]}).windowMoved,true);
 assert.equal(fx({afterGeometry:clean,samples:[sample({geometry:clean}),sample({geometry:clean})]}).windowMoved,false);
 // Positive evidence wins over an unknown frame; a clean frame beside an unknown one stays unknown.
 assert.equal(fx({afterGeometry:clean,samples:[sample({geometry:moved}),sample({geometry:{windowFrame:null}})]}).windowMoved,true);
 assert.equal(fx({afterGeometry:clean,samples:[sample({geometry:{windowFrame:null}})]}).windowMoved,null);
 assert.equal(fx({afterGeometry:{windowFrame:null},samples:[sample({geometry:clean})]}).windowMoved,null);
});
test('observed harm wins over unknown in the same effect',()=>{
 const e=fx({samples:[sample({frontmostPid:TARGET,order:{targetAboveCover:true}}),sample({frontmostPid:0,order:{targetAboveCover:null}})]});
 assert.deepEqual([e.frontmostChanged,e.raised],[true,true]);
 assert.equal(fx({after:{open:true,events:[{wallAt:105,type:'pointerdown',target:'outside'}]},frontAfter:undefined}).otherPointer,true);
});
test('marker-known delivery stays scoreable while window effects are unknown, and the summary counts unknowns separately',()=>{
 const pageState=(presses)=>({pageId:'p',timeOrigin:1,trial:'t',presses,open:true,events:[]});
 const base={phase:'first-press',browser:'electron',temperature:'cold',scene:'modal',variant:'main',age:'immediate',observeFirst:true,targetObservationCount:1,valid:true,appLaunchId:'L',preMeasureAXPressCount:0,
  before:pageState(0),after:pageState(1),call:{startedAt:0,endedAt:10,raw:{result:{}}}};
 const q={dialogClosed:false,frontmostChanged:false,raised:false,windowMoved:false,otherPointer:false,ownerLost:false};
 const rows=[
  {...base,id:'a',appLaunchId:'A',sideEffects:{...q,raised:null,windowMoved:null}},
  {...base,id:'b',appLaunchId:'B',sideEffects:{...q,raised:true,frontmostChanged:null}},
  {...base,id:'c',appLaunchId:'C',valid:false,failureStage:'readback',after:undefined,sideEffects:{...q,raised:null,ownerLost:true}},
  {...base,id:'d',appLaunchId:'D',sideEffects:undefined},
 ];
 assert.equal(firstJudge(rows[0]).exact,true);
 const s=firstSummarize(rows)[0];
 assert.deepEqual([s.exact,s.invalid],[2,2]);
 assert.deepEqual([s.sideEffects.raised,s.sideEffects.ownerLost,s.sideEffects.windowMoved],[1,1,0]);
 assert.deepEqual(s.sideEffectsUnknown,{dialogClosed:1,frontmostChanged:2,raised:3,windowMoved:2,otherPointer:1,ownerLost:1});
});
