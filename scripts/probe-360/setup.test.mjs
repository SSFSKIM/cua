import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {FixtureTransport,FixtureError} from '../probe-354/transport.mjs';
import {bindVisibleFixture} from './setup.mjs';
const identity={pageId:'a'.repeat(32),timeOrigin:123};
function transport(){const t=new FixtureTransport();t.register(identity);const res=new EventEmitter();res.writableEnded=false;res.destroyed=false;res.end=()=>{res.writableEnded=true};t.poll(identity,res);return t}
function clock(){let at=0;return {now:()=>at,sleep:async ms=>{at+=ms}}}
const visible={windowTitle:'probe354:'+identity.pageId,frontmostPid:9,windowID:42};
test('a transient null AX title is waited out before binding the same visible fixture',async()=>{
 const t=transport(),c=clock(),attempts=[];let reads=0;
 const owner=await bindVisibleFixture({transport:t,pid:9,attempts,...c,readWindow:async()=>++reads===1?{...visible,windowTitle:null}:visible});
 assert.equal(reads,2);assert.equal(c.now(),50);assert.equal(owner.pageId,identity.pageId);assert.equal(attempts.length,2);assert.equal(t.hasPoll(),true);
});
test('a title cannot bind while another app is foreground',async()=>{
 const t=transport(),c=clock();let reads=0;
 await bindVisibleFixture({transport:t,pid:9,...c,readWindow:async()=>{assert.equal(t.owner,null);return ++reads===1?{...visible,frontmostPid:10}:visible}});
 assert.equal(reads,2);assert.equal(t.owner.pageId,identity.pageId);
});
test('a visible owner is not returned until its own live command poll exists',async()=>{
 const t=transport(),c=clock();t.polls.clear();let reads=0;
 const owner=await bindVisibleFixture({transport:t,pid:9,now:c.now,sleep:async ms=>{await c.sleep(ms);const res=new EventEmitter();res.writableEnded=false;res.destroyed=false;res.end=()=>{};t.poll(identity,res)},readWindow:async()=>{reads++;return visible}});
 assert.equal(reads,2);assert.equal(owner.pageId,identity.pageId);assert.equal(owner.ownerEpoch,1);assert.equal(t.hasPoll(),true);
});
test('missing or unregistered visible titles time out without a hidden owner fallback',async()=>{
 for(const title of [null,'probe354:'+'b'.repeat(32)]){
  const t=transport(),c=clock(),attempts=[];let reads=0;
  await assert.rejects(bindVisibleFixture({transport:t,pid:9,attempts,budgetMs:100,...c,readWindow:async()=>{reads++;return {...visible,windowTitle:title}}}),e=>e instanceof FixtureError);
  assert.equal(reads,2);assert.equal(attempts.length,2);assert.equal(t.owner,null);
 }
});
