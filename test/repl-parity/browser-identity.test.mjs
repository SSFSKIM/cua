import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentComparisonRun} from '../../scripts/repl-parity/document-comparison.mjs';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
const base=new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m3/',import.meta.url);
function load(dir){const json=file=>JSON.parse(readFileSync(new URL(`${dir}/${file}`,base),'utf8'));return {meta:json('meta.json'),tools:json('tools.json'),rows:readFileSync(new URL(`${dir}/results.jsonl`,base),'utf8').trim().split('\n').map(JSON.parse)};}
const id='cells/documentation/browser-docs-before-state';
function race(run,{wrongProfile=false}={}){
 const copy=structuredClone(run),row=copy.rows.find(r=>r.case===id&&r.cell);
 const state=row.content.find(c=>c.type==='text'&&c.text.startsWith('[{'));
 const browsers=JSON.parse(state.text);assert.equal(browsers.length,2);
 const swap=value=>value===browsers[0].id?browsers[1].id:browsers[0].id;
 for(const c of row.content)if(c.text?.includes('# Selected Browser\n')&&!wrongProfile)c.text=c.text.replace(/(- ID: )([^\n]+)/,(_,prefix,value)=>prefix+swap(value));
 state.text=JSON.stringify(browsers.map(b=>({...b,id:swap(b.id)})).reverse());return copy;
}
const diff=(a,b)=>compareParityRuns(documentComparisonRun(a),documentComparisonRun(b));
test('backend arrival order may swap browser numbers without changing the selected profile',()=>{
 const control=load('vendor-docs-1');const result=diff(control,race(control));assert.equal(result.ok,true,JSON.stringify(result.differences));
});
test('a browser id mapped to the wrong backend profile remains a difference',()=>{
 const control=load('vendor-docs-1');assert.equal(diff(control,race(control,{wrongProfile:true})).ok,false);
});
test('committed M3 document controls still reproduce and malformed identity evidence fails closed',()=>{
 const control=load('vendor-docs-1');assert.equal(diff(control,load('vendor-docs-2')).ok,true);
 for(const mutate of [b=>{delete b[0].metadata;},b=>{b[1].id=b[0].id;},b=>{b[1].metadata=b[0].metadata;}]){
  const corrupt=structuredClone(control),state=corrupt.rows.find(r=>r.case===id&&r.cell).content.find(c=>c.text?.startsWith('[{'));
  const browsers=JSON.parse(state.text);mutate(browsers);state.text=JSON.stringify(browsers);
  assert.throws(()=>documentComparisonRun(corrupt),/identity|browser/i);
 }
});
// #494's one slot bound to the header's ID: `api-reference/<ID>` takes the selected identity with it.
function withText(run,make){
 const copy=structuredClone(run),row=copy.rows.find(r=>r.case===id&&r.cell),doc=row.content.find(c=>c.text?.includes('# Selected Browser\n'));
 const own=/\n- ID: ([^\n]+)\n/.exec(doc.text)[1],other=JSON.parse(row.content.find(c=>c.text?.startsWith('[{')).text).map(b=>b.id).find(b=>b!==own);
 doc.text+=make(own,other);return copy;
}
test('the api-reference slot bound to the header\'s ID follows it; a pointer to another ID or the ID elsewhere still differs',()=>{
 const control=load('vendor-docs-1'),pointer=to=>`\n- \`api-reference/${to}\`: every interface\n`;
 const bound=withText(control,own=>pointer(own));
 assert.equal(diff(bound,withText(race(control),own=>pointer(own))).ok,true,'the bound slot is projected with the swapped number');
 assert.equal(diff(bound,withText(race(control),(own,other)=>pointer(other))).ok,false,'a pointer to the other browser differs');
 assert.equal(diff(withText(control,own=>`\nBrowser ${own} here.\n`),withText(race(control),own=>`\nBrowser ${own} here.\n`)).ok,false,'the ID outside the slot is not projected');
});
