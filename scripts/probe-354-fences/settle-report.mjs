// Pure offline reporting for the #354 settle comparison (cohort 'settle-ab'). No browser, engine or GUI; no thresholds.
// arm main = the build BEFORE the settle, arm branch = the build AFTER it (or a later head). Race and clean cells are the
// rate/cost core; every other cell of the cohort keeps its own diagnostic outcomes, and all valid cells count toward the safety totals.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {answer,abPlan,BROWSERS,EDITORS} from './ab-model.mjs';
import {quantiles} from './classify.mjs';
import {readbackStatus} from './ab-extra.mjs';

export const SETTLE_COHORT='settle-ab';
const ARMS=['main','branch'],CORE_PARTS=['race','clean'],POLL_MS=15,EXPECTED_LIMIT='#394';
const NOTES=[
 'Latency is informational: no threshold, gate or significance test.',
 'settleReads counts COMPLETED ADDITIONAL value/range pairs after the first read, not total reads. The candidate wire omits zero reads and a false capped flag; the old baseline has no settle fields at all, so its reads and capped state are reported as unavailable, never as zero.',
 'Beside a PLAIN branch readback record, an absent settleReads means 0 completed additional pairs. Secret or concealed records return before either settle field, so their absence stays unavailable (latency, snapshotMs and safety still count). That does not show no wait occurred: an early guard exit can sleep before the count increments.',
 'There is no dedicated settle-only timer. programmedWaitLowerBoundMs is 15 ms times settleReads: a programmed-wait lower bound only, never a measured settle duration. The snapshotMs delta is a proxy; call latency also includes avoided or added polling and delivery.',
 'Race and clean cells are the rate and cost core. Other cells of the cohort keep separate diagnostic outcomes, and wrong successes and privacy violations are counted across every valid cell. A typeUnconfirmed on a Firefox secret cell recorded as a background setup (foregroundSetup===false) is the expected limit '+EXPECTED_LIMIT+', labelled expected-unconfirmed, not a contract failure; foreground or unknown setup state is never labelled so.',
 'No leaving keys run in this cohort, so a success with correct===false is a wrong success with no qualified-key exemption.',
];
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const secretPart=r=>r.part==='secret'||r.part==='secret-selection'||r.secret===true;
// #394 is a background-Firefox limit: only a real setup record of foregroundSetup===false qualifies; foreground or unknown state never does.
const backgroundFirefoxSecret=r=>r.browser==='firefox'&&secretPart(r)&&r.foregroundSetup===false;
const isCore=r=>CORE_PARTS.includes(r.part);
const frac=(numerator,denominator,name)=>({numerator,denominator,[name]:denominator?numerator/denominator:null});
const delta=(b,m)=>b==null||m==null?null:+(b-m).toFixed(2);
function flat(prefix,q){return {[prefix+'N']:q.n,[prefix+'P50']:q.p50,[prefix+'P95']:q.p95,[prefix+'Max']:q.max}}
const cmp=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
const pick=(r,keys)=>Object.fromEntries(keys.map(k=>[k,r[k]??null]));

function typeReadbackOf(r){
 const raw=r.typeRPC?.raw,rec=(raw?.result?.meta??raw?.error?.meta??r.typeRPC?.meta)?.typeReadback;
 return rec!=null&&typeof rec==='object'?rec:null;
}
// Each reported value stays reported. Only a PLAIN branch readback record turns an omitted field into its wire default:
// concealed records return before either settle field, so their absence is not evidence of zero reads or a false cap.
function settleFields(r,rec){
 const out={settleReads:null,settleReadsState:'unavailable',settleCapped:null,settleCappedState:'unavailable'};
 if(!rec)return out;
 const implied=r.arm==='branch'&&!secretPart(r)&&rec.concealed!==true&&rec.secure!==true;
 if(rec.settleReads!==undefined){
  if(Number.isSafeInteger(rec.settleReads)&&rec.settleReads>=0)Object.assign(out,{settleReads:rec.settleReads,settleReadsState:'reported'});
  else out.settleReadsState='invalid';
 }else if(implied)Object.assign(out,{settleReads:0,settleReadsState:'absent-zero'});
 if(rec.settleCapped!==undefined){
  if(typeof rec.settleCapped==='boolean')Object.assign(out,{settleCapped:rec.settleCapped,settleCappedState:'reported'});
  else out.settleCappedState='invalid';
 }else if(implied)Object.assign(out,{settleCapped:false,settleCappedState:'absent-false'});
 return out;
}
function observe(r){
 const raw=r.typeRPC?.raw;let outcome=null;
 if(raw!=null){try{const a=answer(raw);outcome=a.success?'success':a.unconfirmed?'typeUnconfirmed':'otherError'}catch{outcome='malformed'}}
 const rec=typeReadbackOf(r),s=settleFields(r,rec),valid=r.valid===true;
 const limit=outcome==='typeUnconfirmed'&&backgroundFirefoxSecret(r);
 return {...pick(r,['id','arm','browser','editor','part','variant','key','length','rep']),core:isCore(r),valid,inStats:valid&&['success','typeUnconfirmed','otherError'].includes(outcome),
  backgroundSetup:typeof r.foregroundSetup==='boolean'?!r.foregroundSetup:null,outcome,correct:typeof r.correct==='boolean'?r.correct:null,expectedUnconfirmed:limit,
  durationMs:num(r.typeRPC?.durationMs),snapshotMs:num(rec?.snapshotMs),hasReadback:rec!==null,
  ...s,programmedWaitLowerBoundMs:s.settleReads==null?null:s.settleReads*POLL_MS,
  keysUnconfirmed:raw!=null&&outcome!=='malformed'?+(readbackStatus(raw).keysUnconfirmed>0):0,
  privacyViolation:!!r.privacyViolation||(Array.isArray(r.privacyFindings)&&r.privacyFindings.length>0),contractFailure:!!r.contractFailure,
  refusalReason:outcome==='success'||raw==null||outcome==='malformed'?null:readbackStatus(raw).reason??raw.error?.errorName??'(not reported)',
  problem:typeof r.problem==='string'?r.problem.split('\n')[0]:null,engine:r.engine??null,row:r};
}

function groupBy(list,dims){
 const m=new Map();
 for(const o of list){const d=Object.fromEntries(dims.map(k=>[k,o[k]??null])),key=JSON.stringify(d);if(!m.has(key))m.set(key,{d,list:[]});m.get(key).list.push(o)}
 return [...m.values()].sort((a,b)=>cmp(a.d,b.d));
}
function rateStats(list){
 const valid=list.filter(o=>o.inStats),count=f=>valid.filter(f).length,suc=o=>o.outcome==='success',ref=o=>o.outcome==='typeUnconfirmed';
 const falseU=count(o=>ref(o)&&o.correct===true),wrong=count(o=>suc(o)&&o.correct===false);
 return {attempted:list.length,valid:valid.length,invalid:list.filter(o=>!o.valid).length,malformed:list.filter(o=>o.valid&&!o.inStats).length,
  missingCorrectness:count(o=>o.correct===null),success:count(suc),typeUnconfirmed:count(ref),otherErrors:count(o=>o.outcome==='otherError'),
  wrong:count(o=>o.correct===false),keysUnconfirmed:valid.reduce((n,o)=>n+o.keysUnconfirmed,0),
  falseUnconfirmed:frac(falseU,valid.length,'rate'),falseUnconfirmedAmongRefusals:frac(falseU,count(ref),'fraction'),
  wrongSuccess:{count:wrong,denominator:valid.length,rate:valid.length?wrong/valid.length:null},
  privacyViolations:list.filter(o=>o.privacyViolation).length,privacyViolationsValid:valid.filter(o=>o.privacyViolation).length};
}
function diagnosticStats(list){
 const valid=list.filter(o=>o.inStats),count=f=>valid.filter(f).length,wrong=count(o=>o.outcome==='success'&&o.correct===false),reasons={};
 for(const o of valid)if(o.outcome!=='success')reasons[o.refusalReason]=(reasons[o.refusalReason]??0)+1;
 const refusals=valid.filter(o=>o.outcome==='typeUnconfirmed'),limit=list.some(o=>backgroundFirefoxSecret(o.row));
 const limited=o=>o.expectedUnconfirmed;
 return {attempted:list.length,valid:valid.length,invalid:list.filter(o=>!o.valid).length,malformed:list.filter(o=>o.valid&&!o.inStats).length,
  success:count(o=>o.outcome==='success'),confirmed:valid.filter(o=>o.row.typeRPC&&readbackStatus(o.row.typeRPC.raw).confirmed).length,
  successConfirmed:count(o=>o.outcome==='success'&&readbackStatus(o.row.typeRPC.raw).confirmed),typeUnconfirmed:refusals.length,
  expectedUnconfirmed:refusals.filter(limited).length,unexpectedUnconfirmed:refusals.filter(o=>!limited(o)).length,expectedLimit:limit?EXPECTED_LIMIT:null,
  finalMatch:count(o=>o.correct===true),otherErrors:count(o=>o.outcome==='otherError'),refusalReasons:reasons,wrong:count(o=>o.correct===false),
  wrongSuccess:{count:wrong,denominator:valid.length,rate:valid.length?wrong/valid.length:null},
  privacyViolations:list.filter(o=>o.privacyViolation).length,privacyViolationsValid:valid.filter(o=>o.privacyViolation).length,
  contractFailures:list.filter(o=>o.contractFailure&&!limited(o)).length,contractFailuresExpectedLimit:list.filter(o=>o.contractFailure&&limited(o)).length};
}
function costStats(list){
 const v=list.filter(o=>o.inStats),q=f=>quantiles(v.map(f)),count=s=>v.filter(o=>o.settleReadsState===s).length;
 const reads=v.map(o=>o.settleReads).filter(x=>x!=null),capped=v.filter(o=>o.settleCapped!=null);
 return {trials:v.length,...flat('duration',q(o=>o.durationMs)),...flat('snapshot',q(o=>o.snapshotMs)),...flat('reads',quantiles(reads)),
  readsReported:count('reported'),readsAbsentZero:count('absent-zero'),readsUnavailable:count('unavailable'),readsInvalid:count('invalid'),
  readsNonzero:reads.filter(n=>n>0).length,cappedKnown:capped.length,cappedTrue:capped.filter(o=>o.settleCapped===true).length,
  ...flat('programmedWaitLowerBound',q(o=>o.programmedWaitLowerBoundMs))};
}

function coverageFor(obs,reps){
 const shards=groupBy(obs,['browser','editor','arm']),plans=new Map();
 return shards.map(({d,list})=>{
  const pk=d.browser+'/'+d.editor;
  if(!plans.has(pk)){
   const core=BROWSERS.includes(d.browser)&&EDITORS.includes(d.editor)?abPlan({browser:d.browser,editor:d.editor,reps}).filter(c=>CORE_PARTS.includes(c.part)).map(c=>[c.part,c.key,c.length,c.rep].join('/')):[];
   const diag=d.browser==='safari'&&d.editor==='input'?Array.from({length:reps},(_,i)=>['no-key/plain/'+(i+1),'secret/equality/'+(i+1)]).flat():[];
   plans.set(pk,{core,diag});
  }
  const {core,diag}=plans.get(pk),coreRows=list.filter(o=>o.core),diagRows=list.filter(o=>!o.core);
  const coreKey=o=>[o.part,o.key,o.length,o.rep].join('/'),diagKey=o=>[o.part,o.variant,o.rep].join('/');
  const coreSeen=new Set(coreRows.map(coreKey)),diagSeen=new Set(diagRows.map(diagKey));
  const validCore=new Set(coreRows.filter(o=>o.inStats).map(coreKey)),validDiag=new Set(diagRows.filter(o=>o.inStats).map(diagKey));
  const r={...d,planned:core.length,observed:coreRows.length,valid:core.filter(k=>validCore.has(k)).length,missing:core.filter(k=>!coreSeen.has(k)).length,
   unexpected:coreRows.filter(o=>!core.includes(coreKey(o))).length,
   diagnosticPlanned:diag.length,diagnosticObserved:diagRows.length,diagnosticValid:diag.filter(k=>validDiag.has(k)).length,
   diagnosticMissing:diag.filter(k=>!diagSeen.has(k)).length,diagnosticUnexpected:diagRows.filter(o=>!diag.includes(diagKey(o))).length};
  return {...r,complete:r.valid===r.planned&&r.unexpected===0&&r.diagnosticValid===r.diagnosticPlanned&&r.diagnosticUnexpected===0};
 });
}

export function summarizeSettle(rows,{reps=20}={}){
 const cells=[],seen=new Set();let other=0;
 for(const r of rows){
  if(r?.recordKind!=='cell'){other++;continue}
  if(r.cohort!==SETTLE_COHORT)throw Error(`cohort mismatch: settle report accepts only ${SETTLE_COHORT} cells but ${r.id} is ${r.cohort??'(no cohort)'}; cohorts are never pooled`);
  if(!ARMS.includes(r.arm))throw Error('unknown arm '+r.arm+' in '+r.id);
  if(!BROWSERS.includes(r.browser))throw Error('unknown browser '+r.browser+' in '+r.id);
  if(isCore(r)&&!EDITORS.includes(r.editor))throw Error('unknown editor '+r.editor+' in '+r.id);
  const dup=[r.arm,r.browser,r.editor,r.id].join('|');
  if(seen.has(dup))throw Error('duplicate trial would be double-counted: '+dup);seen.add(dup);
  cells.push(r);
 }
 const obs=cells.map(observe),core=obs.filter(o=>o.core),diag=obs.filter(o=>!o.core);
 const table=(list,dims,stats)=>groupBy(list,dims).map(({d,list})=>({...d,...stats(list)}));
 const overall=table(core,['browser','arm','part'],rateStats),cellRates=table(core,['browser','arm','editor','part','key','length'],rateStats);
 const diagnostics=table(diag,['browser','arm','editor','part','variant'],diagnosticStats);
 const cost=table(core,['browser','arm','part','key','length'],costStats),diagnosticCost=table(diag,['browser','arm','part','variant','key','length'],costStats);
 // Matched deltas: group quantiles (pooled over editors) and, from the same repetition of the same cell, per-trial pairs.
 const pairKey=o=>[o.browser,o.editor,o.part,o.key,o.length,o.rep].join('|'),mains=new Map(core.filter(o=>o.arm==='main').map(o=>[pairKey(o),o]));
 const pairedTrials=core.filter(o=>o.arm==='branch'&&mains.has(pairKey(o))).map(b=>{
  const m=mains.get(pairKey(b)),both=m.inStats&&b.inStats,d=f=>both?delta(b[f],m[f]):null;
  return {browser:b.browser,editor:b.editor,part:b.part,key:b.key,length:b.length,rep:b.rep,mainId:m.id,branchId:b.id,mainValid:m.inStats,branchValid:b.inStats,
   mainOutcome:m.outcome,branchOutcome:b.outcome,mainDurationMs:m.durationMs,branchDurationMs:b.durationMs,durationDeltaMs:d('durationMs'),
   mainSnapshotMs:m.snapshotMs,branchSnapshotMs:b.snapshotMs,snapshotDeltaMs:d('snapshotMs'),
   branchSettleReads:b.settleReads,branchSettleReadsState:b.settleReadsState,branchSettleCapped:b.settleCapped,branchProgrammedWaitLowerBoundMs:b.programmedWaitLowerBoundMs};
 }).sort(cmp);
 const costAB=[],dims=['browser','part','key','length'];
 for(const {d} of groupBy(cost,dims)){
  const m=cost.find(c=>c.arm==='main'&&dims.every(k=>c[k]===d[k])),b=cost.find(c=>c.arm==='branch'&&dims.every(k=>c[k]===d[k]));
  for(const [metric,prefix,field] of [['durationMs','duration','durationDeltaMs'],['snapshotMs','snapshot','snapshotDeltaMs']]){
   const deltas=pairedTrials.filter(p=>dims.every(k=>p[k]===d[k])).map(p=>p[field]),pq=quantiles(deltas);
   costAB.push({...d,metric,mainN:m?.[prefix+'N']??0,branchN:b?.[prefix+'N']??0,mainP50:m?.[prefix+'P50']??null,branchP50:b?.[prefix+'P50']??null,
    deltaP50:delta(b?.[prefix+'P50'],m?.[prefix+'P50']),mainP95:m?.[prefix+'P95']??null,branchP95:b?.[prefix+'P95']??null,deltaP95:delta(b?.[prefix+'P95'],m?.[prefix+'P95']),
    pairedN:pq.n,pairedDeltaP50:pq.p50,pairedDeltaP95:pq.p95,pairedDeltaMax:pq.max});
  }
 }
 const wrongSuccesses=obs.filter(o=>o.inStats&&o.outcome==='success'&&o.correct===false).map(o=>({...pick(o,['id','arm','browser','editor','part','variant','key','length','rep','core','engine','durationMs']),
  ...(o.core?{expected:o.row.expectedFinal??null,actual:o.row.final??null}:{}),typeReadback:typeReadbackOf(o.row)})).sort((a,b)=>(a.arm==='branch'?-1:1)-(b.arm==='branch'?-1:1)||cmp(a,b));
 const safety=groupBy(obs,['browser','arm']).map(({d,list})=>({...d,attempted:list.length,validCells:list.filter(o=>o.inStats).length,
  wrongSuccesses:list.filter(o=>o.inStats&&o.outcome==='success'&&o.correct===false).length,privacyViolations:list.filter(o=>o.privacyViolation).length,
  privacyViolationsValid:list.filter(o=>o.inStats&&o.privacyViolation).length,contractFailures:list.filter(o=>o.contractFailure&&!o.expectedUnconfirmed).length}));
 const invalidTrials=obs.filter(o=>!o.valid||(o.valid&&!o.inStats)).map(o=>({...pick(o,['id','arm','browser','editor','part','variant','key','length','rep','core','privacyViolation']),problem:o.valid?'malformed engine response':o.problem}));
 return {cohort:SETTLE_COHORT,notes:NOTES,scope:{reps,corePlan:'12 shards x (race cmd+a/cmd+z/cmd+v at 30, clean 30/120/500)',extraCells:'Safari input no-key plain and trusted-secret equality'},
  ignored:{warmupOrOtherRecords:other},overall,cells:cellRates,diagnostics,safety,invalidTrials,wrongSuccesses,
  privacyViolationTrials:obs.filter(o=>o.privacyViolation).map(o=>pick(o,['id','arm','browser','editor','part','variant','valid'])),
  cost,costAB,diagnosticCost,pairedTrials,coverage:coverageFor(obs,reps),
  observations:obs.map(({row,inStats,...o})=>o)};
}

function tsv(rows,columns){return [columns.join('\t'),...rows.map(r=>columns.map(k=>r[k]==null?'':typeof r[k]==='object'?JSON.stringify(r[k]):r[k]).join('\t'))].join('\n')+'\n'}
const rateColumns=[ 'attempted','valid','invalid','malformed','missingCorrectness','success','typeUnconfirmed','otherErrors','wrong','keysUnconfirmed',
 'falseUnconfirmedNumerator','falseUnconfirmedDenominator','falseUnconfirmedRate','refusalFalseUnconfirmedNumerator','refusalFalseUnconfirmedDenominator','refusalFalseUnconfirmedFraction',
 'wrongSuccess','wrongSuccessRate','privacyViolations','privacyViolationsValid'];
const flatRate=g=>({...g,falseUnconfirmedNumerator:g.falseUnconfirmed.numerator,falseUnconfirmedDenominator:g.falseUnconfirmed.denominator,falseUnconfirmedRate:g.falseUnconfirmed.rate,
 refusalFalseUnconfirmedNumerator:g.falseUnconfirmedAmongRefusals.numerator,refusalFalseUnconfirmedDenominator:g.falseUnconfirmedAmongRefusals.denominator,
 refusalFalseUnconfirmedFraction:g.falseUnconfirmedAmongRefusals.fraction,wrongSuccess:g.wrongSuccess.count,wrongSuccessRate:g.wrongSuccess.rate});
const costColumns=['trials','durationN','durationP50','durationP95','durationMax','snapshotN','snapshotP50','snapshotP95','snapshotMax','readsN','readsP50','readsP95','readsMax',
 'readsReported','readsAbsentZero','readsUnavailable','readsInvalid','readsNonzero','cappedKnown','cappedTrue','programmedWaitLowerBoundN','programmedWaitLowerBoundP50','programmedWaitLowerBoundP95','programmedWaitLowerBoundMax'];
export function writeSettleTables(out,rows,opts){
 const s=summarizeSettle(rows,opts);mkdirSync(out,{recursive:true});
 const w=(name,text)=>writeFileSync(join(out,name),text);
 w('settle-summary.json',JSON.stringify(s,null,2));
 w('settle-rates.tsv',tsv(s.overall.map(flatRate),['browser','arm','part',...rateColumns]));
 w('settle-rates-cells.tsv',tsv(s.cells.map(flatRate),['browser','arm','editor','part','key','length',...rateColumns]));
 w('settle-diagnostics.tsv',tsv(s.diagnostics.map(g=>({...g,wrongSuccess:g.wrongSuccess.count})),['browser','arm','editor','part','variant','attempted','valid','invalid','malformed','success','confirmed','successConfirmed','typeUnconfirmed','expectedUnconfirmed','unexpectedUnconfirmed','expectedLimit','finalMatch','otherErrors','wrong','wrongSuccess','privacyViolations','privacyViolationsValid','contractFailures','contractFailuresExpectedLimit','refusalReasons']));
 w('settle-diagnostic-cost.tsv',tsv(s.diagnosticCost,['browser','arm','part','variant','key','length',...costColumns]));
 w('settle-safety.tsv',tsv(s.safety,['browser','arm','attempted','validCells','wrongSuccesses','privacyViolations','privacyViolationsValid','contractFailures']));
 w('settle-invalid.tsv',tsv(s.invalidTrials,['id','arm','browser','editor','part','variant','key','length','rep','core','privacyViolation','problem']));
 w('settle-wrong-successes.jsonl',s.wrongSuccesses.map(r=>JSON.stringify(r)).join('\n')+(s.wrongSuccesses.length?'\n':''));
 w('settle-cost.tsv',tsv(s.cost,['browser','arm','part','key','length',...costColumns]));
 w('settle-cost-ab.tsv',tsv(s.costAB,['browser','part','key','length','metric','mainN','branchN','mainP50','branchP50','deltaP50','mainP95','branchP95','deltaP95','pairedN','pairedDeltaP50','pairedDeltaP95','pairedDeltaMax']));
 w('settle-paired.tsv',tsv(s.pairedTrials,['browser','editor','part','key','length','rep','mainId','branchId','mainValid','branchValid','mainOutcome','branchOutcome','mainDurationMs','branchDurationMs','durationDeltaMs','mainSnapshotMs','branchSnapshotMs','snapshotDeltaMs','branchSettleReads','branchSettleReadsState','branchSettleCapped','branchProgrammedWaitLowerBoundMs']));
 w('settle-observations.tsv',tsv(s.observations,['id','arm','browser','editor','part','variant','key','length','rep','core','valid','outcome','correct','backgroundSetup','expectedUnconfirmed','durationMs','snapshotMs','hasReadback','settleReads','settleReadsState','settleCapped','settleCappedState','programmedWaitLowerBoundMs','keysUnconfirmed','privacyViolation','contractFailure','refusalReason','problem','engine']));
 w('settle-coverage.tsv',tsv(s.coverage,['browser','editor','arm','planned','observed','valid','missing','unexpected','diagnosticPlanned','diagnosticObserved','diagnosticValid','diagnosticMissing','diagnosticUnexpected','complete']));
 return s;
}
