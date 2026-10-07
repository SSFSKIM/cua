// Secrets on Linux (issue #66; Phase F refused them): the store is the same file directory as on macOS, so a Linux
// connection resolves $HOME/.config/claude-secrets, secrets_list lists its keys, the launch hands the trusted worker the
// directory, and the trusted sky service substitutes a reference in the Linux type_text {window, text} shape. The
// last test is the whole path: a real connection on a Linux-host install (the fake upstream as its runtime).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {createSkyService} from '../src/services/sky.mjs';
import {fileStore} from '../src/secrets/store.mjs';
import {openConnection} from '../src/mcp/connection.mjs';
import {LINUX_HOST_NOTES} from '../src/mcp/surface.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};

function userHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'cua-linux-home-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const dir = join(home, '.config', 'claude-secrets');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  writeFileSync(join(dir, 'WORK_PASSWORD'), 'linux-value\n', {mode: 0o600});
  return {home, dir};
}

test('the trusted sky service on Linux reads the file store and types into the bound window', async t => {
  const {dir} = userHome(t);
  const received = [];
  const sky = createSkyService({platform: 'linux', secrets: fileStore({dir}), loadVendor: async () => ({handleRpc: async request => { received.push(request); }})});
  const window = {app: 'Gedit', focused: true, height: 600, id: 77, modal: false, title: 'notes', width: 800, x: 0, y: 0};
  await sky.handleRpc({type: 'execute', method: 'type_text', args: [{window, text: '{{secret:WORK_PASSWORD}}'}]});
  assert.deepEqual(received, [{type: 'execute', method: 'type_text', args: [{window, text: 'linux-value'}]}]);
});

test('a real Linux connection: Linux host notes, secrets_list lists the store, the launch names the directory', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const user = userHome(t);
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const env = {PATH: process.env.PATH, HOME: user.home, TMPDIR: process.env.TMPDIR, CUA_SHIM_SECRETS: 'on', DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000'};
  const connection = await openConnection({home, env, host: LINUX, sessionId: randomUUID(), input, output, diagnostics: () => {}});
  const reply = async id => { for (let i = 0; i < 400; i++) { const f = frames.find(m => m.id === id); if (f) return f; await new Promise(r => setTimeout(r, 25)); } throw new Error(`no reply ${id}`); };
  const send = msg => input.write(JSON.stringify({jsonrpc: '2.0', ...msg}) + '\n');
  send({id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'linux-test', version: '0'}}});
  assert.ok((await reply(1)).result.instructions.endsWith(LINUX_HOST_NOTES));
  send({id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}});
  assert.deepEqual((await reply(2)).result.structuredContent, {status: 'ok', labels: ['WORK_PASSWORD']});
  input.end();
  const closed = await connection.closed;
  assert.equal(closed.code, 0);
  const start = readFileSync(join(home, 'state', 'codex', 'fake-upstream.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse).find(e => e.start).start;
  const root = join(home, 'runtimes', '26.928.40906-linux-x64');
  assert.equal(start.env.CUA_SECRETS_DIR, user.dir);
  assert.equal('CUA_SECRETS_UNAVAILABLE' in start.env, false);
  assert.equal(start.env.OAI_SKY_LINUX_BIN, join(root, 'cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64'));
  assert.equal(start.env.CODEX_CLI_PATH, join(root, 'codex'));
  assert.equal(start.env.DISPLAY, ':0');
  assert.equal(start.env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');
  assert.equal('SKY_CUA_SERVICE_PATH' in start.env, false);
});
