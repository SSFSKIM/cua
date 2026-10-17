import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {mkdir,readdir,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
import {writePointer} from '../../src/runtime/layout.mjs';
import {remoteCapabilityLane} from '../../scripts/repl-parity/capability.mjs';
import {prepareLiveSecretsLaunch} from './serve-live-secrets.mjs';
import {assertScratchHome,createLiveSecretOracle} from './fixtures/live-secret-service.mjs';

function managedFixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-managed-secret-test-'))),source=join(root,'source'),parent=join(root,'user','.cp');
 mkdirSync(join(source,'runtimes','fixture'),{recursive:true});writePointer(source,'fixture');
 const capability=prepareCapabilityHome({source,scratchRoot:parent,ambient:{CUA_PARITY_REMOTE:'1',CUA_PARITY_NODE_MODE:'managed',PATH:'/usr/bin:/bin'},
  archives:()=>({vendor:'/prepared/cache/vendor.deb',node:'/prepared/cache/node.tar.gz'}),
  install:({home})=>{mkdirSync(join(home,'runtimes','fixture'),{recursive:true});writePointer(home,'fixture');},
  inspect:({home})=>({path:join(home,'node','24.fixture','bin','node'),version:'v24.18.0'})});
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {root,parent,capability};
}
function launchFor(capabilityHome,host,session='unit'){
 const prefix=host==='vendor'?'NODE_REPL':'CUA_REPL';
 return {command:'node',args:[],cwd:join(capabilityHome,'run',session),env:{[`${prefix}_TRUSTED_SERVICES`]:JSON.stringify({browser:'/production/browser.mjs'}),[`${prefix}_TRUSTED_CODE_PATHS`]:'/production',NODE_REPL_NODE_MODULE_DIRS:'/runtime/node_modules',CUA_REPL_NODE_MODULE_DIRS:'/runtime/node_modules',CUA_REPL_NODE_REPL_PATH:'/pinned/host'}};
}
async function guardDirs(capabilityHome){const runDirectory=join(capabilityHome,'run','unit'),userHome=join(runDirectory,'home');await mkdir(userHome,{recursive:true});return {capabilityHome,runDirectory,userHome};}

test('the exact managed capability root accepts the real synthetic-secret service without a temp-parent allowlist',async t=>{
 const {capability}=managedFixture(t),dirs=await guardDirs(capability.dir);
 assert.equal(await assertScratchHome({...dirs,expectedCapabilityHome:capability.dir}),dirs.userHome);
 const service=await createLiveSecretOracle({...dirs,expectedCapabilityHome:capability.dir});
 await service.handleRpc({method:'secret.configure',params:{id:'secrets/browser-live/execute/fill'}});
 await service.handleRpc({method:'execute',params:{type:'playwright_locator_fill',browser_id:'fixture',tab_id:'7',selector:'#fixture',value:'{{secret:PARITY_SYNTHETIC}}',replace:true}});
 const observed=await service.handleRpc({method:'secret.observe',params:{rejected:false,messageOnly:true}});
 for(const field of ['requestMatches','readMatches','backendMatches','substituted','resultMatches','errorSafe'])assert.equal(observed[field],true,field);
});

test('chosen-root identity refuses a sibling, parent, alias, or absent authority before creating a store',async t=>{
 const {capability,parent}=managedFixture(t),expectedCapabilityHome=capability.dir;
 const sibling=join(parent,'cua-cap-sibling');await mkdir(sibling);
 const alias=join(parent,'cua-cap-alias');await symlink(capability.dir,alias);
 const chosen=await guardDirs(capability.dir),other=await guardDirs(sibling),parentDirs=await guardDirs(dirname(capability.dir));
 const aliasDirs={capabilityHome:alias,runDirectory:join(alias,'run','unit'),userHome:join(alias,'run','unit','home')};
 for(const dirs of [other,parentDirs,aliasDirs]){
  await assert.rejects(createLiveSecretOracle({...dirs,expectedCapabilityHome}),/scratch/);
  assert.deepEqual(await readdir(dirs.userHome),[]);
 }
 await assert.rejects(assertScratchHome(chosen),/scratch/);
 await assert.rejects(assertScratchHome({...chosen,expectedCapabilityHome:alias}),/scratch/);
 await assert.rejects(assertScratchHome({...aliasDirs,expectedCapabilityHome:alias}),/scratch/);
 assert.throws(()=>prepareLiveSecretsLaunch(launchFor(capability.dir,'cua'),{host:'cua',userHome:capability.userHome,capabilityHome:capability.dir,remote:true}),/scratch/);
 assert.throws(()=>prepareLiveSecretsLaunch(launchFor(alias,'cua'),{host:'cua',userHome:join(alias,'home'),capabilityHome:alias,expectedCapabilityHome:alias,remote:true}),/scratch/);
 for(const selected of [sibling,dirname(capability.dir),alias]){
  const launch=launchFor(selected,'cua','not-created');
  await mkdir(join(selected,'home'),{recursive:true});
  assert.throws(()=>prepareLiveSecretsLaunch(launch,{host:'cua',userHome:join(selected,'home'),capabilityHome:selected,expectedCapabilityHome,remote:true,ownClient:'/own/browser-client.mjs'}),/scratch/);
 }
});

test('the remote readiness root crosses the cleared client environment and both trusted launch adapters',async t=>{
 const {capability}=managedFixture(t);
 const facts={device:'mini',checkout:'/fixture/clone',home:'/source',commit:'a'.repeat(40),release:'fixture',node:'v24.18.0',platform:'darwin',nodeMode:'managed'};
 for(const host of ['vendor','cua']){
  const lane=await remoteCapabilityLane({...facts,host,api:true,liveSecrets:true},{start:async()=>({executionFacts:{...facts,dirty:false},home:capability.dir,userHome:capability.userHome,close:async()=>{}})});
  const script=lane.command.args.at(-1),prefix=script.slice(script.lastIndexOf('exec env'),script.lastIndexOf(' node test/'));
  const output=execFileSync('/bin/sh',['-c',prefix+' /usr/bin/env'],{env:{PATH:'/usr/bin:/bin',CUA_PARITY_CAPABILITY_ROOT:'/ambient/not-authorized'},encoding:'utf8'});
  const env=Object.fromEntries(output.trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
  assert.equal(env.CUA_PARITY_CAPABILITY_ROOT,capability.dir);
  const next=prepareLiveSecretsLaunch(launchFor(env.CUA_HOME,host,host),{host,userHome:env.HOME,capabilityHome:env.CUA_HOME,expectedCapabilityHome:env.CUA_PARITY_CAPABILITY_ROOT,remote:true,vendorClient:'/vendor/browser-client.js',ownClient:'/own/browser-client.mjs'});
  assert.equal(next.env.PARITY_LIVE_SECRET_CAPABILITY_ROOT,capability.dir);
  const previous=Object.getOwnPropertyDescriptor(globalThis,'nodeRepl');Object.defineProperty(globalThis,'nodeRepl',{configurable:true,value:{env:next.env}});
  try{const {handleRpc}=await import(`./fixtures/live-secret-service.mjs?managed-root-${host}`);assert.deepEqual(await handleRpc({method:'secret.configure',params:{id:'secrets/browser-live/execute/fill'}}),{ready:true,boundaryProof:'service-boundary-double'});}
  finally{if(previous)Object.defineProperty(globalThis,'nodeRepl',previous);else delete globalThis.nodeRepl;await lane.close();}
 }
});
