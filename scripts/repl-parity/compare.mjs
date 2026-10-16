import {pendingProjection,validatePendingMetadata} from './pending-cells.mjs';
import {attestedSourceVersion} from './source-identity.mjs';
import {validateToolAllowance} from './tool-contract.mjs';
import {compareRuns} from '../browser-parity/compare.mjs';
import {assessAssertions,vendorDefects} from './vendor-defects.mjs';
import {normalizeHostDiagnostic} from './diagnostics.mjs';
import {isDeepStrictEqual} from 'node:util';
import {assertManagedNode} from './node-provenance.mjs';
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
      // The own host's Node, resolved and re-read on the device for this connection (scripts/repl-parity/provenance.mjs).
      const answering=a.executionFacts?.answeringHost;
      if(meta.nodeMode==='managed'||answering?.nodeMode==='managed')assertManagedNode(answering);
      const own=answering?.ownNode??a.executionFacts?.ownNode;
      if(!own||typeof own.path!=='string'||!own.path.startsWith('/')||!(Number(/^v(\d+)\./.exec(own.version??'')?.[1])>=24))throw new Error('Own host attestation lacks the Node it ran on');
      if(a.serverInfo.name!=='cua-repl-host'||marker?.host!=='cua'||!marker.version||marker.version!==a.serverInfo.version||(meta.hostVersion&&marker.version!==meta.hostVersion))throw new Error('Own host attestation mismatch');
    } else if(a.serverInfo.name==='cua-repl-host'||a._meta&&Object.hasOwn(a._meta,'cua/replHost'))throw new Error('Vendor host attestation mismatch');
  }
}
export function compareParityRuns(a,b,{expected=[],caseIds,caseCells,sourceRepo}={}) {
  validateAttestations(a.meta);validateAttestations(b.meta);
  if(a.meta.host==='vendor'&&b.meta.host==='vendor'&&expected.length)throw new Error('No expected differences allowed for vendor determinism');
  // M0 has no allowances. M1 may enumerate its identity marker, never whole results/documents, and the declared
  // security departures below. M3 document branding/exclusions need the separately pinned Table 3 transformation, not an ignore rule.
  validateExpected(expected);
  expected=expected.filter(e=>e.kind!=='tools-description');
  const ownRun=a.meta.host==='cua'?a:b;
  const sourceVersion=expected.some(e=>e.cua?.value?.versionFrom==='attested-source')&&a.meta.host!==b.meta.host?attestedSourceVersion(ownRun.meta,{repo:sourceRepo}):null;
  const departures=expected.filter(e=>e.kind==='security-departure');expected=expected.filter(e=>e.kind!=='security-departure');
  const accepted=[];
  const ids=caseIds??a.meta.caseIds;const cells=caseCells??a.meta.caseCells;
  const pa=validatePendingMetadata(a.meta),pb=validatePendingMetadata(b.meta);if(!isDeepStrictEqual(pa,pb))throw new Error('Both runs must declare identical pending cells');
  const pendingLeft=pendingProjection(a,ids),pendingRight=pendingProjection(b,ids);
  const differences=[];const fakeCases=new Set([...a.rows,...b.rows].filter(r=>ids?.includes(r.case)&&r.fake).map(r=>r.case));
  for(const id of fakeCases)differences.push({kind:'evidence',case:id,message:'double output cannot establish live host parity'});
  if(!isDeepStrictEqual(a.tools,b.tools))differences.push({kind:'tools',message:'effective tool contract changed'});
  for(const key of ['platform','service','backend','sandbox','surfaces'])if(!isDeepStrictEqual(a.meta[key],b.meta[key]))differences.push({kind:'configuration',field:key});
  for(const id of ids??[]){
    const native=id.startsWith('native/'),configs=[a,b].map(run=>{
      const explicit=run.meta.caseConfigurations?.[id];
      if(explicit)return explicit;
      if(native)return undefined;
      // Old controls recorded a homogeneous lane. Never invent an equivalent for a mixed or absent configuration.
      return Array.isArray(run.meta.surfaces)&&['scoped','default','disabled'].includes(run.meta.sandbox)?{surfaces:run.meta.surfaces,sandbox:run.meta.sandbox}:undefined;
    });
    const declared=a.meta.caseConfigurations?.[id]||b.meta.caseConfigurations?.[id];
    if(native?configs.some(c=>!isDeepStrictEqual(c,{surfaces:['computer'],sandbox:'disabled'})):declared&&(!configs[0]||!configs[1]||!isDeepStrictEqual(...configs)))differences.push({kind:'configuration',case:id,field:'caseConfigurations'});
  }
  if(a.meta.caseProofs&&b.meta.caseProofs||(ids??[]).some(id=>/^(api|native|hidden|capability-host)\//.test(id)||/^secrets\/(browser|native)-live\//.test(id)||/^cells\/(facade|documentation|profiles)\//.test(id)))for(const id of ids??[])if(!a.meta.caseProofs?.[id]||a.meta.caseProofs[id]!==b.meta.caseProofs?.[id])differences.push({kind:'configuration',case:id,field:'caseProofs'});
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
  const left=semanticRows(pendingLeft.rows).map(r=>({...r,...(r.meta?{meta:{...r.meta}}:{})})),right=semanticRows(pendingRight.rows).map(r=>({...r,...(r.meta?{meta:{...r.meta}}:{})}));
  if(a.meta.host!==b.meta.host)for(const x of left){
    const y=right.find(r=>r.case===x.case&&r.cell===x.cell);if(!y||!x.cell)continue;
    const allowance=expected.find(e=>e.cases.includes(x.case)&&e.cells.includes(x.cell));if(!allowance)continue;
    const vendor=a.meta.host==='vendor'?x:y,own=a.meta.host==='cua'?x:y;
    if(vendor.meta&&Object.hasOwn(vendor.meta,'cua/replHost'))continue;
    // A named identity slot must hold exactly its declared value on the own side; absent or different is a difference.
    const identity=allowance.cua.value.versionFrom==='attested-source'?{host:'cua',version:sourceVersion}:allowance.cua.value;
    if(!isDeepStrictEqual(own.meta?.['cua/replHost'],identity)){differences.push({kind:'identity',case:x.case,cell:x.cell,field:allowance.field,message:'declared own-host identity slot missing or different'});continue;}
    delete own.meta['cua/replHost'];if(!Object.hasOwn(vendor,'meta')&&Object.keys(own.meta).length===0)delete own.meta;accepted.push({case:x.case,cell:x.cell,field:allowance.field,reason:allowance.reason});
  }
  const leftAssertions=assessAssertions(a.meta,left),rightAssertions=assessAssertions(b.meta,right);
  if(a.meta.host!==b.meta.host)for(const d of departures){
    if(a.meta.platform!==d.platform||b.meta.platform!==d.platform||!ids?.includes(d.case))continue;
    const [vendorRows,ownRows,vendorAssessment]=a.meta.host==='vendor'?[left,right,leftAssertions]:[right,left,rightAssertions];
    const pairs=departurePairs(d,{vendorRows,ownRows,vendorAssessment});
    if(!pairs)continue;
    // Only the departing fields are projected, to one shared placeholder on both sides; every other field of those rows,
    // and its absence, still compares. The evidence rows and the vendor-defect accounting are untouched.
    for(const {rows,index,fields} of pairs){const row={...rows[index]};for(const field of fields)if(field==='vendorDefect')delete row[field];else row[field]=field==='assertion'?{ok:true,securityDeparture:d.id}:{securityDeparture:d.id};rows[index]=row;}
    accepted.push({case:d.case,cells:d.cells,field:d.field,kind:d.kind,issue:d.issue,reason:d.reason});
  }
  // Exempt only the assessed row object, never every assertion sharing its case ID.
  const recordedAssertionFailures={a:new Set(leftAssertions.recordedAssertionRows),b:new Set(rightAssertions.recordedAssertionRows)};
  const vendorDefects=[...new Map([...leftAssertions.vendorDefects,...rightAssertions.vendorDefects].map(d=>[d.id,d])).values()];
  const result=compareRuns(left,right,{raw:true,recordedAssertionFailures});
  differences.push(...result.differences);
  // Keep assessment independently authoritative even if the shared comparison's indexing changes.
  for(const [side,assessment] of [['a',leftAssertions],['b',rightAssertions]])for(const row of assessment.unexpectedFailures){
    if(!differences.some(d=>d.kind==='assertion'&&d.side===side&&d.case===row.case&&d.cell===row.cell))differences.push({kind:'assertion',side,case:row.case,cell:row.cell,message:'undeclared assertion failure'});
  }
  const provisionalCells=[...new Map([...pendingLeft.provisional,...pendingRight.provisional].map(p=>[`${p.case}|${p.cell}`,p])).values()];
  return {...result,expected:accepted,cases:differences.length?0:(ids??[]).filter(id=>!fakeCases.has(id)&&!pa.pendingObligations.includes(id)&&!provisionalCells.some(p=>p.case===id)&&!vendorDefects.some(d=>d.case===id)).length,recordedCases:differences.length?0:(ids??[]).filter(id=>!fakeCases.has(id)).length,vendorDefects,pendingCells:pendingLeft.observations.map(x=>({...x,status:{a:x.status,b:pendingRight.observations.find(y=>y.case===x.case&&y.cell===x.cell)?.status}})),pendingObligations:pa.pendingObligations.filter(id=>ids.includes(id)),pendingUnexpectedPasses:[...pendingLeft.observations.filter(x=>x.status==='unexpected-pass').map(x=>({...x,side:'a'})),...pendingRight.observations.filter(x=>x.status==='unexpected-pass').map(x=>({...x,side:'b'}))],provisionalCells,allAssertionsPassed:!differences.length&&!vendorDefects.length&&!pendingLeft.observations.length&&!provisionalCells.length,doubleCases:fakeCases.size,differences,ok:!differences.length};
}

// The expected-differences file: exact identity-slot allowances (field meta.cua/replHost, both sides' values named) and
// declared security departures in cua's favour. A departure names one case on one platform: the vendor side must be
// exactly the declared vendor defect it names (test/repl-parity/vendor-defects.json), the own side must be exactly the
// passing outcome it names (its assertion, its boundary observation and its refused call's normalized result), and
// only that case's assertion row and the two rows it is computed from are then exempt. Anything else is refused.
const DEPARTURE_KEYS=['kind','id','issue','reason','case','platform','field','cells','vendorDefect','cua'];
export function validateExpected(expected){
 if(!Array.isArray(expected))throw new Error('Invalid expected differences');
 for(const e of expected){
  if(e?.kind==='tools-description'){validateToolAllowance(e);continue;}
  if(e?.kind==='security-departure'){
   const defect=vendorDefects.find(v=>v.id===e.vendorDefect);
   const ok=Object.keys(e).every(k=>DEPARTURE_KEYS.includes(k))&&typeof e.id==='string'&&/^#\d+$/.test(e.issue)&&e.reason&&typeof e.case==='string'&&['darwin','linux'].includes(e.platform)&&e.field==='assertion'
    &&defect&&defect.case===e.case&&defect.platform===e.platform&&e.cua?.assertion?.ok===true&&Object.keys(e.cua.assertion).length===1
    &&e.cua.observation&&typeof e.cua.observation==='object'&&typeof e.cua.result?.cell==='string'&&e.cua.result.isError===true&&Array.isArray(e.cua.result.content)
    &&isDeepStrictEqual(e.cells,[e.cua.result.cell,'boundary']);
   if(!ok)throw new Error('Invalid security departure: it must name an issue, one case and platform, the assertion field, the declared vendor defect and the exact passing own-host outcome');
   continue;
  }
  if(!e?.reason||e.kind!==undefined||e.field!=='meta.cua/replHost'||!Array.isArray(e.cases)||!e.cases.length||!Array.isArray(e.cells)||!e.cells.length||e.vendor?.present!==false||e.cua?.present!==true||e.cua.value?.host!=='cua'||!(typeof e.cua.value.version==='string'&&e.cua.value.versionFrom===undefined||e.cua.value.versionFrom==='attested-source'&&e.cua.value.version===undefined))throw new Error('Invalid exact identity field allowance');
 }
}
// The rows a departure covers -> [{rows, index, fields}] to project, or null unless both sides hold exactly one refused
// result, one boundary observation and one case assertion, the vendor's departing fields equal the declared defect's
// and the own host's equal the passing outcome the entry names.
function departurePairs(d,{vendorRows,ownRows,vendorAssessment}){
 const defect=vendorDefects.find(v=>v.id===d.vendorDefect);
 if(!defect||!vendorAssessment.vendorDefects.some(v=>v.id===d.vendorDefect&&v.case===d.case))return null;
 const one=(rows,match)=>{const found=rows.map((row,index)=>({row,index})).filter(({row})=>row.case===d.case&&match(row));return found.length===1?found[0]:null;};
 const slots={result:r=>r.cell===d.cua.result.cell,observation:r=>r.cell==='boundary',assertion:r=>Object.hasOwn(r,'assertion')&&!Object.hasOwn(r,'cell')};
 const v={},o={};
 for(const [name,match] of Object.entries(slots)){v[name]=one(vendorRows,match);o[name]=one(ownRows,match);if(!v[name]||!o[name])return null;}
 const holds=isDeepStrictEqual(v.result.row.content,defect.result.content)&&v.result.row.isError===defect.result.isError
  &&isDeepStrictEqual(o.result.row.content,d.cua.result.content)&&o.result.row.isError===d.cua.result.isError
  &&isDeepStrictEqual(v.observation.row.value,defect.observation)&&isDeepStrictEqual(o.observation.row.value,d.cua.observation)
  &&isDeepStrictEqual(v.assertion.row.assertion,defect.assertion)&&v.assertion.row.vendorDefect===d.vendorDefect
  &&isDeepStrictEqual(o.assertion.row.assertion,d.cua.assertion)&&!Object.hasOwn(o.assertion.row,'vendorDefect');
 if(!holds)return null;
 return [[vendorRows,v],[ownRows,o]].flatMap(([rows,side])=>[
  {rows,index:side.result.index,fields:['content','isError']},
  {rows,index:side.observation.index,fields:['value']},
  {rows,index:side.assertion.index,fields:['assertion','vendorDefect']},
 ]);
}
