import {test} from 'node:test';
import assert from 'node:assert/strict';
import {caseSchedule, validateRegistry} from '../../scripts/repl-parity/registry.mjs';
import {createCapabilityOracleService} from '../browser-parity/capability-api-fixture.mjs';
import {prepareCapabilityApiLaunch} from './serve-capability-api.mjs';
import scenarios from './scenarios/capability-api.mjs';

const rpc=(service,method,params)=>service.handleRpc({method,params});
test('capability fixture delegates real service calls without changing results or setup',async()=>{
 const calls=[];const sentinel={apiManifest:{interfaces:{}},disabledMemberIds:[]};
 const fixture=createCapabilityOracleService({handleRpc:async request=>{calls.push(request);return sentinel;}});
 assert.equal(await rpc(fixture,'setup',{}),sentinel);
 assert.equal(await rpc(fixture,'execute',{type:'browser_user_history',browser_id:'real'}),sentinel);
 assert.deepEqual(calls.map(c=>c.method),['setup','execute']);
});
test('boundary fixture rejects unknown commands and supplies typed replies without calling real service',async()=>{
 const fixture=createCapabilityOracleService({handleRpc:async()=>{throw Error('unexpected real service');}});
 await rpc(fixture,'oracle.configure',{mode:'boundary-double'});
 const setup=await rpc(fixture,'setup',{});assert.ok(setup.apiManifest.interfaces.AXAPI);
 const browser=await rpc(fixture,'execute',{type:'get_browser',id:'fixture'});
 assert.equal(browser.id,'fixture');assert.ok(browser.capabilities.tab.some(c=>c.id==='pageAssets'));
 const result=await rpc(fixture,'execute',{type:'tab_bot_detection_report',browser_id:'fixture',tab_id:'7',reason:'access_denied'});
 assert.deepEqual(result,{status:'reported',hostname:'cua-capability.example'});
 await assert.rejects(rpc(fixture,'execute',{type:'invented_command'}),/Unscripted/);
 assert.deepEqual(await rpc(fixture,'oracle.trace'),[
  {type:'get_browser',id:'fixture'},
  {type:'tab_bot_detection_report',browser_id:'fixture',tab_id:'7',reason:'access_denied'},
  {type:'invented_command'},
 ]);
});
test('hidden setup explicitly disables members and removes capabilities independently of backend defaults',async()=>{
 const fixture=createCapabilityOracleService({handleRpc:async()=>{throw Error('unexpected real service');}});
 await rpc(fixture,'oracle.configure',{mode:'hidden',disabledMemberIds:['Browser.user','Tab.ax']});
 const setup=await rpc(fixture,'setup',{});assert.deepEqual(setup.disabledMemberIds,['Browser.user','Tab.ax']);
 const browser=await rpc(fixture,'execute',{type:'get_browser',id:'fixture'});
 assert.deepEqual(browser.capabilities,{browser:[],tab:[]});
});
test('launch seam selects the actual client and preserves existing services and host identity env',()=>{
 for(const host of ['vendor','cua']){
  const prefix=host==='vendor'?'NODE_REPL':'CUA_REPL';
  const launch={command:'node',args:['serve'],env:{[`${prefix}_TRUSTED_SERVICES`]:JSON.stringify({browser:'/production/browser.mjs',sky:'/production/sky.mjs'}),[`${prefix}_TRUSTED_CODE_PATHS`]:'/production',CUA_REPL_NODE_MODULE_DIRS:'/runtime/node_modules',NODE_REPL_NODE_MODULE_DIRS:'/runtime/node_modules'}};
  const next=prepareCapabilityApiLaunch(launch,{host,vendorClient:'/vendor/browser-client.js',ownClient:'/own/browser-client.mjs'});
  assert.equal(JSON.parse(next.env[`${prefix}_TRUSTED_SERVICES`]).sky,'/production/sky.mjs');
  assert.equal(next.env.PARITY_CAPABILITY_DELEGATE,'/production/browser.mjs');
  assert.ok(next.env[`${prefix}_JS_BANNER`].includes(host==='vendor'?'/vendor/browser-client.js':'/own/browser-client.mjs'));
  assert.equal(launch.env.PARITY_CAPABILITY_DELEGATE,undefined);
 }
});
test('every gated inventory case is executable and its independent assertion rejects empty and failed output',()=>{
 const ids=caseSchedule().filter(c=>/^(hidden|capability-host)\//.test(c.id)).map(c=>c.id).sort();
 assert.deepEqual(scenarios.filter(s=>!s.id.startsWith('api/')).map(s=>s.id).sort(),ids);assert.equal(scenarios.filter(s=>s.id.startsWith('api/')).length,6);validateRegistry(scenarios);
 for(const s of scenarios){
  assert.equal(s.backend,'capability-host');
  assert.throws(()=>s.assert({results:[]}),undefined,s.id);
  assert.throws(()=>s.assert({results:s.cells.map(()=>({isError:true,content:[]}))}),undefined,s.id);
 }
});

const result=value=>({isError:false,content:[{type:'text',text:`\nCAP_ORACLE:${JSON.stringify(value)}\n`}]});
const scenario=id=>scenarios.find(s=>s.id===id);
test('AXPoint is the vendor tuple, not a CUA coordinate object; independent oracle rejects the latter',()=>{
 const s=scenario('capability-host/browser-axapi/click');
 const setup=result({ready:true,proof:'boundary-double'});
 const observation={value:{kind:'undefined'},commands:[{type:'tab_ax_action',browser_id:'$browser',tab_id:'$tab',action:{kind:'click',target:[4,5],mouse_button:'right',click_count:2}}]};
 assert.equal(s.assert({results:[setup,result(observation)]}).ok,true);
 observation.commands[0].action.target={x:4,y:5};
 assert.throws(()=>s.assert({results:[setup,result(observation)]}));
});
test('hidden member oracles detect leaks through each reflective operation and through absent ancestors',()=>{
 const absent={getUndefined:true,has:false,keys:false,descriptorUndefined:true};
 for(const [id,value]of [
  ['hidden/browser-browser/history',{direct:absent}],
  ['hidden/browser-axapi/get',{direct:absent,ancestor:absent}],
  ['hidden/managementbrowsercapability.bookmarks/method-string',{ancestor:absent,rejected:true,listed:0}],
 ]){
  const s=scenario(id);assert.equal(s.assert({results:[result(value)]}).ok,true);
  for(const field of Object.keys(absent))for(const position of ['direct','ancestor'].filter(k=>value[k])){
   const mutation=structuredClone(value);mutation[position][field]=!mutation[position][field];
   assert.throws(()=>s.assert({results:[result(mutation)]}),undefined,`${id}:${position}:${field}`);
  }
  const dropped=structuredClone(value);delete dropped[Object.keys(value)[0]];
  assert.throws(()=>s.assert({results:[result(dropped)]}));
 }
});
test('all generated cells parse without starting any host or executing the client',()=>{
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 for(const s of scenarios)for(const c of s.cells)assert.doesNotThrow(()=>new AsyncFunction(c.code),`${s.id}:${c.label}`);
});
test('real-service mode cannot inject a fake successful reply; configuring hidden does not retain old overrides',async()=>{
 const fixture=createCapabilityOracleService({handleRpc:async()=>({actual:true})});
 await assert.rejects(rpc(fixture,'oracle.reply',{type:'tab_cdp_call',value:'fake'}),/Cannot replace/);
 await rpc(fixture,'oracle.configure',{mode:'boundary-double'});
 await rpc(fixture,'oracle.reply',{type:'tab_bot_detection_report',value:{malformed:true}});
 assert.deepEqual(await rpc(fixture,'execute',{type:'tab_bot_detection_report'}),{malformed:true});
 await rpc(fixture,'oracle.configure',{mode:'hidden'});
 assert.deepEqual(await rpc(fixture,'execute',{type:'tab_bot_detection_report'}),{status:'reported',hostname:'cua-capability.example'});
});

// BC:8535-8568: capability factory replaces backend info with its local definition; BC:8579 returns that info.
// Confirmed by the first remote vendor control, tabcapabilitycollection/list, despite id-only backend announcements.
test('capability collection oracle requires local-definition descriptions, not id-only backend metadata',()=>{
 const s=scenario('capability-host/tabcapabilitycollection/list');
 const values=[{id:'cdp',descriptionType:'string'},{id:'webmcp',descriptionType:'string'},{id:'browserAuth',descriptionType:'string'}];
 const observations=[result({ready:true,proof:'real-service'}),result({value:values,commands:[]}),result({rejected:true,noCommand:true})];
 assert.equal(s.assert({results:observations}).ok,true);
 for(let i=0;i<values.length;i++){
  const mutation=structuredClone(values);mutation[i].descriptionType='undefined';
  assert.throws(()=>s.assert({results:[observations[0],result({value:mutation,commands:[]}),observations[2]]}));
 }
});

// BC:5243-5286,9244-9277,9514-9563. beforeunload has the inherited dismiss method, never confirm's accept method.
test('beforeunload boundary cases assert subtype and exact dismissal identity without claiming service exposure',()=>{
 const setup=result({ready:true,proof:'boundary-double'});
 for(const [member,value,commands]of [
  ['type',{type:'beforeunload',accept:'undefined'},[{type:'tab_get_js_dialog',browser_id:'$browser',tab_id:'$tab'}]],
  ['dismiss',{kind:'undefined'},[{type:'tab_get_js_dialog',browser_id:'$browser',tab_id:'$tab'},{type:'tab_handle_js_dialog',browser_id:'$browser',tab_id:'$tab',dialog_id:'dialog-beforeunload',action:'dismiss'}]],
 ]){
  const s=scenario(`api/browser-beforeunloaddialog/${member}`);assert.ok(s,'missing beforeunload boundary case');
  assert.equal(s.boundaryProof,'boundary-double');
  assert.equal(s.assert({results:[setup,result({value,commands})]}).ok,true);
  const changed=structuredClone({value,commands});
  if(member==='type')changed.value.type='confirm';else changed.commands[1].action='accept';
  assert.throws(()=>s.assert({results:[setup,result(changed)]}));
  if(member==='dismiss'){
   const wrongDialog=structuredClone({value,commands});wrongDialog.commands[1].dialog_id='wrong-dialog';
   assert.throws(()=>s.assert({results:[setup,result(wrongDialog)]}));
  }
 }
});
test('dialog reply fixtures pass through exactly and record the dismiss command at the client boundary',async()=>{
 const fixture=createCapabilityOracleService({handleRpc:async()=>{throw Error('unexpected real service');}});
 await rpc(fixture,'oracle.configure',{mode:'boundary-double'});
 await rpc(fixture,'oracle.reply',{type:'tab_get_js_dialog',value:{dialog:{id:'dialog-beforeunload',type:'beforeunload'}}});
 assert.deepEqual(await rpc(fixture,'execute',{type:'tab_get_js_dialog',browser_id:'fixture',tab_id:'7'}),{dialog:{id:'dialog-beforeunload',type:'beforeunload'}});
 const command={type:'tab_handle_js_dialog',browser_id:'fixture',tab_id:'7',dialog_id:'dialog-beforeunload',action:'dismiss'};
 assert.deepEqual(await rpc(fixture,'execute',command),{});
 assert.deepEqual((await rpc(fixture,'oracle.trace')).at(-1),command);
});
