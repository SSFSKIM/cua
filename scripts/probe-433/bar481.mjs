// #481's qualification bar from downloaded runs: node scripts/probe-433/bar481.mjs <label>=<dir> ... (gh run download <id> -D <dir>).
// Pairs each fix row with main's of the same unit and repetition (valid rows only), per lane:
// - keep rows (main kept and landed): the fix's answer on each, worse where it did not land;
// - better rows (main did not land, the fix kept and landed);
// - every change of verdict, guard reason or click outcome between the pair;
// - false ok (kept, the click answered ok, nothing reached the target) left on each head;
// - press parity on the Chromium lanes: per non-refuse, non-twin cell, what the route pressed (elementClick's role, hit or
//   ancestor, a refused walk's stop) and where the page logged the click, per head, and how many fix rows carried routeHit;
// - slideover's and decomove's fix answers, and stalePoint.ms per head.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {CELLS,unitKey} from './cells.mjs';
import {quantiles,eventsOf} from './check.mjs';

const tally=list=>Object.entries(list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{})).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}`).join(', ')||'–';
const q=list=>{const x=quantiles(list);return x?`${x.p50} / ${x.p95}`:'–';};
const recipient=r=>{const e=eventsOf(r);const c=e.find(x=>x.type==='click')??e[0];return c?c.link:'nothing';};
const answer=r=>`${r.verdict} ${r.guard?.reason??'-'} (${r.click??'-'})`;
const press=r=>r.press?`${r.press.pressedRole??'-'}/${r.press.pressed??'-'}${r.press.walkStopped?` stopped ${r.press.walkStopped}`:''}`:'no press';
const keepish=c=>!['refuse','twin','report'].includes(CELLS[c].kind);
// Cells whose own cover takes the click (a scrim, the sticky header, the veil beside the link): nothing on the target is right there.
const coverTakes=c=>['scrim','sticky'].includes(CELLS[c].cover)||CELLS[c].aim==='beside';
const totals={};
for(const arg of process.argv.slice(2)){
  const [label,dir]=arg.split('=');
  for(const d of readdirSync(dir).filter(d=>/^probe-442-/.test(d)).sort()){
    if(!existsSync(join(dir,d,'rows.json')))continue;
    const s=JSON.parse(readFileSync(join(dir,d,'status.json'),'utf8')),rows=JSON.parse(readFileSync(join(dir,d,'rows.json'),'utf8'));
    const lane=s.lane,v=rows.filter(r=>r.valid),fix=v.filter(r=>r.head==='fix'),main=v.filter(r=>r.head==='main');
    const pair=new Map(main.map(r=>[`${unitKey(r)}/${r.rep}`,r])),mate=r=>pair.get(`${unitKey(r)}/${r.rep}`);
    const pairs=fix.filter(mate).map(f=>({f,m:mate(f)}));
    const keep=pairs.filter(p=>p.m.verdict==='kept-landed'),worse=keep.filter(p=>p.f.verdict!=='kept-landed');
    const better=pairs.filter(p=>p.m.verdict!=='kept-landed'&&p.f.verdict==='kept-landed');
    const t=totals[lane]??={keep:0,worse:0,better:0};t.keep+=keep.length;t.worse+=worse.length;t.better+=better.length;
    console.log(`\n## ${label} ${lane} (${s.hits}): main ${s.refs?.main?.slice(0,8)} fix ${s.refs?.fix?.slice(0,8)}, ${s.completed}/${s.planned} rows, invalid ${JSON.stringify(s.invalid)}`);
    console.log(`keep rows ${keep.length}, worse ${worse.length}, better ${better.length}`);
    for(const [k,l] of Object.entries(Object.groupBy(worse,p=>unitKey(p.f))))console.log(`  WORSE ${k}: ${tally(l.map(p=>`${answer(p.m)} > ${answer(p.f)}`))}`);
    for(const [k,l] of Object.entries(Object.groupBy(better,p=>unitKey(p.f))))console.log(`  better ${k}: ${tally(l.map(p=>`${answer(p.m)} > ${answer(p.f)}`))}`);
    const changed=pairs.filter(p=>answer(p.m)!==answer(p.f));
    for(const [k,l] of Object.entries(Object.groupBy(changed,p=>unitKey(p.f))))console.log(`  changed ${k} [${CELLS[k.split('/')[0]].kind}]: ${tally(l.map(p=>`${answer(p.m)} > ${answer(p.f)}`))}`);
    const falseOk=h=>tally(v.filter(r=>r.head===h&&keepish(r.cell)&&!coverTakes(r.cell)&&r.verdict==='kept-missed'&&r.click==='success').map(unitKey));
    console.log(`false ok (kept, ok, nothing on the target), main: ${falseOk('main')}`);
    console.log(`false ok, fix: ${falseOk('fix')}`);
    // Kept by the guard, then refused by the route (the click answered an error), nothing reached: per head, by outcome.
    const routeRefused=h=>tally(v.filter(r=>r.head===h&&keepish(r.cell)&&r.verdict==='kept-missed'&&r.click!=='success').map(r=>`${unitKey(r)} ${r.click}`));
    console.log(`kept, then refused by the route: main ${routeRefused('main')} | fix ${routeRefused('fix')}`);
    // Ruling 1105: rows whose node record is incomplete (signals.record.complete false, from the observation) answer as
    // main, with no routeHit; and how many fix rows carried routeHit at all.
    const inc=pairs.filter(p=>p.f.signals?.record?.complete===false);
    for(const [k,l] of Object.entries(Object.groupBy(inc,p=>unitKey(p.f))))
      console.log(`  incomplete record ${k}: main ${tally(l.map(p=>answer(p.m)))} | fix ${tally(l.map(p=>answer(p.f)))}; differ ${l.filter(p=>answer(p.m)!==answer(p.f)).length}, routeHit ${l.filter(p=>p.f.guard?.routeHit).length}`);
    console.log(`incomplete-record rows ${inc.length} (unread ${pairs.filter(p=>p.f.signals?.record?.complete==null).length}); fix rows with routeHit corrected ${fix.filter(r=>r.guard?.routeHit==='corrected').length}`);
    if(lane!=='safari'){
      console.log('press parity (cell: main | fix [routeHit corrected n]):');
      for(const c of [...new Set(v.map(r=>r.cell))].filter(keepish))for(const at of ['text','link']){
        const m=main.filter(r=>r.cell===c&&r.at===at),f=fix.filter(r=>r.cell===c&&r.at===at);if(!f.length)continue;
        const p=l=>tally(l.map(r=>`${press(r)} > ${recipient(r)}`));
        console.log(`  ${c}/${at}: ${p(m)} | ${p(f)} [${f.filter(r=>r.guard?.routeHit==='corrected').length}]`);
      }
    }
    for(const c of ['slideover','decomove'])for(const at of ['text','link']){const f=fix.filter(r=>r.cell===c&&r.at===at);
      if(f.length)console.log(`  ${c}/${at} fix: ${tally(f.map(answer))}`);}
    console.log(`stalePoint.ms p50 / p95: main ${q(main.map(r=>r.guard?.ms))}, fix ${q(fix.map(r=>r.guard?.ms))}`);
  }
}
console.log('\nTotals per lane: '+JSON.stringify(totals));
