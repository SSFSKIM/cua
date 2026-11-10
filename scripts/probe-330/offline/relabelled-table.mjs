// #298 A/B reader: report every relabelled refusal first, then coverage and every observation's walk cost.
// node scripts/probe-330/offline/relabelled-table.mjs <downloaded-run-directory>
import {readFileSync,readdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {relabelledLabels,walkStats,requiredRefusal} from './relabelled-report.mjs';
const root=resolve(process.argv[2]);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):e.name==='results.json'?[join(d,e.name)]:[]);
const sets=[],parseErrors=[];
for(const file of walk(root))try{sets.push({file,...JSON.parse(readFileSync(file,'utf8'))});}catch(e){parseErrors.push({file,error:String(e)});}
const rows=sets.flatMap(s=>(s.results??[]).map(r=>({...r,head:s.config.head,group:s.config.group,source:s.file})));
const file=join(root,'relabelled-tables.txt');writeFileSync(file,'');
const line=s=>{appendFileSync(file,s+'\n');console.log(s);};
const why=r=>r.click?.stalePoint?.reason??r.click?.error??'-';
const own=r=>r.group.startsWith('relabel-')||r.group.startsWith('typed-');
const expectation=r=>own(r)?r.expectation:'keep';
const clicked=r=>!!r.click&&!r.problem&&!r.exception;
const valid=r=>clicked(r)&&(!own(r)||r.coverage?.valid===true);
const refusal=rows.filter(r=>why(r)==='relabelled').sort((a,b)=>Number(expectation(a)!=='keep')-Number(expectation(b)!=='keep'));
const falseRefusals=refusal.filter(r=>r.head==='branch'&&expectation(r)!=='relabelled');
line('EVERY RELABELLED REFUSAL — OLD AND NEW LABELS FIRST');
line(`Measured: ${refusal.length}; branch refusals on expected-kept/unknown cases: ${falseRefusals.length}`);
for(const r of refusal)line(JSON.stringify({head:r.head,label:r.label,editorAX:r.editorAX,editorRoleChain:r.editorSideRoleChain,expectation:expectation(r),labels:relabelledLabels(r.click?.message),message:r.click?.message,coverage:r.coverage,record:r.click?.stalePoint,chain:r.signals?.hit?.chain,source:r.source}));
line('\nDATASETS AND COMPLETENESS');
for(const s of sets)line(JSON.stringify({group:s.config.group,head:s.config.head,engine:s.config.engineRef,kit:s.config.commit,rows:s.results?.length,minutes:s.config.minutes,exception:s.config.exception,budgetStop:s.config.budgetStop,manifest:s.config.relabelCases}));
for(const e of parseErrors)line(`UNREADABLE ${JSON.stringify(e)}`);
const typingProbe=process.argv.includes('--typing-probe'),focused=process.argv.includes('--focused');
const groups=typingProbe?['typed-chrome','typed-safari','typed-firefox']:focused?['typed-chrome','typed-safari','typed-firefox','relabel-chrome']:['relabel-chrome','relabel-safari','relabel-firefox','relabel-native','gate-chrome','gate-safari','gate-firefox','gate-native','sweep-chrome','sweep-safari','sweep-firefox'];
const heads=typingProbe?['main']:['main','branch'];
const missingDatasets=groups.flatMap(group=>heads.filter(head=>!sets.some(s=>s.config.group===group&&s.config.head===head&&s.results?.length)).map(head=>({group,head})));
line(`Missing required datasets: ${JSON.stringify(missingDatasets)}`);
line('\nOWN CELLS: CONTROL AND BRANCH OUTCOMES');
line('| head | app | case | expected | rows | valid | kept | relabelled | other reasons |');
line('|---|---|---|---|---:|---:|---:|---:|---|');
const keys=[...new Set(rows.filter(own).map(r=>`${r.app}|${r.caseName??r.cell??r.label}`))];
for(const key of keys)for(const head of ['main','branch']) {
  const rs=rows.filter(r=>own(r)&&r.head===head&&`${r.app}|${r.caseName??r.cell??r.label}`===key);
  if(!rs.length)continue;
  const reasons=Object.fromEntries([...new Set(rs.filter(r=>r.click?.error&&why(r)!=='relabelled').map(why))].map(w=>[w,rs.filter(r=>r.click?.error&&why(r)===w).length]));
  line(`| ${head} | ${key.split('|').join(' | ')} | ${[...new Set(rs.map(expectation))].join(',')} | ${rs.length} | ${rs.filter(valid).length} | ${rs.filter(r=>clicked(r)&&!r.click.error).length} | ${rs.filter(r=>why(r)==='relabelled').length} | ${JSON.stringify(reasons)} |`);
}
const keyFor=r=>`${r.app}|${r.caseName??r.cell}|${r.rep}`;
const control=new Map(rows.filter(r=>r.head==='main').map(r=>[keyFor(r),r]));
const expectedRefusals=rows.filter(r=>r.head==='branch'&&expectation(r)==='relabelled');
const catchMisses=expectedRefusals.filter(r=>!requiredRefusal(r,control.get(keyFor(r))));
const recreatedRefusals=expectedRefusals.filter(r=>why(r)==='nodeGone'&&requiredRefusal(r,control.get(keyFor(r))));
const invalidOwn=rows.filter(r=>own(r)&&!valid(r));
const requiredInvalidOwn=invalidOwn.filter(r=>!r.diagnostic);
const unknownExpectation=rows.filter(r=>own(r)&&!['keep','relabelled'].includes(expectation(r)));
line(`\nMust-refuse misses: ${JSON.stringify(catchMisses.map(r=>({label:r.label,reason:why(r),problem:r.problem,coverage:r.coverage})))}`);
line(`Introduced recreated-label refusals (control kept): ${JSON.stringify(recreatedRefusals.map(r=>({label:r.label,reason:why(r),oldLabel:r.coverage?.oldLabel,newLabel:r.coverage?.newLabel})))}`);
line(`Invalid own-case evidence (including diagnostic variants): ${JSON.stringify(invalidOwn.map(r=>({head:r.head,label:r.label,diagnostic:r.diagnostic,problem:r.problem,exception:r.exception,coverage:r.coverage})))}`);
line(`Unknown own-case expectations: ${JSON.stringify(unknownExpectation.map(r=>r.label))}`);
line('\nSHARED SWEEP');
for(const head of ['main','branch']) {
  const rs=rows.filter(r=>!own(r)&&r.head===head);
  line(JSON.stringify({head,rows:rs.length,clicked:rs.filter(clicked).length,kept:rs.filter(r=>clicked(r)&&!r.click.error).length,relabelled:rs.filter(r=>why(r)==='relabelled').length,unusable:rs.filter(r=>!clicked(r)).length}));
}
const observations=sets.flatMap(s=>(s.config.observationTimings??[]).map(o=>({...o,head:s.config.head,group:s.config.group,source:s.file})));
const appKey=o=>o.app?.bundleIdentifier??o.app?.displayName??`unknown-pid-${o.pid??'none'}`;
const apps=[...new Set(observations.map(appKey))];
const timing=[];
line('\nEVERY OBSERVATION: walkMs p50 / p95 / max (nearest observation quantile; no warm/pick observations excluded)');
line('| app | head | total observations | walks with timing | p50 ms | p95 ms | max ms |');
line('|---|---|---:|---:|---:|---:|---:|');
for(const app of apps)for(const head of ['main','branch']) {
  const os=observations.filter(o=>appKey(o)===app&&o.head===head),stats=walkStats(os);
  timing.push({app,head,total:os.length,...stats});
  line(`| ${app} | ${head} | ${os.length} | ${stats.n} | ${stats.p50} | ${stats.p95} | ${stats.max} |`);
}
const missingTiming=sets.filter(s=>!s.config.observationTimings?.length).map(s=>({file:s.file,group:s.config.group,head:s.config.head}));
line(`Missing central observation timing logs: ${JSON.stringify(missingTiming)}`);
const datasetFailures=sets.filter(s=>s.config.exception||s.config.budgetStop).map(s=>({file:s.file,config:s.config}));
const summary={falseRefusals,refusals:refusal,catchMisses,recreatedRefusals,invalidOwn,requiredInvalidOwn,unknownExpectation,missingDatasets,parseErrors,datasetFailures,timing,missingTiming};
writeFileSync(join(root,'relabelled-summary.json'),JSON.stringify(summary,null,2));
writeFileSync(join(root,'observations.json'),JSON.stringify(observations,null,2));
line(`\nZERO RELABELLED FALSE REFUSALS: ${falseRefusals.length===0}; REQUIRED CATCHES: ${catchMisses.length===0}; VALID REQUIRED OWN CELLS: ${requiredInvalidOwn.length===0&&unknownExpectation.length===0}`);
