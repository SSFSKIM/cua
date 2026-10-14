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
