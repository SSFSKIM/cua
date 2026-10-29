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
import {createHash} from 'node:crypto';
import {archiveCacheDir,cachedArchives,placeCachedEngine} from '../../scripts/repl-parity/archive-cache.mjs';

const CACHE={vendor:{file:'r1-linux-x64.deb',bytes:Buffer.from('vendor fixture')},node:{file:'node-v24.0.0-linux-x64.tar.gz',bytes:Buffer.from('node fixture')}};
const PINS=Object.fromEntries(Object.entries(CACHE).map(([role,{file,bytes}])=>[role,{file,archive:{url:`https://${role}.test/${file}`,length:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}]));
const CACHED=source=>cachedArchives(source,{pins:PINS});
function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-managed-fixtures-'))),source=join(root,'source'),user=join(root,'user');
 mkdirSync(join(source,'runtimes','r1'),{recursive:true});mkdirSync(user);
 writeFileSync(join(source,'runtimes','r1','marker'),'source runtime');writePointer(source,'r1');
 // Synthetic owner data must not be copied into the answering HOME.
 mkdirSync(join(user,'.config','claude-secrets'),{recursive:true});writeFileSync(join(user,'.config','claude-secrets','fixture'),'synthetic private value');
 // The preparation's verified archive cache, in tiny fixture bytes under fixture pins.
 mkdirSync(archiveCacheDir(source),{mode:0o700});for(const {file,bytes} of Object.values(CACHE))writeFileSync(join(archiveCacheDir(source),file),bytes);
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {root,source,archives:CACHED,ambient:{HOME:user,PATH:'/usr/bin:/bin',TMPDIR:join(root,'long-temp'),CUA_PARITY_REMOTE:'1',CUA_PARITY_NODE_MODE:'managed',CUA_NODE:'/source-node-must-not-be-inherited'}};
}
function installed(home,release='r1'){
 mkdirSync(join(home,'runtimes',release),{recursive:true});writeFileSync(join(home,'runtimes',release,'marker'),'fresh runtime');writePointer(home,release);
 const path=join(home,'node','24.test','bin','node');mkdirSync(join(home,'node','24.test','bin'),{recursive:true});writeFileSync(path,'fixture executable');
 return {path,version:'v24.18.0'};
}

test('managed remote scratch installs freshly and inspects its own Node without inheriting a source override',t=>{
 const {source,ambient,archives}=fixture(t);let invocation,inspection;
 const scratch=prepareCapabilityHome({source,ambient,archives,scratchRoot:join(ambient.HOME,'.cp'),install:options=>{invocation=options;installed(options.home);},inspect:options=>{inspection=options;return {path:join(options.home,'node','24.test','bin','node'),version:'v24.18.0'};}});
 t.after(()=>scratch.cleanup());
 assert.ok(invocation,'managed scratch must invoke the installer, not clone the source runtime');
 assert.equal(typeof scratch.then,'undefined','preparation remains synchronous');
 assert.deepEqual(invocation.archives,{vendor:join(archiveCacheDir(source),'r1-linux-x64.deb'),node:join(archiveCacheDir(source),'node-v24.0.0-linux-x64.tar.gz')});
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
 const {source,ambient,archives}=fixture(t);let home;
 assert.throws(()=>prepareCapabilityHome({source,ambient,archives,scratchRoot:join(ambient.HOME,'.cp'),install:options=>{home=options.home;installed(home,'r2');},inspect:()=>{throw Error('release must be checked first');}}),/release/i);
 assert.equal(existsSync(home),false);
});

test('a cached pinned engine is in the managed scratch home before the install runs (#171)',t=>{
 const {source,ambient}=fixture(t),engine=join(archiveCacheDir(source),'cua-engine-0.1.0-linux-x64');writeFileSync(engine,'engine fixture');
 const archives=()=>({...CACHED(source),engine});let seen;
 const scratch=prepareCapabilityHome({source,ambient,archives,placeEngine:(home,file)=>placeCachedEngine(home,file,{pins:{engine:{archive:{sha256:createHash('sha256').update('engine fixture').digest('hex')}}}}),scratchRoot:join(ambient.HOME,'.cp'),install:options=>{seen=readFileSync(join(options.home,'engine','linux','cua-engine'),'utf8');installed(options.home);},inspect:({home})=>({path:join(home,'node','24.test','bin','node'),version:'v24.18.0'})});
 t.after(()=>scratch.cleanup());
 assert.equal(seen,'engine fixture');
 assert.equal(statSync(join(scratch.dir,'engine','linux','cua-engine')).mode&0o777,0o755);
});

test('managed scratch rejects an unmanaged or wrong-major Node and removes the failed install',t=>{
 const {source,ambient,archives}=fixture(t);
 for(const ownNode of [{path:'/external/node',version:'v24.18.0'},{version:'v22.18.0'}]){
  let home;
  assert.throws(()=>prepareCapabilityHome({source,ambient,archives,scratchRoot:join(ambient.HOME,'.cp'),install:options=>{home=options.home;installed(home);},inspect:()=>({...ownNode,path:ownNode.path??join(home,'node','22.test','bin','node')})}),/managed Node/);
  assert.equal(existsSync(home),false);
 }
});

test('installer failures remove the scratch instead of falling back to a copied runtime',t=>{
 const {source,ambient,archives}=fixture(t);let home;
 assert.throws(()=>prepareCapabilityHome({source,ambient,archives,scratchRoot:join(ambient.HOME,'.cp'),install:options=>{home=options.home;throw Error('install failed');}}),/install failed/);
 assert.equal(existsSync(home),false);
});

test('the default managed installer runs the checkout CLI with its isolated environment, from the prepared archive cache',t=>{
 const {source,ambient,archives}=fixture(t);let invocation;
 const scratch=prepareCapabilityHome({source,ambient,archives,scratchRoot:join(ambient.HOME,'.cp'),run:(...args)=>{invocation=args;installed(args[2].env.CUA_HOME);},inspect:({home})=>({path:join(home,'node','24.test','bin','node'),version:'v24.18.0'})});
 t.after(()=>scratch.cleanup());
 const cache=archiveCacheDir(source);
 assert.equal(invocation[0],process.execPath);assert.deepEqual(invocation[1],['bin/cua.mjs','install','--archive',join(cache,'r1-linux-x64.deb'),'--node-archive',join(cache,'node-v24.0.0-linux-x64.tar.gz')]);
 assert.equal(realpathSync(invocation[2].cwd),realpathSync(new URL('../../',import.meta.url)));assert.equal(invocation[2].env.CUA_HOME,scratch.dir);assert.equal(invocation[2].env.CUA_NODE,undefined);
});

test('an absent or damaged archive cache refuses before any scratch exists or anything installs',t=>{
 const {source,ambient,archives}=fixture(t),scratchRoot=join(ambient.HOME,'.cp');let installs=0;
 const attempt=options=>prepareCapabilityHome({source,ambient,scratchRoot,install:()=>{installs++;},inspect:()=>{throw Error('nothing installed');},...options});
 // The default resolver reads the prepared home's cache under the checked-in pins; this fixture home has none of theirs.
 assert.throws(()=>attempt({}),/never download.*cleanup-prepared.*prepare again/s);
 rmSync(join(archiveCacheDir(source),'node-v24.0.0-linux-x64.tar.gz'));
 assert.throws(()=>attempt({archives}),/node-v24\.0\.0-linux-x64\.tar\.gz.*cleanup-prepared/s);
 assert.equal(installs,0);assert.deepEqual(existsSync(scratchRoot)?readdirSync(scratchRoot):[],[]);
});

test('an installer refusing a cached archive asks for a fresh preparation and removes the scratch',t=>{
 const {source,ambient,archives}=fixture(t);let home;
 const refusal=Object.assign(Error('Command failed: node bin/cua.mjs install\ncua: archive SHA-256 is 00; the pin expects 11 [archive_hash_mismatch]\n  pass the pinned ChatGPT archive, or omit --archive to download it'),{status:1});
 assert.throws(()=>prepareCapabilityHome({source,ambient,archives,scratchRoot:join(ambient.HOME,'.cp'),run:(file,args,options)=>{home=options.env.CUA_HOME;throw refusal;}}),
  error=>/archive_hash_mismatch/.test(error.message)&&/managed fixtures never download.*cleanup-prepared.*prepare again/s.test(error.message)&&error.cause===refusal);
 assert.equal(existsSync(home),false);
 // Other installer failures keep their own message.
 assert.throws(()=>prepareCapabilityHome({source,ambient,archives,scratchRoot:join(ambient.HOME,'.cp'),install:()=>{throw Error('install failed');}}),error=>error.message==='install failed');
});

// Every remote fixture entry builds its scratch through the shared preparation from the prepared home (CUA_HOME),
// so all of them (repl cells, binder, browser capability host, boundary probes, Linux native) install from its cache.
test('every managed fixture consumer installs through the shared preparation without its own installer',()=>{
 const consumers=['serve-cells.mjs','serve-binder.mjs','serve-capability.mjs','probe-boundary.mjs','serve-native.mjs'];
 for(const file of consumers){
  const text=readFileSync(new URL(`./${file}`,import.meta.url),'utf8'),calls=[...text.matchAll(/prepareCapabilityHome\((\{.*?\})\)/g)].map(m=>m[1]);
  assert.ok(calls.length>0,file);
  for(const call of calls){
   const keys=[...call.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*(?=[:,}])/g)].map(m=>m[1]);
   assert.ok(keys.includes('source'),`${file} names the prepared home`);
   assert.deepEqual(keys.filter(key=>!['source','prefix'].includes(key)),[],`${file} takes the default installer and cache`);
  }
  assert.match(text,/process\.env\.CUA_HOME/,`${file} reads the prepared home from CUA_HOME`);
 }
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
