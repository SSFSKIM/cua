import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runScenario} from '../../scripts/browser-parity/runner.mjs';
import {startFixture} from './fixture/serve.mjs';
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const effect=/^(create_tab|close_tab|mark_tab|name_session|navigate_tab_|browser_user_claim_tab|browser_viewport_|browser_visibility_|browser_management_|tab_manual_handoff|cua_|dom_cua_(?!get_visible_dom)|playwright_evaluate|playwright_locator_(click|dblclick|download_media|fill|press|select_option|set_checked|wait_for)|playwright_wait_for_|playwright_file_chooser_set_files|tab_clipboard_write|tab_handle_js_dialog|tab_browser_auth_handoff|tab_content_export|tab_page_assets_bundle|webmcp_invoke_tool)/;
function noopClient() {
  const noop=async()=>undefined;
  const locator=new Proxy({}, {get:(_,key)=>key==='then'?undefined:['first','nth','locator','getByRole','getByText'].includes(key)?()=>locator:key==='all'?async()=>[]:noop});
  const tab=new Proxy({id:'owned',playwright:new Proxy({locator:()=>locator,getByText:()=>locator,getByRole:()=>locator,frameLocator:()=>({locator:()=>locator})},{get:(t,k)=>k in t?t[k]:noop}),cua:new Proxy({},{get:()=>noop}),dom_cua:new Proxy({},{get:()=>noop}),clipboard:new Proxy({},{get:()=>noop}),content:new Proxy({},{get:()=>noop}),capabilities:{list:async()=>[],get:noop}},{get:(t,k)=>k==='then'?undefined:k in t?t[k]:noop});
  const browser={browserId:'fixture-browser',nameSession:noop,tabs:new Proxy({},{get:()=>noop}),user:new Proxy({},{get:()=>noop}),capabilities:{get:noop,list:async()=>[]},documentation:noop,history:noop};
  let content=[];
  const context=vm.createContext({setTimeout,clearTimeout,URL,Date,performance,console,nodeRepl:{write:text=>content.push({type:'text',text})},cua:{getBrowser:async()=>browser,createBrowserTab:async()=>tab,listBrowsers:noop,browsers:{getDefault:noop,getForUrl:noop}}});
  return {async call(name,args={}) {if(name==='end_task')return {content:[],structuredContent:{ended:true}};content=[];await vm.runInContext(`(async()=>{${args.code}\n})()`,context);return {content};},async close(){}};
}
test('every executable mutation/wait case rejects an inert service through the real scenario runner',async t=>{
  const fixture=await startFixture({port:0});t.after(()=>fixture.close());
  const scenarios=await Promise.all(walk(join(import.meta.dirname,'scenarios')).map(async p=>(await import(pathToFileURL(p))).default));
  const selected=scenarios.filter(s=>!s.skip&&s.commands.some(type=>effect.test(type)&&!s.disabledAssertions?.includes(type)));
  for(const id of ['waits/page','capabilities/cursor','input/coordinates','input/dom','tabs/navigation'])assert.ok(selected.some(s=>s.id===id),id);
  for(const scenario of selected)await t.test(scenario.id,async()=>{
    const result=await runScenario(scenario,{client:noopClient(),service:'vendor',fixtureURL:fixture.url,instanceId:'fake',emit:()=>{}});
    assert.equal(result.assertion.ok,false,`${scenario.id} accepts a no-op service`);
  });
});
