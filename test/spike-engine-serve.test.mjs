// The own native engine spike's MCP server (scripts/spike/engine/serve.mjs; docs/doperpowers/specs/2026-10-18-own-native-
// engine-design.md, M0 "Spike"): cua's own REPL host launched as buildLaunch gives it (the macOS sandbox launcher and the
// kernel's deny list) with the computer surface, the real trusted wrapper as the `sky` service delegating to the spike's
// service, and CUA_ENGINE_APP, bypassing replHostFor's macOS refusal without touching src/. The environment is checked
// as built; then, with a Node 24 or later (CUA_NODE), a real session runs the facade in a kernel against a fake engine
// (test/helpers/fake-engine.mjs): no app is observed or driven, and no vendor process runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
import {scratchUserHome, shortScratch} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';
import {kernelNode} from './repl-host/kernel-harness.mjs';
import {EngineFailure, startFakeEngine} from './helpers/fake-engine.mjs';
import {infoPlist} from '../scripts/spike/engine/assemble.mjs';
import {isTextEditApproval} from '../scripts/accept/lib.mjs';
import {APPROVED_ENGINE, SPIKE_DIR, SPIKE_SERVICE, spikeLaunch} from '../scripts/spike/engine/serve.mjs';
import {REPL_HOST_DIR, REPL_HOST_SUPERVISOR, SKY_SERVICE} from '../src/runtime/launch.mjs';
import {REPL_HOST_META_KEY} from '../src/repl-host/identity.mjs';

const darwin = process.platform === 'darwin' && installedHomeSupported ? false : 'the spike serves macOS computer sessions only';
const SERVE = join(SPIKE_DIR, 'serve.mjs');

test('the launch: cua\'s own host on the given Node, the real wrapper as `sky` delegating to the spike service, the macOS sandbox and deny list, CUA_ENGINE_APP', {skip: darwin}, t => {
  const home = fakeInstalledHome(t);
  const env = {PATH: '/usr/bin:/bin', HOME: scratchUserHome(t), CUA_ENGINE_APP: '/opt/engines/cua Engine.app'};
  const launch = spikeLaunch({home, env, sessionId: 'spike-session-1', node: process.execPath});
  assert.equal(launch.command, process.execPath);
  assert.deepEqual(launch.args, ['--disable-sigusr1', REPL_HOST_SUPERVISOR]);
  assert.deepEqual(launch.replHost, {host: 'cua', reason: 'spike_engine'});
  assert.equal(launch.sandbox, 'scoped');
  const e = launch.env;
  assert.deepEqual(JSON.parse(e.CUA_REPL_TRUSTED_SERVICES), {sky: realpathSync(SKY_SERVICE)});
  assert.equal(e.CUA_SKY_SERVICE, SPIKE_SERVICE);
  assert.equal(e.CUA_ENGINE_APP, '/opt/engines/cua Engine.app');
  const trusted = e.CUA_REPL_TRUSTED_CODE_PATHS.split(':');
  assert.ok(trusted.includes(SPIKE_DIR) && trusted.includes(REPL_HOST_DIR), 'the spike directory joins the own host\'s trusted code');
  assert.equal(e.CUA_REPL_ENABLED_SURFACES, 'computer');
  assert.equal(e.CUA_REPL_TRUSTED_RPC_ENABLED, '1');
  assert.equal(e.CUA_REPL_SANDBOX_EXEC, '/usr/bin/sandbox-exec');
  assert.equal(e.CUA_REPL_NODE_PATH, process.execPath);
  assert.equal(e.CUA_REPL_OWNED_GROUP, '1', 'run under spawnUpstream\'s anchor-owned group, as the proxy runs it');
  const deny = JSON.parse(e.CUA_SANDBOX_DENY_READ);
  const userHome = realpathSync(env.HOME);
  assert.ok(deny.deny.includes(home) && deny.deny.includes(join(userHome, '.config', 'cua')) && deny.deny.includes(join(userHome, '.config', 'claude-secrets')),
    'the kernel is denied cua\'s home, its settings and the secret store (by real path)');
  assert.ok(deny.reexpose.includes(launch.sessionTmp), 'and may read the session\'s temp, where the engine writes screenshots');
  assert.equal(e.CUA_SECRETS_UNAVAILABLE, 'secrets_disabled');
  assert.equal(e.TMPDIR, launch.sessionTmp);
  for (const vendor of ['SKY_CUA_SERVICE_PATH', 'CODEX_HOME', 'CODEX_CLI_PATH', 'CUA_COMPAT_NODE', 'NODE_REPL_TRUSTED_SERVICES', 'CUA_REPL_NODE_REPL_PATH'])
    assert.ok(!(vendor in e), `${vendor} is not set: nothing of the vendor's host or helper is reachable`);

  assert.equal(spikeLaunch({home, env: {...env, CUA_ENGINE_APP: ''}, sessionId: 'spike-session-2', node: process.execPath}).env.CUA_ENGINE_APP, APPROVED_ENGINE);
  assert.equal(APPROVED_ENGINE, join(homedir(), 'Library', 'Application Support', 'cua', 'engine', 'cua Engine.app'));
  assert.throws(() => spikeLaunch({home, env: {...env, CUA_ENGINE_APP: 'relative/cua Engine.app'}, sessionId: 'spike-session-3', node: process.execPath}), /CUA_ENGINE_APP/);
  assert.equal(spikeLaunch({home, env: {...env, CUA_SHIM_SANDBOX: 'disabled'}, sessionId: 'spike-session-4', node: process.execPath}).sandbox, 'disabled');
});

const {node, skip: noNode} = kernelNode();

test('a session through serve.mjs: the facade in a kernel, one approval per app, the stand-in text, the engine\'s errors as they are, the raw Skyshot, a clean exit', {skip: darwin || noNode}, async t => {
  const s = shortScratch('cua-srv-');
  t.after(s.cleanup);
  const app = join(s.dir, 'cua Engine.app');
  mkdirSync(join(app, 'Contents'), {recursive: true});
  writeFileSync(join(app, 'Contents', 'Info.plist'), infoPlist({version: '0.1.0', build: 'b1'}));
  const textEdit = {appPath: '/System/Applications/TextEdit.app', bundleIdentifier: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true, pid: 501};
  const skyshot = {
    app: {bundleIdentifier: textEdit.bundleIdentifier, displayName: 'TextEdit', appPath: textEdit.appPath, pid: 501},
    window: {title: 'Untitled', frame: {x: 0, y: 0, width: 600, height: 400}, pid: 501}, lineage: 'L1', revision: 1,
    nodes: [{index: 0, depth: 0, pid: 501, role: 'AXWindow', subrole: null, roleDescription: 'standard window', title: 'Untitled', description: null, value: null,
      valueMarkdown: null, identifier: null, flags: {enabled: true, focused: false, selected: false, settable: false}, actions: [], frame: null, children: 0}],
    truncated: null, screenshot: null, focused: null, selectedText: null, timings: {totalMs: 1},
  };
  const engine = await startFakeEngine(t, join(s.dir, 'engine.sock'), {handlers: {
    'execute:list_apps': () => [{id: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true}],
    'execute:resolve_app': () => textEdit,
    'execute:get_app_state': () => skyshot,
    'execute:click': () => { throw new EngineFailure(-10005, 'click is not implemented by this engine build', 'notImplemented'); },
  }});

  const home = fakeInstalledHome(t);
  const env = {PATH: '/usr/bin:/bin', HOME: scratchUserHome(t), TMPDIR: process.env.TMPDIR, CUA_HOME: home, CUA_NODE: node, CUA_ENGINE_APP: app};
  const child = spawn(process.execPath, [SERVE], {env, stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const pending = new Map();
  const elicitations = [];
  const send = msg => child.stdin.write(`${JSON.stringify(msg)}\n`);
  createInterface({input: child.stdout}).on('line', line => {
    const msg = JSON.parse(line);
    if (msg.method === 'elicitation/create') {
      elicitations.push(msg);
      send({jsonrpc: '2.0', id: msg.id, result: {action: 'accept'}});
      return;
    }
    pending.get(msg.id)?.(msg);
  });
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); send({jsonrpc: '2.0', id: n, method, params}); });

  const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'spike-serve-test', version: '0'}});
  assert.equal(init.result?.serverInfo?.name, 'cua-repl-host', stderr);
  const code = `
    const apps = await cua.listApps({emit: false});
    const app = await cua.getApp('TextEdit');
    const again = await app.getAXState({emit: false, disableDiffing: true});
    let clickError = null;
    try { await app.click(0); } catch (error) { clickError = error.message; }
    const raw = await nodeRepl.rpc('sky', {type: 'spike', op: 'last_observation', app: '/System/Applications/TextEdit.app'});
    const turn = nodeRepl.requestMeta['x-codex-turn-metadata'];
    nodeRepl.write(JSON.stringify({apps, again, clickError, lineage: raw.skyshot.lineage, methods: Object.keys(cua.computer).sort(), turn, callId: nodeRepl.requestMeta.callId}));`;
  const result = (await request('tools/call', {name: 'js', arguments: {code}})).result;
  assert.equal(result.isError, false, `${JSON.stringify(result.content)}\n${stderr}`);
  const out = JSON.parse(result.content.at(-1).text);
  assert.deepEqual(out.apps, [{id: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true}]);
  assert.equal(out.again, 'Window: "Untitled", App: TextEdit.\n0 standard window Untitled\n');
  assert.equal(out.clickError, 'Computer Use server error -10005: click is not implemented by this engine build');
  assert.equal(out.lineage, 'L1');
  assert.deepEqual(Object.keys(out.turn).sort(), ['call_id', 'model', 'session_id', 'thread_id', 'turn_id']);
  assert.equal(out.turn.call_id, out.callId);
  assert.equal(out.turn.model, 'spike-serve-test');
  assert.equal(out.turn.session_id, out.turn.thread_id);
  assert.deepEqual(out.methods, ['click', 'drag', 'get_app_state', 'list_apps', 'paste', 'perform_secondary_action', 'press_key', 'scroll', 'select_text', 'set_value', 'target', 'type_text']);
  assert.ok(result.content.some(item => item.text === out.again), 'getApp emitted the full text');

  assert.equal(elicitations.length, 1, 'one approval for TextEdit in the connection');
  const [asked] = elicitations;
  assert.ok(isTextEditApproval({...asked, params: {mode: 'form', ...asked.params}}), JSON.stringify(asked.params));
  assert.match(asked.params._meta.tool_call_id, /^[0-9a-f-]{36}$/, 'the turn metadata\'s call id reaches the elicitation, as on the vendor lane');
  assert.deepEqual(result._meta['cua/nativeEngine'], {engine: 'cua', version: '0.1.0', build: 'b1'});
  assert.equal(result._meta[REPL_HOST_META_KEY].host, 'cua');
  assert.deepEqual(result._meta['codex/toolSurface'], {app: {appId: 'com.apple.TextEdit', kind: 'appId'}, kind: 'computerUse'});

  const executes = engine.executes();
  assert.deepEqual(executes.map(p => p.method), ['list_apps', 'resolve_app', 'get_app_state', 'resolve_app', 'get_app_state', 'click'],
    'resolve_app once per app string: getApp\'s name, then the bound path the App calls with');
  const observe = executes.find(p => p.method === 'get_app_state').args;
  const run = join(realpathSync(home), 'run');
  assert.ok(observe.outputDirectory.startsWith(`${run}/`) && observe.outputDirectory.endsWith('/tmp/cua-engine-screenshots'), observe.outputDirectory);
  assert.equal(observe.includeScreenshot, true);

  child.stdin.end();
  assert.equal(await exited, 0, stderr);
  assert.ok(!existsSync(observe.outputDirectory), 'the session\'s run directory is removed at exit');
});
