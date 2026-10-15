import test from 'node:test';
import assert from 'node:assert/strict';
import scenarios from './scenarios/index.mjs';
import {selectScenarios,caseSchedule,inventory} from '../../scripts/repl-parity/registry.mjs';
import {apiCommand} from '../../scripts/repl-parity/api-lanes.mjs';
import {documentComparisonRun} from '../../scripts/repl-parity/document-comparison.mjs';
import {coreDocument} from '../../scripts/repl-parity/docs-oracle.mjs';
test('M3 API and document stage fails closed on every missing due case',()=>{
 for(const suite of ['api','docs-profiles']){
  const selected=selectScenarios(scenarios,inventory,{suite,through:'M3',platform:'darwin'}).scenarios;
  assert.ok(selected.length>0);
  for(const scenario of selected)assert.throws(()=>selectScenarios(scenarios.filter(s=>s!==scenario),inventory,{suite,through:'M3',platform:'darwin'}),/missing executable/);
 }
 const pending=selectScenarios(scenarios,inventory,{suite:'all',through:'M3',platform:'darwin'}).pending;
 assert.ok(pending.every(p=>p.milestone>'M3'));
});
test('API command is remote-only, selected-host bound and browser-only',()=>{
 assert.throws(()=>apiCommand({device:'local',host:'vendor'}),/remote/);
 const command=apiCommand({device:'mini',checkout:'/fixture/clone',home:'/fixture/home',host:'vendor',commit:'fixture'},{lane:'profiles'});
 assert.equal(command.command,'ssh');assert.deepEqual(command.args.slice(0,3),['-o','BatchMode=yes','mini']);
 assert.match(command.args.at(-1),/CUA_REPL_HOST='vendor'/);assert.match(command.args.at(-1),/CUA_SHIM_SURFACES=browser/);assert.match(command.args.at(-1),/serve-profiles/);
});
test('Table 3 transforms only explicit document-producing slots and leaves arbitrary cell bytes exact',()=>{
 const text=coreDocument({host:'vendor'}),own=coreDocument({host:'cua'}),row={case:'api/cua/rewritedocumentation',cell:'contract',ok:true,content:[{type:'text',text}]};
 const run=rows=>documentComparisonRun({meta:{host:'vendor'},rows}).rows;
 assert.equal(run([row])[0].content[0].text,own);
 assert.deepEqual(run([{...row,cell:'arbitrary'}]),[{...row,cell:'arbitrary'}]);
 assert.deepEqual(run([{...row,case:'api/cua/getstate'}]),[{...row,case:'api/cua/getstate'}]);
 assert.equal(run([{...row,content:[{type:'text',text:text.replace('Computer Use','CHANGED')}]}])[0].content[0].text.includes('CHANGED'),true);
});
test('native-paired API doubles are macOS-only; Linux native coverage remains mandatory at M4',()=>{
 const plan=new Map(caseSchedule().map(c=>[c.id,c]));
 assert.deepEqual(plan.get('api/cua/getapp').platforms,['darwin']);
 assert.deepEqual(plan.get('native/cua/getapp').platforms,['linux']);
 const row=inventory.find(r=>r.id==='member/cua/getapp');
 const stub=id=>({...plan.get(id),backend:id.startsWith('native/')?'native':'binder-double',cells:[{label:'call',code:'void 0;'}],assert:()=>({ok:true})});
 assert.equal(selectScenarios([stub('api/cua/getapp')],[row],{suite:'all',through:'M3',platform:'linux'}).scenarios.length,0);
 assert.throws(()=>selectScenarios([stub('api/cua/getapp')],[row],{suite:'all',through:'M4',platform:'linux'}),/native\/cua\/getapp/);
 assert.equal(selectScenarios([stub('native/cua/getapp')],[row],{suite:'all',through:'M4',platform:'linux'}).scenarios.length,1);
 assert.throws(()=>selectScenarios([stub('native/cua/getapp')],[row],{suite:'all',through:'M3',platform:'darwin'}),/api\/cua\/getapp/);
});
test('Linux M3 includes shared live-browser behavior and never requires a macOS native binder',()=>{
 const selected=selectScenarios(scenarios,inventory,{suite:'all',through:'M3',platform:'linux'}).scenarios;
 assert.ok(!selected.some(s=>s.id==='api/cua/getapp'));
 for(const id of ['api/decorated-tab/paste','api/decorated-tab/presskey','api/decorated-tab/typetext','cells/facade/emit-false-screenshot'])assert.equal(selected.find(s=>s.id===id)?.backend,'chrome');
 assert.throws(()=>selectScenarios(scenarios,inventory,{suite:'all',through:'M4',platform:'linux'}),/native\/cua\/getapp/);
});
test('live api suite cannot pad its coverage with fake secret-store unit cases',()=>{
 const api=selectScenarios(scenarios,inventory,{suite:'api',through:'M3',platform:'darwin'}).scenarios;
 assert.ok(api.every(s=>/^(api|hidden|capability-host)\//.test(s.id)||s.id.startsWith('cells/facade/')));
 const secrets=selectScenarios(scenarios,inventory,{suite:'secrets',through:'M3',platform:'darwin'}).scenarios;
 assert.ok(secrets.some(s=>s.backend==='secret-double'));assert.ok(secrets.every(s=>s.id.startsWith('secrets/')));
});
