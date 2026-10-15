// Pure fixture/oracle tests. These never launch a REPL, vendor runtime, native helper or Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBinderService} from './fixtures/binder-service.mjs';
import scenarios from './scenarios/binder.mjs';
import {validateRegistry} from '../../scripts/repl-parity/registry.mjs';
const execute=(method,...args)=>({type:'execute',method,args});
const control=op=>({type:'fixture',op});
test('Sky double advertises only mac methods, records unmodified arguments and never launches apps',async()=>{
 const rpc=createBinderService();const setup=await rpc({type:'setup'});
 assert.equal(setup.target,'mac');assert.ok(setup.methods.includes('get_app_state'));
 assert.ok(!setup.methods.includes('launch_app'));assert.ok(!setup.methods.includes('list_windows'));
 await rpc(execute('click',{app:'Editor',element_index:0,mouse_button:'right',click_count:2}));
 assert.deepEqual(await rpc(control('calls')),[execute('click',{app:'Editor',element_index:0,mouse_button:'right',click_count:2})]);
 await assert.rejects(rpc(execute('launch_app',{app:'Editor'})),/unsupported/);
});
test('Sky responses carry complete app state and controls do not pollute calls',async()=>{
 const rpc=createBinderService();await rpc({type:'fixture',op:'configure',screenshot:false});
 assert.deepEqual(await rpc(execute('get_app_state',{app:'Editor',disableDiff:true})),{app:'com.fixture.Editor',text:'[0] text field "Fixture editor"',screenshot:null});
 const calls=await rpc(control('calls'));calls[0].args[0].app='mutated';
 assert.equal((await rpc(control('calls')))[0].args[0].app,'Editor');
 await rpc(control('reset'));assert.deepEqual(await rpc(control('calls')),[]);
 assert.match((await rpc(execute('get_app_state',{app:'Editor'}))).screenshot.url,/^data:image\/png;base64,/);
 await assert.rejects(rpc({type:'fixture',op:'unknown'}),/unsupported/);
});
test('double can reject a service call without swallowing its original payload',async()=>{
 const rpc=createBinderService();await rpc({type:'fixture',op:'configure',failMethod:'paste'});
 await assert.rejects(rpc(execute('paste',{app:'Editor',text:'synthetic',format:'html'})),/fixture service rejection/);
 assert.deepEqual(await rpc(control('calls')),[execute('paste',{app:'Editor',text:'synthetic',format:'html'})]);
});
test('binder cases cover the assigned macOS obligations at M3 and all have executable assertions',()=>{
 assert.equal(scenarios.length,27);validateRegistry(scenarios);
 assert.ok(scenarios.every(s=>s.backend==='binder-double'&&s.milestone==='M3'&&s.platforms.join()==='darwin'));
 for(const s of scenarios)assert.throws(()=>s.assert({results:s.cells.map(()=>({isError:false,content:[]}))}),undefined,s.id);
});
test('click oracle rejects a plausible call with lost button/count and rejects unsolicited output',()=>{
 const s=scenarios.find(s=>s.id==='api/target-app-decorated-tab/click');assert.ok(s);
 const report={values:['undefined','undefined','undefined'],calls:[execute('click',{app:'com.fixture.Editor',element_index:0}),execute('click',{app:'com.fixture.Editor',x:12,y:34}),{type:'tab',tab:'ax',method:'click',args:[0,{mouseButton:'right',clickCount:2}]}]};
 const results=[{isError:false,content:[]},{isError:false,content:[{type:'text',text:'BINDER_REPORT:'+JSON.stringify(report)}]}];
 assert.throws(()=>s.assert({results}));
});
test('all-settled inventory case keeps successes and reports native/global/per-browser failures',()=>{
 const s=scenarios.find(s=>s.id==='cells/facade/all-settled-inventory');assert.ok(s);
 assert.throws(()=>s.assert({results:[{isError:false,content:[]},{isError:false,content:[{type:'text',text:'BINDER_REPORT:'+JSON.stringify({values:[{apps:[],browsers:[]}],calls:[]})}]}]}));
});
test('inventory double rejects only the configured branch, preserving the other browser',async()=>{
 const rpc=createBinderService();await rpc({type:'fixture',op:'configure',browserFailure:'tabs'});
 const browsers=await rpc({type:'inventory',method:'list'});assert.equal(browsers.length,2);
 const tabs=await rpc({type:'inventory',method:'tabs',id:'fixture-good'});assert.equal(tabs[0].id,'fixture-good-tab');
 await assert.rejects(rpc({type:'inventory',method:'tabs',id:'fixture-broken'}),/fixture browser tabs rejection/);
});
test('click oracle accepts the complete wire witness and detects payload/output corruption',()=>{
 const s=scenarios.find(s=>s.id==='api/target-app-decorated-tab/click');
 const report={values:['undefined','undefined','undefined'],calls:[execute('click',{app:'com.fixture.Editor',element_index:0,mouse_button:'right',click_count:2}),execute('click',{app:'com.fixture.Editor',x:12,y:34}),{type:'tab',tab:'ax',method:'click',args:[0,{mouseButton:'right',clickCount:2}]}]};
 const result=()=>[{isError:false,content:[]},{isError:false,content:[{type:'text',text:'BINDER_REPORT:'+JSON.stringify(report)}]}];
 assert.deepEqual(s.assert({results:result()}),{ok:true});
 for(const change of [r=>{delete r[1].content[0];},r=>{r[1].content.push({type:'text',text:'unsolicited'});},r=>{r[1].content.push({type:'image',data:'bad',mimeType:'image/png'});},r=>{r[1].isError=true;}]){
  const results=result();change(results);assert.throws(()=>s.assert({results}));
 }
 report.calls[0].args[0].click_count=1;assert.throws(()=>s.assert({results:result()}));
});
test('all raw cells are syntactically valid and Unicode/newline input reaches the intended service payload',async()=>{
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 for(const s of scenarios)for(const c of s.cells)assert.doesNotThrow(()=>new AsyncFunction(c.code),`${s.id}/${c.label}`);
 const s=scenarios.find(s=>s.id==='api/app/typetext'),rpc=createBinderService(),content=[];
 // Only checks our generated cell's input, not any actual host/facade behavior.
 await new AsyncFunction('binderApp','nodeRepl',s.cells[1].code)({typeText:async text=>{await rpc(execute('type_text',{app:'com.fixture.Editor',text}));}},{rpc:(_service,r)=>rpc(r),write:text=>content.push({type:'text',text})});
 assert.deepEqual(s.assert({results:[{isError:false,content:[]},{isError:false,content}]}),{ok:true});
});
test('bootstrap imports the selected modules and puts doubles below the selected decorator',async()=>{
 const {binderBanner,binderServices}=await import('./fixtures/binder-bootstrap.mjs');
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {pathToFileURL}=await import('node:url');
 const dir=mkdtempSync(join(tmpdir(),'binder-unit-')),file=join(dir,'selected.mjs'),rpc=createBinderService();
 const globals=['cua','binderDisabledCua','binderTab','binderDomTab','binderBareTab','binderInventory'];
 const saved=globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 try{
  // A plain module double for testing fixture wiring, NOT the vendor runtime or an API parity subject.
  writeFileSync(file,`export const make=async options=>({options,...(options.computer===false?{}:{computer:{target:'mac'}})});
export const decorate=tab=>Object.assign(tab,{selectedDecorator:true});
export const collect=async input=>({target:input.computer.target,browsers:await input.browsers.list()});`);
  const url=pathToFileURL(file).href;
  assert.throws(()=>binderBanner({facadeURL:url,bindTabURL:url}),/explicit selected module file URLs/);
  const banner=binderBanner({facadeURL:url,bindTabURL:url,stateURL:url,facadeExport:'make',bindTabExport:'decorate',stateExport:'collect'});
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('nodeRepl',banner)({rpc:(_name,request)=>rpc(JSON.parse(JSON.stringify(request)))});
  assert.deepEqual(globalThis.cua.options,{browser:false});
  assert.deepEqual(globalThis.binderDisabledCua.options,{browser:false,computer:false});
  assert.equal(globalThis.binderTab.selectedDecorator,true);
  assert.equal(globalThis.binderDomTab.selectedDecorator,true);
  assert.equal(globalThis.binderBareTab.selectedDecorator,true);
  assert.ok((await globalThis.binderTab.ax.get('screenshot')) instanceof Uint8Array);
  assert.equal((await globalThis.binderInventory()).target,'mac');
  assert.equal((await globalThis.binderInventory()).browsers.length,2);
  const fixture=binderServices();assert.equal(fixture.services.sky,fixture.services.binder);await fixture.close();
 }finally{
  for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  rmSync(dir,{recursive:true,force:true});
 }
});
