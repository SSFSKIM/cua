import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHost} from '../src/chrome/host.mjs';
import {createFakeCuaExtension} from './helpers/fake-cua-extension.mjs';

function setup(t) {
  const home = mkdtempSync(join(tmpdir(), 'host-trace-'));
  t.after(() => rmSync(home, {recursive:true, force:true}));
  mkdirSync(join(home, 'state'));
  const path = join(home, 'trace.jsonl');
  const activate = () => writeFileSync(join(home, 'state/host-trace.json'), JSON.stringify({path}));
  const ext = createFakeCuaExtension();
  const host = createHost({extension:ext.api, hello:ext.hello(), home});
  ext.onNotify = (method, params) => host.onExtensionNotification({method, params});
  const client = {notify() {}};
  const call = (method, params = {}, session = 'session-1') => host.handleBackendRequest(client,
    {method, params:{session_id:session, turn_id:'turn-1', session_context:'live', ...params}});
  const rows = () => readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse);
  return {home, path, activate, ext, host, call, rows};
}

test('trace activates only on session creation, captures requests and notifications without payload values', async t => {
  const s = setup(t);
  await s.call('getTabs', {}, 'old');
  s.activate();
  await s.call('getTabs', {}, 'old');
  assert.equal(existsSync(s.path), false);
  await s.call('nameSession', {name:'case/redaction'});
  const tab = await s.call('createTab');
  await s.call('attach', {tabId:tab.id});
  await s.call('executeCdp', {target:{tabId:tab.id}, method:'Runtime.evaluate', commandParams:{expression:'SECRET_VALUE https://example.test/private?q=secret'}, timeoutMs:1000});
  await s.host.onExtensionNotification({method:'debugger.event', params:{debuggee:{tabId:tab.id}, method:'Runtime.consoleAPICalled', params:{args:[{value:'SECRET_NOTIFICATION'}]}}});
  await assert.rejects(s.call('executeCdp', {target:{tabId:9999}, method:'Runtime.evaluate', commandParams:{expression:'SECRET_FAILED'}}));
  await s.call('turnEnded');
  const rows = s.rows();
  assert.equal(rows[0].name, 'case/redaction');
  assert.equal(rows[0].method, 'nameSession');
  const cdp = rows.find(r => r.cdp === 'Runtime.evaluate' && r.ok);
  assert.deepEqual(cdp.paramKeys, ['expression']);
  assert.deepEqual(cdp.target, {tabId:tab.id});
  assert.equal(cdp.kind, 'request');
  assert.equal(typeof cdp.ms, 'number');
  assert.ok(rows.some(r => r.kind === 'notification' && r.cdp === 'Runtime.consoleAPICalled'));
  assert.ok(rows.some(r => r.ok === false && r.code === 1));
  assert.ok(rows.some(r => r.method === 'turnEnded'));
  assert.doesNotMatch(readFileSync(s.path, 'utf8'), /SECRET_|private|expression.*https/);
  assert.ok(rows.every(r => r.session === 'session-1' && r.t));
});

test('trace activation is latched for a session and diagnostic failures never break host calls', async t => {
  const s = setup(t);
  s.activate();
  await s.call('getTabs');
  rmSync(join(s.home, 'state/host-trace.json'));
  await s.call('getTabs');
  assert.equal(s.rows().length, 2);
  writeFileSync(join(s.home, 'state/host-trace.json'), '{broken');
  await s.call('getTabs', {}, 'broken-config');
  writeFileSync(join(s.home, 'state/host-trace.json'), JSON.stringify({path:join(s.home, 'missing/trace')}));
  await s.call('getTabs', {}, 'bad-output');
  assert.equal(s.rows().length, 2);
});

test('trace omits malformed identifier values on rejected requests, accepted requests and notifications',async t=>{
  const s=setup(t);s.activate();const tab=await s.call('createTab');await s.call('attach',{tabId:tab.id});
  const poison={url:'https://example.test/private?credential=TRACE_SECRET_7x',credential:'TRACE_SECRET_7x'};
  await assert.rejects(s.call('executeCdp',{target:{tabId:poison,sessionId:[poison],targetId:poison},method:'Runtime.evaluate',commandParams:{}}));
  await assert.rejects(s.call('attach',{tabId:poison}));
  await s.call('executeCdp',{tabId:poison,target:{tabId:tab.id,sessionId:'CHILD-1'},method:'DOM.enable',commandParams:{}});
  const frame=`T-${tab.id}-f1`;await s.call('attachTarget',{tabId:tab.id,targetId:frame});
  await s.call('executeCdp',{target:{tabId:tab.id,targetId:frame},method:'DOM.enable'});
  await s.host.onExtensionNotification({method:'debugger.event',params:{debuggee:{tabId:tab.id,sessionId:poison},method:'Runtime.consoleAPICalled',params:{args:[poison]}}});
  const rows=s.rows(),text=readFileSync(s.path,'utf8');
  assert.doesNotMatch(text,/TRACE_SECRET_7x|example\.test|credential/);
  assert.ok(rows.some(r=>r.ok===false&&r.method==='executeCdp'));
  assert.deepEqual(rows.find(r=>r.ok&&r.target?.sessionId==='CHILD-1').target,{tabId:tab.id,sessionId:'CHILD-1'});
  assert.deepEqual(rows.find(r=>r.ok&&r.target?.targetId===frame).target,{tabId:tab.id,targetId:frame});
  assert.ok(rows.filter(r=>r.tabId!==undefined).every(r=>Number.isSafeInteger(r.tabId)));
  assert.deepEqual(rows.find(r=>r.kind==='notification').target,{tabId:tab.id});
});

test('trace identifier slots exclude URLs, oversized tokens and non-scalar method values',async t=>{
  const s=setup(t);s.activate();const tab=await s.call('createTab');await s.call('attach',{tabId:tab.id});
  const poison='https://example.test/?credential=TRACE_SECRET_8y';
  await s.call('getTabs',{},poison);
  await assert.rejects(s.call({credential:'TRACE_SECRET_8y'}));
  await assert.rejects(s.call(poison));
  for(const bad of [poison,'x'.repeat(129),['TRACE_SECRET_8y'],{credential:'TRACE_SECRET_8y'}]) {
    await assert.rejects(s.call('executeCdp',{target:{tabId:tab.id,targetId:bad},method:'DOM.enable'}));
    await s.call('executeCdp',{target:{tabId:tab.id},method:bad}).catch(()=>{});
  }
  assert.doesNotMatch(readFileSync(s.path,'utf8'),/TRACE_SECRET_8y|example\.test|x{129}/);
});
