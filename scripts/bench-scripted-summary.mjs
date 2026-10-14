#!/usr/bin/env node
// The scripted benchmark check's summary (M5): reads <dir>/<vendor|cua>/ep-<n>/, one `browser-parity.mjs run --corpus
// bench` per episode. The default axis compares browser services; --axis host compares attested REPL hosts on the
// same cua browser service. A cua miss where vendor passes every episode is a defect. Empty, incomplete, unattested
// or unequal episode groups get no verdict. This is scripted outcome evidence, not model-performance evidence.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateAxis,validateHostAttestations,summaryArgs} from './bench-summary.mjs';
const GROUPS=['vendor','cua'];
const jsonl=path=>readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const pathText=path=>Array.isArray(path)?path.map(p=>`(${p.x},${p.y})`).join('->'):null;
function readEpisodes(dir,group,axis) {
  const service=axis==='host'?'cua':group,root=join(dir,group);
  const names=existsSync(root)?readdirSync(root).filter(n=>/^ep-\d+$/.test(n)).sort((a,b)=>a.slice(3)-b.slice(3)):[];
  return names.map(name=>{
    const at=join(root,name),meta=JSON.parse(readFileSync(join(at,'meta.json'),'utf8'));
    if(meta.complete!==true)throw new Error(`${group}/${name}: incomplete run`);
    if(meta.corpus!=='bench'||meta.service!==service||!meta.attestations?.length||meta.attestations.some(a=>a.service!==service))throw new Error(`${group}/${name}: service attestation mismatch`);
    if(axis==='host')validateHostAttestations(meta,group,at);
    const rows=jsonl(join(at,'results.jsonl')),episode=Number(name.slice(3));
    return [...new Set(rows.map(r=>r.case))].sort().map(c=>{
      const outcome=rows.find(r=>r.case===c&&r.cell==='outcome'),drag=rows.find(r=>r.case===c&&r.cell==='drag'),assertion=rows.find(r=>r.case===c&&r.assertion)?.assertion;
      const value=outcome?.ok?outcome.value:{done:false,raw:null,reward:null};
      return {case:c,service,...(axis==='host'?{host:group}:{}),episode,done:value.done===true,raw:value.raw,reward:value.reward,path:pathText(drag?.ok?drag.value?.path:null),ok:assertion?.ok===true};
    });
  }).flat();
}
export function summarizeScripted(dir,{axis='service'}={}) {
  validateAxis(axis);
  const episodes=GROUPS.flatMap(group=>{
    const read=readEpisodes(dir,group,axis);
    if(!read.length)throw new Error(`no ${group} episodes under ${join(dir,group)} (expected ${group}/ep-<n>/ runs)`);
    return read;
  });
  const cases=[...new Set(episodes.map(e=>e.case))].sort();
  const count=(c,group)=>episodes.filter(e=>e.case===c&&e[axis]===group);
  const tasks={},defects=[],below=[],missed=[];
  for(const c of cases) {
    const [v,u]=GROUPS.map(group=>count(c,group));
    if(!v.length||v.length!==u.length)throw new Error(`${c}: unequal episodes (vendor ${v.length}, cua ${u.length})`);
    const [vp,up]=[v,u].map(list=>list.filter(e=>e.ok).length);
    tasks[c]={vendor:`${vp}/${v.length}`,cua:`${up}/${u.length}`};
    const line=`${c} vendor ${tasks[c].vendor}, cua ${tasks[c].cua}`;
    if(vp===v.length)for(const e of u.filter(e=>!e.ok))defects.push(`${c} ep-${e.episode} (${e.done?`raw ${e.raw}`:'not done'})`);
    if(up<vp)below.push(line);else if(up<u.length||vp<v.length)missed.push(line);
  }
  const verdict=defects.length?`defect: cua misses ${defects.join(', ')}`:below.length?`cua below vendor: ${below.join('; ')}`
    :missed.length?`cua not below vendor: ${missed.join('; ')}`:`equal: every scripted episode passes on both ${axis==='host'?'hosts':'services'}`;
  const text=[
    ...(axis==='host'?['comparison axis: host; browser service: cua']:[]),
    ...episodes.map(e=>`${e.case} ${e[axis]} ep-${e.episode}: ${e.done?`raw ${e.raw}, reward ${e.reward}`:'not done'}, drag ${e.path ?? 'none'}, ${e.ok?'pass':'MISS'}`),
    ...cases.map(c=>`${c}: vendor ${tasks[c].vendor}, cua ${tasks[c].cua}`),
    `verdict: ${verdict}`,
  ].join('\n')+'\n';
  return {...(axis==='host'?{axis,service:'cua'}:{}),episodes,tasks,verdict,text};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {const {dir,axis}=summaryArgs(process.argv.slice(2),{defaultDir:'.'});process.stdout.write(summarizeScripted(resolve(dir),{axis}).text);}
  catch(e) {console.error(e.message);process.exitCode=1;}
}
