import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,chmodSync,unlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Wire} from './wire.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dir=()=>mkdtempSync(join(tmpdir(),'wc-'));
const pipes=()=>process.getActiveResourcesInfo().filter(x=>x==='PipeWrap').length;
// A real stale inode: a listener killed without unlinking leaves a socket file nobody listens on (connect: ECONNREFUSED).
async function staleInode(path){
 const child=spawn(process.execPath,['-e',`require('node:net').createServer().listen(${JSON.stringify(path)},()=>console.log('up'))`],{stdio:['ignore','pipe','inherit']});
 await new Promise((ok,no)=>{child.stdout.once('data',ok);child.once('error',no);});
 const closed=new Promise(r=>child.once('close',r));child.kill('SIGKILL');await closed;// 'close' follows exit and the closing of the stdio pipes
 assert.ok(existsSync(path));
}
const serve=(path,onConnection)=>new Promise((ok,no)=>{const server=createServer(onConnection);server.once('error',no);server.listen(path,()=>ok(server));});
const closeServer=s=>new Promise(r=>s.close(r));

test('a stale placeholder inode followed by a delayed real listener connects once the listener is ready',async()=>{
 const d=dir(),path=join(d,'e.sock');let server,connections=0;
 try {
  await staleInode(path);
  const later=sleep(300).then(async()=>{unlinkSync(path);server=await serve(path,()=>{connections++;});});
  const before=Date.now(),wire=await Wire.connect(path,{timeoutMs:3000});
  assert.ok(Date.now()-before>=250,'connected before the listener existed');
  await later;assert.ok(wire instanceof Wire);assert.equal(wire.socket.readyState,'open');
  wire.close();await sleep(50);assert.equal(connections,1);
 } finally {if(server)await closeServer(server);rmSync(d,{recursive:true,force:true});}
});

test('a socket path that does not exist yet (ENOENT) is waited for',async()=>{
 const d=dir(),path=join(d,'e.sock');let server;
 try {
  const later=sleep(200).then(async()=>{server=await serve(path,()=>{});});
  const wire=await Wire.connect(path,{timeoutMs:3000});await later;
  assert.equal(wire.socket.readyState,'open');wire.close();
 } finally {if(server)await closeServer(server);rmSync(d,{recursive:true,force:true});}
});

test('a stale inode that never gets a listener fails with ECONNREFUSED within the timeout bound and leaks no socket',async()=>{
 const d=dir(),path=join(d,'e.sock');
 try {
  await staleInode(path);
  const handles=pipes(),before=Date.now();
  await assert.rejects(Wire.connect(path,{timeoutMs:300}),e=>e.code==='ECONNREFUSED');
  const took=Date.now()-before;assert.ok(took>=250&&took<1500,'took '+took);
  await sleep(50);assert.equal(pipes(),handles);
 } finally {rmSync(d,{recursive:true,force:true});}
});

test('a path that never appears fails with ENOENT within the timeout bound',async()=>{
 const d=dir();
 try {
  const before=Date.now();
  await assert.rejects(Wire.connect(join(d,'none.sock'),{timeoutMs:300}),e=>e.code==='ENOENT');
  const took=Date.now()-before;assert.ok(took>=250&&took<1500,'took '+took);
 } finally {rmSync(d,{recursive:true,force:true});}
});

test('other connect errors fail immediately without waiting',{skip:process.getuid?.()===0&&'root bypasses socket permissions'},async()=>{
 const d=dir(),path=join(d,'e.sock');let server;
 try {
  server=await serve(path,()=>{});chmodSync(path,0);
  const before=Date.now();
  await assert.rejects(Wire.connect(path,{timeoutMs:5000}),e=>e.code==='EACCES');
  assert.ok(Date.now()-before<1000,'a non-retriable error waited');
 } finally {if(server)await closeServer(server);rmSync(d,{recursive:true,force:true});}
});

test('the default startup wait is about five seconds',async()=>{
 const d=dir();
 try {
  const before=Date.now(),p=Wire.connect(join(d,'none.sock')).catch(e=>e);
  await sleep(800);assert.ok(Date.now()-before<5000);
  const settled=await Promise.race([p.then(()=>'settled'),sleep(100).then(()=>'pending')]);assert.equal(settled,'pending');
  const e=await p;assert.equal(e.code,'ENOENT');const took=Date.now()-before;assert.ok(took>=4800&&took<7000,'took '+took);
 } finally {rmSync(d,{recursive:true,force:true});}
});
