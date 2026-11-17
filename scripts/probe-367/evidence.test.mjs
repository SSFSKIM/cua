import test from 'node:test';
import assert from 'node:assert/strict';
import {win,offscreenProof,compareReturn,raiseTarget,current,anotherSpaceProof,missingAuthorization} from './evidence.mjs';
import {createService} from '../../src/services/engine/service.mjs';
import {createSkyService} from '../../src/services/sky.mjs';
import {SkyComputerUseError} from '../../src/services/engine/protocol.mjs';
import {node,skyshot} from '../../test/native-goldens/builder.mjs';

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
