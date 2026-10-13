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
