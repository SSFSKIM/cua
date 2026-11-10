// Real trusted substitution/service modules with a fake engine boundary; isolated synthetic store only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSyntheticSecretProbe} from './ab-secret.mjs';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
async function setup(t,options={}){const parent=mkdtempSync(join(tmpdir(),'probe354-secret-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));const p=await createSyntheticSecretProbe({sourceRoot,parent,...options});t.after(()=>p.close());return p}
const identity={engineVersion:'test',build:'fixture'};
const app='/Applications/Fixture.app',bundle='fixture.probe354',pid=123;
const execute=type=>async(method,args)=>method==='resolve_app'?{result:{pid,appPath:app,bundleIdentifier:bundle,displayName:'Fixture'}}:type(args);

test('a handle reads only the isolated store and reaches the real trusted service as concealed input',async t=>{
 const p=await setup(t);let typed=false;
 const out=await p.run({app,bundle,pid,identity,id:'secret/equality',execute:execute(async args=>{
  typed=true;assert.equal(args.app,app);assert.equal(args.concealed,true);assert.notEqual(args.text,'{{secret:PROBE354}}');assert.equal(args.probe354Audit,'secret/equality');
  return {result:{meta:{inputRoute:{route:'test'},startedAt:1,endedAt:2}}};
 })});
 assert.ok(typed);assert.equal(out.engineRaw.error,undefined);assert.deepEqual(out.findings,[]);assert.equal(out.service.error,null);
 assert.equal(out.service.meta['cua/inputRoute'].route,'test','shared metadata is preserved, not mistaken for a cycle');
 assert.ok(existsSync(join(p.home,'.config/claude-secrets/PROBE354')));
});

test('secret bytes and mismatch lengths are rejected across raw reply, service meta and logs, then withheld',async t=>{
 const p=await setup(t);
 const out=await p.run({app,bundle,pid,identity,id:'secret/mismatch',execute:execute(async args=>{
  assert.equal(p.log('accidental log '+args.text).includes(args.text),false);
  return {error:{code:-32000,errorName:'typeUnconfirmed',message:'Mismatch '+args.text,meta:{startedAt:1,endedAt:2,typeReadback:{actualLength:64,expectedLength:64,actual:args.text}}}};
 })});
 assert.ok(out.findings.length>0);assert.equal(p.logLeaks,1);
 assert.equal(out.engineRaw.error.errorName,'typeUnconfirmed');
 assert.equal(out.service.error.code,'secret_input_failed'); // This control pin predates admission of the new engine error name.
 assert.equal(out.engineRaw.error.meta.typeReadback.actualLength,null);
 assert.match(out.engineRaw.error.message,/redacted/);
 assert.deepEqual(p.inspect(out).filter(s=>s.includes('secret bytes')),[]);
});

test('trusted-service console output is checked before it can enter hosted logs',async t=>{
 const p=await setup(t),original=console.log,captured=[];console.log=(...a)=>captured.push(a.join(' '));
 let out;try{out=await p.run({app,bundle,pid,identity,id:'secret/logging',execute:execute(async args=>{console.log(args.text);return {result:{meta:{startedAt:1,endedAt:2}}}})})}finally{console.log=original}
 assert.ok(out.findings.some(s=>s.includes('console')));assert.equal(p.logLeaks,1);assert.equal(p.inspect({logs:captured}).length,0);
});

test('length-only structured engine logs are violations and are withheld before saving',async t=>{
 const p=await setup(t),line=JSON.stringify({typeReadback:{expectedLength:64,actualLength:63}}),saved=p.log(line);
 assert.equal(p.logLeaks,1);
 assert.equal(saved.includes('expectedLength'),false);assert.equal(saved.includes('actualLength'),false);
});

test('length-only serialized console logs are violations and are withheld before saving',async t=>{
 const p=await setup(t);
 const out=await p.run({app,bundle,pid,identity,id:'secret/length-logging',execute:execute(async()=>{
  console.log(JSON.stringify({typeReadback:{expectedLength:64,actualLength:63}}));
  console.warn({typeReadback:{expectedLength:64,actualLength:63}});
  return {result:{meta:{startedAt:1,endedAt:2}}};
 })});
 assert.equal(p.logLeaks,2);
 assert.ok(out.findings.some(s=>s.includes('console')));
 assert.equal(JSON.stringify(out.service.logs).includes('expectedLength'),false);assert.equal(JSON.stringify(out.service.logs).includes('actualLength'),false);
});

test('concealed checkpoint and key counts are rejected even on a successful response',async t=>{
 const p=await setup(t);
 const out=await p.run({app,bundle,pid,identity,id:'secret/counts',execute:execute(async()=>({result:{meta:{typeReadback:{confirmed:true,keysUnconfirmed:3,checkpoints:1}}}}))});
 assert.ok(out.findings.some(s=>s.includes('keysUnconfirmed')));assert.ok(out.findings.some(s=>s.includes('checkpoints')));
 assert.equal(out.engineRaw.result.meta.typeReadback.keysUnconfirmed,null);assert.equal(out.engineRaw.result.meta.typeReadback.checkpoints,null);
});

test('one versus three concealed Returns uses the same prefix and compares only the complete typeReadback object',async t=>{
 const p=await setup(t);let prefix,samePrefix;const counts=[];
 const run=(returnUnits,at)=>p.run({app,bundle,pid,identity,id:'secret/returns/'+returnUnits,pair:'rep/1',returnUnits,execute:execute(async args=>{
  counts.push((args.text.match(/\r/g)??[]).length);
  const current=args.text.slice(0,-returnUnits);if(prefix===undefined)prefix=current;else samePrefix=current===prefix;
  return {result:{meta:{startedAt:at,endedAt:at+1,typeReadback:{confirmed:true}}}};
 })});
 const one=await run(1,10),three=await run(3,20);
 assert.deepEqual(counts,[1,3]);assert.equal(samePrefix,true);
 assert.equal(one.returnMetadataEqual,null);assert.equal(three.returnMetadataEqual,true);
 assert.deepEqual(one.findings,[]);assert.deepEqual(three.findings,[]);
 assert.equal(one.engineRaw.result.meta.startedAt,10);assert.equal(three.engineRaw.result.meta.startedAt,20,'real action timestamps are retained, not normalized');
});

test('concealed Return comparison excludes snapshotMs only and preserves raw timings',async t=>{
 const p=await setup(t);
 const run=(returnUnits,snapshotMs,pollMs=2)=>p.run({app,bundle,pid,identity,id:'secret/timed/'+returnUnits,pair:'rep/1',returnUnits,execute:execute(async()=>({result:{meta:{startedAt:snapshotMs*10,endedAt:snapshotMs*10+1,typeReadback:{confirmed:true,snapshotMs,pollMs}}}}))});
 const one=await run(1,1),three=await run(3,2);
 assert.equal(three.returnMetadataEqual,true);
 assert.equal(one.engineRaw.result.meta.typeReadback.snapshotMs,1);assert.equal(three.engineRaw.result.meta.typeReadback.snapshotMs,2);
 await run(1,1);assert.equal((await run(3,2,3)).returnMetadataEqual,false,'pollMs must not be excluded');
});

test('concealed Boolean keysUnconfirmed is allowed, but numeric counts are not',async t=>{
 const p=await setup(t);
 const out=await p.run({app,bundle,pid,identity,id:'secret/flag',execute:execute(async()=>({result:{meta:{typeReadback:{confirmed:true,keysUnconfirmed:true}}}}))});
 assert.deepEqual(out.findings,[]);assert.equal(out.engineRaw.result.meta.typeReadback.keysUnconfirmed,true);
});

test('private selection fixtures have identical ranges and only the equal seed is the synthetic secret',async t=>{
 const p=await setup(t);assert.equal(typeof p.fixture,'function');
 const equal=p.fixture('equal'),different=p.fixture('different');
 assert.equal(JSON.stringify(equal.selection)===JSON.stringify(different.selection),true);assert.equal(equal.text.length===different.text.length,true);
 assert.equal(equal.selection[0]===0&&equal.selection[1]===equal.text.length,true);
 assert.equal(equal.text===different.text,false);assert.equal(/^[^0-9a-f]+$/i.test(different.text),true);
 let sameHandle=false;
 await p.run({app,bundle,pid,identity,id:'selection/equal',selectionVariant:'equal',pair:'rep/1',execute:execute(async args=>{sameHandle=args.text===equal.text;return {result:{meta:{typeReadback:{confirmed:true}}}}})});
 assert.equal(sameHandle,true);assert.equal(p.expected(different.text,different.selection)===equal.text,true);
});

test('private setup failures withhold seed bytes, ranges, trace lengths and exception details',async t=>{
 const p=await setup(t);assert.equal(typeof p.fixture,'function');assert.equal(typeof p.sanitizeFixture,'function');
 const privateState=p.fixture('equal'),row={secret:true,failureStage:'setup',valid:false,problem:'Failed '+privateState.text+' length='+privateState.text.length,
  reset:{text:privateState.text,length:privateState.text.length,selection:privateState.selection,trace:[{text:privateState.text,len:privateState.text.length}]},
  setup:{length:privateState.text.length,selection:privateState.selection,error:'Bad '+privateState.text},samples:[{length:privateState.text.length,selection:privateState.selection,trace:[{len:privateState.text.length}]}]};
 let saved;try{p.checkFixture({matchesExpected:false,text:privateState.text,length:privateState.text.length,selection:privateState.selection},privateState,'fixture')}catch(e){
  assert.equal(String(e).includes(privateState.text),false);assert.match(String(e),/private fixture/i);
 }finally{saved=p.sanitizeFixture(row)}
 const serialized=JSON.stringify(saved);assert.equal(serialized.includes(privateState.text),false);assert.equal(/"(?:length|selection|trace|len)"/.test(JSON.stringify([saved.reset,saved.setup,saved.samples])),false);
 assert.equal(saved.valid,false);assert.equal(saved.failureStage,'setup');assert.match(saved.problem,/private fixture/i);
});

test('selection records compare exactly except snapshotMs, independently of mandatory Return pairs',async t=>{
 const p=await setup(t);
 const run=(selectionVariant,typeReadback,pair='selection/1')=>p.run({app,bundle,pid,identity,id:pair+'/'+selectionVariant,pair,selectionVariant,execute:execute(async()=>({result:{meta:{typeReadback}}}))});
 assert.equal((await run('equal',{confirmed:true,snapshotMs:1,reads:2})).selectionMetadataEqual,null);
 assert.equal((await run('different',{confirmed:true,snapshotMs:9,reads:2})).selectionMetadataEqual,true);
 await run('equal',{confirmed:true,reads:2},'selection/2');assert.equal((await run('different',{confirmed:true,reads:3},'selection/2')).selectionMetadataEqual,false);
 assert.equal((await run('different',{confirmed:true},'missing')).selectionMetadataEqual,false);
});

test('adapter socket timing excludes resolution while trusted timing retains it',async t=>{
 let now=0;const p=await setup(t,{clock:()=>now});
 const out=await p.run({app,bundle,pid,identity,id:'secret/timing',execute:async method=>{
  if(method==='resolve_app'){now+=100;return {result:{pid,appPath:app,bundleIdentifier:bundle,displayName:'Fixture'}}}
  now+=7;return {result:{meta:{startedAt:10,endedAt:11,typeReadback:{confirmed:true}}}};
 }});
 assert.equal(out.timing.engine.durationMs,7);assert.equal(out.timing.trusted.durationMs>out.timing.engine.durationMs,true);
 assert.equal(out.engineRaw.result.meta.startedAt,10);assert.equal(out.engineRaw.result.meta.endedAt,11);
});

test('mismatch without values or lengths remains visible as typeUnconfirmed through the trusted wrapper',async t=>{
 const p=await setup(t);
 const out=await p.run({app,bundle,pid,identity,id:'secret/mismatch',execute:execute(async()=>({error:{code:-32000,errorName:'typeUnconfirmed',message:'Secret text is not confirmed.',meta:{startedAt:1,endedAt:2,typeReadback:{confirmed:false,reason:'concealedMismatch',reads:20}}}}))});
 assert.equal(out.engineRaw.error.errorName,'typeUnconfirmed');assert.deepEqual(out.findings,[]);assert.equal(out.service.error.code,'secret_input_failed');
});
