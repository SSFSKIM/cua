// Markdown tables from a downloaded run: node scripts/probe-340/report.mjs <dir> (gh run download <id> -D <dir>).
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {UNITS,unitKey} from './cells.mjs';

const dir=process.argv[2];
const load=(d,f)=>existsSync(join(dir,d,f))?JSON.parse(readFileSync(join(dir,d,f),'utf8')):null;
const arts=readdirSync(dir).filter(d=>d.startsWith('probe-340-')).sort();
const fmt=o=>Object.entries(o??{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(', ')||'–';
const g=x=>!x?'–':['dx','dw'].map(k=>`${k} ${x[k].median}${x[k].span[0]!==x[k].span[1]?` [${x[k].span[0]}, ${x[k].span[1]}]`:''}`).join('; ')+(x.dy.span[0]||x.dy.span[1]?`; dy ${x.dy.median}`:'');
for(const d of arts){
  const s=load(d,'status.json'),sum=load(d,'summary.json')??{};if(!s)continue;
  console.log(`\n### ${s.lane}: ${s.version??'?'}, ${s.presentation??'?'}${s.foregroundFallback?' (fallback: '+s.foregroundFallback+')':''}, image ${s.image??'?'}, ${s.completed}/${s.planned} rows, abort ${s.abort??'none'}, invalid ${fmt(s.invalid)}\n`);
  console.log('| Unit | Head | Valid | Verdicts | Guard (verdict/reason) | Identity | Hit | Landed on the link | Wrong target | Click | Guard ms p50 / p95 / max | Presentation lost |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for(const u of UNITS)for(const h of ['main','fix']){
    const x=sum[`${h}|${unitKey(u)}`];if(!x)continue;
    console.log(`| ${unitKey(u)} | ${h} | ${x.valid}/${x.rows} | ${fmt(x.verdicts)} | ${fmt(x.reason)} | ${fmt(x.identity)} | ${fmt(x.hitRole)} | ${x.landed} | ${x.wrong} | ${fmt(x.click)} | ${x.guardMs?`${x.guardMs.p50} / ${x.guardMs.p95} / ${x.guardMs.max}`:'–'} | ${x.presentationLost} |`);
  }
  console.log('\nGeometry, median [min, max]: the recorded node\'s AX frame at the observation against the same node\'s after the change (screen points), and the page\'s own (CSS px).\n');
  console.log('| Unit | Head | AX, recorded node | AX text | AX link | Page text | Page link |');
  console.log('|---|---|---|---|---|---|---|');
  for(const u of UNITS)for(const h of ['main','fix']){
    const x=sum[`${h}|${unitKey(u)}`];if(!x)continue;
    console.log(`| ${unitKey(u)} | ${h} | ${g(x.axRecorded)} | ${g(x.axText)} | ${g(x.axLink)} | ${g(x.domText)} | ${g(x.domLink)} |`);
  }
  if(s.gates){
    console.log('\n| Gate | Pass | Detail |\n|---|---|---|');
    for(const [k,v] of Object.entries(s.gates)){const {pass,examples,reasonExamples,...rest}=v;console.log(`| ${k}${v.informational?' (informational)':''} | ${pass?'pass':'**fail**'} | ${JSON.stringify(rest)} |`);}
  }
}
