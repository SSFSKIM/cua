// #442's qualification bar from downloaded runs: node scripts/probe-433/bar442.mjs <label>=<dir> ... (gh run download <id> -D <dir>).
// Per run and lane: slideover's fix rows refused; each paired gate's pass and differences; siblingstack, the shapes and
// ruling 1080's rows as main; the fix's hitCorrection on the Chromium lanes; stalePoint.ms per head; decomove.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {CELLS,unitKey} from './cells.mjs';
import {quantiles} from './check.mjs';

const tally=list=>Object.entries(list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{})).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}`).join(', ')||'–';
const q=list=>{const x=quantiles(list);return x?`${x.p50} / ${x.p95}`:'–';};
const GATES=['otherOnTop','shapeAsMain','overlayKept','overlayAsMain','keptAsMain','othersAsMain','twinAsMain','twinRefused','twinUnrecorded','overlayTwin','decoGone','noWrongTarget','coverage','presentation'];
for(const arg of process.argv.slice(2)){
  const [label,dir]=arg.split('=');
  for(const d of readdirSync(dir).filter(d=>/^probe-442-/.test(d)).sort()){
    if(!existsSync(join(dir,d,'status.json')))continue;
    const s=JSON.parse(readFileSync(join(dir,d,'status.json'),'utf8')),rows=JSON.parse(readFileSync(join(dir,d,'rows.json'),'utf8'));
    const v=rows.filter(r=>r.valid),fix=v.filter(r=>r.head==='fix'),main=v.filter(r=>r.head==='main');
    const pair=new Map(main.map(r=>[`${unitKey(r)}/${r.rep}`,r])),mate=r=>pair.get(`${unitKey(r)}/${r.rep}`);
    console.log(`\n## ${label} ${s.lane} (${s.hits??'?'}): ${s.completed}/${s.planned} rows, invalid ${JSON.stringify(s.invalid)}, abort ${s.abort??'none'}, pass ${s.pass}`);
    const gates=Object.entries(s.gates??{}).filter(([k,g])=>GATES.includes(k)&&(g.rows||g.fixRows||g.paired||k==='coverage'||k==='presentation'));
    console.log('gates: '+gates.map(([k,g])=>`${k} ${g.pass?'pass':'FAIL'}${g.differ?` differ ${g.differ}`:''}${g.reasonDiffer?` reasonDiffer ${g.reasonDiffer}`:''}${g.failed?` failed ${g.failed}`:''}`).join('; '));
    if(s.gates?.otherOnTopElsewhere)console.log(`otherControlOnTop outside the refuse cells: ${s.gates.otherOnTopElsewhere.rows} (main kept-landed ${s.gates.otherOnTopElsewhere.mainKeptLanded}) ${JSON.stringify(s.gates.otherOnTopElsewhere.perUnit)}`);
    // Every unit where a fix row's verdict or reason differs from its paired main row's.
    const differ={};for(const r of fix){const m=mate(r);if(m&&(m.verdict!==r.verdict||m.guard?.reason!==r.guard?.reason))(differ[unitKey(r)]??=[]).push(`${m.verdict} ${m.guard?.reason}>${r.verdict} ${r.guard?.reason}`);}
    for(const [u,l] of Object.entries(differ))console.log(`  differs ${u} [${CELLS[u.split('/')[0]].kind}]: ${tally(l)}`);
    // hitCorrection on the fix, per unit (Chromium lanes).
    if(s.lane!=='safari'){const hc={};for(const r of fix)if(r.guard?.hitCorrection)(hc[unitKey(r)]??=[]).push(r.guard.hitCorrection);
      console.log('hitCorrection: '+Object.entries(hc).map(([u,l])=>`${u} {${tally(l)}}`).join('; '));}
    console.log(`stalePoint.ms p50 / p95: main ${q(main.map(r=>r.guard?.ms))}, fix ${q(fix.map(r=>r.guard?.ms))}`);
    for(const c of ['slideover','veilinto','siblingstack','relabelfront','relabelfirst','decomove'])for(const at of ['text','link']){
      const f=fix.filter(r=>r.cell===c&&r.at===at),m=main.filter(r=>r.cell===c&&r.at===at);if(!f.length)continue;
      console.log(`  ${c}/${at}: main ${tally(m.map(r=>`${r.verdict} ${r.guard?.reason}`))} | fix ${tally(f.map(r=>`${r.verdict} ${r.guard?.reason}`))}`);}
    const pops=v.filter(r=>r.popupDelay!=null);
    if(pops.length)for(const h of ['main','fix'])console.log(`  popupwait ${h}: `+[...new Set(pops.map(r=>r.popupDelay))].map(dl=>`${dl}ms ${tally(pops.filter(r=>r.head===h&&r.popupDelay===dl).map(r=>`${r.guard?.reason??'none'}${r.guard?.hitMs!=null&&r.guard?.reason==='appWindowOverPoint'?`@${r.guard.hitMs}`:''}`))}`).join('; '));
    const cf=v.filter(r=>r.frontFrame!==undefined);
    if(cf.length)console.log(`  contentsfront frontFrame: ${tally(cf.map(r=>typeof r.frontFrame==='string'?r.frontFrame:r.frontFrame?`${r.frontFrame.width}x${r.frontFrame.height}@${r.frontFrame.x},${r.frontFrame.y}`:'none'))}`);
  }
}
