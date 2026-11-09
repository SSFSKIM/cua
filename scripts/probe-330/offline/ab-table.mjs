// Disk-backed A/B reader. Run from the trusted checkout, passing downloaded artifact directories as data.
// node scripts/probe-330/offline/ab-table.mjs <run-dir> [<run-dir>...]
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {validateGateRow,summarizeGateCoverage} from '../gate.mjs';
const roots=process.argv.slice(2).map(p=>resolve(p));
if(!roots.length)throw new Error('pass artifact directories');
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):e.name==='results.json'?[join(d,e.name)]:[]);
const sets=roots.flatMap(walk).map(file=>({file,...JSON.parse(readFileSync(file,'utf8'))}));
const rows=sets.flatMap(s=>s.results.map(r=>({...r,head:s.config.head,group:s.config.group,source:s.file})));
const out=[];const line=s=>out.push(s);
const reason=r=>r.click?.stalePoint?.reason??r.click?.error??'-';
const dl=r=>reason(r)==='newElementOverPoint';
const usable=r=>r.click&&!r.problem&&!r.exception;
const gate=r=>r.part==='still';
const wrong=r=>r.part==='suggest'&&r.skind!=='wiki'&&usable(r)&&!r.click.error&&r.result&&r.result.landing!=='landed';
const covered=r=>r.part==='suggest'&&r.seq==='suggest'&&['button','checkbox','link'].includes(r.target);
const key=r=>`${r.group}|${r.label}`;
const control=new Map(rows.filter(r=>r.head==='main').map(r=>[key(r),r]));
const branch=new Map(rows.filter(r=>r.head==='branch').map(r=>[key(r),r]));
const q=(xs,p)=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.round(p*(a.length-1))]:null;};
const stats=xs=>({n:xs.filter(Number.isFinite).length,p50:q(xs,.5),p95:q(xs,.95),max:q(xs,1)});
const statText=xs=>{const s=stats(xs);return `${s.p50} / ${s.p95} / ${s.max} (n=${s.n})`;};
const countBy=xs=>Object.fromEntries([...new Set(xs)].map(x=>[x,xs.filter(y=>y===x).length]));
const flags=sets.filter(s=>s.config.exception||s.config.budgetStop);
const invalid=rows.filter(r=>!usable(r));
const measuredRefusals=rows.filter(dl); // Do not filter out coverage problems, setup problems or exceptions.
const coverage=sets.filter(s=>/^gate-(chrome|safari|firefox)$/.test(s.config.group)).map(s=>({file:s.file,head:s.config.head,group:s.config.group,validation:summarizeGateCoverage(s.results)}));
const coverageProblems=rows.map(r=>({row:r,validation:validateGateRow(r) ?? r.coverage})).filter(x=>x.validation && !x.validation.valid);
const falseRefusals=rows.filter(r=>r.head==='branch'&&dl(r)&&(gate(r)||control.get(key(r))?.result?.landing==='landed'));
line('ALL MEASURED NEW-ELEMENT REFUSALS (including coverage-invalid cells)');
line(`Count: ${measuredRefusals.length}`);
for(const r of measuredRefusals)line(JSON.stringify({head:r.head,label:r.label,scene:r.scene,problem:r.problem,exception:r.exception,coverage:validateGateRow(r) ?? r.coverage,record:r.click.stalePoint,source:r.source}));
line('\nNEW-ELEMENT REFUSALS ON GATE CELLS (not necessarily coverage-valid)');
line(`Count: ${falseRefusals.length}`);
for(const r of falseRefusals){line(JSON.stringify({label:r.label,scene:r.scene,recorded:r.click.stalePoint,node:r.node,mutations:r.mutations,main:control.get(key(r))?.click,chain:r.signals?.hit?.chain,systemChain:r.signals?.systemHit?.chain,source:r.source}));}
line('\nRUN CONFIGURATION AND COMPLETENESS');
for(const s of sets)line(JSON.stringify({file:s.file,group:s.config.group,head:s.config.head,engine:s.config.engineRef,kit:s.config.commit,minutes:s.config.minutes,rows:s.results.length,exception:s.config.exception,budgetStop:s.config.budgetStop}));
line(`Invalid/missing-click rows: ${invalid.length}; exception/budget-stop datasets: ${flags.length}`);
for(const r of invalid)line(JSON.stringify({label:r.label,head:r.head,problem:r.problem,exception:r.exception,source:r.source}));
line('\nREQUIRED GATE EVIDENCE (recomputed from raw evidence, not variant names or DOM click success)');
for(const c of coverage)line(JSON.stringify(c));
line(`Coverage-invalid rows: ${coverageProblems.length}`);
for(const {row:r,validation} of coverageProblems)line(JSON.stringify({head:r.head,label:r.label,validation,source:r.source}));
line('\nSHARED REAL-PAGE CONTENT PICKS (AXWebArea bounds and page-only samples)');
for(const s of sets)for(const [name,picks] of Object.entries(s.config).filter(([k])=>k.startsWith('shared-picks-')))line(JSON.stringify({head:s.config.head,name,picks,source:s.file}));
line('\nGATE COVERAGE (raw click/landing counts below are NOT evidence-valid case counts)');
line('| head | app | scene | rows | clicked | kept | refused reasons | landed / explicit expectations |');
line('|---|---|---|---|---|---|---|---|');
const scenes=[...new Set(rows.filter(gate).map(r=>`${r.app}|${r.scene}`))];
for(const scene of scenes)for(const head of ['main','branch']){
  const rs=rows.filter(r=>gate(r)&&`${r.app}|${r.scene}`===scene&&r.head===head);
  if(!rs.length)continue;
  const clicked=rs.filter(usable),refused=clicked.filter(r=>r.click.error);
  line(`| ${head} | ${scene.split('|').join(' | ')} | ${rs.length} | ${clicked.length} | ${clicked.filter(r=>!r.click.error).length} | ${JSON.stringify(countBy(refused.map(reason)))} | ${clicked.filter(r=>r.landed===true).length}/${clicked.filter(r=>typeof r.landed==='boolean').length} |`);
}
line('\nSUGGESTION CATCHES BY BROWSER AND KIND (paired main wrong clicks; every covered-click denominator is also shown)');
line('| app | kind | main covered clicked | main wrong / kept | branch dL on paired wrong | branch any refusal on paired wrong | branch dL total |');
line('|---|---|---|---|---|---|---|');
const kinds=[...new Set(rows.filter(r=>r.part==='suggest').map(r=>`${r.app}|${r.skind}`))];
for(const kind of kinds){
  const ms=rows.filter(r=>r.head==='main'&&`${r.app}|${r.skind}`===kind&&covered(r)&&usable(r));
  const ws=ms.filter(wrong);const bs=ws.map(r=>branch.get(key(r))).filter(Boolean);
  const all=rows.filter(r=>r.head==='branch'&&`${r.app}|${r.skind}`===kind&&r.seq==='suggest');
  line(`| ${kind.split('|').join(' | ')} | ${ms.length} | ${ws.length} | ${bs.filter(dl).length}/${ws.length} | ${bs.filter(r=>r.click?.error).length}/${ws.length} | ${all.filter(dl).length}/${all.filter(usable).length} |`);
}
line('\nWIKIPEDIA SUGGESTIONS');
for(const r of rows.filter(r=>r.skind==='wiki'))line(JSON.stringify({head:r.head,label:r.label,reason:reason(r),error:r.click?.error,problem:r.problem,target:r.targetNode,chain:dl(r)?r.signals?.hit?.chain:undefined}));
line('\nCOST: WHOLE STALE-POINT GUARD ms (p50 / p95 / max); newElementReads is a count, not an isolated timer');
const apps=[...new Set(rows.map(r=>r.app))];
for(const app of apps)for(const head of ['main','branch']){
  const rs=rows.filter(r=>r.app===app&&r.head===head&&r.click?.stalePoint);
  line(`${app} ${head}: guard ${statText(rs.map(r=>r.click.stalePoint.ms))}; dL reads ${JSON.stringify(countBy(rs.map(r=>r.click.stalePoint.newElementReads??0)))}`);
}
line('\nBYTE-BUDGET EVIDENCE');
for(const r of rows.filter(r=>r.scene==='shared:budget'))line(JSON.stringify({head:r.head,label:r.label,coverage:validateGateRow(r),fixture:r.fixture,atShot:r.atShot?.hit,observation:r.observation,reason:reason(r),point:r.point,chain:r.signals?.hit?.chain,landed:r.landed}));
line('\nLINK TEXT AND RE-CREATED CONTROLS');
for(const r of rows.filter(r=>/^shared:(link-|recreate|spa)/.test(r.scene)))line(JSON.stringify({head:r.head,label:r.label,coverage:validateGateRow(r),fixture:r.fixture,atShot:r.atShot?.hit,record:r.click?.stalePoint,landed:r.landed,error:r.click?.error,mutations:r.mutations,chain:r.signals?.hit?.chain}));
line('\nOTHER GATE REFUSALS');
for(const r of rows.filter(r=>gate(r)&&usable(r)&&r.click.error&&!dl(r)))line(JSON.stringify({head:r.head,label:r.label,record:r.click.stalePoint,error:r.click.error,chain:r.signals?.hit?.chain}));
const summary={datasets:sets.map(s=>({file:s.file,config:s.config,rows:s.results.length})),measuredRefusals,coverage,coverageProblems,falseRefusals,invalid,flags:flags.map(s=>({file:s.file,config:s.config})),cost:Object.fromEntries(apps.map(app=>[app,Object.fromEntries(['main','branch'].map(head=>[head,stats(rows.filter(r=>r.app===app&&r.head===head&&r.click?.stalePoint).map(r=>r.click.stalePoint.ms))]))]))};
for(const root of roots){writeFileSync(join(root,'tables.txt'),out.join('\n')+'\n');writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2));}
console.log(out.join('\n'));
