import {cellCode,parseCell} from '../browser-parity/runner.mjs';
import {runRawScenario} from './runner.mjs';
export async function runBrowserApiScenario(scenario,{client,fixture,instanceId,host,checkout,emit,profiles}) {
 const replaceCode=code=>code.replaceAll('@@INSTANCE_ID@@',instanceId);
 if(!scenario.browserCase)return runRawScenario(scenario,{client,checkout,emit,replaceCode,profiles,context:{host}});
 const reset=await fetch(fixture.url+'/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(scenario.setup?.state??{})});
 if(!reset.ok)throw new Error('Browser fixture reset failed');
 await client.call('js_reset');
 const page=new URL(scenario.setup?.page??'/counter.html',fixture.browserURL+'/').href;
 const open=scenario.setup?.open??'goto';
 if(!['goto','createBrowserTab'].includes(open))throw new Error('Unknown API browser setup');
 const opening=open==='createBrowserTab'?`globalThis.tab=await cua.createBrowserTab(browser.browserId,${JSON.stringify(page)});`:`globalThis.tab=await browser.tabs.new();await tab.goto(${JSON.stringify(page)});`;
 const setup=`globalThis.fixtureURL=${JSON.stringify(fixture.browserURL)};globalThis.browser=await cua.getBrowser({extensionInstanceId:${JSON.stringify(instanceId)}});await browser.nameSession('repl-api');${opening}`;
 const ready=parseCell(await client.call('js',{code:cellCode({code:setup}),title:'API fixture setup',timeout_ms:60000}));
 if(!ready.ok)throw new Error(`Browser API setup failed: ${ready.error.message}`);
 try{return await runRawScenario(scenario,{client,checkout,emit,reset:false,replaceCode,context:{host,service:'cua',getFixtureState:async()=>{const response=await fetch(fixture.url+'/state');if(!response.ok)throw new Error('Browser fixture state failed');return response.json();}}});}
 finally{const end=await client.call('end_task');if(end.isError)throw new Error('Browser API fixture cleanup failed');}
}
