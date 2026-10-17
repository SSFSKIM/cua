import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {REPL_HOST_VERSION} from '../../src/repl-host/identity.mjs';
const reviewedCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}).trim();
import assert from 'node:assert/strict';
import {assertManagedNode, nodeEnvironment, observeLaunchNode,verifyOwnedHostNode} from '../../scripts/repl-parity/node-provenance.mjs';
import {mkdtempSync,mkdirSync,existsSync,rmSync,writeFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {installSelectionRuntime,withManagedNodeUnavailable} from '../../scripts/repl-parity/selection-device.mjs';
import {validateAttestations} from '../../scripts/repl-parity/compare.mjs';
import {ownNodeEnv,quote} from '../../scripts/repl-parity/topology.mjs';
import {ownNodeFacts} from '../../scripts/repl-parity/provenance.mjs';
import {expectedSelection,selectionCases,assertSelection} from '../../scripts/repl-parity/selection.mjs';
import {doctorReplHost} from './fixtures/doctor-repl-host.mjs';
import {buildLaunch,REPL_HOST_SUPERVISOR} from '../../src/runtime/launch.mjs';
import {parsePin,runtimeFor} from '../../src/runtime/manifest.mjs';
import {scratch,fixturePin} from '../fixtures/runtime-fixture.mjs';

function ownHostLaunch(t){
 const fixture=scratch('cua-node-witness-');t.after(fixture.cleanup);
 const bin=join(fixture.dir,'node/24.x/bin');mkdirSync(bin,{recursive:true});
 const node=join(bin,'node');writeFileSync(node,'#!/bin/sh\necho v24.18.0\n',{mode:0o755});
 const ownNode={path:realpathSync(node),version:'v24.18.0'};
 const runtime=runtimeFor({home:fixture.dir,pin:parsePin(fixturePin({sha256:'a'.repeat(64),length:1})),record:null});
 const launch=buildLaunch({runtime,home:fixture.dir,sessionId:'node-witness',surfaces:['browser'],ambient:{CUA_REPL_HOST:'cua',CUA_NODE:node}});
 assert.equal(launch.command,ownNode.path);
 return {ownNode,entry:REPL_HOST_SUPERVISOR,command:[launch.command,...launch.args].join(' ')};
}
test('managed Node enables an implicit own host even when the running and PATH Nodes are 22',()=>{
 const row={platform:'darwin',registration:'cua',surfaces:['browser'],override:'unset',node24:false,managedNode:true};
 assert.deepEqual(expectedSelection(row),{host:'cua',reason:'browser_only',status:'pass'});
 assert.equal(expectedSelection({...row,platform:'linux'}).reason,'linux');
 for(const lane of ['ordinary','profiles'])assert.ok(selectionCases('darwin').some(r=>r.lane===lane&&r.managedNode===true&&r.node24===false&&r.override==='unset'));
});
test('the managed selection row binds doctor to an observed launch in the actual scratch home',async t=>{
 const row={platform:'darwin',registration:'cua',surfaces:['browser'],override:'unset',node24:false,managedNode:true};
 const ownNode={path:'/scratch/node/24.x/bin/node',version:'v24.18.0'};
 const observation={host:'cua',serverInfo:{name:'cua-repl-host',version:REPL_HOST_VERSION},_meta:{'cua/replHost':{host:'cua',version:REPL_HOST_VERSION}},executionFacts:{commit:reviewedCommit,dirty:false,home:'/scratch',ownNode}};
 const doctor=await doctorReplHost(t,{env:{CUA_SHIM_SURFACES:'browser'},node:ownNode.path});
 assert.doesNotThrow(()=>assertSelection(row,{doctor,observation},{reviewedCommit}));
 const other=await doctorReplHost(t,{env:{CUA_SHIM_SURFACES:'browser'},node:'/other/node'});
 assert.throws(()=>assertSelection(row,{doctor:other,observation},{reviewedCommit}),/managed Node/);
 assert.throws(()=>assertSelection(row,{doctor,observation:{...observation,executionFacts:{...observation.executionFacts,home:'/different',ownNode}}},{reviewedCommit}));
});
test('release evidence rejects a hand-installed Node or a Node belonging to another scratch home',()=>{
 assert.doesNotThrow(()=>assertManagedNode({home:'/owned/home',ownNode:{path:'/owned/home/node/24.x/bin/node',version:'v24.18.0'}}));
 for(const path of ['/hand-installed/node','/owned/other/node/24.x/bin/node','/owned/home/node/../../external/node'])assert.throws(()=>assertManagedNode({home:'/owned/home',ownNode:{path,version:'v24.18.0'}}),/managed Node/);
 assert.throws(()=>assertManagedNode({home:'/owned/home',ownNode:{path:'/owned/home/node/22.x/bin/node',version:'v22.18.0'}}),/managed Node/);
});
test('an ambient harness CUA_NODE is not silently forwarded; diagnostic overrides are explicit',()=>{
 assert.deepEqual(nodeEnvironment({PATH:'/bin',CUA_NODE:'/old-hand-node'}),{PATH:'/bin'});
 assert.deepEqual(nodeEnvironment({PATH:'/bin',CUA_NODE:'/old-hand-node'},'/diagnostic/node'),{PATH:'/bin',CUA_NODE:'/diagnostic/node'});
 assert.throws(()=>nodeEnvironment({},'relative'),/absolute/);
});
test('remote command environments never turn a resolved source Node into an override',()=>{
 const run=facts=>execFileSync('/bin/sh',['-c',`exec /usr/bin/env ${ownNodeEnv(facts)}${quote(process.execPath)} -e ${quote("console.log(process.env.CUA_NODE??'unset')")}`],{env:{PATH:'/bin',CUA_NODE:'/ambient'},encoding:'utf8'}).trim();
 assert.equal(run({ownNode:{path:'/source/node'}}),'unset');
 assert.equal(run({ownNode:{path:'/source/node'},nodeOverride:'/diagnostic/node'}),'/diagnostic/node');
});
test('Node provenance resolves against the answering home rather than ambient source-home state',()=>{
 let seen;
 const actual=ownNodeFacts({CUA_HOME:'/prepared-source',PATH:'/bin'},{home:'/answering-scratch',resolveNode:options=>{seen=options;return '/answering-scratch/node/24.x/bin/node';},versionOf:()=> 'v24.18.0'});
 assert.equal(seen.home,'/answering-scratch');assert.equal(seen.ambient.CUA_HOME,'/answering-scratch');assert.equal(actual.path,'/answering-scratch/node/24.x/bin/node');
});
test('selection provisioning invokes a fresh install without an inherited override',()=>{
 let command;
 const result=installSelectionRuntime('/owned/home',{HOME:'/owned/home/home',CUA_HOME:'/owned/home',CUA_NODE:'/old/override'},{run:(...args)=>{command=args;},inspect:({source,ambient})=>{assert.equal(source,'/owned/home');assert.equal(ambient.CUA_NODE,undefined);return {home:source,ownNode:{path:source+'/node/24.x/bin/node',version:'v24.18.0'}};}});
 assert.deepEqual(command[1],['bin/cua.mjs','install']);assert.equal(command[2].env.CUA_HOME,'/owned/home');assert.equal(command[2].env.CUA_NODE,undefined);assert.equal(result.home,'/owned/home');
});
test('unmanaged negative rows hide only their own Node tree and restore it after errors',async()=>{
 const home=mkdtempSync(join(tmpdir(),'cua-node-absence-test-'));mkdirSync(join(home,'node'));
 try{await assert.rejects(withManagedNodeUnavailable(home,async()=>{assert.equal(existsSync(join(home,'node')),false);throw new Error('row failed');}),/row failed/);assert.equal(existsSync(join(home,'node')),true);assert.equal(existsSync(join(home,'node.unavailable')),false);}
 finally{rmSync(home,{recursive:true,force:true});}
});
test('remote Node witness accepts the exact buildLaunch own-host command in its owned ancestry',t=>{
 const {ownNode,entry,command}=ownHostLaunch(t);
 const rows=[{pid:10,ppid:1,command:'agent'},{pid:11,ppid:10,command:'anchor'},{pid:12,ppid:11,command},{pid:13,ppid:1,command}];
 assert.deepEqual(verifyOwnedHostNode(rows,10,{ownNode,entry}),{...ownNode,pid:12});
});
test('remote Node witness rejects missing ownership and non-production executable or argv shapes',t=>{
 const {ownNode,entry,command}=ownHostLaunch(t),agent={pid:10,ppid:1,command:'agent'};
 for(const [name,rows] of [
  ['resolver-only claim',[]],
  ['unrelated ancestry',[agent,{pid:12,ppid:1,command}]],
  ['agent itself',[{...agent,command}]],
 ])assert.throws(()=>verifyOwnedHostNode(rows,10,{ownNode,entry}),/owned.*Node/,name);
 for(const [name,bad] of [
  ['external interpreter',`/external/node --disable-sigusr1 ${entry}`],
  ['executable suffix',`${ownNode.path}-other --disable-sigusr1 ${entry}`],
  ['wrong entry',`${ownNode.path} --disable-sigusr1 /other/supervisor.mjs`],
  ['entry suffix',`${command}.other`],
  ['entry mentioned as an argument',`${ownNode.path} --disable-sigusr1 /other.mjs ${entry}`],
  ['wrapper mentioning the launch',`/bin/sh -c ${command}`],
  ['missing required flag',`${ownNode.path} ${entry}`],
  ['extra Node flag',`${ownNode.path} --inspect --disable-sigusr1 ${entry}`],
  ['extra flag before entry',`${ownNode.path} --disable-sigusr1 --require /other.mjs ${entry}`],
  ['extra argument after entry',`${command} --inspect`],
 ])assert.throws(()=>verifyOwnedHostNode([agent,{pid:12,ppid:10,command:bad}],10,{ownNode,entry}),/owned.*Node/,name);
});
test('remote Node witness rejects multiple owned hosts matching the production launch',t=>{
 const {ownNode,entry,command}=ownHostLaunch(t);
 const rows=[{pid:10,ppid:1,command:'agent'},{pid:11,ppid:10,command},{pid:12,ppid:11,command}];
 assert.throws(()=>verifyOwnedHostNode(rows,10,{ownNode,entry}),/exactly one owned host/);
});
test('managed parity cannot pass with source-home Node facts alone or a missing actual launch witness',()=>{
 const meta={complete:true,host:'cua',nodeMode:'managed',connections:['a'],hostAttestations:[{connection:'a',host:'cua',serverInfo:{name:'cua-repl-host',version:'0.5.0'},_meta:{'cua/replHost':{host:'cua',version:'0.5.0'}},executionFacts:{home:'/source',ownNode:{path:'/source/node/24.x/bin/node',version:'v24.18.0'}}}]};
 assert.throws(()=>validateAttestations(meta),/managed|answering/);
 meta.hostAttestations[0].executionFacts.answeringHost={home:'/scratch',ownNode:{path:'/scratch/node/24.x/bin/node',version:'v24.18.0'},nodeMode:'managed'};
 assert.doesNotThrow(()=>validateAttestations(meta));
 meta.hostAttestations[0].executionFacts.answeringHost.ownNode.path='/source/node/24.x/bin/node';assert.throws(()=>validateAttestations(meta),/managed/);
});
test('the answering-Node observation reads the actual launch command without changing the launch',()=>{
 const launch={command:'/owned/node',args:['supervisor.mjs'],env:{}};const observed=observeLaunchNode(launch,path=>{assert.equal(path,'/owned/node');return 'v24.18.0';});
 assert.deepEqual(observed,{path:'/owned/node',version:'v24.18.0'});assert.deepEqual(launch,{command:'/owned/node',args:['supervisor.mjs'],env:{}});
});
