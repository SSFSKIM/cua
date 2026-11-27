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

// #171 M6a: on Linux the runtime a run resolves is cua's own, which has no Node of its own tree: the runtime's Node is the
// managed Node cua installed in the home (its recorded bytes). Since #171 M6b, which removed the vendor's engine from
// Linux, a run records no vendor release. Elsewhere the runtime's Node is the release's bundled one, as before.
test('the runtime facts: the managed Node and no vendor release on Linux, the bundled Node elsewhere',async t=>{
 const {runtimeFacts}=await import('../../scripts/repl-parity/provenance.mjs');
 const {mkdtempSync,realpathSync,rmSync,writeFileSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {fakeManagedNode}=await import('../fixtures/own-linux-runtime.mjs');
 const home=realpathSync(mkdtempSync(join(tmpdir(),'cua-parity-facts-')));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const host={platform:'linux',arch:'x64'},ran=[];
 const run=path=>{ran.push(path);return `${path===join(home,'bundled','node')?'v24.21.0':'v24.22.0'}\n`;};
 const own={release:'cua-linux-x64-e0.4.4-n24.22.0-s0.163.0-m0123456789ab',home,root:join(home,'modules','x'),paths:{moduleDir:join(home,'modules','x','node_modules')},manifest:{platform:'linux',arch:'x64'}};
 assert.deepEqual(runtimeFacts(own,{run}),{release:own.release,runtimeNode:null},'no managed Node: none, never another');
 assert.deepEqual(ran,[]);
 const node=fakeManagedNode(home,host,{version:'24.22.0'});
 assert.deepEqual(runtimeFacts(own,{run}),{release:own.release,runtimeNode:'v24.22.0'});
 assert.deepEqual(ran,[node],'the managed Node is the one asked');
 writeFileSync(node,'#!/bin/sh\necho v24.99.0\n');
 assert.equal(runtimeFacts(own,{run}).runtimeNode,null,'bytes that are not its record\'s are no managed Node');
 assert.equal('vendorRelease' in runtimeFacts({...own,manifest:{platform:'linux',arch:'arm64'}},{run}),false);
 const vendor={release:'26.928.40906-darwin-arm64',home,root:join(home,'runtimes','r'),paths:{node:join(home,'bundled','node')},manifest:{platform:'darwin',arch:'arm64'}};
 assert.deepEqual(runtimeFacts(vendor,{run}),{release:vendor.release,runtimeNode:'v24.21.0'});
});

test('a recorded runtime Node and vendor release are compared whenever the preparation recorded them, null included',()=>{
 const expected={commit:'abc',checkout:'/fixture',home:'/runtime',release:'own',node:'v24.1.0',platform:'linux',runtimeNode:null,vendorRelease:'26.928.40906-linux-x64'};
 const actual={...expected,dirty:false};assertPreparedFacts(expected,actual);
 assert.throws(()=>assertPreparedFacts(expected,{...actual,runtimeNode:'v24.22.0'}),/runtimeNode/);
 assert.throws(()=>assertPreparedFacts(expected,{...actual,vendorRelease:'26.928.40906-linux-arm64'}),/vendorRelease/);
 assert.throws(()=>assertPreparedFacts(expected,{...actual,vendorRelease:undefined}),/vendorRelease/);
 const legacy={...expected};delete legacy.runtimeNode;delete legacy.vendorRelease;assertPreparedFacts(legacy,{...actual,runtimeNode:'v24.22.0',vendorRelease:undefined});
});
