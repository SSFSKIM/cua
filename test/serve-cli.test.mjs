// `cua serve` and the plugin's `cua-shim.mjs` end to end, as real processes, against a scratch CUA_HOME whose
// "installed" release runs a fake upstream in place of the vendor runtime. This proves the server consumes the actual
// resolver and launcher: allowlisted environment, owned per-connection working directory, and cleanup at close.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync, realpathSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {loadPins, selectPin} from '../src/runtime/manifest.mjs';
import {PassThrough} from 'node:stream';
import {REPO, scratch, shortScratch} from './fixtures/runtime-fixture.mjs';
import {serve} from '../src/mcp/server.mjs';

const supported = process.platform === 'darwin' && process.arch === 'arm64';
const FAKE = join(REPO, 'test', 'fixtures', 'fake-upstream-process.mjs');

// A home that looks like a verified install of the checked-in pin to the resolver (which checks structure only), but
// whose vendor node is this Node and whose cua-repl entry is the fake upstream. Signatures are never involved here.
// The served processes run with CUA_SHIM_SECRETS=off: the real Keychain helper (if built) is never started by this
// Node-only suite; the in-process test at the end wires a stand-in helper instead.
function fakeInstalledHome(t, {short = false} = {}) {
  const s = short ? shortScratch() : scratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const pin = selectPin(loadPins());
  const root = join(home, 'runtimes', pin.release);
  for (const [key, rel] of Object.entries(pin.layout)) {
    const path = join(root, rel);
    if (key === 'moduleDir' || key === 'skyServiceApp') { mkdirSync(path, {recursive: true}); continue; }
    mkdirSync(dirname(path), {recursive: true});
    if (key === 'node') symlinkSync(process.execPath, path);
    else if (key === 'cuaRepl') writeFileSync(path, `import ${JSON.stringify(pathToFileURL(FAKE).href)};\n`);
    else writeFileSync(path, '');
  }
  writeFileSync(join(root, 'install.json'), JSON.stringify({schema: 1, release: pin.release, archive: {sha256: pin.archive.sha256, length: pin.archive.length}}));
  writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: pin.release}));
  return home;
}

function launch(entry, home, args = []) {
  const child = spawn(process.execPath, [entry, ...args], {
    env: {...process.env, CUA_HOME: home, CUA_SHIM_SECRETS: 'off', AMBIENT_SECRET: 'must-not-reach-runtime', NODE_REPL_TRUSTED_SERVICES: '{"sky":"/evil.mjs"}', CUA_SHIM_CODEX_HOME: '/tmp/legacy'},
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const frames = [];
  const waiters = [];
  createInterface({input: child.stdout}).on('line', line => {
    const msg = JSON.parse(line);
    frames.push(msg);
    for (const w of [...waiters]) if (w.id === msg.id) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const exit = new Promise(resolve => child.on('exit', (code, signal) => {
    // A request still waiting when the server exits fails now rather than at its timeout.
    setImmediate(() => { for (const w of waiters.splice(0)) w.reject(new Error(`server exited (${code ?? signal}); stderr: ${stderr}`)); });
    resolve({code, signal, stderr});
  }));
  let id = 0;
  const request = (method, params = {}) => {
    const n = ++id;
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no response to ${method}; stderr: ${stderr}`)), 10_000);
      waiters.push({id: n, resolve: m => { clearTimeout(timer); resolve(m); }, reject: e => { clearTimeout(timer); reject(e); }});
    });
  };
  const call = (name, args = {}) => request('tools/call', {name, arguments: args});
  return {child, frames, exit, request, call};
}

const records = home => readFileSync(join(home, 'state', 'codex', 'fake-upstream.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

test('cua serve without an installed runtime fails classified, writing nothing to the MCP stream', {skip: !supported}, async t => {
  const s = scratch();
  t.after(s.cleanup);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), s.dir, ['serve']);
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 1);
  assert.match(stderr, /runtime_not_installed/);
  assert.deepEqual(server.frames, []);
});

test('cua serve runs the resolved runtime with an allowlisted environment in an owned directory and removes it at close', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  const init = await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  assert.equal(init.result.serverInfo.name, 'fake-upstream');
  assert.match(init.result.instructions, /Host notes/);
  const list = await server.request('tools/list');
  assert.deepEqual(list.result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  const js = await server.call('js', {code: 'hello'});
  const echoed = JSON.parse(js.result.content[0].text);
  assert.equal(echoed.code, 'hello');
  const end = await server.call('end_task');
  assert.deepEqual(end.result.structuredContent, {status: 'ended', ended: true, taskId: echoed.turn.turn_id});

  const [{start}] = records(home);
  const sessionDir = start.cwd;
  assert.equal(dirname(sessionDir), join(home, 'run'));
  assert.equal(start.cwdMode, 0o700);
  assert.equal(start.env.CODEX_HOME, join(home, 'state', 'codex'));
  assert.equal(start.env.CUA_REPL_ENABLED_SURFACES, 'computer');
  assert.equal(start.env.AMBIENT_SECRET, undefined);
  assert.equal(start.env.CUA_SHIM_CODEX_HOME, undefined);
  assert.equal(start.env.NODE_REPL_TRUSTED_SERVICES, undefined);
  assert.equal(start.env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  assert.equal(Object.keys(start.env).some(key => key.startsWith('CUA_SECRETS_')), false, 'no broker when secrets are off');
  const turnEnded = records(home).find(r => r.received?.params?.name === 'turn_ended').received;
  assert.equal(turnEnded.params.arguments.session_id, echoed.turn.session_id);
  assert.equal(turnEnded.params.arguments.turn_id, echoed.turn.turn_id);
  assert.equal(dirname(sessionDir).endsWith('run'), true);
  assert.equal(sessionDir.endsWith(echoed.turn.session_id), true, 'the run directory is named by the connection session');

  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 0, stderr);
  assert.equal(existsSync(sessionDir), false);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('each connection gets its own random session ID', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
    await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
    const js = await server.call('js', {code: 'id'});
    sessions.push(JSON.parse(js.result.content[0].text).turn.session_id);
    server.child.stdin.end();
    assert.equal((await server.exit).code, 0);
  }
  assert.notEqual(sessions[0], sessions[1]);
});

test('the plugin entry cua-shim.mjs is the same server', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'cua-shim.mjs'), home);
  const init = await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  assert.equal(init.result.serverInfo.name, 'fake-upstream');
  const list = await server.request('tools/list');
  assert.deepEqual(list.result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
});

test('an upstream exit fails the pending call, cleans up and exits nonzero', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  const js = await server.call('js', {code: 'exit'});
  assert.equal(js.result.isError, true);
  assert.equal(js.result.structuredContent.code, 'connection_failed');
  const {code} = await server.exit;
  assert.equal(code, 1);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('SIGTERM closes the connection and its runtime', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  const [{start}] = records(home);
  server.child.kill('SIGTERM');
  const {code} = await server.exit;
  assert.equal(code, 0);
  assert.throws(() => process.kill(start.pid, 0), {code: 'ESRCH'});
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('close is bounded even when the host stops reading the MCP stream', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const child = spawn(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'serve'], {env: {...process.env, CUA_HOME: home, CUA_SHIM_SECRETS: 'off'}, stdio: ['pipe', 'pipe', 'ignore']});
  child.stdout.pause(); // a host that never reads: the server's 8 MiB reply cannot drain
  const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal})));
  for (const msg of [
    {jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}},
    {jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'js', arguments: {code: 'big'}}},
  ]) child.stdin.write(JSON.stringify(msg) + '\n');
  await new Promise(r => setTimeout(r, 1000));
  child.stdin.end();
  const started = Date.now();
  const exit = await Promise.race([exited, new Promise(r => setTimeout(() => r(null), 15_000))]);
  if (!exit) child.kill('SIGKILL');
  assert.ok(exit, 'cua serve did not exit while its output was blocked');
  assert.ok(Date.now() - started < 12_000);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('serve starts the connection\'s broker before the runtime, hands only the runtime its endpoint and token, lists through it and stops it at close', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t, {short: true});
  const record = join(home, 'helper-record.json');
  const keychainHelper = {
    built: true, command: process.execPath, args: [join(REPO, 'test', 'fixtures', 'fake-keychain-helper.mjs'), 'broker'],
    env: {FAKE_HELPER_MODE: 'serve', FAKE_HELPER_SECRETS: JSON.stringify({'work-password': 'pw-sentinel-9q'}), FAKE_HELPER_RECORD: record},
  };
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const diagnostics = [];
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'on'}, input, output, keychainHelper, diagnostics: line => diagnostics.push(line)});
  const reply = async id => { for (let i = 0; i < 400; i++) { const f = frames.find(m => m.id === id); if (f) return f; await new Promise(r => setTimeout(r, 25)); } throw new Error(`no reply ${id}`); };
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}}) + '\n');
  await reply(1);
  input.write(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}}) + '\n');
  const list = await reply(2);
  assert.deepEqual(list.result.structuredContent, {status: 'ok', labels: ['work-password']});

  const {config, argv} = JSON.parse(readFileSync(record, 'utf8'));
  assert.deepEqual(argv, ['broker']);
  const [{start}] = records(home);
  assert.equal(start.env.CUA_SECRETS_BROKER_ENDPOINT, config.socket);
  assert.equal(start.env.CUA_SECRETS_BROKER_TOKEN, config.token);
  assert.equal(config.socket, join(home, 'run', `${start.cwd.split('/').pop()}.sock`));
  assert.equal(start.argv.includes(config.token), false);
  assert.equal(existsSync(config.socket), true);
  assert.equal(JSON.stringify(frames).includes(config.token), false, 'the token never reaches the MCP stream');
  assert.equal(JSON.stringify(frames).includes('pw-sentinel-9q'), false);

  input.end();
  assert.equal(await served, 0, diagnostics.join('\n'));
  assert.equal(existsSync(config.socket), false);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('serve without a built helper still serves, and secrets_list says how to build it', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t, {short: true});
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'on'}, input, output, keychainHelper: {built: false, path: '/nowhere/cua-keychain'}, diagnostics: () => {}});
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}}) + '\n');
  input.write(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}}) + '\n');
  for (let i = 0; i < 400 && frames.length < 2; i++) await new Promise(r => setTimeout(r, 25));
  const list = frames.find(f => f.id === 2);
  assert.deepEqual(list.result.structuredContent, {status: 'unavailable', code: 'helper_not_built'});
  assert.match(list.result.content[0].text, /npm run build:helper/);
  const [{start}] = records(home);
  assert.equal(Object.keys(start.env).some(key => key.startsWith('CUA_SECRETS_')), false);
  input.end();
  assert.equal(await served, 0);
});
