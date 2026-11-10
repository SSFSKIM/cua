// Hosted-only diagnostic. Reuses the reviewed driver unchanged; exclusions are NOT completed-cell evidence.
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
export const ENGINE_REF='3c669314e0a5f35aedf20f9b792604fc09628c45';
export const CFT_DOMAIN='com.google.chrome.for.testing',PERIOD_KEY='NSAutomaticPeriodSubstitutionEnabled';
export const SELECTED_IDS=[
 'partial/contenteditable/normal/cmd+a/typed/500/two/behind/19',
 'partial/contenteditable/normal/cmd+a/baseline/500/two/behind/20',
];
const KEYS=[PERIOD_KEY,'NSAutomaticCapitalizationEnabled','NSAutomaticSpellingCorrectionEnabled','NSAutomaticTextReplacementEnabled','NSAutomaticQuoteSubstitutionEnabled','NSAutomaticDashSubstitutionEnabled','NSContinuousSpellCheckingEnabled'];
const DOMAINS=['NSGlobalDomain',CFT_DOMAIN];
export function assertHosted(env=process.env){if(env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('disposable github-hosted runners only')}
function cellId({part,editor,key,mode,rep,length=30,sameRPC=false,foreground=false,scene='normal'}){return [part,editor,scene,key,mode,length,sameRPC?'one':'two',foreground?'front':'behind',rep].join('/')}
export async function enumerateCells(source){
 const start=source.indexOf(" if(PHASE!=='partial')for"),end=source.indexOf('\n}catch(e)',start);
 if(start<0||end<0)throw Error('reviewed driver scheduling fragment not found');
 const cells=[];
 // Only execute the trusted driver's scheduling fragment, with cell() replaced by a collector: no app/input APIs.
 await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})()',{
  PHASE:'partial',REPS:20,editors:['contenteditable'],native:false,cell:async args=>cells.push(cellId(args)),
 },{timeout:1000});
 if(new Set(cells).size!==cells.length)throw Error('duplicate driver cell schedule');return cells;
}
export async function createExclusions(source,selectedIds=SELECTED_IDS){
 if(JSON.stringify(selectedIds)!==JSON.stringify(SELECTED_IDS))throw Error('selected diagnostic IDs must be the fixed two outliers');
 const scheduled=await enumerateCells(source);if(!selectedIds.every(id=>scheduled.includes(id)))throw Error('selected diagnostic ID absent from reviewed driver');
 const completedIds=scheduled.filter(id=>!selectedIds.includes(id));
 return {sourceRun:null,purpose:'Diagnostic exclusions, not evidence that these cells were completed',selectedIds:[...selectedIds],
  implementationNote:'completedIds is the existing --skip-completed input field; every entry here is an exclusion, not prior execution evidence',
  engineRef:ENGINE_REF,driverSHA256:createHash('sha256').update(source).digest('hex'),
  excludedCounts:{partial:completedIds.filter(id=>id.startsWith('partial/')).length,mechanism:completedIds.filter(id=>id.startsWith('mechanism/')).length},completedIds};
}
export function snapshot(stage,run){
 const preferences=[];
 for(const domain of DOMAINS)for(const key of KEYS){
  const r=run('defaults',['read',domain,key],{encoding:'utf8'});
  if(r.status===0)preferences.push({domain,key,state:'present',value:r.stdout.trim()});
  else if(/does not exist/i.test(r.stderr??''))preferences.push({domain,key,state:'unset',value:null});
  else throw Error('defaults read '+domain+' '+key+': '+(r.stderr||r.error?.message||r.status));
 }
 return {stage,at:Date.now(),valueFormat:'raw defaults-read strings; unset is not false or a runtime-effective value',preferences};
}
export function disablePeriod(run){
 for(const domain of DOMAINS){const r=run('defaults',['write',domain,PERIOD_KEY,'-bool','NO'],{encoding:'utf8'});if(r.status!==0)throw Error('defaults write '+domain+': '+(r.stderr||r.error?.message||r.status))}
}
export function annotateConfig(config,plan){return {...config,diagnostic:{name:'period-substitution-off-two-outliers',sourceRun:null,purpose:plan.purpose,selectedIds:plan.selectedIds,
 excludedCounts:plan.excludedCounts,excludedCells:plan.completedIds?.length,exclusionsAreNotPriorEvidence:true,
 limit:'One execution per selected cell, not20 new repetitions. This selected two-outlier check cannot estimate a failure rate, reproduce prior long-lived browser history, or prove causality. Unset preferences are not false; stored NO does not prove Chromium honors the setting.'}}}
async function main(){
 assertHosted();if(process.env.ENGINE_REF&&process.env.ENGINE_REF!==ENGINE_REF)throw Error('engine pin differs from diagnostic');
 const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?undefined:process.argv[i+1]},OUT=arg('out');
 for(const key of ['out','engine','tool','ocr'])if(!arg(key))throw Error('missing --'+key);
 const driver=fileURLToPath(new URL('../probe-354/measure.mjs',import.meta.url)),plan=await createExclusions(readFileSync(driver,'utf8'));
 mkdirSync(OUT,{recursive:true});const exclusions=join(OUT,'diagnostic-exclusions.json'),defaultsFile=join(OUT,'defaults.jsonl');
 writeFileSync(exclusions,JSON.stringify(plan,null,2));writeFileSync(join(OUT,'diagnostic.json'),JSON.stringify(annotateConfig({},plan).diagnostic,null,2));
 const record=stage=>{const s=snapshot(stage,spawnSync);appendFileSync(defaultsFile,JSON.stringify(s)+'\n');console.log(JSON.stringify(s));return s};
 record('before');disablePeriod(spawnSync);const after=record('after-period-off');
 for(const domain of DOMAINS)if(!after.preferences.some(p=>p.domain===domain&&p.key===PERIOD_KEY&&p.state==='present'&&p.value==='0'))throw Error('period substitution override not confirmed for '+domain);
 let result;
 try{
  // One driver invocation; it still performs its usual calibrations, sampling, AX observations and screenshots.
  result=spawnSync(process.execPath,[driver,'--browser','cft','--phase','partial','--editors','contenteditable','--reps','20','--smoke','false','--skip-completed',exclusions,
   '--engine',arg('engine'),'--tool',arg('tool'),'--ocr',arg('ocr'),'--out',OUT],{stdio:'inherit',env:process.env});
 }finally{
  const path=join(OUT,'config.json'),config=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
  writeFileSync(path,JSON.stringify(annotateConfig(config,plan),null,2));record('after-measurement');
 }
 if(result.error)throw result.error;if(result.status!==0){process.exitCode=result.status??1;return}
 const rowsPath=join(OUT,'rows.jsonl'),rows=existsSync(rowsPath)?readFileSync(rowsPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 if(rows.length!==2||SELECTED_IDS.some(id=>rows.filter(r=>r.id===id).length!==1))throw Error('diagnostic executed unexpected cell scope; inspect preserved rows');
 console.log('Diagnostic complete: one attempt per historical outlier ID; no rate or causal inference.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===realpathSync(process.argv[1]))main().catch(e=>{console.error(e.stack??e);process.exitCode=1});
