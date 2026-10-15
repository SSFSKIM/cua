import {test} from 'node:test';import assert from 'node:assert/strict';
import scenarios from './scenarios/index.mjs';
import {PENDING_REASON,resolvePendingDeclarations,classifyPendingCell,pendingCellsFor,assertAlternativeProof,assertAlternativeCoverage,loadAlternativeProofs} from '../../scripts/repl-parity/pending-cells.mjs';
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
