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
 const observations=[result({ready:true,proof:'real-service'}),result({value:values,commands:[]}),result({rejected:true,noCommand:true,message:'Capability is not available: missing-capability'})];
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

test('validation cells preserve the entire synthetic error message for exact differential comparison',async()=>{
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const message='[\n  {"code":"invalid_type","path":["visible"],"message":"Expected boolean, received string"}\n]';
 for(const [id,isResult]of [['capability-host/browser-browser/history',false],['capability-host/visibilitybrowsercapability/get',true]]){
  let observed;const trace=[];
  const reject=async()=>{if(isResult)trace.push({type:'browser_visibility_get'});throw new Error(message);};
  const code=scenario(id).cells.find(c=>c.label==='validation-1').code;
  await new AsyncFunction('__say','__trace','browser','cap','nodeRepl',code)(v=>{observed=v;},async()=>trace,{history:reject},{get:reject},{rpc:async()=>({})});
  assert.deepEqual(observed,{rejected:true,...(isResult?{sent:true}:{noCommand:true}),message});
 }
});
test('independent result validation requires both rejection location and a nonempty captured message',()=>{
 const s=scenario('capability-host/visibilitybrowsercapability/get');
 const base=[result({ready:true,proof:'boundary-double'}),result({value:true,commands:[{type:'browser_visibility_get',browser_id:'$browser'}]})];
 const observed={rejected:true,sent:true,message:'Expected boolean, received string'};
 assert.equal(s.assert({results:[...base,result(observed)]}).ok,true);
 for(const invalid of [{rejected:true,sent:true},{...observed,message:''},{...observed,message:42},{...observed,sent:false},{...observed,rejected:false}])assert.throws(()=>s.assert({results:[...base,result(invalid)]}));
});

// BC:5304-5343,8346-8365. These paths prove client success marshalling, not actual network export support.
test('content export supplement covers every retained GSuite format and transcript path with exact wire assertions',()=>{
 const s=scenario('capability-host/browser-contentapi/export');
 const base=[result({ready:true,proof:'boundary-double'}),result({value:'/fixture/export.pdf',commands:[{type:'tab_content_export',browser_id:'$browser',tab_id:'$tab'}]})];
 const exports=[
  ['pdf','/fixture/gsuite.pdf'],['md','/fixture/gsuite.md'],['xlsx','/fixture/gsuite.xlsx'],
  ['csv','/fixture/gsuite.csv'],['docx','/fixture/gsuite.docx'],['pptx','/fixture/gsuite.pptx'],
 ];
 const observations=exports.map(([format,value])=>({value,commands:[{type:'tab_content_export_gsuite',browser_id:'$browser',tab_id:'$tab',format}]}));
 observations.push({value:'/fixture/transcript.txt',commands:[{type:'tab_content_export_youtube_transcript',browser_id:'$browser',tab_id:'$tab'}]});
 assert.equal(s.boundaryProof,'boundary-double');
 assert.equal(s.assert({results:[...base,...observations.map(result),...recoveryObservations.map(result)]}).ok,true);
 for(let i=0;i<observations.length;i++){
  const wrongPath=structuredClone(observations);wrongPath[i].value={path:observations[i].value};
  assert.throws(()=>s.assert({results:[...base,...wrongPath.map(result),...recoveryObservations.map(result)]}));
  const wrongPayload=structuredClone(observations);wrongPayload[i].commands[0].format='wrong-format';
  assert.throws(()=>s.assert({results:[...base,...wrongPayload.map(result),...recoveryObservations.map(result)]}));
 }
});
test('export reply fixture distinguishes retained formats and returns a transcript string path',async()=>{
 const fixture=createCapabilityOracleService({handleRpc:async()=>{throw Error('unexpected real service');}});
 await rpc(fixture,'oracle.configure',{mode:'boundary-double'});
 for(const [format,path]of [['pdf','/fixture/gsuite.pdf'],['md','/fixture/gsuite.md'],['xlsx','/fixture/gsuite.xlsx'],['csv','/fixture/gsuite.csv'],['docx','/fixture/gsuite.docx'],['pptx','/fixture/gsuite.pptx']]){
  assert.deepEqual(await rpc(fixture,'execute',{type:'tab_content_export_gsuite',browser_id:'fixture',tab_id:'7',format}),{path});
 }
 assert.deepEqual(await rpc(fixture,'execute',{type:'tab_content_export_youtube_transcript',browser_id:'fixture',tab_id:'7'}),{path:'/fixture/transcript.txt'});
});

test('recovery fixture advertises v1 only in boundary mode and injects raw envelopes only into recovery execution',async()=>{
 const fixture=createCapabilityOracleService({handleRpc:async()=>({production:true})});
 for(const method of ['oracle.recovery','oracle.envelope'])await assert.rejects(rpc(fixture,method,{enabled:true,type:'tab_content_export',value:{ok:false}}),/boundary-double/);
 await rpc(fixture,'oracle.configure',{mode:'boundary-double'});
 assert.equal(Object.hasOwn(await rpc(fixture,'setup',{}),'credentialRecoveryErrorVersion'),false);
 await rpc(fixture,'oracle.recovery',{enabled:true});
 assert.equal((await rpc(fixture,'setup',{})).credentialRecoveryErrorVersion,1);
 const command={type:'tab_content_export',browser_id:'fixture',tab_id:'7'};
 for(const value of [null,{ok:'true'},{ok:false,error:{schema_version:2}},{ok:true,value:{path:17},extra:'unvalidated'}]){
  await rpc(fixture,'oracle.envelope',{type:command.type,value});
  assert.deepEqual(await rpc(fixture,'executeWithRecovery',command),value);
  assert.deepEqual(await rpc(fixture,'execute',command),{path:'/fixture/export.pdf'});
 }
 await rpc(fixture,'oracle.configure',{mode:'boundary-double'});
 assert.equal(Object.hasOwn(await rpc(fixture,'setup',{}),'credentialRecoveryErrorVersion'),false);
 assert.deepEqual(await rpc(fixture,'executeWithRecovery',command),{ok:true,value:{path:'/fixture/export.pdf'}});
 await rpc(fixture,'oracle.configure',{mode:'hidden'});
 await assert.rejects(rpc(fixture,'oracle.recovery',{enabled:true}),/boundary-double/);
 await assert.rejects(rpc(fixture,'oracle.envelope',{type:command.type,value:{ok:true}}),/boundary-double/);
});
test('content export recovery supplement distinguishes malformed envelopes from permissive successes and decoded errors',()=>{
 const s=scenario('capability-host/browser-contentapi/export');
 const before=[
  result({ready:true,proof:'boundary-double'}),result({value:'/fixture/export.pdf',commands:[{type:'tab_content_export',browser_id:'$browser',tab_id:'$tab'}]}),
  ...['pdf','md','xlsx','csv','docx','pptx'].map(format=>result({value:`/fixture/gsuite.${format}`,commands:[{type:'tab_content_export_gsuite',browser_id:'$browser',tab_id:'$tab',format}]})),
  result({value:'/fixture/transcript.txt',commands:[{type:'tab_content_export_youtube_transcript',browser_id:'$browser',tab_id:'$tab'}]}),
 ];
 assert.equal(s.assert({results:[...before,...recoveryObservations.map(result)]}).ok,true);
 for(let index=0;index<13;index++){
  const wrong=structuredClone(recoveryObservations);wrong[0][index].message='Generic parse error';
  assert.throws(()=>s.assert({results:[...before,...wrong.map(result)]}));
 }
 for(const mutate of [
  v=>{v[1].message='untrusted envelope sentence';},
  v=>{v[1].details.ignored='not stripped';},
  v=>{v[1].detailsFrozen=false;},
  v=>{v[2][1]={rejected:true,name:'Error',message:'path must be a string'};},
  v=>{v[2][3].message='Browser service returned an invalid recovery response';},
 ]){const wrong=structuredClone(recoveryObservations);mutate(wrong);assert.throws(()=>s.assert({results:[...before,...wrong.map(result)]}));}
});

// Independent expected observations from BC:134-242,10013-10046,10272-10284; not derived from the client or fixture.
const recoveryObservations=[
 Array.from({length:13},()=>({rejected:true,name:'Error',message:'Browser service returned an invalid recovery response'})),
 {rejected:true,name:'BrowserCredentialRecoveryError',message:'Browser observation is unavailable because native credential state cannot be safely resumed. Start a new browser runtime to continue. Recovery v1: command=tab_content_export, phase=before_command, reason=credential_state_unavailable, next_action=restart_browser_runtime.',details:{schema_version:1,command:'tab_content_export',phase:'before_command',reason:'credential_state_unavailable',next_action:'restart_browser_runtime'},detailsFrozen:true},
 [{rejected:false,value:'/fixture/recovered.pdf'},{rejected:false,value:17},{rejected:false,value:{kind:'undefined'}},{rejected:true,name:'Error',message:'transport send returned empty response'},{rejected:true,name:'Error',message:'transport send returned empty response'}],
];

test('real-service WebMCP registrations are witnessed in first-issued order without changing delegated replies',async()=>{
 const first={tools:[{name:'search',call_name:'search__id-a',registration_id:'id-a',input_schema:{}}]};
 const second={tools:[{name:'search',call_name:'search__id-a',registration_id:'id-a',input_schema:{}},{name:'details',call_name:'details__id-b',registration_id:'id-b',input_schema:{}}]};
 let reply=first;
 const fixture=createCapabilityOracleService({handleRpc:async()=>reply});
 const command={type:'webmcp_list_tools',browser_id:'browser-1',tab_id:'tab-1'};
 assert.equal(await rpc(fixture,'execute',command),first);
 reply=second;assert.equal(await rpc(fixture,'execute',command),second);
 assert.deepEqual(await rpc(fixture,'oracle.registrations'),[
  {browser_id:'browser-1',tab_id:'tab-1',registration_id:'id-a'},
  {browser_id:'browser-1',tab_id:'tab-1',registration_id:'id-b'},
 ]);
 const witness=await rpc(fixture,'oracle.registrations');witness[0].registration_id='tampered';
 assert.equal((await rpc(fixture,'oracle.registrations'))[0].registration_id,'id-a');
 await rpc(fixture,'oracle.configure',{mode:'real-service'});
 assert.deepEqual(await rpc(fixture,'oracle.registrations'),[]);
 reply={ok:true,value:first};assert.equal(await rpc(fixture,'executeWithRecovery',command),reply);
 assert.deepEqual(await rpc(fixture,'oracle.registrations'),[{browser_id:'browser-1',tab_id:'tab-1',registration_id:'id-a'}]);
});
test('WebMCP observation maps only an issued registration reference and preserves every other value',async()=>{
 const {normalizeIssuedWebMcpCommand}=await import('./scenarios/capability-api.mjs');
 assert.equal(typeof normalizeIssuedWebMcpCommand,'function');
 const issued=[{browser_id:'browser-1',tab_id:'tab-1',registration_id:'id-a'},{browser_id:'browser-1',tab_id:'tab-1',registration_id:'id-b'}];
 const command={type:'webmcp_invoke_tool',browser_id:'browser-1',tab_id:'tab-1',registration_id:'id-a',input:{q:'id-a'},tool_name:'search',tool_description:'id-a',extra:'id-b'};
 const before=structuredClone(command);
 assert.deepEqual(normalizeIssuedWebMcpCommand(command,issued),{...command,registration_id:'<webmcp-registration:1>'});
 assert.deepEqual(normalizeIssuedWebMcpCommand({...command,registration_id:'id-b'},issued),{...command,registration_id:'<webmcp-registration:2>'});
 assert.equal(normalizeIssuedWebMcpCommand(command,issued).registration_id,'<webmcp-registration:1>');
 assert.deepEqual(command,before);
 for(const mutation of [{registration_id:'unknown'},{tab_id:'other-tab'},{browser_id:'other-browser'}])assert.throws(()=>normalizeIssuedWebMcpCommand({...command,...mutation},issued),/unissued WebMCP registration/);
 const unrelated={...command,type:'other_command',registration_id:'unknown'};
 assert.equal(normalizeIssuedWebMcpCommand(unrelated,issued),unrelated);
});

test('WebMCP witness never treats unrelated replies, failed recovery replies, or boundary doubles as issuance',async()=>{
 const tool={name:'search',call_name:'search__id-a',registration_id:'id-a',input_schema:{}};
 let response={tools:[tool]};
 const fixture=createCapabilityOracleService({handleRpc:async()=>response});
 await rpc(fixture,'execute',{type:'other_command',browser_id:'b',tab_id:'t'});
 response={ok:false,value:{tools:[tool]},error:{}};
 await rpc(fixture,'executeWithRecovery',{type:'webmcp_list_tools',browser_id:'b',tab_id:'t'});
 assert.deepEqual(await rpc(fixture,'oracle.registrations'),[]);
 await rpc(fixture,'oracle.configure',{mode:'boundary-double'});
 await rpc(fixture,'oracle.reply',{type:'webmcp_list_tools',value:{tools:[tool]}});
 await rpc(fixture,'execute',{type:'webmcp_list_tools',browser_id:'b',tab_id:'t'});
 assert.deepEqual(await rpc(fixture,'oracle.registrations'),[]);
});
test('WebMCP call oracle requires the first issued token while keeping payload and result checks exact',()=>{
 const s=scenario('capability-host/webmcptools/call');
 const setup=result({ready:true,proof:'real-service'});
 const validation=result({rejected:true,noCommand:true,message:'WebMCP tool "missing" is not available in this snapshot. Call fetchTools() again.'});
 const observation={value:'results for lamps',commands:[{type:'webmcp_list_tools',browser_id:'$browser',tab_id:'$tab'},{type:'webmcp_invoke_tool',browser_id:'$browser',tab_id:'$tab',tool_name:'search',tool_description:'Search the catalogue',tool_title:'Search',registration_id:'<webmcp-registration:1>',input:{q:'lamps'},timeout_ms:1200}]};
 assert.equal(s.assert({results:[setup,result(observation),validation]}).ok,true);
 for(const mutate of [o=>{o.commands[1].registration_id='<webmcp-registration:2>';},o=>{o.commands[1].input.q='other';},o=>{o.value='wrong result';}]){
  const changed=structuredClone(observation);mutate(changed);
  assert.throws(()=>s.assert({results:[setup,result(changed),validation]}));
 }
});
