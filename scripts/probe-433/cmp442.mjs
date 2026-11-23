// #442: one head's results against a reference run's, per lane and unit (valid rows, verdict and guard reason tallied):
// node scripts/probe-433/cmp442.mjs <head: main|fix> <reference dir> <dir> [refHead]. Prints each unit whose tallies differ,
// then a count of the units compared.
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {unitKey} from './cells.mjs';
const [head,refDir,dir,refHead=head]=process.argv.slice(2);
const load=d=>{const out={};for(const a of readdirSync(d).filter(a=>/^probe-442-/.test(a))){if(!existsSync(join(d,a,'rows.json')))continue;
  const lane=a.split('-')[2];for(const r of JSON.parse(readFileSync(join(d,a,'rows.json'),'utf8')))if(r.valid)(out[`${lane}|${unitKey(r)}|${r.head}`]??=[]).push(`${r.verdict} ${r.guard?.reason??'-'}`);}return out;};
const tally=l=>Object.entries((l??[]).reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{})).sort().map(([k,n])=>`${k} ${n}`).join(', ');
const ref=load(refDir),now=load(dir);let n=0,diff=0;
for(const k of Object.keys(now).filter(k=>k.endsWith('|'+head))){
  const r=k.replace(/\|[a-z]+$/,'|'+refHead);if(!ref[r])continue;n++;
  if(tally(ref[r])!==tally(now[k])){diff++;console.log(`${k.replace(/\|[a-z]+$/,'')}: reference ${tally(ref[r])} | now ${tally(now[k])}`);}
}
console.log(`${n} units compared, ${diff} differ`);
