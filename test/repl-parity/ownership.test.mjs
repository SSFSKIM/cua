import {test} from 'node:test';import assert from 'node:assert/strict';
import {remoteCapabilityLane} from '../../scripts/repl-parity/capability.mjs';import {selectOwnedKernel} from '../../scripts/repl-parity/processes.mjs';
test('capability startup returns its verified facts and closes the resource on a post-start refusal',async()=>{
 const facts={device:'mini',checkout:'/fixture',home:'/runtime',commit:'abc',release:'pin',node:'v24',platform:'darwin'};let closed=0;
 const start=async()=>({home:'/scratch',userHome:'/scratch/home',executionFacts:{...facts,dirty:false},close:async()=>{closed++;}});
 const lane=await remoteCapabilityLane({...facts,host:'vendor'},{start});assert.equal(lane.command.expectedFacts.commit,'abc');assert.equal(closed,0);await lane.close();assert.equal(closed,1);
 await assert.rejects(remoteCapabilityLane({...facts,host:'vendor'},{start:async()=>({...await start(),executionFacts:{...facts,commit:'stale',dirty:false}})}),/Stale preparation/);assert.equal(closed,2);
});
test('owned kernel selection accepts vendor and own layouts without relying on OS process names',()=>{
 const cwd='/scratch/run/one',nodePath='/scratch/runtime/node';
 for(const [host,script] of [['vendor','/scratch/staging/kernel.js'],['cua','/checkout/src/repl-host/kernel.mjs']]){
  const kernel=`${nodePath} --experimental-vm-modules ${script} --session-id fixture --working-dir ${cwd}`;
  const rows=[{pid:11,ppid:10,command:'/node anchor.mjs'},{pid:12,ppid:11,command:`/codex sandbox -- ${kernel}`},{pid:13,ppid:12,comm:'MainThread',command:kernel},{pid:14,ppid:11,command:`${nodePath} /staging/trusted-worker.js ${cwd}`},{pid:15,ppid:1,command:kernel}];
  assert.equal(selectOwnedKernel(rows,10,{host,cwd,nodePath}).pid,13);
  assert.throws(()=>selectOwnedKernel(rows,10,{host,cwd:'/other',nodePath}),/kernel/);
  assert.throws(()=>selectOwnedKernel(rows,99,{host,cwd,nodePath}),/kernel/);
  assert.throws(()=>selectOwnedKernel([...rows,{...rows[2],pid:16}],10,{host,cwd,nodePath}),/ambiguous/);
 }
});
