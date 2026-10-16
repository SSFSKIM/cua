// Declared defects are observations of the pinned vendor, never skips, passing assertions or own-host waivers.
import {readFileSync} from 'node:fs';import {isDeepStrictEqual} from 'node:util';
import {provisionalCellsFor,recordedCells} from './pending-cells.mjs';
export const vendorDefects=JSON.parse(readFileSync(new URL('../../test/repl-parity/vendor-defects.json',import.meta.url),'utf8'));
if(!Array.isArray(vendorDefects)||new Set(vendorDefects.map(d=>d.id)).size!==vendorDefects.length||vendorDefects.some(d=>!d.id||!d.reason||d.host!=='vendor'||!['darwin','linux'].includes(d.platform)||!d.runtimeRelease||!d.case||d.assertion?.ok!==false||!d.observation||!d.result))throw new Error('Invalid scoped vendor-defect declaration');
export function declaredVendorDefect(meta,row,rows){
 if(Object.hasOwn(row,'cell')||row.assertion?.ok!==false)return null;
 return vendorDefects.find(d=>{
  if(meta.host!==d.host||meta.platform!==d.platform||meta.runtimeRelease!==d.runtimeRelease||row.case!==d.case||!isDeepStrictEqual(row.assertion,d.assertion)||(row.vendorDefect&&row.vendorDefect!==d.id))return false;
  const observation=rows.find(r=>r.case===d.case&&r.cell==='boundary'),result=rows.find(r=>r.case===d.case&&r.cell===d.result.cell);
  return observation?.ok===true&&result?.ok===true&&isDeepStrictEqual(observation.value,d.observation)&&result.isError===d.result.isError&&isDeepStrictEqual(result.content,d.result.content);
 })??null;
}
export function assessAssertions(meta,rows){
 const unexpectedFailures=[],recorded=[],recordedAssertionRows=[],passed=new Set(),pending=new Set();
 for(const row of rows.filter(r=>Object.hasOwn(r,'assertion'))){
  // A provisional oracle cell's case is pending on its platform; an assertion that does not say so is not counted.
  const provisional=row.assertion?.ok===true?provisionalCellsFor(meta.platform,row.case,recordedCells(rows,row.case)):[];
  if(provisional.length){if(row.assertion.covered===false&&provisional.every(p=>row.assertion.pendingCells?.includes(p.cell)))pending.add(row.case);else unexpectedFailures.push(row);continue;}
  if(row.assertion?.ok===true){if(row.assertion.covered===false){if(meta.pendingObligations?.includes(row.case)&&meta.pendingEnvironment?.some(d=>d.member===row.case))pending.add(row.case);else unexpectedFailures.push(row);}else if(!row.fake)passed.add(row.case);continue;}
  const defect=declaredVendorDefect(meta,row,rows);
  if(defect){recorded.push({id:defect.id,case:row.case,platform:defect.platform,reason:defect.reason});recordedAssertionRows.push(row);}else unexpectedFailures.push(row);
 }
 return {unexpectedFailures,vendorDefects:recorded,recordedAssertionRows,coveredCases:passed.size,pendingCases:[...pending],recordedCases:passed.size+recorded.length+pending.size};
}
