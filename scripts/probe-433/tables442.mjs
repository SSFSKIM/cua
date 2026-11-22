// #442's README tables from one downloaded run: node scripts/probe-433/tables442.mjs <dir> [label] (gh run download <id> -D <dir>).
// Valid main rows only. Per unit and lane: where main's click went; what each signal said (signals.mjs `signalsOf`); and
// how many rows main kept and landed that each option would have refused.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {LANES,UNITS,unitKey} from './cells.mjs';
import {quantiles} from './check.mjs';

const [dir,label='run']=process.argv.slice(2);
const load=(d,f)=>existsSync(join(dir,d,f))?JSON.parse(readFileSync(join(dir,d,f),'utf8')):null;
const lanes={};
for(const d of readdirSync(dir).filter(d=>/^probe-4[0-9]{2}-/.test(d))){const s=load(d,'status.json');if(s?.lane)lanes[s.lane]={status:s,rows:load(d,'rows.json')??[]};}
const order=LANES.filter(l=>lanes[l]);
const tally=list=>Object.entries(list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{})).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}`).join(', ')||'–';
const rowsOf=(l,u)=>lanes[l].rows.filter(r=>r.valid&&r.head==='main'&&unitKey(r)===unitKey(u)&&r.verdict!=='observe-failed');
const units=UNITS.filter(u=>order.some(l=>rowsOf(l,u).length));
const count=(v,f)=>`${v.filter(f).length}/${v.length}`;
const q=xs=>{const x=quantiles(xs);return x?`${x.p50} / ${x.max}`:'–';};
const engine=lanes[order[0]]?.status?.refs?.main?.slice(0,8)??'?';

console.log(`#### Where main's click went (engine ${engine})\n\nA cell: the guard's verdict and reason, then the control the page logged the click on (\`twin\` is B; \`nothing\`: no event reached the page).\n`);
console.log(`| Unit | ${order.join(' | ')} |\n|---|${order.map(()=>'---|').join('')}`);
for(const u of units)console.log(`| ${unitKey(u)} | ${order.map(l=>{const v=rowsOf(l,u);return v.length?`${tally(v.map(r=>`${r.guard?.verdict??'none'} ${r.guard?.reason??'-'}`))}; on ${tally(v.map(r=>r.signals?.recipient??'?'))}`:'–';}).join(' | ')} |`);

console.log(`\n#### (a) and (b): the controls at the point (engine ${engine})\n\nPer lane and unit: the record's innermost controls at the point by role (\`rec\`), \`inert\` the record's node there an inert layer; the kit's full walk of the web area at the click (\`live\`); \`=dom\` the live names equal every control whose box holds the point on the page; \`rec≠live\` and \`pre≠live\` (live after the observation against live at the click) count rows whose sets differ; \`pruned/nav/vis=\` rows whose cheaper walk found the full walk's set; walk ms p50 / max (full; pruned) and elements visited p50.\n`);
console.log('| Lane | Unit | rec | inert | live | =dom | rec≠live | pre≠live | pruned= | nav= | vis= | full ms | pruned ms | visited |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for(const l of order)for(const u of units){const v=rowsOf(l,u).filter(r=>r.signals);if(!v.length)continue;const S=v.map(r=>r.signals);
  const post=S.map(s=>s.ax?.post).filter(Boolean);
  console.log(`| ${l} | ${unitKey(u)} | ${tally(S.map(s=>s.record?.role??'?'))} | ${count(S,s=>s.record?.inert)} | ${tally(S.map(s=>s.a?.livePost??'?'))} | ${count(S,s=>s.a?.complete)} | ${count(S,s=>s.a?.recordVsPost)} | ${count(S,s=>s.a?.preVsPost)} | ${count(S,s=>s.a?.prunedSame)} | ${count(S,s=>s.a?.navSame)} | ${count(S,s=>s.a?.visibleSame)} | ${q(post.map(p=>p.full?.ms))} | ${q(post.map(p=>p.pruned?.ms))} | ${quantiles(post.map(p=>p.full?.visited))?.p50??'–'} |`);}

console.log(`\n#### Stacking and the page's hit test (engine ${engine})\n\nEvery hit-test is read after the click, unless the run is warm. The engine's own hit (\`guard hit\`, its record's \`hitRole\`); the hit sequence at the point (\`seq\`: each answer and the ms it first came, 5 ms apart for 300 ms; \`warm seq\` the one read just before the click in a warm run); the AX hit at the point from the application (\`hit\`) and from the web area, the 5 x 5 grid of AX hits 4 pt apart (all rows' points pooled), the hits from the hit's ancestors that answer a control (\`pierce\`); where the page paints two or more controls at the point (before the change; at the click), whether the later in the AX tree is the one on top (\`tree=paint\`) and whether AXVisibleChildren left any covered control out (\`vis hides\`); elementFromPoint at the click (\`top\`) and whether it named the control the click reached (\`=recipient\`, over rows where an event reached the page).\n`);
console.log('| Lane | Unit | guard hit | warm seq | seq | hit | hit from web | grid | pierce | tree=paint, pre | tree=paint, click | vis hides | top | =recipient |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for(const l of order)for(const u of units){const v=rowsOf(l,u).filter(r=>r.signals);if(!v.length)continue;const S=v.map(r=>r.signals);
  const post=S.map(s=>s.ax?.after).filter(Boolean),grid={};
  const seq=k=>tally(S.map(s=>s.ax?.[k]?.seq).filter(Boolean).map(x=>x.map(e=>e.replace(/@\d+$/,'')).join('>')));
  const tmax=k=>{const x=quantiles(S.map(s=>s.ax?.[k]?.seq).filter(x=>x?.length>1).map(x=>Number(x[x.length-1].split('@')[1])));return x?` (last change ms p50 ${x.p50}, max ${x.max})`:'';};
  for(const p of post)for(const [k,n] of Object.entries(p.grid??{}))grid[k]=(grid[k]??0)+n;
  const st=k=>{const x=S.map(s=>s.stack?.[k]).filter(Boolean);return x.length?count(x,s=>s.treeAgrees):'–';};
  const hides=S.flatMap(s=>['pre','post'].map(k=>s.stack?.[k]).filter(Boolean)).filter(s=>Object.entries(s.visible??{}).some(([n,vis])=>n!==s.paintTop&&vis===false)).length;
  const pierce=post.filter(p=>(p.hitFromChain??[]).some(h=>!/>(overlay|nothing|AX)/.test(h))).length;
  const agree=S.filter(s=>s.c?.agrees!=null);
  console.log(`| ${l} | ${unitKey(u)} | ${tally(v.map(r=>r.guard?.hitRole??'none'))} | ${seq('warm')}${tmax('warm')} | ${seq('after')}${tmax('after')} | ${tally(post.map(p=>p.hit))} | ${tally(post.map(p=>p.hitFromWeb))} | ${Object.entries(grid).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}`).join(', ')||'–'} | ${pierce}/${post.length} | ${st('pre')} | ${st('post')} | ${hides} | ${tally(S.map(s=>s.c?.top??'?'))} | ${agree.length?count(agree,s=>s.c.agrees):'–'} |`);}

console.log(`\n#### Exposure: rows main kept and landed on the target that each rule would refuse (engine ${engine})\n\nUnder an inert node at the point (the record's), (a) the live set at the click differs from the record's (\`rec\`) or from the live set read after the observation (\`live\`); (b) the record holds two or more unrelated controls at the point and one of them is not found in place at the click (\`b\`; \`b eng\` counts the overlap by the engine's rule, role or AXPress, with the same trigger); and on any row, (c) elementFromPoint at the click names another control than the target (\`c\`).\n`);
console.log(`| Unit | ${order.map(l=>`${l}: kept-landed | a rec | a live | b | b eng | c`).join(' | ')} |\n|---|${order.map(()=>'---|---|---|---|---|---|').join('')}`);
const tot={};
for(const u of units){const cells=order.map(l=>{const v=rowsOf(l,u).filter(r=>r.verdict==='kept-landed'&&r.signals),S=v.map(r=>r.signals);
  const inert=S.filter(s=>s.record?.inert);
  const n=[v.length,inert.filter(s=>s.a?.recordVsPost).length,inert.filter(s=>s.a?.preVsPost).length,inert.filter(s=>s.b?.overlap&&s.a?.recordLost).length,
    inert.filter(s=>s.b?.overlapEngine&&s.a?.recordLost).length,S.filter(s=>s.c?.top&&s.c.top!=='target').length];
  tot[l]=(tot[l]??[0,0,0,0,0,0]).map((x,i)=>x+n[i]);return n.join(' | ');});
  console.log(`| ${unitKey(u)} | ${cells.join(' | ')} |`);}
console.log(`| all | ${order.map(l=>tot[l].join(' | ')).join(' | ')} |`);

const names=new Set();for(const l of order)for(const r of lanes[l].rows)for(const n of r.signals?.ax?.pre?.attributeNames??[])names.add(`${l}:${n}`);
const hint=[...names].filter(n=>/(z|order|layer|stack|index|visible|occlu|cover|paint|front|top)/i.test(n.split(':').pop()));
console.log(`\nAttribute names on the hit and the controls at the point that might bear on stacking (rep 0 rows): ${hint.join(', ')||'none'}.`);
console.log('\n| Run | Lane | Image | Browser | Rows | Abort | Presentation |\n|---|---|---|---|---|---|---|');
for(const l of order){const s=lanes[l].status;console.log(`| ${label} | ${l} | ${s.image??'?'} | ${s.version??'?'} | ${s.completed}/${s.planned} | ${s.abort??'none'} | ${s.presentation??'?'} |`);}
