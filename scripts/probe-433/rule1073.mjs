// #442 ruling 1073's rule counted over downloaded runs: node scripts/probe-433/rule1073.mjs <label>=<dir> ... (gh run download <id> -D <dir>).
// Per keep row (main kept and landed): the hit's answer at 80 ms (a warm run's sequence read before the click), else the
// corrected answer read after the click (a cold run: inferred, the engine's own first hit having triggered the correction);
// refused when that answer's control is not among the record's controls at the point, or when it has no control and the
// engine's own hit was not a recorded node (`sameElement`, `recordedHit`). Also, on the Chromium lanes of a warm run, how
// often the 80 ms answer is still the first answer, and still the overlay group.
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const CONTROLS=new Set(['target','twin','behind','back','archive','drafts','other','unlabelled']);
const at80=seq=>{let a=null;for(const e of seq){const [n,t]=e.split('@');if(Number(t)<=80)a=n;}return a;};
const out={},approx={};
for(const arg of process.argv.slice(2)){
  const [label,dir]=arg.split('=');
  for(const d of readdirSync(dir).filter(d=>/^probe-442-/.test(d))){
    const lane=d.split('-')[2],rows=JSON.parse(readFileSync(join(dir,d,'rows.json'),'utf8'));
    for(const r of rows){
      if(!r.valid||r.head!=='main'||!r.signals)continue;
      const s=r.signals,warm=s.ax?.warm?.seq,after=s.ax?.after?.seq;
      if(warm&&lane!=='safari'){const x=approx[`${label}|${lane}|${r.cell}`]??={rows:0,same:0,overlay80:0,lastMax:0};
        x.rows++;const a=at80(warm);if(a===warm[0].split('@')[0])x.same++;if(a==='overlay')x.overlay80++;
        x.lastMax=Math.max(x.lastMax,Number(warm.at(-1).split('@')[1]));}
      if(r.verdict!=='kept-landed')continue;
      const ans=warm?at80(warm):after?.length?after.at(-1).split('@')[0]:null,rec=new Set((s.record?.role??'').split('+'));
      const refuse=ans==null?null:CONTROLS.has(ans)?!rec.has(ans):warm?!['sameElement','recordedHit'].includes(r.guard?.reason):null;
      const x=out[`${label}|${lane}|${r.cell}/${r.at}`]??={keep:0,refuse:0,unread:0};
      x.keep++;if(refuse===true)x.refuse++;if(refuse===null)x.unread++;
    }
  }
}
console.log(JSON.stringify({keep:out,approx},null,1));
