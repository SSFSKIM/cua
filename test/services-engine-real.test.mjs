// cua's own macOS engine service against the real debug engine (src/services/engine/; docs/doperpowers/specs/2026-10-18-
// own-native-engine-design.md, Design "The service", Verification system part 7: "the untrusted-engine error path"),
// driven through the facade (src/cua-api/sky.mjs over the real trusted wrapper). The engine is launched by the service's
// own client through a stand-in for the LaunchServices relay that runs the debug executable under CUA_ENGINE_SOCKET.
//
// Nothing here may raise a permission prompt on a Mac someone works at: the cases that run everywhere stop before the
// engine's Accessibility check (list_apps, a forbidden or unknown app refused at resolution, a declined approval), and no
// app is launched, observed or driven. The one case that reaches the check, the untrusted engine's permissionsPending,
// calls the prompting request, so it runs only on the hosted CI runner (GITHUB_ACTIONS=true), which has no console and,
// by the spec, no grants; test/services-engine-service.test.mjs covers the same path everywhere with a fake engine.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {nativePipe} from './helpers/fake-engine.mjs';
import {debugEngine, engineSkip, engineVersionFromSource, startEngine} from './helpers/engine-wire.mjs';
import {approvalMemory} from '../src/repl-host/elicitation.mjs';
import {createSkyService} from '../src/services/sky.mjs';
import {createEngineClient} from '../src/services/engine/client.mjs';
import {createService} from '../src/services/engine/service.mjs';

const finderRunning = !engineSkip && spawnSync('pgrep', ['-x', 'Finder'], {stdio: 'ignore'}).status === 0;
const finderSkip = engineSkip || (!finderRunning && 'Finder is not running in this session');
// The hosted runner only: the request prompts for Accessibility where a console could show it.
const untrustedSkip = finderSkip || (process.env.GITHUB_ACTIONS !== 'true' && 'calls the prompting Accessibility request: hosted CI runner only (GITHUB_ACTIONS=true)');

let bin;
let buildFailure = null;
before(() => {
  if (engineSkip) return;
  try { bin = debugEngine(); } catch (error) { buildFailure = error.message.split('\n').find(line => /error:/.test(line)) ?? error.message.split('\n')[0]; }
});

let facadeInstance = 0;

// A session whose engine the service's client launches on its first call; `answer` is the client's approval answer.
async function session(t, {answer = () => ({action: 'decline', content: null, _meta: null})} = {}) {
  if (buildFailure) { t.skip(`the debug engine does not build from the current native/engine source: ${buildFailure}`); return null; }
  const s = shortScratch('cua-ere-');
  t.after(s.cleanup);
  const socket = join(s.dir, 'engine.sock');
  const asked = [];
  const memory = approvalMemory();
  const nodeRepl = {
    env: {CUA_ENGINE_APP: join(s.dir, 'cua Engine.app'), TMPDIR: s.dir},
    requestMeta: null,
    nativePipe: nativePipe(),
    launchServices: {openApplication: async () => { await startEngine(t, bin, {socket}); }},
    createElicitation: async request => {
      const message = {message: request.message, meta: request.meta};
      const recalled = memory.recall(message);
      if (recalled) { const {ok, ...fields} = recalled; return fields; }
      asked.push(request);
      const outcome = {ok: true, ...answer(request)};
      memory.record(message, outcome);
      const {ok, ...fields} = outcome;
      return fields;
    },
    setResponseMeta: () => {},
    withSuspendedTimeout: fn => fn(),
  };
  const client = createEngineClient({nodeRepl, appPath: nodeRepl.env.CUA_ENGINE_APP, socketPath: socket,
    expected: {engineVersion: engineVersionFromSource(), build: 'unbundled'}, launchWaitMs: 15_000});
  t.after(() => client.close());
  const wrapper = createSkyService({loadVendor: async () => createService({nodeRepl, client}), secrets: {read: async () => assert.fail('no secret is read')}, platform: 'darwin'});
  const saved = globalThis.nodeRepl;
  globalThis.nodeRepl = {rpc: async (_name, request) => wrapper.handleRpc(request)};
  try {
    const {sky} = await import(`../src/cua-api/sky.mjs?engine-real=${++facadeInstance}`);
    return {sky, client, asked};
  } finally {
    globalThis.nodeRepl = saved;
  }
}

test('the real engine through the facade: list_apps in the vendor\'s row shape, the engine launched by the service on the first call', {skip: engineSkip}, async t => {
  const s = await session(t);
  if (!s) return;
  const rows = await s.sky.list_apps();
  assert.ok(Array.isArray(rows) && rows.length > 0);
  for (const row of rows) {
    assert.equal(typeof row.id, 'string');
    assert.equal(typeof row.isRunning, 'boolean');
    for (const key of Object.keys(row)) assert.ok(['id', 'displayName', 'isRunning', 'lastUsedDate', 'useCount'].includes(key), key);
  }
});

test('the real engine through the facade: a forbidden app is refused with the vendor\'s sentence and an unknown one as invalidApp, nothing asked or launched', {skip: engineSkip}, async t => {
  const s = await session(t);
  if (!s) return;
  await assert.rejects(s.sky.get_app_state({app: 'com.apple.keychainaccess', disableDiff: true}),
    {message: 'Computer Use is not allowed to use the app \'com.apple.keychainaccess\' for safety reasons.'});
  await assert.rejects(s.sky.get_app_state({app: 'io.github.ssfskim.cua.test.no-such-app', disableDiff: true}), error => /^Computer Use server error -10010: No app matches /.test(error.message));
  assert.equal(s.asked.length, 0);
});

test('the real engine through the facade: a declined app fails "Computer Use was not approved to use Finder" before anything observes it', {skip: finderSkip}, async t => {
  const s = await session(t);
  if (!s) return;
  await assert.rejects(s.sky.get_app_state({app: 'com.apple.finder', disableDiff: true}), {message: 'Computer Use was not approved to use Finder'});
  assert.equal(s.asked.length, 1);
  assert.deepEqual(s.asked[0].meta.tool_params, {app: 'com.apple.finder'}, 'the approval names the bundle the engine resolved');
});

test('the untrusted engine: with no Accessibility grant, an approved observation fails permissionsPending with the engine\'s sentence', {skip: untrustedSkip}, async t => {
  const s = await session(t, {answer: () => ({action: 'accept', content: null, _meta: {persist: 'session'}})});
  if (!s) return;
  await s.client.connect();
  const status = await s.client.status();
  if (status.accessibility) { t.skip('this runner grants the engine Accessibility, so the untrusted path cannot be reached here'); return; }
  await assert.rejects(s.sky.get_app_state({app: 'com.apple.finder', disableDiff: true}), error =>
    error.message.startsWith('Computer Use server error -10014: cua Engine needs the Accessibility permission')
    && error.message.includes('System Settings > Privacy & Security > Accessibility'));
});
