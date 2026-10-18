// Fail closed on Linux: a confined (scoped or default) connection or profile listing runs its children under cua's pinned
// sandbox helper (#115 M3), so it is refused with sandbox_unavailable before any runtime starts where the helper is not
// the pinned one or bubblewrap cannot create an unprivileged user namespace (F2 measured the vendor's sandbox failing
// open there; cua's helper fails closed, and the refusal says why up front). The probe is doctor's (`bwrap --ro-bind /
// / true`) and the helper check src/sandbox/linux.mjs verifyHelper, both injected here unless a test says otherwise.
// Linux has no vendor host (#115 M3): the own host's Node is injected, and a test that needs a runtime running swaps
// the fake upstream in for the supervisor (`prepareLaunch`).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {createInterface} from 'node:readline';
import {PassThrough} from 'node:stream';
import {createHash, randomUUID} from 'node:crypto';
import {assertSandboxConfines} from '../src/runtime/sandbox.mjs';
import {bwrapUserns} from '../src/runtime/linux-desktop.mjs';
import {openConnection} from '../src/mcp/connection.mjs';
import {listLiveBackends, listingSandboxMode} from '../src/profiles/inventory.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';
import {chromeFacts, CUA_EXTENSION_ID} from '../src/profiles/chrome.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };
const counted = status => { const probe = async () => { probe.calls++; return {status, detail: 'bwrap: setting up uid map: Permission denied'}; }; probe.calls = 0; return probe; };

test('bwrapUserns runs bwrap --ro-bind / / true and says pass, refused (with its stderr) or missing', async () => {
  const exec = code => async (command, args) => { assert.deepEqual([command, args], ['/usr/bin/bwrap', ['--ro-bind', '/', '/', 'true']]); return {code, stdout: '', stderr: 'bwrap: setting up uid map: Permission denied\n'}; };
  const found = () => '/usr/bin/bwrap';
  assert.deepEqual(await bwrapUserns({exec: exec(0), findTool: found}), {status: 'pass'});
  assert.deepEqual(await bwrapUserns({exec: exec(1), findTool: found}), {status: 'refused', detail: 'bwrap: setting up uid map: Permission denied'});
  assert.deepEqual(await bwrapUserns({exec: exec(0), findTool: () => null}), {status: 'missing'});
});

// What the Linux launch names as its helper (src/runtime/launch.mjs): the double stands in for the pinned bytes' check.
const LAUNCH = {env: {CUA_REPL_SANDBOX_HELPER: '/home/u/.local/share/cua/sandbox/rust-v0.163.0/codex-linux-sandbox', CUA_REPL_SANDBOX_HELPER_SHA256: 'a'.repeat(64)}};
const helperCheck = (refuse = false) => { const verify = helper => { verify.calls.push(helper); if (refuse) throw Object.assign(new Error('cua\'s Linux sandbox helper is not installed'), {code: 'sandbox_unavailable'}); return helper; }; verify.calls = []; return verify; };
const ownNode = () => process.execPath;

test('a confined mode on Linux checks the pinned helper, then probes; disabled and macOS check nothing', async () => {
  for (const [mode, platform] of [['scoped', 'darwin'], ['default', 'darwin'], ['disabled', 'linux']]) {
    const probe = counted('refused'), verifyHelper = helperCheck(true);
    await assertSandboxConfines(mode, {platform, launch: LAUNCH, probe, verifyHelper});
    assert.deepEqual([probe.calls, verifyHelper.calls.length], [0, 0], `${mode} on ${platform}`);
  }
  for (const mode of ['scoped', 'default']) {
    const verifyHelper = helperCheck();
    await assertSandboxConfines(mode, {platform: 'linux', launch: LAUNCH, probe: counted('pass'), verifyHelper});
    assert.deepEqual(verifyHelper.calls, [{path: LAUNCH.env.CUA_REPL_SANDBOX_HELPER, sha256: LAUNCH.env.CUA_REPL_SANDBOX_HELPER_SHA256}]);
    const refused = await rejection(assertSandboxConfines(mode, {platform: 'linux', launch: LAUNCH, probe: counted('refused'), verifyHelper}));
    assert.equal(refused.code, 'sandbox_unavailable');
    assert.match(refused.message, new RegExp(`^CUA_SHIM_SANDBOX=${mode}, but bubblewrap cannot create an unprivileged user namespace here \\(bwrap --ro-bind / / true: bwrap: setting up uid map: Permission denied\\)`));
    assert.match(refused.message, /cua's sandbox helper cannot confine JavaScript cells, and none would run; nothing was started/);
    assert.match(refused.hint, /kernel\.apparmor_restrict_unprivileged_userns=0/);
    assert.match(refused.hint, /CUA_SHIM_SANDBOX=disabled/);
    const missing = await rejection(assertSandboxConfines(mode, {platform: 'linux', launch: LAUNCH, probe: counted('missing'), verifyHelper}));
    assert.match(missing.message, /bubblewrap \(bwrap\) is not installed/);
    const probe = counted('pass');
    const noHelper = await rejection(assertSandboxConfines(mode, {platform: 'linux', launch: LAUNCH, probe, verifyHelper: helperCheck(true)}));
    assert.equal(noHelper.code, 'sandbox_unavailable');
    assert.equal(probe.calls, 0, 'a missing helper refuses before the probe');
  }
});

// The real verifier before launch: the pinned bytes without execute bits are refused up front, never at spawn.
test('the real check: a helper with the pinned bytes but no execute bits is refused before the probe', {skip: process.getuid?.() === 0 && 'root executes any file'}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-helper-mode-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'codex-linux-sandbox');
  writeFileSync(path, '#!/bin/sh\n', {mode: 0o644});
  const launch = {env: {CUA_REPL_SANDBOX_HELPER: path, CUA_REPL_SANDBOX_HELPER_SHA256: createHash('sha256').update('#!/bin/sh\n').digest('hex')}};
  const probe = counted('pass');
  const refused = await rejection(assertSandboxConfines('scoped', {platform: 'linux', launch, probe}));
  assert.equal(refused.code, 'sandbox_unavailable');
  assert.match(refused.message, /is not an executable file/);
  assert.equal(probe.calls, 0);
  chmodSync(path, 0o755);
  await assertSandboxConfines('scoped', {platform: 'linux', launch, probe});
});

test('the real check: a confined Linux connection whose helper is not installed is refused before any runtime starts', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const env = {PATH: process.env.PATH, HOME: process.env.HOME, CUA_SHIM_SURFACES: 'browser', DISPLAY: ':0'};
  const probe = counted('pass');
  const error = await rejection(openConnection({home, env, host: LINUX, sessionId: randomUUID(), input: new PassThrough(), output: new PassThrough(),
    diagnostics: () => {}, probeUserns: probe, resolveOwnNode: ownNode}));
  assert.equal(error.code, 'sandbox_unavailable');
  assert.match(error.message, new RegExp(`cua's Linux sandbox helper ${join(home, 'sandbox')}/rust-v[0-9.]+/codex-linux-sandbox is not installed`));
  assert.equal(probe.calls, 0);
  assert.deepEqual(readdirSync(join(home, 'run')), [], 'the claim was released');
});

test('a confined Linux connection where user namespaces are refused is refused before any runtime starts, once probed', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const env = {PATH: process.env.PATH, HOME: process.env.HOME, CUA_SHIM_SURFACES: 'browser', DISPLAY: ':0'};
  const probe = counted('refused');
  const error = await rejection(openConnection({home, env, host: LINUX, sessionId: randomUUID(), input: new PassThrough(), output: new PassThrough(),
    diagnostics: () => {}, probeUserns: probe, verifyHelper: helperCheck(), resolveOwnNode: ownNode}));
  assert.equal(error.code, 'sandbox_unavailable');
  assert.equal(probe.calls, 1);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false, 'no runtime was launched');
  assert.deepEqual(readdirSync(join(home, 'run')), [], 'the claim was released');
});

test('the Linux computer surface defaults to scoped and is checked like any confined connection; disabled is never checked', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const base = {PATH: process.env.PATH, HOME: process.env.HOME, DISPLAY: ':0'};
  for (const [env, calls] of [[base, 1], [{...base, CUA_SHIM_SURFACES: 'browser'}, 1], [{...base, CUA_SHIM_SANDBOX: 'disabled'}, 0]]) {
    const probe = counted('pass'), verifyHelper = helperCheck();
    const input = new PassThrough();
    const connection = await openConnection({home, env, host: LINUX, sessionId: randomUUID(), input, output: new PassThrough(), diagnostics: () => {}, probeUserns: probe, verifyHelper, resolveOwnNode: ownNode});
    assert.deepEqual([probe.calls, verifyHelper.calls.length], [calls, calls], JSON.stringify(env));
    input.end();
    assert.equal((await connection.closed).code, 0);
  }
});

test('the profile listing runs under CUA_SHIM_SANDBOX (scoped unless told otherwise) and is refused on Linux like a connection', async t => {
  assert.equal(listingSandboxMode({}), 'scoped');
  assert.equal(listingSandboxMode({CUA_SHIM_SANDBOX: 'disabled'}), 'disabled');
  const home = fakeInstalledHome(t, {host: LINUX});
  const probe = counted('refused');
  const error = await rejection(listLiveBackends({home, runtime: resolveRuntime({home, host: LINUX}), ambient: {PATH: process.env.PATH, HOME: process.env.HOME}, probeUserns: probe, verifyHelper: helperCheck(), resolveOwnNode: ownNode}));
  assert.equal(error.code, 'sandbox_unavailable');
  assert.equal(probe.calls, 1);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false, 'no listing runtime was launched');
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

// Fix wave 2: a connection's own readiness listing (profiles_list) runs under the connection's mode. Inside a disabled
// connection the model's cells already run unconfined, so refusing its listing would protect nothing.
test('a disabled connection lists its profiles under disabled, unprobed, where a scoped listing would be refused', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const userHome = join(home, 'user');
  const extension = join(userHome, '.config', 'google-chrome', 'Default', 'Extensions', CUA_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {me: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-06T00:00:00.000Z', route: 'cua'}}}));
  const backends = join(home, 'state', 'codex', 'fake-backends.json');
  mkdirSync(dirname(backends), {recursive: true});
  writeFileSync(backends, JSON.stringify({backends: [{instanceId: 'inst-a', family: 'chrome', profileName: null, tabCount: null}]}));

  const probe = counted('refused');
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  // Linux runs cua's own host; the fake release's upstream stands in for its supervisor, in the listing too.
  const env = {PATH: process.env.PATH, HOME: userHome, DISPLAY: ':0', CUA_SHIM_SURFACES: 'computer,browser', CUA_SHIM_SANDBOX: 'disabled'};
  const runtime = resolveRuntime({home, host: LINUX});
  const prepareLaunch = launch => ({...launch, command: runtime.paths.node, args: [runtime.paths.cuaRepl], env: {...launch.env, CODEX_HOME: join(home, 'state', 'codex')}});
  const verifyHelper = helperCheck();
  const connection = await openConnection({home, env, host: LINUX, sessionId: randomUUID(), input, output, diagnostics: () => {}, resolveOwnNode: ownNode, prepareLaunch, verifyHelper,
    listBackends: () => listLiveBackends({home, runtime, ambient: env, tabCounts: false, sandbox: 'disabled', probeUserns: probe, verifyHelper, resolveOwnNode: ownNode, prepareLaunch}),
    chrome: chromeFacts({host: LINUX, env: {}, userHome}), probeUserns: probe});
  t.after(() => { input.end(); return connection.closed; });
  const reply = async id => { for (let i = 0; i < 400; i++) { const f = frames.find(m => m.id === id); if (f) return f; await new Promise(r => setTimeout(r, 25)); } throw new Error(`no reply ${id}`); };
  const send = msg => input.write(JSON.stringify({jsonrpc: '2.0', ...msg}) + '\n');
  send({id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'linux-test', version: '0'}}});
  await reply(1);
  send({id: 2, method: 'tools/call', params: {name: 'profiles_list', arguments: {}}});
  assert.deepEqual((await reply(2)).result.structuredContent, {status: 'ok', profiles: [{key: 'me', ready: true, extensionInstanceId: 'inst-a'}]});
  input.end();
  assert.equal((await connection.closed).code, 0);
  assert.deepEqual([probe.calls, verifyHelper.calls.length], [0, 0], 'neither the disabled connection nor its listing asked for a sandbox');
  const listingCall = readFileSync(join(home, 'state', 'codex', 'fake-upstream.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse)
    .filter(e => e.received?.method === 'tools/call').at(-1);
  assert.deepEqual(listingCall.received.params._meta['codex/sandbox-state-meta'].permissionProfile, {type: 'disabled'});
});
