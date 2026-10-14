import {compareRuns} from '../browser-parity/compare.mjs';
import {assessAssertions} from './vendor-defects.mjs';
import {normalizeHostDiagnostic} from './diagnostics.mjs';
import {isDeepStrictEqual} from 'node:util';
export function validateAttestations(meta) {
  if(meta.complete!==true)throw new Error('Incomplete parity run');
  if(!['vendor','cua'].includes(meta.host))throw new Error('Invalid requested host');
  if(!Array.isArray(meta.connections)||!meta.connections.length||new Set(meta.connections).size!==meta.connections.length)throw new Error('Invalid connection ledger');
  const attestations=meta.hostAttestations;
  if(!Array.isArray(attestations)||attestations.length!==meta.connections.length)throw new Error('Missing connection attestation');
  const seen=new Set();
  for(const a of attestations) {
    if(seen.has(a.connection)||!meta.connections.includes(a.connection))throw new Error('Invalid attested connection');seen.add(a.connection);
    if(a.host!==meta.host||!a.serverInfo||typeof a.serverInfo.name!=='string'||typeof a.serverInfo.version!=='string'||!Object.hasOwn(a,'_meta'))throw new Error('Host attestation mismatch');
    if(!isDeepStrictEqual(a.serverInfo,attestations[0].serverInfo))throw new Error('Mixed host versions across connections');
    const marker=a._meta?.['cua/replHost'];
    if(meta.host==='cua') {
      if(a.serverInfo.name!=='cua-repl-host'||marker?.host!=='cua'||!marker.version||marker.version!==a.serverInfo.version||(meta.hostVersion&&marker.version!==meta.hostVersion))throw new Error('Own host attestation mismatch');
    } else if(a.serverInfo.name==='cua-repl-host'||a._meta&&Object.hasOwn(a._meta,'cua/replHost'))throw new Error('Vendor host attestation mismatch');
  }
}
export function compareParityRuns(a,b,{expected=[],caseIds,caseCells}={}) {
  validateAttestations(a.meta);validateAttestations(b.meta);
  if(a.meta.host==='vendor'&&b.meta.host==='vendor'&&expected.length)throw new Error('No expected differences allowed for vendor determinism');
  // M0 has no allowances. M1 may enumerate its identity marker, never whole results/documents.
  // M3 document branding/exclusions need the separately pinned Table 3 transformation, not an ignore rule.
  if(!Array.isArray(expected)||expected.some(e=>!e.reason||e.field!=='meta.cua/replHost'||!Array.isArray(e.cases)||!e.cases.length||!Array.isArray(e.cells)||!e.cells.length||e.vendor?.present!==false||e.cua?.present!==true||e.cua.value?.host!=='cua'||typeof e.cua.value.version!=='string'))throw new Error('Invalid exact identity field allowance');
  const accepted=[];
  const ids=caseIds??a.meta.caseIds;const cells=caseCells??a.meta.caseCells;
  const differences=[];const fakeCases=new Set([...a.rows,...b.rows].filter(r=>ids?.includes(r.case)&&r.fake).map(r=>r.case));
  for(const id of fakeCases)differences.push({kind:'evidence',case:id,message:'double output cannot establish live host parity'});
  if(!isDeepStrictEqual(a.tools,b.tools))differences.push({kind:'tools',message:'effective tool contract changed'});
  for(const key of ['platform','service','backend','sandbox','surfaces'])if(!isDeepStrictEqual(a.meta[key],b.meta[key]))differences.push({kind:'configuration',field:key});
  if(!Array.isArray(ids)||!ids.length)differences.push({kind:'cardinality',message:'empty case manifest'});
  for(const [side,run] of [['a',a],['b',b]]) {
    if(!caseIds&&!isDeepStrictEqual(run.meta.caseIds,ids))differences.push({kind:'cardinality',side,message:'case manifests differ'});
    for(const id of ids??[])if(!run.meta.caseIds?.includes(id)||!run.rows.some(r=>r.case===id&&r.assertion))differences.push({kind:'cardinality',side,case:id,message:'missing required case'});
    for(const id of ids??[])for(const cell of cells?.[id]??[])if(!run.rows.some(r=>r.case===id&&r.cell===cell))differences.push({kind:'cardinality',side,case:id,cell,message:'missing required cell'});
    for(const id of ids??[])if(cells?.[id]&&!isDeepStrictEqual(run.rows.filter(r=>r.case===id&&r.cell).map(r=>r.cell).sort(),[...cells[id]].sort()))differences.push({kind:'cardinality',side,case:id,message:'observed cell set differs from manifest'});
    if(run.rows.some(r=>ids?.includes(r.case)&&!run.meta.caseIds?.includes(r.case)))differences.push({kind:'cardinality',side,message:'undeclared case'});
  }
  // Keep raw duration values in evidence; omit only this schema-known volatile field from comparison.
  const semanticRows=rows=>rows.filter(r=>ids?.includes(r.case)).map(normalizeHostDiagnostic).map(r=>{
    if(!r.meta||!Object.hasOwn(r.meta,'codex/nodeReplExecutionDurationMs'))return r;
    const meta={...r.meta};delete meta['codex/nodeReplExecutionDurationMs'];return {...r,meta};
  });
  const left=semanticRows(a.rows).map(r=>({...r,...(r.meta?{meta:{...r.meta}}:{})})),right=semanticRows(b.rows).map(r=>({...r,...(r.meta?{meta:{...r.meta}}:{})}));
  if(a.meta.host!==b.meta.host)for(const x of left){
    const y=right.find(r=>r.case===x.case&&r.cell===x.cell);if(!y||!x.cell)continue;
    const allowance=expected.find(e=>e.cases.includes(x.case)&&e.cells.includes(x.cell));if(!allowance)continue;
    const vendor=a.meta.host==='vendor'?x:y,own=a.meta.host==='cua'?x:y;
    if(vendor.meta&&Object.hasOwn(vendor.meta,'cua/replHost'))continue;
    if(!isDeepStrictEqual(own.meta?.['cua/replHost'],allowance.cua.value))continue;
    delete own.meta['cua/replHost'];accepted.push({case:x.case,cell:x.cell,field:allowance.field,reason:allowance.reason});
  }
  const leftAssertions=assessAssertions(a.meta,left),rightAssertions=assessAssertions(b.meta,right);
  // Exempt only the assessed row object, never every assertion sharing its case ID.
  const recordedAssertionFailures={a:new Set(leftAssertions.recordedAssertionRows),b:new Set(rightAssertions.recordedAssertionRows)};
  const vendorDefects=[...new Map([...leftAssertions.vendorDefects,...rightAssertions.vendorDefects].map(d=>[d.id,d])).values()];
  const result=compareRuns(left,right,{raw:true,recordedAssertionFailures});
  differences.push(...result.differences);
  // Keep assessment independently authoritative even if the shared comparison's indexing changes.
  for(const [side,assessment] of [['a',leftAssertions],['b',rightAssertions]])for(const row of assessment.unexpectedFailures){
    if(!differences.some(d=>d.kind==='assertion'&&d.side===side&&d.case===row.case&&d.cell===row.cell))differences.push({kind:'assertion',side,case:row.case,cell:row.cell,message:'undeclared assertion failure'});
  }
  return {...result,expected:accepted,cases:differences.length?0:(ids??[]).filter(id=>!fakeCases.has(id)&&!vendorDefects.some(d=>d.case===id)).length,recordedCases:differences.length?0:(ids??[]).filter(id=>!fakeCases.has(id)).length,vendorDefects,allAssertionsPassed:!differences.length&&!vendorDefects.length,doubleCases:fakeCases.size,differences,ok:!differences.length};
}
