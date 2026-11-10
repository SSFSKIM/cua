// Real trusted substitution/service modules with a fake engine boundary; isolated synthetic store only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSyntheticSecretProbe} from './ab-secret.mjs';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
async function setup(t){const parent=mkdtempSync(join(tmpdir(),'probe354-secret-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));const p=await createSyntheticSecretProbe({sourceRoot,parent});t.after(()=>p.close());return p}
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

test('mismatch without values or lengths remains visible as typeUnconfirmed through the trusted wrapper',async t=>{
 const p=await setup(t);
 const out=await p.run({app,bundle,pid,identity,id:'secret/mismatch',execute:execute(async()=>({error:{code:-32000,errorName:'typeUnconfirmed',message:'Secret text is not confirmed.',meta:{startedAt:1,endedAt:2,typeReadback:{confirmed:false,reason:'valueMismatch',reads:20}}}}))});
 assert.equal(out.engineRaw.error.errorName,'typeUnconfirmed');assert.deepEqual(out.findings,[]);assert.equal(out.service.error.code,'secret_input_failed');
});
