import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,lstatSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {longPipe} from './fixtures/long-pipe.mjs';
import {EventEmitter} from 'node:events';
import {handleRpc} from './fixtures/trusted-service.mjs';
import {fixtureServices} from './fixtures/service-home.mjs';
const execute=promisify(execFile);
test('long-pipe capture uses the full path and records connection refusals verbatim, never as success',async()=>{
 const path='/'+('x'.repeat(191)),previous=Object.getOwnPropertyDescriptor(globalThis,'nodeRepl');
 try{for(const refusal of [null,'vendor fixture refusal']){
  Object.defineProperty(globalThis,'nodeRepl',{configurable:true,value:{env:{PARITY_PIPE_LONG:path},nativePipe:{createConnection:async received=>{assert.equal(received,path);if(refusal)throw Error(refusal);const socket=new EventEmitter();socket.end=()=>{};socket.write=bytes=>{assert.deepEqual([...bytes],[0,255,128,10,13,65]);queueMicrotask(()=>{socket.emit('data',new Uint8Array([65,13,10]));socket.emit('data',new Uint8Array([128,255,0]));socket.emit('close');});};return socket;}}}});
  assert.deepEqual(await handleRpc({op:'pipe',mode:'long-path'}),{platform:process.platform,pathBytes:192,sunPathBytes:process.platform==='darwin'?104:108,status:refusal?'refused':'connected',bytes:refusal?[]:[65,13,10,128,255,0],message:refusal});
 }}finally{if(previous)Object.defineProperty(globalThis,'nodeRepl',previous);else delete globalThis.nodeRepl;}
});
test('the service case owns its optional over-limit listener and removes it on close',async()=>{
 const fixture=await fixtureServices({longPathPipe:true});let path;
 try{path=fixture.env.PARITY_PIPE_LONG;assert.equal(typeof path,'string');assert.equal(Buffer.byteLength(path),192);assert.equal(lstatSync(path).isSocket(),true);}finally{await fixture.close();}
 assert.equal(existsSync(path),false);
});
test('the owned listener binds an absolute over-limit path and relays exact binary bytes through a short relative connect',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-long-pipe-test-')));let peer;
 t.after(async()=>{try{await peer?.close();}finally{rmSync(root,{recursive:true,force:true});}});
 writeFileSync(join(root,'retained.txt'),'not the peer');peer=await longPipe(root);
 assert.equal(Buffer.byteLength(peer.path),192);assert.ok(peer.path.startsWith(root+'/'));assert.equal(lstatSync(peer.path).isSocket(),true);
 const {stdout}=await execute(process.execPath,['--input-type=module','-e',`import {connect} from 'node:net';const socket=connect(${JSON.stringify(basename(peer.path))});const got=[];const timer=setTimeout(()=>{socket.destroy();process.exitCode=1;},3000);socket.on('connect',()=>socket.write(Buffer.from([0,255,128,10,13,65])));socket.on('data',chunk=>got.push(...chunk));socket.on('end',()=>{clearTimeout(timer);console.log(JSON.stringify(got));});socket.on('error',()=>{clearTimeout(timer);process.exitCode=1;});`],{cwd:dirname(peer.path),timeout:5000,encoding:'utf8'});
 assert.deepEqual(JSON.parse(stdout),[65,13,10,128,255,0]);
 await peer.close();peer=null;assert.equal(existsSync(join(root,'retained.txt')),true);
 assert.equal(existsSync(join(root,'long-pipe')),false,'only the helper-owned deep directory is removed');
});
