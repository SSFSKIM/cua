// Fail closed on Linux (F2 fix wave, the coordinator's decision): where bubblewrap cannot create an unprivileged user
// namespace the vendor's sandbox fails open (measured on Ubuntu 24.04: cells write anywhere and reach the network), so
// a scoped connection or profile listing is refused with sandbox_unavailable before any runtime starts. The probe is
// doctor's (`bwrap --ro-bind / / true`), injected here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {createInterface} from 'node:readline';
import {PassThrough} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {assertSandboxConfines} from '../src/runtime/sandbox.mjs';
import {bwrapUserns} from '../src/runtime/linux-desktop.mjs';
import {openConnection} from '../src/mcp/connection.mjs';
import {listLiveBackends, listingSandboxMode} from '../src/profiles/inventory.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';
import {chromeFacts, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';

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

test('only a scoped mode on Linux is probed, and only a passing probe lets it through', async () => {
  for (const [mode, platform] of [['scoped', 'darwin'], ['disabled', 'linux'], ['default', 'linux']]) {
    const probe = counted('refused');
    await assertSandboxConfines(mode, {platform, probe});
    assert.equal(probe.calls, 0, `${mode} on ${platform}`);
  }
  await assertSandboxConfines('scoped', {platform: 'linux', probe: counted('pass')});
  const refused = await rejection(assertSandboxConfines('scoped', {platform: 'linux', probe: counted('refused')}));
  assert.equal(refused.code, 'sandbox_unavailable');
  assert.match(refused.message, /bubblewrap cannot create an unprivileged user namespace here \(bwrap --ro-bind \/ \/ true: bwrap: setting up uid map: Permission denied\)/);
  assert.match(refused.message, /no sandbox at all/);
  assert.match(refused.hint, /kernel\.apparmor_restrict_unprivileged_userns=0/);
  assert.match(refused.hint, /CUA_SHIM_SANDBOX=disabled/);
  const missing = await rejection(assertSandboxConfines('scoped', {platform: 'linux', probe: counted('missing')}));
  assert.equal(missing.code, 'sandbox_unavailable');
  assert.match(missing.message, /bubblewrap \(bwrap\) is not installed/);
});

test('a scoped Linux connection where user namespaces are refused is refused before any runtime starts, once probed', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const env = {PATH: process.env.PATH, HOME: process.env.HOME, CUA_SHIM_SURFACES: 'browser', DISPLAY: ':0'};
  const probe = counted('refused');
  const error = await rejection(openConnection({home, env, host: LINUX, sessionId: randomUUID(), input: new PassThrough(), output: new PassThrough(),
    diagnostics: () => {}, probeUserns: probe}));
  assert.equal(error.code, 'sandbox_unavailable');
  assert.equal(probe.calls, 1);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false, 'no runtime was launched');
  assert.deepEqual(readdirSync(join(home, 'run')), [], 'the claim was released');
});

test('the Linux computer-surface default (disabled) is never probed, and a passing probe opens a scoped connection', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const base = {PATH: process.env.PATH, HOME: process.env.HOME, DISPLAY: ':0'};
  for (const [env, status, calls] of [[base, 'refused', 0], [{...base, CUA_SHIM_SURFACES: 'browser'}, 'pass', 1]]) {
    const probe = counted(status);
    const input = new PassThrough();
    const connection = await openConnection({home, env, host: LINUX, sessionId: randomUUID(), input, output: new PassThrough(), diagnostics: () => {}, probeUserns: probe});
    assert.equal(probe.calls, calls);
    input.end();
    assert.equal((await connection.closed).code, 0);
  }
});

test('the profile listing stays scoped on Linux unless told otherwise, and is refused there like a connection', async t => {
  assert.equal(listingSandboxMode({}, 'linux'), 'scoped');
  assert.equal(listingSandboxMode({}, 'darwin'), 'scoped');
  assert.equal(listingSandboxMode({CUA_SHIM_SANDBOX: 'disabled'}, 'linux'), 'disabled');
  const home = fakeInstalledHome(t, {host: LINUX});
  const probe = counted('refused');
  const error = await rejection(listLiveBackends({home, runtime: resolveRuntime({home, host: LINUX}), ambient: {PATH: process.env.PATH, HOME: process.env.HOME}, probeUserns: probe}));
  assert.equal(error.code, 'sandbox_unavailable');
  assert.equal(probe.calls, 1);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false, 'no listing runtime was launched');
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

// Fix wave 2: a connection's own readiness listing (profiles_list) runs under the connection's mode. Inside a disabled
// connection the model's cells already run unconfined, so refusing its listing would protect nothing; the standalone
// listing (cua profiles list/bind, listLiveBackends without a mode) stays scoped and fail-closed.
test('a disabled connection lists its profiles under disabled, unprobed, where a scoped listing would be refused', async t => {
  const home = fakeInstalledHome(t, {host: LINUX});
  const userHome = join(home, 'user');
  const extension = join(userHome, '.config', 'google-chrome', 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {me: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-06T00:00:00.000Z'}}}));
  const backends = join(home, 'state', 'codex', 'fake-backends.json');
  mkdirSync(dirname(backends), {recursive: true});
  writeFileSync(backends, JSON.stringify({backends: [{instanceId: 'inst-a', family: 'chrome', profileName: null, tabCount: null}]}));

  const probe = counted('refused');
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const env = {PATH: process.env.PATH, HOME: userHome, DISPLAY: ':0', CUA_SHIM_SURFACES: 'computer,browser'};
  const connection = await openConnection({home, env, host: LINUX, sessionId: randomUUID(), input, output, diagnostics: () => {},
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
  assert.equal(probe.calls, 0, 'neither the disabled connection nor its listing asked for a sandbox');
  const listingCall = readFileSync(join(home, 'state', 'codex', 'fake-upstream.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse)
    .filter(e => e.received?.method === 'tools/call').at(-1);
  assert.deepEqual(listingCall.received.params._meta['codex/sandbox-state-meta'].permissionProfile, {type: 'disabled'});
});
