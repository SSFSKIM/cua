import {test} from 'node:test';import assert from 'node:assert/strict';import {assertPreparedFacts} from '../../scripts/repl-parity/provenance.mjs';
test('actual startup facts must match prepared commit, clean checkout, runtime, Node and platform',()=>{
 const expected={commit:'abc',checkout:'/fixture',home:'/runtime',release:'pin',node:'v24.1.0',platform:'darwin'};const actual={...expected,dirty:false,runtimeNode:'v24.21.0'};assertPreparedFacts(expected,actual);
 for(const key of ['commit','checkout','home','release','node','platform'])assert.throws(()=>assertPreparedFacts(expected,{...actual,[key]:'changed'}),/stale|provenance/i);
 assert.throws(()=>assertPreparedFacts(expected,{...actual,dirty:true}),/dirty/);assert.throws(()=>assertPreparedFacts(expected,undefined),/provenance/);
});
test('the own host\'s Node is part of the provenance a run is prepared with: a changed or missing one is stale',()=>{
 const expected={commit:'abc',checkout:'/fixture',home:'/runtime',release:'pin',node:'v22.23.3',platform:'linux',ownNode:{path:'/device/node',version:'v24.18.0'}};
 const actual={...expected,dirty:false};assertPreparedFacts(expected,actual);
 for(const ownNode of [null,undefined,{path:'/device/node',version:'v24.19.0'},{path:'/other/node',version:'v24.18.0'}])assert.throws(()=>assertPreparedFacts(expected,{...actual,ownNode}),/ownNode/);
 const legacy={...expected};delete legacy.ownNode;assertPreparedFacts(legacy,{...actual,ownNode:null});
});

test('changed browser route attestation invalidates a prepared run',()=>{
 const expected={checkout:'/fixture',home:'/runtime',commit:'abc',release:'pinned',node:'v24.0.0',platform:'linux',browserRoute:{route:'cua',manifests:[{sha256:'first'}]}};
 assert.doesNotThrow(()=>assertPreparedFacts(expected,{...expected,dirty:false}));
 assert.throws(()=>assertPreparedFacts(expected,{...expected,dirty:false,browserRoute:{route:null,manifests:[]}}),/browserRoute/);
 assert.throws(()=>assertPreparedFacts(expected,{...expected,dirty:false,browserRoute:undefined}),/browserRoute/);
});
