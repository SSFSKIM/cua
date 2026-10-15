// Explicit M4/#141 deferral, not an expected-difference allowance. Every cell still executes. Only the two
// approved logical cells may have their recorded stall compared as pending; every sibling result remains exact.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {validateAttestations} from './compare.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const policy=JSON.parse(readFileSync(new URL('../../test/repl-parity/pending-environment.json',import.meta.url)));
export const PENDING_REASON=policy.reason;
export const PENDING_LOGICAL_CELLS=policy.scopes.map(s=>s.logicalCell);
const marker='CUA_PARITY_RESULT ';
export function classifyPendingCell(result){
 assert.equal(result.isError,false,'invalid pending tool result');assert.equal(result.content?.length,1,'invalid pending content');
 const item=result.content[0];assert.equal(item.type,'text','invalid pending content');assert.ok(item.text.startsWith(marker),'invalid pending marker');
 const value=JSON.parse(item.text.slice(marker.length));
 if(isDeepStrictEqual(value,{ok:false,error:{code:'Error',message:'Timed out after 10000ms waiting for CDP command Input.synthesizeScrollGesture.'},$imageCount:0}))return 'blocked';
 if(isDeepStrictEqual(value,{ok:true,value:{before:0,moved:true},$imageCount:0}))return 'unexpected-pass';
 throw Error('Unexpected result in a pending cell; only the declared stall or a passing scroll is permitted');
}
export function assertAlternativeProof(run,id){
 validateAttestations(run.meta);
 assert.equal(run.meta.platform,'darwin','alternate proof must be another platform');assert.equal(run.meta.device,'mini');assert.notEqual(run.meta.fake,true);
 assert.equal(run.meta.caseProofs?.[id],'chrome','alternate proof must be Chrome-live');assert.ok(run.meta.caseIds.includes(id));
 const rows=run.rows.filter(r=>r.case===id);assert.ok(rows.length>1);assert.ok(rows.every(r=>!r.fake));
 assert.equal(rows.filter(r=>r.assertion?.ok===true).length,1,'alternate proof must pass');
 const cells=rows.filter(r=>r.cell);assert.deepEqual(cells.map(r=>r.cell).sort(),[...run.meta.caseCells[id]].sort());
 assert.ok(cells.every(r=>r.ok===true&&r.isError===false));assert.equal(classifyPendingCell(cells.find(r=>r.cell==='scroll')),'unexpected-pass');
}
export function assertAlternativeCoverage(runs,id){
 assert.equal(runs.length,2,'pending requires both live alternate-host controls');assert.deepEqual(runs.map(r=>r.meta.host).sort(),['cua','vendor'],'pending requires independent alternate-host controls');
 for(const run of runs)assertAlternativeProof(run,id);
}
let proofs;
export function loadAlternativeProofs(){
 if(proofs)return proofs;
 proofs=policy.proofs.map(proof=>{const files=Object.fromEntries(Object.entries(proof.files).map(([name,sha])=>{const bytes=readFileSync(join(root,proof.path,name));assert.equal(createHash('sha256').update(bytes).digest('hex'),sha,'alternate live proof pin mismatch');return [name,bytes.toString()];}));return {path:proof.path,meta:JSON.parse(files['meta.json']),rows:files['results.jsonl'].trim().split('\n').map(JSON.parse)};});
 return proofs;
}
export function resolvePendingDeclarations({logicalCells=[],reason,platform,through,scenarios,caseIds}={}){
 if(!logicalCells.length){if(reason)throw Error('pending reason requires a declared cell');return {pendingEnvironment:[],pendingObligations:[]};}
 if(platform!==policy.platform||through!==policy.through)throw Error('Pending cells are approved only for Linux through M4');
 if(reason!==policy.reason)throw Error('Pending reason must match the approved #141 reason');
 if(new Set(logicalCells).size!==logicalCells.length)throw Error('Duplicate pending logical cell');
 const selected=logicalCells.map(name=>{const scope=policy.scopes.find(s=>s.logicalCell===name);if(!scope)throw Error('Unknown pending logical cell: '+name);return scope;}).sort((a,b)=>a.logicalCell.localeCompare(b.logicalCell));
 const pendingEnvironment=selected.map(scope=>{
  if(scenarios){const consumers=scenarios.filter(s=>s.corpusCase===scope.corpus&&s.cells.some(c=>c.label===scope.cell));assert.deepEqual(consumers.map(s=>s.id).sort(),scope.cases,'declared pending consumer set changed');assert.deepEqual(consumers.filter(s=>s.witnessCells.every(c=>c===scope.cell)).map(s=>s.id),[scope.member],'pending member witness changed');}
  if(caseIds)assert.ok(scope.cases.every(id=>caseIds.includes(id)),'pending cell consumers absent from manifest');
  const alternate=loadAlternativeProofs();assertAlternativeCoverage(alternate,scope.member);
  return {logicalCell:scope.logicalCell,cell:scope.cell,cases:scope.cases,member:scope.member,reason,alternativeProofs:alternate.map(run=>({path:run.path,host:run.meta.host,commit:run.meta.commit,files:policy.proofs.find(p=>p.path===run.path).files}))};
 });
 return {pendingEnvironment,pendingObligations:pendingEnvironment.map(d=>d.member)};
}
export function pendingCellsFor(declarations,id){return (declarations??[]).filter(d=>d.cases.includes(id)).map(({logicalCell,cell,reason})=>({logicalCell,cell,reason}));}
export function validatePendingMetadata(meta){
 const declarations=meta.pendingEnvironment??[],expected=resolvePendingDeclarations({logicalCells:declarations.map(d=>d.logicalCell),reason:declarations[0]?.reason,platform:meta.platform,through:meta.through,caseIds:meta.caseIds});
 assert.deepEqual(declarations,expected.pendingEnvironment,'invalid pending declaration');assert.deepEqual(meta.pendingObligations??[],expected.pendingObligations,'invalid pending coverage');return expected;
}
export function pendingProjection(run,ids){
 const declarations=validatePendingMetadata(run.meta).pendingEnvironment,observations=[];
 const rows=run.rows.map(row=>{
  if(!ids.includes(row.case))return row;
  const scope=pendingCellsFor(declarations,row.case);
  if(row.assertion){
   if(scope.length&&row.assertion.ok===true){assert.deepEqual(row.assertion.pendingCells,scope.map(p=>p.cell),'pending assertion must name its cells');assert.equal(row.assertion.covered,!(run.meta.pendingObligations??[]).includes(row.case),'pending coverage mismatch');}
   else assert.ok(row.assertion.covered===undefined&&row.assertion.pendingCells===undefined,'undeclared pending assertion');
   return row;
  }
  const declaration=scope.find(p=>p.cell===row.cell);
  if(!declaration){assert.equal(row.pendingCell,undefined,'undeclared pending cell');return row;}
  const status=classifyPendingCell(row);assert.deepEqual(row.pendingCell,{...declaration,status},'pending outcome annotation mismatch');
  observations.push({case:row.case,...declaration,status});
  // Raw evidence is untouched. Only this exact, classified content slot is projected; sibling fields still compare.
  return {...row,content:[{type:'text',text:`<pending ${declaration.logicalCell}>`}]};
 });
 return {rows,observations};
}
