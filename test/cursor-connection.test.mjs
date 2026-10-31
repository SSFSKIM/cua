import {SCRATCH_HOME} from './helpers/scratch-home.mjs'; // first: the native engine's selection must not read the account's own settings
// The agent cursor's context per connection (src/mcp/connection.mjs; #235's spec, "Lifecycle and identity", "Remote
// devices"): resolved once at the open, only where a session can show a cursor (cua's engine on macOS), its sminos
// lookup awaited by the launch and not by the open, a remote client's checked context first, and what was resolved in
// the launch's worker environment. The launch is captured and stopped before spawn.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {openConnection} from '../src/mcp/connection.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';

const DARWIN = {platform: 'darwin', arch: 'arm64'};
const NODE24 = '/fixture/node24/bin/node';
const APP = {bundlePath: '/Users/someone/Library/Application Support/cua/engine/cua Engine.app', engineVersion: '0.2.0', build: 'f'.repeat(64), approvedAt: '2026-10-20T00:00:00.000Z'};
const CUA_ENGINE = {config: () => ({}), installed: () => APP};
const STOP = Object.assign(new Error('stopped before spawn'), {code: 'test_stop'});

// A connection opened with `options`, its first launch captured: -> {launch, asked (the resolver's calls), openedAt}.
async function launchOf(t, {env, engine = CUA_ENGINE, resolveCursor, cursor}) {
  const home = fakeInstalledHome(t, {host: DARWIN});
  const input = new PassThrough(), output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const launches = [];
  const asked = [];
  const resolver = resolveCursor && (options => { asked.push(options); return resolveCursor(options); });
  const connection = await openConnection({home, env: {PATH: '/usr/bin:/bin', HOME: SCRATCH_HOME, CUA_SHIM_SECRETS: 'off', CUA_SHIM_SURFACES: 'computer', CUA_NATIVE_ENGINE: 'cua', ...env}, host: DARWIN,
    sessionId: randomUUID(), input, output, diagnostics: () => {}, prepareLaunch: launch => { launches.push(launch); throw STOP; }, chrome: {},
    listBackends: async () => ({backends: []}), resolveOwnNode: () => NODE24, engine, ...(resolver ? {resolveCursor: resolver} : {}), cursor});
  const openedAt = Date.now();
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'cursor', version: '0'}}}) + '\n');
  for (let i = 0; i < 400 && !frames.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
  input.end();
  await connection.closed;
  return {launch: launches[0], asked, openedAt};
}
const cursorOf = env => Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('CUA_CURSOR')));

test('with cua\'s engine the connection resolves its cursor once, and the launch carries what it resolved', async t => {
  const {launch, asked} = await launchOf(t, {env: {CUA_CURSOR: '0'}, resolveCursor: async () => ({label: 'cursor235', color: '#8250df', enabled: false})});
  assert.equal(asked.length, 1);
  assert.equal(asked[0].env.CUA_CURSOR, '0', 'from the caller\'s own environment');
  assert.equal(asked[0].given, null, 'a local session has no remote context');
  assert.deepEqual(cursorOf(launch.env), {CUA_CURSOR_LABEL: 'cursor235', CUA_CURSOR_COLOR: '#8250df', CUA_CURSOR: '0'});
});

test('a remote client\'s checked context goes first, into this session\'s launch alone', async t => {
  const resolveCursor = async ({given}) => ({label: given?.label ?? 'device', color: given?.color ?? '#57606a', enabled: given?.enabled ?? true});
  const remote = await launchOf(t, {resolveCursor, cursor: {label: 'Research', color: '#2f6feb'}});
  assert.deepEqual(remote.asked[0].given, {label: 'Research', color: '#2f6feb'});
  assert.deepEqual(cursorOf(remote.launch.env), {CUA_CURSOR_LABEL: 'Research', CUA_CURSOR_COLOR: '#2f6feb'});
  const old = await launchOf(t, {resolveCursor});
  assert.deepEqual(cursorOf(old.launch.env), {CUA_CURSOR_LABEL: 'device', CUA_CURSOR_COLOR: '#57606a'}, 'a client too old to send it: the device\'s own');
});

test('the lookup never holds up the open: the launch waits for it, bounded by the resolver', async t => {
  let release, releasedAt;
  const slow = new Promise(resolve => { release = resolve; });
  const pending = launchOf(t, {resolveCursor: () => slow});
  setTimeout(() => { releasedAt = Date.now(); release({label: 'late', color: '#1f883d', enabled: true}); }, 150);
  const {launch, openedAt} = await pending;
  assert.ok(openedAt < releasedAt, 'the open returned before the context was resolved');
  assert.equal(launch.env.CUA_CURSOR_LABEL, 'late');
});

test('with the vendor\'s engine no cursor is resolved and the launch carries none', async t => {
  const {launch, asked} = await launchOf(t, {env: {CUA_NATIVE_ENGINE: 'vendor'}, resolveCursor: async () => assert.fail('not resolved')});
  assert.ok(launch);
  assert.equal(asked.length, 0);
  assert.deepEqual(cursorOf(launch.env), {});
});
