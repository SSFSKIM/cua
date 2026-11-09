// Focused #330 merge-turn gate: persist each table line before continuing.
// node scripts/probe-330/offline/ticking-table.mjs <downloaded-run-directory>
import {readFileSync,readdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):e.name==='results.json'?[join(d,e.name)]:[]);
const sets=walk(root).map(file=>({file,...JSON.parse(readFileSync(file,'utf8'))}));
const rows=sets.flatMap(s=>s.results.map(r=>({...r,head:s.config.head,group:s.config.group,source:s.file})));
const table=join(root,'tick-tables.txt');writeFileSync(table,'');
const line=s=>{appendFileSync(table,s+'\n');console.log(s);};
const why=r=>r.click?.stalePoint?.reason??r.click?.error??'-';
const refused=rows.filter(r=>why(r)==='newElementOverPoint');
line('NEW-ELEMENT REFUSALS — FIRST, INCLUDING ANY COVERAGE-INVALID ATTEMPT');
line(`Count: ${refused.length}`);
for(const r of refused) {
  const chain=r.refusalSignals?.hit??r.signals?.hit;
  const i=chain?.newElementIndex;
  line(JSON.stringify({head:r.head,label:r.label,record:r.click?.stalePoint,recorded:r.ticking?.recorded,
    hitThroughNewElement:Number.isInteger(i)?chain.chain.slice(0,i+1):null,
    fullSideChain:chain?.chain,sideRecorded:chain?.chainRecorded,sideNewElementListed:chain?.newElementListed,
    evidenceSource:r.refusalSignals?'post-refusal side read':'pre-click side read',
    coverage:r.ticking,source:r.source}));
}
line('\nHEADS AND COMPLETENESS');
for(const s of sets)line(JSON.stringify({group:s.config.group,head:s.config.head,engine:s.config.engineRef,kit:s.config.commit,rows:s.results.length,minutes:s.config.minutes,exception:s.config.exception,budgetStop:s.config.budgetStop}));
line('\n| head | browser | cell | attempted | valid text/tick/frame evidence | kept | dL | other refusal reasons |');
line('|---|---|---|---:|---:|---:|---:|---|');
const matrix=[];
for(const head of ['main','branch'])for(const app of ['safari','cft','firefox'])for(const cell of ['clock','relative']) {
  const rs=rows.filter(r=>r.head===head&&r.app===app&&r.scene===`shared:${cell}`);
  const errors=rs.filter(r=>r.click?.error);
  const counts=Object.fromEntries([...new Set(errors.map(why))].map(w=>[w,errors.filter(r=>why(r)===w).length]));
  const item={head,app,cell,attempted:rs.length,valid:rs.filter(r=>r.ticking?.valid).length,kept:rs.filter(r=>r.click&&!r.click.error).length,dl:rs.filter(r=>why(r)==='newElementOverPoint').length,reasons:counts};
  matrix.push(item);line(`| ${head} | ${app} | ${cell} | ${item.attempted} | ${item.valid} | ${item.kept} | ${item.dl} | ${JSON.stringify(counts)} |`);
}
line('\nEVERY ATTEMPT: ACTIONS, TICKS, FRAME VALIDATION AND ROLE CHAIN');
for(const r of rows)line(JSON.stringify({head:r.head,label:r.label,reason:why(r),error:r.click?.error,landed:r.landed,problem:r.problem,exception:r.exception,ticking:r.ticking,shotTreeCut:r.atShot?.shotTreeCut,mutations:r.mutations,source:r.source}));
const complete=matrix.every(m=>m.valid>=6)&&sets.every(s=>!s.config.exception&&!s.config.budgetStop);
const gate=complete&&refused.filter(r=>r.head==='branch').length===0;
const summary={gate,complete,refusals:refused,matrix,configs:sets.map(s=>({source:s.file,config:s.config}))};
writeFileSync(join(root,'tick-summary.json'),JSON.stringify(summary,null,2));
line(`\nCOMPLETE ${complete}; ZERO-dL GATE ${gate}`);
