// Offline qualification reader: uploaded files are data, never code. Keep denominators and N/A explicit.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {summarize,classify,calibrate,calKey,ENGINE_REF,MAIN_REF} from './qualification-model.mjs';
const stats=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>a.length?a[Math.ceil(a.length*p)-1]:null;return {n:a.length,p50:q(.5),p95:q(.95),max:q(1)}};
const delta=(samples,key)=>samples.slice(1).map((s,i)=>s[key]-samples[i][key]);
export function qualificationMetrics(rows){
 const watch=rows.flatMap(r=>r.watch?.samples??[]),keys=[...new Set(rows.filter(r=>r.scene==='background').map(r=>r.editor+'\t'+r.key))];
 const priceRows=rows.filter(r=>r.scene==='background'&&r.action&&!r.action.error),pairKey=r=>r.editor+'\t'+r.key;
 const byCell=keys.map(k=>{const [editor,key]=k.split('\t'),rs=priceRows.filter(r=>pairKey(r)===k),fix=rs.filter(r=>r.engine==='fix'&&r.action.meta?.inputRoute===3),mainPlain=rs.filter(r=>r.engine==='main'&&r.action.meta?.inputRoute==="2'");return {editor,key,fix:stats(fix.map(r=>r.action.durationMs)),mainPlain:stats(mainPlain.map(r=>r.action.durationMs)),fixGuardMs:stats(fix.map(r=>r.action.meta?.activationGuardMs))}});
 const comparableKeys=new Set(byCell.filter(x=>x.fix.n&&x.mainPlain.n).map(x=>x.editor+'\t'+x.key));
 const comparable=priceRows.filter(r=>comparableKeys.has(pairKey(r)));
 const routingViolations=rows.filter(r=>r.action).flatMap(r=>{const expected=r.scene==='foreground'?"2'":r.engine==='fix'||r.key.includes('cmd+')?3:"2'",actual=r.action.meta?.inputRoute??null;return actual===expected?[]:[{id:r.id,expected,actual}]});
 const routeGroups=new Map();for(const r of rows.filter(r=>r.action)){const route=r.action.meta?.inputRoute??'missing',k=[r.engine,r.scene,route].join('/');let g=routeGroups.get(k);if(!g){g={engine:r.engine,scene:r.scene,route,rows:0,errors:0,values:[],guards:[]};routeGroups.set(k,g)}g.rows++;if(r.action.error)g.errors++;else{g.values.push(r.action.durationMs);g.guards.push(r.action.meta?.activationGuardMs)}}
 return {routingViolations,watch:{samples:watch.length,sources:[...new Set(rows.map(r=>r.watch?.source).filter(Boolean))],frontGapsMs:stats(rows.flatMap(r=>delta(r.watch?.samples??[],'frontAt'))),sampleEndGapsMs:stats(rows.flatMap(r=>delta(r.watch?.samples??[],'at'))),orderStartGapsMs:stats(watch.map(s=>s.gapMs)),orderBlindMs:stats(watch.map(s=>s.blindMs)),orderSpanMs:stats(watch.map(s=>s.spanMs)),queryMs:stats(watch.map(s=>s.queryMs)),mainLoopAgeMs:stats(watch.map(s=>s.mainLoopAgeMs)),unreadableOrder:watch.filter(s=>s.orderReadable!==true).length,missingFront:watch.filter(s=>!(s.frontmostPid>0)).length},
  price:{definition:'Successful cold production RPCs; comparable pool uses identical editor/key cells whose main call naturally took plain posting. Main Command chords are not a plain-post control.',byCell,
   comparable:{fix:stats(comparable.filter(r=>r.engine==='fix'&&r.action.meta?.inputRoute===3).map(r=>r.action.durationMs)),mainPlain:stats(comparable.filter(r=>r.engine==='main'&&r.action.meta?.inputRoute==="2'").map(r=>r.action.durationMs))},
   routes:[...routeGroups.values()].map(({values,guards,...g})=>({...g,actionMs:stats(values),activationGuardMs:stats(guards)}))}};
}
export function readQualification(out){
 const config=JSON.parse(readFileSync(join(out,'config.json'),'utf8')),path=join(out,'rows.jsonl'),raw=existsSync(path)?readFileSync(path,'utf8').trim():'';
 if(config.mode!=='qualification'||config.engine!==ENGINE_REF||config.main!==MAIN_REF||typeof config.smoke!=='boolean')throw Error('wrong qualification provenance');
 const rows=raw?raw.split('\n').map(JSON.parse):[],summary=summarize(rows,config.smoke),metrics=qualificationMetrics(rows);
 const stopped=existsSync(join(out,'engine-stopped.json'))?JSON.parse(readFileSync(join(out,'engine-stopped.json'),'utf8')):{};
 Object.assign(summary,{config,engineStopped:stopped.stopped===true,failure:config.failure??null,...metrics});
 summary.complete=summary.coverage.complete&&summary.engineStopped&&!summary.failure;
 const calibrations=new Map(),judged=rows.map(r=>{const s=classify(r,calibrations.get(calKey(r)));if(r.engine==='fix'&&r.scene==='foreground')calibrations.set(calKey(r),calibrate(r));return {r,s}});
 summary.nonPassingFix=judged.filter(({r,s})=>r.engine==='fix'&&!['pass','notApplicable'].includes(s.outcome)).map(({r,s})=>({id:r.id,outcome:s.outcome,reasons:s.reasons,setupFailed:s.setupFailed}));
 summary.invalidMain=judged.filter(({r,s})=>r.engine==='main'&&['invalid','uncalibrated'].includes(s.outcome)).map(({r,s})=>({id:r.id,outcome:s.outcome}));
 summary.cleanup={observed:rows.filter(r=>r.cleanup).length,changed:judged.filter(({s})=>s.cleanupChanged).length,corrupted:judged.filter(({s})=>s.cleanupCorrupted).length,documentStillFocused:rows.filter(r=>r.scene==='background'&&r.cleanup?.documentHasFocus===true).map(r=>r.id)};
 summary.qualified=summary.complete&&!summary.nonPassingFix.length&&!summary.invalidMain.length&&!summary.routingViolations.length&&!judged.some(({s})=>s.sideEffect||!s.sideEffectKnown)&&summary.cleanup.observed===rows.length&&!summary.cleanup.corrupted&&!summary.cleanup.documentStillFocused.length;
 summary.elapsedMs=config.finishedAt-config.startedAt;
 summary.bindingWaitRows=rows.filter(r=>r.fixtureBindingAttempts?.length>1).map(r=>({id:r.id,reads:r.fixtureBindingAttempts.length,spanMs:r.fixtureBindingAttempts.at(-1).at-r.fixtureBindingAttempts[0].at}));
 writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));
 const tab=v=>v==null?'':String(v).replace(/[\t\r\n]/g,' '),tsv=(name,headers,rs)=>writeFileSync(join(out,name),[headers,...rs].map(r=>r.map(tab).join('\t')).join('\n')+'\n');
 if(summary.cells.length){const cols=Object.keys(summary.cells[0]);tsv('rates.tsv',cols,summary.cells.map(c=>cols.map(k=>c[k])))}
 tsv('judgments.tsv',['id','outcome','reasons','setupFailed','naReason','route','actionMs','cleanupChanged'],judged.map(({r,s})=>[r.id,s.outcome,JSON.stringify(s.reasons),JSON.stringify(s.setupFailed),s.naReason,r.action?.meta?.inputRoute,r.action?.durationMs,s.cleanupChanged]));
 tsv('price.tsv',['editor','key','fixN','fixP50','fixP95','mainPlainN','mainPlainP50','mainPlainP95','fixGuardP50','fixGuardP95'],metrics.price.byCell.map(c=>[c.editor,c.key,c.fix.n,c.fix.p50,c.fix.p95,c.mainPlain.n,c.mainPlain.p50,c.mainPlain.p95,c.fixGuardMs.p50,c.fixGuardMs.p95]));
 return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const s=readQualification(process.argv[2]);console.log(JSON.stringify({complete:s.complete,qualified:s.qualified,denominator:s.denominator,coverage:s.coverage,watch:s.watch,nonPassingFix:s.nonPassingFix,routingViolations:s.routingViolations}));if(!s.complete)process.exitCode=1}
