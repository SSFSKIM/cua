// The enrolled device record ($CUA_HOME/remote/device.json) and the two leg credentials derived from its secret.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {readFileSync, statSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {credentialMatches, credentialsOf, devicesEntry, enrollDevice, readDevice} from '../src/remote/device.mjs';

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

test('enroll refuses a relay URL that is not ws: or wss:', t => {
  const dir = home(t);
  for (const bad of ['https://relay.example/ws', 'not a url', '']) assert.throws(() => enrollDevice({home: dir, relayUrl: bad}), {code: 'invalid_relay_url'}, bad);
  assert.equal(readDevice(dir), null);
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
