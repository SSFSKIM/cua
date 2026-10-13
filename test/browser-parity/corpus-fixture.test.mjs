import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startFixture} from './fixture/serve.mjs';
test('corpus pages and media are loopback fixtures with stable interaction targets', async t=>{
  const fixture=await startFixture({port:0});t.after(()=>fixture.close());
  for(const [page,targets] of Object.entries({'controls':['id="text"','id="check"','id="select"','id="double"'],'read':['data-note="stable"','Alpha','Beta'],'input':['id="input"','id="drag"'],'media':['id="image"'],'screenshot':['Parity screenshot'],'mutation':['/counter','id="replace-context"']})) {
    const response=await fetch(fixture.url+'/'+page+'.html');assert.equal(response.status,200,page);
    const html=await response.text();for(const target of targets)assert.ok(html.includes(target),`${page}: ${target}`);
  }
  const media=await fetch(fixture.url+'/image.svg');assert.equal(media.status,200);assert.match(media.headers.get('content-type'),/image\/svg/);
});
