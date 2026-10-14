#!/usr/bin/env node
// The scripted benchmark check's summary (M5): reads <dir>/<vendor|cua>/ep-<n>/, one `browser-parity.mjs run --corpus
// bench` per episode, and prints each episode's raw reward and drag path, each task's pass count per service, and the
// verdict: a cua miss in a task where the vendor passes every episode is a defect. An incomplete or unattested run,
// or unequal episode counts, get no verdict.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const SERVICES=['vendor','cua'];
const jsonl=path=>readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const pathText=path=>Array.isArray(path)?path.map(p=>`(${p.x},${p.y})`).join('->'):null;
function readEpisodes(dir,service) {
  const root=join(dir,service);
  const names=existsSync(root)?readdirSync(root).filter(n=>/^ep-\d+$/.test(n)).sort((a,b)=>a.slice(3)-b.slice(3)):[];
  return names.map(name=>{
    const at=join(root,name),meta=JSON.parse(readFileSync(join(at,'meta.json'),'utf8'));
    if(meta.complete!==true)throw new Error(`${service}/${name}: incomplete run`);
    if(meta.corpus!=='bench'||meta.service!==service||!meta.attestations?.length||meta.attestations.some(a=>a.service!==service))throw new Error(`${service}/${name}: service attestation mismatch`);
    const rows=jsonl(join(at,'results.jsonl')),episode=Number(name.slice(3));
    return [...new Set(rows.map(r=>r.case))].sort().map(c=>{
      const outcome=rows.find(r=>r.case===c&&r.cell==='outcome'),drag=rows.find(r=>r.case===c&&r.cell==='drag'),assertion=rows.find(r=>r.case===c&&r.assertion)?.assertion;
      const value=outcome?.ok?outcome.value:{done:false,raw:null,reward:null};
      return {case:c,service,episode,done:value.done===true,raw:value.raw,reward:value.reward,path:pathText(drag?.ok?drag.value?.path:null),ok:assertion?.ok===true};
    });
  }).flat();
}
export function summarizeScripted(dir) {
  const episodes=SERVICES.flatMap(service=>readEpisodes(dir,service));
  const cases=[...new Set(episodes.map(e=>e.case))].sort();
  const count=(c,service)=>episodes.filter(e=>e.case===c&&e.service===service);
  const tasks={},defects=[],below=[],missed=[];
  for(const c of cases) {
    const [v,u]=SERVICES.map(service=>count(c,service));
    if(!v.length||v.length!==u.length)throw new Error(`${c}: unequal episodes (vendor ${v.length}, cua ${u.length})`);
    const [vp,up]=[v,u].map(list=>list.filter(e=>e.ok).length);
    tasks[c]={vendor:`${vp}/${v.length}`,cua:`${up}/${u.length}`};
    const line=`${c} vendor ${tasks[c].vendor}, cua ${tasks[c].cua}`;
    if(vp===v.length)for(const e of u.filter(e=>!e.ok))defects.push(`${c} ep-${e.episode} (${e.done?`raw ${e.raw}`:'not done'})`);
    if(up<vp)below.push(line);else if(up<u.length||vp<v.length)missed.push(line);
  }
  const verdict=defects.length?`defect: cua misses ${defects.join(', ')}`:below.length?`cua below vendor: ${below.join('; ')}`
    :missed.length?`cua not below vendor: ${missed.join('; ')}`:'equal: every scripted episode passes on both services';
  const text=[
    ...episodes.map(e=>`${e.case} ${e.service} ep-${e.episode}: ${e.done?`raw ${e.raw}, reward ${e.reward}`:'not done'}, drag ${e.path ?? 'none'}, ${e.ok?'pass':'MISS'}`),
    ...cases.map(c=>`${c}: vendor ${tasks[c].vendor}, cua ${tasks[c].cua}`),
    `verdict: ${verdict}`,
  ].join('\n')+'\n';
  return {episodes,tasks,verdict,text};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.stdout.write(summarizeScripted(resolve(process.argv[2] ?? '.')).text);}
  catch(e) {console.error(e.message);process.exitCode=1;}
}
