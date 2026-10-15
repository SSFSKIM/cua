import test from 'node:test';
import assert from 'node:assert/strict';
import {profileObserver} from '../../scripts/repl-parity/profile-observer.mjs';

test('profile proof needs an actual initialized listing call and preserves absence',()=>{
 const p=profileObserver();
 p.request({id:1,method:'initialize'});p.response({id:1,result:{serverInfo:{name:'rmcp',version:'1'}}});
 assert.throws(()=>p.proof(),/listing/);
 p.request({id:2,method:'tools/call',params:{name:'js',arguments:{code:'nodeRepl.write("CUABACKENDS ");'}}});
 p.response({id:2,result:{isError:false,content:[{type:'text',text:'CUABACKENDS '+JSON.stringify({backends:[{family:'chrome',instanceId:'fixture',profileName:'Fixture',tabCount:null}]})}]}});
 assert.deepEqual(p.proof(),{serverInfo:{name:'rmcp',version:'1'},_meta:null,backends:[{family:'chrome',instanceId:'fixture',profileName:'Fixture',tabCount:null}],tabCounts:false});
});
test('profile proof rejects tab enumeration and any leaked owner title or URL',()=>{
 for(const code of ['cua.listTabs({emit:false})','await cua.listTabs()'])assert.throws(()=>profileObserver().request({id:2,method:'tools/call',params:{name:'js',arguments:{code}}}),/tabs/);
 const p=profileObserver();p.request({id:1,method:'initialize'});p.response({id:1,result:{serverInfo:{name:'rmcp',version:'1'}}});
 p.request({id:2,method:'tools/call',params:{name:'js',arguments:{code:'CUABACKENDS'}}});
 assert.throws(()=>p.response({id:2,result:{content:[{type:'text',text:'CUABACKENDS {"backends":[{"family":"chrome","title":"private"}]}'}]}}),/unexpected/);
});
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';
test('boundary proof labels cannot be removed or relabelled as live during comparison',()=>{
 const rows=[{case:'fixture',cell:'call',ok:true,value:true,proof:'boundary-double'},{case:'fixture',assertion:{ok:true},proof:'boundary-double'}];
 assert.equal(compareRuns(rows,structuredClone(rows),{raw:true}).ok,true);
 for(const proof of [undefined,'real-service']){const changed=structuredClone(rows);if(proof)changed[0].proof=proof;else delete changed[0].proof;assert.equal(compareRuns(rows,changed,{raw:true}).ok,false);}
});
import {evidenceBackend} from '../../scripts/repl-parity/api-lanes.mjs';
test('new API lanes preserve existing M0-M2 evidence backend identities',()=>{
 assert.equal(evidenceBackend([{backend:'no-services'},{backend:'host-boundary'}]),'no-services');
 assert.equal(evidenceBackend([{backend:'fixture-services'}]),'fixture-services');
 assert.equal(evidenceBackend([{backend:'fixture-services'},{backend:'no-services'}]),'no-services+fixture-services');
 assert.equal(evidenceBackend([{backend:'chrome'},{backend:'binder-double'},{backend:'capability-host'}]),'binder-double+capability-host+chrome');
});
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
test('M3 proof manifests are required while old cells controls accept additive manifests',()=>{
 const run=id=>({meta:{host:'vendor',complete:true,platform:'darwin',caseIds:[id],connections:['c1'],hostAttestations:[{connection:'c1',host:'vendor',serverInfo:{name:'rmcp',version:'1'},_meta:null}]},rows:[{case:id,cell:'call',ok:true,content:[],isError:false},{case:id,assertion:{ok:true}}]});
 const old=run('cells/bindings/persistent'),updated=structuredClone(old);updated.meta.caseProofs={[old.meta.caseIds[0]]:'no-services'};assert.equal(compareParityRuns(old,updated).ok,true);
 const current=run('api/cua/getstate');assert.equal(compareParityRuns(current,structuredClone(current)).ok,false);
 current.meta.caseProofs={'api/cua/getstate':'chrome'};assert.equal(compareParityRuns(current,structuredClone(current)).ok,true);
 const changed=structuredClone(current);changed.meta.caseProofs['api/cua/getstate']='binder-double';assert.equal(compareParityRuns(current,changed).ok,false);
});
