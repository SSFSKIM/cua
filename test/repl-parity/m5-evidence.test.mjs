import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import services from './scenarios/services.mjs';
import {scenarioCellLabels} from '../../scripts/repl-parity/registry.mjs';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
const base=new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m5/oracle/',import.meta.url);
const load=name=>({meta:JSON.parse(readFileSync(new URL(name+'/meta.json',base),'utf8')),tools:JSON.parse(readFileSync(new URL(name+'/tools.json',base),'utf8')),rows:readFileSync(new URL(name+'/results.jsonl',base),'utf8').trim().split('\n').map(JSON.parse)});
test('the original M5 mini vendor pair covers the stat failure before the later over-limit cell was added',()=>{
 const a=load('services-vendor-1'),b=load('services-vendor-2'),selected=services.filter(s=>s.platforms.includes(a.meta.platform));
 const result=compareParityRuns(a,b,{caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s).filter(label=>label!=='connect-over-limit')]))});
 assert.equal(result.ok,true,JSON.stringify(result.differences));assert.equal(result.allAssertionsPassed,true);assert.deepEqual(result.expected,[]);
 assert.ok(a.rows.some(r=>r.case==='cells/native-pipe/absolute-path'&&r.cell==='stat-missing'));
});
