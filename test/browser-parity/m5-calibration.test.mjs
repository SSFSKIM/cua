import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {deriveTraceAllowances,loadTraceAllowances} from '../../scripts/browser-parity/trace-tolerance.mjs';
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
