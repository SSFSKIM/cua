// The enrolled device record ($CUA_HOME/remote/device.json) and the two leg credentials derived from its secret.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createHmac, randomBytes} from 'node:crypto';
import {readFileSync, rmSync, statSync, utimesSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {checkRelayUrl, clientSecretKey, credentialMatches, credentialsOf, devicesEntry, enrollDevice, followDevice, readDevice, relayEndpoint} from '../src/remote/device.mjs';

const home = t => { const s = scratch(); t.after(s.cleanup); return s.dir; };
const sha256 = text => createHash('sha256').update(text).digest('hex');
const B64URL = /^[A-Za-z0-9_-]+$/;

test('enroll writes a private device record with a random id and secret, and returns the client credential and the relay line', t => {
  const dir = home(t);
  const enrolled = enrollDevice({home: dir});
  const file = join(dir, 'remote', 'device.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(join(dir, 'remote')).mode & 0o777, 0o700);
  const record = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(record).sort(), ['deviceId', 'enrolledAt', 'schema', 'secret']);
  assert.equal(record.schema, 1);
  assert.match(record.deviceId, B64URL);
  assert.equal(Buffer.from(record.deviceId, 'base64url').length, 16);
  assert.match(record.secret, B64URL);
  assert.equal(Buffer.from(record.secret, 'base64url').length, 32);
  assert.ok(!Number.isNaN(Date.parse(record.enrolledAt)));

  const key = Buffer.from(record.secret, 'base64url');
  const expected = {
    deviceCredential: createHmac('sha256', key).update('device').digest('hex'),
    clientCredential: createHmac('sha256', key).update('client').digest('hex'),
  };
  assert.deepEqual(credentialsOf(record), expected);
  assert.notEqual(expected.deviceCredential, expected.clientCredential);
  assert.deepEqual(enrolled, {
    deviceId: record.deviceId, clientCredential: expected.clientCredential, relayUrl: null,
    devicesEntry: `"${record.deviceId}": {"deviceCredentialSha256": "${sha256(expected.deviceCredential)}", "clientCredentialSha256": "${sha256(expected.clientCredential)}"}`,
  });
  assert.equal(devicesEntry(record), enrolled.devicesEntry);
  assert.ok(!enrolled.devicesEntry.includes(record.secret) && !enrolled.devicesEntry.includes(expected.clientCredential), 'the relay line carries hashes only');
  assert.deepEqual(readDevice(dir), record);
});

test('two enrolments in two homes get different ids and secrets', t => {
  const [a, b] = [enrollDevice({home: home(t)}), enrollDevice({home: home(t)})];
  assert.notEqual(a.deviceId, b.deviceId);
  assert.notEqual(a.clientCredential, b.clientCredential);
});

test('enroll records a relay URL, refuses to re-enrol, updates only the relay URL when only --relay is given, and --rotate replaces the secret', t => {
  const dir = home(t);
  const first = enrollDevice({home: dir, relayUrl: 'wss://relay.example/ws'});
  assert.equal(first.relayUrl, 'wss://relay.example/ws');
  const before = readDevice(dir);
  assert.equal(before.relayUrl, 'wss://relay.example/ws');

  assert.throws(() => enrollDevice({home: dir}), {code: 'remote_already_enrolled'});
  assert.deepEqual(readDevice(dir), before, 'a refusal changes nothing');

  const moved = enrollDevice({home: dir, relayUrl: 'wss://other.example/ws'});
  assert.deepEqual(moved, {deviceId: before.deviceId, relayUrl: 'wss://other.example/ws', devicesEntry: devicesEntry(before), updated: 'relayUrl'});
  assert.ok(!('clientCredential' in moved), 'the client credential is never shown again');
  assert.deepEqual(readDevice(dir), {...before, relayUrl: 'wss://other.example/ws'});

  const rotated = enrollDevice({home: dir, rotate: true});
  const after = readDevice(dir);
  assert.equal(after.deviceId, before.deviceId, 'the device keeps its id, so its relay path stays');
  assert.notEqual(after.secret, before.secret);
  assert.equal(after.relayUrl, 'wss://other.example/ws');
  assert.equal(rotated.clientCredential, credentialsOf(after).clientCredential);
  assert.notEqual(rotated.clientCredential, first.clientCredential);
  assert.notEqual(rotated.devicesEntry, devicesEntry(before));
  assert.equal(statSync(join(dir, 'remote', 'device.json')).mode & 0o777, 0o600);
});

test('a relay URL is wss:, or ws: only to a loopback host: anything else carries the credentials in clear and is refused', t => {
  const dir = home(t);
  for (const bad of ['https://relay.example/ws', 'not a url', '', 'ws://relay.example/ws', 'ws://192.168.1.20:7800/ws', 'ws://100.92.238.1/ws', 'ws://localhost.example/ws', 'ws://[::2]/ws', 'wss://relay.example/ws#x'])
    assert.throws(() => enrollDevice({home: dir, relayUrl: bad}), {code: 'invalid_relay_url'}, bad);
  assert.equal(readDevice(dir), null);
  for (const good of ['wss://relay.example/ws', 'wss://10.0.0.1:8443/ws', 'ws://127.0.0.1:7800/ws', 'ws://127.8.9.10/ws', 'ws://localhost:7800/ws', 'ws://[::1]:7800/ws'])
    assert.doesNotThrow(() => checkRelayUrl(good), good);
});

test('relayEndpoint is the client\'s URL on the enrolled relay: its origin (https for wss, http for loopback ws) and /d/<deviceId>/mcp', t => {
  const record = enrollDevice({home: home(t)});
  const of = relayUrl => relayEndpoint({deviceId: record.deviceId, ...(relayUrl ? {relayUrl} : {})});
  assert.equal(of(undefined), null);
  assert.equal(of('wss://relay.example/ws'), `https://relay.example/d/${record.deviceId}/mcp`);
  assert.equal(of('wss://relay.example:8443/ws?x=1'), `https://relay.example:8443/d/${record.deviceId}/mcp`);
  assert.equal(of('ws://127.0.0.1:7800/ws'), `http://127.0.0.1:7800/d/${record.deviceId}/mcp`);
});

test('followDevice re-reads device.json only when its mtime, size or file changes, re-deriving both credentials and the relay URL', t => {
  const dir = home(t);
  const diagnostics = [];
  enrollDevice({home: dir});
  const file = join(dir, 'remote', 'device.json');
  const fixed = new Date('2026-01-01T00:00:00Z');
  utimesSync(file, fixed, fixed);
  const current = followDevice(dir, {diagnostics: line => diagnostics.push(line)});
  const first = current();
  assert.deepEqual(first, {...readDevice(dir), ...credentialsOf(readDevice(dir))});
  assert.equal(current(), first, 'unchanged: the same record, not re-read');

  // The same size and mtime written in place: not noticed (the check is the stamp, never the content).
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, text.replace(/"secret": "./, m => m.slice(0, -1) + (m.at(-1) === 'A' ? 'B' : 'A')));
  utimesSync(file, fixed, fixed);
  assert.equal(current(), first);

  const rotated = enrollDevice({home: dir, rotate: true, relayUrl: 'wss://relay.example/ws'});
  const second = current();
  assert.equal(second.clientCredential, rotated.clientCredential);
  assert.notEqual(second.deviceCredential, first.deviceCredential);
  assert.equal(second.relayUrl, 'wss://relay.example/ws');
  assert.equal(current(), second);
  assert.ok(diagnostics.some(line => /device\.json changed/.test(line) && /wss:\/\/relay\.example\/ws/.test(line)), diagnostics.join('\n'));

  rmSync(file);
  assert.equal(current(), null, 'gone: no credential, every client refused');
  writeFileSync(file, 'not json');
  assert.equal(current(), null, 'unreadable: likewise');
  for (const line of diagnostics) for (const secret of [first.clientCredential, second.clientCredential, second.secret]) assert.ok(!line.includes(secret));
});

test('readDevice is null before enrolment and refuses a record that is not one', t => {
  const dir = home(t);
  assert.equal(readDevice(dir), null);
  mkdirSync(join(dir, 'remote'));
  for (const body of ['not json', '{}', JSON.stringify({schema: 1, deviceId: 'x', secret: 1, enrolledAt: 'now'})]) {
    writeFileSync(join(dir, 'remote', 'device.json'), body);
    assert.throws(() => readDevice(dir), {code: 'remote_device_invalid'}, body);
  }
});

test('credentialMatches compares the whole credential and nothing else', () => {
  const credential = 'a'.repeat(64);
  assert.equal(credentialMatches(credential, credential), true);
  assert.equal(credentialMatches(credential, 'a'.repeat(63) + 'b'), false);
  assert.equal(credentialMatches(credential, 'a'.repeat(63)), false, 'a prefix is a mismatch');
  assert.equal(credentialMatches(credential, credential + 'a'), false);
  assert.equal(credentialMatches(credential, undefined), false);
  assert.equal(credentialMatches(credential, ''), false);
});

test('clientSecretKey is a /secret key for the device: CUA_DEVICE_ and the id, base64url\'s - as _', () => {
  assert.equal(clientSecretKey('nuadM-MUKSbSN4L59EffLQ'), 'CUA_DEVICE_nuadM_MUKSbSN4L59EffLQ');
  for (let i = 0; i < 200; i++) assert.match(clientSecretKey(randomBytes(16).toString('base64url')), /^[A-Za-z_][A-Za-z0-9_]*$/);
});
