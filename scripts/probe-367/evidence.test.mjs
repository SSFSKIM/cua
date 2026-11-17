import test from 'node:test';
import assert from 'node:assert/strict';
import {win,offscreenProof,compareReturn,raiseTarget,current,anotherSpaceProof,missingAuthorization} from './evidence.mjs';
import {createService} from '../../src/services/engine/service.mjs';
import {createSkyService} from '../../src/services/sky.mjs';
import {SkyComputerUseError} from '../../src/services/engine/protocol.mjs';
import {node,skyshot} from '../../test/native-goldens/builder.mjs';
import {offscreenFixture,restoreOriginalFrame,switchToSpace} from './fixtures.mjs';

const frame={x:-5000,y:200,width:900,height:500};
const screen={x:0,y:0,width:1440,height:900};
const info=(extra={})=>({pid:123,selectedWindowNumber:42,screens:[screen],windows:[{number:42,numberResult:0,frame,overlapsDisplay:false,...extra}]});
const state=(extra={})=>({ok:true,value:'Window: "W", App: Example.\n0 standard window W, Secondary Actions: Raise\n\t1 container body\n',
 raw:{app:{pid:123},window:{pid:123,frame},lineage:'fresh',revision:2,nodes:[{token:'w',role:'AXWindow',actions:['AXRaise']}]},...extra});
const jpeg=(extra={})=>({ok:true,value:{jpeg:true,bytes:40,sha256:'a'.repeat(64)},raw:{screenshot:{width:900,height:500}},...extra});

test('offscreen proof rejects unread geometry, absent displays, and contradictory overlap',()=>{
 assert.equal(offscreenProof(info()),true);
 for(const input of [info({frame:{}}),info({frame:null}),{...info(),screens:[]},info({frame:{...frame,x:NaN}}),info({overlapsDisplay:null}),info({frame:{...frame,x:100}})]){
  assert.equal(offscreenProof(input),false);
 }
});
test('the independently pinned window cannot silently become the first window',()=>{
 const other={number:9,numberResult:0,frame:{...frame,x:100},overlapsDisplay:true};
 assert.equal(win({...info(),windows:[other,...info().windows]}).number,42);
 assert.equal(win({...info(),windows:[other]}),undefined);
});
test('missing or failed return samples yield null, not equality of absent values',()=>{
 assert.deepEqual(compareReturn({ok:false},{ok:false},{ok:false},{ok:false}),{textEqual:null,jpegBytesEqual:null,byteLengthsEqual:null,dimensionsEqual:null});
 assert.equal(compareReturn(state({ok:false}),state(),jpeg(),jpeg()).textEqual,null);
 assert.equal(compareReturn(state({value:''}),state({value:''}),jpeg(),jpeg()).textEqual,null);
 assert.equal(compareReturn(state(),state(),jpeg({ok:false}),jpeg()).jpegBytesEqual,null);
 const empty=jpeg({value:{bytes:0,sha256:''},raw:{screenshot:{width:0,height:500}}});
 assert.deepEqual(compareReturn(state(),state(),empty,empty),{textEqual:true,jpegBytesEqual:null,byteLengthsEqual:null,dimensionsEqual:null});
});
test('populated return samples compare text, actual JPEG digest/length, and numeric dimensions',()=>{
 assert.deepEqual(compareReturn(state(),state(),jpeg(),jpeg()),{textEqual:true,jpegBytesEqual:true,byteLengthsEqual:true,dimensionsEqual:true});
 assert.deepEqual(compareReturn(state(),state({value:'different'}),jpeg(),jpeg({value:{jpeg:true,bytes:41,sha256:'b'.repeat(64)},raw:{screenshot:{width:800,height:500}}})),
  {textEqual:false,jpegBytesEqual:false,byteLengthsEqual:false,dimensionsEqual:false});
});
test('unknown CG visibility and conflicting active Space IDs cannot prove another Space',()=>{
 const away={...info({spaces:[2],cgWindowFound:true,cgOnscreen:false,inOnscreenList:false}),activeSpace:1,managedDisplaySpaces:[{'Current Space':{ManagedSpaceID:1},Spaces:[{ManagedSpaceID:1},{ManagedSpaceID:2}]}]};
 assert.equal(anotherSpaceProof(away),true);
 for(const input of [{...away,windows:[{...win(away),cgOnscreen:null}]},{...away,windows:[{...win(away),inOnscreenList:null}]},{...away,windows:[{...win(away),cgWindowFound:false}]},{...away,activeSpace:3}]){
  assert.equal(anotherSpaceProof(input),false);
 }
 assert.equal(current({...away,activeSpace:3}),null);
});
test('permission capability checks require explicit true but never require input monitoring',()=>{
 const granted={accessibility:true,screenRecording:true,canPostHid:true,inputMonitoring:false};
 assert.deepEqual(missingAuthorization(granted,granted),[]);
 assert.deepEqual(missingAuthorization({...granted,accessibility:false},{...granted,screenRecording:null}),['oracle.accessibility','engine.screenRecording']);
});
test('Raise requires a successful current observation of the independently selected window',()=>{
 assert.equal(raiseTarget(state(),info()).index,0);
 for(const row of [state({ok:false}),state({raw:null}),state({raw:{...state().raw,lineage:null}}),state({raw:{...state().raw,window:{pid:123,frame:{...frame,x:100}}}}),state({value:'1 container body'})]){
  assert.equal(raiseTarget(row,info()).available,false);
 }
 assert.equal(raiseTarget(state(),{...info(),pid:456}).available,false);
 assert.equal(raiseTarget(state(),info(),{...state().raw,lineage:'reset'}).available,false);
 assert.equal(raiseTarget(state(),info(),{...state().raw,nodes:[]}).available,false);
});

test('the real public facade refreshes a lineage invalidated by main capture failures before one Raise',async t=>{
 const app={bundleIdentifier:'com.apple.TextEdit',displayName:'TextEdit',appPath:'/System/Applications/TextEdit.app',pid:123};
 const visible={...frame,x:100};let lineage=0,offscreen=false,lastRaw;const actions=[];
 const nr={env:{CUA_ENGINE_SCREENSHOTS:'/unused/probe-367'},setResponseMeta:()=>{},createElicitation:async()=>({action:'accept'})};
 // Only the native boundary is controlled: its confirmed ordering resets lineage before a failed capture.
 const client={identity:{engineVersion:'0.1.0',build:'unbundled'},execute:async(method,args,options)=>{
  if(method==='resolve_app')return {result:app,engineMs:0};
  if(method==='get_app_state'){
   if(args.disableDiff)lineage++;
   if(offscreen)throw new SkyComputerUseError({code:-10005,errorName:'noCapturableWindow',reason:'No capturable window found'});
   lastRaw=skyshot([node('window-'+lineage,0,'AXWindow',{pid:123,roleDescription:'standard window',actions:['AXRaise'],frame:visible})],
    {app,window:{title:'W',pid:123,frame:visible},lineage:'L'+lineage,revision:1});
   return {result:structuredClone(lastRaw),engineMs:0};
  }
  assert.equal(method,'perform_secondary_action');
  assert.equal(options.lineage,'L'+lineage);assert.equal(args.element,'window-'+lineage);assert.equal(args.action,'Raise');
  actions.push({args,options});return {result:{},engineMs:0};
 }};
 const service=createService({nodeRepl:nr,client});
 const wrapper=createSkyService({loadVendor:async()=>service,secrets:{read:async()=>undefined},platform:'darwin',nodeRepl:nr,setResponseMeta:()=>{}});
 const previous=globalThis.nodeRepl;t.after(()=>{globalThis.nodeRepl=previous;});
 globalThis.nodeRepl={rpc:(_name,request)=>wrapper.handleRpc(request),write:async()=>{}};
 const {create_tinysky_alt}=await import('../../src/cua-api/create-tinysky-alt.mjs');
 const cua=await create_tinysky_alt({browser:false}),bound=await cua.getApp(app.bundleIdentifier);
 offscreen=true;
 await assert.rejects(()=>cua.getApp(app.bundleIdentifier),/No capturable window/);
 await assert.rejects(()=>bound.getAXState({disableDiffing:true,emit:false}),/No capturable window/);
 await assert.rejects(()=>bound.getScreenshot({emit:false}),/No capturable window/);
 offscreen=false;
 const value=await bound.getAXState({disableDiffing:true,emit:false});
 const target=raiseTarget({ok:true,value,raw:lastRaw},info({frame:visible,overlapsDisplay:true}));
 assert.equal(target.available,true);
 offscreen=true; // Independent AX setup moves the same window; no further observation invalidates its fresh lineage.
 await bound.performSecondaryAction(target.index,'Raise');
 assert.equal(actions.length,1);
});

// The boundary models the observed hosted clamp: successful AXPosition still leaves 40 points on screen.
function clampedWindow({resizeClamps=false,bottomClamps=false}={}){
 let actual={x:100,y:200,width:900,height:500};const actions=[];
 const read=()=>{
  const overlap=actual.x+actual.width>0&&actual.x<1024&&actual.y+actual.height>0&&actual.y<768;
  return {...info({frame:{...actual},overlapsDisplay:overlap,inOnscreenList:true}),screens:[{x:0,y:0,width:1024,height:768}]};
 };
 const io={read,move:(x,y)=>{actions.push(['move',x,y]);actual.x=x<0?-actual.width+40:x;actual.y=bottomClamps?Math.min(y,728):y;return {axResult:0};},
  size:(width,height)=>{actions.push(['size',width,height]);actual.width=width;actual.height=height;if(resizeClamps&&actual.x<0)actual.x=-width+40;return {axResult:0};},
  wait:accept=>{const value=read();return {ok:Boolean(accept(value)),value};}};
 return {io,actions};
}
test('clamped move is retained, then shrink at its readback origin independently establishes offscreen',async()=>{
 const {io,actions}=clampedWindow(),result=await offscreenFixture(io);
 assert.equal(result.ok,true);assert.equal(offscreenProof(result.value),true);
 assert.deepEqual(actions,[['move',-5000,200],['size',300,300]]);
 assert.deepEqual(win(result.attempts[0].readback).frame,{x:-860,y:200,width:900,height:500});
 assert.equal(result.attempts[0].setter.axResult,0);assert.equal(result.attempts[0].proof.ok,false);
 assert.deepEqual(win(result.attempts[1].readback).frame,{x:-860,y:200,width:300,height:300});
});
test('a constrained resize takes one distinct extreme-bottom route, not an identical move retry',async()=>{
 const {io,actions}=clampedWindow({resizeClamps:true}),result=await offscreenFixture(io);
 assert.equal(result.ok,true);assert.equal(offscreenProof(result.value),true);
 assert.deepEqual(actions,[['move',-5000,200],['size',300,300],['move',100,5768]]);
 assert.equal(result.attempts.length,3);
});
test('all constrained AX constructions produce a fixture blocker rather than a false offscreen success',async()=>{
 const {io,actions}=clampedWindow({resizeClamps:true,bottomClamps:true}),result=await offscreenFixture(io);
 assert.equal(result.ok,false);assert.equal(offscreenProof(result.value),false);
 assert.equal(actions.length,3);assert.match(result.reason,/overlap/i);
 assert.equal(result.attempts.length,3);
});
test('the resized offscreen fixture restores both original size and origin before a successful visible refresh',async()=>{
 const {io,actions}=clampedWindow();await offscreenFixture(io);actions.length=0;
 const restored=await restoreOriginalFrame(io,{x:100,y:200,width:900,height:500});
 assert.equal(restored.verified.ok,true);
 assert.deepEqual(actions,[['size',900,500],['move',100,200]]);
 assert.deepEqual(win(restored.verified.value).frame,{x:100,y:200,width:900,height:500});
});
function spaceSetup({finderWorks=true,selectionWorks=true}={}){
 let active=10;const actions=[];
 const read=()=>({...info({spaces:[10],cgWindowFound:true,cgOnscreen:active===10,inOnscreenList:active===10}),activeSpace:active,
  managedDisplaySpaces:[{'Current Space':{ManagedSpaceID:active},Spaces:[{ManagedSpaceID:1,type:0},{ManagedSpaceID:10,type:4}]}]});
 const io={read,wait:accept=>{const value=read();return {ok:Boolean(accept(value)),value};},
  post:command=>{actions.push(command);return {posted:command};},activateFinder:()=>{actions.push('activate-finder');if(finderWorks)active=1;return {activated:true};},
  openMissionControl:()=>{actions.push('mission-control');return {posted:'mission-control'};},selectDesktop:ordinal=>{actions.push(['select-desktop',ordinal]);if(selectionWorks)active=1;return {axPressResult:0};},
  dismissMissionControl:()=>{actions.push('escape');return {posted:'escape'};}};
 return {io,actions};
}
test('one ineffective Space shortcut falls back to Finder and independently proves the original desktop',async()=>{
 const {io,actions}=spaceSetup(),result=await switchToSpace(1,io);
 assert.equal(result.ok,true);assert.equal(current(result.value),1);assert.equal(anotherSpaceProof(result.value),true);
 assert.deepEqual(actions,['switch-left','activate-finder']);assert.equal(result.steps[0].after.ok,false);
});
test('if Finder does not switch Spaces, Mission Control selects the known original desktop exactly once',async()=>{
 const {io,actions}=spaceSetup({finderWorks:false}),result=await switchToSpace(1,io);
 assert.equal(result.ok,true);assert.equal(current(result.value),1);assert.equal(anotherSpaceProof(result.value),true);
 assert.deepEqual(actions,['switch-left','activate-finder','mission-control',['select-desktop',1],'escape']);
});
test('an unchanged fullscreen Space remains a switching blocker, not a second-Space creation failure',async()=>{
 const {io,actions}=spaceSetup({finderWorks:false,selectionWorks:false}),result=await switchToSpace(1,io);
 assert.equal(result.ok,false);assert.equal(current(result.value),10);
 assert.match(result.reason,/switch|select/i);assert.equal(actions.filter(a=>a==='switch-left').length,1);
});
