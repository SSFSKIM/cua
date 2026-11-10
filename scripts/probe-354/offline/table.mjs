// Offline only. Stream raw traces into compact facts and per-cell tables.
// node table.mjs <artifact directory> [<table output directory>]
import {writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {records,stats} from './read.mjs';
const root=process.argv[2],out=process.argv[3]??root;mkdirSync(out,{recursive:true});
const factPath=join(out,'facts.jsonl');writeFileSync(factPath,'');
const facts=[],failures=[],examples=[],configs=new Map();
const hasText=(values,text)=>JSON.stringify(values??[]).includes(text);
const textValues=r=>r.stateValues??r.stateAXValues??[];
for await(const {row:r,config,source,lineNumber} of records(root)){
 configs.set(source,{...config,source});
 const first=r.samples?.[0],final=r.final,expected=r.expected?.final,correct=r.correct===true;
 const valid=!r.problem&&!r.key?.error&&!r.type?.error;
 const stateContains=Object.hasOwn(r,'stateContains')?r.stateContains:(r.stateAXContains??hasText(textValues(r),r.text));
 const shotValues=r.screenshotValues??r.screenshotAXValues??[];
 const screenshotContains=Object.hasOwn(r,'screenshotAXContains')?r.screenshotAXContains:(r.screenshotContains??hasText(shotValues,r.text));
 const stateReadable=!r.state?.error&&typeof stateContains==='boolean';
 const screenshotReadable=!!r.screenshot&&!r.screenshot.error&&typeof screenshotContains==='boolean';
 const inputs=r.trace?.filter(e=>e.event==='input')??[];
 const full=r.samples?.find(s=>s.text===expected);
 const requestedPresent=typeof final==='string'&&final.includes(r.text);
 const firstRequestedPresent=typeof first?.text==='string'&&first.text.includes(r.text);
 const requestedFull=r.samples?.find(s=>typeof s.text==='string'&&s.text.includes(r.text));
 const properPrefix=typeof first?.text==='string'&&typeof expected==='string'&&first.text.length<expected.length&&expected.startsWith(first.text);
 const keyProofNeeded=r.part==='rate'&&['key-effect','combined'].includes(r.mode);
 const typeProofNeeded=['typed','combined'].includes(r.mode);
 const admitted=valid&&(!keyProofNeeded||r.key?.probe?.confirmed===true)&&(!typeProofNeeded||r.type?.probe?.confirmed===true);
 const f={browser:config.browser,phase:config.phase??'all',part:r.part,editor:r.editor,key:r.keyName,mode:r.mode,length:r.length,
   variant:r.variant??r.scene??(r.alreadySelected?'already-selected':'normal'),sameRPC:r.sameRPC??false,foreground:r.foreground??false,
   rep:r.rep,id:r.id,source,lineNumber,valid,problem:r.problem??r.key?.error??r.type?.error??null,correct,
   wrong:valid&&r.correct===false,missingTyped:valid&&typeof final==='string'&&!requestedPresent,requestedPresent,
   dom0Incomplete:valid&&first?.text!==expected,dom0RequestedIncomplete:valid&&!firstRequestedPresent,dom0Prefix:valid&&properPrefix,latePrefix:valid&&properPrefix&&correct,lateRequested:valid&&!firstRequestedPresent&&requestedPresent,
   stateReadable,stateUnavailable:valid&&!stateReadable,stateContains,statePartial:valid&&requestedPresent&&stateReadable&&!stateContains,
   screenshotN:!!r.screenshot,screenshotReadable,screenshotUnavailable:valid&&!!r.screenshot&&!screenshotReadable,screenshotContains,screenshotAXPartial:valid&&requestedPresent&&screenshotReadable&&!screenshotContains,
   effectPredicatePreSatisfied:r.effectPredicatePreSatisfied,axOracleAvailable:r.axOracleAvailable,
   keyToTypeGapMs:r.keyToTypeGapMs,beforeKeyForeground:r.beforeKeyForeground,
   keyUnconfirmed:r.key?.probe?.confirmed===false,typeUnconfirmed:r.type?.probe?.confirmed===false,
   keyConfirmed:r.key?.probe?.confirmed===true,typeConfirmed:r.type?.probe?.confirmed===true,
   confirmedWrong:valid&&r.type?.probe?.confirmed===true&&r.correct===false,
   admitted,candidateRefused:valid&&!admitted,admittedWrong:admitted&&r.correct===false,admittedMissingTyped:admitted&&!requestedPresent,
   keyCostMs:r.key?.probe?.ms,typeCostMs:r.type?.probe?.ms,keyRpcMs:r.key?.durationMs,typeRpcMs:r.type?.durationMs,stateRpcMs:r.state?.durationMs,
   keyOverrunMs:r.key?.probe?.overrunMs,typeOverrunMs:r.type?.probe?.overrunMs,
   firstSampleAfterReturnMs:first?.at-r.returnedAt,firstCompleteSampleMs:correct&&full?Math.max(0,full.at-r.returnedAt):null,
   firstRequestedCompleteSampleMs:requestedPresent&&requestedFull?Math.max(0,requestedFull.at-r.returnedAt):null,
   settleAfterReturnMs:requestedPresent&&inputs.length?Math.max(0,inputs.at(-1).at-r.returnedAt):null,
   keyProbe:r.key?.probe,preKeyProbe:r.preKey?.probe354,typeProbe:r.type?.probe,stateScreenshot:r.stateScreenshot??r.stateScreenshotPath,
   screenshot:r.screenshotPath,pixelEvidence:r.pixelEvidence??null,ocr:r.ocr??r.screenshotOCR??r.ocrResults??null,
   samples:r.samples?.map(s=>({delay:s.delay??s.delayMs,at:s.at,text:s.text,selection:s.selection})),
   requested:r.text,expected,final};
 facts.push(f);appendFileSync(factPath,JSON.stringify(f)+'\n');
 if(!valid)failures.push({browser:f.browser,id:f.id,problem:f.problem,source,lineNumber});
 if(f.wrong&&examples.filter(e=>e.browser===f.browser&&e.editor===f.editor&&e.key===f.key&&e.variant===f.variant&&e.mode===f.mode).length<1)
   examples.push({...f,trace:r.trace?.slice(0,30),keyRPC:r.key,typeRPC:r.type});
}
function group(xs,keys){const m=new Map();for(const r of xs){const k=keys.map(k=>r[k]).join('|');if(!m.has(k))m.set(k,[]);m.get(k).push(r)}return [...m.values()]}
const countFields=['wrong','missingTyped','requestedPresent','dom0Incomplete','dom0RequestedIncomplete','dom0Prefix','latePrefix','lateRequested','stateReadable','stateUnavailable','statePartial','screenshotN','screenshotReadable','screenshotUnavailable','screenshotAXPartial','keyUnconfirmed','typeUnconfirmed','keyConfirmed','typeConfirmed','confirmedWrong','admitted','candidateRefused','admittedWrong','admittedMissingTyped'];
const metrics=['keyCostMs','typeCostMs','keyRpcMs','typeRpcMs','stateRpcMs','settleAfterReturnMs','firstSampleAfterReturnMs','firstCompleteSampleMs','firstRequestedCompleteSampleMs','keyOverrunMs','typeOverrunMs'];
const dims=['browser','part','editor','key','mode','length','variant','sameRPC','foreground'];
function summarize(a){const s=Object.fromEntries(dims.map(k=>[k,a[0][k]]));s.n=a.length;s.valid=a.filter(r=>r.valid).length;s.invalid=s.n-s.valid;for(const k of countFields)s[k]=a.filter(r=>r.valid&&r[k]).length;for(const k of metrics)s[k]=stats(a.filter(r=>r.valid).map(r=>r[k]));return s}
const cells=group(facts,dims).map(summarize),overall=group(facts,['browser','part','mode','variant']).map(summarize);
writeFileSync(join(out,'summary.json'),JSON.stringify({rows:facts.length,configs:[...configs.values()],cells,overall,failures,examples},null,2));
const cols=[...dims,'n','valid','invalid',...countFields];writeFileSync(join(out,'rates.tsv'),[cols.join('\t'),...cells.map(s=>cols.map(k=>s[k]).join('\t'))].join('\n')+'\n');
writeFileSync(join(out,'costs.tsv'),[[...dims,'metric','n','p50','p95','max'].join('\t'),...cells.flatMap(s=>metrics.map(k=>[...dims.map(x=>s[x]),k,...['n','p50','p95','max'].map(x=>s[k][x])].join('\t')))].join('\n')+'\n');
for(const s of overall)console.log(s.browser,s.part,s.mode,s.variant,JSON.stringify({n:s.n,valid:s.valid,wrong:s.wrong,missingTyped:s.missingTyped,dom0:s.dom0RequestedIncomplete,lateRequested:s.lateRequested,statePartial:s.statePartial,stateReadable:s.stateReadable,shotReadable:s.screenshotReadable,keyUnconfirmed:s.keyUnconfirmed,typeUnconfirmed:s.typeUnconfirmed,confirmedWrong:s.confirmedWrong,keyCost:s.keyCostMs,typeCost:s.typeCostMs,settle:s.settleAfterReturnMs}));
console.log('Rows',facts.length,'invalid',failures.length,'tables',out);
