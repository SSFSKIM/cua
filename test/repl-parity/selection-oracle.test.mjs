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
import {doctorReplHost} from './fixtures/doctor-repl-host.mjs';
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
 assert.equal(expectedSelection({...base,override:'invalid'}).error,'invalid_setting');
 assert.equal(expectedSelection({...base,override:'invalid',lane:'profiles'}).error,'invalid_repl_host');
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
// Doctor's actual repl.host sentences (fixtures/doctor-repl-host.mjs), never a hand-written shape. Live rows answer on the
// managed Node under the answering scratch home, which is what doctor names in its ` on Node PATH` clause.
const HOME='/scratch',MANAGED='/scratch/node/24.22.0/bin/node';
const ownObservation=(commit,path=MANAGED)=>({host:'cua',serverInfo:{name:'cua-repl-host',version:'0.5.0'},_meta:{'cua/replHost':{host:'cua',version:'0.5.0'}},executionFacts:{commit,dirty:false,home:HOME,ownNode:{path,version:'v24.22.0'}}});
const envFor=row=>({CUA_SHIM_SURFACES:row.surfaces.join(','),...(row.override==='unset'?{}:{CUA_REPL_HOST:row.override})});
const doctorFor=(t,row,{node=MANAGED,...env}={})=>doctorReplHost(t,{platform:row.platform,env:{...envFor(row),...env},node});
const lanes=detail=>{const [ordinary,rest]=detail.split('. Browser route: ');const [route,listing]=rest.split('. The profile listing (browser only): ');return {ordinary,route,listing:listing.replace(/\. CUA_REPL_HOST=cua or vendor chooses$/,'')};};
const rejoin=({ordinary,route,listing})=>`${ordinary}. Browser route: ${route}. The profile listing (browser only): ${listing}. CUA_REPL_HOST=cua or vendor chooses`;
const ownRows=[
 ...['ordinary','profiles'].flatMap(lane=>['unset','cua'].map(override=>({platform:'darwin',registration:'cua',maws:false,surfaces:['browser'],lane,override,node24:true,managedNode:true}))),
 ...['ordinary','profiles'].map(lane=>({platform:'darwin',registration:'cua',maws:false,surfaces:['browser'],lane,override:'unset',node24:false,managedNode:true})),
 {platform:'linux',registration:'cua',maws:false,surfaces:['computer'],lane:'ordinary',override:'unset',node24:true,managedNode:true},
];
test('own-host successes pass on doctor\'s actual sentence, both lanes and the managed fifth case',async t=>{
 const reviewed=reviewedSource(t),observation=ownObservation(reviewed.reviewedCommit);
 for(const row of ownRows)await t.test(JSON.stringify(row),async t=>{
  const doctor=await doctorFor(t,row);
  assert.match(doctor.detail,new RegExp(`^cua host \\(${row.platform==='linux'?'linux':row.override==='cua'?'explicit':'browser_only'}\\) on Node ${MANAGED}: `),'the formatter shape these regressions grade');
  assert.doesNotThrow(()=>assertSelection(row,{doctor,observation},reviewed));
 });
});
test('own-host verdict rejects doctor\'s actual sentence for another host or reason',async t=>{
 const reviewed=reviewedSource(t),observation=ownObservation(reviewed.reviewedCommit);
 for(const row of ownRows)await t.test(JSON.stringify(row),async t=>{
  const vendor=await doctorFor(t,row,{CUA_REPL_HOST:'vendor'});
  assert.throws(()=>assertSelection(row,{doctor:vendor,observation},reviewed),/Doctor host\/reason/,'wrong host');
  const otherReason=await doctorFor(t,row,row.override==='cua'?{CUA_REPL_HOST:''}:{CUA_REPL_HOST:'cua'});
  assert.throws(()=>assertSelection(row,{doctor:otherReason,observation},reviewed),/Doctor host\/reason/,'wrong reason');
  // Right in the other lane only: each lane reads its own sentence.
  const right=lanes((await doctorFor(t,row)).detail),wrong=lanes(otherReason.detail);
  const crossed=row.lane==='profiles'?{...right,listing:wrong.listing}:{...right,ordinary:wrong.ordinary};
  assert.throws(()=>assertSelection(row,{doctor:{status:'pass',detail:rejoin(crossed)},observation},reviewed),/Doctor host\/reason/,'wrong reason in the row\'s lane');
 });
});
test('managed own rows require doctor\'s on-Node clause to name exactly the Node that answered',async t=>{
 const reviewed=reviewedSource(t),observation=ownObservation(reviewed.reviewedCommit);
 for(const row of ownRows)await t.test(JSON.stringify(row),async t=>{
  const right=await doctorFor(t,row);
  for(const other of ['/scratch/node/24.0.0/bin/node','/opt/homebrew/bin/node',MANAGED+'-old']){
   const doctor=await doctorFor(t,row,{node:other});
   assert.throws(()=>assertSelection(row,{doctor,observation},reviewed),/managed Node/,other);
  }
  // The answering path elsewhere (explanation, the other lane) never stands in for the clause.
  const otherNode=lanes((await doctorFor(t,row,{node:'/opt/homebrew/bin/node'})).detail),own=lanes(right.detail);
  const borrowed=row.lane==='profiles'?{...otherNode,ordinary:own.ordinary}:{...otherNode,listing:own.listing};
  assert.throws(()=>assertSelection(row,{doctor:{status:'pass',detail:rejoin(borrowed)},observation},reviewed),/managed Node/,'path only in the other lane');
  const clauseless=right.detail.replaceAll(` on Node ${MANAGED}:`,`: answered by ${MANAGED},`);
  assert.throws(()=>assertSelection(row,{doctor:{status:'pass',detail:clauseless},observation},reviewed),/managed Node|Doctor host\/reason/,'path only in the explanation');
  // And the witness is checked against the doctor clause, not the other way round.
  assert.throws(()=>assertSelection(row,{doctor:right,observation:ownObservation(reviewed.reviewedCommit,'/scratch/node/24.0.0/bin/node')},reviewed),/managed Node/,'witness differs');
 });
});
test('selection verdict rejects mismatched real host markers under doctor\'s actual sentence',async t=>{
 const reviewed=reviewedSource(t),row=ownRows[0],observation=ownObservation(reviewed.reviewedCommit),doctor=await doctorFor(t,row);
 assert.doesNotThrow(()=>assertSelection(row,{doctor,observation},reviewed));
 assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,_meta:null}},reviewed));
 assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,serverInfo:{name:'cua-repl-host',version:'0.4.0'}}},reviewed));
 const stale=structuredClone(observation);stale.serverInfo.version='0.0.0-stale';stale._meta['cua/replHost'].version='0.0.0-stale';
 assert.throws(()=>assertSelection(row,{doctor,observation:stale},reviewed),/version.*source|source.*version/i);
});
