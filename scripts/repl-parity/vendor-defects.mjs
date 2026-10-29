// Declared defects are observations of the pinned vendor, never skips, passing assertions or own-host waivers. A
// declaration names the vendor host it was observed on, or (on Linux, where the host is always cua's own, #171) the
// vendor engine: `host: "cua", engine: "vendor"`, matched only on a run of that engine lane, by its case's result cell
// alone (a native case carries its observation in its exercise result, with no boundary cell).
import {readFileSync} from 'node:fs';import {isDeepStrictEqual} from 'node:util';
import {provisionalCellsFor,recordedCells} from './pending-cells.mjs';
import {declaredCandidateExpectation} from './native-linux.mjs';
export const vendorDefects=JSON.parse(readFileSync(new URL('../../test/repl-parity/vendor-defects.json',import.meta.url),'utf8'));
const engineScoped=d=>d.engine!==undefined;
const validScope=d=>engineScoped(d)?d.host==='cua'&&d.engine==='vendor'&&d.platform==='linux'&&d.observation===undefined:d.host==='vendor'&&Boolean(d.observation);
if(!Array.isArray(vendorDefects)||new Set(vendorDefects.map(d=>d.id)).size!==vendorDefects.length||vendorDefects.some(d=>!d.id||!d.reason||!validScope(d)||!['darwin','linux'].includes(d.platform)||!d.runtimeRelease||!d.case||d.assertion?.ok!==false||!d.result))throw new Error('Invalid scoped vendor-defect declaration');
export function declaredVendorDefect(meta,row,rows){
 if(Object.hasOwn(row,'cell')||row.assertion?.ok!==false)return null;
 return vendorDefects.find(d=>{
  if(meta.host!==d.host||engineScoped(d)&&meta.engine!==d.engine||meta.platform!==d.platform||meta.runtimeRelease!==d.runtimeRelease||row.case!==d.case||!isDeepStrictEqual(row.assertion,d.assertion)||(row.vendorDefect&&row.vendorDefect!==d.id))return false;
  const observation=rows.find(r=>r.case===d.case&&r.cell==='boundary'),result=rows.find(r=>r.case===d.case&&r.cell===d.result.cell);
  if(!engineScoped(d)&&!(observation?.ok===true&&isDeepStrictEqual(observation.value,d.observation)))return false;
  return result?.ok===true&&result.isError===d.result.isError&&isDeepStrictEqual(result.content,d.result.content);
 })??null;
}
// A run's assertions: passed, pending, a declared vendor defect, a temporary candidate expectation of the cua engine
// lane (./native-linux.mjs; recorded, never covered), or an unexpected failure.
export function assessAssertions(meta,rows){
 const unexpectedFailures=[],recorded=[],candidates=[],recordedAssertionRows=[],passed=new Set(),pending=new Set();
 for(const row of rows.filter(r=>Object.hasOwn(r,'assertion'))){
  // A provisional oracle cell's case is pending on its platform; an assertion that does not say so is not counted.
  const provisional=row.assertion?.ok===true?provisionalCellsFor(meta.platform,row.case,recordedCells(rows,row.case)):[];
  if(provisional.length){if(row.assertion.covered===false&&provisional.every(p=>row.assertion.pendingCells?.includes(p.cell)))pending.add(row.case);else unexpectedFailures.push(row);continue;}
  if(row.assertion?.ok===true){if(row.assertion.covered===false){if(meta.pendingObligations?.includes(row.case)&&meta.pendingEnvironment?.some(d=>d.member===row.case))pending.add(row.case);else unexpectedFailures.push(row);}else if(!row.fake)passed.add(row.case);continue;}
  const defect=declaredVendorDefect(meta,row,rows);
  if(defect){recorded.push({id:defect.id,case:row.case,platform:defect.platform,reason:defect.reason});recordedAssertionRows.push(row);continue;}
  const candidate=declaredCandidateExpectation(meta,row,rows);
  if(candidate){candidates.push({id:candidate.id,case:row.case,until:candidate.until,reason:candidate.reason});recordedAssertionRows.push(row);}else unexpectedFailures.push(row);
 }
 return {unexpectedFailures,vendorDefects:recorded,candidateExpectations:candidates,recordedAssertionRows,coveredCases:passed.size,pendingCases:[...pending],recordedCases:passed.size+recorded.length+candidates.length+pending.size};
}
