import {cleanupBrowserDownload} from './download-cleanup.mjs';
import {fixtureJson} from './fixture-http.mjs';
import {cellCode,parseCell} from '../browser-parity/runner.mjs';
import {runRawScenario} from './runner.mjs';
export async function runBrowserApiScenario(scenario,{client,fixture,instanceId,host,checkout,emit,profiles,prepared,pendingCells=[]}) {
 const replaceCode=code=>code.replaceAll('@@INSTANCE_ID@@',instanceId);
 if(!scenario.browserCase)return runRawScenario(scenario,{client,checkout,emit,replaceCode,profiles,context:{host}});
 await fixtureJson(fixture.url+'/reset',{method:'POST',body:JSON.stringify(scenario.setup?.state??{})});
 await client.call('js_reset');
 const page=new URL(scenario.setup?.page??'/counter.html',fixture.browserURL+'/').href;
 const open=scenario.setup?.open??'goto';
 if(!['goto','createBrowserTab'].includes(open))throw new Error('Unknown API browser setup');
 const opening=open==='createBrowserTab'?`globalThis.tab=await cua.createBrowserTab(browser.browserId,${JSON.stringify(page)});`:`globalThis.tab=await browser.tabs.new();await tab.goto(${JSON.stringify(page)});`;
 const setup=`globalThis.fixtureURL=${JSON.stringify(fixture.browserURL)};globalThis.browser=await cua.getBrowser({extensionInstanceId:${JSON.stringify(instanceId)}});await browser.nameSession('repl-api');${opening}`;
 const ready=parseCell(await client.call('js',{code:cellCode({code:setup}),title:'API fixture setup',timeout_ms:60000}));
 if(!ready.ok)throw new Error(`Browser API setup failed: ${ready.error.message}`);
 try{const assertion=await runRawScenario(scenario,{client,checkout,emit,reset:false,replaceCode,context:{host,pendingCells,service:'cua',getFixtureState:()=>fixtureJson(fixture.url+'/state')}});if(assertion.ok&&scenario.cleanupDownload)await cleanupBrowserDownload({client,prepared});return assertion;}
 finally{const end=await client.call('end_task');if(end.isError)throw new Error('Browser API fixture cleanup failed');}
}
