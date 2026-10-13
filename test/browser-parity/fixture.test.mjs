import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startFixture} from './fixture/serve.mjs';
test('fixture resets state, counts POSTs once, serves pages/download and rejects traversal', async t => {
  const server = await startFixture({port:0}); t.after(() => server.close());
  const base = server.url;
  const request = (path,body) => fetch(base+path, {method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
  assert.equal((await request('/reset',{counter:7})).status,200);
  assert.equal((await request('/counter',{})).status,200);
  assert.equal((await (await fetch(base+'/state')).json()).counter,8);
  for (const page of ['dialogs','downloads','chooser','oopif','popup','slow','strict','counter']) assert.equal((await fetch(`${base}/${page}.html`)).status,200,page);
  assert.match(await (await fetch(base+'/benchmark/index.html')).text(), /bench-id/);
  assert.match((await fetch(base+'/download')).headers.get('content-disposition'), /attachment/);
  assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,404);
  await request('/reset',{});
  assert.deepEqual(await (await fetch(base+'/state')).json(), {counter:0,events:[]});
});

test('fixture shutdown closes active keep-alive sockets so a later run cannot receive stale state',async()=>{
  const {connect}=await import('node:net');
  const fixture=await startFixture({port:0});
  const socket=connect(new URL(fixture.url).port,'127.0.0.1');
  socket.on('error',()=>{});
  await new Promise(resolve=>socket.once('connect',resolve));
  // An incomplete request is active, not an idle keep-alive socket Node can close automatically.
  socket.write('POST /event HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 100\r\n\r\n{');
  await new Promise(resolve=>setImmediate(resolve));
  const closed=fixture.close();let timer;
  try {
    await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('fixture retained an active connection after shutdown')),300);})]);
  } finally {clearTimeout(timer);socket.destroy();await closed;}
});
