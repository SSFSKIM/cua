import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {normalizeRawResult,runRawScenario} from '../../scripts/repl-parity/runner.mjs';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';
import scenarios from './scenarios/index.mjs';import {selectScenarios,inventory} from '../../scripts/repl-parity/registry.mjs';
const image={type:'image',mimeType:'image/png',data:readFileSync(new URL('./fixtures/pattern.png',import.meta.url)).toString('base64'),annotations:{audience:['assistant']},_meta:{fixture:1}};
test('only MCP image content data is projected; annotations, item metadata, absence and application objects stay observable',async()=>{
 const source={content:[image],structuredContent:{...image,application:'one'}};const a=await normalizeRawResult(source);
 assert.equal(a.content[0].type,'image');assert.deepEqual(a.content[0].annotations,image.annotations);assert.deepEqual(a.content[0]._meta,image._meta);assert.deepEqual(a.structuredContent,source.structuredContent);assert.equal(a.content[0].data.$image,'sha256');
 const rows=value=>[{case:'image',cell:'one',ok:true,...value},{case:'image',assertion:{ok:true}}];
 for(const change of [r=>r.content[0].annotations.audience=['user'],r=>r.content[0]._meta.fixture=2,r=>delete r.content[0].mimeType,r=>r.structuredContent.application='two']){const b=structuredClone(source);change(b);assert.equal(compareRuns(rows(a),rows(await normalizeRawResult(b))).ok,false);}
});
test('a ping answered after the cell has settled is not evidence of live control traffic',async()=>{
 const client={call:async()=>({content:[{type:'text',text:'done'}],isError:false}),request:async()=>({})};
 await assert.rejects(runRawScenario({id:'fixture',cells:[{label:'one',code:'fixture',ping:true}],assert:()=>({ok:true})},{client,emit:()=>{},checkout:'/fixture'}),/ping|settled/);
});
test('CLI suite and milestone subset excludes later doubles; an extra selected cell on both sides fails',t=>{
 const dir=mkdtempSync(join(tmpdir(),'parity-subset-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const selected=selectScenarios(scenarios,inventory,{suite:'cells',through:'M1',platform:'darwin'}).scenarios;
 const later='secrets/browser/execute/fill';const rows=selected.flatMap(s=>[...s.cells.map(c=>({case:s.id,cell:c.label,ok:true,content:[],isError:false})),{case:s.id,assertion:{ok:true}}]);rows.push({case:later,cell:'boundary',ok:true,fake:true,value:{}},{case:later,assertion:{ok:true},fake:true});
 const meta={host:'vendor',complete:true,platform:'darwin',suite:'all',caseIds:[...selected.map(s=>s.id),later],connections:['c1'],hostAttestations:[{connection:'c1',host:'vendor',serverInfo:{name:'rmcp',version:'1'},_meta:null}]};
 for(const side of ['a','b']){mkdirSync(join(dir,side));writeFileSync(join(dir,side,'meta.json'),JSON.stringify(meta));writeFileSync(join(dir,side,'tools.json'),'{"tools":[]}');writeFileSync(join(dir,side,'results.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n'));}
 const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/repl-parity.mjs',import.meta.url)),'diff',join(dir,'a'),join(dir,'b'),'--suite','cells','--through','M1'],{encoding:'utf8'});
 const first=run();assert.equal(first.status,0,first.stdout+first.stderr);assert.equal(JSON.parse(first.stdout).cases,selected.length);
 for(const side of ['a','b'])writeFileSync(join(dir,side,'results.jsonl'),[...rows,{case:selected[0].id,cell:'unmanifested',ok:true,content:[]}].map(r=>JSON.stringify(r)).join('\n'));
 const extra=run();assert.equal(extra.status,1);assert.ok(JSON.parse(extra.stdout).differences.some(d=>d.kind==='cardinality'));
});
