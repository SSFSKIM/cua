import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,statSync,readlinkSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareEndpoint,removeEndpoint} from '../../scripts/repl-parity/remote-device.mjs';
import {archiveCacheDir} from '../../scripts/repl-parity/archive-cache.mjs';

// The preparation's archive cache double: tiny files where the real fetch would put the verified archives.
function cacheDouble(events=[]){
 return {events,cacheArchives:home=>{
  events.push({home,args:['cache']});const dir=archiveCacheDir(home);mkdirSync(dir,{mode:0o700});
  const archives={vendor:join(dir,'r1-linux-x64.deb'),node:join(dir,'node-v24.0.0-linux-x64.tar.gz')};
  for(const path of Object.values(archives))writeFileSync(path,'fixture archive');return archives;
 }};
}
const installArgs=home=>['install','--archive',join(archiveCacheDir(home),'r1-linux-x64.deb'),'--node-archive',join(archiveCacheDir(home),'node-v24.0.0-linux-x64.tar.gz')];
import {socketPathFor,socketNameFor} from '../../src/chrome/extension.mjs';
test('endpoint preparation fetches the archive cache once into its own home, installs only that home from it, aliases one enrolled backend, and never returns enrollment credentials',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-remote-prep-test-'))),parent=join(root,'owned');mkdirSync(parent);
 const prepared={home:join(root,'source'),discoveryHome:join(root,'original-backend'),dirty:false,commit:'reviewed',release:'pinned',profile:'ssfs',extensionInstanceId:'fixture-backend'};
 const commands=[],safe={deviceId:'x'.repeat(22),relayEndpoint:'https://relay.test/d/x/mcp',devicesEntry:'hashes-only'};
 const deps={...cacheDouble(commands),directoryRoot:parent,tempRoot:'/not-this-test-directory',inspect:({source})=>({...prepared,home:source,ownNode:{path:source+'/node/24.x/bin/node',version:'v24.18.0'}}),registry:()=>({profiles:{ssfs:{route:'cua',chromeProfileDirectory:'Profile 1',extensionInstanceId:'fixture-backend'}}}),runCli:(home,args,{file}={})=>{
  commands.push({home,args});if(file)writeFileSync(file,JSON.stringify({clientCredential:'DO-NOT-RETURN'}),{flag:'wx',mode:0o600});
  return args[0]==='remote'&&args[1]==='show'?JSON.stringify(safe):'';
 }};
 try{
  const endpoint=prepareEndpoint({experiment:'m5',relay:'wss://relay.test/ws',plan:{device:'mini',name:'repl-m5-mini-browser',surfaces:['browser']},prepared},deps);
  assert.ok(endpoint.home.startsWith(parent+'/m5-'));assert.equal(statSync(endpoint.home).mode&0o777,0o700);
  assert.equal(statSync(join(endpoint.home,'enroll.json')).mode&0o777,0o600);assert.ok(!JSON.stringify(endpoint).includes('DO-NOT-RETURN'));
  assert.deepEqual(commands.map(c=>c.args),[['cache'],installArgs(endpoint.home),['remote','enroll','--relay','wss://relay.test/ws','--json'],['remote','show','--json']]);assert.ok(commands.every(c=>c.home===endpoint.home));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(endpoint.home,'profiles.json'),'utf8')).profiles),['ssfs']);
  const name=socketNameFor('fixture-backend');assert.equal(readlinkSync(socketPathFor(endpoint.home,name)),socketPathFor(prepared.discoveryHome,name));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('a fresh install without a scratch-owned managed Node refuses before enrollment',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-remote-prep-test-'))),commands=[];
 const prepared={home:'/fixture-source',dirty:false,profile:'ssfs',extensionInstanceId:'fixture'};
 const deps={...cacheDouble(),directoryRoot:root,tempRoot:'/not-this-directory',inspect:({source})=>({...prepared,home:source,ownNode:{path:'/hand-installed/node',version:'v24.18.0'}}),registry:()=>({profiles:{ssfs:{route:'cua',chromeProfileDirectory:'Profile 1',extensionInstanceId:'fixture'}}}),runCli:(home,args)=>{commands.push(args[0]);return JSON.stringify({deviceId:'fixture',relayEndpoint:'https://relay.test/d/fixture/mcp',devicesEntry:'hashes'});}};
 try{assert.throws(()=>prepareEndpoint({experiment:'m5',relay:'wss://relay.test/ws',plan:{device:'mini'},prepared},deps),/managed Node/);assert.deepEqual(commands,['install']);assert.deepEqual(readdirSync(root),[]);}
 finally{rmSync(root,{recursive:true,force:true});}
});
test('an interrupted install removes only its own partial home',()=>{
 const root=mkdtempSync(join(tmpdir(),'cua-remote-prep-test-'));writeFileSync(join(root,'unrelated'),'keep');
 const prepared={home:'/fixture-source',dirty:false};
 try{
  // The fetched cache sits inside the partial home and goes with it.
  assert.throws(()=>prepareEndpoint({experiment:'m5',relay:'wss://relay.test/ws',plan:{device:'mini'},prepared},{...cacheDouble(),directoryRoot:root,tempRoot:'/not-this-directory',inspect:()=>prepared,runCli(){throw new Error('install failed');}}),/install failed/);
  assert.deepEqual(readdirSync(root),['unrelated']);
  // A refused fetch installs nothing.
  let installs=0;
  assert.throws(()=>prepareEndpoint({experiment:'m5',relay:'wss://relay.test/ws',plan:{device:'mini'},prepared},{cacheArchives(){throw new Error('archive SHA-256 is 00; the pin expects 11');},directoryRoot:root,tempRoot:'/not-this-directory',inspect:()=>prepared,runCli(){installs++;}}),/SHA-256/);
  assert.equal(installs,0);assert.deepEqual(readdirSync(root),['unrelated']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('removing an owned preparation removes its archive cache with it',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-remote-prep-test-'))),home=process.env.HOME;
 const prepared={home:'/fixture-source',dirty:false,profile:'ssfs',extensionInstanceId:'fixture'};
 process.env.HOME=root;
 try{
  const endpoint=prepareEndpoint({experiment:'parity',plan:{device:'cua-linux'},prepared,enrollment:false},{...cacheDouble(),tempRoot:'/not-this-directory',
   inspect:({source})=>({...prepared,home:source,ownNode:{path:source+'/node/24.x/bin/node',version:'v24.18.0'}}),registry:()=>({profiles:{ssfs:{route:'cua',chromeProfileDirectory:'Profile 1',extensionInstanceId:'fixture'}}}),runCli:()=>''});
  assert.ok(endpoint.home.startsWith(join(root,'.local','share','cua-parity-remote')+'/'));
  assert.equal(readdirSync(archiveCacheDir(endpoint.home)).length,2);
  assert.deepEqual(removeEndpoint({home:endpoint.home,experiment:endpoint.experiment,token:endpoint.token}),{removed:true});
  assert.deepEqual(readdirSync(join(root,'.local','share','cua-parity-remote')),[]);
 }finally{process.env.HOME=home;rmSync(root,{recursive:true,force:true});}
});
