// Independent oracle: readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/
// tinysky_alt/create_browser_api.js:26-289, create_tinysky_alt.js:16-141, get_state.js:6-58;
// browser client collection caching: oai_js_browser/dist/skill/scripts/browser-client.js:9769-10046.
// The real retained service and scratch Chrome page supply all observations; no owner tab text is emitted.
import assert from 'node:assert/strict';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
import {cellCode,parseCell} from '../../../scripts/browser-parity/runner.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c])),scenarios=[];
function add(id,code,expected=true,check){
 const p=plan.get(id);if(!p)throw new Error(id);
 scenarios.push({...p,backend:'chrome',browserCase:true,setup:{page:'/counter.html',open:'goto'},cells:[{label:'contract',code:cellCode({code})}],assert:({results})=>{
  assert.equal(results.length,1);assert.equal(results[0].isError,false);const result=parseCell(results[0]);assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.value,expected);check?.(results[0]);return {ok:true};
 }});
}
const state=`const value=await cua.getState({emit:false});return {apps:Array.isArray(value.apps)&&value.apps.length===0,browsers:Array.isArray(value.browsers),selected:value.browsers.some(b=>b.id===browser.browserId),errors:value.errors===undefined||Array.isArray(value.errors)&&value.errors.every(e=>typeof e==='string')};`;
add('api/cua/getstate',state,{apps:true,browsers:true,selected:true,errors:true});
add('api/cua/initialize',`const same=cua.initialize===cua.getState;const state=await cua.initialize({emit:false});return {same,apps:Array.isArray(state.apps),browsers:Array.isArray(state.browsers)};`,{same:true,apps:true,browsers:true});
add('api/cua/getbrowser',`const same=(await cua.getBrowser({id:browser.browserId})).browserId===browser.browserId;let message;try{await cua.getBrowser({id:browser.browserId,extensionInstanceId:'fixture'});}catch(e){message=e.message;}return {same,message};`,{same:true,message:'Specify either id or extensionInstanceId, not both.'});
const create=`const created=await cua.createBrowserTab(browser.browserId,fixtureURL+'/counter.html');const valid=typeof created.id==='string'&&(await created.title())==='Browser parity fixture';await created.close();return valid;`;
add('api/cua/createbrowsertab',create);
add('cells/facade/initial-tab-snapshot',create,true,result=>{const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');assert.ok(text.includes('Counter fixture')&&text.indexOf('Counter fixture')<text.indexOf('CUA_PARITY_RESULT'),'missing initial snapshot before returned tab');});
add('api/cua/gettab',`const found=await cua.getTab(tab.id,{browser:browser.browserId});let empty,url;try{await cua.getTab('');}catch(e){empty=e.message;}try{await cua.getTab({url:'relative'});}catch(e){url=e.message;}return {same:found.id===tab.id,empty,url};`,{same:true,empty:'getTab requires a tab reference',url:'getTab requires an absolute URL.'});
const browserInfo=`const entries=await cua.listBrowsers({emit:false});const b=entries.find(b=>b.id===browser.browserId);return !!b&&typeof b.id==='string'&&typeof b.name==='string'&&b.type==='extension'&&b.family==='chrome'&&typeof b.metadata.extensionInstanceId==='string';`;
add('api/cua/listbrowsers',browserInfo);
add('api/cua/listtabs',`const entries=await cua.listTabs({browser:browser.browserId,emit:false});const t=entries.find(t=>t.id===tab.id);return !!t&&t.browserId===browser.browserId&&typeof t.title==='string'&&new URL(t.url).pathname==='/counter.html';`);
add('api/cua/rewritedocumentation',`const result=await cua.rewriteDocumentation();return result===undefined;`,true,result=>{assert.ok(result.content.some(c=>c.type==='text'&&c.text.includes('# Selected Browser')));});
add('api/cua/browsers',`return cua.browsers===agent.browsers&&(await cua.browsers.get(browser.browserId)).browserId===browser.browserId;`);
add('api/browser-agent/browsers',`return (await agent.browsers.get(browser.browserId)).browserId===browser.browserId;`);
add('api/browser-agent/documentation',`const text=await agent.documentation.get('screenshots');return typeof text==='string'&&text.length>0;`);
add('api/browser-browsers/get',`const a=await agent.browsers.get(browser.browserId),b=await agent.browsers.get(browser.browserId);return {same:a===b,id:a.browserId===browser.browserId};`,{same:false,id:true});
add('api/browser-browsers/getdefault',`const b=await agent.browsers.getDefault();return typeof b.browserId==='string'&&(await agent.browsers.list()).some(v=>v.id===b.browserId);`);
add('api/browser-browsers/getforurl',`const b=await agent.browsers.getForUrl(fixtureURL+'/counter.html');return typeof b.browserId==='string'&&(await agent.browsers.list()).some(v=>v.id===b.browserId);`);
add('api/browser-browsers/list',`const entries=await agent.browsers.list();const b=entries.find(b=>b.id===browser.browserId);return !!b&&typeof b.name==='string'&&b.type==='extension';`);
add('api/browser-browser/browserid',`return typeof browser.browserId==='string'&&(await agent.browsers.list()).some(b=>b.id===browser.browserId);`);
add('api/browser-browser/capabilities',`const entries=await browser.capabilities.list();return Array.isArray(entries)&&entries.some(c=>c.id==='viewport')&&entries.every(c=>typeof c.id==='string'&&typeof c.description==='string');`);
add('api/browser-browser/tabs',`const tabs=await browser.tabs.list();return Array.isArray(tabs)&&tabs.some(t=>t.id===tab.id);`);
add('api/browser-browser/documentation',`const text=await browser.documentation();return text.startsWith('# Selected Browser\\n')&&text.includes('- ID: '+browser.browserId)&&text.includes('cua browser service ')&&text.includes('# API Reference');`);
add('api/browser-browser/namesession',`const result=await browser.nameSession('repl-api-named');return result===undefined&&(await browser.tabs.list()).some(t=>t.id===tab.id);`);
export default scenarios;
