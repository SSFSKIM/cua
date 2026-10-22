import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {approvalsMatch,createNativeSecretOracle} from './fixtures/native-secret-service.mjs';
import {nativeSecretCases,LABEL,WINDOW} from './fixtures/native-secret-cases.mjs';
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
  assert.deepEqual(observed,{requestMatches:true,readMatches:true,readLabels:Array(row.reads).fill(LABEL),backendMatches:true,backendCalled:row.requests.length>0&&(!row.error||row.substitute),resultMatches:true,errorSafe:true,labelReportMatches:true,messageOnly:true},row.id);
 }
 assert.ok(asked.length>0&&asked.every(app=>app==='fixture'),'the approvals were the fixture window\'s app');
 await assert.rejects(createNativeSecretOracle('/tmp/owner/home'),/scratch/);
});
test('the native secret fixture accepts the scratch HOME of any run-labelled parity prefix, and still nothing else',async t=>{
 const made=async prefix=>{const root=await realpath(await mkdtemp('/tmp/'+prefix)),home=join(root,'run','test','home');await mkdir(home,{recursive:true});t.after(()=>rm(root,{recursive:true,force:true}));return home;};
 await createNativeSecretOracle(await made('cua-m4t3-cap-'));
 for(const prefix of ['cua-m4t3-other-','cuax-cap-','cua-M4-cap-'])await assert.rejects(createNativeSecretOracle(await made(prefix)),/canonical scratch HOME/,prefix);
});
// #117 M3: the approvals fold into requestMatches, so the printed report keeps the vendor control's keys (the parity diff
// compares it), and a wrong approval still fails the scenario.
const RIGHT={requestMatches:true,readMatches:true,backendMatches:true,resultMatches:true,errorSafe:true,labelReportMatches:true,messageOnly:true};
test('a wrong approval fails the native secret case through requestMatches, and the passing report has the control\'s keys only',async t=>{
 const row=nativeSecretCases.find(r=>!r.error&&r.requests.length>0),refused=nativeSecretCases.find(r=>r.error&&r.reads===0);
 assert.ok(row&&refused);
 assert.equal(approvalsMatch(row,Array(row.requests.length).fill(WINDOW.app)),true);
 assert.equal(approvalsMatch(row,[]),false,'not asked');
 assert.equal(approvalsMatch(row,[...Array(row.requests.length).fill(WINDOW.app),WINDOW.app]),false,'asked once too often');
 assert.equal(approvalsMatch(row,Array(row.requests.length).fill('org.example.other')),false,'another app');
 assert.equal(approvalsMatch(refused,[]),true);
 assert.equal(approvalsMatch(refused,[WINDOW.app]),false,'a request refused before its read asks nothing');

 // End to end through the oracle, every approval accepted: the report carries exactly the control's keys.
 const root=await realpath(await mkdtemp('/tmp/cua-m4t1-cap-')),home=join(root,'run','test','home');await mkdir(home,{recursive:true});t.after(()=>rm(root,{recursive:true,force:true}));
 const service=await createNativeSecretOracle(home,{nodeRepl:{requestMeta:{},createElicitation:async()=>({action:'accept',content:{}})}});
 await service.handleRpc({type:'secret.configure',id:row.id});
 for(const request of row.requests)await service.handleRpc(request);
 const observed=await service.handleRpc({type:'secret.observe',outcome:{rejected:false}});
 assert.deepEqual(Object.keys(observed).sort(),['backendCalled','backendMatches','errorSafe','labelReportMatches','messageOnly','readLabels','readMatches','requestMatches','resultMatches'],'the control\'s keys, no approval key');
 assert.equal(observed.requestMatches,true);

 const scenario=scenarios.find(s=>s.id===row.id);
 const report=fields=>({isError:false,content:[{type:'text',text:'NATIVE_SECRET:'+JSON.stringify(fields)}]});
 const ready=report({ready:true});
 const passing={...RIGHT,readLabels:Array(row.reads).fill(LABEL),backendCalled:row.requests.length>0&&(!row.error||row.substitute)};
 assert.deepEqual(scenario.assert({results:[ready,report(passing)]}),{ok:true});
 assert.throws(()=>scenario.assert({results:[ready,report({...passing,requestMatches:false})]}),'a wrong approval (requestMatches false) fails the case');
});
