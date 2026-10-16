import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
import {readPointer,writePointer} from '../../src/runtime/layout.mjs';
import {readCuaRecord} from '../../src/chrome/route.mjs';
import * as cells from './serve-cells.mjs';
import {prepareBinderLaunch} from './serve-binder.mjs';
import {attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
import {Writable} from 'node:stream';

function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-managed-fixtures-'))),source=join(root,'source'),user=join(root,'user');
 mkdirSync(join(source,'runtimes','r1'),{recursive:true});mkdirSync(user);
 writeFileSync(join(source,'runtimes','r1','marker'),'source runtime');writePointer(source,'r1');
 // Synthetic owner data must not be copied into the answering HOME.
 mkdirSync(join(user,'.config','claude-secrets'),{recursive:true});writeFileSync(join(user,'.config','claude-secrets','fixture'),'synthetic private value');
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {root,source,ambient:{HOME:user,PATH:'/usr/bin:/bin',TMPDIR:join(root,'long-temp'),CUA_PARITY_REMOTE:'1',CUA_PARITY_NODE_MODE:'managed',CUA_NODE:'/source-node-must-not-be-inherited'}};
}
function installed(home,release='r1'){
 mkdirSync(join(home,'runtimes',release),{recursive:true});writeFileSync(join(home,'runtimes',release,'marker'),'fresh runtime');writePointer(home,release);
 const path=join(home,'node','24.test','bin','node');mkdirSync(join(home,'node','24.test','bin'),{recursive:true});writeFileSync(path,'fixture executable');
 return {path,version:'v24.18.0'};
}

test('managed remote scratch installs freshly and inspects its own Node without inheriting a source override',t=>{
 const {source,ambient}=fixture(t);let invocation,inspection;
 const scratch=prepareCapabilityHome({source,ambient,scratchRoot:join(ambient.HOME,'.cp'),install:options=>{invocation=options;installed(options.home);},inspect:options=>{inspection=options;return {path:join(options.home,'node','24.test','bin','node'),version:'v24.18.0'};}});
 t.after(()=>scratch.cleanup());
 assert.ok(invocation,'managed scratch must invoke the installer, not clone the source runtime');
 assert.equal(typeof scratch.then,'undefined','preparation remains synchronous');
 assert.equal(invocation.home,scratch.dir);assert.equal(invocation.env.CUA_HOME,scratch.dir);assert.equal(invocation.env.HOME,scratch.userHome);assert.equal(invocation.env.CUA_NODE,undefined);
 assert.equal(inspection.home,scratch.dir);assert.equal(inspection.ambient.CUA_HOME,scratch.dir);assert.equal(inspection.ambient.CUA_NODE,undefined);
 assert.equal(scratch.dir.startsWith(join(ambient.HOME,'.cp')+'/'),true);assert.equal(scratch.dir.startsWith(ambient.TMPDIR+'/'),false);assert.equal(statSync(scratch.dir).mode&0o777,0o700);
 assert.equal(readPointer(scratch.dir),'r1');assert.equal(readFileSync(join(scratch.dir,'runtimes','r1','marker'),'utf8'),'fresh runtime');
 assert.equal(scratch.nodeMode,'managed');assert.deepEqual(scratch.ownNode,{path:join(scratch.dir,'node','24.test','bin','node'),version:'v24.18.0'});
 assert.deepEqual(readdirSync(scratch.userHome),[]);assert.deepEqual(readCuaRecord(scratch.dir).browsers,{});
 assert.match(readFileSync(join(scratch.dir,'state','codex','browser','config.toml'),'utf8'),/^full_cdp_access_enabled = true$/m);
 assert.equal(readFileSync(join(source,'runtimes','r1','marker'),'utf8'),'source runtime');
});

test('fresh install release drift is rejected and its scratch is removed',t=>{
 const {source,ambient}=fixture(t);let home;
 assert.throws(()=>prepareCapabilityHome({source,ambient,scratchRoot:join(ambient.HOME,'.cp'),install:options=>{home=options.home;installed(home,'r2');},inspect:()=>{throw Error('release must be checked first');}}),/release/i);
 assert.equal(existsSync(home),false);
});

test('managed scratch rejects an unmanaged or wrong-major Node and removes the failed install',t=>{
 const {source,ambient}=fixture(t);
 for(const ownNode of [{path:'/external/node',version:'v24.18.0'},{version:'v22.18.0'}]){
  let home;
  assert.throws(()=>prepareCapabilityHome({source,ambient,scratchRoot:join(ambient.HOME,'.cp'),install:options=>{home=options.home;installed(home);},inspect:()=>({...ownNode,path:ownNode.path??join(home,'node','22.test','bin','node')})}),/managed Node/);
  assert.equal(existsSync(home),false);
 }
});

test('installer failures remove the scratch instead of falling back to a copied runtime',t=>{
 const {source,ambient}=fixture(t);let home;
 assert.throws(()=>prepareCapabilityHome({source,ambient,scratchRoot:join(ambient.HOME,'.cp'),install:options=>{home=options.home;throw Error('install failed');}}),/install failed/);
 assert.equal(existsSync(home),false);
});

test('the default managed installer runs the checkout CLI with its isolated environment',t=>{
 const {source,ambient}=fixture(t);let invocation;
 const scratch=prepareCapabilityHome({source,ambient,scratchRoot:join(ambient.HOME,'.cp'),run:(...args)=>{invocation=args;installed(args[2].env.CUA_HOME);},inspect:({home})=>({path:join(home,'node','24.test','bin','node'),version:'v24.18.0'})});
 t.after(()=>scratch.cleanup());
 assert.equal(invocation[0],process.execPath);assert.deepEqual(invocation[1],['bin/cua.mjs','install']);
 assert.equal(realpathSync(invocation[2].cwd),realpathSync(new URL('../../',import.meta.url)));assert.equal(invocation[2].env.CUA_HOME,scratch.dir);assert.equal(invocation[2].env.CUA_NODE,undefined);
});

test('managed fixture environments clear overrides without deriving one from source facts',()=>{
 const ambient={CUA_NODE:'/source/node',CUA_HOME:'/source',PATH:'/bin',CUA_PARITY_NODE_MODE:'managed'};
 assert.deepEqual(cells.fixtureNodeEnvironment(ambient),{CUA_HOME:'/source',PATH:'/bin',CUA_PARITY_NODE_MODE:'managed'});
 assert.deepEqual(cells.fixtureNodeEnvironment({...ambient,CUA_PARITY_NODE_MODE:'legacy'}),{...ambient,CUA_PARITY_NODE_MODE:'legacy'});
 assert.equal(ambient.CUA_NODE,'/source/node');
});

function launchFixture(){
 const facts={home:'/prepared/source',release:'r1',ownNode:{path:'/prepared/source/node/24.source/bin/node',version:'v24.17.0'}};
 const launch={command:'/answering/scratch/node/24.fresh/bin/node',args:['--disable-sigusr1','supervisor.mjs'],replHost:{host:'cua',reason:'browser_only'},env:{CUA_REPL_NODE_MODULE_DIRS:'/runtime/modules',CUA_REPL_TRUSTED_CODE_PATHS:'/trusted'},cwd:'/answering/scratch/run/session'};
 return {facts,launch};
}
function capture(){
 const lines=[];const output=new Writable({write(chunk,encoding,done){lines.push(...chunk.toString().trim().split('\n').map(line=>JSON.parse(line)));done();}});
 return {lines,output};
}

test('actual managed own launches attest the answering home without replacing source provenance',()=>{
 const {facts,launch}=launchFixture(),original=structuredClone(facts),{lines,output}=capture();
 const attested=attestedOutput(output,facts);let observed;
 const result=cells.attestFixtureLaunch(launch,{facts,home:'/answering/scratch',nodeMode:'managed',output:attested,observe:value=>{observed=value;return {path:value.command,version:'v24.18.0'};}});
 const answeringHost={home:'/answering/scratch',ownNode:{path:launch.command,version:'v24.18.0'},nodeMode:'managed'};
 assert.equal(result,launch);assert.equal(observed,launch);assert.deepEqual(facts,{...original,answeringHost});
 assert.deepEqual(lines,[{jsonrpc:'2.0',method:'cua/parityAnsweringHost',params:answeringHost}]);
 attested.write(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-03-26',serverInfo:{name:'cua-repl-host',version:'fixture'}}})+'\n');
 assert.deepEqual(lines[1].result._meta['cua/parityExecution'],{...original,answeringHost});
});

test('actual managed own launches reject source-home, external, and wrong-major Nodes before attesting',()=>{
 for(const node of [{path:'/prepared/source/node/24.source/bin/node',version:'v24.18.0'},{path:'/external/node',version:'v24.18.0'},{path:'/answering/scratch/node/22.test/bin/node',version:'v22.18.0'}]){
  const {facts,launch}=launchFixture(),{lines,output}=capture();launch.command=node.path;
  assert.throws(()=>cells.attestFixtureLaunch(launch,{facts,home:'/answering/scratch',nodeMode:'managed',output,observe:()=>node}),/managed Node/);
  assert.equal(facts.answeringHost,undefined);assert.deepEqual(lines,[]);
 }
});

test('legacy cells retain exact Node equality while vendor launches do not claim managed own provenance',()=>{
 const {facts,launch}=launchFixture(),{lines,output}=capture();
 const options={facts,home:'/answering/scratch',nodeMode:'legacy',legacyExpected:true,output,observe:()=>{throw Error('must not inspect legacy or vendor');}};
 assert.throws(()=>cells.attestFixtureLaunch(launch,options),/provenance/);
 assert.equal(cells.attestFixtureLaunch({...launch,command:facts.ownNode.path},options).command,facts.ownNode.path);
 assert.equal(cells.attestFixtureLaunch({...launch,replHost:{host:'vendor'}},{...options,nodeMode:'managed'}).command,launch.command);
 assert.equal(facts.answeringHost,undefined);assert.deepEqual(lines,[]);
});

test('binder attests the underlying own Node before replacing it with the trusted host tap',()=>{
 const {facts,launch}=launchFixture(),{lines,output}=capture();let observed;
 const wrapped=prepareBinderLaunch(launch,{host:'cua',facts,home:'/answering/scratch',nodeMode:'managed',output,observe:value=>{observed=value.command;return {path:value.command,version:'v24.18.0'};}});
 assert.equal(observed,launch.command);assert.equal(wrapped.command,process.execPath);assert.equal(JSON.parse(wrapped.env.PARITY_HOST_COMMAND)[0],launch.command);
 assert.equal(facts.answeringHost.ownNode.path,launch.command);assert.equal(lines[0].method,'cua/parityAnsweringHost');
});

test('legacy and local doubles still copy synchronously and never invoke an installer or Node inspection',t=>{
 const {source,ambient}=fixture(t);
 for(const env of [{...ambient,CUA_PARITY_NODE_MODE:'legacy'},{...ambient,CUA_PARITY_REMOTE:'0'}]){
  const scratch=prepareCapabilityHome({source,ambient:env,install:()=>{throw Error('local install forbidden');},inspect:()=>{throw Error('local Node inspection forbidden');}});
  try{assert.equal(typeof scratch.then,'undefined');assert.equal(readFileSync(join(scratch.dir,'runtimes','r1','marker'),'utf8'),'source runtime');assert.notEqual(scratch.nodeMode,'managed');}
  finally{scratch.cleanup();}
 }
});
