import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {deriveTraceAllowances,loadTraceAllowances} from '../../scripts/browser-parity/trace-tolerance.mjs';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';
const root=new URL('../../',import.meta.url).pathname;
const fixture=JSON.parse(readFileSync(new URL('./repl-host-expected-differences.json',import.meta.url),'utf8'));
test('M5 locator calibration has two independent vendor pairs and only mechanically derived spreads',()=>{
 const pairs=fixture.pairs.filter(p=>p.a.includes('/m5/oracle/')&&p.b.includes('/m5/oracle/'));
 assert.equal(pairs.length,2,'M5 needs two fresh vendor-against-vendor polling pairs');
 assert.equal(new Set(pairs.flatMap(p=>[p.a,p.b])).size,4);
 const required=['actions/locators','actions/wait-for','actions/slow-budget','input/coordinates','waits/networkidle'];
 const read=path=>{const get=file=>execFileSync('git',['show',`${fixture.revision}:${path}/${file}`],{cwd:root,encoding:'utf8'});return {meta:JSON.parse(get('meta.json')),rows:get('results.jsonl').trim().split('\n').map(JSON.parse)};};
 const derived=[];
 for(const pair of pairs){const a=read(pair.a),b=read(pair.b);for(const id of required){assert.ok(a.meta.cases.includes(id));assert.ok(b.meta.cases.includes(id));}derived.push(...deriveTraceAllowances(a,b));}
 const union=loadTraceAllowances(fixture);
 for(const entry of derived){const actual=union.find(e=>e.cases[0]===entry.cases[0]&&e.cells[0]===entry.cells[0]&&e.methods[0]===entry.methods[0]);assert.ok(actual&&actual.maxDelta>=entry.maxDelta);}
});
// Immutable T4 corpus controls; these regression inputs remain pinned even when later calibrations extend the union.
const corpusRevision='f7ac87d5d47e0317d18d53f96d3e4c4b2c571f69';
const corpus=name=>{
 const get=file=>execFileSync('git',['show',`${corpusRevision}:docs/evidence/2026-10-14-own-repl-host-parity/m5/mini/${name}/${file}`],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
 return {meta:JSON.parse(get('meta.json')),rows:get('results.jsonl').trim().split('\n').map(JSON.parse)};
};
test('the recorded three-control corpus union resolves every vendor-versus-own trace discrepancy',()=>{
 const own=corpus('corpus-cua-host');
 const vendors=['corpus-vendor-host','corpus-vendor-host-2','corpus-vendor-host-3'].map(corpus);
 const expected=loadTraceAllowances(fixture,{targetMetas:[own.meta,...vendors.map(run=>run.meta)]});
 for(const vendor of vendors){const result=compareRuns(vendor.rows,own.rows,{expected});assert.equal(result.ok,true,JSON.stringify(result.differences));}
 for(const [a,b] of [[0,1],[0,2],[1,2]]){
  const spreads=deriveTraceAllowances(vendors[a],vendors[b]);
  for(const spread of spreads){const bound=expected.find(e=>e.cases[0]===spread.cases[0]&&e.cells[0]===spread.cells[0]&&e.methods[0]===spread.methods[0]);assert.ok(bound&&bound.maxDelta>=spread.maxDelta);}
 }
});
test('new corpus cells tolerate their recorded one-count spread, not a delta beyond the union',()=>{
 const vendor=corpus('corpus-vendor-host-2'),expected=loadTraceAllowances(fixture);
 const slots=[['waits/zero-budget','idle','Page.lifecycleEvent'],['input/coordinates','double','Runtime.evaluate'],['input/coordinates','double','Runtime.releaseObject'],['actions/locators','select','Runtime.evaluate'],['actions/locators','select','Runtime.releaseObject']];
 for(const [id,cell,method] of slots){
  const rows=vendor.rows.filter(r=>r.case===id),original=rows.find(r=>r.cell===cell);
  const event=original.trace.find(e=>e.cdp===method);assert.ok(event,`${id}/${cell} records ${method}`);
  for(const delta of [1,2]){
   const changed=structuredClone(rows);changed.find(r=>r.cell===cell).trace.push(...Array.from({length:delta},()=>structuredClone(event)));
   const result=compareRuns(rows,changed,{expected});assert.equal(result.ok,delta===1,`${id}/${cell}/${method} delta ${delta}: ${JSON.stringify(result.differences)}`);
   if(delta===2)assert.deepEqual(result.differences.map(d=>[d.case,d.cell,d.kind,d.method]),[[id,cell,'trace',method]]);
  }
 }
});
