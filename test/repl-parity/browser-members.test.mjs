import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseModule} from 'meriyah';
import scenarios from './scenarios/browser-members.mjs';
import {caseSchedule,validateRegistry} from '../../scripts/repl-parity/registry.mjs';
import {parseCell,RESULT_MARKER} from '../../scripts/browser-parity/runner.mjs';
import {startFixture} from '../browser-parity/fixture/serve.mjs';

const boundaryMembers=new Set(['api/browser-playwrightapi/elementinfo','api/browser-playwrightapi/elementscreenshot','api/browser-cuaapi/downloadmedia','api/browser-domcuaapi/downloadmedia','api/browser-beforeunloaddialog/type','api/browser-beforeunloaddialog/dismiss']);
const raw=(value,{ok=true,error,images=[]}={})=>({content:[...images,{type:'text',text:RESULT_MARKER+JSON.stringify(ok?{ok,value,$imageCount:images.length}:{ok,error})}]});
const find=tail=>{const value=scenarios.find(s=>s.id===`api/browser-${tail}`);assert.ok(value,tail);return value;};
const invoke=(tail,results,fixtureState={counter:0,events:[]})=>find(tail).assert({results,fixtureState,service:'cua'});

test('every assigned browser member has a scheduled Chrome oracle, without stealing facade or hidden cases',()=>{
 const assigned=caseSchedule().filter(c=>c.id.startsWith('api/browser-')&&!/^api\/browser-(agent|browsers|browser)\//.test(c.id)&&!boundaryMembers.has(c.id));
 assert.deepEqual(scenarios.map(s=>s.id).sort(),assigned.map(c=>c.id).sort());
 validateRegistry(scenarios);
 for(const s of scenarios){
  const due=assigned.find(c=>c.id===s.id);
  assert.deepEqual(s.contracts,due.contracts,s.id);
  assert.equal(s.backend,'chrome');assert.equal(s.browserCase,true);
  assert.ok(s.setup.page);assert.deepEqual(typeof s.setup.state,'object');
  assert.ok(s.witnessCells.length);assert.ok(s.witnessCells.every(label=>s.cells.some(c=>c.label===label)),s.id);
  for(const cell of s.cells){assert.equal(cell.op,undefined,s.id);assert.ok(cell.raw,s.id);parseModule(cell.code,{next:true});}
 }
});

test('adapted corpus oracle consumes raw MCP envelopes and still rejects missing browser side effects',async()=>{
 const values=['alpha',{before:0,after:5,value:'alpha beta'},'b',true,true];
 const results=values.map(v=>raw(v));
 const state={events:[{text:'alpha'},{text:'alpha beta'},{selected:'b'},{checked:true},{click:true}]};
 const before=structuredClone(results);
 assert.equal((await invoke('playwrightlocator/fill',results,state)).ok,true);
 assert.equal((await invoke('playwrightlocator/fill',results,{events:[]})).ok,false);
 results[0]=raw('not filled');assert.equal((await invoke('playwrightlocator/fill',results,state)).ok,false);
 assert.equal((await invoke('playwrightlocator/fill',before.slice(1),state)).ok,false);
 assert.deepEqual(before,values.map(v=>raw(v)));
});

test('MCP tool errors and a missing result marker cannot become passing browser assertions',async()=>{
 const s=find('playwrightapi/evaluate');
 for(const results of [[{isError:true,content:[{type:'text',text:'backend unavailable'}]}],[{content:[{type:'text',text:'42'}]}],[]]){
  assert.equal((await s.assert({results,fixtureState:{events:[]},service:'cua'})).ok,false);
 }
});

test('host-rejection ContentAPI cases verify actual domain and format errors rather than accepting any failure',async()=>{
 const error=message=>raw(undefined,{ok:false,error:{code:'Error',message}});
 const results=[error('Tab is not a Google Workspace document'),error('Tab is not a supported YouTube watch page'),error('tab_content_export_gsuite requires supported format')];
 assert.equal((await invoke('contentapi/exportgsuite',results)).ok,true);
 assert.equal((await invoke('contentapi/exportyoutubetranscript',results)).ok,true);
 for(let i=0;i<results.length;i++){const broken=results.slice();broken[i]=error('method not implemented');assert.equal((await invoke('contentapi/exportgsuite',broken)).ok,false);}
});

test('screenshot raw cells emit an actual MCP image and leave the image bytes and marker unchanged',async()=>{
 const s=find('tab/screenshot');assert.equal(s.imageMode,'live');
 const bytes=readFileSync(new URL('./fixtures/pattern.jpeg',import.meta.url));
 const {raw:result,parsed}=await runCell(s.cells[0],{tab:{screenshot:async()=>bytes}});
 assert.equal(parsed.ok,true);assert.deepEqual(result.content[0],{type:'image',mimeType:'image/jpeg',data:bytes.toString('base64')});
 const before=structuredClone(result);
 assert.equal((await s.assert({results:[result],fixtureState:{events:[]},service:'cua'})).ok,true);
 assert.deepEqual(result,before);
 assert.equal((await s.assert({results:[raw({$imageIndex:0},{images:[]})],fixtureState:{events:[]},service:'cua'})).ok,false);
});

test('new member fixture routes serve scoped selectors, nested frames and a browser-owned unload handler',async()=>{
 const fixture=await startFixture({port:0});
 try{
  for(const page of ['/repl-members.html','/repl-member-frame.html','/repl-member-inner.html','/repl-beforeunload.html','/repl-dialogs.html']){
   const response=await fetch(fixture.url+page);assert.equal(response.status,200,page);const html=await response.text();assert.ok(html.includes('<title>Browser parity fixture</title>'));
  }
  const page=await (await fetch(fixture.url+'/repl-members.html')).text();
  assert.ok(page.includes('data-testid="member-input"'));assert.ok(page.includes('placeholder="Member placeholder"'));assert.ok(page.includes('/repl-member-frame.html'));
  const frame=await (await fetch(fixture.url+'/repl-member-frame.html')).text();assert.ok(frame.includes('/repl-member-inner.html'));
  const unload=await (await fetch(fixture.url+'/repl-beforeunload.html')).text();assert.ok(unload.includes('onbeforeunload'));
 }finally{await fixture.close();}
});

// Exercise the actual raw envelope, not a reimplementation of its RESULT_MARKER transport.
async function runCell(cell,globals={}){
 const content=[];
 const context=vm.createContext({...globals,URL,console:{log(){}},setTimeout,Date,nodeRepl:{write:text=>content.push({type:'text',text}),emitImage:async bytes=>content.push({type:'image',mimeType:bytes[0]===255?'image/jpeg':'image/png',data:Buffer.from(bytes).toString('base64')})}});
 await vm.runInContext(`(async()=>{${cell.code}\n})()`,context,{timeout:1000});
 return {raw:{content},parsed:parseCell({content})};
}

test('scoped locator cases use the member result, not merely successful handle construction',async()=>{
 const s=find('playwrightlocator/getbyplaceholder');
 const exercise=s.cells.find(c=>c.label===s.witnessCells[0]);
 const calls=[];
 const tab={playwright:{locator:selector=>{calls.push(selector);return {getByPlaceholder:placeholder=>{calls.push(placeholder);return {getAttribute:async attr=>{calls.push(attr);return 'scoped-input';}};}};}}};
 const result=await runCell(exercise,{tab});
 assert.deepEqual(calls,['#scope','Member placeholder','id']);assert.equal(result.parsed.value,'scoped-input');
});

test('prompt cancellation expects the fixture DOM empty string and an acknowledged null browser result',async()=>{
 const results=[raw(true),raw({type:'prompt',result:'',cleared:true})];
 assert.equal((await invoke('promptdialog/dismiss',results,{events:[{dialog:'prompt',result:null}]})).ok,true);
 assert.equal((await invoke('promptdialog/dismiss',results,{events:[]})).ok,false);
 assert.equal((await invoke('promptdialog/dismiss',[raw(true),raw({type:'prompt',result:'null',cleared:true})],{events:[{dialog:'prompt',result:null}]})).ok,false);
});


test('every member oracle rejects an inert browser outcome even if all MCP cells succeed',async()=>{
 for(const scenario of scenarios){
  const results=scenario.cells.map(()=>raw(null));
  assert.equal((await scenario.assert({results,fixtureState:{counter:0,events:[]},service:'cua'})).ok,false,scenario.id);
 }
});

test('new selector outcomes reject every wrong scoped result and require all frame observations',async()=>{
 const values=['scoped-input','scoped-input','member-button','scoped-input','Scoped Alpha',
  'scoped-input','scoped-input','member-button','scoped-input','Scoped Beta',['Scoped Alpha','Scoped Beta'],
  'frame-input','frame-input','member-button','frame-input','Frame Alpha','Frame Alpha','Nested member fixture'];
 const results=values.map(v=>raw(v));
 assert.equal((await invoke('playwrightframelocator/framelocator',results)).ok,true);
 for(let i=0;i<results.length;i++){const broken=results.slice();broken[i]=raw('outside');assert.equal((await invoke('playwrightframelocator/framelocator',broken)).ok,false,find('playwrightframelocator/framelocator').cells[i].label);}
 assert.equal((await invoke('playwrightframelocator/framelocator',results.slice(0,-1))).ok,false);
});

test('getJsDialog verifies real beforeunload autoaccepted navigation rather than cancellation of the old page',async()=>{
 const results=[raw(true),raw({type:'alert',result:'closed',cleared:true}),raw(true),raw(true),raw({path:'/counter.html',query:'?left=1'}),raw({cleared:true,fixture:'Counter fixture'})];
 const state={events:[{dialog:'alert',result:'closed'},{armed:true}]};
 assert.equal((await invoke('tab/getjsdialog',results,state)).ok,true);
 const wrong=results.slice();wrong[4]=raw({path:'/repl-beforeunload.html',query:''});
 assert.equal((await invoke('tab/getjsdialog',wrong,state)).ok,false);
 const stillOpen=results.slice();stillOpen[5]=raw({cleared:false,fixture:'Counter fixture'});
 assert.equal((await invoke('tab/getjsdialog',stillOpen,state)).ok,false);
 assert.equal((await invoke('tab/getjsdialog',results,{events:[{dialog:'alert',result:'closed'}]})).ok,false);
});

test('autoaccept supplement arms navigation before triggering unload and reads only the destination fixture',async()=>{
 const s=find('tab/getjsdialog'),calls=[];let url='http://fixture/repl-beforeunload.html',arrived;
 const tab={
  playwright:{waitForURL:(target,options)=>{calls.push(['wait',target,options.waitUntil]);return new Promise(resolve=>{arrived=resolve;});},locator:selector=>({
   click:async()=>{calls.push(['click',selector]);if(selector!=='#leave')throw new Error('unexpected trigger');url='http://fixture/counter.html?left=1';arrived();},
   textContent:async()=>{calls.push(['read',selector]);if(selector!=='#value')throw new Error('old document no longer exists');return 'Counter fixture';},
  })},url:async()=>url,getJsDialog:async()=>undefined,
 };
 const navigation=await runCell(s.cells.find(c=>c.label==='navigation'),{tab,fixtureURL:'http://fixture'});
 const outcome=await runCell(s.cells.find(c=>c.label==='autoaccepted'),{tab});
 assert.deepEqual(navigation.parsed,{ok:true,value:{path:'/counter.html',query:'?left=1'}});
 assert.deepEqual(outcome.parsed,{ok:true,value:{cleared:true,fixture:'Counter fixture'}});
 assert.deepEqual(calls,[['wait','http://fixture/counter.html?left=1','load'],['click','#leave'],['read','#value']]);
});
