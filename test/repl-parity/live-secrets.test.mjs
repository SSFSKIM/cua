import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,symlink,realpath,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLiveSecretOracle,assertScratchHome,errorIsSafe} from './fixtures/live-secret-service.mjs';
import {prepareLiveSecretsLaunch} from './serve-live-secrets.mjs';
const ref='{{secret:PARITY_SYNTHETIC}}';
const rpc=(s,method,params)=>s.handleRpc({method,params});
const fill=(method='execute',value=ref)=>({method,params:{type:'playwright_locator_fill',browser_id:'fixture',tab_id:'7',selector:'#fixture',value,replace:true}});
async function scratch(t,prefix='cua-cap-'){const capabilityHome=await realpath(await mkdtemp(join(tmpdir(),prefix)));const userHome=`${capabilityHome}.home`,runDirectory=join(capabilityHome,'run','unit'),workerHome=join(runDirectory,'home');await mkdir(userHome);await mkdir(workerHome,{recursive:true});t.after(()=>Promise.all([rm(capabilityHome,{recursive:true,force:true}),rm(userHome,{recursive:true,force:true})]));return {capabilityHome,expectedCapabilityHome:capabilityHome,userHome,runDirectory,workerHome};}
async function configured(t,tail){const dirs=await scratch(t),s=await createLiveSecretOracle({...dirs,userHome:dirs.workerHome});await rpc(s,'secret.configure',{id:`secrets/browser-live/${tail}`});return s;}
// These are unit tests of the recorder/control boundary, not live host/client evidence.
async function exercise(s,request){let error;try{await s.handleRpc(request);}catch(e){error=e;}return rpc(s,'secret.observe',{rejected:!!error,message:error?.message,stack:error?.stack,cause:String(error?.cause),serialized:JSON.stringify(error),messageOnly:true});}
function passed(o){assert.equal(o.boundaryProof,'service-boundary-double');for(const key of ['requestMatches','readMatches','backendMatches','resultMatches','errorSafe','labelReportMatches','messageOnly'])assert.equal(o[key],true,key);}
test('real retained wrapper substitutes from the synthetic file store before the recorder',async t=>{
 const s=await configured(t,'execute/fill');const o=await exercise(s,fill());passed(o);assert.deepEqual(o.readLabels,['PARITY_SYNTHETIC']);assert.equal(o.backendCalled,true);assert.equal(o.substituted,true);
});
test('recorder detects an unchanged marker, extra fields and wrong client method rather than trusting successful calls',async t=>{
 const s=await configured(t,'execute/fill');const o=await exercise(s,fill('executeWithRecovery','prefix '+ref));assert.equal(o.requestMatches,false);assert.equal(o.readMatches,false);assert.equal(o.backendMatches,false);
 const extra=await configured(t,'execute/fill'),request=fill();request.params.extra=true;const bad=await exercise(extra,request);assert.equal(bad.requestMatches,false);assert.equal(bad.backendCalled,false);assert.deepEqual(bad.readLabels,[]);
});
test('invalid/reserved labels, unsupported shape and launch/version refusals happen before store reads',async t=>{
 for(const [tail,value]of [['invalid-label','{{secret:bad label}}'],['reserved-label','{{secret:CUA_DEVICE_PARITY}}'],['disabled',ref],['unavailable',ref],['service-version',ref]]){
  const s=await configured(t,`refuse/${tail}`);const o=await exercise(s,fill('execute',value));passed(o);assert.deepEqual(o.readLabels,[]);assert.equal(o.backendCalled,false);
 }
 const s=await configured(t,'refuse/unsupported-shape');passed(await exercise(s,{method:'execute',params:{type:'tab_ax_action',browser_id:'fixture',tab_id:'7',action:{kind:'paste',element_index:null,text:ref,format:'html'}}}));
});
test('real fileStore rejects absent, unsafe and unreadable synthetic paths before backend invocation',async t=>{
 for(const tail of ['unknown-label','unsafe-store','unreadable-store']){const s=await configured(t,`refuse/${tail}`);const o=await exercise(s,fill());passed(o);assert.deepEqual(o.readLabels,['PARITY_SYNTHETIC']);assert.equal(o.backendCalled,false);}
});
test('both post-read failure channels are sanitized by the imported production wrapper',async t=>{
 for(const tail of ['errors/rejection-sanitized','errors/recovery-envelope-sanitized','reports/labels-not-values']){const s=await configured(t,tail);const o=await exercise(s,fill(tail.includes('envelope')?'executeWithRecovery':'execute'));passed(o);assert.equal(o.substituted,true);assert.equal(o.backendCalled,true);}
});
test('error verifier catches private data in message, stack, cause and enumerable fields',()=>{
 const value='unit-only-private-marker';
 for(const key of ['message','stack','cause','serialized'])assert.equal(errorIsSafe({[key]:value},value),false);
 assert.equal(errorIsSafe({message:'secret PARITY_SYNTHETIC failed'},value),true);
});
test('scratch guard refuses ambient HOME and symlink aliases before writing a store',async t=>{
 const dirs=await scratch(t);assert.equal(await assertScratchHome({...dirs,userHome:dirs.workerHome}),dirs.workerHome);
 await assert.rejects(assertScratchHome(dirs),/scratch/);
 await assert.rejects(assertScratchHome({...dirs,userHome:tmpdir()}),/scratch/);
 const alias=join(dirs.capabilityHome,'alias');await symlink(dirs.userHome,alias);await assert.rejects(assertScratchHome({...dirs,userHome:alias}),/scratch/);
});
test('launch adapter selects real client, confines the synthetic HOME and keeps production wrapper roots',async t=>{
 const dirs=await scratch(t);
 for(const host of ['vendor','cua']){const prefix=host==='vendor'?'NODE_REPL':'CUA_REPL';const launch={command:'node',args:['serve'],cwd:dirs.runDirectory,env:{[`${prefix}_TRUSTED_SERVICES`]:JSON.stringify({browser:'/production/browser.mjs',sky:'/production/sky.mjs'}),[`${prefix}_TRUSTED_CODE_PATHS`]:'/production',CUA_REPL_NODE_REPL_PATH:'/pinned/host',NODE_REPL_NODE_MODULE_DIRS:'/runtime/node_modules',CUA_REPL_NODE_MODULE_DIRS:'/runtime/node_modules'}};
  const next=prepareLiveSecretsLaunch(launch,{host,...dirs,remote:true,vendorClient:'/vendor/browser-client.js',ownClient:'/own/browser-client.mjs'});
  assert.equal(JSON.parse(next.env[`${prefix}_TRUSTED_SERVICES`]).sky,'/production/sky.mjs');assert.match(JSON.parse(next.env[`${prefix}_TRUSTED_SERVICES`]).browser,/live-secret-service\.mjs$/);
  assert.equal(next.env.PARITY_LIVE_SECRET_HOME,dirs.workerHome);assert.equal(next.env.PARITY_LIVE_SECRET_CAPABILITY_HOME,dirs.capabilityHome);assert.ok(next.env[`${prefix}_JS_BANNER`].includes(host==='vendor'?'/vendor/browser-client.js':'/own/browser-client.mjs'));
  assert.equal(next.env[`${prefix}_UNTRUSTED_ENV_ALLOWLIST`].includes('PARITY_LIVE_SECRET'),false);
  assert.throws(()=>prepareLiveSecretsLaunch(launch,{host,...dirs,remote:false}),/remote/);
 }
});
test('all executable secret obligations have two real-cell scenarios and fail closed on missing observations',async()=>{
 const {default:scenarios}=await import('./scenarios/live-secrets.mjs');assert.equal(scenarios.length,25);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 for(const s of scenarios){assert.equal(s.backend,'capability-host');assert.equal(s.liveSecrets,true);assert.equal(s.boundaryProof,'service-boundary-double');assert.equal(s.cells.length,2);for(const c of s.cells)assert.doesNotThrow(()=>new AsyncFunction(c.code));assert.throws(()=>s.assert({results:[]}));}
});
test('scenario assertions reject changed secret, refusal, sanitation and worker error properties',async()=>{
 const {default:scenarios}=await import('./scenarios/live-secrets.mjs');const s=scenarios.find(s=>s.id==='secrets/browser-live/errors/rejection-sanitized');assert.ok(s);
 const result=value=>({isError:false,content:[{type:'text',text:'LIVE_SECRET:'+JSON.stringify(value)}]});
 const setup=result({ready:true,boundaryProof:'service-boundary-double'});
 const good={boundaryProof:'service-boundary-double',requestMatches:true,readMatches:true,readLabels:['PARITY_SYNTHETIC'],backendMatches:true,backendCalled:true,substituted:true,resultMatches:true,errorSafe:true,labelReportMatches:true,messageOnly:true};
 assert.equal(s.assert({results:[setup,result(good)]}).ok,true);
 for(const key of Object.keys(good).filter(key=>typeof good[key]==='boolean'))assert.throws(()=>s.assert({results:[setup,result({...good,[key]:false})]}),undefined,key);
 assert.throws(()=>s.assert({results:[setup,result({...good,readLabels:[]})]}));
});
test('AX supported variants and optional timeout/text-format fields reach the real wrapper in both channels',async t=>{
 for(const [channel,method]of [['execute','execute'],['execute-with-recovery','executeWithRecovery']])for(const [tail,action]of [
  ['ax-paste',{kind:'paste',element_index:null,text:ref}],['ax-type-text',{kind:'type_text',element_index:null,text:ref}],['ax-set-value',{kind:'set_value',element_index:3,value:ref}],
 ]){const s=await configured(t,`${channel}/${tail}`);passed(await exercise(s,{method,params:{type:'tab_ax_action',browser_id:'fixture',tab_id:'7',action}}));}
 const s=await configured(t,'optional-fields/timeouts-and-text-format');
 await s.handleRpc({method:'execute',params:{...fill().params,timeout_ms:1000,client_timeout_ms:1000}});
 passed(await exercise(s,{method:'execute',params:{type:'tab_ax_action',browser_id:'fixture',tab_id:'7',action:{kind:'paste',element_index:3,text:ref,format:'text'}}}));
});
test('embedded markers, unsupported fields, evaluate scripts and CDP strings stay unchanged and unread',async t=>{
 const requests=[['embedded-marker',fill('execute','prefix '+ref)],
 ['unsupported-fields',{method:'execute',params:{type:'tab_ax_action',browser_id:'fixture',tab_id:'7',action:{kind:'press_key',element_index:3,key:ref}}}],
 ['evaluate-strings',{method:'execute',params:{type:'playwright_evaluate',browser_id:'fixture',tab_id:'7',script:'const arg = undefined;\nreturn ("{{secret:PARITY_SYNTHETIC}}");'}}],
 ['cdp-strings',{method:'execute',params:{type:'tab_cdp_call',browser_id:'fixture',tab_id:'7',method:'Input.insertText',params:{text:ref}}}]];
 for(const [tail,request]of requests){const s=await configured(t,`no-substitution/${tail}`);const o=await exercise(s,request);passed(o);assert.equal(o.substituted,false);assert.deepEqual(o.readLabels,[]);}
});
test('setup selects the real client recovery channel and bootstrap replies never record secret input',async t=>{
 const s=await configured(t,'execute-with-recovery/fill');const setup=await rpc(s,'setup',{});assert.equal(setup.credentialRecoveryErrorVersion,1);
 assert.equal((await rpc(s,'executeWithRecovery',{type:'get_browser',id:'fixture'})).value.id,'fixture');
 assert.equal((await rpc(s,'executeWithRecovery',{type:'create_tab',browser_id:'fixture'})).value.id,'7');
 assert.deepEqual(await rpc(s,'executeWithRecovery',{type:'playwright_dom_snapshot',browser_id:'fixture',tab_id:'7'}),{ok:true,value:{dom_snapshot:'Fixture input'}});
 passed(await exercise(s,fill('executeWithRecovery')));
 await rpc(s,'secret.configure',{id:'secrets/browser-live/execute/fill'});assert.equal(Object.hasOwn(await rpc(s,'setup',{}),'credentialRecoveryErrorVersion'),false);
 const o=await rpc(s,'secret.observe',{rejected:false});assert.equal(o.requestMatches,false);assert.equal(o.backendMatches,false);assert.deepEqual(o.readLabels,[]);
});
test('private control names cannot become a generic RPC echo or raw trace endpoint',async t=>{
 const s=await configured(t,'execute/fill');for(const method of ['oracle.trace','oracle.reply','secret.test-leak'])await assert.rejects(rpc(s,method,{}),/Unknown live secret fixture method/);
 await assert.rejects(rpc(s,'secret.configure',{id:'secrets/browser-live/not-a-case'}),/Unknown live secret case/);
});
test('launch keeps synthetic HOME within its existing scoped writable run directory without widening policy',async t=>{
 const dirs=await scratch(t),cwd=join(dirs.capabilityHome,'run','sandbox-proof');
 const launch={command:'node',args:[],cwd,env:{HOME:dirs.userHome,TMPDIR:join(dirs.capabilityHome,'separate-temp'),NODE_REPL_TRUSTED_SERVICES:JSON.stringify({browser:'/production/browser.mjs'}),NODE_REPL_TRUSTED_CODE_PATHS:'/production',NODE_REPL_NODE_MODULE_DIRS:'/runtime/node_modules',CUA_REPL_NODE_REPL_PATH:'/pinned/host'}};
 const next=prepareLiveSecretsLaunch(launch,{host:'vendor',...dirs,remote:true});
 assert.equal(next.cwd,cwd);assert.equal(next.env.TMPDIR,launch.env.TMPDIR);assert.equal(next.env.HOME,join(cwd,'home'));
 assert.equal(next.env.PARITY_LIVE_SECRET_HOME,next.env.HOME);assert.equal(next.env.PARITY_LIVE_SECRET_RUN_DIRECTORY,cwd);
 assert.equal(await realpath(next.env.HOME),next.env.HOME);
 const service=await createLiveSecretOracle({capabilityHome:dirs.capabilityHome,expectedCapabilityHome:dirs.expectedCapabilityHome,userHome:next.env.HOME,runDirectory:cwd});
 await rpc(service,'secret.configure',{id:'secrets/browser-live/execute/fill'});passed(await exercise(service,fill()));
 assert.throws(()=>prepareLiveSecretsLaunch({...launch,cwd:dirs.userHome},{host:'vendor',...dirs,remote:true}),/scratch/);
});

test('launch refuses a symlinked session before creating HOME through it',async t=>{
 const dirs=await scratch(t),cwd=join(dirs.capabilityHome,'run','alias');await symlink(dirs.userHome,cwd);
 const launch={command:'node',args:[],cwd,env:{NODE_REPL_TRUSTED_SERVICES:JSON.stringify({browser:'/production/browser.mjs'}),NODE_REPL_TRUSTED_CODE_PATHS:'/production',NODE_REPL_NODE_MODULE_DIRS:'/runtime/node_modules'}};
 assert.throws(()=>prepareLiveSecretsLaunch(launch,{host:'vendor',...dirs,remote:true}),/symlinked scratch/);
 assert.deepEqual(await readdir(dirs.userHome),[]);
 await assert.rejects(assertScratchHome({...dirs,runDirectory:cwd,userHome:join(cwd,'home')}));
});
test('both live-secret guards accept the capability home of a run-labelled parity scratch prefix, and no other name',async t=>{
 const launchFor=dirs=>({command:'node',args:['serve'],cwd:dirs.runDirectory,env:{CUA_REPL_TRUSTED_SERVICES:JSON.stringify({browser:'/production/browser.mjs',sky:'/production/sky.mjs'}),CUA_REPL_TRUSTED_CODE_PATHS:'/production'}});
 const labelled=await scratch(t,'cua-m4t3-cap-');
 assert.equal(await assertScratchHome({...labelled,userHome:labelled.workerHome}),labelled.workerHome);
 prepareLiveSecretsLaunch(launchFor(labelled),{host:'cua',...labelled,remote:true,ownClient:'/own/browser-client.mjs'});
 for(const prefix of ['cua-m4t3-other-','cuax-cap-']){
  const other=await scratch(t,prefix);
  await assert.rejects(assertScratchHome({...other,userHome:other.workerHome}),/scratch HOME/,prefix);
  assert.throws(()=>prepareLiveSecretsLaunch(launchFor(other),{host:'cua',...other,remote:true,ownClient:'/own/browser-client.mjs'}),/capability scratch HOME/,prefix);
 }
});
