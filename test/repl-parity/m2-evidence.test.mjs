// Replay only committed, value-free vendor evidence; no runtime, SSH or owner's services are touched by npm test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scenarioCellLabels} from '../../scripts/repl-parity/registry.mjs';
import {turnCellLabels} from '../../scripts/repl-parity/turns.mjs';
import services from './scenarios/services.mjs';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
const base=new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m2/',import.meta.url);
const json=p=>JSON.parse(readFileSync(new URL(p,base),'utf8'));
const load=name=>({meta:json(`${name}/meta.json`),tools:json(`${name}/tools.json`),rows:readFileSync(new URL(`${name}/results.jsonl`,base),'utf8').trim().split('\n').map(JSON.parse)});
test('M2 vendor pair covers every service oracle with no allowances or double-only substitutions',()=>{
 const a=load('vendor-1'),b=load('vendor-2'),selected=services.filter(s=>s.platforms.includes(a.meta.platform));
 // M5 adds stat-missing and connect-over-limit; neither is retroactively part of the immutable M2 recording.
 const result=compareParityRuns(a,b,{caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s).filter(label=>!['stat-missing','connect-over-limit'].includes(label))]))});
 assert.equal(result.ok,true,JSON.stringify(result.differences));assert.equal(result.allAssertionsPassed,true);assert.equal(result.cases,41);assert.deepEqual(result.expected,[]);
});
test('each service assertion accepts observed vendor results and rejects destroyed outcomes (M5 re-recording for the extended path case)',()=>{
 const run=load('vendor-1');
 const extendedRows=readFileSync(new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m5/long-native-pipe/services-vendor-1/results.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
 for(const scenario of services.filter(s=>s.platforms.includes(run.meta.platform))){
  const rows=(scenario.id==='cells/native-pipe/absolute-path'?extendedRows:run.rows).filter(r=>r.case===scenario.id&&r.cell);
  const raw=r=>({content:r.content,isError:r.isError,...(Object.hasOwn(r,'meta')?{_meta:r.meta}:{}),...(Object.hasOwn(r,'structuredContent')?{structuredContent:r.structuredContent}:{})});
  const groups=scenario.cells.map(c=>turnCellLabels(c).map(label=>rows.find(r=>r.cell===label)));
  const timings=groups.map(group=>Math.max(...group.map(r=>typeof r.ms==='object'?(r.ms.hostTurn??r.ms.elapsed):r.ms)));
  const results=groups.map((group,index)=>scenario.cells[index].witnessCount!==undefined?{replies:group.map(r=>({result:raw(r),observation:{...r.value,afterHookMs:r.ms.afterHook}}))}:raw(group[0]));
  assert.equal(scenario.assert({results,timings}).ok,true,scenario.id);
  const destroyed=results.map(r=>r.replies?{replies:r.replies.map(reply=>({...reply,observation:{...reply.observation,hookCompletedBeforeAck:false}}))}:{...r,content:[],isError:!r.isError,_meta:{}});
  assert.throws(()=>scenario.assert({results:destroyed,timings}),undefined,`${scenario.id} must not pass empty/reversed outcomes`);
 }
});
