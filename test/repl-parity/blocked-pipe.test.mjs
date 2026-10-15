import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createConnection} from 'node:net';
import {blockedPipe} from './fixtures/blocked-pipe.mjs';
test('owned native-pipe deadline fixture fills the accept queue and cleans up its peer',async()=>{
 const dir=mkdtempSync('/tmp/cua-pipe-test-');let fixture;
 try{
  fixture=await blockedPipe(join(dir,'blocked.sock'));
  const socket=createConnection(fixture.path);
  const outcome=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('pending'),100);socket.once('connect',()=>{clearTimeout(timer);resolve('connected');});socket.once('error',()=>{clearTimeout(timer);resolve('refused');});});
  socket.destroy();assert.notEqual(outcome,'connected','the peer must not drain its accept queue');
 }finally{await fixture?.close();rmSync(dir,{recursive:true,force:true});}
});
