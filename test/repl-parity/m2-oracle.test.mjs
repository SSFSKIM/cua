import {test} from 'node:test';
import assert from 'node:assert/strict';
import scenarios from './scenarios/index.mjs';
import {selectScenarios,caseSchedule} from '../../scripts/repl-parity/registry.mjs';
import {noServicesLaunch} from './serve-cells.mjs';
import {serveCommand,localCuaServeCommand} from '../../scripts/browser-parity/topology.mjs';

test('the M2 stage gate has an executable independent oracle for every due case',()=>{
 for(const platform of ['darwin','linux']){
  const selected=selectScenarios(scenarios,undefined,{suite:'cells',through:'M2',platform});
  for(const row of caseSchedule().filter(r=>r.milestone==='M2'&&r.platforms.includes(platform)))assert.ok(selected.scenarios.some(s=>s.id===row.id),row.id);
 }
 for(const id of ['secrets/browser/errors/worker-rejection-message-only','secrets/native/errors/worker-rejection-message-only'])assert.equal(scenarios.find(s=>s.id===id)?.backend,'fixture-services');
});
test('fixture service opt-in enables only isolated trusted services on each host',()=>{
 for(const host of ['vendor','cua']){
  const prefix=host==='vendor'?'NODE_REPL':'CUA_REPL';
  const result=noServicesLaunch({command:'/node',args:[],env:{CUA_REPL_NODE_REPL_PATH:'/vendor',SKY_SECRET:'not-inherited',CUA_BROWSER_SERVICE:'cua'}},{host,fixtureServices:{services:{fixture:'/trusted/service.mjs'},roots:['/trusted'],env:{PARITY_FIXTURE:'yes'}}});
  assert.deepEqual(JSON.parse(result.env[`${prefix}_TRUSTED_SERVICES`]),{fixture:'/trusted/service.mjs'});
  assert.equal(result.env[`${prefix}_TRUSTED_RPC_ENABLED`],'1');assert.equal(result.env[`${prefix}_TRUSTED_CODE_PATHS`],'/trusted');
  assert.equal(result.env.PARITY_FIXTURE,'yes');assert.equal(result.env.SKY_SECRET,undefined);
 }
});
test('browser host selector is independent from service and explicit in every launch',()=>{
 for(const replHost of ['vendor','cua'])for(const service of ['vendor','cua']){
  const remote=serveCommand({device:'mini',service,replHost,home:'/scratch',checkout:'/repo'});
  assert.match(remote.args.at(-1),new RegExp(`CUA_REPL_HOST='${replHost}'`));
  const local=localCuaServeCommand({service,replHost,home:'/scratch',userHome:'/scratch/home'},{});
  assert.equal(local.env.CUA_REPL_HOST,replHost);assert.equal(local.env.CUA_BROWSER_SERVICE,service);
 }
 assert.throws(()=>serveCommand({device:'mini',service:'cua',replHost:'other'}),/host/i);
});
