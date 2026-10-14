import {test} from 'node:test';import assert from 'node:assert/strict';import {assertPreparedFacts} from '../../scripts/repl-parity/provenance.mjs';
test('actual startup facts must match prepared commit, clean checkout, runtime, Node and platform',()=>{
 const expected={commit:'abc',checkout:'/fixture',home:'/runtime',release:'pin',node:'v24.1.0',platform:'darwin'};const actual={...expected,dirty:false,runtimeNode:'v24.21.0'};assertPreparedFacts(expected,actual);
 for(const key of ['commit','checkout','home','release','node','platform'])assert.throws(()=>assertPreparedFacts(expected,{...actual,[key]:'changed'}),/stale|provenance/i);
 assert.throws(()=>assertPreparedFacts(expected,{...actual,dirty:true}),/dirty/);assert.throws(()=>assertPreparedFacts(expected,undefined),/provenance/);
});
