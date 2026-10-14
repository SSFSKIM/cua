import {test} from 'node:test';import assert from 'node:assert/strict';
import {assessAssertions} from '../../scripts/repl-parity/vendor-defects.mjs';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
const id='cells/confinement/no-unsandboxed-fallback';
const run=()=>({meta:{host:'vendor',platform:'linux',runtimeRelease:'26.928.40906-linux-arm64',complete:true,caseIds:[id],caseCells:{[id]:['refused','boundary']},connections:['c1'],hostAttestations:[{connection:'c1',host:'vendor',serverInfo:{name:'rmcp',version:'1'},_meta:null}]},rows:[
 {case:id,cell:'refused',ok:true,content:[{type:'text',text:'{"outsideWrite":true}'}],isError:false},
 {case:id,cell:'boundary',ok:true,value:{kind:'sandbox-launch-failure',codeExecuted:true,toolError:false,outsideWrite:true,launcherInvoked:true}},
 {case:id,assertion:{ok:false,reason:'failed sandbox launch must be refused with no out-of-policy write'}},
]});
test('an exact declared vendor defect is recorded, never covered or changed into a passing assertion',()=>{
 const a=run();const observation=assessAssertions(a.meta,a.rows);assert.equal(observation.unexpectedFailures.length,0);assert.equal(observation.vendorDefects.length,1);assert.equal(observation.coveredCases,0);assert.equal(observation.recordedCases,1);assert.equal(a.rows.at(-1).assertion.ok,false);
 const diff=compareParityRuns(a,run());assert.equal(diff.ok,true);assert.equal(diff.cases,0);assert.equal(diff.recordedCases,1);assert.equal(diff.allAssertionsPassed,false);assert.equal(diff.vendorDefects.length,1);
});
test('undeclared failures and changed defect observations still fail the run and comparison',()=>{
 for(const mutate of [r=>r.meta.platform='darwin',r=>r.meta.runtimeRelease='other',r=>r.rows[1].value.outsideWrite=false,r=>r.rows[2].assertion.reason='unrelated assertion failure',r=>r.rows[2].vendorDefect='forged']){const a=run();mutate(a);assert.equal(assessAssertions(a.meta,a.rows).unexpectedFailures.length,1);assert.equal(compareParityRuns(a,a).ok,false);}
 const a=run();a.rows.push({case:'other',assertion:{ok:false,reason:'undeclared'}});assert.equal(assessAssertions(a.meta,a.rows).unexpectedFailures.length,1);
 const own=run();own.meta.host='cua';assert.equal(assessAssertions(own.meta,own.rows).unexpectedFailures.length,1);
 const changed=run();changed.rows[0].content[0].text='different output';assert.equal(compareParityRuns(run(),changed).ok,false);
});

test('an undeclared reset assertion in the same case remains fatal even in identical journals',()=>{
 const a=run();a.meta.caseCells[id].unshift('reset');a.rows.unshift({case:id,cell:'reset',ok:true,content:[{type:'text',text:'js kernel reset'}],isError:false,assertion:{ok:false,reason:'undeclared reset failure'}});
 const assessment=assessAssertions(a.meta,a.rows);assert.equal(assessment.vendorDefects.length,1);assert.equal(assessment.unexpectedFailures.length,1);
 const diff=compareParityRuns(a,structuredClone(a));assert.equal(diff.ok,false);assert.equal(diff.cases,0);assert.equal(diff.recordedCases,0);assert.ok(diff.differences.some(d=>d.kind==='assertion'&&d.cell==='reset'));
});

test('copying the declared failure onto a cell row cannot create another recognised defect',()=>{
 const a=run();a.rows[0].assertion=structuredClone(a.rows.at(-1).assertion);
 const assessment=assessAssertions(a.meta,a.rows);assert.equal(assessment.vendorDefects.length,1);assert.equal(assessment.unexpectedFailures.length,1);assert.equal(compareParityRuns(a,structuredClone(a)).ok,false);
});

test('the shared comparator exempts only the exact recognised assertion object',async()=>{
 const {compareRuns}=await import('../../scripts/browser-parity/compare.mjs');
 const a=run(),b=run();a.rows[0].assertion={ok:false,reason:'undeclared cell failure'};b.rows[0].assertion={...a.rows[0].assertion};
 const result=compareRuns(a.rows,b.rows,{raw:true,recordedAssertionFailures:{a:new Set([a.rows.at(-1)]),b:new Set([b.rows.at(-1)])}});
 assert.equal(result.ok,false);assert.equal(result.differences.filter(d=>d.kind==='assertion').length,2);
});

test('the committed Linux journal rejects an additional same-case reset failure',async()=>{
 const {readFileSync}=await import('node:fs');const root=new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m0/linux-vendor-1/',import.meta.url);
 const evidence={meta:JSON.parse(readFileSync(new URL('meta.json',root))),tools:JSON.parse(readFileSync(new URL('tools.json',root))),rows:readFileSync(new URL('results.jsonl',root),'utf8').trim().split('\n').map(JSON.parse)};
 const reset=evidence.rows.find(r=>r.case===id&&r.cell==='reset');assert.ok(reset);reset.assertion={ok:false,reason:'undeclared reset failure'};
 assert.equal(assessAssertions(evidence.meta,evidence.rows).unexpectedFailures.length,1);
 const result=compareParityRuns(evidence,structuredClone(evidence));assert.equal(result.ok,false);assert.equal(result.recordedCases,0);
});

test('malformed falsy assertions cannot hide beside a recognised defect',()=>{
 for(const assertion of [false,null,0,'']){const a=run();a.rows[0].assertion=assertion;assert.equal(assessAssertions(a.meta,a.rows).unexpectedFailures.length,1);assert.equal(compareParityRuns(a,structuredClone(a)).ok,false);}
});
