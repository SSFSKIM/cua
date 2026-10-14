import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cellCode, captureRawResult} from '../../scripts/browser-parity/runner.mjs';
import {compareParityRuns, validateAttestations} from '../../scripts/repl-parity/compare.mjs';
import {caseSchedule, validateRegistry, selectScenarios} from '../../scripts/repl-parity/registry.mjs';
import {exactImage} from '../../scripts/browser-parity/image-hash.mjs';
import {readFileSync} from 'node:fs';
const inventory=JSON.parse(readFileSync(new URL('./inventory.json',import.meta.url)));
const scenario={id:'cells/bindings/persistent',milestone:'M1',platforms:['darwin','linux'],backend:'no-services',contracts:['cell/bindings/persistent'],cells:[{label:'one',code:'let a=1;'}],assert:()=>({ok:true})};
const run=()=>({meta:{host:'vendor',complete:true,platform:'darwin',suite:'cells',through:'M1',caseIds:[scenario.id],connections:['c1'],hostAttestations:[{connection:'c1',host:'vendor',serverInfo:{name:'node_repl',version:'1'},_meta:null}]},rows:[{case:scenario.id,cell:'one',ok:true,content:[{type:'text',text:'one'},{type:'text',text:'two'}],isError:false,meta:{'cua/taskId':'task-1'}},{case:scenario.id,assertion:{ok:true}}]});
test('raw cells are passed literally and raw capture preserves field absence and content order',()=>{
 assert.equal(cellCode({raw:true,code:'let a=1; throw new Error("x")'}),'let a=1; throw new Error("x")');
 assert.deepEqual(captureRawResult({content:[{type:'text',text:'a'}]}),{content:[{type:'text',text:'a'}]});
 assert.deepEqual(captureRawResult({content:[],isError:false,structuredContent:null,_meta:{x:1}}),{content:[],isError:false,structuredContent:null,meta:{x:1}});
});
test('case due dates do not inherit the later row completion date',()=>{
 const plan=caseSchedule(inventory); assert.equal(plan.find(x=>x.id==='api/cua/getapp').milestone,'M3');assert.equal(plan.find(x=>x.id==='native/cua/getapp').milestone,'M4');
 assert.throws(()=>validateRegistry([{...scenario,assert:undefined}],inventory),/assert/);
 assert.throws(()=>validateRegistry([scenario,scenario],inventory),/duplicate/);
 assert.throws(()=>validateRegistry([{...scenario,contracts:['cell/bindings/redeclare']}],inventory),/contract/);
 assert.equal(validateRegistry([scenario],inventory).length,1);
 assert.throws(()=>selectScenarios([scenario],inventory,{suite:'cells',through:'M1',platform:'darwin'}),/missing executable/);
});
test('raw comparator detects content, errors, documents, metadata, missing cases and failed independent outcomes',()=>{
 assert.equal(compareParityRuns(run(),run()).ok,true);
 const mutations=[r=>r.rows[0].content.reverse(),r=>r.rows[0].content.pop(),r=>r.rows[0].content[0].text='changed document',r=>r.rows[0].isError=true,r=>r.rows[0].meta.extra=true,r=>r.rows[0].structuredContent={},r=>r.rows=[],r=>r.rows.pop(),r=>r.rows[1].assertion.ok=false];
 for(const mutate of mutations){const b=run();mutate(b);assert.equal(compareParityRuns(run(),b).ok,false);}
 assert.throws(()=>compareParityRuns(run(),run(),{expected:[{reason:'ignore',cases:[scenario.id],cells:['one'],kind:'semantic'}]}),/vendor/);
});
test('every connection including reconnects must attest a real tool result; mismatches refuse comparison',()=>{
 const a=run();validateAttestations(a.meta);
 for(const mutate of [m=>m.complete=false,m=>m.connections.push('c2'),m=>m.hostAttestations[0]._meta={'cua/replHost':{host:'cua',version:'1'}},m=>m.hostAttestations[0].serverInfo=null,m=>m.hostAttestations.push({...m.hostAttestations[0],host:'cua'})]){const b=run();mutate(b.meta);assert.throws(()=>compareParityRuns(a,b),/attest|complete|connection|host/i);}
 const own={...a.meta,host:'cua',hostAttestations:[{connection:'c1',host:'cua',serverInfo:{name:'cua-repl-host',version:'1'},executionFacts:{ownNode:{path:'/device/node',version:'v24.18.0'}},_meta:{'cua/replHost':{host:'cua',version:'1'}}}]};validateAttestations(own);
 for(const ownNode of [undefined,null,{path:'/device/node',version:'v22.23.3'},{path:'node',version:'v24.18.0'}])assert.throws(()=>validateAttestations({...own,hostAttestations:[{...own.hostAttestations[0],executionFacts:{ownNode}}]}),/Node it ran on/);
 own.hostAttestations[0]._meta['cua/replHost'].version='2';assert.throws(()=>validateAttestations(own));
});
test('exact deterministic image oracle rejects equal-average brightness/colour corruption and WebP mismatch',()=>{
 for(const format of ['png','jpeg','webp']){
 const bytes=readFileSync(new URL(`./fixtures/pattern.${format}`,import.meta.url));const x=exactImage(bytes);assert.equal(x.width,8);assert.equal(x.height,8);assert.equal(x.mimeType,`image/${format}`);assert.match(x.sha256,/^[0-9a-f]{64}$/);
 const a=run(),b=run();a.rows[0].content=[{type:'image',...x}];b.rows[0].content=[{type:'image',...x,sha256:'0'.repeat(64)}];assert.equal(compareParityRuns(a,b).ok,false);
 assert.throws(()=>exactImage(bytes,{mimeType:'image/not-real'}),/MIME/);
 }
 const black=exactImage(readFileSync(new URL('./fixtures/black.png',import.meta.url))),white=exactImage(readFileSync(new URL('./fixtures/white.png',import.meta.url))),red=exactImage(readFileSync(new URL('./fixtures/red.png',import.meta.url)));
 assert.notEqual(black.sha256,white.sha256);assert.notEqual(white.sha256,red.sha256);
});

test('only the declared vendor execution-duration metadata is excluded; other timing-looking fields stay exact',()=>{
 const a=run(),b=run();a.rows[0].meta['codex/nodeReplExecutionDurationMs']=1;b.rows[0].meta['codex/nodeReplExecutionDurationMs']=99;
 assert.equal(compareParityRuns(a,b).ok,true);
 b.rows[0].meta.otherDurationMs=99;assert.equal(compareParityRuns(a,b).ok,false);
});

test('raw normalization does not mask arbitrary structured content timestamps or IDs',async()=>{
 const {createNormalizer}=await import('../../scripts/browser-parity/normalize.mjs');
 const normalize=createNormalizer({imageMode:'exact',schemaFields:false});
 const result=await normalize({content:[{type:'text',text:'unchanged'}],structuredContent:{timestamp:12,taskId:'application-value'},meta:{'cua/taskId':'random'}},{ids:{'meta.cua/taskId':'task'}});
 assert.deepEqual(result,{content:[{type:'text',text:'unchanged'}],structuredContent:{timestamp:12,taskId:'application-value'},meta:{'cua/taskId':'<task:1>'}});
});

test('required cell manifests detect a cell removed from both evidence sides',()=>{
 const a=run(),b=run();a.meta.caseCells=b.meta.caseCells={[scenario.id]:['one','two']};
 assert.equal(compareParityRuns(a,b).ok,false);
});

test('a run cannot mix host versions across individually valid reconnects',()=>{
 const meta=run().meta;meta.connections.push('c2');meta.hostAttestations.push({connection:'c2',host:'vendor',serverInfo:{name:'node_repl',version:'2'},_meta:null});
 assert.throws(()=>validateAttestations(meta),/mixed|version/i);
});

test('fake backend rows never count as live host coverage',()=>{
 const a=run(),b=run();a.rows[0].fake=b.rows[0].fake=true;
 const result=compareParityRuns(a,b);assert.equal(result.ok,false);assert.equal(result.cases,0);
});
test('expected host identity differences need exact case, cell, field and observed values',()=>{
 const a=run(),b=run();b.meta.host='cua';b.meta.hostAttestations=[{connection:'c1',host:'cua',serverInfo:{name:'cua-repl-host',version:'1'},executionFacts:{ownNode:{path:'/device/node',version:'v24.18.0'}},_meta:{'cua/replHost':{host:'cua',version:'1'}}}];b.rows[0].meta['cua/replHost']={host:'cua',version:'1'};
 const expected=[{reason:'Deliberate host identity',cases:[scenario.id],cells:['one'],field:'meta.cua/replHost',vendor:{present:false},cua:{present:true,value:{host:'cua',version:'1'}}}];
 assert.equal(compareParityRuns(a,b).ok,false);assert.equal(compareParityRuns(a,b,{expected}).ok,true);
 b.rows[0].content[0].text='changed document';assert.equal(compareParityRuns(a,b,{expected}).ok,false);
 assert.throws(()=>compareParityRuns(a,b,{expected:[{...expected[0],field:'content.0.text'}]}),/field|identity/);
});

test('effective tool schema drift invalidates parity instead of counting the cell outcomes',()=>{
 const a=run(),b=run();a.tools={tools:[{name:'js',inputSchema:{type:'object'}}]};b.tools={tools:[{name:'js',inputSchema:{type:'string'}}]};
 const result=compareParityRuns(a,b);assert.equal(result.ok,false);assert.equal(result.cases,0);
});

test('application objects cannot opt into screenshot comparison by using an internal image marker',()=>{
 const a=run(),b=run();a.rows[0].structuredContent={$image:'ahash64',width:8,height:8,hash:'0000000000000000',application:'one'};b.rows[0].structuredContent={...a.rows[0].structuredContent,application:'two'};
 assert.equal(compareParityRuns(a,b).ok,false);
});

test('a non-image MCP item cannot make its application data a screenshot slot',()=>{
 const a=run(),b=run();a.rows[0].content=[{type:'text',text:'fixture',data:{$image:'ahash64',width:8,height:8,hash:'0000000000000000',application:'one'}}];b.rows[0].content=structuredClone(a.rows[0].content);b.rows[0].content[0].data.application='two';
 assert.equal(compareParityRuns(a,b).ok,false);
});
