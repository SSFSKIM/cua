// The enrolled device: $CUA_HOME/remote/device.json (mode 0600, directory 0700), {schema: 1, deviceId, secret,
// relayUrl?, enrolledAt}. `deviceId` is 16 random bytes and `secret` 32 random bytes, both base64url. Two credentials
// are derived from the secret, one per leg, so the copy a cloud client holds cannot be used to impersonate the Mac:
//   deviceCredential = hex(HMAC-SHA256(secret, "device"))   the agent presents it to the relay
//   clientCredential = hex(HMAC-SHA256(secret, "client"))   the cloud client presents it to the endpoint
// (the HMAC key is the secret's 32 bytes). The relay knows only their SHA-256 hashes, from the `devices.json` line
// `devicesEntry` prints. The secret is never printed, and the client credential only by the enrolment that minted it.
// A running agent follows the record (followDevice), so a rotation or a new relay URL takes effect without a restart.
import {createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fail} from '../runtime/errors.mjs';

const deviceDir = home => join(home, 'remote');
const deviceFile = home => join(deviceDir(home), 'device.json');
const B64URL = /^[A-Za-z0-9_-]+$/;
const ofLength = (text, bytes) => typeof text === 'string' && B64URL.test(text) && Buffer.from(text, 'base64url').length === bytes;

const isLoopback = host => host === 'localhost' || host === '[::1]' || /^127(\.\d{1,3}){3}$/.test(host);

// A relay URL is wss:, or ws: only to this Mac's loopback (a relay on the same Mac, or a test): over ws: the device
// credential and every client bearer would cross the network in clear. A #fragment is refused too, as the WebSocket
// client refuses it.
export function checkRelayUrl(relayUrl) {
  let url;
  try { url = new URL(relayUrl); } catch {}
  if (url?.protocol !== 'wss:' && !(url?.protocol === 'ws:' && isLoopback(url.hostname)) || url.hash)
    fail('invalid_relay_url', `the relay URL must be wss://, or ws:// to a loopback address, without a #fragment (got ${JSON.stringify(relayUrl)})`, {hint: 'put the relay behind TLS and enrol it as wss://<relay>/ws, for example cua remote enroll --relay wss://relay.example/ws'});
}

// The URL a client registers to reach this device through its relay: the relay's origin (https for wss:, http for a
// loopback ws:) and /d/<deviceId>/mcp. Null without a relay.
export function relayEndpoint(record) {
  if (!record.relayUrl) return null;
  const url = new URL(record.relayUrl);
  return `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}/d/${record.deviceId}/mcp`;
}

export function readDevice(home) {
  let text;
  try { text = readFileSync(deviceFile(home), 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let record;
  try { record = JSON.parse(text); } catch {}
  if (record?.schema !== 1 || !ofLength(record.deviceId, 16) || !ofLength(record.secret, 32) || typeof record.enrolledAt !== 'string'
    || (record.relayUrl !== undefined && typeof record.relayUrl !== 'string'))
    fail('remote_device_invalid', `${deviceFile(home)} is not a device record`, {hint: 'run `cua remote enroll --rotate` to replace it'});
  return record;
}

// Write-then-rename into a private directory: readers see the old record or the new one, never a partial file.
function writeDevice(home, record) {
  mkdirSync(deviceDir(home), {recursive: true, mode: 0o700});
  chmodSync(deviceDir(home), 0o700);
  const temp = join(deviceDir(home), `device.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, JSON.stringify(record, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    renameSync(temp, deviceFile(home));
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}

export function credentialsOf(record) {
  const key = Buffer.from(record.secret, 'base64url');
  const derive = leg => createHmac('sha256', key).update(leg).digest('hex');
  return {deviceCredential: derive('device'), clientCredential: derive('client')};
}

// The line to paste into the relay's devices.json (hashes only).
export function devicesEntry(record) {
  const {deviceCredential, clientCredential} = credentialsOf(record);
  const sha256 = text => createHash('sha256').update(text).digest('hex');
  return `${JSON.stringify(record.deviceId)}: {"deviceCredentialSha256": "${sha256(deviceCredential)}", "clientCredentialSha256": "${sha256(clientCredential)}"}`;
}

// Constant-time over equal lengths; a presented credential of another length (or none) is a mismatch without comparing.
export function credentialMatches(expected, presented) {
  if (typeof presented !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// A first enrolment mints the device; on an enrolled device only `rotate` (a new secret under the same device id, so
// the relay path stays while the relay line and the client's credential change) or a lone `relayUrl` (updated in
// place, nothing rotated, no credential shown) proceed.
export function enrollDevice({home, relayUrl, rotate = false}) {
  if (relayUrl !== undefined) checkRelayUrl(relayUrl);
  const existing = readDeviceForEnrol(home, rotate);
  if (existing && !rotate) {
    if (relayUrl === undefined)
      fail('remote_already_enrolled', `this Mac is already enrolled as device ${existing.deviceId}`, {hint: 'cua remote show prints its relay line; cua remote enroll --rotate replaces its secret (the relay line and the client registration both change)'});
    const record = {...existing, relayUrl};
    writeDevice(home, record);
    return {deviceId: record.deviceId, relayUrl, devicesEntry: devicesEntry(record), updated: 'relayUrl'};
  }
  const record = {
    schema: 1,
    deviceId: existing?.deviceId ?? randomBytes(16).toString('base64url'),
    secret: randomBytes(32).toString('base64url'),
    ...(relayUrl ?? existing?.relayUrl ? {relayUrl: relayUrl ?? existing.relayUrl} : {}),
    enrolledAt: new Date().toISOString(),
  };
  writeDevice(home, record);
  return {deviceId: record.deviceId, clientCredential: credentialsOf(record).clientCredential, devicesEntry: devicesEntry(record), relayUrl: record.relayUrl ?? null};
}

// The device record as it is now, for a process that outlives an `enroll`: `current()` returns the record with both
// credentials ({...record, deviceCredential, clientCredential}), re-read only when device.json's mtime, size or inode
// changed since the last call (enroll writes a new file and renames it into place), and null while the record is gone
// or unreadable, so every client is refused until it is back.
export function followDevice(home, {diagnostics = () => {}} = {}) {
  let stamp;
  let record = null;
  const describe = r => r ? `device ${r.deviceId}, relay ${r.relayUrl ?? 'none'}` : 'none';
  return function current() {
    let next;
    try {
      const stat = statSync(deviceFile(home), {bigint: true});
      next = `${stat.mtimeNs}:${stat.size}:${stat.ino}`;
    } catch (error) { next = `missing:${error.code}`; }
    if (next === stamp) return record;
    const first = stamp === undefined;
    stamp = next;
    const previous = record;
    try {
      const read = readDevice(home);
      record = read && {...read, ...credentialsOf(read)};
      if (!record) diagnostics(`${deviceFile(home)} is gone; every client is refused until this Mac is enrolled again`);
    } catch (error) {
      record = null;
      diagnostics(`${deviceFile(home)} could not be read (${error.code ?? error.message}); every client is refused until it can`);
    }
    if (!first && record) diagnostics(`device.json changed: credentials re-derived (${describe(record)}; was ${describe(previous)})`);
    return record;
  };
}

// --rotate also replaces a record that no longer reads as one.
function readDeviceForEnrol(home, rotate) {
  try { return readDevice(home); } catch (error) {
    if (rotate && error.code === 'remote_device_invalid') return null;
    throw error;
  }
}
