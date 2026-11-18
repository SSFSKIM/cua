// Declared defects are observations of the pinned vendor, never skips, passing assertions or own-host waivers. A
// declaration names the vendor host it was observed on, or (on Linux, where the host is always cua's own, #171) the
// vendor engine: `host: "cua", engine: "vendor"`, matched only on a run of that engine lane, by its case's result cell
// alone (a native case carries its observation in its exercise result, with no boundary cell).
import {readFileSync} from 'node:fs';import {isDeepStrictEqual} from 'node:util';
import {provisionalCellsFor,recordedCells} from './pending-cells.mjs';
export const vendorDefects=JSON.parse(readFileSync(new URL('../../test/repl-parity/vendor-defects.json',import.meta.url),'utf8'));
const engineScoped=d=>d.engine!==undefined;
const validScope=d=>engineScoped(d)?d.host==='cua'&&d.engine==='vendor'&&d.platform==='linux'&&d.observation===undefined:d.host==='vendor'&&Boolean(d.observation);
// A vendor engine's declared outcome may admit more than one exact content (#171 M5, T4's arm64 round: arm64's typeText
// ends gedit answering either of two error texts), `result.contents` in place of `result.content`, and may mask the
// session bus's unique connection names (`masks: ["dbus-unique-name"]`): a ServiceUnknown names the connection the
// engine last asked, `:1.<n>`, whose number counts the bus's earlier connections. Only that name is masked, as
// `:<unique-name>`; every other byte compares exactly. `counts` ({runs, outcomes}, one count an admitted content) and
// `evidence` state what was measured, and where.
const MASKS={'dbus-unique-name':t=>t.replace(/(The name ):\d+\.\d+( was not provided)/g,'$1:<unique-name>$2')};
const admitted=d=>d.result.contents??[d.result.content];
const masked=(d,content)=>(d.masks??[]).reduce((c,m)=>c.map(x=>x?.type==='text'?{...x,text:MASKS[m](x.text)}:x),content);
const validResult=d=>!d.result.contents||(engineScoped(d)&&d.result.content===undefined&&Array.isArray(d.result.contents)&&d.result.contents.length>1&&d.result.contents.every(Array.isArray));
const validMasks=d=>d.masks===undefined||(engineScoped(d)&&Array.isArray(d.masks)&&d.masks.every(m=>Object.hasOwn(MASKS,m)));
const validCounts=d=>d.counts===undefined||(Number.isInteger(d.counts.runs)&&d.counts.runs>0&&Array.isArray(d.counts.outcomes)&&d.counts.outcomes.length===admitted(d).length&&d.counts.outcomes.every(n=>Number.isInteger(n)&&n>0)&&d.counts.outcomes.reduce((a,b)=>a+b,0)===d.counts.runs&&typeof d.evidence==='string'&&d.evidence.length>0);
if(!Array.isArray(vendorDefects)||new Set(vendorDefects.map(d=>d.id)).size!==vendorDefects.length||vendorDefects.some(d=>!d.id||!d.reason||!validScope(d)||!['darwin','linux'].includes(d.platform)||!d.runtimeRelease||!d.case||d.assertion?.ok!==false||!d.result||!validResult(d)||!validMasks(d)||!validCounts(d)))throw new Error('Invalid scoped vendor-defect declaration');
export function declaredVendorDefect(meta,row,rows){
 if(Object.hasOwn(row,'cell')||row.assertion?.ok!==false)return null;
 return vendorDefects.find(d=>{
  if(meta.host!==d.host||engineScoped(d)&&meta.engine!==d.engine||meta.platform!==d.platform||meta.runtimeRelease!==d.runtimeRelease||row.case!==d.case||!isDeepStrictEqual(row.assertion,d.assertion)||(row.vendorDefect&&row.vendorDefect!==d.id))return false;
  const observation=rows.find(r=>r.case===d.case&&r.cell==='boundary'),result=rows.find(r=>r.case===d.case&&r.cell===d.result.cell);
  if(!engineScoped(d)&&!(observation?.ok===true&&isDeepStrictEqual(observation.value,d.observation)))return false;
  return result?.ok===true&&result.isError===d.result.isError&&Array.isArray(result.content)&&admitted(d).some(content=>isDeepStrictEqual(masked(d,result.content),content));
 })??null;
}
// A run's assertions: passed, pending, a declared vendor defect (recorded, never covered), or an unexpected failure.
export function assessAssertions(meta,rows){
 const unexpectedFailures=[],recorded=[],recordedAssertionRows=[],passed=new Set(),pending=new Set();
 for(const row of rows.filter(r=>Object.hasOwn(r,'assertion'))){
  // A provisional oracle cell's case is pending on its platform; an assertion that does not say so is not counted.
  const provisional=row.assertion?.ok===true?provisionalCellsFor(meta.platform,row.case,recordedCells(rows,row.case)):[];
  if(provisional.length){if(row.assertion.covered===false&&provisional.every(p=>row.assertion.pendingCells?.includes(p.cell)))pending.add(row.case);else unexpectedFailures.push(row);continue;}
  if(row.assertion?.ok===true){if(row.assertion.covered===false){if(meta.pendingObligations?.includes(row.case)&&meta.pendingEnvironment?.some(d=>d.member===row.case))pending.add(row.case);else unexpectedFailures.push(row);}else if(!row.fake)passed.add(row.case);continue;}
  const defect=declaredVendorDefect(meta,row,rows);
  if(defect){recorded.push({id:defect.id,case:row.case,platform:defect.platform,reason:defect.reason});recordedAssertionRows.push(row);continue;}
  unexpectedFailures.push(row);
 }
 return {unexpectedFailures,vendorDefects:recorded,recordedAssertionRows,coveredCases:passed.size,pendingCases:[...pending],recordedCases:passed.size+recorded.length+pending.size};
}
