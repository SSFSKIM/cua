// Secrets on Linux (Phase F): there is no Linux secrets backend. A connection opens no broker and says why
// (secrets_unsupported_platform), secrets_list reports it, a {{secret:…}} reference in any shape (the Linux type_text
// shape included) is refused with that code before the vendor is reached, and `cua secrets` refuses with it too. The
// last test is the whole path: a real connection on a Linux-host install (the fake upstream as its runtime).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {openSecrets} from '../src/secrets/broker.mjs';
import {runSecrets} from '../src/secrets/commands.mjs';
import {createSkyService} from '../src/services/sky.mjs';
import {createBrowserService, PINNED_VENDOR_VERSION} from '../src/services/browser.mjs';
import {openConnection} from '../src/mcp/connection.mjs';
import {LINUX_HOST_NOTES} from '../src/mcp/surface.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};
const UNSUPPORTED = 'secrets_unsupported_platform';
const never = what => async () => { throw new Error(`${what} must not be used`); };
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

test('a Linux connection starts no broker and reports secrets_unsupported_platform, whatever the setting or helper', async () => {
  for (const enabled of [true, false]) {
    const secrets = await openSecrets({host: LINUX, enabled, helper: {built: true, path: '/must/not/run'}, home: '/nonexistent', sessionId: 'x'});
    assert.equal(secrets.broker, undefined);
    assert.equal(secrets.unavailable.code, UNSUPPORTED);
    assert.match(secrets.unavailable.message, /no secrets backend on linux/);
    assert.deepEqual(await secrets.close(), {confirmed: true, steps: []});
  }
});

test('the trusted sky and browser services refuse any secret reference on Linux with that code, before the vendor loads', async () => {
  const sky = createSkyService({loadVendor: never('the vendor sky service'), secrets: {read: never('the broker')}, secretsUnavailable: UNSUPPORTED});
  const requests = [
    {type: 'execute', method: 'type_text', args: [{window: 12, text: '{{secret:work-password}}'}]},
    {type: 'execute', method: 'type_text', args: [{app: 'gedit', text: '{{secret:work-password}}'}]},
    {type: 'execute', method: 'paste', args: [{app: 'gedit', text: '{{secret:bad label}}'}]},
  ];
  for (const request of requests) {
    const error = await rejection(sky.handleRpc(request));
    assert.equal(error.code, UNSUPPORTED, JSON.stringify(request));
    assert.match(error.message, /nothing was entered/);
  }
  const browser = createBrowserService({loadVendor: never('the vendor browser service'), vendorVersion: async () => PINNED_VENDOR_VERSION, secrets: {read: never('the broker')}, secretsUnavailable: UNSUPPORTED});
  const fill = {method: 'executeWithRecovery', params: {type: 'playwright_locator_fill', browser_id: '2', tab_id: '17', selector: 'internal:label="Password"s', value: '{{secret:work-password}}', replace: true, timeout_ms: 10000}};
  assert.equal((await rejection(browser.handleRpc(fill))).code, UNSUPPORTED);
});

test('cua secrets set, list and remove refuse on Linux without running a helper', async () => {
  const deps = {helper: {path: '/built/cua-keychain', built: true}, interactive: never('the helper'), captured: never('the helper'), print: () => {}, note: () => {}};
  for (const command of ['set', 'list', 'remove']) {
    const error = await rejection(runSecrets({command, label: 'k', host: LINUX}, deps));
    assert.equal(error.code, UNSUPPORTED, command);
  }
});

test('a real Linux connection: Linux host notes, secrets_list unavailable with the code, and the Linux launch environment', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const env = {PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, CUA_SHIM_SECRETS: 'on', DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000'};
  const connection = await openConnection({home, env, host: LINUX, sessionId: randomUUID(), input, output, diagnostics: () => {},
    keychainHelper: {built: true, path: '/must/not/run'}});
  const reply = async id => { for (let i = 0; i < 400; i++) { const f = frames.find(m => m.id === id); if (f) return f; await new Promise(r => setTimeout(r, 25)); } throw new Error(`no reply ${id}`); };
  const send = msg => input.write(JSON.stringify({jsonrpc: '2.0', ...msg}) + '\n');
  send({id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'linux-test', version: '0'}}});
  assert.ok((await reply(1)).result.instructions.endsWith(LINUX_HOST_NOTES));
  send({id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}});
  assert.deepEqual((await reply(2)).result.structuredContent, {status: 'unavailable', code: UNSUPPORTED});
  input.end();
  const closed = await connection.closed;
  assert.equal(closed.code, 0);
  const start = readFileSync(join(home, 'state', 'codex', 'fake-upstream.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse).find(e => e.start).start;
  const root = join(home, 'runtimes', '26.928.40906-linux-x64');
  assert.equal(start.env.CUA_SECRETS_UNAVAILABLE, UNSUPPORTED);
  assert.equal(start.env.OAI_SKY_LINUX_BIN, join(root, 'cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64'));
  assert.equal(start.env.CODEX_CLI_PATH, join(root, 'codex'));
  assert.equal(start.env.DISPLAY, ':0');
  assert.equal(start.env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');
  assert.equal('SKY_CUA_SERVICE_PATH' in start.env, false);
});
