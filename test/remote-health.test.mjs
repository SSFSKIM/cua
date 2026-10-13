import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {createAgentState, readAgentState, relayHealthRow} from '../src/remote/health.mjs';

const url = 'wss://relay.example/ws';
test('agent state records failures since the first attempt, recovery, freshness and relay changes', t => {
  const s = scratch(); t.after(s.cleanup);
  let now = Date.parse('2026-10-13T10:00:00Z');
  const record = createAgentState(s.dir, {now: () => now});
  record.relay({url, status: 'connecting'});
  record.relay({url, status: 'failing', error: 'Opening handshake has timed out'});
  const first = readAgentState(s.dir).relay;
  now += 30_000;
  record.relay({url, status: 'failing', error: 'ECONNREFUSED'});
  const failed = readAgentState(s.dir).relay;
  assert.equal(failed.failingSince, first.failingSince);
  assert.notEqual(failed.updatedAt, first.updatedAt);
  let row = relayHealthRow(s.dir, url, now);
  assert.equal(row.status, 'blocked');
  for (const text of [url, 'ECONNREFUSED', first.failingSince]) assert.ok(row.detail.includes(text), row.detail);
  record.relay({url, status: 'connected'});
  assert.equal(readAgentState(s.dir).relay.failingSince, null);
  assert.equal(relayHealthRow(s.dir, url, now).status, 'pass');
  assert.equal(relayHealthRow(s.dir, url, now + 91_000).status, 'blocked', 'a crashed agent cannot stay green forever');
  assert.equal(relayHealthRow(s.dir, 'wss://other.example/ws', now).status, 'blocked');
  record.relay({url, status: 'stopped', error: 'closed by the agent'});
  assert.equal(relayHealthRow(s.dir, url, now).status, 'blocked');
  assert.equal(statSync(join(s.dir, 'state/agent.json')).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(join(s.dir, 'state/agent.json'))).relay.lastConnectedAt, new Date(now).toISOString());
});

test('passive health handles absent, malformed and unenrolled state', t => {
  const s = scratch(); t.after(s.cleanup);
  assert.equal(relayHealthRow(s.dir, null).status, 'skip');
  assert.equal(relayHealthRow(s.dir, url).status, 'blocked');
  createAgentState(s.dir).relay({url, status: 'connecting'});
  writeFileSync(join(s.dir, 'state/agent.json'), '{partial');
  assert.equal(relayHealthRow(s.dir, url).status, 'blocked');
});

test('agent Chrome observations share state with relay updates without retaining profile labels or instance ids', async t => {
  const {observeAgentChrome} = await import('../src/remote/chrome-health.mjs');
  const {addProfile, bindProfile} = await import('../src/profiles/registry.mjs');
  const {fakeChromeFacts} = await import('./fixtures/chrome-facts.mjs');
  const s = scratch(); t.after(s.cleanup);
  const chrome = fakeChromeFacts({Default: {directory: 'unreadable'}});
  chrome.dataReadability = () => ({status: 'unreadable', error: 'EPERM'});
  addProfile({home: s.dir, key: 'work', directory: 'Default', chrome});
  bindProfile({home: s.dir, key: 'work', extensionInstanceId: 'private-instance'});
  const state = createAgentState(s.dir);
  const observe = () => state.chrome(observeAgentChrome({home: s.dir, chrome}));
  observe();
  state.relay({url, status: 'connected'});
  assert.equal(readAgentState(s.dir).chrome.status, 'unreadable');
  assert.equal(readAgentState(s.dir).chrome.profiles[0].error, 'EPERM');
  assert.doesNotMatch(readFileSync(join(s.dir, 'state/agent.json'), 'utf8'), /private-instance/);
  chrome.dataReadability = () => ({status: 'readable'});
  observe();
  assert.equal(readAgentState(s.dir).relay.status, 'connected');
  assert.equal(readAgentState(s.dir).chrome.status, 'unreadable', 'per-profile denial takes precedence over readable root');
});

test('Chrome readability exercises Local State reads, not merely profile directory metadata', async t => {
  const {mkdirSync, chmodSync} = await import('node:fs');
  const {chromeFacts} = await import('../src/profiles/chrome.mjs');
  const s = scratch(); t.after(s.cleanup);
  const userData = join(s.dir, 'Chrome');
  const facts = chromeFacts({userData});
  assert.equal(facts.dataReadability().status, 'missing');
  mkdirSync(userData);
  const local = join(userData, 'Local State');
  writeFileSync(local, '{}');
  assert.equal(facts.dataReadability().status, 'readable');
  if (process.getuid?.() !== 0) {
    chmodSync(local, 0o000); t.after(() => { try { chmodSync(local, 0o600); } catch {} });
    assert.equal(facts.profileDirectoryExists('Default'), 'missing');
    assert.deepEqual(facts.dataReadability(), {status: 'unreadable', error: 'EACCES'});
  }
});
