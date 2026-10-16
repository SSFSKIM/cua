import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectedSelection,selectionCases,assertSelection} from '../../scripts/repl-parity/selection.mjs';
test('independent M5 table preserves route precedence, explicit refusals and Node fallback',()=>{
 const base={platform:'darwin',surfaces:['browser'],registration:'cua',override:'unset',node24:true};
 assert.deepEqual(expectedSelection(base),{host:'cua',reason:'browser_only',status:'pass'});
 assert.deepEqual(expectedSelection({...base,platform:'linux'}),{host:'cua',reason:'linux',status:'pass'});
 assert.deepEqual(expectedSelection({...base,node24:false}),{host:'vendor',reason:'own_host_node_unavailable',status:'warn'});
 assert.equal(expectedSelection({...base,override:'cua',node24:false}).error,'repl_host_node');
 assert.equal(expectedSelection({...base,registration:'none'}).reason,'vendor_browser_route');
 assert.equal(expectedSelection({...base,surfaces:['computer','browser']}).reason,'macos_native_peer_requires_vendor');
 assert.equal(expectedSelection({...base,registration:'chatgpt',maws:true}).host,'cua');
 assert.equal(expectedSelection({...base,surfaces:['computer','browser'],maws:true}).host,'vendor');
 assert.equal(expectedSelection({...base,registration:'chatgpt',override:'cua'}).error,'repl_host_refused');
 assert.equal(expectedSelection({...base,override:'invalid'}).error,'invalid_repl_host');
});
test('selection matrix covers both launch consumers, registration orderings, surfaces and all overrides',()=>{
 const rows=selectionCases('darwin');
 for(const registration of ['none','chatgpt','cua','cua-then-chatgpt','chatgpt-then-cua'])for(const lane of ['ordinary','profiles'])for(const override of ['unset','cua','vendor','invalid'])assert.ok(rows.some(r=>r.registration===registration&&r.lane===lane&&r.override===override));
 assert.ok(rows.some(r=>r.maws));assert.ok(rows.some(r=>!r.node24));
});
test('selection verdict rejects wrong doctor explanation and mismatched real host markers',()=>{
 const row={platform:'darwin',surfaces:['browser'],registration:'cua',override:'unset',node24:true};
 const doctor={status:'pass',detail:'cua (browser_only); browser service cua; route cua; registration cua'};
 const observation={host:'cua',serverInfo:{name:'cua-repl-host',version:'0.5.0'},_meta:{'cua/replHost':{host:'cua',version:'0.5.0'}},executionFacts:{ownNode:{path:'/node',version:'v24.18.0'}}};
 assert.doesNotThrow(()=>assertSelection(row,{doctor,observation}));
 assert.throws(()=>assertSelection(row,{doctor:{...doctor,detail:'vendor staged_vendor_default'},observation}));
 assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,_meta:null}}));
 assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,serverInfo:{name:'cua-repl-host',version:'0.4.0'}}}));
});
