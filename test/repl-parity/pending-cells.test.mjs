import {test} from 'node:test';import assert from 'node:assert/strict';
import scenarios from './scenarios/index.mjs';
import {PENDING_REASON,resolvePendingDeclarations,classifyPendingCell,pendingCellsFor,assertAlternativeProof,assertAlternativeCoverage,loadAlternativeProofs,provisionalCellsFor,provisionalOracles} from '../../scripts/repl-parity/pending-cells.mjs';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
import {assessAssertions} from '../../scripts/repl-parity/vendor-defects.mjs';
const names=['input/coordinates#scroll','input/dom#scroll'];
const resolve=logicalCells=>resolvePendingDeclarations({logicalCells,reason:PENDING_REASON,platform:'linux',through:'M4',scenarios});
const raw=value=>({isError:false,content:[{type:'text',text:'CUA_PARITY_RESULT '+JSON.stringify({...value,$imageCount:0})}]});
const blocked=()=>raw({ok:false,error:{code:'Error',message:'Timed out after 10000ms waiting for CDP command Input.synthesizeScrollGesture.'}});
const passed=()=>raw({ok:true,value:{before:0,moved:true}});
test('declared logical scroll cells expand to fourteen consumers but only two pending members',()=>{
 const p=resolve(names);assert.equal(p.pendingObligations.length,2);assert.equal(p.pendingEnvironment.flatMap(d=>d.cases).length,14);
 assert.deepEqual(pendingCellsFor(p.pendingEnvironment,'api/browser-cuaapi/click').map(c=>c.cell),['scroll']);
 assert.throws(()=>resolve(['unknown#cell']),/Unknown/);assert.throws(()=>resolvePendingDeclarations({logicalCells:names,reason:PENDING_REASON,platform:'darwin',through:'M4',scenarios}),/Linux/);
 assert.throws(()=>resolvePendingDeclarations({logicalCells:names,reason:'hide failures',platform:'linux',through:'M4',scenarios}),/reason/);
});
test('pending recognizes only the recorded environmental failure or an actual unexpected pass',()=>{
 assert.equal(classifyPendingCell(blocked()),'blocked');assert.equal(classifyPendingCell(passed()),'unexpected-pass');
 assert.throws(()=>classifyPendingCell(raw({ok:false,error:{code:'Error',message:'unimplemented'}})),/pending/);
 assert.throws(()=>classifyPendingCell(raw({ok:true,value:{before:0,moved:false}})),/pending/);
});
function run({pass=false}={}){
 const p=resolve(names),ids=p.pendingEnvironment.flatMap(d=>d.cases),rows=[];
 for(const id of ids){const pending=pendingCellsFor(p.pendingEnvironment,id)[0];rows.push({case:id,cell:'scroll',ok:true,...(pass?passed():blocked()),pendingCell:{...pending,status:pass?'unexpected-pass':'blocked'}},{case:id,assertion:{ok:true,pendingCells:['scroll'],covered:!p.pendingObligations.includes(id)}});}
 return {meta:{...p,host:'vendor',complete:true,platform:'linux',through:'M4',caseIds:ids,caseCells:Object.fromEntries(ids.map(id=>[id,['scroll']])),caseProofs:Object.fromEntries(ids.map(id=>[id,'chrome'])),connections:['c1'],hostAttestations:[{connection:'c1',host:'vendor',serverInfo:{name:'rmcp',version:'1'},_meta:null}]},rows};
}
test('pending sets must match, remain visible, preserve other fields, and never count the scroll members',()=>{
 const a=run(),b=run({pass:true}),diff=compareParityRuns(a,b);assert.equal(diff.ok,true);assert.equal(diff.cases,12);assert.equal(diff.pendingCells.length,14);assert.equal(diff.pendingUnexpectedPasses.length,14);assert.equal(diff.allAssertionsPassed,false);
 assert.equal(assessAssertions(a.meta,a.rows).coveredCases,12);
 const mismatch=run();delete mismatch.meta.pendingEnvironment;assert.throws(()=>compareParityRuns(a,mismatch),/pending/i);
 const corrupt=run();corrupt.rows[0].structuredContent={unexpected:true};assert.equal(compareParityRuns(a,corrupt).ok,false);
 const missing=run();missing.rows.shift();assert.equal(compareParityRuns(a,missing).ok,false);
});
test('the platform pending gate needs real, passing M3 mini evidence, not a fake or failing row',()=>{
 const proof=loadAlternativeProofs()[0],id='api/browser-cuaapi/scroll';assert.doesNotThrow(()=>assertAlternativeProof(proof,id));
 for(const change of [r=>r.meta.platform='linux',r=>r.rows.find(x=>x.case===id&&x.assertion).assertion.ok=false,r=>r.rows.find(x=>x.case===id&&x.cell==='scroll').fake=true,r=>r.meta.hostAttestations=[]]){const wrong=structuredClone(proof);change(wrong);assert.throws(()=>assertAlternativeProof(wrong,id));}
});

test('pending skips only the classified scroll value check, never sibling results or fixture effects',async()=>{
 const values=['pointer',{before:0,after:7},true,'ended'].map(value=>raw({ok:true,value}));
 const input={results:[...values,blocked()],pendingCells:['scroll'],fixtureState:{events:[{text:'pointer'},{double:true},{dragStart:true,x:60,y:180},{dragEnd:true,x:160,y:180}]}};
 const click=scenarios.find(s=>s.id==='api/browser-cuaapi/click'),scroll=scenarios.find(s=>s.id==='api/browser-cuaapi/scroll');
 assert.deepEqual(await click.assert(input),{ok:true,pendingCells:['scroll'],covered:true});
 assert.deepEqual(await scroll.assert(input),{ok:true,pendingCells:['scroll'],covered:false});
 assert.equal((await click.assert({...input,pendingCells:[]})).ok,false);
 assert.equal((await click.assert({...input,results:[raw({ok:true,value:'wrong'}),...input.results.slice(1)]})).ok,false);
 assert.equal((await click.assert({...input,fixtureState:{events:[]}})).ok,false);
 assert.deepEqual(await scroll.assert({...input,results:[...values,passed()]}),{ok:true,pendingCells:['scroll'],covered:false});
});

test('no alternate-platform coverage can be manufactured by an empty or duplicate control set',()=>{assert.throws(()=>assertAlternativeCoverage([], 'api/browser-cuaapi/scroll'));const proof=loadAlternativeProofs()[0];assert.throws(()=>assertAlternativeCoverage([proof,proof], 'api/browser-cuaapi/scroll'));});

test('pending projection preserves annotations and metadata siblings on its classified text item',()=>{
 const a=run();for(const [field,value] of [['annotations',{audience:['assistant']}],['_meta',{fixture:'changed'}]]){const b=run();b.rows[0].content[0][field]=value;assert.equal(compareParityRuns(a,b).ok,false,field);}
});

// A provisional oracle cell: its platform expectation is source-derived until a live vendor control is recorded.
const overLimit='cells/native-pipe/absolute-path';
function servicesRun({platform='linux',cells=['cell-1','stat-missing','connect-over-limit'],assertion}={}){
 const rows=[...cells.map(cell=>({case:overLimit,cell,ok:true,isError:false,content:[{type:'text',text:cell}]})),{case:overLimit,assertion:assertion??(platform==='linux'&&cells.includes('connect-over-limit')?{ok:true,pendingCells:['connect-over-limit'],covered:false}:{ok:true})}];
 return {meta:{host:'vendor',complete:true,platform,caseIds:[overLimit],caseCells:{[overLimit]:cells},connections:['c1'],hostAttestations:[{connection:'c1',host:'vendor',serverInfo:{name:'rmcp',version:'1'},_meta:null}]},tools:{},rows};
}
test('the Linux over-limit refusal is declared provisional in data the oracle and the accounting share',()=>{
 assert.deepEqual(provisionalCellsFor('linux',overLimit).map(d=>d.cell),['connect-over-limit']);
 assert.deepEqual(provisionalCellsFor('darwin',overLimit),[]);
 assert.deepEqual(provisionalCellsFor('linux',overLimit,['cell-1','stat-missing']),[],'a recording without the cell carries no provisional claim');
 for(const d of provisionalOracles){const s=scenarios.find(s=>s.id===d.case);assert.ok(s?.platforms.includes(d.platform),d.case);assert.ok(s.cells.some(c=>c.label===d.cell),d.cell);assert.match(d.reason,/task 6/);}
});
test('a provisional cell executes and compares exactly, but its case is pending on Linux and never counted as covered',()=>{
 const a=servicesRun(),b=servicesRun(),assessed=assessAssertions(a.meta,a.rows);
 assert.deepEqual([assessed.coveredCases,assessed.pendingCases,assessed.unexpectedFailures.length],[0,[overLimit],0]);
 const diff=compareParityRuns(a,b);assert.equal(diff.ok,true,JSON.stringify(diff.differences));assert.equal(diff.cases,0);assert.equal(diff.recordedCases,1);assert.equal(diff.allAssertionsPassed,false);
 assert.deepEqual(diff.provisionalCells.map(({case:id,cell})=>({case:id,cell})),[{case:overLimit,cell:'connect-over-limit'}]);
 const changed=servicesRun();changed.rows[2].content[0].text='connected';assert.equal(compareParityRuns(a,changed).ok,false,'the provisional cell is still compared exactly');
});
test('a Linux assertion that claims the provisional cell as covered is refused, not counted',()=>{
 for(const assertion of [{ok:true},{ok:true,pendingCells:['connect-over-limit'],covered:true},{ok:true,pendingCells:[],covered:false}]){
  const claimed=servicesRun({assertion});assert.equal(assessAssertions(claimed.meta,claimed.rows).coveredCases,0,JSON.stringify(assertion));
  assert.throws(()=>compareParityRuns(claimed,servicesRun({assertion})),/pending|provisional/i);
 }
});
test('Darwin, and Linux recordings made before the cell existed, keep ordinary coverage',()=>{
 for(const options of [{platform:'darwin'},{cells:['cell-1','stat-missing']}]){
  const a=servicesRun(options),b=servicesRun(options);assert.equal(assessAssertions(a.meta,a.rows).coveredCases,1);
  const diff=compareParityRuns(a,b);assert.equal(diff.ok,true);assert.equal(diff.cases,1);assert.equal(diff.allAssertionsPassed,true);assert.deepEqual(diff.provisionalCells,[]);
 }
});
