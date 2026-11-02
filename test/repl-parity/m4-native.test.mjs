import {test} from 'node:test';
import assert from 'node:assert/strict';
import scenarios from './scenarios/index.mjs';
import {caseSchedule} from '../../scripts/repl-parity/registry.mjs';
test('every Linux native contract has an executable real native case and rejects a failed observation',()=>{
 for(const entry of caseSchedule().filter(c=>c.id.startsWith('native/'))){
  const scenario=scenarios.find(s=>s.id===entry.id);assert.ok(scenario,`missing ${entry.id}`);
  assert.equal(scenario.backend,'native');assert.deepEqual(scenario.platforms,['linux']);
  assert.throws(()=>scenario.assert({results:scenario.cells.map(()=>({isError:false,content:[{type:'text',text:'NATIVE:{"verified":false}'}]}))}));
 }
});

test('native lane refuses local or macOS execution and assigns unique owned window names',async()=>{
 const {nativeCommand}=await import('../../scripts/repl-parity/native.mjs');
 const facts={device:'cua-linux',platform:'linux',host:'vendor',engine:'vendor',checkout:'/fixture',home:'/runtime'};
 assert.throws(()=>nativeCommand({...facts,device:'local'}));assert.throws(()=>nativeCommand({...facts,platform:'darwin'}));
 const a=nativeCommand(facts),b=nativeCommand(facts);assert.notEqual(a.nativeFilename,b.nativeFilename);assert.match(a.nativeFilename,/^cua-m4-[a-f0-9-]{36}\.txt$/);assert.ok(a.args.at(-1).includes(a.nativeFilename));
});

test('a no-op native drag or scroll cannot pass by returning undefined and leaving the owned window unchanged',()=>{
 const end={isError:false,structuredContent:{status:'ended'}};
 const samples={
  'native/target-app-decorated-tab/click':['undefined',true],
  'native/target-app-decorated-tab/drag':['undefined',true],
  'native/app/scroll':['undefined',{error:'Linux scroll accepts { pixels }, not pages.'},...Array(4).fill({error:'pixels must be a positive finite number.'})],
  'native/target-app-decorated-tab/scroll':['undefined',{error:'Linux scroll accepts { pixels }, not pages.'},...Array(4).fill({error:'pixels must be a positive finite number.'})],
 };
 for(const [id,values] of Object.entries(samples))assert.throws(()=>scenarios.find(s=>s.id===id).assert({results:[{isError:false,content:[{type:'text',text:'NATIVE:'+JSON.stringify(values)}]},end]}),id);
});

// The getaxstate case runs on a minimized window (#171 M4's T4): its cell, run against a fake facade whose window is
// listed minimized, read, refused and then restored by activate_window, as cua's engine answers.
const WINDOW_ID=4194311;
function minimizedFacade({getAXState,listed=true,focusedFront=true,refusal=`Window ${WINDOW_ID} is minimized; activate it first`,activate=async()=>undefined}={},filename='owned-fixture.txt'){
 let restored=false;
 const nativeWindow={id:WINDOW_ID,app:'org.gnome.gedit',title:`${filename} - gedit`};
 const front={id:2,app:'org.gnome.gedit',title:`${filename.replace('cua-m4-','cua-m4front-')} - gedit`,focused:focusedFront};
 const cua={listWindows:async()=>[{...nativeWindow,...(listed&&!restored?{minimized:true}:{}),focused:false},front],
  computer:{activate_window:async()=>{await activate();restored=true;}}};
 const app={getAXState,getScreenshot:async()=>{if(!restored)throw Error(`Screenshot unavailable for window ${WINDOW_ID}.`);return new Uint8Array(200);},pressKey:async()=>{throw Error(refusal);}};
 return {app,cua,nativeWindow};
}
async function runMinimizedCell(scenario,facade,filename){
 let value;
 await new (Object.getPrototypeOf(async()=>{}).constructor)('app','cua','nativeWindow','nativeFilename','nativeSay',scenario.cells[0].code)(facade.app,facade.cua,facade.nativeWindow,filename,v=>{value=v;});
 return scenario.assert({results:[{isError:false,content:[{type:'text',text:'NATIVE:'+JSON.stringify(value)}]},{isError:false,structuredContent:{status:'ended'}}]});
}

test('Linux full snapshots may change between observations without becoming diffs',async()=>{
 const scenario=scenarios.find(s=>s.id==='native/target-app-decorated-tab/getaxstate');
 const filename='owned-fixture.txt',a=`Accessibility source: at_spi\n0 frame ${filename}\n\t1 text (focused, settable)\n\t2 button Save`,b=a.replace('Save','Save document');let n=0;
 assert.equal((await runMinimizedCell(scenario,minimizedFacade({getAXState:async()=>n++?b:a}),filename)).ok,true);
});

test('native snapshot assertions reject flat, ID-less, truncated and non-window trees',async()=>{
 const scenario=scenarios.find(s=>s.id==='native/target-app-decorated-tab/getaxstate'),filename='owned-fixture.txt';
 for(const body of [`0 frame ${filename}\n1 text (settable)`,`frame ${filename}\n\ttext (settable)`,`0 frame ${filename} text (settable)`,`0 text (settable) ${filename}\n\t1 frame child`,`0 frame ${filename}\n\t\t1 text (settable)`]){
  const ax='Accessibility source: at_spi\n'+body;
  await assert.rejects(runMinimizedCell(scenario,minimizedFacade({getAXState:async()=>ax}),filename),body);
 }
});

test('the minimized case fails a window left unlisted, a focus fallen elsewhere, input sent, or an activation that errs',async()=>{
 const scenario=scenarios.find(s=>s.id==='native/target-app-decorated-tab/getaxstate'),filename='owned-fixture.txt';
 const tree=async()=>`Accessibility source: at_spi\n0 frame ${filename}\n\t1 text (focused, settable)`;
 assert.equal((await runMinimizedCell(scenario,minimizedFacade({getAXState:tree}),filename)).ok,true,'the control');
 for(const [what,options] of [
  ['the vendor engine, which leaves it out of the list',{listed:false}],
  ["the person's window took the focus",{focusedFront:false}],
  ['the device refusal instead of the minimized one',{refusal:'org.gnome.gedit does not accept background input; use a dedicated desktop or activate the window first'}],
  ['the activation answered BadMatch',{activate:async()=>{throw Error('failed to focus X11 window 1: Match');}}],
 ]){
  await assert.rejects(runMinimizedCell(scenario,minimizedFacade({getAXState:tree,...options}),filename),what);
 }
});

test('the vendor formatter permits an enabled unnamed menu item with an empty text tail',async()=>{
 const {isFullNativeTree}=await import('./fixtures/native-state-oracle.mjs');
 const state='Accessibility source: at_spi\n0 frame owned-fixture.txt\n\t1 text (settable)\n\t2 ';
 assert.equal(isFullNativeTree(state,'owned-fixture.txt'),true);
});

// Linux approvals (#117 M3): the lane learns its owned window's app before it binds, accepts exactly that app's
// approval and declines everything else, so no native case can pass by accepting every approval.
test('the native lane accepts only the approval of its owned window\'s app, learnt before the bind', async () => {
 const {runNativeScenario,nativeWindowApp}=await import('../../scripts/repl-parity/native.mjs');
 const approval=app=>({method:'elicitation/create',params:{message:`Allow Computer Use to use "${app}"?`,mode:'form',requestedSchema:{type:'object',properties:{}},
  _meta:{connector_id:'computer-use',codex_approval_kind:'mcp_tool_call',tool_params:{app}}}});
 const answers=[],calls=[];let answer;
 const client={setElicitationAnswer:fn=>{answer=fn;},close:async()=>({code:0}),
  call:async(name,args)=>{
   calls.push(args?.title??name);
   if(name==='end_task')return {isError:false,structuredContent:{status:'ended'}};
   if(args.title==='Find harness-owned gedit'){answers.push(await answer(approval('org.gnome.gedit')));return {isError:false,content:[{type:'text',text:'NATIVE_WINDOW:{"app":"org.gnome.gedit"}'}]};}
   for(const app of ['org.gnome.gedit','org.gnome.Terminal','(desktop)'])answers.push([app,(await answer(approval(app))).action]);
   return {isError:false,content:[{type:'text',text:'NATIVE_READY'}]};
  }};
 const prepared={device:'cua-linux',platform:'linux',checkout:'/fixture',home:'/runtime'};
 await runNativeScenario({cells:[],assert:()=>({ok:true})},{pool:{open:async()=>client},prepared,host:'cua',engine:'vendor',emit:()=>{}});
 assert.deepEqual(calls,['Find harness-owned gedit','Bind harness-owned gedit','end_task']);
 assert.deepEqual(answers,[{action:'decline'},['org.gnome.gedit','accept'],['org.gnome.Terminal','decline'],['(desktop)','decline']],'nothing before the window is known; then its app only');
 assert.throws(()=>nativeWindowApp({isError:false,content:[{type:'text',text:'NATIVE_WINDOW:{"app":""}'}]}),/Native setup failed/);
 assert.throws(()=>nativeWindowApp({isError:true,content:[{type:'text',text:'NATIVE_WINDOW:{"app":"x"}'}]}),/Native setup failed/);
});
