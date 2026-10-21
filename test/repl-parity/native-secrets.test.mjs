import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createNativeSecretOracle} from './fixtures/native-secret-service.mjs';
import {nativeSecretCases,LABEL} from './fixtures/native-secret-cases.mjs';
import scenarios from './scenarios/index.mjs';
test('native secret required rows have selected-host executable proofs',()=>{
 for(const row of nativeSecretCases){const s=scenarios.find(s=>s.id===row.id);assert.ok(s,row.id);assert.equal(s.nativeSecrets,true);assert.throws(()=>s.assert({results:[]}));}
});
test('native secret recorder checks real fileStore reads, refusal-before-read and safe delivery without exposing values',async t=>{
 const root=await realpath(await mkdtemp('/tmp/cua-m4t1-cap-')),home=join(root,'run','test','home');await mkdir(home,{recursive:true});t.after(()=>rm(root,{recursive:true,force:true}));
 const asked=[],service=await createNativeSecretOracle(home,{nodeRepl:{requestMeta:{},createElicitation:async request=>{asked.push(request.meta.tool_params.app);return {action:'accept',content:{}};}}});
 for(const row of nativeSecretCases){
  await service.handleRpc({type:'secret.configure',id:row.id});let outcome={rejected:false};
  try{for(const request of row.requests)await service.handleRpc(request);}catch(e){outcome={rejected:true,message:e.message,messageOnly:true};}
  const observed=await service.handleRpc({type:'secret.observe',outcome});
  assert.deepEqual(observed,{requestMatches:true,readMatches:true,readLabels:Array(row.reads).fill(LABEL),backendMatches:true,backendCalled:row.requests.length>0&&(!row.error||row.substitute),resultMatches:true,errorSafe:true,labelReportMatches:true,messageOnly:true,approvalMatches:true},row.id);
 }
 assert.ok(asked.length>0&&asked.every(app=>app==='fixture'),'the approvals were the fixture window\'s app');
 await assert.rejects(createNativeSecretOracle('/tmp/owner/home'),/scratch/);
});
test('the native secret fixture accepts the scratch HOME of any run-labelled parity prefix, and still nothing else',async t=>{
 const made=async prefix=>{const root=await realpath(await mkdtemp('/tmp/'+prefix)),home=join(root,'run','test','home');await mkdir(home,{recursive:true});t.after(()=>rm(root,{recursive:true,force:true}));return home;};
 await createNativeSecretOracle(await made('cua-m4t3-cap-'));
 for(const prefix of ['cua-m4t3-other-','cuax-cap-','cua-M4-cap-'])await assert.rejects(createNativeSecretOracle(await made(prefix)),/canonical scratch HOME/,prefix);
});
