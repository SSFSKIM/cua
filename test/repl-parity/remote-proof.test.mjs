import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function reviewedSource(t){
 const sourceRepo=mkdtempSync(join(tmpdir(),'cua-remote-source-'));t.after(()=>rmSync(sourceRepo,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:sourceRepo,encoding:'utf8'}).trim();
 git('init','-q');mkdirSync(join(sourceRepo,'src/repl-host'),{recursive:true});writeFileSync(join(sourceRepo,'src/repl-host/identity.mjs'),"export const REPL_HOST_VERSION = '0.5.0';\n");
 git('add','.');git('-c','user.name=Test','-c','user.email=test@example.test','-c','commit.gpgsign=false','commit','-qm','reviewed identity');
 return {sourceRepo,reviewedCommit:git('rev-parse','HEAD')};
}
const ownObservation=commit=>({host:'cua',executionFacts:{commit,dirty:false,ownNode:{path:'/node',version:'v24.18.0'}},serverInfo:{name:'cua-repl-host',version:'0.5.0'},_meta:{'cua/replHost':{host:'cua',version:'0.5.0'}}});
import {deviceSession} from '../../scripts/repl-parity/remote-device.mjs';
import {assertRegisteredEndpoint} from '../../scripts/repl-parity/remote-controller.mjs';
test('an existing device with the same name cannot impersonate this experiment endpoint',()=>{
 const endpoint={deviceId:'owned',relayEndpoint:'https://relay.test/d/owned/mcp'};
 assert.doesNotThrow(()=>assertRegisteredEndpoint(endpoint,{deviceId:'owned',relayUrl:'https://relay.test'}));
 for(const entry of [undefined,{deviceId:'other',relayUrl:'https://relay.test'},{deviceId:'owned',relayUrl:'https://other.test'}])assert.throws(()=>assertRegisteredEndpoint(endpoint,entry),/identity/);
});

test('device adapter requires its own PID readiness and bounds stop without touching another process',async()=>{
 const child=new EventEmitter();Object.assign(child,{pid:123,exitCode:null});const signals=[],launches=[];
 child.kill=signal=>{signals.push(signal);if(signal==='SIGKILL'){child.exitCode=0;queueMicrotask(()=>child.emit('exit',0));}};
 const endpoint={device:'mini',home:'/owned/scratch',surfaces:['browser']};
 const deps={assertOwner(){},spawnAgent:(...args)=>{launches.push(args);return child;},stateOf:()=>({pid:999,relay:{status:'connected'}}),facts:()=>({home:endpoint.home,dirty:false,ownNode:{path:endpoint.home+'/node/24.x/bin/node',version:'v24.18.0'}}),timeoutMs:1,stopTimeoutMs:1};
 const session=await deviceSession(endpoint,deps);
 await assert.rejects(session.start({host:'cua'}),/deadline/);assert.deepEqual(signals,['SIGTERM','SIGKILL']);
 assert.deepEqual(launches[0][1],['bin/cua.mjs','agent','run','--relay']);
 assert.equal(launches[0][2].env.HOME,endpoint.home+'.home');assert.equal(launches[0][2].env.CHROME_CONFIG_HOME,endpoint.home+'.home/.config');
 assert.equal(launches[0][2].env.CUA_HOME,endpoint.home);assert.equal(launches[0][2].env.CUA_SHIM_SURFACES,'browser');assert.equal(launches[0][2].env.CUA_REPL_HOST,'cua');
 await session.close();assert.equal(signals.length,2);
});
import assert from 'node:assert/strict';
import {safeEnrollment, endpointPlan, disconnectProbe, RemoteProof, checkHost} from '../../scripts/repl-parity/remote.mjs';

test('own-host attestation rejects two agreeing stale markers instead of trusting their version',t=>{
 const reviewed=reviewedSource(t),observation=ownObservation(reviewed.reviewedCommit);
 assert.doesNotThrow(()=>checkHost('cua',observation,reviewed));
 const stale=structuredClone(observation);stale.serverInfo.version='0.0.0-stale';stale._meta['cua/replHost'].version='0.0.0-stale';
 assert.throws(()=>checkHost('cua',stale,reviewed),/version.*source|source.*version/i);
 assert.throws(()=>checkHost('cua',observation),/source commit/i);
 assert.throws(()=>checkHost('cua',{...observation,executionFacts:{...observation.executionFacts,commit:'f'.repeat(40)}},reviewed),/source commit/i);
 assert.throws(()=>checkHost('cua',{...observation,executionFacts:{...observation.executionFacts,dirty:true}},reviewed),/source commit/i);
});

test('endpoint restart refuses changed source/runtime provenance before spawning',async()=>{
 let spawned=false;
 const session=await deviceSession({device:'mini',home:'/owned',surfaces:['browser'],commit:'reviewed',release:'pinned'}, {assertOwner(){},facts:()=>({commit:'different',release:'pinned',dirty:false}),spawnAgent(){spawned=true;}});
 await assert.rejects(session.start({host:'vendor'}),/changed after preparation/);assert.equal(spawned,false);
});
test('safe enrollment projection never returns the credential or arbitrary fields',()=>{
 const safe={deviceId:'fixture-id',relayEndpoint:'https://relay.test/d/fixture-id/mcp',clientSecretKey:'CUA_DEVICE_fixture',devicesEntry:'"fixture-id": {"deviceCredentialSha256":"hash","clientCredentialSha256":"hash"}'};
 assert.deepEqual(safeEnrollment({...safe,clientCredential:'SECRET',secret:'SECRET',unknown:'SECRET'}),safe);
 assert.throws(()=>safeEnrollment({deviceId:'x'}));
});
test('endpoint plans bind surfaces and identity names and refuse path injection',()=>{
 assert.deepEqual(endpointPlan('m5-a','mini'),{device:'mini',name:'repl-m5-a-mini-browser',surfaces:['browser']});
 assert.deepEqual(endpointPlan('m5-a','cua-linux').surfaces,['computer','browser']);
 for(const id of ['../x','A','x'.repeat(30)])assert.throws(()=>endpointPlan(id,'mini'));
 assert.throws(()=>endpointPlan('m5','local'));
});
test('preparation stops for operator and owner; restart keeps enrolled identity; cleanup is owned and exhaustive',async t=>{
 const reviewed=reviewedSource(t),events=[],saved=[];let pid=10;
 const io={prepare:async p=>({...p,commit:reviewed.reviewedCommit,home:'/owned/'+p.device,deviceId:p.device,relayEndpoint:'https://relay.test/d/'+p.device+'/mcp',clientSecretKey:'CUA_DEVICE_x',devicesEntry:'safe'}),start:async(e,h)=>{events.push(['start',e.device,h]);return {pid:++pid,ready:true};},attest:async(e,h)=>h==='cua'?ownObservation(reviewed.reviewedCommit):{host:h,serverInfo:{name:'rmcp',version:'0.5.0'},_meta:null},stop:async e=>events.push(['stop',e.pid]),remove:async e=>events.push(['remove',e.device]),save:s=>saved.push(structuredClone(s))};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io,sourceRepo:reviewed.sourceRepo});
 const prepared=await proof.prepare(['mini']);assert.equal(prepared.phase,'handoff');
 await assert.rejects(proof.start(),/operator.*owner/);assert.equal(events.length,0);
 await proof.start({operatorReady:true,ownerReady:true});const identity=proof.state.endpoints[0].deviceId;
 await proof.restart('mini','vendor');assert.equal(proof.state.endpoints[0].deviceId,identity);
 assert.deepEqual(events.slice(0,3),[['start','mini','cua'],['stop',11],['start','mini','vendor']]);
 const cleanup=await proof.cleanup();assert.equal(cleanup.phase,'operator-cleanup');assert.ok(events.some(x=>x[0]==='remove'));assert.ok(saved.length>=4);
});
test('interrupted preparation persists the requested set and resumes without replacing an enrolled identity',async()=>{
 const prepared=[],saved=[];let fail=true;
 const io={save:s=>saved.push(structuredClone(s)),prepare:async plan=>{assert.deepEqual(saved[0].requestedDevices,['cua-linux','mini']);assert.equal(saved[0].phase,'preparing');prepared.push(plan.device);if(plan.device==='mini'&&fail){fail=false;throw new Error('install failed');}return {...plan,home:'/owned/'+plan.device,deviceId:'owned-'+plan.device};}};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io});
 await assert.rejects(proof.prepare(),/install failed/);
 const resumed=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io,state:structuredClone(proof.state)});
 await assert.rejects(resumed.prepare(['cua-linux']),/requested.*devices/i);
 await resumed.prepare();
 assert.deepEqual(prepared,['cua-linux','mini','mini']);assert.equal(resumed.state.endpoints.length,2);
 assert.equal(resumed.state.endpoints[0].deviceId,'owned-cua-linux');assert.equal(resumed.state.phase,'handoff');
});
test('start cannot announce readiness from an empty, partial, preparing or duplicate journal',async t=>{
 const mini=endpointPlan('m5-a','mini'),linux=endpointPlan('m5-a','cua-linux');
 for(const [name,patch] of [
  ['new',{phase:'new',endpoints:[]}],
  ['empty',{endpoints:[]}],
  ['partial',{endpoints:[mini]}],
  ['preparing',{phase:'preparing'}],
  ['duplicate endpoints',{endpoints:[mini,mini]}],
  ['extra endpoint',{requestedDevices:['mini']}],
  ['different endpoint',{requestedDevices:['mini'],endpoints:[linux]}],
  ['missing requested set',{requestedDevices:undefined}],
  ['empty requested set',{requestedDevices:[]}],
  ['duplicate requested devices',{requestedDevices:['mini','mini']}],
 ])await t.test(name,async()=>{
  const calls=[];const io={save:s=>calls.push(['save',s.phase]),start:async()=>{calls.push(['start']);return {pid:42,ready:true};},attest:async()=>ownObservation('f'.repeat(40))};
  const state={experiment:'m5-a',relay:'wss://relay.test/ws',phase:'handoff',requestedDevices:['mini','cua-linux'],endpoints:[mini,linux],...patch};
  const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io,state:structuredClone(state)});
  await assert.rejects(proof.start({operatorReady:true,ownerReady:true}),/prepar|requested|devices/i);
  assert.deepEqual(calls,[]);assert.equal(proof.state.phase,state.phase);assert.ok(proof.state.endpoints.every(e=>!e.ready&&!e.pid));
 });
});
test('a single-device interrupted preparation resumes its persisted request when no devices are supplied',async()=>{
 const saved=[];let interrupted=true;
 const io={save:s=>saved.push(structuredClone(s)),prepare:async plan=>{if(interrupted){interrupted=false;throw new Error('interrupted');}return {...plan,deviceId:'owned-mini'};}};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io});
 await assert.rejects(proof.prepare(['mini']),/interrupted/);
 assert.deepEqual(saved[0].requestedDevices,['mini']);
 const resumed=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io,state:saved.at(-1)});
 await resumed.prepare();assert.deepEqual(resumed.state.endpoints.map(e=>e.device),['mini']);assert.equal(resumed.state.phase,'handoff');
});
test('failed attestation tears down the just-started owned process',async()=>{
 let stopped=0;const io={save(){},start:async()=>({pid:13,ready:true}),attest:async()=>({host:'vendor',serverInfo:{name:'rmcp',version:'1'},_meta:null}),stop:async()=>stopped++};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io,state:{experiment:'m5-a',phase:'handoff',requestedDevices:['mini'],endpoints:[endpointPlan('m5-a','mini')]}});
 await assert.rejects(proof.start({operatorReady:true,ownerReady:true}),/attest/);assert.equal(stopped,1);
});
test('startup failure tries every owned endpoint even if an earlier stop fails',async()=>{
 const stopped=[];
 const io={save(){},start:async e=>({pid:e.device==='mini'?11:12,ready:true}),attest:async()=>{throw new Error('bad attestation');},stop:async e=>{stopped.push(e.pid);if(e.pid===10)throw new Error('stop failed');}};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io,state:{experiment:'m5-a',phase:'handoff',requestedDevices:['mini','cua-linux'],endpoints:[{...endpointPlan('m5-a','mini'),pid:10},{...endpointPlan('m5-a','cua-linux'),pid:20}]}});
 await assert.rejects(proof.start({operatorReady:true,ownerReady:true}));assert.deepEqual(stopped,[10,20]);
});
test('disconnect probe kills only its client after started, reconnects without resubmission and rejects replay',async()=>{
 for(const count of [1,2]){
  const events=[];let submitted=0;
  const io={open:async()=>({pid:42,requestId:9}),submit:async()=>{submitted++;events.push('submit');},started:async()=>events.push('started'),kill:async(pid,sig)=>events.push([pid,sig]),reconnect:async()=>{events.push('reconnect');return {};},release:async()=>events.push('release'),observe:async()=>count,end:async()=>events.push('end')};
  if(count===1)assert.deepEqual(await disconnectProbe(io),{requestId:9,disruption:'after-started',count:1});else await assert.rejects(disconnectProbe(io),/exactly one/);
  assert.equal(submitted,1);assert.deepEqual(events.slice(0,5),['submit','started',[42,'SIGKILL'],'reconnect','release']);assert.equal(events.at(-1),'end');
 }
});
