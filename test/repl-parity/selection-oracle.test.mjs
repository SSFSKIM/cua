import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installRoutes} from '../../scripts/repl-parity/selection-device.mjs';
import {chromeRoute,readVendorRecord} from '../../src/chrome/route.mjs';
// The ChatGPT route's record is only a leftover now: the home is on the cua route exactly when cua's record is there.
test('scratch registration fixtures write each route\'s record, in both orders, without touching browser manifests',()=>{
 const home=mkdtempSync(join(tmpdir(),'cua-selection-test-'));
 try{for(const [registration,route,chatgpt] of [['cua-then-chatgpt','cua',true],['chatgpt-then-cua','cua',true],['none',null,false],['chatgpt',null,true],['cua','cua',false]]){installRoutes(home,registration);assert.equal(chromeRoute(home),route);assert.equal(Boolean(readVendorRecord(home)),chatgpt,registration);}}
 finally{rmSync(home,{recursive:true,force:true});}
});
import assert from 'node:assert/strict';
import {expectedSelection,selectionCases,assertSelection} from '../../scripts/repl-parity/selection.mjs';
import {doctorReplHost} from './fixtures/doctor-repl-host.mjs';
test('independent M5 table preserves explicit refusals and Node fallback, whatever the registration',()=>{
 const base={platform:'darwin',surfaces:['browser'],registration:'cua',override:'unset',node24:true};
 assert.deepEqual(expectedSelection(base),{host:'cua',reason:'browser_only',status:'pass'});
 assert.deepEqual(expectedSelection({...base,platform:'linux'}),{host:'cua',reason:'linux',status:'pass'});
 assert.deepEqual(expectedSelection({...base,node24:false}),{host:'vendor',reason:'own_host_node_unavailable',status:'warn'});
 assert.equal(expectedSelection({...base,override:'cua',node24:false}).error,'repl_host_node');
 for(const registration of ['none','chatgpt','cua-then-chatgpt'])assert.deepEqual(expectedSelection({...base,registration}),expectedSelection(base),registration);
 assert.equal(expectedSelection({...base,surfaces:['computer','browser']}).reason,'macos_native_peer_requires_vendor');
 assert.equal(expectedSelection({...base,registration:'chatgpt',maws:true}).host,'cua');
 assert.equal(expectedSelection({...base,surfaces:['computer','browser'],maws:true}).host,'vendor');
 assert.deepEqual(expectedSelection({...base,registration:'chatgpt',override:'cua'}),{host:'cua',reason:'explicit',status:'pass'});
 assert.equal(expectedSelection({...base,registration:'chatgpt',surfaces:['computer','browser'],override:'cua'}).error,'repl_host_refused');
 assert.equal(expectedSelection({...base,override:'invalid'}).error,'invalid_setting');
 assert.equal(expectedSelection({...base,override:'invalid',lane:'profiles'}).error,'invalid_repl_host');
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
const lanes=detail=>{const [ordinary,listing]=detail.split('. The profile listing (browser only): ');return {ordinary,listing:listing.replace(/\. CUA_REPL_HOST=cua or vendor chooses$/,'')};};
const rejoin=({ordinary,listing})=>`${ordinary}. The profile listing (browser only): ${listing}. CUA_REPL_HOST=cua or vendor chooses`;
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
// The live lane's environment for a row, as selection-device.mjs builds it; MAWS client mode needs only a configured
// backend path to be in play.
const liveEnv=row=>({...envFor(row),...(row.maws?{CUA_BROWSER_BACKENDS:'/maws-fixture.sock'}:{})});
const doctorAs=(t,row,registration=row.registration)=>doctorReplHost(t,{platform:row.platform,env:liveEnv(row),node:MANAGED,registration});
// The real call's result on a macOS computer session carries the proxy's engine attestation (#117).
const attestation=engine=>engine?{'cua/nativeEngine':engine==='cua'?{engine,version:'0.0.0-selection',build:'f'.repeat(64)}:{engine,version:'26.924.1001281',build:'26.928.40906-darwin-arm64'}}:{};
const observationFor=(row,commit)=>{
 const expected=expectedSelection(row),engine=attestation(expected.engine);
 if(expected.host==='cua'){const own=ownObservation(commit);return {...own,_meta:{...own._meta,...engine}};}
 return {host:'vendor',serverInfo:{name:'rmcp',version:'1.5.0'},_meta:expected.engine?engine:null};
};
test('every selectable row passes on doctor\'s actual row, whatever the registration ordering or MAWS',async t=>{
 const reviewed=reviewedSource(t);
 // The engine rows (#117) carry their own inputs: graded by the engine test below.
 const rows=selectionCases('darwin').filter(r=>!r.engine&&r.node24&&!r.managedNode&&!expectedSelection(r).error).map(r=>({...r,managedNode:true}));
 for(const registration of ['none','chatgpt','cua','cua-then-chatgpt','chatgpt-then-cua'])for(const maws of [false,true])assert.ok(rows.some(r=>r.registration===registration&&r.maws===maws),`${registration}${maws?' with MAWS':''}`);
 for(const row of rows){
  const doctor=await doctorAs(t,row);
  assert.doesNotThrow(()=>assertSelection(row,{doctor,observation:observationFor(row,reviewed.reviewedCommit)},reviewed),JSON.stringify(row));
 }
});

// #117: the engine × host table, mirrored independently, and graded against doctor's actual row with each row's engine
// inputs injected exactly as the live lane places them (CUA_NATIVE_ENGINE, engine.json, an approved engine).
const engineInputs=row=>({config:()=>(row.engineFrom==='settings'?{engine:row.engine}:{}),installed:()=>(row.installed?{bundlePath:'/scratch.home/Library/Application Support/cua/engine/cua Engine.app',engineVersion:'0.0.0-selection',build:'f'.repeat(64)}:null)});
const engineEnv=row=>(row.engine&&row.engine!=='unset'&&row.engineFrom!=='settings'?{CUA_NATIVE_ENGINE:row.engine==='empty'?'':row.engine}:{});
test('the oracle\'s engine table: today\'s path, the target, comparison A, the refusals in order and the default cua\'s until-M6 rows',()=>{
 const row=fields=>expectedSelection({platform:'darwin',registration:'cua',maws:false,surfaces:['computer'],lane:'ordinary',override:'unset',node24:true,managedNode:true,engine:'unset',installed:false,...fields});
 assert.deepEqual(row({}),{host:'vendor',reason:'macos_native_peer_requires_vendor',engine:'vendor',status:'pass'});
 // An empty CUA_NATIVE_ENGINE is unset; an unknown engine in engine.json is refused as one in the environment is.
 assert.deepEqual(row({engine:'empty',installed:true}),row({installed:true}));
 assert.deepEqual(row({engine:'invalid',engineFrom:'settings'}),{error:'invalid_setting'});
 const live=selectionCases('darwin').filter(r=>r.engine);
 assert.ok(live.some(r=>r.engine==='empty')&&live.some(r=>r.engine==='invalid'&&r.engineFrom==='settings'),'the live oracle has both rows');
 assert.deepEqual(row({engine:'cua',installed:true}),{host:'cua',reason:'cua_engine',engine:'cua',status:'pass'});
 assert.deepEqual(row({engine:'cua',installed:true,override:'cua'}),{host:'cua',reason:'explicit',engine:'cua',status:'pass'});
 assert.deepEqual(row({engine:'cua',installed:true,override:'vendor',node24:false,managedNode:false}),{host:'vendor',reason:'explicit',engine:'cua',status:'pass'});
 for(const override of ['unset','vendor','cua'])for(const node24 of [true,false])assert.deepEqual(row({engine:'cua',override,node24,managedNode:node24}),{error:'engine_not_installed'},`${override} ${node24}`);
 assert.deepEqual(row({engine:'cua',installed:true,node24:false,managedNode:false}),{error:'repl_host_node'});
 assert.deepEqual(row({engine:'vendor',override:'cua',installed:true}),{error:'repl_host_refused'});
 assert.deepEqual(row({engine:'invalid',override:'cua',node24:false,managedNode:false}),{error:'invalid_setting',sentence:'CUA_NATIVE_ENGINE must be vendor or cua'});
 assert.deepEqual(row({engine:'cua',engineFrom:'settings',installed:true}),{host:'cua',reason:'cua_engine',engine:'cua',status:'pass'});
 // The default cua (M5 on), until M6.
 assert.deepEqual(row({defaultEngine:'cua',installed:true}),{host:'cua',reason:'cua_engine',engine:'cua',status:'pass'});
 assert.deepEqual(row({defaultEngine:'cua'}),{host:'vendor',reason:'engine_not_installed',engine:'vendor',status:'warn'});
 assert.deepEqual(row({defaultEngine:'cua',override:'vendor'}),{host:'vendor',reason:'engine_not_installed',engine:'vendor',status:'warn'});
 assert.deepEqual(row({defaultEngine:'cua',installed:true,node24:false,managedNode:false}),{host:'vendor',reason:'own_host_node_unavailable',engine:'vendor',status:'warn'});
 assert.deepEqual(row({defaultEngine:'cua',override:'cua'}),{error:'engine_not_installed'});
 // Linux and browser-only rows ignore the setting.
 assert.deepEqual(expectedSelection({platform:'linux',surfaces:['computer'],lane:'ordinary',override:'unset',node24:true,engine:'invalid'}),{host:'cua',reason:'linux',status:'pass'});
 assert.deepEqual(expectedSelection({platform:'darwin',surfaces:['computer'],lane:'profiles',override:'unset',node24:true,engine:'cua'}),{host:'cua',reason:'browser_only',status:'pass'});
 const rows=selectionCases('darwin').filter(r=>r.engine);
 for(const engine of ['unset','vendor','cua','invalid'])for(const override of ['unset','vendor','cua'])for(const node24 of [true,false])for(const installed of [false,true])
  assert.ok(rows.some(r=>r.engine===engine&&r.override===override&&r.node24===node24&&r.installed===installed),`${engine} ${override} ${node24} ${installed}`);
 assert.ok(rows.some(r=>r.engineFrom==='settings'));assert.equal(selectionCases('linux').filter(r=>r.engine).length,2);
});
test('every engine row agrees with doctor\'s actual row and the real call\'s attestation; a wrong engine anywhere fails',async t=>{
 const reviewed=reviewedSource(t);
 const rows=selectionCases('darwin').filter(r=>r.engine).map(r=>({...r,managedNode:r.node24}));
 for(const row of rows)await t.test(JSON.stringify(row),async t=>{
  const expected=expectedSelection(row);
  const doctor=await doctorReplHost(t,{platform:row.platform,env:{...envFor(row),...engineEnv(row)},node:row.node24?MANAGED:null,engine:engineInputs(row)});
  if(expected.error){
   assert.doesNotThrow(()=>assertSelection(row,{doctor,error:expected.error,errorMessage:expected.sentence??'refused'},reviewed));
   return;
  }
  const observation=observationFor(row,reviewed.reviewedCommit);
  assert.doesNotThrow(()=>assertSelection(row,{doctor,observation},reviewed));
  const other=expected.engine==='cua'?'vendor':'cua';
  assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,_meta:{...observation._meta,...attestation(other)}}},reviewed),/attests engine/,'another attested engine');
  assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,_meta:{...observation._meta,'cua/nativeEngine':undefined}}},reviewed),/attests engine/,'no attestation');
  assert.throws(()=>assertSelection(row,{doctor:{...doctor,detail:doctor.detail.replace(`native engine ${expected.engine} (`,`native engine ${other} (`)},observation},reviewed),/Doctor engine/,'another engine in doctor\'s row');
 });
});
test('rows outside the macOS computer surface must attest no engine, and doctor names none',async t=>{
 const reviewed=reviewedSource(t),row=ownRows[0],doctor=await doctorFor(t,row),observation=ownObservation(reviewed.reviewedCommit);
 assert.doesNotThrow(()=>assertSelection(row,{doctor,observation},reviewed));
 assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,_meta:{...observation._meta,...attestation('vendor')}}},reviewed),/attests engine/);
});
