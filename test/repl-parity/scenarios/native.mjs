// Independent Linux oracle: readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/
// tinysky_alt/bind_linux_app.js:18-155, create_tinysky_alt.js:76-102, get_apps.js:11-25;
// targets/linux/{create_client,element_ids,launch_app,perform_secondary_action}.js. GTK3 failure sentence is observed
// in committed M0 native vendor/run-1/results.jsonl. No owned facade implementation supplies expectations.
import assert from 'node:assert/strict';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c])),scenarios=[];
const report=result=>{assert.equal(result.isError,false);const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('');assert.ok(text.startsWith('NATIVE:'));return JSON.parse(text.slice(7));};
const take=expression=>`try{var v=await (${expression});nativeValues.push(v===undefined?'undefined':v);}catch(e){nativeValues.push({error:e.message});}`;
function add(id,code,expected,{image=false,fixtureMode='blank'}={}){
 const full='native/'+id,p=plan.get(full);assert.ok(p,full);
 scenarios.push({...p,backend:'native',fixtureMode,boundaryProof:'native-live',imageMode:'live',screenshotTolerance:0,cells:[{label:'exercise',code:`var nativeValues=[];${code}nativeSay(nativeValues);`,timeoutMs:60000},{label:'end-task',op:'endTask'}],assert:({results})=>{
  assert.equal(results.length,2);if(typeof expected==='function')expected(report(results[0]));else assert.deepEqual(report(results[0]),expected);assert.equal(results[0].content.filter(c=>c.type==='image').length,image?1:0);
  if(image){const item=results[0].content.find(c=>c.type==='image');assert.equal(item.mimeType,'image/jpeg');assert.ok(Buffer.from(item.data,'base64').length>100);}
  assert.equal(results[1].isError,false);assert.equal(results[1].structuredContent.status,'ended');return {ok:true};
 }});
}
const err=error=>({error});
add('cua/computer',take(`({present:typeof cua.computer==='object',get:typeof cua.getApp==='function'})`),[{present:true,get:true}]);
add('cua/computer.target',take('cua.computer.target'),['linux']);
add('cua/computer.launch-app',take(`cua.computer.launch_app({app:'cua-m4-nonexistent-fixture-application'})`),[err('launchable application "cua-m4-nonexistent-fixture-application" was not found')]);
add('cua/getapp', ['null','"gedit"','{windowId:0}','{windowId:1.5}'].map(x=>take(`cua.getApp(${x})`)).join('')+take(`({bound:typeof app.getAXState==='function',owned:await nativeCheck(nativeFilename)})`),[...Array(4).fill(err('linux getApp requires { windowId } from listApps() or listWindows().')),{bound:true,owned:true}]);
add('cua/listapps',take(`(async()=>{const all=await cua.listApps({emit:false});const found=all.find(a=>a.windows?.some(w=>w.id===nativeWindow.id));return {found:!!found,id:typeof found?.id,running:found?.isRunning,name:typeof found?.displayName,windows:Array.isArray(found?.windows)};})()`),[{found:true,id:'string',running:true,name:'string',windows:true}]);
add('cua/listwindows',take(`(async()=>{const all=await cua.listWindows({emit:false});const found=all.find(w=>w.id===nativeWindow.id);return {found:!!found,id:Number.isSafeInteger(found?.id),app:typeof found?.app,title:typeof found?.title};})()`),[{found:true,id:true,app:'string',title:'string'}]);
add('target-app-decorated-tab/getaxstate',take(`(async()=>{const a=await app.getAXState({emit:false,disableDiffing:false}),b=await app.getAXState({emit:false,disableDiffing:true});return {full:[a,b].every(v=>v.includes(nativeFilename)&&v.includes('text (')&&v.includes('settable')),source:[a,b].every(v=>v.startsWith('Accessibility source: at_spi\\n')),owned:[a,b].every(v=>v.includes(nativeFilename))};})()`),[{full:true,source:true,owned:true}]);
add('target-app-decorated-tab/getscreenshot',take(`(async()=>{const b=await app.getScreenshot({emit:false});await nodeRepl.emitImage({bytes:b,mimeType:'image/png'});return {bytes:b instanceof Uint8Array,nonempty:b.length>100};})()`),[{bytes:true,nonempty:true}],{image:true});
add('target-app-decorated-tab/getaxstateandscreenshot',take(`(async()=>{const b=await app.getAXStateAndScreenshot({emit:false,disableDiffing:true});await nodeRepl.emitImage({bytes:b.screenshot,mimeType:'image/png'});return {state:typeof b.state==='string'&&b.state.startsWith('Accessibility source: at_spi\\n')&&b.state.includes(nativeFilename)&&b.state.includes('text (')&&b.state.includes('settable'),bytes:b.screenshot instanceof Uint8Array,nonempty:b.screenshot.length>100};})()`),[{state:true,bytes:true,nonempty:true}],{image:true});
const witnessImport=`var witnesses=await import('@@CHECKOUT@@/test/repl-parity/fixtures/native-action-witness.mjs');var readOwnedText=()=>witnesses.nativeDocumentText(cua,nativeWindow);`;
add('target-app-decorated-tab/click',witnessImport+take(`witnesses.observeClick(app,readOwnedText)`),values=>{assert.equal(values.length,1);const point=values[0];assert.equal(point.returnedUndefined,true);assert.equal(point.removed,1);assert.ok(Number.isSafeInteger(point.index)&&point.index>0&&Number.isSafeInteger(point.line)&&point.line>1,'click must move the caret away from the initial document start');assert.equal(point.restored,true);},{fixtureMode:'scroll'});
add('target-app-decorated-tab/drag',witnessImport+take(`witnesses.observeDrag(app,readOwnedText)`),values=>{assert.equal(values.length,1);assert.ok(Number.isSafeInteger(values[0].removed)&&values[0].removed>=2,'drag must select more than one character');assert.deepEqual({...values[0],removed:0},{removed:0,contiguous:true,restored:true});},{fixtureMode:'scroll'});
for(const id of ['app/scroll','target-app-decorated-tab/scroll'])add(id,witnessImport+take(`witnesses.observeScroll(app,readOwnedText)`)+take(`app.scroll([100,150],'up',1)`)+[0,-1,NaN,Infinity].map(x=>take(`app.scroll([100,150],'down',{pixels:${String(x)}})`)).join(''),values=>{
 assert.equal(values.length,6);const {before,after}=values[0];
 for(const point of [before,after]){assert.equal(point.removed,1);assert.equal(point.restored,true);assert.ok(Number.isSafeInteger(point.index)&&point.index>0);assert.ok(Number.isSafeInteger(point.line)&&point.line>0);}
 assert.ok(after.line>before.line&&after.index>before.index,'scroll must move the visible document range');
 assert.deepEqual(values.slice(1),[err('Linux scroll accepts { pixels }, not pages.'),...Array(4).fill(err('pixels must be a positive finite number.'))]);
},{fixtureMode:'scroll'});
add('target-app-decorated-tab/selecttext',take(`app.selectText(0,'fixture',{selectionType:'cursor_after'})`),[err('selectText is unavailable on Linux.')]);
add('target-app-decorated-tab/setvalue',take(`app.setValue(0,'fixture')`),[err('setValue is unavailable on Linux; use click, pressKey, and typeText.')]);
add('target-app-decorated-tab/performsecondaryaction',take(`app.performSecondaryAction(999999,'not-a-fixture-action')`),[err('Unknown element ID 999999 for this window; refresh get_window_state()')]);
add('app/presskey',take(`(async()=>{for(const key of ['m','f','o','u','r'])await app.pressKey(key);const inserted=await nativeCheck('mfour');await app.pressKey('ctrl+a');await app.pressKey('BackSpace');return {inserted,cleared:!(await nativeAX()).includes('mfour')};})()`),[{inserted:true,cleared:true}]);
const crash='D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying';
for(const [id,method] of [['app/typetext','typeText'],['app/paste','paste']])add(id,(method==='paste'?['html','md'].map(format=>take(`app.paste('fixture',{format:'${format}'})`)).join(''):'')+take(`app.${method}('cuamfourfixture')`)+take(`(async()=>{let end=Date.now()+10000;do{if(!(await cua.listWindows({emit:false})).some(w=>w.id===nativeWindow.id))return true;}while(Date.now()<end);return false;})()`),values=>{const offset=method==='paste'?2:0;if(offset)assert.deepEqual(values.slice(0,2),[err('Linux paste supports only text format.'),err('Linux paste supports only text format.')]);assert.equal(values.length,offset+2);assert.deepEqual(Object.keys(values[offset]),['error']);assert.ok([crash,'Resource temporarily unavailable (os error 11)'].includes(values[offset].error),'unrecognized native input error');assert.equal(values[offset+1],true);});
export default scenarios;
