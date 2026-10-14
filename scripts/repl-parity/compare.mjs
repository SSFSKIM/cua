import {compareRuns} from '../browser-parity/compare.mjs';
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
  if(expected.length)throw new Error('Expected differences must be implemented as exact case/field transformations before use');
  const differences=[];
  for(const key of ['platform','suite','service','backend','sandbox','surfaces'])if(!isDeepStrictEqual(a.meta[key],b.meta[key]))differences.push({kind:'configuration',field:key});
  const ids=caseIds??a.meta.caseIds;const cells=caseCells??a.meta.caseCells;
  if(!Array.isArray(ids)||!ids.length)differences.push({kind:'cardinality',message:'empty case manifest'});
  for(const [side,run] of [['a',a],['b',b]]) {
    if(!caseIds&&!isDeepStrictEqual(run.meta.caseIds,ids))differences.push({kind:'cardinality',side,message:'case manifests differ'});
    for(const id of ids??[])if(!run.meta.caseIds?.includes(id)||!run.rows.some(r=>r.case===id&&r.assertion))differences.push({kind:'cardinality',side,case:id,message:'missing required case'});
    for(const id of ids??[])for(const cell of cells?.[id]??[])if(!run.rows.some(r=>r.case===id&&r.cell===cell))differences.push({kind:'cardinality',side,case:id,cell,message:'missing required cell'});
    if(run.rows.some(r=>!run.meta.caseIds?.includes(r.case)))differences.push({kind:'cardinality',side,message:'undeclared case'});
  }
  // Keep raw duration values in evidence; omit only this schema-known volatile field from comparison.
  const semanticRows=rows=>rows.filter(r=>ids?.includes(r.case)).map(r=>{
    if(!r.meta||!Object.hasOwn(r.meta,'codex/nodeReplExecutionDurationMs'))return r;
    const meta={...r.meta};delete meta['codex/nodeReplExecutionDurationMs'];return {...r,meta};
  });
  const result=compareRuns(semanticRows(a.rows),semanticRows(b.rows));
  differences.push(...result.differences);
  return {...result,differences,ok:!differences.length};
}
