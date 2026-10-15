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
