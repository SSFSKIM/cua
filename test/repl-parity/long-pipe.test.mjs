import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,lstatSync,existsSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {connect} from 'node:net';
import {longPipe} from './fixtures/long-pipe.mjs';
import {EventEmitter} from 'node:events';
import {handleRpc} from './fixtures/trusted-service.mjs';
import {fixtureServices} from './fixtures/service-home.mjs';
import services from './scenarios/services.mjs';
const execute=promisify(execFile);
const request=[0,255,128,10,13,65],reversed=[...request].reverse();
const absolutePath=services.find(s=>s.id==='cells/native-pipe/absolute-path');
const asResult=value=>({isError:false,content:[{type:'text',text:JSON.stringify(value)}]});
const text=value=>({isError:false,content:[{type:'text',text:value}]});
const darwinOracle=value=>absolutePath.assert({results:[text('true'),text('native pipe path unavailable: No such file or directory (os error 2)'),asResult(value)],timings:[0,0,0],platform:'darwin'});
async function withNodeRepl(nodeRepl,run){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'nodeRepl');Object.defineProperty(globalThis,'nodeRepl',{configurable:true,value:nodeRepl});
 try{return await run();}finally{if(previous)Object.defineProperty(globalThis,'nodeRepl',previous);else delete globalThis.nodeRepl;}
}
// A subject double that really connects: through a short symlink to the over-limit socket, so no cwd change is needed.
async function realConnect(path,scratch){
 const link=join(scratch,'l.sock');symlinkSync(path,link);
 const socket=connect(link);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});return socket;
}
async function journalShows(path,predicate){
 for(const end=Date.now()+2000;Date.now()<end;await new Promise(r=>setTimeout(r,10)))if(predicate(JSON.parse(readFileSync(path,'utf8'))))return;
 throw new Error('peer journal never showed the expected state');
}
async function capture(createConnection){
 const fixture=await fixtureServices({longPathPipe:true}),scratch=mkdtempSync(join(tmpdir(),'lp-'));
 try{return await withNodeRepl({env:Object.freeze({...fixture.env}),nativePipe:{createConnection:async path=>{assert.equal(path,fixture.env.PARITY_PIPE_LONG);return createConnection(path,{scratch,journal:fixture.env.PARITY_PIPE_LONG_PEER});}}},()=>handleRpc({op:'pipe',mode:'long-path'}));}
 finally{try{await fixture.close();}finally{rmSync(scratch,{recursive:true,force:true});}}
}
const metadata={platform:process.platform,pathBytes:192,sunPathBytes:process.platform==='darwin'?104:108};
test('a subject that really connects is witnessed by the harness-owned peer: one accepted connection, the exact six bytes',async()=>{
 const value=await capture((path,{scratch})=>realConnect(path,scratch));
 assert.deepEqual(value,{...metadata,status:'connected',bytes:reversed,message:null,peer:{accepted:1,received:[request]}});
 assert.equal(darwinOracle({...value,platform:'darwin',sunPathBytes:104}).ok,true);
});
test('a fabricated socket that reverses the bytes locally is rejected: the peer accepted no connection',async()=>{
 const value=await capture(()=>{const socket=new EventEmitter();socket.end=()=>{};socket.write=bytes=>{assert.deepEqual([...bytes],request);queueMicrotask(()=>{socket.emit('data',new Uint8Array(reversed.slice(0,3)));socket.emit('data',new Uint8Array(reversed.slice(3)));socket.emit('close');});};return socket;});
 assert.deepEqual(value,{...metadata,status:'connected',bytes:reversed,message:null,peer:{accepted:0,received:[]}});
 assert.throws(()=>darwinOracle({...value,platform:'darwin',sunPathBytes:104}),/peer witness/);
});
test('a replayed response over a real connection that carried the wrong bytes is rejected by the peer witness',async()=>{
 const value=await capture(async(path,{scratch,journal})=>{
  const real=await realConnect(path,scratch),socket=new EventEmitter();socket.end=()=>real.destroy();
  socket.write=()=>{real.write(Buffer.from([1,2,3]));journalShows(journal,j=>j.received[0]?.length===3).then(()=>{socket.emit('data',new Uint8Array(reversed));real.destroy();socket.emit('close');},error=>socket.emit('error',error));};
  return socket;
 });
 assert.deepEqual(value,{...metadata,status:'connected',bytes:reversed,message:null,peer:{accepted:1,received:[[1,2,3]]}});
 assert.throws(()=>darwinOracle({...value,platform:'darwin',sunPathBytes:104}),/peer witness/);
});
test('a refused connect is recorded verbatim with the peer witnessing no connection, never as success',async()=>{
 const value=await capture(()=>{throw Error('vendor fixture refusal');});
 assert.deepEqual(value,{...metadata,status:'refused',bytes:[],message:'vendor fixture refusal',peer:{accepted:0,received:[]}});
});
test('the service case owns its optional over-limit listener and peer journal and removes both on close',async()=>{
 const fixture=await fixtureServices({longPathPipe:true});let path,journal;
 try{
  path=fixture.env.PARITY_PIPE_LONG;journal=fixture.env.PARITY_PIPE_LONG_PEER;assert.equal(typeof path,'string');assert.equal(Buffer.byteLength(path),192);assert.equal(lstatSync(path).isSocket(),true);
  assert.deepEqual(JSON.parse(readFileSync(journal,'utf8')),{accepted:0,received:[]});
 }finally{await fixture.close();}
 assert.equal(existsSync(path),false);assert.equal(existsSync(journal),false);
});
test('the owned listener binds an absolute over-limit path, relays exact binary bytes through a short relative connect and journals them',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-long-pipe-test-')));let peer;
 t.after(async()=>{try{await peer?.close();}finally{rmSync(root,{recursive:true,force:true});}});
 writeFileSync(join(root,'retained.txt'),'not the peer');peer=await longPipe(root);
 assert.equal(Buffer.byteLength(peer.path),192);assert.ok(peer.path.startsWith(root+'/'));assert.equal(lstatSync(peer.path).isSocket(),true);
 assert.ok(peer.journal.startsWith(root+'/long-pipe/'));
 const {stdout}=await execute(process.execPath,['--input-type=module','-e',`import {connect} from 'node:net';const socket=connect(${JSON.stringify(basename(peer.path))});const got=[];const timer=setTimeout(()=>{socket.destroy();process.exitCode=1;},3000);socket.on('connect',()=>socket.write(Buffer.from([0,255,128,10,13,65])));socket.on('data',chunk=>got.push(...chunk));socket.on('end',()=>{clearTimeout(timer);console.log(JSON.stringify(got));});socket.on('error',()=>{clearTimeout(timer);process.exitCode=1;});`],{cwd:dirname(peer.path),timeout:5000,encoding:'utf8'});
 assert.deepEqual(JSON.parse(stdout),reversed);
 assert.deepEqual(JSON.parse(readFileSync(peer.journal,'utf8')),{accepted:1,received:[request]});
 await peer.close();peer=null;assert.equal(existsSync(join(root,'retained.txt')),true);
 assert.equal(existsSync(join(root,'long-pipe')),false,'only the helper-owned deep directory is removed');
});
