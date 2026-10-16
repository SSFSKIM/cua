import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installRoutes} from '../../scripts/repl-parity/selection-device.mjs';
import {chromeRoute} from '../../src/chrome/route.mjs';
test('scratch registration fixtures actually change route in both orders without touching browser manifests',()=>{
 const home=mkdtempSync(join(tmpdir(),'cua-selection-test-'));
 try{for(const [registration,route] of [['cua-then-chatgpt','vendor'],['chatgpt-then-cua','cua'],['none',null],['chatgpt','vendor'],['cua','cua']]){installRoutes(home,registration);assert.equal(chromeRoute(home),route);}}
 finally{rmSync(home,{recursive:true,force:true});}
});
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
 assert.equal(expectedSelection({...base,browserService:'vendor',override:'cua'}).error,'repl_host_refused');
 assert.equal(expectedSelection({...base,registration:'none',browserService:'cua'}).host,'cua');
 assert.equal(expectedSelection({...base,platform:'linux',surfaces:['computer'],registration:'none'}).reason,'linux');
});
test('selection matrix covers both launch consumers, registration orderings, surfaces and all overrides',()=>{
 const rows=selectionCases('darwin');
 for(const registration of ['none','chatgpt','cua','cua-then-chatgpt','chatgpt-then-cua'])for(const lane of ['ordinary','profiles'])for(const override of ['unset','cua','vendor','invalid'])assert.ok(rows.some(r=>r.registration===registration&&r.lane===lane&&r.override===override));
 assert.ok(rows.some(r=>r.maws));assert.ok(rows.some(r=>!r.node24));
});
function reviewedSource(t){
 const sourceRepo=mkdtempSync(join(tmpdir(),'cua-selection-source-'));t.after(()=>rmSync(sourceRepo,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:sourceRepo,encoding:'utf8'}).trim();
 git('init','-q');mkdirSync(join(sourceRepo,'src/repl-host'),{recursive:true});writeFileSync(join(sourceRepo,'src/repl-host/identity.mjs'),"export const REPL_HOST_VERSION = '0.5.0';\n");
 git('add','.');git('-c','user.name=Test','-c','user.email=test@example.test','-c','commit.gpgsign=false','commit','-qm','reviewed identity');
 return {sourceRepo,reviewedCommit:git('rev-parse','HEAD')};
}
const ownObservation=commit=>({host:'cua',serverInfo:{name:'cua-repl-host',version:'0.5.0'},_meta:{'cua/replHost':{host:'cua',version:'0.5.0'}},executionFacts:{commit,dirty:false,ownNode:{path:'/node',version:'v24.18.0'}}});
const doctorDetail=(ordinary,listing=ordinary)=>`${ordinary}. Browser route: the cua route, by cua's registration. The profile listing (browser only): ${listing}. CUA_REPL_HOST=cua or vendor chooses`;
test('selection verdict rejects wrong doctor explanation and mismatched real host markers',t=>{
 const reviewed=reviewedSource(t),row={platform:'darwin',surfaces:['browser'],registration:'cua',override:'unset',node24:true};
 const doctor={status:'pass',detail:doctorDetail('cua host (browser_only): the browser-only session, on Node /node')};
 const observation=ownObservation(reviewed.reviewedCommit);
 assert.doesNotThrow(()=>assertSelection(row,{doctor,observation},reviewed));
 assert.throws(()=>assertSelection(row,{doctor:{...doctor,detail:'vendor staged_vendor_default'},observation},reviewed));
 assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,_meta:null}},reviewed));
 assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,serverInfo:{name:'cua-repl-host',version:'0.4.0'}}},reviewed));
 const stale=structuredClone(observation);stale.serverInfo.version='0.0.0-stale';stale._meta['cua/replHost'].version='0.0.0-stale';
 assert.throws(()=>assertSelection(row,{doctor,observation:stale},reviewed),/version.*source|source.*version/i);
});
test('doctor verdict uses canonical leading host and reason, not explanation or the listing suffix',async t=>{
 const reviewed=reviewedSource(t),observation=ownObservation(reviewed.reviewedCommit);
 for(const lane of ['ordinary','profiles'])for(const override of ['unset','cua'])await t.test(`${lane}, ${override}`,()=>{
  const row={platform:'darwin',surfaces:['browser'],registration:'cua',override,node24:true,lane};
  const sentence=override==='cua'?'cua host (explicit): CUA_REPL_HOST=cua, on Node /node':'cua host (browser_only): the browser-only session, on Node /node';
  const doctor={status:'pass',detail:doctorDetail(sentence)};
  assert.doesNotThrow(()=>assertSelection(row,{doctor,observation},reviewed));
  const corruptHost=sentence.replace(/^cua host/,'vendor host');
  const detail=lane==='ordinary'?doctorDetail(corruptHost,sentence):doctorDetail(sentence,corruptHost);
  assert.throws(()=>assertSelection(row,{doctor:{...doctor,detail},observation},reviewed),/Doctor host\/reason/);
  const corruptReason=sentence.replace(override==='cua'?'(explicit)':'(browser_only)',override==='cua'?'(not_explicit)':'(not_browser_only)');
  const reasonDetail=lane==='ordinary'?doctorDetail(corruptReason,sentence):doctorDetail(sentence,corruptReason);
  assert.throws(()=>assertSelection(row,{doctor:{...doctor,detail:reasonDetail},observation},reviewed),/Doctor host\/reason/);
 });
 const row={platform:'darwin',surfaces:['browser'],registration:'cua',override:'unset',node24:true,lane:'profiles'};
 assert.throws(()=>assertSelection(row,{doctor:{status:'pass',detail:'cua host (browser_only): on Node /node; the cua route, by registration'},observation},reviewed),/Doctor host\/reason/);
});
test('managed Node doctor path is checked inside the selected sentence, not borrowed from another lane',t=>{
 const reviewed=reviewedSource(t),row={platform:'darwin',surfaces:['browser'],registration:'cua',override:'unset',node24:false,managedNode:true,lane:'profiles'};
 const observation=ownObservation(reviewed.reviewedCommit);observation.executionFacts.home='/scratch';observation.executionFacts.ownNode.path='/scratch/node/24.x/bin/node';
 const sentence='cua host (browser_only): the browser-only session, on Node '+observation.executionFacts.ownNode.path;
 const doctor={status:'pass',detail:doctorDetail(sentence)};
 assert.doesNotThrow(()=>assertSelection(row,{doctor,observation},reviewed));
 assert.throws(()=>assertSelection(row,{doctor:{...doctor,detail:doctorDetail(sentence,sentence.replace(observation.executionFacts.ownNode.path,'/wrong/node'))},observation},reviewed),/Doctor must name the managed Node/);
});
