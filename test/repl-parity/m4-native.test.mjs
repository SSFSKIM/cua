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

test('a no-op native drag or scroll cannot pass by returning undefined and leaving the owned window unchanged',()=>{
 const end={isError:false,structuredContent:{status:'ended'}};
 const samples={
  'native/target-app-decorated-tab/click':['undefined',true],
  'native/target-app-decorated-tab/drag':['undefined',true],
  'native/app/scroll':['undefined',{error:'Linux scroll accepts { pixels }, not pages.'},...Array(4).fill({error:'pixels must be a positive finite number.'})],
  'native/target-app-decorated-tab/scroll':['undefined',{error:'Linux scroll accepts { pixels }, not pages.'},...Array(4).fill({error:'pixels must be a positive finite number.'})],
 };
 for(const [id,values] of Object.entries(samples))assert.throws(()=>scenarios.find(s=>s.id===id).assert({results:[{isError:false,content:[{type:'text',text:'NATIVE:'+JSON.stringify(values)}]},end]}),id);
});

test('Linux full snapshots may change between observations without becoming diffs',async()=>{
 const scenario=scenarios.find(s=>s.id==='native/target-app-decorated-tab/getaxstate');
 const filename='owned-fixture.txt',a=`Accessibility source: at_spi\n0 frame ${filename}\n\t1 text (focused, settable)\n\t2 button Save`,b=a.replace('Save','Save document');let n=0,value;
 await new (Object.getPrototypeOf(async()=>{}).constructor)('app','nativeFilename','nativeSay',scenario.cells[0].code)({getAXState:async()=>n++?b:a},filename,v=>{value=v;});
 assert.equal(scenario.assert({results:[{isError:false,content:[{type:'text',text:'NATIVE:'+JSON.stringify(value)}]},{isError:false,structuredContent:{status:'ended'}}]}).ok,true);
});

test('native snapshot assertions reject flat, ID-less, truncated and non-window trees',async()=>{
 const scenario=scenarios.find(s=>s.id==='native/target-app-decorated-tab/getaxstate'),filename='owned-fixture.txt';
 for(const body of [`0 frame ${filename}\n1 text (settable)`,`frame ${filename}\n\ttext (settable)`,`0 frame ${filename} text (settable)`,`0 text (settable) ${filename}\n\t1 frame child`,`0 frame ${filename}\n\t\t1 text (settable)`]){
  const ax='Accessibility source: at_spi\n'+body;let value;
  await new (Object.getPrototypeOf(async()=>{}).constructor)('app','nativeFilename','nativeSay',scenario.cells[0].code)({getAXState:async()=>ax},filename,v=>{value=v;});
  assert.throws(()=>scenario.assert({results:[{isError:false,content:[{type:'text',text:'NATIVE:'+JSON.stringify(value)}]},{isError:false,structuredContent:{status:'ended'}}]}),body);
 }
});
