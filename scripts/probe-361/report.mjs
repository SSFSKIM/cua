// Markdown tables from a downloaded run (`gh run download <id> -D <dir>`): node scripts/probe-361/report.mjs <dir>.
// Reads only the coded artifacts the workflow published.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {CELLS,PLAIN,CONTROLS,LANES} from './cells.mjs';
import {percentile} from './check.mjs';

const dir=process.argv[2];
const jobs=readdirSync(dir).filter(d=>existsSync(join(dir,d,'status.json'))).map(d=>{
  const read=f=>existsSync(join(dir,d,f))?JSON.parse(readFileSync(join(dir,d,f),'utf8')):null;
  return {name:d,status:read('status.json'),rows:read('rows.json')??[]};
});
const byLane=(phase)=>LANES.map(l=>jobs.find(j=>j.status.lane===l&&j.status.phase===phase)).filter(Boolean);
const fmt=(n,d)=>d?`${n}/${d}`:'—';
const q=v=>v==null?'—':Math.round(v);
const out=[];
const table=(head,rows)=>{out.push('| '+head.join(' | ')+' |','|'+head.map(()=>'---').join('|')+'|',...rows.map(r=>'| '+r.join(' | ')+' |'),'');};

const stock=byLane('stock'),ax=byLane('ax');
const heads=[...new Set(stock.flatMap(j=>j.rows.map(r=>r.head)))];
out.push(`Jobs: ${jobs.map(j=>`${j.status.lane}/${j.status.phase} ${j.status.pass?'pass':'FAIL'}${j.status.abort?` (abort ${j.status.abort}/${j.status.abortStep})`:''}`).join(', ')}`,'');

const sources=[...new Set(stock.flatMap(j=>Object.keys(j.status.sources??{})))];
table(['Lane','Version','Presentation',...sources.map(s=>s+' usable'),'Rows','Invalid'],stock.map(j=>[j.status.lane,j.status.version,
  j.status.presentation+(j.status.foregroundFallback?` (${j.status.foregroundFallback})`:''),...sources.map(s=>j.status.sources[s]?.usable?'yes':`no (select ${j.status.sources[s]?.selectStatus}, retry ${j.status.sources[s]?.selectRetryStatus??'—'})`),
  `${j.status.completed}/${j.status.planned}`,JSON.stringify(j.status.invalid)]));

for(const head of heads){
  out.push(`### ${head}: wrong successes / valid, per cell (all usable sources pooled)`,'');
  table(['Lane',...CELLS],stock.map(j=>[j.status.lane,...CELLS.map(c=>{const v=j.rows.filter(r=>r.head===head&&r.cell===c&&r.valid);return fmt(v.filter(r=>r.wrongSuccess).length,v.length);})]));
  out.push(`### ${head}: per lane and source`,'');
  table(['Lane','Source','Valid','Exact (plain)','Success','Wrong success plain','Wrong success controls','Clipboard restored','Witness held','Service p50/p95 ms'],
    stock.flatMap(j=>[...new Set(j.rows.map(r=>r.source))].map(s=>{
      const v=j.rows.filter(r=>r.head===head&&r.source===s&&r.valid),p=v.filter(r=>!r.control);
      return [j.status.lane,s,v.length,fmt(p.filter(r=>r.domExact).length,p.length),v.filter(r=>r.success).length,
        p.filter(r=>r.wrongSuccess).length,v.filter(r=>r.control&&r.wrongSuccess).length,fmt(v.filter(r=>r.clipboardRestored).length,v.length),
        fmt(v.filter(r=>r.presentationHeld).length,v.length),`${q(percentile(v.map(r=>r.serviceMs),50))}/${q(percentile(v.map(r=>r.serviceMs),95))}`];
    })));
  out.push(`### ${head}: outcome/reason per cell (all lanes and sources)`,'');
  table(['Cell','Outcomes'],CELLS.map(c=>{
    const t={};for(const j of stock)for(const r of j.rows.filter(r=>r.head===head&&r.cell===c&&r.valid)){const k=`${r.outcome} ${r.reason}${r.domExact?' exact':' differs'}`;t[k]=(t[k]??0)+1;}
    return [c,Object.entries(t).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ×${n}`).join('; ')];
  }));
}
if(heads.length===2){
  out.push('### Service time per lane, main → fix (p50/p95 ms; plain cells, newline-single, controls)','');
  const st=(v)=>`${q(percentile(v.map(r=>r.serviceMs),50))}/${q(percentile(v.map(r=>r.serviceMs),95))}`;
  table(['Lane','Plain (6 cells)','newline-single','Controls'],stock.map(j=>{
    const g=(h,f)=>st(j.rows.filter(r=>r.head===h&&r.valid&&f(r)));
    const plain=r=>!r.control&&r.cell!=='newline-single',nl=r=>r.cell==='newline-single',ctl=r=>r.control;
    return [j.status.lane,`${g('main',plain)} → ${g('fix',plain)}`,`${g('main',nl)} → ${g('fix',nl)}`,`${g('main',ctl)} → ${g('fix',ctl)}`];
  }));
  out.push('### Fix: plain rows not confirmed by the read-back (lane, source, cell: outcome reason, fixture content)','');
  const miss=stock.flatMap(j=>j.rows.filter(r=>r.head==='fix'&&r.valid&&!r.control&&!(r.success&&r.readbackConfirmed))
    .map(r=>`${j.status.lane} ${r.source} ${r.cell}: ${r.outcome} ${r.reason} ${r.domExact?'exact':'differs'}`));
  const t={};for(const k of miss)t[k]=(t[k]??0)+1;
  out.push(miss.length?Object.entries(t).map(([k,n])=>`- ${k} ×${n}`).join('\n'):'None.','');
}
const flags={};for(const j of [...stock,...ax])for(const r of j.rows)for(const f of r.privacy)flags[`${j.status.lane}/${j.status.phase}/${r.head}/${f}`]=(flags[`${j.status.lane}/${j.status.phase}/${r.head}/${f}`]??0)+1;
out.push('Privacy flags: '+(Object.keys(flags).length?JSON.stringify(flags):'none'),'');
const gated=stock.filter(j=>j.status.gates);
if(gated.length){
  out.push('### Gates (fix)','');
  const names=Object.keys(gated[0].status.gates).filter(k=>k!=='perCell');
  table(['Lane',...names],gated.map(j=>[j.status.lane,...names.map(k=>{const g=j.status.gates[k];return (g.pass?'pass':'**FAIL**')+' '+JSON.stringify(Object.fromEntries(Object.entries(g).filter(([x])=>x!=='pass')));})]));
}
if(ax.length){
  out.push('### AX read-back probe (instrumented main)','');
  table(['Lane','Source','Plain exact','AX ever equal','First equal after last post p50/p95/max ms','Equal at first sample after answer','Focus after answer','Controls ever equal','Focused-element roles'],
    ax.map(j=>{
      const v=j.rows.filter(r=>r.valid&&r.ax),p=v.filter(r=>!r.control&&r.domExact),t=p.map(r=>r.ax.firstEqualFromLastPostMs);
      const focus={};for(const r of v){const k=r.ax.focusAfterAnswer??r.ax.focusAtAnswer??'none';focus[k]=(focus[k]??0)+1;}
      return [j.status.lane,[...new Set(v.map(r=>r.source))].join(','),p.length,fmt(p.filter(r=>r.ax.everEqual).length,p.length),
        `${q(percentile(t,50))}/${q(percentile(t,95))}/${q(percentile(t,100))}`,fmt(p.filter(r=>r.ax.equalAfterAnswer??r.ax.equalAtAnswer).length,p.length),
        JSON.stringify(focus),fmt(v.filter(r=>r.control&&r.ax.everEqual).length,v.filter(r=>r.control).length),[...new Set(v.flatMap(r=>r.ax.roles))].join(',')];
    }));
  table(['Lane','Samples: target / setup / other / none (all trials)'],ax.map(j=>{
    const s={target:0,setup:0,other:0,none:0};for(const r of j.rows.filter(r=>r.ax))for(const k in s)s[k]+=r.ax.focus?.[k]??0;
    return [j.status.lane,`${s.target} / ${s.setup} / ${s.other} / ${s.none}`];
  }));
}
console.log(out.join('\n'));
