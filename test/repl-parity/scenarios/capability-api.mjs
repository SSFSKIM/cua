// M3 oracle for all hidden/* and capability-host/* inventory cases. Source: readable chatgpt-26.928.40906,
// cua_node/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js (BC).
// MAP.md and index/...browser-client.js.json identify the pinned 10,314-line source, not a string dump.
// Real-service cases run the selected actual client through M0's remote capability backend. Boundary doubles only
// prove client behavior where that backend cannot advertise the member; they do not implement a browser service.
import assert from 'node:assert/strict';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c]));
const scenarios=[];
const PAGE='https://cua-capability.example/shop';
const ABSENT={getUndefined:true,has:false,keys:false,descriptorUndefined:true};
const VOID={kind:'undefined'};
const browserCommand=(type,payload={})=>({type,browser_id:'$browser',...payload});
const tabCommand=(type,payload={})=>browserCommand(type,{tab_id:'$tab',...payload});
const observation=result=>{
 assert.equal(result?.isError,false,'cell failed');
 const lines=(result.content??[]).filter(c=>c.type==='text').flatMap(c=>c.text.split('\n'));
 const markers=lines.filter(line=>line.startsWith('CAP_ORACLE:'));
 assert.equal(markers.length,1,'one explicit oracle observation required');
 return JSON.parse(markers[0].slice('CAP_ORACLE:'.length));
};
const support=`
globalThis.__probe=(o,k)=>({getUndefined:o[k]===undefined,has:k in o,keys:Reflect.ownKeys(o).includes(k),descriptorUndefined:Object.getOwnPropertyDescriptor(o,k)===undefined});
globalThis.__project=v=>v===undefined?{kind:'undefined'}:v instanceof Uint8Array?{kind:'Uint8Array',bytes:Array.from(v)}:Array.isArray(v)?v.map(__project):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,__project(x)])):v;
globalThis.__say=v=>nodeRepl.write('\\nCAP_ORACLE:'+JSON.stringify(v)+'\\n');
globalThis.__boot=async(mode,disabledMemberIds=[])=>{await nodeRepl.rpc('browser',{method:'oracle.configure',params:{mode,disabledMemberIds}});globalThis.agent=await __capabilitySetup();globalThis.browser=await agent.browsers.get(mode==='real-service'?'chrome':'fixture');globalThis.tab=browser.tabs?await browser.tabs.new():undefined;if(mode==='real-service'){await browser.documentation();await tab.goto(${JSON.stringify(PAGE)});} };
globalThis.__trace=()=>nodeRepl.rpc('browser',{method:'oracle.trace'});
globalThis.__command=c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,k==='browser_id'&&v===browser.browserId?'$browser':k==='tab_id'&&v===tab.id?'$tab':k==='tab_id'&&v===globalThis.__userId?'$user':v]));
`;
const checkObservation=(actual,expected)=>typeof expected==='function'?expected(actual):assert.deepEqual(actual,expected);
function add(id,mode,body,expected,{commands,setup='',extra=[]}={}){
 const full=id.startsWith('api/')?id:`capability-host/${id}`,p=plan.get(full);if(!p)throw Error(full);
 const cells=[{label:'setup',code:support+`await __boot(${JSON.stringify(mode)});${setup};__say({ready:true,proof:${JSON.stringify(mode)}});`},
  {label:'exercise',code:`var before=(await __trace()).length;var value=await(async()=>{${body}})();__say({value:__project(value),commands:(await __trace()).slice(before).map(__command)});`},...extra.map((x,i)=>({label:`validation-${i+1}`,code:x.code}))];
 const expectedCount=cells.length;
 scenarios.push({...p,backend:'capability-host',boundaryProof:mode,limitations:mode==='boundary-double'?['Client-boundary double; does not prove retained browser-service support.']:undefined,cells,
  assert:({results})=>{assert.equal(results.length,expectedCount);assert.deepEqual(observation(results[0]),{ready:true,proof:mode});const got=observation(results[1]);if(typeof expected==='function')expected(got.value);else assert.deepEqual(got.value,expected);if(typeof commands==='function')commands(got.commands);else if(commands)assert.deepEqual(got.commands,commands);else assert.ok(got.commands.length>0,'API must execute a real command');for(let i=0;i<extra.length;i++)checkObservation(observation(results[i+2]),extra[i].expected);return {ok:true};}});
}
const validation=(code,expected)=>({code:`__say(await(async()=>{${code}})());`,expected});
// Inputs here are entirely synthetic. Keep parser/client error text verbatim in raw observations so differential
// comparison catches changed sentences; the independent oracle also requires rejection at the right boundary.
const rejection=(fields)=>actual=>{const {message,...rest}=actual;assert.deepEqual(rest,{rejected:true,...fields});assert.equal(typeof message,'string');assert.ok(message.trim().length>0,'validation error message required');};
const invalidRequest=(call)=>validation(`var before=(await __trace()).length;try{await(${call});return {rejected:false};}catch(e){return {rejected:true,noCommand:(await __trace()).length===before,message:e.message};}`,rejection({noCommand:true}));
const invalidResult=(command,call,value)=>validation(`await nodeRepl.rpc('browser',{method:'oracle.reply',params:{type:${JSON.stringify(command)},value:${JSON.stringify(value)}}});var before=(await __trace()).length;try{await(${call});return {rejected:false};}catch(e){return {rejected:true,sent:(await __trace()).length===before+1,message:e.message};}`,rejection({sent:true}));

// BC:6611-6660,9919-10012. User tabs are a seeded, synthetic unowned tab, never an owner's profile.
const userSetup=`globalThis.user=(await browser.user.openTabs()).find(t=>t.url==='https://cua-capability.example/user');if(!user)throw Error('Missing capability user fixture');globalThis.__userId=user.id;`;
for(const id of ['browser-browser/user','browser-browseruser/opentabs'])add(id,'real-service',`return (await browser.user.openTabs()).filter(t=>t.id===user.id).map(t=>({idType:typeof t.id,title:t.title,url:t.url}));`,[{idType:'string',title:'Capability user fixture',url:'https://cua-capability.example/user'}],{setup:userSetup,commands:[browserCommand('browser_user_open_tabs')]});
add('browser-browseruser/claimtab','real-service',`var claimed=await browser.user.claimTab(user);return {sameId:claimed.id===user.id,title:await claimed.title(),url:await claimed.url()};`,{sameId:true,title:'Capability user fixture',url:'https://cua-capability.example/user'},{setup:userSetup,commands:[browserCommand('browser_user_claim_tab',{tab_id:'$user'}),browserCommand('get_tab',{tab_id:'$user'}),browserCommand('get_tab',{tab_id:'$user'})],extra:[invalidRequest(`browser.user.claimTab('')`)]});
add('browser-browser/history','real-service',`return await browser.history({queries:['lamps','desks'],limit:1,from:new Date('2026-10-01T00:00:00Z'),to:'2026-10-15T00:00:00Z'});`,[{dateVisited:'2026-10-14T10:00:00.000Z',title:'History: lamps',url:'https://cua-capability.example/history/lamps'}],{commands:[browserCommand('browser_user_history',{queries:['lamps','desks'],limit:1,from:'2026-10-01T00:00:00.000Z',to:'2026-10-15T00:00:00.000Z'})],extra:[invalidRequest('browser.history({queries:[]})'),invalidRequest('browser.history({from:"invalid"})')]});
for(const [id,method,status] of [['markdeliverable','markDeliverable','deliverable'],['markhandoff','markHandoff','handoff']])add(`browser-tab/${id}`,'real-service',`return await tab.${method}();`,VOID,{commands:[tabCommand('mark_tab',{status})]});
add('browser-tab/requestmanualhandoff','boundary-double','return await tab.requestManualHandoff();',VOID,{commands:[tabCommand('tab_manual_handoff_request')]});

// BC:5108-5164,6631-6648: document context converts base64 to Uint8Array; other union branches pass parsed fields.
add('browser-browseruser/gettabcontext','boundary-double',`return await browser.user.getTabContext({id:'7'});`,{data:{kind:'Uint8Array',bytes:[1,2,3]},fileName:'fixture.pdf',kind:'document',mimeType:'application/pdf',title:'Fixture',url:PAGE},{commands:[tabCommand('browser_user_get_tab_context')],extra:[invalidRequest('browser.user.getTabContext(42)'),invalidResult('browser_user_get_tab_context',"browser.user.getTabContext('7')",{kind:'text',text:'bad',title:'Fixture',url:PAGE,truncated:'wrong'})]});
// BC:4950-4973,6555-6576: request validation really occurs; zero URLs never reaches the transport.
add('browser-tabs/content','boundary-double',`return await browser.tabs.content({urls:[${JSON.stringify(PAGE)}],contentType:'text',timeoutMs:1200});`,[{url:PAGE,title:'Fixture',content:'Fixture text'}],{commands:[browserCommand('tabs_content',{urls:[PAGE],content_type:'text',timeout_ms:1200})],extra:[invalidRequest(`browser.tabs.content({urls:[1],contentType:'text'})`),validation(`var before=(await __trace()).length;var value=await browser.tabs.content({urls:[],contentType:'html'});return {value,noCommand:(await __trace()).length===before};`,{value:[],noCommand:true})]});
add('browser-contentapi/export','boundary-double','return await tab.content.export();','/fixture/export.pdf',{commands:[tabCommand('tab_content_export')]});

// BC:8131-8350, AX variants and argument types. No blanket payload parsing is present in these methods.
const actions=[
 ['click',`tab.ax.click([4,5],{mouseButton:'right',clickCount:2})`,{kind:'click',target:[4,5],mouse_button:'right',click_count:2}],
 ['drag',`tab.ax.drag([1,2],[4,5])`,{kind:'drag',from:[1,2],to:[4,5]}],
 ['paste',`tab.ax.paste(null,'fixture',{format:'text'})`,{kind:'paste',element_index:null,text:'fixture',format:'text'}],
 ['performsecondaryaction',`tab.ax.performSecondaryAction(3,'show-menu')`,{kind:'perform_secondary_action',element_index:3,action:'show-menu'}],
 ['presskey',`tab.ax.pressKey(3,'ENTER')`,{kind:'press_key',element_index:3,key:'ENTER'}],
 ['scroll',`tab.ax.scroll([4,5],'down',2)`,{kind:'scroll',target:[4,5],direction:'down',pages:2}],
 ['selecttext',`tab.ax.selectText(3,'fixture',{prefix:'before',suffix:'after',selectionType:'cursor_after'})`,{kind:'select_text',element_index:3,text:'fixture',prefix:'before',suffix:'after',selection_type:'cursor_after'}],
 ['setvalue',`tab.ax.setValue(3,'value')`,{kind:'set_value',element_index:3,value:'value'}],
 ['typetext',`tab.ax.typeText(null,'typed')`,{kind:'type_text',element_index:null,text:'typed'}],
];
for(const [id,call,action]of actions)add(`browser-axapi/${id}`,'boundary-double',`return await ${call};`,VOID,{commands:[tabCommand('tab_ax_action',{action})]});
for(const id of ['browser-tab/ax','browser-axapi/get'])add(id,'boundary-double',`return [await tab.ax.get(),await tab.ax.get('screenshot'),await tab.ax.get('both',{disableDiffing:true})];`,['AX fixture state',{kind:'Uint8Array',bytes:[1,2,3]},{state:'AX fixture state',screenshot:{kind:'Uint8Array',bytes:[1,2,3]}}],{commands:[tabCommand('tab_ax_get_state',{content:'axState'}),tabCommand('tab_ax_get_state',{content:'screenshot'}),tabCommand('tab_ax_get_state',{content:'axStateAndScreenshot',disable_diffing:true})],extra:[invalidResult('tab_ax_get_state','tab.ax.get()',{}),validation(`await nodeRepl.rpc('browser',{method:'oracle.reply',params:{type:'tab_ax_get_state',value:{state:'AX fixture state',screenshot_unavailable:'disabled'}}});return await tab.ax.get('both');`,{state:'AX fixture state'})]});
add('browser-axapi/write','boundary-double',`return await tab.ax.write('state',{disableDiffing:false});`,VOID,{commands:[tabCommand('tab_ax_get_state',{content:'axState',disable_diffing:false})]});

// BC:8510-8579,9865-9938. Backend IDs select capabilities, but each factory overwrites incoming info with its
// local definition (8535-8568), so list() retains local descriptions even for id-only announcements. Unknown IDs reject.
for(const scope of ['browser','tab'])for(const method of ['get','list']){
 const cap=scope==='browser'?'viewport':'cdp';
 add(`${scope}capabilitycollection/${method}`,'real-service',method==='get'?`var c=await ${scope}.capabilities.get('${cap}');return {id:c.id,cached:c===await ${scope}.capabilities.get('${cap}')};`:`return (await ${scope}.capabilities.list()).map(c=>({id:c.id,descriptionType:typeof c.description}));`,method==='get'?{id:cap,cached:true}:(scope==='browser'?['viewport']:['cdp','webmcp','browserAuth']).map(id=>({id,descriptionType:'string'})),{commands:[],extra:[invalidRequest(`${scope}.capabilities.get('missing-capability')`)]});
}
const families=[['managementbrowsercapability','browser','management','boundary-double'],['visibilitybrowsercapability','browser','visibility','boundary-double'],['viewportbrowsercapability','browser','viewport','real-service'],['botdetectiontabcapability','tab','botDetection','boundary-double'],['browserauthtabcapability','tab','browserAuth','real-service'],['cdptabcapability','tab','cdp','real-service'],['pageassetstabcapability','tab','pageAssets','boundary-double'],['tabwebmcpcapability','tab','webmcp','real-service']];
for(const [family,scope,id,mode]of families)for(const method of ['id','documentation'])add(`${family}/${method}`,mode,method==='id'?`return cap.id;`:`var doc=await cap.documentation();return {type:typeof doc,hasContent:doc.length>40};`,method==='id'?id:{type:'string',hasContent:true},{setup:`globalThis.cap=await ${scope}.capabilities.get('${id}');`,commands:method==='id'?[]:[{type:'get_documentation',name:`capabilities/${scope}/${id}`}]});
const capSetup=(scope,id)=>`globalThis.cap=await ${scope}.capabilities.get('${id}');await cap.documentation();`;
for(const [method,call,command]of [['set','cap.set({width:640,height:480})',browserCommand('browser_viewport_set',{width:640,height:480})],['reset','cap.reset()',browserCommand('browser_viewport_reset')]])add(`viewportbrowsercapability/${method}`,'real-service',`return await ${call};`,VOID,{setup:capSetup('browser','viewport'),commands:[command]});
for(const [method,call,value,command]of [['get','cap.get()',true,browserCommand('browser_visibility_get')],['set','cap.set(false)',VOID,browserCommand('browser_visibility_set',{visible:false})]])add(`visibilitybrowsercapability/${method}`,'boundary-double',`return await ${call};`,value,{setup:capSetup('browser','visibility'),commands:[command],extra:[invalidResult(command.type,call,method==='get'?{visible:'wrong'}:null)]});
add('botdetectiontabcapability/report','boundary-double',`return await cap.report({reason:'access_denied',ignored:'strip-me'});`,{status:'reported',hostname:'cua-capability.example'},{setup:capSetup('tab','botDetection'),commands:[tabCommand('tab_bot_detection_report',{reason:'access_denied'})],extra:[invalidRequest(`cap.report({reason:'invalid'})`),invalidResult('tab_bot_detection_report',`cap.report({reason:'captcha_failed'})`,{status:'wrong',hostname:null})]});
// BC:8750-8994. Real local authentication handoff, no credentials or owner browser involved.
add('browserauthtabcapability/request','real-service',`return await cap.request({origin:'https://cua-capability.example',fields:[],qr_code:true});`,{status:'declined',reason:'user_took_over'},{setup:capSetup('tab','browserAuth'),commands:[tabCommand('tab_browser_auth_handoff',{origin:'https://cua-capability.example',fields:[],qr_code:true})],extra:[invalidRequest(`cap.request({origin:'https://cua-capability.example',fields:[]})`),invalidRequest(`cap.request({origin:'https://cua-capability.example',fields:[{id:'constructor',label:'Email',type:'email',required:true,selector:'#email'}]})`),invalidRequest(`cap.request({origin:'https://cua-capability.example',fields:[{id:'user',label:'Email',type:'email',required:true,selector:42}]})`)]});
// BC:8640-8758: CDP send result is unknown (no invented shape check); events are actually schema-parsed.
add('cdptabcapability/send','real-service',`var r=await cap.send('Page.getFrameTree',{}, {timeoutMs:1200});return {url:r.frameTree.frame.url,secure:r.frameTree.frame.secureContextType};`,{url:PAGE,secure:'Secure'},{setup:capSetup('tab','cdp'),commands:[tabCommand('tab_cdp_call',{method:'Page.getFrameTree',params:{},timeout_ms:1200,client_timeout_ms:1200})]});
add('cdptabcapability/readevents','real-service',`var initial=await cap.readEvents({limit:1});await cap.send('Page.reload');var r=await cap.readEvents({afterSequence:initial.cursor,methods:['Page.frameNavigated'],timeoutMs:2000});return {cursorValid:Number.isInteger(r.cursor)&&r.cursor>=0,hasMoreType:typeof r.hasMore,truncatedType:typeof r.truncated,events:r.events.map(e=>({sequenceValid:Number.isInteger(e.sequence)&&e.sequence>0,sourceObject:!!e.source&&typeof e.source==='object',method:e.method,url:e.params.frame.url}))};`,{cursorValid:true,hasMoreType:'boolean',truncatedType:'boolean',events:[{sequenceValid:true,sourceObject:true,method:'Page.frameNavigated',url:PAGE}]},{setup:capSetup('tab','cdp'),commands:commands=>{
 assert.equal(commands.length,3);assert.deepEqual(commands[0],tabCommand('tab_cdp_events',{limit:1}));assert.deepEqual(commands[1],tabCommand('tab_cdp_call',{method:'Page.reload'}));assert.ok(Number.isInteger(commands[2].after_sequence)&&commands[2].after_sequence>=0);assert.deepEqual({...commands[2],after_sequence:0},tabCommand('tab_cdp_events',{after_sequence:0,methods:['Page.frameNavigated'],timeout_ms:2000,client_timeout_ms:4000}));
}});
// BC:9144-9233. Public description is parsed, registration identity is the one documented volatile slot.
const toolsExpected=[{name:'search__<registration>',title:'Search',description:'Search the catalogue',inputSchema:{properties:{q:{type:'string'}},type:'object'},origin:'https://cua-capability.example',pageUrl:PAGE}];
const describeTools=`var text=tools.description();var list=JSON.parse(text.slice(text.indexOf('['),text.lastIndexOf(']')+1));return {frozen:Object.isFrozen(tools),prefix:text.startsWith('WebMCP tools available in this document:\\n'),suffix:text.endsWith('Call tools.call(name, input) to invoke one.'),tools:list.map(t=>({...t,name:t.name.replace(/__[0-9a-f-]{36}$/,'__<registration>')}))};`;
for(const id of ['tabwebmcpcapability/fetchtools','webmcptools/description'])add(id,'real-service',`var tools=await cap.fetchTools();${describeTools}`,{frozen:true,prefix:true,suffix:true,tools:toolsExpected},{setup:capSetup('tab','webmcp'),commands:[tabCommand('webmcp_list_tools')]});
add('webmcptools/call','real-service',`var tools=await cap.fetchTools();var text=tools.description();var name=JSON.parse(text.slice(text.indexOf('['),text.lastIndexOf(']')+1))[0].name;return await tools.call(' '+name+' ',{q:'lamps'},{timeoutMs:1200});`,'results for lamps',{setup:capSetup('tab','webmcp'),commands:commands=>{
 assert.equal(commands.length,2);assert.deepEqual(commands[0],tabCommand('webmcp_list_tools'));assert.match(commands[1].registration_id,/^[0-9a-f-]{36}$/);assert.deepEqual({...commands[1],registration_id:'<registration>'},tabCommand('webmcp_invoke_tool',{tool_name:'search',tool_description:'Search the catalogue',tool_title:'Search',registration_id:'<registration>',input:{q:'lamps'},timeout_ms:1200}));
},extra:[validation(`var tools=await cap.fetchTools();var before=(await __trace()).length;try{await tools.call('missing',{});return {rejected:false};}catch(e){return {rejected:true,noCommand:(await __trace()).length===before,message:e.message};}`,{rejected:true,noCommand:true,message:'WebMCP tool "missing" is not available in this snapshot. Call fetchTools() again.'})]});

// BC:9013-9130,9759-9798,9580-9721: complete typed fixture examples, including nested records, nullable fields and
// optional audit branches. Expected observations below deliberately do not import the fixture reply constants.
const assetInventory={assets:[{id:'asset-1',kind:'image',name:'lamp.png',sources:[{kind:'attribute',nodeId:3,property:'src'}],url:'https://cua-capability.example/lamp.png'}],id:'inventory-1',inlineSvgs:[{id:'svg-1',markup:'<svg/>',name:'icon'}],pageUrl:PAGE,summary:{byKind:{image:1},inlineSvgCount:1,totalCount:1}};
const assetBundle={assets:[{contentType:'image/png',id:'asset-1',kind:'image',name:'lamp.png',path:'/fixture/assets/lamp.png',url:'https://cua-capability.example/lamp.png'}],directoryPath:'/fixture/assets',failures:[{contentType:null,id:'asset-2',name:'missing.png',reason:'not available',url:'https://cua-capability.example/missing.png'}],manifestPath:'/fixture/assets/manifest.json',summary:{downloadedCount:1,elapsedMs:1,failedCount:1,requestedCount:2}};
add('pageassetstabcapability/list','boundary-double',`return await cap.list();`,assetInventory,{setup:capSetup('tab','pageAssets'),commands:[tabCommand('tab_page_assets_list')],extra:[invalidResult('tab_page_assets_list','cap.list()',{...assetInventory,summary:{byKind:{image:-1},inlineSvgCount:1,totalCount:1}})]});
add('pageassetstabcapability/bundle','boundary-double',`return await cap.bundle({inventoryId:'inventory-1',assetIds:['asset-1','asset-2'],kinds:['image']});`,assetBundle,{setup:capSetup('tab','pageAssets'),commands:[tabCommand('tab_page_assets_bundle',{inventoryId:'inventory-1',assetIds:['asset-1','asset-2'],kinds:['image']})],extra:[invalidResult('tab_page_assets_bundle',`cap.bundle({inventoryId:'inventory-1'})`,{...assetBundle,summary:{downloadedCount:1,elapsedMs:1,failedCount:1,requestedCount:'2'}})]});
const audit={changes:[{args:[{title:'Fixture'}],method:'create',namespace:'bookmarks',createdAt:1,before:{bookmarks:[{id:'b0',index:0,parentId:'root',title:'Before',url:PAGE}],tabLayout:{groups:[{collapsed:false,color:'blue',id:1,title:'Group',windowId:1}],tabs:[{autoDiscardable:true,groupId:1,id:7,index:0,pinned:false,url:PAGE,windowId:1}]},windows:[{focused:true,height:600,id:1,left:0,state:'normal',top:0,width:800}]},result:{id:'b1'}}]};
add('managementbrowsercapability/getaudittrail','boundary-double',`return await cap.getAuditTrail();`,audit,{setup:capSetup('browser','management'),commands:[browserCommand('browser_management_get_audit_trail')],extra:[invalidResult('browser_management_get_audit_trail','cap.getAuditTrail()',{changes:[{...audit.changes[0],createdAt:'wrong'}]})]});
for(const namespace of ['bookmarks','tabGroups','tabs','windows'])for(const id of [`managementbrowsercapability/${namespace.toLowerCase()}`,`managementbrowsercapability.${namespace.toLowerCase()}/method-string`])add(id,'boundary-double',`var ns=cap.${namespace};return {then:typeof ns.then,toJSON:typeof ns.toJSON,objectMember:typeof ns.toString,result:await ns.fixtureMethod({title:'Fixture'},7)};`,{then:'undefined',toJSON:'undefined',objectMember:'undefined',result:{namespace,method:'fixtureMethod',args:[{title:'Fixture'},7]}},{setup:capSetup('browser','management'),commands:[browserCommand('browser_management_call',{namespace,method:'fixtureMethod',args:[{title:'Fixture'},7]})],extra:[invalidResult('browser_management_call',`cap.${namespace}.fixtureMethod()`,null)]});

// BC:10061-10212. Hidden-member tests probe all four reflective operations, and separately prove the blocking
// ancestor when the child cannot even be reached. Capability subclasses are NOT manifest proxy types: absence there
// means their collection rejects an unadvertised id, and disabling the collection hides the whole access path.
const caseMembers={
 'browser-browser':{object:'browser',iface:'Browser',names:{user:'user',history:'history'}},
 'browser-browseruser':{object:'browser.user',iface:'BrowserUser',parent:['browser','user','Browser.user'],names:{claimtab:'claimTab',gettabcontext:'getTabContext',opentabs:'openTabs'}},
 'browser-tabs':{object:'browser.tabs',iface:'Tabs',parent:['browser','tabs','Browser.tabs'],names:{content:'content'}},
 'browser-tab':{object:'tab',iface:'Tab',names:{ax:'ax',markdeliverable:'markDeliverable',markhandoff:'markHandoff',requestmanualhandoff:'requestManualHandoff'}},
 'browser-axapi':{object:'tab.ax',iface:'AXAPI',parent:['tab','ax','Tab.ax'],names:Object.fromEntries(['click','drag','get','paste','performSecondaryAction','pressKey','scroll','selectText','setValue','typeText','write'].map(name=>[name.toLowerCase(),name]))},
 'browser-contentapi':{object:'tab.content',iface:'ContentAPI',parent:['tab','content','Tab.content'],names:{export:'export'}},
};
for(const p of plan.values())if(p.id.startsWith('hidden/')){
 const suffix=p.id.slice(7),[family,member]=suffix.split('/');const direct=caseMembers[family];let code,expected;
 if(direct){
  const name=direct.names[member];if(!name)throw Error(p.id);
  code=`await __boot('hidden',[${JSON.stringify(`${direct.iface}.${name}`)}]);var direct=__probe(${direct.object},${JSON.stringify(name)});`;
  if(direct.parent){const [parent,name,disabled]=direct.parent;code+=`await __boot('hidden',[${JSON.stringify(disabled)}]);__say({direct,ancestor:__probe(${parent},${JSON.stringify(name)})});`;expected={direct:ABSENT,ancestor:ABSENT};}
  else {code+=`__say({direct});`;expected={direct:ABSENT};}
 }else{
  const definition=families.find(([f])=>f===family||family.startsWith(f+'.'))??(family==='webmcptools'?families.find(([f])=>f==='tabwebmcpcapability'):null);
  const scope=definition?.[1]??(family==='browsercapabilitycollection'?'browser':'tab');
  const cap=definition?.[2];const disabled=scope==='browser'?'Browser.capabilities':'Tab.capabilities';
  code=`await __boot('hidden');`;
  if(cap)code+=`var rejected=false;try{await ${scope}.capabilities.get(${JSON.stringify(cap)});}catch(e){rejected=e.message===${JSON.stringify(`Capability is not available: ${cap}`)};}var list=await ${scope}.capabilities.list();`;
  code+=`await __boot('hidden',[${JSON.stringify(disabled)}]);__say({ancestor:__probe(${scope},'capabilities')${cap?',rejected,listed:list.length':''}});`;
  expected={ancestor:ABSENT,...(cap?{rejected:true,listed:0}:{})};
 }
 scenarios.push({...p,backend:'capability-host',boundaryProof:'boundary-double:hidden',limitations:['Manifest-disabled / unadvertised client-boundary fixture; no backend support claim.'],cells:[{label:'hidden-reflection',code:support+code}],assert:({results})=>{assert.equal(results.length,1);assert.deepEqual(observation(results[0]),expected);return {ok:true};}});
}
// Optional methods are advertised but the retained service has no handlers. Preserve the real-service refusal
// as well as successful selected-client translation through the explicitly labelled boundary double.
// BC:7865-7889,7977-7989,8117-8134; retained service errors.mjs:52 names the unsupported-command sentence.
const optionalMethods=[
 ['api/browser-playwrightapi/elementinfo',`tab.playwright.elementInfo({x:4,y:5,includeNonInteractable:true})`,'playwright_element_info',{x:4,y:5,include_non_interactable:true},[{tagName:'BUTTON',role:'button',visibleText:'Buy',ariaName:'Buy',testId:'buy',nodeId:3,boundingBox:{x:4,y:5,width:20,height:10},preview:'<button>Buy</button>',selector:{primary:'#buy',candidates:['#buy'],frameSelectors:[]}}]],
 ['api/browser-playwrightapi/elementscreenshot',`tab.playwright.elementScreenshot({x:4,y:5,includeNonInteractable:false})`,'playwright_element_screenshot',{x:4,y:5,include_non_interactable:false},{kind:'Uint8Array',bytes:[1,2,3]}],
 ['api/browser-cuaapi/downloadmedia',`tab.cua.downloadMedia({x:4,y:5,timeoutMs:1200})`,'cua_download_media',{x:4,y:5,timeout_ms:1200,client_timeout_ms:1200},VOID],
 ['api/browser-domcuaapi/downloadmedia',`tab.dom_cua.downloadMedia({node_id:'3',timeoutMs:1200})`,'dom_cua_download_media',{node_id:'3',timeout_ms:1200,client_timeout_ms:1200},VOID],
];
for(const [id,call,type,payload,value]of optionalMethods){
 add(id,'boundary-double',`return await ${call};`,value,{commands:[tabCommand(type,payload)],extra:[validation(`await __boot('real-service');try{await ${call};return {rejected:false};}catch(e){return {rejected:true,message:e.message};}`,{rejected:true,message:`Unsupported browser command: ${type}`})]});
 const s=scenarios.at(-1);s.boundaryProof='real-service+boundary-double';s.limitations=['Real retained-service unsupported-command outcome plus client-only success through a boundary double.'];
}
// Supplemental union/validation checks stay on the same case ID, retaining its real-service success proof first.
function extend(id,checks,{mixed=false}={}){
 const scenario=scenarios.find(s=>s.id===id);if(!scenario)throw Error(id);
 const original=scenario.assert,count=scenario.cells.length;
 scenario.cells.push(...checks.map((c,i)=>({label:`type-validation-${i+1}`,code:c.code})));
 scenario.assert=({results})=>{assert.equal(results.length,count+checks.length);original({results:results.slice(0,count)});for(let i=0;i<checks.length;i++)checkObservation(observation(results[count+i]),checks[i].expected);return {ok:true};};
 if(mixed){scenario.boundaryProof='real-service+boundary-double';scenario.limitations=['Real-service success plus source-grounded client result-validation double.'];}
}
const reply=(type,value)=>`await nodeRepl.rpc('browser',{method:'oracle.reply',params:{type:${JSON.stringify(type)},value:${JSON.stringify(value)}}});`;
const textContext={kind:'text',text:'Fixture text',title:'Fixture',truncated:false,url:PAGE};
const libraryContext={kind:'library_file',libraryFileId:'library-1',fileId:'file-1',fileName:'fixture.pdf',mimeType:'application/pdf',title:'Fixture',url:PAGE};
extend('capability-host/browser-browseruser/gettabcontext',[
 validation(`${reply('browser_user_get_tab_context',textContext)}return await browser.user.getTabContext('7');`,textContext),
 validation(`${reply('browser_user_get_tab_context',libraryContext)}return await browser.user.getTabContext('7');`,libraryContext),
]);
const authResult={status:'submission_failed',locator_error:{field_id:'email',reason:'not_user_visible'},selected_option:'password',submission_diagnostics:{schema_version:1,request_id:'123e4567-e89b-42d3-a456-426614174000',submission_mode:'ordinary',first_rejection:{outcome:'submission_failed',reason:'other',request_class:'background',submission_phase:'settled'},terminal_rejection:{outcome:'origin_changed',reason:'request_origin',request_class:'main_document',submission_phase:'pending'},attempt_events:[{sequence:0,kind:'site_request',phase:'submitting',field_index:0,reinspection:1,outcome:'submission_failed',request_class:'background',method:'post',origin_relation:'same'}],dropped_attempt_events:0}};
const authPayload={origin:'https://cua-capability.example',otpHandle:'fixture-otp',fields:[{id:'email',label:'Email',type:'email',required:true,selector:'#email',autocomplete:'username'}],options:[{id:'password',label:'Password',field_ids:['email']},{id:'sso',label:'SSO',selector:'#sso'}],submit:{action:'click',selector:'#submit'}};
extend('capability-host/browserauthtabcapability/request',[
 validation(`await __boot('boundary-double');globalThis.cap=await tab.capabilities.get('browserAuth');var other=await browser.tabs.get('8');var before=(await __trace()).length;try{await cap.request({origin:'https://cua-capability.example',fields:[{id:'email',label:'Email',type:'email',required:true,selector:other.playwright.locator('#email')}]});return {rejected:false};}catch(e){return {rejected:true,message:e.message,noCommand:(await __trace()).length===before};}`,{rejected:true,message:'browserAuth selector locator must belong to this tab',noCommand:true}),
 validation(`${reply('tab_browser_auth_handoff',authResult)}var before=(await __trace()).length;var value=await cap.request({...${JSON.stringify(authPayload)},fields:[{id:'email',label:'Email',type:'email',required:true,selector:tab.playwright.locator('#email'),autocomplete:'username'}],submit:{action:'click',selector:tab.playwright.locator('#submit')}});return {value,commands:(await __trace()).slice(before).map(__command)};`,{value:authResult,commands:[tabCommand('tab_browser_auth_handoff',authPayload)]}),
 invalidResult('tab_browser_auth_handoff',`cap.request({origin:'https://cua-capability.example',fields:[],qr_code:true})`,{status:'submitted',submission_diagnostics:{...authResult.submission_diagnostics,schema_version:2}}),
],{mixed:true});
// CDP target conversion and event result parsing use a double only for replies that a functioning real service
// correctly never emits. Command.toJSON does NOT validate the command schema (BC:495-509).
extend('capability-host/cdptabcapability/send',[
 validation(`await __boot('boundary-double');globalThis.cap=await tab.capabilities.get('cdp');${reply('tab_cdp_call',false)}var before=(await __trace()).length;var value=await cap.send('',{fixture:true},{target:{sessionId:'session-1'},timeoutMs:1200});return {value,commands:(await __trace()).slice(before).map(__command)};`,{value:false,commands:[tabCommand('tab_cdp_call',{method:'',params:{fixture:true},target:{session_id:'session-1'},timeout_ms:1200,client_timeout_ms:1200})]}),
],{mixed:true});
const events={cursor:4,events:[{sequence:4,source:{extensionId:'fixture-extension',sessionId:'session-1',tabId:7,targetId:'target-1'},method:'Runtime.fixture',params:{value:1}}],hasMore:false,truncated:true};
extend('capability-host/cdptabcapability/readevents',[
 validation(`await __boot('boundary-double');globalThis.cap=await tab.capabilities.get('cdp');${reply('tab_cdp_events',events)}var before=(await __trace()).length;var value=await cap.readEvents({afterSequence:3,limit:2,methods:['Runtime.fixture'],target:{targetId:'target-1'},timeoutMs:0});return {value,commands:(await __trace()).slice(before).map(__command)};`,{value:events,commands:[tabCommand('tab_cdp_events',{after_sequence:3,limit:2,methods:['Runtime.fixture'],target:{target_id:'target-1'},timeout_ms:0})]}),
 invalidResult('tab_cdp_events','cap.readEvents()', {...events,events:[{...events.events[0],sequence:0}]}),
],{mixed:true});
extend('capability-host/tabwebmcpcapability/fetchtools',[
 validation(`await __boot('boundary-double');globalThis.cap=await tab.capabilities.get('webmcp');${reply('webmcp_list_tools',{tools:[]})}var tools=await cap.fetchTools();return {frozen:Object.isFrozen(tools),description:tools.description()};`,{frozen:true,description:'No WebMCP tools are available in this document.'}),
 invalidResult('webmcp_list_tools','cap.fetchTools()', {tools:[{name:'bad',call_name:'bad',registration_id:3,input_schema:{}}]}),
],{mixed:true});
// State write is a display side effect, not merely a void return and the correct command.
{
 const scenario=scenarios.find(s=>s.id==='capability-host/browser-axapi/write'),original=scenario.assert;
 scenario.assert=args=>{const result=original(args);assert.match(args.results[1].content.filter(c=>c.type==='text').map(c=>c.text).join('\n'),/AX fixture state/);return result;};
}
// BC:5243-5286,9241-9278,9514-9563. The retained service autoaccepts beforeunload (vendor BS:48659-48733),
// so this success proof is client-boundary-only. api/browser-tab/getjsdialog separately observes real automatic
// navigation and absence of a pending dialog; this fixture does not assert that dismiss can cancel navigation.
const beforeUnloadSetup=reply('tab_get_js_dialog',{dialog:{id:'dialog-beforeunload',type:'beforeunload'}});
add('api/browser-beforeunloaddialog/type','boundary-double',`var dialog=await tab.getJsDialog();return {type:dialog.type,accept:typeof dialog.accept};`,{type:'beforeunload',accept:'undefined'},{setup:beforeUnloadSetup,commands:[tabCommand('tab_get_js_dialog')]});
add('api/browser-beforeunloaddialog/dismiss','boundary-double',`var dialog=await tab.getJsDialog();return await dialog.dismiss();`,VOID,{setup:beforeUnloadSetup,commands:[tabCommand('tab_get_js_dialog'),tabCommand('tab_handle_js_dialog',{dialog_id:'dialog-beforeunload',action:'dismiss'})]});
// BC:5304-5343,8346-8365. Supplemental success witnesses for ContentAPI.exportGsuite (all retained formats)
// and exportYouTubeTranscript. Their primary Chrome cases still prove the real-service rejection paths.
{
 const id='capability-host/browser-contentapi/export';
 const formats=['pdf','md','xlsx','csv','docx','pptx'];
 extend(id,[
  ...formats.map(format=>validation(`var before=(await __trace()).length;var value=await tab.content.exportGsuite(${JSON.stringify(format)});return {value,commands:(await __trace()).slice(before).map(__command)};`,{value:`/fixture/gsuite.${format}`,commands:[tabCommand('tab_content_export_gsuite',{format})]})),
  validation(`var before=(await __trace()).length;var value=await tab.content.exportYouTubeTranscript();return {value,commands:(await __trace()).slice(before).map(__command)};`,{value:'/fixture/transcript.txt',commands:[tabCommand('tab_content_export_youtube_transcript')]}),
 ]);
 const scenario=scenarios.find(s=>s.id===id);
 scenario.cells.slice(-7).forEach((cell,index)=>{cell.label=index<formats.length?`export-gsuite-${formats[index]}`:'export-youtube-transcript';});
 scenario.supplementalWitnesses={
  'api/browser-contentapi/exportgsuite':formats.map(format=>`export-gsuite-${format}`),
  'api/browser-contentapi/exportyoutubetranscript':['export-youtube-transcript'],
 };
}
// BC:189-242,10238-10284: recovery validation is an envelope discriminator plus an error decoder, NOT a
// blanket result schema. In particular ok:true ignores unrelated fields; undefined/null value fails later in the
// FunctionAgentTransport (10013-10046), and ContentAPI.export returns .path without type validation (8335-8345).
{
 const id='capability-host/browser-contentapi/export';
 const details={schema_version:1,command:'tab_content_export',phase:'before_command',reason:'credential_state_unavailable',next_action:'restart_browser_runtime'};
 const malformed=[null,{}, {ok:1}, {ok:'true',value:{path:'/fixture/ignored.pdf'}}, {ok:false}, {ok:false,error:null},
  ...[{schema_version:2},{command:'Bad-Command'},{phase:'outside'},{reason:'unknown'},{next_action:'stop'},{security_reason:'user_declined'},
   {reason:'browser_security_unavailable',next_action:'retry_after_resolution',security_reason:'unknown'}].map(change=>({ok:false,error:{...details,...change}}))];
 const invalid={rejected:true,name:'Error',message:'Browser service returned an invalid recovery response'};
 const setupRecovery=`await nodeRepl.rpc('browser',{method:'oracle.configure',params:{mode:'boundary-double'}});await nodeRepl.rpc('browser',{method:'oracle.recovery',params:{enabled:true}});globalThis.agent=await __capabilitySetup();globalThis.browser=await agent.browsers.get('fixture');globalThis.tab=await browser.tabs.new();globalThis.__recoveryExport=async envelope=>{await nodeRepl.rpc('browser',{method:'oracle.envelope',params:{type:'tab_content_export',value:envelope}});try{return {rejected:false,value:__project(await tab.content.export())};}catch(e){var result={rejected:true,name:e.name,message:e.message};if(e.details!==undefined){result.details=JSON.parse(JSON.stringify(e.details));result.detailsFrozen=Object.isFrozen(e.details);}return result;}};`;
 const success=[{ok:true,value:{path:'/fixture/recovered.pdf'},error:{ignored:true},extra:'ignored'},{ok:true,value:{path:17}}, {ok:true,value:false}, {ok:true,value:null}, {ok:true}];
 extend(id,[
  validation(`${setupRecovery}var values=[];for(var envelope of ${JSON.stringify(malformed)})values.push(await __recoveryExport(envelope));return values;`,malformed.map(()=>invalid)),
  validation(`return await __recoveryExport(${JSON.stringify({ok:false,error:{...details,ignored:'discarded'},message:'untrusted envelope sentence'})});`,{rejected:true,name:'BrowserCredentialRecoveryError',message:'Browser observation is unavailable because native credential state cannot be safely resumed. Start a new browser runtime to continue. Recovery v1: command=tab_content_export, phase=before_command, reason=credential_state_unavailable, next_action=restart_browser_runtime.',details,detailsFrozen:true}),
  validation(`var values=[];for(var envelope of ${JSON.stringify(success)})values.push(await __recoveryExport(envelope));return values;`,[{rejected:false,value:'/fixture/recovered.pdf'},{rejected:false,value:17},{rejected:false,value:VOID},{rejected:true,name:'Error',message:'transport send returned empty response'},{rejected:true,name:'Error',message:'transport send returned empty response'}]),
 ]);
 const scenario=scenarios.find(s=>s.id===id);
 scenario.cells.slice(-3).forEach((cell,index)=>{cell.label=['recovery-malformed-envelopes','recovery-valid-error','recovery-permissive-success'][index];});
}
export default scenarios;
