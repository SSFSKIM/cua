import './helpers/scratch-home.mjs'; // first: the native engine's selection must not read the account's own settings
// The live secret fixtures' servers (scripts/accept/serve-with-store.mjs, scripts/probe/serve-fake-sky-target.mjs) run
// with HOME set to a temporary store home; their engine is still selected from the account's own engine.json and
// approved engine (scripts/accept/secret-seed.mjs accountEngine, through serve's and openConnection's `engine` seam), so
// CUA_NATIVE_ENGINE=cua serves the account's approved engine while the store stays the temporary one (#117 M3.4).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {openConnection} from '../src/mcp/connection.mjs';
import {replHostFor} from '../src/runtime/launch.mjs';
import {storeDir} from '../src/secrets/store.mjs';
import {accountEngine, createStoreHome} from '../scripts/accept/secret-seed.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';

const DARWIN = {platform: 'darwin', arch: 'arm64'};
const NODE24 = '/fixture/node24/bin/node';
const APP = {bundlePath: '/Users/someone/Library/Application Support/cua/engine/cua Engine.app', engineVersion: '0.2.0', build: 'f'.repeat(64), approvedAt: '2026-10-20T00:00:00.000Z'};
const STOP = Object.assign(new Error('stopped before spawn'), {code: 'test_stop'});

function storeHome(t) {
  const home = createStoreHome('cua-test-store-');
  t.after(() => rmSync(home, {recursive: true, force: true}));
  mkdirSync(storeDir({HOME: home}), {recursive: true, mode: 0o700});
  return home;
}

// A connection opened as serve-with-store opens it (HOME the store's), its launch captured and stopped before spawn.
async function launchOf(t, {env, engine}) {
  const home = fakeInstalledHome(t, {host: DARWIN});
  const input = new PassThrough(), output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const launches = [];
  const opened = await openConnection({home, env, host: DARWIN, sessionId: randomUUID(), input, output, diagnostics: () => {},
    prepareLaunch: launch => { launches.push(launch); throw STOP; }, chrome: {}, listBackends: async () => ({backends: []}), resolveOwnNode: () => NODE24, engine})
    .then(connection => ({connection}), error => ({error}));
  if (opened.error) return {error: opened.error};
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'serve-engine', version: '0'}}}) + '\n');
  for (let i = 0; i < 200 && !frames.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
  input.end();
  await opened.connection.closed;
  return {launch: launches[0]};
}

test('a server whose HOME is a temporary store home serves the pinned cua engine through the engine seam, the store staying the temporary one', async t => {
  const user = storeHome(t);
  const env = {PATH: '/usr/bin:/bin', HOME: user, CUA_SHIM_SURFACES: 'computer', CUA_SHIM_SECRETS: 'on', CUA_NATIVE_ENGINE: 'cua'};
  // Without the seam the selection looks for the approved engine under the store home, finds none and refuses.
  const refused = await launchOf(t, {env});
  assert.equal(refused.error?.code, 'engine_not_installed', refused.error?.message);
  // With it, the account's approved engine is served and the secret store is still the temporary home's.
  const {launch, error} = await launchOf(t, {env, engine: {config: () => ({}), installed: () => APP}});
  assert.ok(launch, error?.message);
  assert.deepEqual(launch.nativeEngine, {engine: 'cua', version: APP.engineVersion, build: APP.build});
  assert.deepEqual(launch.replHost, {host: 'cua', reason: 'cua_engine'});
  assert.equal(launch.env.CUA_ENGINE_APP, APP.bundlePath);
  assert.equal(launch.env.CUA_SECRETS_DIR, storeDir({HOME: user}));
});

test('accountEngine reads engine.json and the approved engine from the account\'s home, never the server\'s HOME', t => {
  const account = storeHome(t), store = storeHome(t);
  mkdirSync(join(account, '.config', 'cua'), {recursive: true});
  writeFileSync(join(account, '.config', 'cua', 'engine.json'), JSON.stringify({engine: 'cua'}));
  const select = engine => {
    try { return replHostFor({platform: 'darwin', surfaces: ['computer'], ambient: {HOME: store}, resolveOwnNode: () => NODE24, engine}); } catch (error) { return {code: error.code}; }
  };
  // The store home has no setting: on its own the selection is the default vendor engine.
  assert.deepEqual(select(undefined).engine, {engine: 'vendor', reason: 'default', status: 'pass'});
  // The account's setting selects cua's engine; the account has no approved engine either, so the setting is refused.
  assert.deepEqual(accountEngine(account).config(), {engine: 'cua'});
  assert.equal(accountEngine(account).installed(), null);
  assert.equal(select(accountEngine(account)).code, 'engine_not_installed');
});
