// Fail closed on Linux (F2 fix wave, the coordinator's decision): where bubblewrap cannot create an unprivileged user
// namespace the vendor's sandbox fails open (measured on Ubuntu 24.04: cells write anywhere and reach the network), so
// a scoped connection or profile listing is refused with sandbox_unavailable before any runtime starts. The probe is
// doctor's (`bwrap --ro-bind / / true`), injected here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {assertSandboxConfines} from '../src/runtime/sandbox.mjs';
import {bwrapUserns} from '../src/runtime/linux-desktop.mjs';
import {openConnection} from '../src/mcp/connection.mjs';
import {listLiveBackends, listingSandboxMode} from '../src/profiles/inventory.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';

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
