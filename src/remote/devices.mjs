// The client's device registry: the remote devices this machine's `cua serve` can switch its target to (devices_use),
// in $HOME/.config/cua/devices.json, mode 0600 in a 0700 directory, exactly {"<name>": {"deviceId", "relayUrl"}}.
// `relayUrl` is the relay's origin; a device's endpoint is <relayUrl>/d/<deviceId>/mcp (src/remote/device.mjs
// relayEndpoint is the same URL seen from the device). The credential is not here: it is the secret store's
// CUA_DEVICE_<id> (clientSecretKey), which the server process reads and the model never sees (src/secrets/label.mjs).
// `importDevice` turns today's standalone client config (`claude mcp add --transport http cua_repl …`'s shape) into
// a registry entry and a stored credential. Nothing here returns, logs or throws a credential.
import {randomUUID} from 'node:crypto';
import {chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {CuaError, fail} from '../runtime/errors.mjs';
import {fileStore, SecretStoreError, storeDir} from '../secrets/store.mjs';
import {clientSecretKey, credentialMatches, isDeviceId, PLAIN_HOST} from './device.mjs';

export const DEVICE_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;          // 'local' reserved
export const LOCAL = 'local';
export const devicesFile = (env = process.env) => join(env.HOME || homedir(), '.config', 'cua', 'devices.json');
export const endpointOf = ({deviceId, relayUrl}) => `${relayUrl}/d/${deviceId}/mcp`;

const NAME_RULE = `names are lowercase letters, digits, '-' and '_' (up to 32, starting with a letter or digit), and "${LOCAL}" is this machine`;
const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const isDeviceName = name => typeof name === 'string' && DEVICE_NAME.test(name) && name !== LOCAL;

// A host on this machine or its local network: loopback, the private, link-local and shared (CGNAT, Tailscale) IPv4
// ranges, IPv6 unique-local and link-local, `.local` (mDNS) and single-label names. Only such a relay may be reached
// over http, where the client credential crosses the network in clear.
function isLanHost(host) {
  if (host === 'localhost' || host.endsWith('.local') || (!host.includes('.') && !host.startsWith('['))) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = /^\[(.*)\]$/.exec(host)?.[1];
  return v6 !== undefined && (v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6));
}

const ORIGIN_SCHEME = {'https:': 'https:', 'wss:': 'https:', 'http:': 'http:', 'ws:': 'http:'};

// The relay's origin, 'https://host[:port]' (http for a LAN relay): from https:// or the enrolment's wss://<relay>/ws
// (ws/http only for a LAN host). Anything that is not a bare relay address is refused: a path other than the WebSocket's
// /ws, a query, a fragment, user info, a host that is not a plain name or address.
export function normalizeRelayUrl(relayUrl) {
  let url;
  try { url = new URL(relayUrl); } catch {}
  const scheme = ORIGIN_SCHEME[url?.protocol];
  const paths = url?.protocol === 'wss:' || url?.protocol === 'ws:' ? ['/', '/ws'] : ['/'];
  if (!scheme || !paths.includes(url.pathname) || url.search || url.hash || url.username || url.password || !PLAIN_HOST.test(url.hostname)
    || (scheme === 'http:' && !isLanHost(url.hostname)))
    fail('invalid_relay_url', `the relay URL must be https://<relay> or the enrolment's wss://<relay>/ws (http or ws only on this machine's network), on a plain host name or address, with no other path`, {hint: 'cua remote show on the device prints its relay URL'});
  return `${scheme}//${url.host}`;
}

function invalidRegistry(env, why) {
  fail('devices_invalid', `${devicesFile(env)} is not a device registry (${why})`, {hint: `fix or remove the file; it is {"<name>": {"deviceId": "…", "relayUrl": "https://<relay>"}} and cua devices add rewrites it`});
}

function sameOrigin(relayUrl) {
  try { return normalizeRelayUrl(relayUrl) === relayUrl; } catch { return false; }
}

// The registry as it is on disk: no file → {}; not JSON, or not exactly the shape → devices_invalid.
export function readDevices({env = process.env} = {}) {
  let text;
  try { text = readFileSync(devicesFile(env), 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return {};
    fail('devices_invalid', `${devicesFile(env)} could not be read (${error.code ?? 'error'})`);
  }
  let devices;
  try { devices = JSON.parse(text); } catch { invalidRegistry(env, 'not JSON'); }
  if (!isPlainObject(devices)) invalidRegistry(env, 'not an object of devices');
  for (const [name, entry] of Object.entries(devices)) {
    if (!isDeviceName(name)) invalidRegistry(env, `${JSON.stringify(name)} is not a device name: ${NAME_RULE}`);
    const keys = isPlainObject(entry) ? Object.keys(entry).sort().join(',') : null;
    if (keys !== 'deviceId,relayUrl' || !isDeviceId(entry.deviceId) || typeof entry.relayUrl !== 'string' || !sameOrigin(entry.relayUrl))
      invalidRegistry(env, `${name} is not {deviceId, relayUrl} with an enrolment's device id and a relay origin`);
  }
  return devices;
}

// Write-then-rename into the private directory, names sorted: readers see the old registry or the new one.
function writeDevices(env, devices) {
  const file = devicesFile(env);
  mkdirSync(dirname(file), {recursive: true, mode: 0o700});
  chmodSync(dirname(file), 0o700);
  const sorted = Object.fromEntries(Object.keys(devices).sort().map(name => [name, devices[name]]));
  const temp = join(dirname(file), `.devices.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, JSON.stringify(sorted, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}

// What adding `name` would do, checked against the registry as it is, without writing: the registry with the entry in
// place and whether the entry is added, unchanged (the same device on the same relay) or replaced (only with replace).
function planAdd({env, name, relayUrl, deviceId, replace}) {
  if (!isDeviceName(name)) fail('invalid_device_name', `that is not a device name: ${NAME_RULE}`, {hint: 'name it as cua devices add <name> …, or cua devices import <file> --name <name>'});
  if (!isDeviceId(deviceId)) fail('invalid_device_id', 'the device id is not one an enrolment mints (16 bytes, base64url: 22 characters of A-Z a-z 0-9 - _)', {hint: 'cua remote show on the device prints its id'});
  const origin = normalizeRelayUrl(relayUrl);
  const devices = readDevices({env});
  const existing = Object.hasOwn(devices, name) ? devices[name] : null;
  const entry = {deviceId, relayUrl: origin};
  if (existing && existing.deviceId === deviceId && existing.relayUrl === origin) return {devices, entry, outcome: 'unchanged'};
  if (existing && !replace)
    fail('device_exists', `${name} is already registered (device ${existing.deviceId} on ${existing.relayUrl})`, {hint: 'pass --replace to point it at this device, or choose another name'});
  return {devices: {...devices, [name]: entry}, entry, outcome: existing ? 'replaced' : 'added'};
}

export function addDevice({env = process.env, name, relayUrl, deviceId, replace = false}) {
  const {devices, entry, outcome} = planAdd({env, name, relayUrl, deviceId, replace});
  if (outcome !== 'unchanged') writeDevices(env, devices);
  return {name, ...entry, entry: outcome};
}

export function removeDevice({env = process.env, name}) {
  const devices = readDevices({env});
  // Only a well-formed name is repeated: anything else may be a credential pasted in the wrong place.
  if (!isDeviceName(name) || !Object.hasOwn(devices, name))
    fail('device_unknown', isDeviceName(name) ? `no device is registered as "${name}"` : `no device is registered under that name (${NAME_RULE})`, {hint: 'cua devices list shows the registered names'});
  const {[name]: removed, ...rest} = devices;
  writeDevices(env, rest);
  return {name, ...removed};
}

const BEARER = /^Bearer ([0-9a-f]{64})$/;
const ENDPOINT_PATH = /^\/d\/([A-Za-z0-9_-]+)\/mcp$/;

// Today's client config: {"mcpServers": {"cua_repl": {"type": "http", "url": "<relay>/d/<id>/mcp", "headers":
// {"Authorization": "Bearer <credential>"}}}}, or a lone server entry under another name. Refusals name the file and
// what is wrong, never a header value.
function readClientConfig(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (error) {
    fail('client_config_unreadable', `${file} could not be read (${error.code ?? 'error'})`);
  }
  const invalid = why => fail('invalid_client_config', `${file} is not a cua client config: ${why}`, {hint: 'it is the file a standalone client registers with: {"mcpServers": {"cua_repl": {"type": "http", "url": "https://<relay>/d/<id>/mcp", "headers": {"Authorization": "Bearer <client credential>"}}}}; otherwise store the credential with /secret and use cua devices add'});
  let config;
  try { config = JSON.parse(text); } catch { invalid('not JSON'); }
  const servers = config?.mcpServers;
  if (!isPlainObject(servers)) invalid('it has no mcpServers');
  const names = Object.keys(servers);
  if (!names.length) invalid('its mcpServers is empty');
  const server = Object.hasOwn(servers, 'cua_repl') ? servers.cua_repl : names.length === 1 ? servers[names[0]] : invalid('it names no cua_repl server and more than one other');
  if (!isPlainObject(server) || server.type !== 'http' || typeof server.url !== 'string') invalid('its server is not an http server with a url');
  let url;
  try { url = new URL(server.url); } catch { invalid('its url is not a URL'); }
  const deviceId = ENDPOINT_PATH.exec(url.pathname)?.[1];
  if (!deviceId || url.search || url.hash || url.username || url.password) invalid('its url is not a relay endpoint <relay>/d/<device id>/mcp');
  if (!isDeviceId(deviceId)) invalid('its url does not name an enrolment\'s device id');
  const headers = isPlainObject(server.headers) ? server.headers : {};
  const authorization = Object.entries(headers).filter(([name]) => name.toLowerCase() === 'authorization').map(([, value]) => value);
  const credential = authorization.length === 1 && typeof authorization[0] === 'string' ? BEARER.exec(authorization[0])?.[1] : undefined;
  if (!credential) invalid('its Authorization header is not "Bearer " and a client credential (64 hex characters, as cua remote enroll prints it)');
  return {deviceId, relayUrl: normalizeRelayUrl(`${url.protocol}//${url.host}`), credential};
}

const nameOfFile = file => basename(file).replace(/\.mcp\.json$|\.json$/, '');

// Stores the credential under the device's key unless the same value is already there.
async function storeCredential(store, key, credential) {
  let existing = null;
  try { existing = await store.read(key); } catch (error) {
    if (!(error instanceof SecretStoreError)) throw error;
    if (error.code !== 'not_found') existing = undefined;     // unsafe or unreadable: the write replaces it
  }
  if (typeof existing === 'string' && credentialMatches(existing, credential)) return 'unchanged';
  try { await store.write(key, credential); } catch (error) {
    throw new CuaError('secret_store_unwritable', `the credential could not be stored under ${key} (${error.code ?? 'error'})`);
  }
  return existing === null ? 'stored' : 'replaced';
}

// Registers the device a client config reaches and stores its credential: the registry is checked first, so a refused
// import stores nothing.
export async function importDevice({env = process.env, file, name, replace = false, store = fileStore({dir: storeDir(env)})}) {
  const {deviceId, relayUrl, credential} = readClientConfig(file);
  const entryName = name ?? nameOfFile(file);
  planAdd({env, name: entryName, relayUrl, deviceId, replace});
  const stored = await storeCredential(store, clientSecretKey(deviceId), credential);
  return {...addDevice({env, name: entryName, relayUrl, deviceId, replace}), credential: stored};
}

// Whether a device's credential is in the store, from the key listing (no value is read); null when the store cannot be
// listed.
export async function credentialStored(store, deviceId) {
  try { return (await store.list()).includes(clientSecretKey(deviceId)); } catch { return null; }
}

// The name a device's `cua devices add` line offers a client: its host name's first label, within the name rule.
export function suggestedDeviceName(hostname) {
  const name = String(hostname).split('.')[0].toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+/, '').slice(0, 32).replace(/-+$/, '');
  return isDeviceName(name) ? name : 'device';
}
