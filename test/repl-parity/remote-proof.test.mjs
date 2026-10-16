import {test} from 'node:test';
import {EventEmitter} from 'node:events';
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
 const deps={assertOwner(){},spawnAgent:(...args)=>{launches.push(args);return child;},stateOf:()=>({pid:999,relay:{status:'connected'}}),facts:()=>({dirty:false}),timeoutMs:1,stopTimeoutMs:1};
 const session=await deviceSession(endpoint,deps);
 await assert.rejects(session.start({host:'cua'}),/deadline/);assert.deepEqual(signals,['SIGTERM','SIGKILL']);
 assert.deepEqual(launches[0][1],['bin/cua.mjs','agent','run','--relay']);
 assert.equal(launches[0][2].env.HOME,endpoint.home+'/home');assert.equal(launches[0][2].env.CHROME_CONFIG_HOME,endpoint.home+'/home/.config');
 assert.equal(launches[0][2].env.CUA_HOME,endpoint.home);assert.equal(launches[0][2].env.CUA_SHIM_SURFACES,'browser');assert.equal(launches[0][2].env.CUA_REPL_HOST,'cua');
 await session.close();assert.equal(signals.length,2);
});
import assert from 'node:assert/strict';
import {safeEnrollment, endpointPlan, disconnectProbe, RemoteProof} from '../../scripts/repl-parity/remote.mjs';

test('endpoint restart refuses changed source/runtime provenance before spawning',async()=>{
 let spawned=false;
 const session=await deviceSession({device:'mini',home:'/owned',commit:'reviewed',release:'pinned'}, {assertOwner(){},facts:()=>({commit:'different',release:'pinned',dirty:false}),spawnAgent(){spawned=true;}});
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
test('preparation stops for operator and owner; restart keeps enrolled identity; cleanup is owned and exhaustive',async()=>{
 const events=[],saved=[];let pid=10;
 const io={prepare:async p=>({...p,home:'/owned/'+p.device,deviceId:p.device,relayEndpoint:'https://relay.test/d/'+p.device+'/mcp',clientSecretKey:'CUA_DEVICE_x',devicesEntry:'safe'}),start:async(e,h)=>{events.push(['start',e.device,h]);return {pid:++pid,ready:true};},attest:async(e,h)=>({host:h,executionFacts:{ownNode:{path:'/node',version:'v24.18.0'}},serverInfo:{name:h==='cua'?'cua-repl-host':'rmcp',version:'0.5.0'},_meta:h==='cua'?{'cua/replHost':{host:h,version:'0.5.0'}}:null}),stop:async e=>events.push(['stop',e.pid]),remove:async e=>events.push(['remove',e.device]),save:s=>saved.push(structuredClone(s))};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io});
 const prepared=await proof.prepare(['mini']);assert.equal(prepared.phase,'handoff');
 await assert.rejects(proof.start(),/operator.*owner/);assert.equal(events.length,0);
 await proof.start({operatorReady:true,ownerReady:true});const identity=proof.state.endpoints[0].deviceId;
 await proof.restart('mini','vendor');assert.equal(proof.state.endpoints[0].deviceId,identity);
 assert.deepEqual(events.slice(0,3),[['start','mini','cua'],['stop',11],['start','mini','vendor']]);
 const cleanup=await proof.cleanup();assert.equal(cleanup.phase,'operator-cleanup');assert.ok(events.some(x=>x[0]==='remove'));assert.ok(saved.length>=4);
});
test('resuming partial preparation never enrolls an already journaled device again',async()=>{
 const prepared=[];let fail=true;
 const io={save(){},prepare:async plan=>{prepared.push(plan.device);if(plan.device==='mini'&&fail){fail=false;throw new Error('install failed');}return {...plan,home:'/owned/'+plan.device};}};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io});
 await assert.rejects(proof.prepare(),/install failed/);await proof.prepare();
 assert.deepEqual(prepared,['cua-linux','mini','mini']);assert.equal(proof.state.endpoints.length,2);
});
test('failed attestation tears down the just-started owned process',async()=>{
 let stopped=0;const io={save(){},start:async()=>({pid:13,ready:true}),attest:async()=>({host:'vendor',serverInfo:{name:'rmcp',version:'1'},_meta:null}),stop:async()=>stopped++};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io,state:{phase:'handoff',endpoints:[endpointPlan('m5-a','mini')]}});
 await assert.rejects(proof.start({operatorReady:true,ownerReady:true}),/attest/);assert.equal(stopped,1);
});
test('startup failure tries every owned endpoint even if an earlier stop fails',async()=>{
 const stopped=[];
 const io={save(){},start:async e=>({pid:e.device==='mini'?11:12,ready:true}),attest:async()=>{throw new Error('bad attestation');},stop:async e=>{stopped.push(e.pid);if(e.pid===10)throw new Error('stop failed');}};
 const proof=new RemoteProof({experiment:'m5-a',relay:'wss://relay.test/ws',io,state:{phase:'handoff',endpoints:[{...endpointPlan('m5-a','mini'),pid:10},{...endpointPlan('m5-a','cua-linux'),pid:20}]}});
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
