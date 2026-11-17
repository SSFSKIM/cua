import test from 'node:test';
import assert from 'node:assert/strict';
import {win,offscreenProof,compareReturn,raiseTarget,current,anotherSpaceProof,missingAuthorization,windowMatch} from './evidence.mjs';
import {createService} from '../../src/services/engine/service.mjs';
import {createSkyService} from '../../src/services/sky.mjs';
import {SkyComputerUseError} from '../../src/services/engine/protocol.mjs';
import {node,skyshot} from '../../test/native-goldens/builder.mjs';
import {offscreenFixture,restoreOriginalFrame,switchToSpace,requestOwnedBounds,returnToWindowSpace} from './fixtures.mjs';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPoller} from './electron-control.cjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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
test('unknown list membership or window ownership and conflicting active Space IDs cannot prove another Space',()=>{
 const away={...info({spaces:[2],cgWindowFound:true,cgOnscreen:false,inOnscreenList:false}),activeSpace:1,managedDisplaySpaces:[{'Current Space':{ManagedSpaceID:1},Spaces:[{ManagedSpaceID:1},{ManagedSpaceID:2}]}]};
 assert.equal(anotherSpaceProof(away),true);
 for(const input of [{...away,windows:[{...win(away),spaces:[]}]},{...away,windows:[{...win(away),inOnscreenList:null}]},{...away,windows:[{...win(away),cgWindowFound:false}]},{...away,activeSpace:3}]){
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
function spaceSetup({switches=false}={}){
 let active=10;const actions=[];
 const read=()=>({...info({spaces:[10],cgWindowFound:true,cgOnscreen:active===10,inOnscreenList:active===10}),activeSpace:active,
  managedDisplaySpaces:[{'Current Space':{ManagedSpaceID:active},Spaces:[{ManagedSpaceID:1,type:0},{ManagedSpaceID:10,type:4}]}]});
 const io={read,wait:accept=>{const value=read();return {ok:Boolean(accept(value)),value};},
  post:command=>{actions.push(command);if(switches)active=1;return {posted:command,mechanism:'osascript/System Events key code',exitCode:0};},
  activateFinder:()=>{throw Error('no further Space setup routes after the actual System Events attempt');}};
 return {io,actions};
}
test('a successful System Events process is not Space-switch proof and gets no further setup routes',async()=>{
 const {io,actions}=spaceSetup(),result=await switchToSpace(1,io);
 assert.equal(result.ok,false);assert.equal(current(result.value),10);
 assert.deepEqual(actions,['switch-left']);assert.equal(result.steps[0].posted.exitCode,0);assert.equal(result.steps[0].after.ok,false);
});
test('actual distinct active/window Space IDs prove a successful System Events switch',async()=>{
 const {io,actions}=spaceSetup({switches:true}),result=await switchToSpace(1,io);
 assert.equal(result.ok,true);assert.equal(current(result.value),1);assert.equal(anotherSpaceProof(result.value),true);
 assert.deepEqual(actions,['switch-left']);
});

test('owned Electron control executes each operation once and ACKs actual accepted bounds',t=>{
 const directory=fs.mkdtempSync(join(tmpdir(),'p367-control-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const requested={x:-5000,y:200,width:900,height:500},accepted={...requested,x:-4900},calls=[];
 const poll=createPoller({directory,getWindow:()=>({setBounds:b=>calls.push(b),getBounds:()=>accepted})});
 fs.writeFileSync(join(directory,'request.json'),JSON.stringify({id:'one',operation:'setBounds',bounds:requested}));
 poll();poll();
 assert.deepEqual(calls,[requested]);
 const ack=JSON.parse(fs.readFileSync(join(directory,'ack.json')));
 assert.equal(ack.id,'one');assert.deepEqual(ack.requested,requested);assert.deepEqual(ack.accepted,accepted);
 fs.writeFileSync(join(directory,'request.json'),JSON.stringify({id:'bad',operation:'Raise',bounds:requested}));poll();
 const refused=JSON.parse(fs.readFileSync(join(directory,'ack.json')));
 assert.equal(refused.id,'bad');assert.equal(typeof refused.error,'string');assert.equal(calls.length,1);
});
test('Electron-only setup keeps all constrained AX attempts, then uses one acknowledged owned setBounds route',async()=>{
 const {io,actions}=clampedWindow({resizeClamps:true,bottomClamps:true});let owned=false;
 const nativeRead=io.read;io.read=()=>owned?info({frame,overlapsDisplay:false}):nativeRead();
 io.wait=accept=>{const value=io.read();return {ok:Boolean(accept(value)),value};};
 io.ownedBounds=async bounds=>{actions.push(['ownedBounds',bounds]);owned=true;return {ok:true,ack:{id:'owned-one',requested:bounds,accepted:bounds}};};
 const result=await offscreenFixture(io);
 assert.equal(result.ok,true);assert.equal(offscreenProof(result.value),true);assert.equal(result.attempts.length,4);
 assert.deepEqual(actions.at(-1),['ownedBounds',{x:-5000,y:200,width:900,height:500}]);
 assert.equal(result.attempts.slice(0,3).every(a=>a.proof.ok===false),true);
});
test('a successful owned ACK without independent zero overlap cannot authorize the offscreen measurement',async()=>{
 const {io}=clampedWindow({resizeClamps:true,bottomClamps:true});let controls=0;
 io.ownedBounds=async bounds=>{controls++;return {ok:true,ack:{id:'clamped',requested:bounds,accepted:bounds}};};
 const result=await offscreenFixture(io);
 assert.equal(controls,1);assert.equal(result.ok,false);assert.equal(offscreenProof(result.value),false);
});
test('Electron restoration uses its owned bounds control, not the AX setters that clamp outside displays',async()=>{
 const {io,actions}=clampedWindow();const original={x:100,y:200,width:900,height:500};
 io.ownedBounds=async bounds=>{actions.push(['ownedBounds',bounds]);return {ok:true,ack:{id:'restore',requested:bounds,accepted:bounds}};};
 const result=await restoreOriginalFrame(io,original);
 assert.equal(result.verified.ok,true);assert.deepEqual(actions,[['ownedBounds',original]]);
});
test('the real command-file client rejects a stale operation ACK before accepting the owned process response',async t=>{
 const directory=fs.mkdtempSync(join(tmpdir(),'p367-client-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const bounds={x:-5000,y:200,width:900,height:500},calls=[];
 const poll=createPoller({directory,getWindow:()=>({setBounds:b=>calls.push(b),getBounds:()=>bounds})});
 fs.writeFileSync(join(directory,'ack.json'),JSON.stringify({id:'stale',pid:process.pid}));
 const wait=async(read,accept)=>{
  assert.equal(accept(read()),false,'a stale ACK must not satisfy this operation');poll();
  const value=read();return {ok:accept(value),value};
 };
 const result=await requestOwnedBounds({directory,bounds,id:'fresh',pid:process.pid,wait});
 assert.equal(result.ok,true);assert.equal(result.ack.id,'fresh');assert.deepEqual(calls,[bounds]);
});

function serverSnapshot(active=1){
 return {...info(),windows:[],activeSpace:active,managedDisplaySpaces:[{'Current Space':{ManagedSpaceID:active},Spaces:[{ManagedSpaceID:1,type:0},{ManagedSpaceID:10,type:4}]}],
  pinnedWindowServer:{number:42,ownerPid:123,cgWindowFound:true,spaces:[10],inOnscreenList:active===10,
   allCG:{kCGWindowIsOnscreen:true},allCGOnscreen:true,includingCG:{kCGWindowIsOnscreen:true},includingCGOnscreen:true,
   cgBounds:{x:0,y:0,width:1024,height:768},cgBoundsSource:'optionIncludingWindow'}};
}
test('positive Space membership and on-screen-only exclusion outrank a contradictory per-window CG flag',()=>{
 const away={...info({spaces:[10],cgWindowFound:true,cgOnscreen:true,inOnscreenList:false}),activeSpace:1};
 assert.equal(anotherSpaceProof(away),true);
 assert.equal(win(away).cgOnscreen,true,'the contradictory raw flag must not be normalized');
});
test('the pinned server record proves another Space with no AX window and keeps CG bounds separate',()=>{
 const away=serverSnapshot();
 assert.equal(win(away),undefined);assert.equal(anotherSpaceProof(away),true);
 assert.equal(windowMatch(state({raw:{...state().raw,window:{pid:123,frame:away.pinnedWindowServer.cgBounds}}}),away),true);
 assert.equal(offscreenProof(away),false,'CG geometry must not fabricate an AX offscreen frame');
 assert.equal(anotherSpaceProof({...away,pinnedWindowServer:{...away.pinnedWindowServer,ownerPid:456}}),false);
 assert.equal(anotherSpaceProof({...away,pinnedWindowServer:{...away.pinnedWindowServer,inOnscreenList:null}}),false);
 assert.equal(anotherSpaceProof({...away,pinnedWindowServer:{...away.pinnedWindowServer,spaces:[1]}}),false);
});
test('return-to-target switches the positively known Space before reading AX or invoking refresh/cleanup',async()=>{
 let active=1;const operations=[];
 const read=()=>active===1?serverSnapshot():{...serverSnapshot(10),windows:[{number:42,numberResult:0,frame:{x:0,y:0,width:1024,height:768},fullScreen:true,spaces:[10],inOnscreenList:true}]};
 const result=await returnToWindowSpace({read,switchTo:async target=>{operations.push(['switch',target]);active=target;return {ok:true,value:read()};},
  wait:async accept=>{operations.push('AX read');const value=read();return {ok:accept(value),value};}});
 assert.equal(result.ok,true);assert.equal(result.targetSpaceId,10);
 operations.push('public refresh','AXFullScreen false');
 assert.deepEqual(operations,[['switch',10],'AX read','public refresh','AXFullScreen false']);
});

test('the actual summary reader preserves unknown memberships instead of reporting a change or a failed join',t=>{
 const directory=fs.mkdtempSync(join(tmpdir(),'p367-summary-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const input=join(directory,'input'),output=join(directory,'output'),known=serverSnapshot();
 const unknown={...known,pinnedWindowServer:{...known.pinnedWindowServer,spaces:null}};
 const joined={...known,pinnedWindowServer:{...known.pinnedWindowServer,spaces:[1],inOnscreenList:true}};
 const row=(scene,before,after)=>({scene,anotherRaise:{ok:true,available:true,attempted:true},anotherRaiseBefore:before,anotherRaiseAfter:after});
 for(const [head,rows] of [['main',[row('textedit',known,unknown),row('electron',unknown,known)]],['fix',[row('textedit',known,joined),row('electron',known,known)]]]){
  fs.mkdirSync(join(input,head),{recursive:true});fs.writeFileSync(join(input,head,'results.json'),JSON.stringify(rows));
 }
 execFileSync(process.execPath,[fileURLToPath(new URL('./summarize.mjs',import.meta.url)),input,output,'test-run'],{stdio:'ignore'});
 const summary=JSON.parse(fs.readFileSync(join(output,'summary.json'),'utf8'));
 for(const r of summary.rows.filter(r=>r.head==='main')){
  assert.equal(r.anotherSpaceRaise.windowMembershipChanged,null);
  assert.equal(r.anotherSpaceRaise.joinedOriginalCurrentSpace,null);
 }
 assert.equal(summary.rows.find(r=>r.head==='main'&&r.scene==='textedit').anotherSpaceRaise.afterWindowSpaces,null);
 const changed=summary.rows.find(r=>r.head==='fix'&&r.scene==='textedit').anotherSpaceRaise;
 assert.equal(changed.windowMembershipChanged,true);assert.equal(changed.joinedOriginalCurrentSpace,true);
 const unchanged=summary.rows.find(r=>r.head==='fix'&&r.scene==='electron').anotherSpaceRaise;
 assert.equal(unchanged.windowMembershipChanged,false);assert.equal(unchanged.joinedOriginalCurrentSpace,false);
});
