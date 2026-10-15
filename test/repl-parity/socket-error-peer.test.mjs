import {test} from 'node:test';import assert from 'node:assert/strict';import {createConnection} from 'node:net';
import {fixtureServices} from './fixtures/service-home.mjs';
test('transport-error peer keeps its write half alive so an EPIPE cannot be hidden by an earlier EOF',async()=>{
 const fixture=await fixtureServices({errorPipe:true});let socket;
 try{
  socket=createConnection(fixture.env.PARITY_PIPE_ERROR);const events=[];socket.on('error',e=>events.push(e.code));socket.on('close',()=>events.push('close'));
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  await new Promise(r=>setTimeout(r,180));assert.deepEqual(events,[],'peer must not end the read stream before the tested write');
  const closed=new Promise(resolve=>socket.once('close',resolve));socket.write(new Uint8Array(2*1024*1024));let timer;await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('No EPIPE: '+JSON.stringify(events))),2000);})]).finally(()=>clearTimeout(timer));
  assert.deepEqual(events,['EPIPE','close']);
 }finally{socket?.destroy();await fixture.close();}
});
