import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import services from './scenarios/services.mjs';
import {scenarioCellLabels} from '../../scripts/repl-parity/registry.mjs';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
const base=new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m5/oracle/',import.meta.url);
const load=(name,root=base)=>({meta:JSON.parse(readFileSync(new URL(name+'/meta.json',root),'utf8')),tools:JSON.parse(readFileSync(new URL(name+'/tools.json',root),'utf8')),rows:readFileSync(new URL(name+'/results.jsonl',root),'utf8').trim().split('\n').map(JSON.parse)});
test('the original M5 mini vendor pair covers the stat failure before the later over-limit cell was added',()=>{
 const a=load('services-vendor-1'),b=load('services-vendor-2'),selected=services.filter(s=>s.platforms.includes(a.meta.platform));
 const result=compareParityRuns(a,b,{caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s).filter(label=>label!=='connect-over-limit')]))});
 assert.equal(result.ok,true,JSON.stringify(result.differences));assert.equal(result.allAssertionsPassed,true);assert.deepEqual(result.expected,[]);
 assert.ok(a.rows.some(r=>r.case==='cells/native-pipe/absolute-path'&&r.cell==='stat-missing'));
});
// Historical: recorded by harnesses 30b238e/46f22dc (committed in f2e9538), before the peer witness. It proves the
// subject's own response to the over-limit connect (connected, all six bytes reversed), not that the harness-owned peer
// accepted the connection and received the bytes. The current oracle therefore refuses it; the peer-witness pair below
// supplies the independent acceptance evidence.
test('the historical over-limit vendor pair proves only the subject response, and the current oracle refuses it for lacking the peer witness',()=>{
 const root=new URL('../long-native-pipe/',base),a=load('services-vendor-1',root),b=load('services-vendor-2',root),selected=services.filter(s=>s.platforms.includes(a.meta.platform));
 const result=compareParityRuns(a,b,{caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s)]))});
 assert.equal(result.ok,true,JSON.stringify(result.differences));assert.equal(result.allAssertionsPassed,true);assert.deepEqual(result.expected,[]);
 const scenario=selected.find(s=>s.id==='cells/native-pipe/absolute-path');
 for(const run of [a,b]){
  const cells=scenario.cells.map(cell=>run.rows.find(r=>r.case===scenario.id&&r.cell===cell.label));
  assert.deepEqual(JSON.parse(cells[2].content[0].text),{bytes:[65,13,10,128,255,0],message:null,pathBytes:192,platform:'darwin',status:'connected',sunPathBytes:104});
  assert.throws(()=>scenario.assert({results:cells.map(r=>({content:r.content,isError:r.isError,_meta:r.meta})),timings:cells.map(r=>r.ms),platform:run.meta.platform}),/peer witness/);
 }
});
test('the peer-witness vendor pair proves the over-limit connection and exact received bytes without allowances',()=>{
 const root=new URL('../long-native-pipe/peer-witness/',base),a=load('services-vendor-1',root),b=load('services-vendor-2',root),selected=services.filter(s=>s.platforms.includes(a.meta.platform));
 const result=compareParityRuns(a,b,{caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s)]))});
 assert.equal(result.ok,true,JSON.stringify(result.differences));assert.equal(result.allAssertionsPassed,true);assert.deepEqual(result.expected,[]);assert.deepEqual(result.provisionalCells,[]);
 const scenario=selected.find(s=>s.id==='cells/native-pipe/absolute-path');
 for(const run of [a,b]){
  const cells=scenario.cells.map(cell=>run.rows.find(r=>r.case===scenario.id&&r.cell===cell.label));
  const results=cells.map(r=>({content:r.content,isError:r.isError,_meta:r.meta})),context={timings:cells.map(r=>r.ms),platform:run.meta.platform};
  assert.deepEqual(scenario.assert({results,...context}),{ok:true});
  const value=JSON.parse(results[2].content[0].text);
  assert.deepEqual(value.peer,{accepted:1,received:[[0,255,128,10,13,65]]});
  for(const peer of [{accepted:0,received:[]},{accepted:1,received:[[65,13,10,128,255,0]]}]){
   const mutated=structuredClone(results);mutated[2].content[0].text=JSON.stringify({...value,peer});
   assert.throws(()=>scenario.assert({results:mutated,...context}),/peer witness/);
  }
 }
});
