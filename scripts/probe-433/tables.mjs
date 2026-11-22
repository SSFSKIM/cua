// The README's tables from one downloaded run: node scripts/probe-433/tables.mjs <dir> [label] (gh run download <id> -D <dir>).
// Per unit, each lane's verdict and guard reason per head (the fix's controlGone rows with the gone control's role); the
// guard's time per lane and head; and the lanes' run facts. Valid rows only.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {LANES,UNITS,unitKey} from './cells.mjs';
import {quantiles} from './check.mjs';

const [dir,label='run']=process.argv.slice(2);
const load=(d,f)=>existsSync(join(dir,d,f))?JSON.parse(readFileSync(join(dir,d,f),'utf8')):null;
const lanes={};
for(const d of readdirSync(dir).filter(d=>/^probe-4[0-9]{2}-/.test(d))){const s=load(d,'status.json');if(s?.lane)lanes[s.lane]={status:s,rows:load(d,'rows.json')??[]};}
const order=LANES.filter(l=>lanes[l]);
const heads=['main','fix'];
const tally=list=>Object.entries(list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{})).sort((a,b)=>b[1]-a[1]);
const cell=(lane,u,h)=>{
  const v=lanes[lane].rows.filter(r=>r.valid&&r.head===h&&unitKey(r)===unitKey(u));if(!v.length)return null;
  const main=tally(v.map(r=>`${r.verdict} ${r.guard?.reason??'-'}`)).map(([k,n])=>`${k} ${n}`).join(', ');
  const gone=tally(v.filter(r=>r.guard?.controlRole).map(r=>r.guard.controlRole)).map(([k,n])=>`${k} ${n}`).join(', ');
  return main+(gone?` [${gone}]`:'');
};
console.log(`| Unit | ${order.flatMap(l=>heads.map(h=>`${l}: ${h}`)).join(' | ')} |`);
console.log(`|---|${order.flatMap(()=>heads.map(()=>'---|')).join('')}`);
for(const u of UNITS){
  const cs=order.flatMap(l=>heads.map(h=>cell(l,u,h)));if(cs.every(c=>c==null))continue;
  console.log(`| ${unitKey(u)} | ${cs.map(c=>c??'–').join(' | ')} |`);
}
const q=list=>{const x=quantiles(list.map(r=>r.guard?.ms));return x?`${x.p50} / ${x.p95} / ${x.max} (${x.n})`:'–';};
console.log('\n| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |\n|---|---|---|---|---|---|');
for(const l of order)for(const h of heads){
  const v=lanes[l].rows.filter(r=>r.head===h&&r.valid&&r.guard);if(!v.length)continue;
  console.log(`| ${l} | ${h} | ${q(v)} | ${q(v.filter(r=>r.guard.verdict==='kept'))} | ${q(v.filter(r=>r.guard.verdict==='refused'))} | ${q(v.filter(r=>r.at==='text'))} |`);
}
console.log('\n| Run | Lane | Image | Browser | Rows | Abort | Gates failing |\n|---|---|---|---|---|---|---|');
for(const l of order){const s=lanes[l].status,failing=Object.entries(s.gates??{}).filter(([,g])=>!g.informational&&!g.pass).map(([k])=>k);
  console.log(`| ${label} | ${l} | ${s.image??'?'} | ${s.version??'?'} | ${s.completed}/${s.planned} | ${s.abort??'none'} | ${s.gates?failing.join(', ')||'none':'–'} |`);}
