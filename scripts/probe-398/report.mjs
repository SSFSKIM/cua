// Markdown tables from a downloaded run: node scripts/probe-398/report.mjs <dir> (gh run download <id> -D <dir>).
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {UNITS,unitKey} from './cells.mjs';

const dir=process.argv[2];
const load=(d,f)=>existsSync(join(dir,d,f))?JSON.parse(readFileSync(join(dir,d,f),'utf8')):null;
const arts=readdirSync(dir).filter(d=>d.startsWith('probe-398-')).sort();
const fmt=o=>Object.entries(o??{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(', ')||'–';
const ATTRS=['title','description','roleDescription','value','valueDescription','help','identifier','url'];
const shape=f=>`${f.role}${f.subrole?'/'+f.subrole:''}; set: ${ATTRS.filter(a=>f[a]==='set').join(' ')||'none'}; empty or absent: ${ATTRS.filter(a=>f[a]!=='set').join(' ')}`;

const census=arts.filter(d=>d.includes('-census-'));
if(census.length){
  console.log('### Census\n');
  console.log('Totals are over reached windows only (a page on its requested site, a verified app scene).\n');
  console.log('| Lane | Sampled | Observed | Reached | Text fields | With a placeholder | Field pairs | Placeholder only (value counted) | Placeholder only (value left out) | Identical (value counted) | Identical (value left out) | … with ancestry alike: placeholder only / identical |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for(const d of census){
    const s=load(d,'status.json');if(!s)continue;
    console.log(`| ${s.lane} | ${s.sampled} | ${s.observedAny} | ${s.reached} (unreached: ${fmt(s.unreachedBy)}) | ${s.fields} | ${s.fieldsWithPlaceholder} | ${s.pairs} | ${s.placeholderOnly} | ${s.placeholderOnlyIgnoringValue} | ${s.identical} | ${s.identicalIgnoringValue} | ${s.placeholderOnlyAncestryAlike} / ${s.identicalAncestryAlike} |`);
  }
  console.log('\n#### Windows with a placeholder-only or identical pair\n');
  console.log('| Lane | Window | Kind | Fields | Placeholder only (counted / value left out) | Identical (counted / left out) | Example pair |');
  console.log('|---|---|---|---|---|---|---|');
  for(const d of census){
    const rows=load(d,'census.json')??[],lane=load(d,'status.json')?.lane;
    for(const r of rows){
      const c=r.census?.counts;if(!c||!r.reached)continue;
      if(!(c.placeholderOnly||c.placeholderOnlyIgnoringValue||c.identical||c.identicalIgnoringValue))continue;
      const p=r.census.pairs.find(p=>p.noPlaceholder&&!p.strict)??r.census.pairs.find(p=>p.noPlaceholderIgnoringValue&&!p.strictIgnoringValue)??r.census.pairs[0];
      const ex=p?`${shape(p.a)}; placeholders ${p.a.placeholder}/${p.b.placeholder}; ${p.sameParent?'siblings':'cousins at '+p.commonAncestorDistance.join('/')}${p.ancestryAlike?', ancestry alike':''}`:'';
      console.log(`| ${lane} | ${r.id} | ${r.kind} | ${r.census.fields} | ${c.placeholderOnly} / ${c.placeholderOnlyIgnoringValue} | ${c.identical} / ${c.identicalIgnoringValue} | ${ex} |`);
    }
  }
}
const fixture=arts.filter(d=>d.includes('-stock-'));
for(const d of fixture){
  const s=load(d,'status.json'),sum=load(d,'summary.json')??{};if(!s)continue;
  console.log(`\n### ${s.lane}: ${s.version??'?'}, ${s.presentation??'?'}${s.foregroundFallback?' (fallback: '+s.foregroundFallback+')':''}, ${s.completed}/${s.planned} rows, abort ${s.abort??'none'}, invalid ${fmt(s.invalid)}\n`);
  console.log('| Unit | Head | Valid | Verdicts | Click | Second action (why) | Exercised (fixture and AX changed) / unexercised | Refusals correlated with a placeholder change | Presentation lost | Observed placeholder |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for(const u of UNITS)for(const h of ['main','fix']){
    const x=sum[`${h}|${unitKey(u)}`];if(!x)continue;
    console.log(`| ${unitKey(u)} | ${h} | ${x.valid}/${x.rows} | ${fmt(x.verdicts)} | ${fmt(x.click)} | ${fmt(x.act)} (${fmt(x.actWhy)}) | ${x.exercised} / ${x.unexercised} | ${x.placeholderCorrelated} | ${x.presentationLost} | ${fmt(x.observedPlaceholder)} |`);
  }
  if(s.gates){
    console.log('\n| Gate | Pass | Detail |\n|---|---|---|');
    for(const [k,g] of Object.entries(s.gates)){const {pass,examples,...rest}=g;console.log(`| ${k} | ${pass?'pass':'**fail**'} | ${JSON.stringify(rest)} |`);}
  }
}
