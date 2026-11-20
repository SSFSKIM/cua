// Markdown tables from a downloaded run: node scripts/probe-433/report.mjs <dir> (gh run download <id> -D <dir>).
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {UNITS,unitKey} from './cells.mjs';
import {quantiles} from './check.mjs';

const dir=process.argv[2];
const load=(d,f)=>existsSync(join(dir,d,f))?JSON.parse(readFileSync(join(dir,d,f),'utf8')):null;
const arts=readdirSync(dir).filter(d=>d.startsWith('probe-433-')).sort();
const fmt=o=>Object.entries(o??{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(', ')||'–';
const g=x=>!x?'–':['dx','dw'].map(k=>`${k} ${x[k].median}${x[k].span[0]!==x[k].span[1]?` [${x[k].span[0]}, ${x[k].span[1]}]`:''}`).join('; ')+(x.dy.span[0]||x.dy.span[1]?`; dy ${x.dy.median}`:'');
for(const d of arts){
  const s=load(d,'status.json'),sum=load(d,'summary.json')??{};if(!s)continue;
  console.log(`\n### ${s.lane}: ${s.version??'?'}, ${s.presentation??'?'}${s.foregroundFallback?' (fallback: '+s.foregroundFallback+')':''}, image ${s.image??'?'}, ${s.completed}/${s.planned} rows, abort ${s.abort??'none'}, invalid ${fmt(s.invalid)}\n`);
  console.log('| Unit | Head | Valid | Verdicts | Guard (verdict/reason) | Recorded | Hit | Reached | Identity | Landed on the link | Wrong target | Click | Guard ms p50 / p95 / max | Presentation lost |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for(const u of UNITS)for(const h of ['main','fix']){
    const x=sum[`${h}|${unitKey(u)}`];if(!x)continue;
    console.log(`| ${unitKey(u)} | ${h} | ${x.valid}/${x.rows} | ${fmt(x.verdicts)} | ${fmt(x.reason)} | ${fmt(x.recorded)} | ${fmt(x.hitRole)} | ${fmt(x.reached)} | ${fmt(x.identity)} | ${x.landed} | ${x.wrong} | ${fmt(x.click)} | ${x.guardMs?`${x.guardMs.p50} / ${x.guardMs.p95} / ${x.guardMs.max}`:'–'} | ${x.presentationLost} |`);
  }
  console.log('\nGeometry, median [min, max]: the recorded node\'s AX frame at the observation against the same node\'s after the change (screen points), and the page\'s own (CSS px).\n');
  console.log('| Unit | Head | AX, recorded node | AX text | AX link | Page text | Page link | Page twin against the target | Walk nodes p50 (cut p50; depth cut) | Observe ms p50 / max |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const qq=x=>x?`${x.p50} / ${x.max}`:'–';
  for(const u of UNITS)for(const h of ['main','fix']){
    const x=sum[`${h}|${unitKey(u)}`];if(!x)continue;
    console.log(`| ${unitKey(u)} | ${h} | ${g(x.axRecorded)} | ${g(x.axText)} | ${g(x.axLink)} | ${g(x.domText)} | ${g(x.domLink)} | ${g(x.domTwin)} | ${x.walkNodes?.p50??'–'} (${x.walkCut?.p50??'–'}; ${x.walkDepthCut}) | ${qq(x.observeMs)} |`);
  }
  // The guard's own time (stalePoint.ms) per head over every valid row, and split by its verdict.
  const rows=load(d,'rows.json')??[];
  const q=list=>{const x=quantiles(list.map(r=>r.guard?.ms));return x?`${x.p50} / ${x.p95} / ${x.max} (n ${x.n})`:'–';};
  console.log('\n| Head | stalePoint.ms p50 / p95 / max, all | kept | refused |\n|---|---|---|---|');
  for(const h of ['main','fix']){const v=rows.filter(r=>r.head===h&&r.valid&&r.guard);if(!v.length)continue;
    console.log(`| ${h} | ${q(v)} | ${q(v.filter(r=>r.guard.verdict==='kept'))} | ${q(v.filter(r=>r.guard.verdict==='refused'))} |`);}
  if(s.gates){
    console.log('\n| Gate | Pass | Detail |\n|---|---|---|');
    for(const [k,v] of Object.entries(s.gates)){const {pass,examples,reasonExamples,...rest}=v;console.log(`| ${k}${v.informational?' (informational)':''} | ${pass?'pass':'**fail**'} | ${JSON.stringify(rest)} |`);}
  }
}
