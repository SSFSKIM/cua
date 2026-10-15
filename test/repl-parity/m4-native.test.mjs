import {test} from 'node:test';
import assert from 'node:assert/strict';
import scenarios from './scenarios/index.mjs';
import {caseSchedule} from '../../scripts/repl-parity/registry.mjs';
test('every Linux native contract has an executable real native case and rejects a failed observation',()=>{
 for(const entry of caseSchedule().filter(c=>c.id.startsWith('native/'))){
  const scenario=scenarios.find(s=>s.id===entry.id);assert.ok(scenario,`missing ${entry.id}`);
  assert.equal(scenario.backend,'native');assert.deepEqual(scenario.platforms,['linux']);
  assert.throws(()=>scenario.assert({results:scenario.cells.map(()=>({isError:false,content:[{type:'text',text:'NATIVE:{"verified":false}'}]}))}));
 }
});

test('native lane refuses local or macOS execution and assigns unique owned window names',async()=>{
 const {nativeCommand}=await import('../../scripts/repl-parity/native.mjs');
 const facts={device:'cua-linux',platform:'linux',host:'vendor',checkout:'/fixture',home:'/runtime'};
 assert.throws(()=>nativeCommand({...facts,device:'local'}));assert.throws(()=>nativeCommand({...facts,platform:'darwin'}));
 const a=nativeCommand(facts),b=nativeCommand(facts);assert.notEqual(a.nativeFilename,b.nativeFilename);assert.match(a.nativeFilename,/^cua-m4-[a-f0-9-]{36}\.txt$/);assert.ok(a.args.at(-1).includes(a.nativeFilename));
});
