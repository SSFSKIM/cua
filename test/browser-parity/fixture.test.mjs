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

test('the slow document records its request and its answer 800 ms later, and its page records the arrival by token', async t => {
  const server = await startFixture({port:0}); t.after(() => server.close());
  const started = Date.now();
  const response = await fetch(`${server.url}/slow-document.html?token=abc`);
  assert.ok(Date.now() - started >= 750, 'answered after its delay');
  assert.match(await response.text(), /<title>Arrived<\/title>.*record\(\{arrived:/s);
  assert.deepEqual((await (await fetch(server.url+'/state')).json()).events, [{requested:'abc'},{responded:'abc'}]);
  for (const page of ['clipboard-page','paused-navigation']) assert.equal((await fetch(`${server.url}/${page}.html`)).status,200,page);
});

test('the page-assets page fetches a cross-origin asset from the second listener, which allows the fixture origin with credentials and records each request', async t => {
  const {crossAsset} = await import('./fixture/serve.mjs');
  const server = await startFixture({port:0}); t.after(() => server.close());
  assert.notEqual(new URL(server.assetURL).origin, new URL(server.url).origin);
  const page = await (await fetch(`${server.url}/page-assets.html`)).text();
  assert.ok(page.includes(`${server.assetURL}/cross-asset.png`), 'the page names the second origin');
  const response = await fetch(`${server.assetURL}/cross-asset.png`, {headers: {origin: server.url}});
  assert.equal(response.status, 200);
  assert.deepEqual(Object.fromEntries(['content-type', 'cache-control', 'access-control-allow-origin', 'access-control-allow-credentials'].map(h => [h, response.headers.get(h)])),
    {'content-type': 'image/png', 'cache-control': 'no-store', 'access-control-allow-origin': server.url, 'access-control-allow-credentials': 'true'});
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), crossAsset);
  assert.equal((await fetch(`${server.assetURL}/other.png`)).status, 404);
  assert.deepEqual((await (await fetch(`${server.url}/state`)).json()).events, [{asset: 'cross'}]);
});
