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
