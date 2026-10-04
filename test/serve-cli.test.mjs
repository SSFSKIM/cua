// `cua serve` and the plugin's `cua-shim.mjs` end to end, as real processes, against a scratch CUA_HOME whose
// "installed" release runs a fake upstream in place of the vendor runtime. This proves the server consumes the actual
// resolver and launcher: allowlisted environment, owned per-connection working directory, and cleanup at close.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync, realpathSync, chmodSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {loadPins, selectPin} from '../src/runtime/manifest.mjs';
import {PassThrough} from 'node:stream';
import {REPO, scratch, shortScratch} from './fixtures/runtime-fixture.mjs';
import {serve} from '../src/mcp/server.mjs';
import {SKY_SERVICE, BROWSER_SERVICE, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {chromeFacts, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {LIVENESS_CELL} from '../src/profiles/inventory.mjs';

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

function launch(entry, home, args = [], extraEnv = {}) {
  const child = spawn(process.execPath, [entry, ...args], {
    env: {...process.env, CUA_HOME: home, CUA_SHIM_SECRETS: 'off', AMBIENT_SECRET: 'must-not-reach-runtime', NODE_REPL_TRUSTED_SERVICES: '{"sky":"/evil.mjs"}', CUA_SHIM_CODEX_HOME: '/tmp/legacy', ...extraEnv},
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
  assert.deepEqual(JSON.parse(start.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE}, 'the trusted sky wrapper is registered, never an ambient override');
  assert.deepEqual(start.env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').slice(1), [dirname(SKY_SERVICE), ...SERVICE_SUPPORT_DIRS]);
  assert.equal(start.env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  assert.deepEqual(Object.keys(start.env).filter(key => key.startsWith('CUA_SECRETS_')), ['CUA_SECRETS_UNAVAILABLE'], 'no broker when secrets are off');
  assert.equal(start.env.CUA_SECRETS_UNAVAILABLE, 'secrets_disabled');
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

test('with CUA_SHIM_SURFACES=computer,browser, serve registers both wrappers, configures the vendor browser service and answers profiles_list from the registry', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const userHome = join(home, 'user');
  const chromeDir = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
  mkdirSync(chromeDir, {recursive: true});
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}, school: {chromeProfileDirectory: 'Profile 6'}}}));
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SURFACES: 'computer,browser', HOME: userHome, BROWSER_USE_BACKEND_PATHS: '/tmp/evil.sock'});
  const init = await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  assert.match(init.result.instructions, /cua\.getBrowser\(\{extensionInstanceId\}\)/);
  const list = await server.request('tools/list');
  assert.deepEqual(list.result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list', 'profiles_list']);
  const profiles = await server.call('profiles_list');
  assert.deepEqual(profiles.result.structuredContent, {status: 'ok', profiles: [
    {key: 'personal', ready: false, reason: 'extension_not_installed'},
    {key: 'school', ready: false, reason: 'profile_directory_missing'},
  ]});
  await server.call('js', {code: 'hello'});
  const [{start}] = records(home);
  assert.equal(start.env.CUA_REPL_ENABLED_SURFACES, 'computer,browser');
  assert.deepEqual(JSON.parse(start.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE, browser: BROWSER_SERVICE});
  assert.match(start.env.CUA_BROWSER_VENDOR_SERVICE, /@oai\/browser-desktop\/scripts\/browser-service\.mjs$/);
  assert.equal(start.env.BROWSER_USE_AVAILABLE_BACKENDS, 'chrome');
  assert.equal(start.env.BROWSER_USE_BACKEND_PATHS, undefined, 'an ambient backend list never reaches the runtime');
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
});

test('profiles_list and cua profiles list check a bound profile against the live backends, one tab-free listing launch per request', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const userHome = join(home, 'user');
  const extension = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}}}));
  const backendsFile = join(home, 'state', 'codex', 'fake-backends.json');
  mkdirSync(dirname(backendsFile), {recursive: true});
  const listingOf = (...ids) => JSON.stringify({backends: ids.map(instanceId => ({instanceId, family: 'chrome', profileName: null, tabCount: null}))});

  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SURFACES: 'browser', HOME: userHome});
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  const seen = {};
  for (const [state, listing] of [['live', listingOf('other', 'inst-a')], ['stale', listingOf('inst-new')], ['none live', listingOf()], ['listing failed', null]]) {
    if (listing === null) rmSync(backendsFile); else writeFileSync(backendsFile, listing);
    const reply = await server.call('profiles_list');
    seen[state] = reply.result.structuredContent.profiles[0];
    if (state === 'stale') assert.match(reply.result.content[0].text, /cua profiles bind personal/);
  }
  assert.deepEqual(seen, {
    live: {key: 'personal', ready: true, extensionInstanceId: 'inst-a'},
    stale: {key: 'personal', ready: false, reason: 'binding_stale'},
    'none live': {key: 'personal', ready: false, reason: 'backends_unlistable'},
    'listing failed': {key: 'personal', ready: false, reason: 'backends_unlistable'},
  });
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 0, stderr);
  assert.match(stderr, /profiles_list: the live Chrome extension backends could not be listed \(listing_failed\)/);
  const cells = records(home).filter(r => r.received?.method === 'tools/call').map(r => r.received.params.arguments);
  assert.equal(cells.length, 4, 'one listing cell per request, nothing on the serving runtime');
  assert.ok(cells.every(c => c.code === LIVENESS_CELL), 'each listing is the tab-free cell');
  const starts = records(home).filter(r => r.start).map(r => r.start.env);
  assert.equal(starts.length, 5, 'the serving runtime and one bounded launch per profiles_list');
  assert.ok(starts.slice(1).every(env => env.CUA_REPL_ENABLED_SURFACES === 'browser'));
  assert.deepEqual(readdirSync(join(home, 'run')), [], 'every listing removed its working directory');

  writeFileSync(backendsFile, listingOf('inst-new'));
  const list = spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'profiles', 'list'], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000});
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /^personal\s+not ready\s+Default\s+its bound extension instance is not among the live backends \(an extension disable\/enable or reinstall mints a new id\): bind it again with cua profiles bind personal$/m);
  writeFileSync(backendsFile, listingOf('inst-a'));
  const json = JSON.parse(spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'profiles', 'list', '--json'], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000}).stdout);
  assert.deepEqual(json.profiles.map(p => [p.key, p.ready, p.extensionInstanceId]), [['personal', true, 'inst-a']]);
});

test('an invalid CUA_SHIM_SURFACES fails classified before anything is launched', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SURFACES: 'iab'});
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 1);
  assert.match(stderr, /CUA_SHIM_SURFACES must be computer, browser or computer,browser \[invalid_setting\]/);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false);
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

test('a connection\'s own session approval file is removed at close; other sessions\' files are left alone', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const sessions = join(home, 'state', 'codex', 'computer-use', 'sessions');
  mkdirSync(sessions, {recursive: true});
  const other = join(sessions, '00000000-0000-4000-8000-000000000000.toml');
  writeFileSync(other, '[apps]\nallowed = []\n');
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  const js = await server.call('js', {code: 'approve'});
  const own = join(sessions, `${JSON.parse(js.result.content[0].text).turn.session_id}.toml`);
  assert.equal(existsSync(own), true, 'the runtime wrote the connection\'s approvals');
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
  assert.equal(existsSync(own), false);
  assert.equal(existsSync(other), true);
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
  t.after(async () => { input.end(); await served; });  // a failed assertion must not leave the server (and the suite) running
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
  assert.equal(start.env.CUA_SECRETS_UNAVAILABLE, undefined);
  assert.deepEqual(JSON.parse(start.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE});
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

test('serve runs the Keychain helper installed in $CUA_HOME/bin when none is passed, as a copy of cua without a build does', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t, {short: true});
  mkdirSync(join(home, 'bin'));
  const installed = join(home, 'bin', 'cua-keychain');
  const fake = join(REPO, 'test', 'fixtures', 'fake-keychain-helper.mjs');
  writeFileSync(installed, `#!/bin/sh\nFAKE_HELPER_SECRETS='{"from-cua-home":"x"}' exec ${JSON.stringify(process.execPath)} ${JSON.stringify(fake)} "$@"\n`);
  chmodSync(installed, 0o755);
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'on'}, input, output, diagnostics: () => {}});
  t.after(async () => { input.end(); await served; });
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}}) + '\n');
  input.write(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}}) + '\n');
  for (let i = 0; i < 400 && !frames.some(f => f.id === 2); i++) await new Promise(r => setTimeout(r, 25));
  assert.deepEqual(frames.find(f => f.id === 2).result.structuredContent, {status: 'ok', labels: ['from-cua-home']});
  input.end();
  assert.equal(await served, 0);
});

test('serve without a built helper still serves, and secrets_list says how to build it', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t, {short: true});
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'on'}, input, output, keychainHelper: {built: false, path: '/nowhere/cua-keychain'}, diagnostics: () => {}});
  t.after(async () => { input.end(); await served; });
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}}) + '\n');
  input.write(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}}) + '\n');
  for (let i = 0; i < 400 && frames.length < 2; i++) await new Promise(r => setTimeout(r, 25));
  const list = frames.find(f => f.id === 2);
  assert.deepEqual(list.result.structuredContent, {status: 'unavailable', code: 'helper_not_built'});
  assert.match(list.result.content[0].text, /npm run build:helper/);
  const [{start}] = records(home);
  assert.deepEqual(Object.keys(start.env).filter(key => key.startsWith('CUA_SECRETS_')), ['CUA_SECRETS_UNAVAILABLE']);
  assert.equal(start.env.CUA_SECRETS_UNAVAILABLE, 'helper_not_built', 'a secret reference fails with this reason');
  assert.deepEqual(JSON.parse(start.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE});
  input.end();
  assert.equal(await served, 0);
});

// In process: a fake installed home with a bound personal profile whose Default extension manifest exists (a scratch
// Chrome user-data directory), served with the browser surface and an injected readiness listing.
function boundBrowserServe(t, listBackends) {
  const home = fakeInstalledHome(t, {short: true});
  const userData = join(home, 'user', 'Library', 'Application Support', 'Google', 'Chrome');
  const extension = join(userData, 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}}}));
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const diagnostics = [];
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'off', CUA_SHIM_SURFACES: 'browser'}, input, output,
    chrome: chromeFacts({userData}), listBackends, diagnostics: line => diagnostics.push(line)});
  t.after(async () => { input.end(); await served; });
  const send = msg => input.write(JSON.stringify({jsonrpc: '2.0', ...msg}) + '\n');
  const reply = async id => { for (let i = 0; i < 400; i++) { const f = frames.find(m => m.id === id); if (f) return f; await new Promise(r => setTimeout(r, 25)); } throw new Error(`no reply ${id}`); };
  send({id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}});
  return {input, send, reply, served, diagnostics};
}

test('a readiness listing whose runtime teardown is unconfirmed makes profiles_list unlistable and serve exit 1', {skip: !supported}, async t => {
  const unconfirmed = async () => ({backends: [{instanceId: 'inst-a', family: 'chrome'}], teardown: {confirmed: false, steps: ['eof', 'sigterm', 'sigkill'], reason: 'a group member survived'}});
  const {input, send, reply, served, diagnostics} = boundBrowserServe(t, unconfirmed);
  await reply(1);
  send({id: 2, method: 'tools/call', params: {name: 'profiles_list', arguments: {}}});
  assert.deepEqual((await reply(2)).result.structuredContent, {status: 'ok', profiles: [{key: 'personal', ready: false, reason: 'backends_unlistable'}]});
  input.end();
  assert.equal(await served, 1);
  assert.ok(diagnostics.some(l => /readiness listing's runtime could not be confirmed stopped; owned processes may remain/.test(l)), diagnostics.join('\n'));
});

test('serve waits for a readiness listing still running at close, keeping its signal handlers until it settles', {skip: !supported}, async t => {
  let started;
  const begun = new Promise(resolve => { started = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const baseline = new Set(process.listeners('SIGTERM'));
  const {input, send, reply, served} = boundBrowserServe(t, async () => { started(); await held; return {backends: [{instanceId: 'inst-a', family: 'chrome'}], teardown: {confirmed: true, steps: ['eof']}}; });
  await reply(1);
  const own = process.listeners('SIGTERM').filter(h => !baseline.has(h));
  assert.equal(own.length, 1, 'serve installed its SIGTERM handler');
  send({id: 2, method: 'tools/call', params: {name: 'profiles_list', arguments: {}}});
  await begun;
  input.end();
  let settled = false;
  served.then(() => { settled = true; });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(settled, false, 'serve does not return while the listing runs');
  assert.ok(process.listeners('SIGTERM').includes(own[0]), 'serve\'s SIGTERM handler is still installed while it waits');
  release();
  assert.equal(await served, 0);
  assert.ok(!process.listeners('SIGTERM').includes(own[0]), 'the handler goes once the listing settled');
});
