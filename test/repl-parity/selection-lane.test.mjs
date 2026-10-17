// The selection lane's refusal boundaries and its failure accounting. An invalid CUA_REPL_HOST is refused at two
// different boundaries: `cua serve` validates settings at start (settingsFrom, invalid_setting), while the profile
// listing and doctor resolve the selection (replHostFor, invalid_repl_host). Every refusal carries one sentence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {expectedSelection,selectionCases,assertSelection,selectionVerdict} from '../../scripts/repl-parity/selection.mjs';
import {ordinaryCall,refusalOf,listingOutcome,evaluateSelection} from '../../scripts/repl-parity/selection-device.mjs';
import {REPO,scratch,shortScratch,forgeActiveRuntime} from '../fixtures/runtime-fixture.mjs';
import {loadPins,selectPin} from '../../src/runtime/manifest.mjs';
const pinned=(()=>{try{selectPin(loadPins());return true;}catch{return false;}})();

const SENTENCE='CUA_REPL_HOST must be cua or vendor';
// Row 4 of the stopped mini run (ddc7427): doctor's repl.host row for darwin, no registration, browser only, invalid.
const diagnostic=JSON.parse(readFileSync(join(REPO,'docs/evidence/2026-10-14-own-repl-host-parity/m5/mini/diagnostics/selection-invalid-setting/selection.json'),'utf8'));
const invalidRow=diagnostic.rows[3];
const doctorDetail=(ordinary,listing=ordinary)=>`${ordinary}. Browser route: the ChatGPT extension route, as a home with no Chrome registration is read. The profile listing (browser only): ${listing}. CUA_REPL_HOST=cua or vendor chooses`;

test('the recorded row is the invalid-override row the lane stopped at',()=>{
 assert.equal(invalidRow.row.override,'invalid');assert.equal(invalidRow.row.lane,'ordinary');
 assert.equal(invalidRow.doctor.detail,doctorDetail(`refused (invalid_repl_host): ${SENTENCE}`));
});

test('an invalid override expects invalid_setting from serve and invalid_repl_host from the listing and doctor',()=>{
 const invalid=selectionCases('darwin').filter(r=>r.override==='invalid');
 assert.equal(invalid.length,60);
 for(const row of invalid)assert.deepEqual(expectedSelection(row),{error:row.lane==='profiles'?'invalid_repl_host':'invalid_setting',doctorError:'invalid_repl_host',sentence:SENTENCE},JSON.stringify(row));
 for(const platform of ['darwin','linux'])assert.equal(expectedSelection({platform,registration:'cua',surfaces:['computer'],override:'invalid'}).error,'invalid_setting');
});

test('the ordinary invalid row accepts serve\'s invalid_setting and doctor\'s invalid_repl_host, each with the exact sentence',()=>{
 const {row,doctor}=invalidRow;
 assert.doesNotThrow(()=>assertSelection(row,{doctor,error:'invalid_setting',errorMessage:SENTENCE}));
 for(const [label,evidence,pattern] of [
  ['the old single-code expectation',{error:'invalid_repl_host',errorMessage:SENTENCE},/invalid_repl_host.*invalid_setting/],
  ['the raw JSON-RPC code the stopped run recorded',{error:-32000,errorMessage:'invalid_setting'},/-32000/],
  ['an unexpected error',{error:'unexpected_error',errorMessage:SENTENCE},/unexpected_error/],
  ['no refusal at all',{observation:{host:'vendor'}},/not refused/],
  ['another sentence',{error:'invalid_setting',errorMessage:'CUA_REPL_HOST must be one of cua, vendor'},/sentence/],
  ['a sentence with extra words',{error:'invalid_setting',errorMessage:`${SENTENCE}; got invalid`},/sentence/],
  ['no sentence',{error:'invalid_setting'},/sentence/],
 ])assert.throws(()=>assertSelection(row,{doctor,...evidence}),pattern,label);
});

test('doctor must refuse an invalid override in the row\'s own lane with invalid_repl_host and the exact sentence',()=>{
 const good=`refused (invalid_repl_host): ${SENTENCE}`;
 for(const lane of ['ordinary','profiles'])for(const [label,bad] of [
  ['the serve boundary code',`refused (invalid_setting): ${SENTENCE}`],
  ['another sentence',`refused (invalid_repl_host): CUA_REPL_HOST must be cua, vendor or unset`],
  ['a truncated sentence','refused (invalid_repl_host): CUA_REPL_HOST must be cua'],
  ['a selection instead of a refusal','vendor host (vendor_browser_route): the browser surface\'s service is the vendor\'s'],
 ]){
  const row={...invalidRow.row,lane},error=lane==='profiles'?'invalid_repl_host':'invalid_setting';
  assert.doesNotThrow(()=>assertSelection(row,{doctor:{status:'fail',detail:doctorDetail(good)},error,errorMessage:SENTENCE}));
  // The other lane is right, so only reading the row's own lane catches it.
  const detail=lane==='ordinary'?doctorDetail(bad,good):doctorDetail(good,bad);
  assert.throws(()=>assertSelection(row,{doctor:{status:'fail',detail},error,errorMessage:SENTENCE}),/Doctor/,`${lane}: ${label}`);
 }
 assert.throws(()=>assertSelection(invalidRow.row,{doctor:{...invalidRow.doctor,status:'pass'},error:'invalid_setting',errorMessage:SENTENCE}));
});

test('the profiles-listing invalid row accepts only invalid_repl_host with the exact sentence',()=>{
 const row={...invalidRow.row,lane:'profiles'},{doctor}=invalidRow;
 assert.doesNotThrow(()=>assertSelection(row,{doctor,error:'invalid_repl_host',errorMessage:SENTENCE}));
 assert.throws(()=>assertSelection(row,{doctor,error:'invalid_setting',errorMessage:SENTENCE}),/invalid_setting.*invalid_repl_host/);
 assert.throws(()=>assertSelection(row,{doctor,error:'invalid_repl_host',errorMessage:'invalid_repl_host'}),/sentence/);
});

test('other refusals are read from the row\'s own doctor lane too',()=>{
 const row={platform:'darwin',registration:'cua',maws:false,surfaces:['computer'],lane:'ordinary',override:'cua',node24:true,managedNode:true};
 assert.equal(expectedSelection(row).error,'repl_host_refused');
 const refused='refused (repl_host_refused): CUA_REPL_HOST=cua is not supported with the computer surface on macOS';
 const own='cua host (explicit): CUA_REPL_HOST=cua, on Node /node';
 const detail=(ordinary,listing)=>`${ordinary}. Browser route: none, no browser surface. The profile listing (browser only): ${listing}. CUA_REPL_HOST=cua or vendor chooses`;
 assert.doesNotThrow(()=>assertSelection(row,{doctor:{status:'fail',detail:detail(refused,own)},error:'repl_host_refused',errorMessage:'cua: repl_host_refused'}));
 assert.throws(()=>assertSelection(row,{doctor:{status:'fail',detail:detail(own,refused)},error:'repl_host_refused',errorMessage:'cua: repl_host_refused'}),/Doctor/);
});

test('refusals keep their code and sentence; anything else stays visible as unexpected_error',()=>{
 assert.deepEqual(refusalOf(new Error(`serve refused before launch (invalid_setting): ${SENTENCE}`)),{code:'invalid_setting',message:SENTENCE});
 assert.deepEqual(refusalOf(Object.assign(new Error('x'),{refusal:{code:'invalid_repl_host',message:SENTENCE}})),{code:'invalid_repl_host',message:SENTENCE});
 const server='cua: repl_host_refused: CUA_REPL_HOST=cua needs cua\'s own browser service';
 assert.deepEqual(refusalOf(Object.assign(new Error(server),{code:-32000})),{code:'repl_host_refused',message:server});
 assert.deepEqual(refusalOf(Object.assign(new Error('MCP exited (1)'),{code:-32000})),{code:'unexpected_error',message:'MCP exited (1)'});
});

test('listing output becomes an observation or a refusal carrying the listing\'s code and sentence',()=>{
 const observation={serverInfo:{name:'rmcp'},_meta:null,launchNode:{path:'/n',version:'v24'}};
 assert.deepEqual(listingOutcome(JSON.stringify({observation})),observation);
 assert.throws(()=>listingOutcome(JSON.stringify({error:'invalid_repl_host',message:SENTENCE})),e=>{assert.deepEqual(refusalOf(e),{code:'invalid_repl_host',message:SENTENCE});return true;});
 assert.throws(()=>listingOutcome(''),e=>refusalOf(e).code==='unexpected_error'&&/no JSON/.test(e.message));
});

const env=home=>({PATH:process.env.PATH,HOME:home,CUA_HOME:home,CUA_SHIM_SECRETS:'off',CUA_PARITY_REMOTE:'1',CUA_SHIM_SURFACES:'browser',CUA_REPL_HOST:'invalid'});
test('the real serve refuses an invalid override at start with invalid_setting and the sentence, through the oracle\'s frame',async t=>{
 const s=scratch('cua-selection-serve-');t.after(s.cleanup);
 const failure=await ordinaryCall({home:s.dir,env:env(s.dir),node:process.execPath}).then(()=>null,e=>e);
 assert.ok(failure,'serve must refuse');
 assert.deepEqual(refusalOf(failure),{code:'invalid_setting',message:SENTENCE});
});

test('the real profile listing refuses an invalid override at selection with invalid_repl_host and the sentence',{skip:!pinned&&'no checked-in runtime pin for this host to forge an install from'},t=>{
 const s=shortScratch('cua-sel-');t.after(s.cleanup);const home=realpathSync(s.dir);forgeActiveRuntime(home);
 const run=spawnSync(process.execPath,['scripts/repl-parity/selection-listing.mjs'],{cwd:REPO,env:env(home),encoding:'utf8',timeout:30000});
 assert.deepEqual(JSON.parse(run.stdout),{error:'invalid_repl_host',message:SENTENCE});
});

test('selection listing never lets a non-selection failure message out',t=>{
 const s=shortScratch('cua-sel-');t.after(s.cleanup);
 const run=spawnSync(process.execPath,['scripts/repl-parity/selection-listing.mjs'],{cwd:REPO,env:{...env(s.dir),CUA_REPL_HOST:'vendor'},encoding:'utf8',timeout:30000});
 const parsed=JSON.parse(run.stdout);
 assert.equal(typeof parsed.error,'string');assert.notEqual(parsed.error,'invalid_repl_host');assert.equal(Object.hasOwn(parsed,'message'),false);
});

test('an early row failure does not stop later rows or the cache and job checks; every failure is reported',async()=>{
 const cases=[{n:1},{n:2},{n:3},{n:4}],seen=[];
 const failures=await evaluateSelection({cases,
  evaluateRow:async row=>{seen.push(row.n);if(row.n===1||row.n===3)throw new Error(`row ${row.n} wrong`);},
  checks:{cache:async()=>{seen.push('cache');throw new Error('cache wrong');},job:async()=>{seen.push('job');}}});
 assert.deepEqual(seen,[1,2,3,4,'cache','job']);
 assert.deepEqual(failures,[{row:1,case:{n:1},message:'row 1 wrong'},{row:3,case:{n:3},message:'row 3 wrong'},{check:'cache',message:'cache wrong'}]);
});

test('an environment failure around a row stops the lane with the failures so far, never as a row verdict',async()=>{
 const failures=[],seen=[];
 await assert.rejects(evaluateSelection({cases:[{n:1},{n:2},{n:3}],failures,
  evaluateRow:async row=>{seen.push(row.n);if(row.n===1)throw new Error('row 1 wrong');},
  around:async(row,run)=>{if(row.n===2)throw new Error('managed Node could not be moved aside');return run();},
  checks:{cache:async()=>seen.push('cache')}}),/managed Node could not be moved aside/);
 assert.deepEqual(seen,[1]);assert.deepEqual(failures,[{row:1,case:{n:1},message:'row 1 wrong'}]);
});

test('the lane verdict fails on any failing row or check, an unfinished lane, or missing rows, and names each',()=>{
 const rows=n=>Array.from({length:n},()=>({}));
 assert.deepEqual(selectionVerdict({complete:true,planned:2,rows:rows(2),failures:[]}),{ok:true,lines:[]});
 const failing=selectionVerdict({complete:true,planned:3,rows:rows(3),failures:[
  {row:1,case:{platform:'darwin',registration:'none',maws:false,surfaces:['browser'],lane:'ordinary',override:'invalid',node24:true,managedNode:true},message:'first'},
  {row:3,case:{platform:'darwin',registration:'cua',maws:true,surfaces:['computer','browser'],lane:'profiles',override:'cua',node24:false,managedNode:false},message:'third'},
  {check:'job',message:'job wrong'}]});
 assert.equal(failing.ok,false);assert.equal(failing.lines.length,3);
 assert.match(failing.lines[0],/^row 1\/3 .*darwin.*none.*browser.*ordinary.*invalid.*: first$/);
 assert.match(failing.lines[1],/^row 3\/3 .*maws.*computer,browser.*profiles.*cua.*node22.*: third$/);
 assert.equal(failing.lines[2],'check job: job wrong');
 assert.deepEqual(selectionVerdict({complete:false,error:'install failed',planned:3,rows:[],failures:[]}),{ok:false,lines:['lane stopped before finishing: install failed']});
 assert.equal(selectionVerdict({complete:true,planned:3,rows:rows(2),failures:[]}).ok,false);
});
