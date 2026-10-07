// The client's device registry ($HOME/.config/cua/devices.json) and `cua devices add|remove|list|import`, against a
// temporary $HOME only: the owner's real registry and secret store are never read. The credential a client config
// carries is a sentinel here, and no output may contain it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';
import {
  DEVICE_NAME, addDevice, devicesFile, endpointOf, importDevice, normalizeRelayUrl, readDevices, removeDevice, suggestedDeviceName,
} from '../src/remote/devices.mjs';
import {clientSecretKey} from '../src/remote/device.mjs';
import {fileStore, storeDir} from '../src/secrets/store.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
const MINI = 'nuadM-MUKSbSN4L59EffLQ';
const MACBOOK = 'jMTkLnzn-rsbzoZAHJ8EbQ';
const RELAY = 'https://178-104-102-73.sslip.io';
const CREDENTIAL = 'c0ffee'.repeat(10) + 'beef';     // 64 hex characters, the shape of a client credential
const OTHER_CREDENTIAL = 'ab'.repeat(32);

function scratchHome(t) {
  const s = scratch();
  t.after(s.cleanup);
  return {home: s.dir, env: {HOME: s.dir}};
}
const refusal = fn => { try { fn(); } catch (error) { return error; } assert.fail('expected a refusal'); };
const asyncRefusal = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a refusal'); };
const clientConfig = ({deviceId = MINI, relay = RELAY, credential = CREDENTIAL, name = 'cua_repl', extra = {}} = {}) => ({
  mcpServers: {...extra, [name]: {type: 'http', url: `${relay}/d/${deviceId}/mcp`, headers: {Authorization: `Bearer ${credential}`}}},
});
function writeConfig(dir, file, config) {
  const path = join(dir, file);
  writeFileSync(path, typeof config === 'string' ? config : JSON.stringify(config), {mode: 0o600});
  return path;
}
const cua = (args, home) => spawnSync(process.execPath, [CLI, ...args], {
  env: {...process.env, HOME: home, CUA_HOME: join(home, 'cua-home')}, encoding: 'utf8', timeout: 30_000,
});

test('names are lowercase [a-z0-9][a-z0-9_-]{0,31}, and local is reserved for this machine', t => {
  const {env} = scratchHome(t);
  for (const name of ['mini', 'macbook', 'a', '0', 'lab-mac_2', 'x'.repeat(32)]) assert.ok(DEVICE_NAME.test(name), name);
  for (const name of ['', 'Mini', '-mini', '_mini', 'mini.lan', 'x'.repeat(33), 'mi ni', 'local/x']) assert.ok(!DEVICE_NAME.test(name), name);
  for (const name of ['local', 'Mini', '-x', '']) assert.equal(refusal(() => addDevice({env, name, relayUrl: RELAY, deviceId: MINI})).code, 'invalid_device_name', name);
});

test('a relay URL is stored as the relay origin: the enrolment\'s wss://<relay>/ws and https:// are accepted, ws/http only on a LAN', () => {
  assert.equal(normalizeRelayUrl('wss://178-104-102-73.sslip.io/ws'), RELAY);
  assert.equal(normalizeRelayUrl('https://178-104-102-73.sslip.io'), RELAY);
  assert.equal(normalizeRelayUrl('https://178-104-102-73.sslip.io/'), RELAY);
  assert.equal(normalizeRelayUrl('wss://Relay.Example:8443/ws'), 'https://relay.example:8443');
  assert.equal(normalizeRelayUrl('https://relay.example:443'), 'https://relay.example');
  for (const [lan, origin] of [
    ['ws://127.0.0.1:7800/ws', 'http://127.0.0.1:7800'], ['http://localhost:7800', 'http://localhost:7800'],
    ['http://192.168.1.20:7800', 'http://192.168.1.20:7800'], ['ws://10.0.0.5/ws', 'http://10.0.0.5'],
    ['http://172.16.3.4:7800', 'http://172.16.3.4:7800'], ['http://100.101.102.103:7800', 'http://100.101.102.103:7800'],
    ['http://mini.local:7800', 'http://mini.local:7800'], ['http://relay:7800', 'http://relay:7800'],
    ['http://[fd00::1]:7800', 'http://[fd00::1]:7800'], ['http://[::1]:7800', 'http://[::1]:7800'],
  ]) assert.equal(normalizeRelayUrl(lan), origin, lan);
  for (const bad of [
    'http://relay.example', 'ws://relay.example/ws', 'http://8.8.8.8:7800', 'http://172.32.0.1',   // clear text off the LAN
    'ftp://relay.example', 'relay.example', '', 42, null,
    'https://relay.example/d/x/mcp', 'https://relay.example/prefix', 'https://relay.example/ws', 'wss://relay.example/other',
    'https://relay.example/?q=1', 'https://relay.example/#x', 'https://user:pw@relay.example', 'https://a$b.example',
  ]) assert.throws(() => normalizeRelayUrl(bad), {code: 'invalid_relay_url'}, String(bad));
  assert.equal(endpointOf({deviceId: MINI, relayUrl: RELAY}), `${RELAY}/d/${MINI}/mcp`);
});

test('add writes a private registry of exactly {name: {deviceId, relayUrl}}; the same entry again changes nothing; another needs replace', t => {
  const {home, env} = scratchHome(t);
  assert.equal(devicesFile(env), join(home, '.config', 'cua', 'devices.json'));
  assert.deepEqual(readDevices({env}), {});
  assert.deepEqual(addDevice({env, name: 'mini', relayUrl: 'wss://178-104-102-73.sslip.io/ws', deviceId: MINI}),
    {name: 'mini', deviceId: MINI, relayUrl: RELAY, entry: 'added'});
  assert.equal(statSync(devicesFile(env)).mode & 0o777, 0o600);
  assert.equal(statSync(join(home, '.config', 'cua')).mode & 0o777, 0o700);
  addDevice({env, name: 'macbook', relayUrl: RELAY, deviceId: MACBOOK});
  assert.deepEqual(JSON.parse(readFileSync(devicesFile(env), 'utf8')), {
    macbook: {deviceId: MACBOOK, relayUrl: RELAY}, mini: {deviceId: MINI, relayUrl: RELAY},
  });
  assert.equal(addDevice({env, name: 'mini', relayUrl: RELAY, deviceId: MINI}).entry, 'unchanged');
  const other = 'A'.repeat(21) + 'Q';
  const conflict = refusal(() => addDevice({env, name: 'mini', relayUrl: RELAY, deviceId: other}));
  assert.equal(conflict.code, 'device_exists');
  assert.match(conflict.hint, /--replace/);
  assert.equal(readDevices({env}).mini.deviceId, MINI);
  assert.equal(addDevice({env, name: 'mini', relayUrl: RELAY, deviceId: other, replace: true}).entry, 'replaced');
  assert.equal(readDevices({env}).mini.deviceId, other);
});

test('add refuses a device id that is not an enrolment\'s (16 bytes base64url) and a bad relay URL, writing nothing', t => {
  const {env} = scratchHome(t);
  for (const deviceId of ['', 'short', MINI + 'x', MINI.slice(0, -1) + '=', 'nuadM+MUKSbSN4L59EffLQ', 42, undefined])
    assert.equal(refusal(() => addDevice({env, name: 'mini', relayUrl: RELAY, deviceId})).code, 'invalid_device_id', String(deviceId));
  assert.equal(refusal(() => addDevice({env, name: 'mini', relayUrl: 'http://relay.example', deviceId: MINI})).code, 'invalid_relay_url');
  assert.equal(existsSync(devicesFile(env)), false);
  const id = randomBytes(16).toString('base64url');
  assert.equal(addDevice({env, name: 'x', relayUrl: RELAY, deviceId: id}).deviceId, id);
});

test('remove drops the registry entry only; an unknown name is device_unknown', t => {
  const {env} = scratchHome(t);
  addDevice({env, name: 'mini', relayUrl: RELAY, deviceId: MINI});
  assert.deepEqual(removeDevice({env, name: 'mini'}), {name: 'mini', deviceId: MINI, relayUrl: RELAY});
  assert.deepEqual(readDevices({env}), {});
  assert.equal(refusal(() => removeDevice({env, name: 'mini'})).code, 'device_unknown');
  assert.equal(refusal(() => removeDevice({env, name: 'local'})).code, 'device_unknown');
});

test('a registry that is not JSON or not the shape is devices_invalid, and nothing is written over it', t => {
  const {env} = scratchHome(t);
  mkdirSync(join(env.HOME, '.config', 'cua'), {recursive: true});
  for (const text of [
    'not json', '[]', 'null', '{"mini": "x"}', `{"Mini": {"deviceId": "${MINI}", "relayUrl": "${RELAY}"}}`,
    `{"local": {"deviceId": "${MINI}", "relayUrl": "${RELAY}"}}`, `{"mini": {"deviceId": "bad", "relayUrl": "${RELAY}"}}`,
    `{"mini": {"deviceId": "${MINI}", "relayUrl": "wss://178-104-102-73.sslip.io/ws"}}`,
    `{"mini": {"deviceId": "${MINI}", "relayUrl": "${RELAY}", "credential": "x"}}`, `{"mini": {"deviceId": "${MINI}"}}`,
  ]) {
    writeFileSync(devicesFile(env), text);
    assert.equal(refusal(() => readDevices({env})).code, 'devices_invalid', text);
    assert.equal(refusal(() => addDevice({env, name: 'macbook', relayUrl: RELAY, deviceId: MACBOOK})).code, 'devices_invalid', text);
    assert.equal(readFileSync(devicesFile(env), 'utf8'), text);
  }
});

test('import reads today\'s client config, stores the credential under the device\'s key and registers it under the file\'s name', async t => {
  const {home, env} = scratchHome(t);
  const store = fileStore({dir: storeDir(env)});
  const file = writeConfig(home, 'mini.mcp.json', clientConfig());
  const key = clientSecretKey(MINI);
  assert.deepEqual(await importDevice({env, file}), {name: 'mini', deviceId: MINI, relayUrl: RELAY, entry: 'added', credential: 'stored'});
  assert.equal(await store.read(key), CREDENTIAL);
  assert.equal(statSync(join(storeDir(env), key)).mode & 0o777, 0o600);
  assert.deepEqual(readDevices({env}), {mini: {deviceId: MINI, relayUrl: RELAY}});

  // Again: nothing changes. A rotated credential in the same file replaces the stored one; the entry stays.
  assert.deepEqual(await importDevice({env, file}), {name: 'mini', deviceId: MINI, relayUrl: RELAY, entry: 'unchanged', credential: 'unchanged'});
  writeConfig(home, 'mini.mcp.json', clientConfig({credential: OTHER_CREDENTIAL}));
  assert.equal((await importDevice({env, file})).credential, 'replaced');
  assert.equal(await store.read(key), OTHER_CREDENTIAL);

  // --name, a .json basename, and a lone server entry under another name.
  const lone = writeConfig(home, 'macbook.json', clientConfig({deviceId: MACBOOK, name: 'remote'}));
  assert.equal((await importDevice({env, file: lone})).name, 'macbook');
  assert.equal((await importDevice({env, file: lone, name: 'book', store})).name, 'book');
  assert.equal(await store.read(clientSecretKey(MACBOOK)), CREDENTIAL);
});

test('import refuses a name that holds another device before storing anything, unless replace', async t => {
  const {home, env} = scratchHome(t);
  addDevice({env, name: 'mini', relayUrl: RELAY, deviceId: MACBOOK});
  const file = writeConfig(home, 'mini.mcp.json', clientConfig());
  const store = fileStore({dir: storeDir(env)});
  assert.equal((await asyncRefusal(importDevice({env, file}))).code, 'device_exists');
  assert.deepEqual(await store.list(), []);
  assert.equal((await importDevice({env, file, replace: true})).entry, 'replaced');
  assert.equal(readDevices({env}).mini.deviceId, MINI);
});

test('import refuses a file it cannot use, classified, without the credential in any refusal', async t => {
  const {home, env} = scratchHome(t);
  const cases = {
    'missing.mcp.json': null,
    'notjson.mcp.json': `{"mcpServers": {"cua_repl": {"headers": {"Authorization": "Bearer ${CREDENTIAL}"`,
    'noservers.mcp.json': {servers: {}},
    'two.mcp.json': clientConfig({name: 'a', extra: {b: clientConfig().mcpServers.cua_repl}}),
    'stdio.mcp.json': {mcpServers: {cua_repl: {command: 'node', args: ['x'], env: {TOKEN: CREDENTIAL}}}},
    'path.mcp.json': {mcpServers: {cua_repl: {type: 'http', url: `${RELAY}/mcp`, headers: {Authorization: `Bearer ${CREDENTIAL}`}}}},
    'badid.mcp.json': clientConfig({deviceId: 'short'}),
    'clear.mcp.json': clientConfig({relay: 'http://relay.example'}),
    'noauth.mcp.json': {mcpServers: {cua_repl: {type: 'http', url: `${RELAY}/d/${MINI}/mcp`}}},
    'envvar.mcp.json': clientConfig({credential: '${MINI_TOKEN}'}),
    'notbearer.mcp.json': {mcpServers: {cua_repl: {type: 'http', url: `${RELAY}/d/${MINI}/mcp`, headers: {Authorization: CREDENTIAL}}}},
  };
  const codes = {};
  for (const [file, config] of Object.entries(cases)) {
    const path = config === null ? join(home, file) : writeConfig(home, file, config);
    const error = await asyncRefusal(importDevice({env, file: path}));
    codes[file] = error.code;
    for (const text of [error.message, error.hint ?? '', JSON.stringify(error)]) assert.ok(!text.includes(CREDENTIAL), `${file} exposed the credential`);
  }
  assert.deepEqual(codes, {
    'missing.mcp.json': 'client_config_unreadable', 'notjson.mcp.json': 'invalid_client_config', 'noservers.mcp.json': 'invalid_client_config',
    'two.mcp.json': 'invalid_client_config', 'stdio.mcp.json': 'invalid_client_config', 'path.mcp.json': 'invalid_client_config',
    'badid.mcp.json': 'invalid_client_config', 'clear.mcp.json': 'invalid_relay_url', 'noauth.mcp.json': 'invalid_client_config',
    'envvar.mcp.json': 'invalid_client_config', 'notbearer.mcp.json': 'invalid_client_config',
  });
  assert.equal(existsSync(storeDir(env)), false);
  assert.equal(existsSync(devicesFile(env)), false);
  const named = writeConfig(home, 'Mini Mac.mcp.json', clientConfig());
  assert.equal((await asyncRefusal(importDevice({env, file: named}))).code, 'invalid_device_name');
});

test('the name a client is offered for a device comes from its host name, within the name rule', () => {
  assert.equal(suggestedDeviceName('Seans-Mac-mini.local'), 'seans-mac-mini');
  assert.equal(suggestedDeviceName('cua-linux'), 'cua-linux');
  assert.equal(suggestedDeviceName('My MacBook Pro (2)'), 'my-macbook-pro-2');
  assert.equal(suggestedDeviceName('_x'), 'x');
  assert.equal(suggestedDeviceName('x'.repeat(40)), 'x'.repeat(32));
  for (const odd of ['', 'local', 'localhost', '...', 'é']) assert.ok(DEVICE_NAME.test(suggestedDeviceName(odd)) && !['local', ''].includes(suggestedDeviceName(odd)), odd);
});

test('cua devices import, list, add and remove print names, ids, relays and credential presence, never the credential', t => {
  const {home} = scratchHome(t);
  const file = writeConfig(home, 'mini.mcp.json', clientConfig());
  const key = clientSecretKey(MINI);
  const outputs = [];
  const run = (args, status = 0) => {
    const r = cua(args, home);
    assert.equal(r.status, status, `${args.join(' ')}: ${r.stderr}`);
    outputs.push(r);
    return r;
  };

  const imported = JSON.parse(run(['devices', 'import', file, '--json']).stdout);
  assert.deepEqual(imported, {ok: true, name: 'mini', deviceId: MINI, relayUrl: RELAY, entry: 'added', clientSecretKey: key, credential: 'stored'});
  assert.match(run(['devices', 'import', file]).stdout, /mini.*unchanged/s);

  const added = run(['devices', 'add', 'macbook', '--relay', 'wss://178-104-102-73.sslip.io/ws', `--device=${MACBOOK}`]);
  assert.match(added.stdout, /macbook/);
  assert.match(added.stderr, new RegExp(`${clientSecretKey(MACBOOK)}.*/secret ${clientSecretKey(MACBOOK)}`, 's'), 'warns that the credential is absent, naming the /secret step');
  assert.equal(run(['devices', 'add', 'macbook', '--relay', RELAY, '--device', MINI], 1).stderr.includes('device_exists'), true);

  const listed = JSON.parse(run(['devices', 'list', '--json']).stdout);
  assert.deepEqual(listed, {ok: true, devices: [
    {name: 'macbook', deviceId: MACBOOK, relayUrl: RELAY, clientSecretKey: clientSecretKey(MACBOOK), credentialStored: false},
    {name: 'mini', deviceId: MINI, relayUrl: RELAY, clientSecretKey: key, credentialStored: true},
  ]});
  const text = run(['devices', 'list']).stdout;
  assert.match(text, /^macbook\s+jMTkLnzn-rsbzoZAHJ8EbQ\s+https:\/\/178-104-102-73\.sslip\.io\s+credential missing$/m);
  assert.match(text, /^mini\s+nuadM-MUKSbSN4L59EffLQ\s+https:\/\/178-104-102-73\.sslip\.io\s+credential stored$/m);

  const removed = JSON.parse(run(['devices', 'remove', 'mini', '--json']).stdout);
  assert.deepEqual(removed, {ok: true, name: 'mini', deviceId: MINI, relayUrl: RELAY, clientSecretKey: key});
  assert.match(run(['devices', 'remove', 'mini'], 1).stderr, /device_unknown/);
  assert.equal(readFileSync(join(home, '.config', 'claude-secrets', key), 'utf8'), CREDENTIAL, 'the stored credential stays');
  assert.deepEqual(JSON.parse(run(['secrets', 'list', '--json']).stdout).labels, [key], 'the owner\'s secrets list still shows reserved keys');

  for (const r of outputs) assert.ok(!(r.stdout + r.stderr).includes(CREDENTIAL), 'no output carries the credential');
});

test('cua devices usage errors exit 2 without repeating what was passed', t => {
  const {home} = scratchHome(t);
  for (const args of [
    ['devices'], ['devices', 'nope'], ['devices', 'add', 'mini'], ['devices', 'add', 'mini', '--relay', RELAY],
    ['devices', 'add', '--relay', RELAY, '--device', MINI], ['devices', 'list', CREDENTIAL], ['devices', 'remove'],
    ['devices', 'import'], ['devices', 'import', 'a', 'b'], ['devices', 'add', 'mini', '--relay', RELAY, '--device', MINI, `--${CREDENTIAL}`],
  ]) {
    const r = cua(args, home);
    assert.equal(r.status, 2, args.join(' '));
    assert.ok(!r.stderr.includes(CREDENTIAL), `${args.join(' ')} repeated its input`);
  }
  assert.match(cua(['help'], home).stdout, /devices add <name> --relay <url> --device <id>/);
});
