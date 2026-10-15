import {test} from 'node:test';
import assert from 'node:assert/strict';
import scenarios from './scenarios/docs-profiles.mjs';
import {caseSchedule,validateRegistry} from '../../scripts/repl-parity/registry.mjs';
import {coreDocument,auxiliary} from '../../scripts/repl-parity/docs-oracle.mjs';
const DONE='DOCS_DONE';
const selected='# Selected Browser\n- Name: Fixture\n- Type: extension\n- ID: fixture-browser\n- Service: cua browser service 0.1.0\nReuse this browser binding across later turns. A new user turn or tab error does not invalidate it; select another browser only when the browser-selection policy requires it.\nIf a tab is stale or missing later, obtain or create a fresh tab from this browser; never reselect a browser to recover a tab. Empty tab lists are normal after cleanup and do not invalidate this browser binding.\n\n# Additional Documentation\nUse `await agent.documentation.get("<name>")` when you need one of these topics:\n- `fixture`: Fixture topic\n\n# Additional Capabilities\n## Browser Capabilities\n- None\n## Tab Capabilities\n- None\n\n# API Reference\n\nUse this as the supported `agent.browsers.*` surface.\n\n```ts\n// Returned by setupBrowserRuntime().\n// browser was selected during bootstrap.\ninterface Browser {}\n```\n';
const browser=auxiliary+'\n\n'+selected;
const reply=(...texts)=>({isError:false,content:texts.map(text=>({type:'text',text}))});
const one=tail=>scenarios.find(s=>s.id===`cells/documentation/${tail}`);
const run=(tail,results,extra={})=>one(tail).assert({results,host:'cua',...extra});
const core=coreDocument({host:'cua'});
test('every scheduled documentation/profile obligation has an executable scenario',()=>{
 const due=caseSchedule().filter(c=>/^cells\/(documentation|profiles)\//.test(c.id));
 assert.deepEqual(scenarios.map(c=>c.id).sort(),due.map(c=>c.id).sort());assert.equal(validateRegistry(scenarios).length,12);
 for(const scenario of scenarios){assert.equal(scenario.backend,'chrome');assert.ok(scenario.cells.length);}
});
test('first-call assertion rejects altered core or policy bytes, missing policy and reordered named outputs',()=>{
 assert.deepEqual(run('first-call-core-policy-bytes',[reply(core,DONE)]),{ok:true});
 for(const texts of [[core.replace('purpose-built','generic'),DONE],[core.split('Computer Use Confirmations Policy')[0],DONE],[DONE,core],[core,DONE,'extra']])assert.throws(()=>run('first-call-core-policy-bytes',[reply(...texts)]));
 assert.throws(()=>run('first-call-core-policy-bytes',[reply(core,DONE)],{host:undefined}));
});
test('browser docs precede state and retained auxiliary; no owner tab data is accepted in state',()=>{
 const state=JSON.stringify([{id:'fixture-browser',name:'Fixture',type:'extension',family:'chrome',metadata:{extensionInstanceId:'fixture'}}]);
 const good=reply(core,browser,state,DONE);assert.deepEqual(run('browser-docs-before-state',[good]),{ok:true});
 for(const texts of [[core,state,browser,DONE],[core,selected,state,DONE],[core,browser.replace('Reuse this browser binding','Discard this browser binding'),state,DONE],[core,browser,JSON.stringify([{id:'fixture-browser',title:'private',url:'https://private.invalid'}]),DONE]])assert.throws(()=>run('browser-docs-before-state',[reply(...texts)]));
});
test('emit:false keeps complete first-use docs but suppresses state',()=>{
 assert.deepEqual(run('emit-false-keeps-first-use-docs',[reply(core,browser,DONE)]),{ok:true});
 assert.throws(()=>run('emit-false-keeps-first-use-docs',[reply(core,browser,'[]',DONE)]));
 assert.throws(()=>run('emit-false-keeps-first-use-docs',[reply(core,DONE)]));
});
test('once and rewrite assertions reject duplicate, uncached, or missing documents',()=>{
 const cases=[['core-once',[reply(core,DONE),reply(DONE)]],['browser-once',[reply(core,browser,DONE),reply(DONE)]],['rewrite-cached-order',[reply(core,browser,DONE),reply(core,browser,DONE)]],['rewrite-same-request-meta-suppressed',[reply(core,browser,DONE)]],['rewrite-later-request-meta',[reply(core,browser,DONE),reply(core,browser,DONE),reply(core,browser,DONE)]]];
 for(const [tail,results] of cases){assert.deepEqual(run(tail,results),{ok:true},tail);const wrong=structuredClone(results);wrong.at(-1).content.splice(0,0,{type:'text',text:core});assert.throws(()=>run(tail,wrong),tail);}
 const changed=[reply(core,browser,DONE),reply(core,browser.replace('Fixture topic','Changed topic'),DONE)];assert.throws(()=>run('rewrite-cached-order',changed));
});
test('timeout/reset require fresh complete bootstrap instead of merely a usable cell',()=>{
 const good=[reply(core,browser,DONE),reply('reset'),reply(core,browser,DONE),{isError:true,content:[{type:'text',text:'JavaScript execution timed out'}]},reply(core,browser,DONE)];
 assert.deepEqual(run('reset-timeout-fresh-bootstrap',good),{ok:true});
 const wrong=structuredClone(good);wrong[4]=reply(DONE);assert.throws(()=>run('reset-timeout-fresh-bootstrap',wrong));
 const noTimeout=structuredClone(good);noTimeout[3].isError=false;assert.throws(()=>run('reset-timeout-fresh-bootstrap',noTimeout));
});
test('confirmations cover valid UTF-8 limits, rejected shapes, and a later override cannot change cached core',()=>{
 const scenario=one('confirmations-policy-override');
 const results=scenario.cells.map(cell=>cell.op==='reset'?reply('reset'):reply(coreDocument({host:'cua',requestMeta:cell.requestMeta}),DONE));
 // The last cell rewrites the cached first-call document, despite a different valid host override.
 results[results.length-1]=results[results.length-2];
 assert.deepEqual(scenario.assert({results,host:'cua'}),{ok:true});
 const wrong=structuredClone(results);wrong.at(-1).content[0].text=coreDocument({host:'cua',requestMeta:scenario.cells.at(-1).requestMeta});assert.throws(()=>scenario.assert({results:wrong,host:'cua'}));
});
test('auxiliary document is byte-exact and profiles need bounded-host proof, not proxy metadata',()=>{
 assert.deepEqual(run('auxiliary-other-browser-apis',[reply(core,browser,DONE),reply(core,browser,DONE)]),{ok:true});
 assert.throws(()=>run('auxiliary-other-browser-apis',[reply(core,browser.replace('Short tasks','Any tasks'),DONE),reply(core,browser,DONE)]));
 const profile=scenarios.find(s=>s.id.startsWith('cells/profiles/'));
 const result={isError:false,content:[{type:'text',text:JSON.stringify({status:'ok',profiles:[{key:'fixture',ready:true,extensionInstanceId:'fixture'}]})}],structuredContent:{status:'ok',profiles:[{key:'fixture',ready:true,extensionInstanceId:'fixture'}]}};
 const observation={serverInfo:{name:'cua-repl-host',version:'0.1.0'},_meta:{'cua/replHost':{host:'cua',version:'0.1.0'}},executionFacts:{ownNode:{path:'/fixture/node',version:'v24.0.0'}},backends:[{family:'chrome',instanceId:'fixture',profileName:'Fixture',tabCount:null}],tabCounts:false,teardown:{confirmed:true}};
 assert.deepEqual(profile.assert({results:[{result,observation}],host:'cua'}),{ok:true});
 assert.throws(()=>profile.assert({results:[{result}],host:'cua'}));
 const wrong=structuredClone(result);wrong.structuredContent.profiles[0].extensionInstanceId='not-observed';assert.throws(()=>profile.assert({results:[{result:wrong,observation}],host:'cua'}));
});
