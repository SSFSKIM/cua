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
test('the extended M5 vendor pair proves the over-limit path with exact bytes and no allowances',()=>{
 const root=new URL('../long-native-pipe/',base),a=load('services-vendor-1',root),b=load('services-vendor-2',root),selected=services.filter(s=>s.platforms.includes(a.meta.platform));
 const result=compareParityRuns(a,b,{caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s)]))});
 assert.equal(result.ok,true,JSON.stringify(result.differences));assert.equal(result.allAssertionsPassed,true);assert.deepEqual(result.expected,[]);
 const scenario=selected.find(s=>s.id==='cells/native-pipe/absolute-path');
 for(const run of [a,b]){
  const cells=scenario.cells.map(cell=>run.rows.find(r=>r.case===scenario.id&&r.cell===cell.label));
  assert.equal(scenario.assert({results:cells.map(r=>({content:r.content,isError:r.isError,_meta:r.meta})),timings:cells.map(r=>r.ms),platform:run.meta.platform}).ok,true);
 }
});
