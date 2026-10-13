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

test('dialog triggers return before opening the modal so CDP input does not time out and detach',async t=>{
  const {runInNewContext}=await import('node:vm');
  const fixture=await startFixture({port:0});t.after(()=>fixture.close());
  const html=await (await fetch(fixture.url+'/dialogs.html')).text();
  const handler=html.match(/id="alert" onclick="([^"]+)"/)[1];
  let opened=false;const scheduled=[];
  runInNewContext(handler,{alert:()=>{opened=true;},setTimeout:fn=>scheduled.push(fn)});
  assert.equal(opened,false,'modal must not block Input.dispatchMouseEvent');
  assert.equal(scheduled.length,1);scheduled[0]();assert.equal(opened,true);
});

test('file chooser acknowledgement is published only after its independent fixture event is recorded',async t=>{
  const {runInNewContext}=await import('node:vm');
  const fixture=await startFixture({port:0});t.after(()=>fixture.close());
  const html=await (await fetch(fixture.url+'/chooser.html')).text();
  const input={},output={textContent:'',dataset:{}};let release;
  runInNewContext(html.match(/<script>(.*?)<\/script>/s)[1],{document:{querySelector:selector=>selector==='#file'?input:output},fetch:()=>new Promise(resolve=>{release=resolve;})});
  const pending=input.onchange({target:{files:[{name:'fixture.txt'}]}});
  assert.equal(output.textContent,'');release();await pending;
  assert.equal(output.textContent,'fixture.txt');assert.equal(output.dataset.recorded,'yes');
});

test('control event acknowledgement consumes a successful fixture response and reflects its recorded state',async t=>{
  const {runInNewContext}=await import('node:vm');
  const fixture=await startFixture({port:0});t.after(()=>fixture.close());
  const html=await (await fetch(fixture.url+'/controls.html')).text();
  const script=html.match(/<script>(.*?)<\/script>/s)[1];
  const recorded=await runInNewContext(script+'record({double:true});',{document:{documentElement:{setAttribute(){}}},fetch:(url,options)=>fetch(fixture.url+url,options)});
  assert.deepEqual(recorded,{counter:0,events:[{double:true}]});
  assert.deepEqual(await (await fetch(fixture.url+'/state')).json(),recorded);
});

test('reload and pending-load fixtures expose transitions instead of already-satisfied conditions',async t=>{
  const fixture=await startFixture({port:0});t.after(()=>fixture.close());
  const first=await (await fetch(fixture.url+'/reload.html')).text();
  const second=await (await fetch(fixture.url+'/reload.html')).text();
  assert.match(first,/id="reload-count">1</);assert.match(second,/id="reload-count">2</);
  const loading=await (await fetch(fixture.url+'/loading.html')).text();assert.match(loading,/id="pending-load"/);assert.match(loading,/slow-resource.svg/);
  const start=performance.now();const resource=await fetch(fixture.url+'/slow-resource.svg');await resource.text();
  assert.equal(resource.status,200);assert.ok(performance.now()-start>=1000,'resource must leave an observable pending load');
  assert.equal((await (await fetch(fixture.url+'/state')).json()).reloads,2);
});
