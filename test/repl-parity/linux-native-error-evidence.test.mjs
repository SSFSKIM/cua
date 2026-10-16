import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import services from './scenarios/services.mjs';
import {validateAttestations,compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
import {assessAssertions} from '../../scripts/repl-parity/vendor-defects.mjs';
const base=new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m5/linux/services-vendor/',import.meta.url);
const load=()=>({meta:JSON.parse(readFileSync(new URL('meta.json',base),'utf8')),tools:JSON.parse(readFileSync(new URL('tools.json',base),'utf8')),rows:readFileSync(new URL('results.jsonl',base),'utf8').trim().split('\n').map(JSON.parse)});
const id='cells/native-pipe/absolute-path',scenario=services.find(s=>s.id===id);
const verdict=rows=>scenario.assert({platform:'linux',results:scenario.cells.map(c=>{const r=rows.find(r=>r.case===id&&r.cell===c.label);return {content:r.content,isError:r.isError,_meta:r.meta};}),timings:scenario.cells.map(c=>rows.find(r=>r.case===id&&r.cell===c.label).ms)});
test('the live Linux vendor control confirms the exact over-limit refusal and no peer connection, so the current oracle counts it',()=>{
 const run=load();validateAttestations(run.meta);assert.equal(run.meta.host,'vendor');assert.equal(run.meta.platform,'linux');
 const cell=run.rows.find(r=>r.case===id&&r.cell==='connect-over-limit');
 assert.deepEqual(JSON.parse(cell.content[0].text),{bytes:[],message:'failed to connect native pipe: path must be shorter than SUN_LEN',pathBytes:192,peer:{accepted:0,received:[]},platform:'linux',status:'refused',sunPathBytes:108});
 const assertion=verdict(run.rows);assert.deepEqual(assertion,{ok:true});
 // The committed run remains historically pending. Re-grade its raw observations in memory, never rewrite evidence.
 const historical=run.rows.find(r=>r.case===id&&r.assertion);assert.equal(historical.assertion.covered,false);
 const current={...run,rows:[...run.rows.filter(r=>r.case===id&&r.cell),{case:id,assertion}]};
 assert.equal(assessAssertions(current.meta,current.rows).coveredCases,1);
 const diff=compareParityRuns(current,current,{caseIds:[id],caseCells:{[id]:scenario.cells.map(c=>c.label)}});
 assert.equal(diff.ok,true);assert.equal(diff.cases,1);assert.equal(diff.allAssertionsPassed,true);assert.deepEqual(diff.provisionalCells,[]);
});
test('the confirmed Linux control still rejects a changed refusal sentence or a peer that accepted a connection',()=>{
 for(const patch of [{message:'wrong refusal'},{peer:{accepted:1,received:[]}},{status:'connected'}]){
  const run=load(),cell=run.rows.find(r=>r.case===id&&r.cell==='connect-over-limit');cell.content[0].text=JSON.stringify({...JSON.parse(cell.content[0].text),...patch});
  assert.throws(()=>verdict(run.rows));
 }
});
