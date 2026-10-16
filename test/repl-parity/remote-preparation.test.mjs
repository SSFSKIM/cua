import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,statSync,readlinkSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareEndpoint} from '../../scripts/repl-parity/remote-device.mjs';
import {socketPathFor,socketNameFor} from '../../src/chrome/extension.mjs';
test('endpoint preparation installs only its scratch home, aliases one enrolled backend, and never returns enrollment credentials',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-remote-prep-test-'))),parent=join(root,'owned');mkdirSync(parent);
 const prepared={home:join(root,'source'),dirty:false,commit:'reviewed',release:'pinned',profile:'ssfs',extensionInstanceId:'fixture-backend'};
 const commands=[],safe={deviceId:'x'.repeat(22),relayEndpoint:'https://relay.test/d/x/mcp',devicesEntry:'hashes-only'};
 const deps={directoryRoot:parent,tempRoot:'/not-this-test-directory',inspect:()=>prepared,registry:()=>({profiles:{ssfs:{route:'cua',chromeProfileDirectory:'Profile 1',extensionInstanceId:'fixture-backend'}}}),runCli:(home,args,{file}={})=>{
  commands.push({home,args});if(file)writeFileSync(file,JSON.stringify({clientCredential:'DO-NOT-RETURN'}),{flag:'wx',mode:0o600});
  return args[0]==='remote'&&args[1]==='show'?JSON.stringify(safe):'';
 }};
 try{
  const endpoint=prepareEndpoint({experiment:'m5',relay:'wss://relay.test/ws',plan:{device:'mini',name:'repl-m5-mini-browser',surfaces:['browser']},prepared},deps);
  assert.ok(endpoint.home.startsWith(parent+'/m5-'));assert.equal(statSync(endpoint.home).mode&0o777,0o700);
  assert.equal(statSync(join(endpoint.home,'enroll.json')).mode&0o777,0o600);assert.ok(!JSON.stringify(endpoint).includes('DO-NOT-RETURN'));
  assert.deepEqual(commands.map(c=>c.args),[['install'],['remote','enroll','--relay','wss://relay.test/ws','--json'],['remote','show','--json']]);assert.ok(commands.every(c=>c.home===endpoint.home));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(endpoint.home,'profiles.json'),'utf8')).profiles),['ssfs']);
  const name=socketNameFor('fixture-backend');assert.equal(readlinkSync(socketPathFor(endpoint.home,name)),socketPathFor(prepared.home,name));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('an interrupted install removes only its own partial home',()=>{
 const root=mkdtempSync(join(tmpdir(),'cua-remote-prep-test-'));writeFileSync(join(root,'unrelated'),'keep');
 const prepared={home:'/fixture-source',dirty:false};
 try{
  assert.throws(()=>prepareEndpoint({experiment:'m5',relay:'wss://relay.test/ws',plan:{device:'mini'},prepared},{directoryRoot:root,tempRoot:'/not-this-directory',inspect:()=>prepared,runCli(){throw new Error('install failed');}}),/install failed/);
  assert.deepEqual(readdirSync(root),['unrelated']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
