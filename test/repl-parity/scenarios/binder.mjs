// Independent source oracle, not the port: readable/chatgpt-26.928.40906,
// cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/
// create_tinysky_alt.js:48-120; bind_mac_app.js:5-157; bind_tab.js:4-108;
// core/{display,screenshot_bytes}.js. Provenance recorded in fixtures/binder-service.mjs.
// macOS binding only. Linux native behavior remains native/* M4; all api/* are due M3.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
import {exactImage} from '../../../scripts/browser-parity/image-hash.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c])),scenarios=[];
const bytes=readFileSync(new URL('../fixtures/pattern.png',import.meta.url));
const image={uint8:true,bytes:[...bytes]},imageOracle=exactImage(bytes);
const APP='com.fixture.Editor',STATE='[0] text field "Fixture editor"',AX='[1] text field "AX fixture"',DOM='- textbox "DOM fixture"';
const apps=[{id:APP,displayName:'Fixture Editor',isRunning:true,lastUsedDate:'2026-10-14T12:00:00Z',useCount:7},{id:'com.fixture.Closed',displayName:'Closed Fixture',isRunning:false}];
const sky=(method,arg)=>({type:'execute',method,args:arg===undefined?[]:[arg]});
const tab=(method,...args)=>({type:'tab',tab:'ax',method,args});
const dom=method=>({type:'tab',tab:'dom',method,args:[]});
const error=message=>({error:message});
const inputError=error('Browser input requires an element index from the latest AX snapshot, or null to use current focus.');
const domError=error('This tab does not support accessibility input. Use its Playwright API.');
const noScreenshot=error(`Screenshot unavailable for ${APP}.`);
const cfg=options=>`await nodeRepl.rpc('binder',{type:'fixture',op:'configure',...${JSON.stringify(options)}});`;
const take=expr=>`await binderTake(async()=>${expr});`;
const prepare=`globalThis.binderApp=await cua.getApp('Fixture Editor');await nodeRepl.rpc('binder',{type:'fixture',op:'reset'});`;
function add(id,code,values,calls,{state='',images=0,ordered=false}={}){
 const scheduled=plan.get(id);if(!scheduled)throw new Error(`unknown binder case ${id}`);
 const body=`let binderValues=[];
 function binderNormalize(v){if(v===undefined)return 'undefined';if(v instanceof Uint8Array)return {uint8:true,bytes:Array.from(v)};if(v&&typeof v==='object'){if(Array.isArray(v))return v.map(binderNormalize);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,binderNormalize(x)]));}return v;}
 async function binderTake(fn){try{binderValues.push(binderNormalize(await fn()));}catch(e){binderValues.push({error:e.message});}}
 ${code}
 nodeRepl.write('BINDER_REPORT:'+JSON.stringify({values:binderValues,calls:await nodeRepl.rpc('binder',{type:'fixture',op:'calls'})}));`;
 scenarios.push({...scheduled,platforms:['darwin'],backend:'binder-double',imageMode:'exact',cells:[{label:'bind-fixture-app',code:prepare},{label:'exercise',code:body}],assert:({results})=>{
  assert.equal(results.length,2);for(const result of results)assert.equal(result.isError,false);
  const content=results[1].content??[],reports=content.filter(c=>c.type==='text'&&c.text.startsWith('BINDER_REPORT:'));
  assert.equal(reports.length,1,`${id}: missing/duplicate result witness`);
  assert.deepEqual(JSON.parse(reports[0].text.slice('BINDER_REPORT:'.length)),{values,calls});
  assert.equal(content.filter(c=>c.type==='text'&&!reports.includes(c)).map(c=>c.text).join(''),state,`${id}: automatic output`);
  const captured=content.filter(c=>c.type==='image');assert.equal(captured.length,images);
  for(const item of captured)assert.deepEqual(exactImage(Buffer.from(item.data,'base64'),{mimeType:item.mimeType}),imageOracle);
  assert.ok(content.every(c=>c.type==='text'||c.type==='image'));
  if(ordered)assert.ok(content.findIndex(c=>c.type==='text'&&!reports.includes(c))<content.findIndex(c=>c.type==='image'));
  return {ok:true};
 }});
}
add('api/cua/computer',take(`({enabled:typeof cua.computer,disabled:'computer' in binderDisabledCua,disabledGetApp:'getApp' in binderDisabledCua,disabledListApps:'listApps' in binderDisabledCua})`),[{enabled:'object',disabled:false,disabledGetApp:false,disabledListApps:false}],[]);
add('api/cua/computer.target',take('cua.computer.target'),['mac'],[]);
// Source mac/create_client has neither launch_app nor list_windows; do not invent Linux methods on this double.
add('api/cua/computer.launch-app',take(`({present:'launch_app' in cua.computer,type:typeof cua.computer.launch_app})`),[{present:false,type:'undefined'}],[]);
add('api/cua/listwindows',take(`({present:'listWindows' in cua,type:typeof cua.listWindows})`),[{present:false,type:'undefined'}],[]);
add('api/cua/getapp',take(`(await cua.getApp('Fixture Editor')).getAXState({emit:false})`)+[null,123,{windowId:1},['Editor']].map(x=>take(`cua.getApp(${JSON.stringify(x)})`)).join(''),[STATE,...Array(4).fill(error('macOS getApp requires an app name, path, or bundle ID.'))],[sky('get_app_state',{app:'Fixture Editor',disableDiff:true}),sky('get_app_state',{app:APP})],{state:STATE});
add('api/cua/listapps',take('cua.listApps()')+take('cua.listApps({emit:false})'),[apps,apps],[sky('list_apps'),sky('list_apps')],{state:JSON.stringify(apps)});
const target='api/target-app-decorated-tab/';
add(target+'getaxstate',take('binderApp.getAXState()')+take('binderApp.getAXState({disableDiffing:true,emit:false})')+take('binderApp.getAXState({disableDiffing:false,emit:false})')+take('binderTab.getAXState({disableDiffing:true})')+take('binderDomTab.getAXState()')+take('binderBareTab.getAXState()'),[STATE,STATE,STATE,AX,DOM,error('Tab fixture-bare does not support DOM snapshots.')],[sky('get_app_state',{app:APP}),sky('get_app_state',{app:APP,disableDiff:true}),sky('get_app_state',{app:APP,disableDiff:false}),tab('get','state',{disableDiffing:true}),dom('domSnapshot')],{state:STATE+AX+DOM});
add(target+'getscreenshot',take('binderApp.getScreenshot()')+take('binderTab.getScreenshot()')+take('binderDomTab.getScreenshot()')+cfg({screenshot:false})+take('binderApp.getScreenshot({emit:false})')+take('binderBareTab.getScreenshot()'),[image,image,image,noScreenshot,error('Tab fixture-bare does not support screenshots.')],[sky('get_app_state',{app:APP}),tab('get','screenshot'),dom('screenshot'),sky('get_app_state',{app:APP})],{images:3});
add(target+'getaxstateandscreenshot',take('binderApp.getAXStateAndScreenshot({disableDiffing:true})')+take('binderTab.getAXStateAndScreenshot({disableDiffing:false})')+take('binderDomTab.getAXStateAndScreenshot()')+cfg({screenshot:false})+take('binderApp.getAXStateAndScreenshot({emit:false})')+take('binderTab.getAXStateAndScreenshot({emit:false})'),[{state:STATE,screenshot:image},{state:AX,screenshot:image},{state:DOM,screenshot:image},{state:STATE},{state:AX}],[sky('get_app_state',{app:APP,disableDiff:true}),tab('get','both',{disableDiffing:false}),dom('domSnapshot'),dom('screenshot'),sky('get_app_state',{app:APP}),tab('get','both')],{state:STATE+AX+DOM,images:3,ordered:true});
add(target+'click',take(`binderApp.click(0,{mouseButton:'right',clickCount:2})`)+take('binderApp.click([12,34])')+take(`binderTab.click(0,{mouseButton:'right',clickCount:2})`),Array(3).fill('undefined'),[sky('click',{app:APP,element_index:0,mouse_button:'right',click_count:2}),sky('click',{app:APP,x:12,y:34}),tab('click',0,{mouseButton:'right',clickCount:2})]);
add(target+'drag',take('binderApp.drag([1,2],[30,40])')+take('binderTab.drag([1,2],[30,40])'),['undefined','undefined'],[sky('drag',{app:APP,from_x:1,from_y:2,to_x:30,to_y:40}),tab('drag',[1,2],[30,40])]);
const scrollCode=take(`binderApp.scroll(0,'down')`)+take(`binderApp.scroll([12,34],'up',2)`)+take(`binderApp.scroll(0,'left',{pixels:24})`);
const scrollValues=['undefined','undefined',error('macOS scroll accepts pages, not pixels.')];
const scrollCalls=[sky('scroll',{app:APP,direction:'down',element_index:0}),sky('scroll',{app:APP,direction:'up',x:12,y:34,pages:2})];
add('api/app/scroll',scrollCode,scrollValues,scrollCalls);
add(target+'scroll',scrollCode+take(`binderTab.scroll([12,34],'right',3)`),[...scrollValues,'undefined'],[...scrollCalls,tab('scroll',[12,34],'right',3)]);
add(target+'selecttext',take(`binderApp.selectText(0,'word',{prefix:'before',suffix:'after',selectionType:'cursor_after'})`)+take(`binderApp.selectText(1,'bare')`)+take(`binderTab.selectText(0,'word',{prefix:'before',suffix:'after',selectionType:'cursor_after'})`),Array(3).fill('undefined'),[sky('select_text',{app:APP,element_index:0,text:'word',prefix:'before',suffix:'after',selection_type:'cursor_after'}),sky('select_text',{app:APP,element_index:1,text:'bare'}),tab('selectText',0,'word',{prefix:'before',suffix:'after',selectionType:'cursor_after'})]);
add(target+'setvalue',take(`binderApp.setValue(0,'exact value')`)+take(`binderTab.setValue(0,'exact value')`),['undefined','undefined'],[sky('set_value',{app:APP,element_index:0,value:'exact value'}),tab('setValue',0,'exact value')]);
add(target+'performsecondaryaction',take(`binderApp.performSecondaryAction(0,'show menu')`)+take(`binderTab.performSecondaryAction(0,'show menu')`),['undefined','undefined'],[sky('perform_secondary_action',{app:APP,element_index:0,action:'show menu'}),tab('performSecondaryAction',0,'show menu')]);
add('api/app/paste',take(`binderApp.paste('plain')`)+take(`binderApp.paste('<b>rich</b>',{format:'html'})`)+take(`binderApp.paste('**rich**',{format:'md'})`)+cfg({failMethod:'paste'})+take(`binderApp.paste('rejected')`),['undefined','undefined','undefined',error('fixture service rejection')],[sky('paste',{app:APP,text:'plain',format:'text'}),sky('paste',{app:APP,text:'<b>rich</b>',format:'html'}),sky('paste',{app:APP,text:'**rich**',format:'md'}),sky('paste',{app:APP,text:'rejected',format:'text'})]);
add('api/app/presskey',take(`binderApp.pressKey('super+shift+Left')`),['undefined'],[sky('press_key',{app:APP,key:'super+shift+Left'})]);
add('api/app/typetext',take(`binderApp.typeText('line one\\n雪')`),['undefined'],[sky('type_text',{app:APP,text:'line one\n雪'})]);
for(const [id,method,value] of [['paste','paste','paste fixture'],['presskey','pressKey','super+a'],['typetext','typeText','typed fixture']]){
 const option=method==='paste'?",{format:'html'}":'';
 const valid=take(`binderTab.${method}(0,${JSON.stringify(value)}${option})`)+take(`binderTab.${method}(null,${JSON.stringify(value)})`);
 const invalid=['-1','0.5','"0"','undefined','NaN','{}'].map(index=>take(`binderTab.${method}(${index},'bad')`)).join('');
 const args=method==='paste'?[0,value,{format:'html'}]:[0,value];
 // bind_tab forwards an explicit undefined trailing paste option; JSON service wire preserves it as null.
 const focus=method==='paste'?[null,value,null]:[null,value];
 add('api/decorated-tab/'+id,valid+invalid,['undefined','undefined',...Array(6).fill(inputError)],[tab(method,...args),tab(method,...focus)]);
}
for(const [tail,method,values,calls] of [
 ['state','getAXState',[STATE,AX,DOM],[sky('get_app_state',{app:APP,disableDiff:false}),tab('get','state',{disableDiffing:false}),dom('domSnapshot')]],
 ['screenshot','getScreenshot',[image,image,image],[sky('get_app_state',{app:APP}),tab('get','screenshot'),dom('screenshot')]],
 ['combined','getAXStateAndScreenshot',[{state:STATE,screenshot:image},{state:AX,screenshot:image},{state:DOM,screenshot:image}],[sky('get_app_state',{app:APP,disableDiff:false}),tab('get','both',{disableDiffing:false}),dom('domSnapshot'),dom('screenshot')]],
])add('cells/facade/emit-false-'+tail,['binderApp','binderTab','binderDomTab'].map(object=>take(`${object}.${method}({emit:false,disableDiffing:false})`)).join(''),values,calls);
const refused=[`click(0)`,`drag([1,2],[3,4])`,`scroll(0,'down',1)`,`selectText(0,'text')`,`setValue(0,'value')`,`performSecondaryAction(0,'menu')`,`paste(null,'text')`,`pressKey(null,'a')`,`typeText(null,'text')`];
add('cells/facade/dom-only-input-refusal',refused.map(call=>take(`binderDomTab.${call}`)).join(''),Array(refused.length).fill(domError),[]);
// get_state.js:7-46 / get_browsers.js:5-48: actual selected inventory collector, not a fixture algorithm.
const browserInfo=id=>({id,name:id,family:'chromium',type:'extension',profileName:'Fixture profile',metadata:{extensionInstanceId:id+'-extension'}});
const browserState=id=>({...browserInfo(id),tabs:[{id:id+'-tab',providerTabId:'1',title:'Fixture page',url:'https://fixture.invalid/'}]});
const inventoryCall=(method,id)=>({type:'inventory',method,...(id===undefined?{}:{id})});
const inventoryCalls=[sky('list_apps'),inventoryCall('list'),inventoryCall('get','fixture-good'),inventoryCall('get','fixture-broken'),inventoryCall('tabs','fixture-good'),inventoryCall('tabs','fixture-broken')];
const browserStates=[browserState('fixture-good'),browserState('fixture-broken')];
add('cells/facade/all-settled-inventory',take('binderInventory()')+cfg({failMethod:'list_apps'})+take('binderInventory()')+cfg({failMethod:null,browserFailure:'list'})+take('binderInventory()')+cfg({browserFailure:'tabs'})+take('binderInventory()'),[
 {apps,browsers:browserStates},
 {apps:[],browsers:browserStates,errors:['Native apps: Error: fixture service rejection']},
 {apps,browsers:[],errors:['Browsers: Error: fixture browser list rejection']},
 {apps,browsers:[browserState('fixture-good'),{...browserInfo('fixture-broken'),tabs:[]}],errors:['Browser fixture-broken: Error: fixture browser tabs rejection']},
],[...inventoryCalls,...inventoryCalls,sky('list_apps'),inventoryCall('list'),...inventoryCalls]);
export default scenarios;
