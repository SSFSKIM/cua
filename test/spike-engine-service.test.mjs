// The own native engine spike's service (scripts/spike/engine/service.mjs; docs/doperpowers/specs/2026-10-18-own-native-
// engine-design.md, M0 "Spike", Design "The service", and the Decision Log's pre-flight entry as revised on 2026-10-19:
// resolve_app on the first app-scoped call per (connection, app string), the identity kept for the connection and
// re-resolved only when a result's identity differs or the engine reports the app not running; one elicitation per
// (connection, app) with repeats answered by the service). A fake nodeRepl
// (elicitation, response meta, timeout suspension, nativePipe over node:net) and a fake engine; synthetic trees only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import {join} from 'node:path';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {EngineFailure, nativePipe, startFakeEngine} from './helpers/fake-engine.mjs';
import {createEngineClient} from '../scripts/spike/engine/client.mjs';
import {render} from '../scripts/spike/engine/render.mjs';
import {METHODS, createService} from '../scripts/spike/engine/service.mjs';
import {createSkyService} from '../src/services/sky.mjs';
import {isTextEditApproval} from '../scripts/accept/lib.mjs';

const APPS = {
  TextEdit: {appPath: '/System/Applications/TextEdit.app', bundleIdentifier: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true, pid: 501},
  Finder: {appPath: '/System/Library/CoreServices/Finder.app', bundleIdentifier: 'com.apple.finder', displayName: 'Finder', isRunning: true, pid: 502},
  Terminal: {appPath: '/System/Applications/Utilities/Terminal.app', bundleIdentifier: 'com.apple.Terminal', displayName: 'Terminal', isRunning: true, pid: 503},
};
const byPath = Object.fromEntries(Object.values(APPS).map(app => [app.appPath, app]));

const skyshotFor = (app, revision = 1) => ({
  app: {bundleIdentifier: app.bundleIdentifier, displayName: app.displayName, appPath: app.appPath, pid: app.pid},
  window: {title: 'Untitled', frame: {x: 0, y: 0, width: 600, height: 400}, pid: app.pid},
  lineage: `lineage-${app.displayName}`, revision,
  nodes: [
    {index: 0, depth: 0, pid: app.pid, role: 'AXWindow', subrole: 'AXStandardWindow', roleDescription: 'standard window', title: 'Untitled', description: null,
      value: null, valueMarkdown: null, identifier: null, flags: {enabled: true, focused: false, selected: false, settable: false}, actions: ['AXRaise'], frame: null, children: 1},
    {index: 1, depth: 1, pid: app.pid, role: 'AXTextArea', subrole: null, roleDescription: 'text entry area', title: null, description: null,
      value: 'synthetic', valueMarkdown: null, identifier: 'First Text View', flags: {enabled: true, focused: true, selected: false, settable: true}, actions: [], frame: null, children: 0},
  ],
  truncated: null, screenshot: {url: 'file:///tmp/shot.jpg', width: 600, height: 400}, focused: 1, selectedText: null, timings: {totalMs: 12.5},
});

// The fake engine (resolve_app by name or path; get_app_state; click etc. as the spike's stubs) and a service on a fake
// nodeRepl. `elicit(request)` answers elicitations; `handlers` override the engine's.
async function setup(t, {elicit = () => ({action: 'accept', content: null, _meta: null}), handlers = {}} = {}) {
  const s = shortScratch('cua-svc-');
  t.after(s.cleanup);
  const socket = join(s.dir, 'engine.sock');
  const state = {suspended: 0, meta: {}, elicitations: [], suspendedDuring: {}};
  const during = method => { (state.suspendedDuring[method] ??= []).push(state.suspended > 0); };
  const engine = await startFakeEngine(t, socket, {handlers: {
    'execute:resolve_app': ({args}) => {
      during('resolve_app');
      const app = APPS[args.app] ?? byPath[args.app];
      if (!app) throw new EngineFailure(-10010, `invalidApp: ${args.app}`, 'invalidApp');
      return app;
    },
    'execute:get_app_state': ({args}) => { during('get_app_state'); return skyshotFor(byPath[args.app]); },
    'execute:list_apps': () => [{id: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true}, {id: 'io.example.old', displayName: 'Old', isRunning: false, lastUsedDate: 1.5, useCount: 2}],
    'execute:click': () => { during('click'); throw new EngineFailure(-10005, 'click is not implemented by this engine build', 'notImplemented'); },
    'execute:press_key': () => { throw new EngineFailure(-10005, 'press_key is not implemented by this engine build', 'notImplemented'); },
    'execute:type_text': () => { throw new EngineFailure(-10005, 'type_text is not implemented by this engine build', 'notImplemented'); },
    ...handlers,
  }});
  const nodeRepl = {
    env: {CUA_ENGINE_APP: join(s.dir, 'cua Engine.app'), TMPDIR: s.dir},
    requestMeta: {'x-codex-turn-metadata': {call_id: 'call-7'}},
    nativePipe: nativePipe(),
    launchServices: {openApplication: async () => {}},
    createElicitation: async request => { state.elicitations.push(structuredClone(request)); return elicit(request); },
    setResponseMeta: meta => Object.assign(state.meta, structuredClone(meta)),
    withSuspendedTimeout: async fn => { state.suspended++; try { return await fn(); } finally { state.suspended--; } },
  };
  const client = createEngineClient({nodeRepl, appPath: nodeRepl.env.CUA_ENGINE_APP, socketPath: socket, expected: {engineVersion: '0.1.0', build: 'b1'}});
  t.after(() => client.close());
  const service = createService({nodeRepl, client});
  const execute = (method, input) => service.handleRpc({type: 'execute', method, args: [input]});
  return {engine, service, execute, state, dir: s.dir};
}

test('setup answers the facade\'s mac target and its 11 methods, in the vendor\'s order', async t => {
  const {service, engine} = await setup(t);
  assert.deepEqual(await service.handleRpc({type: 'setup'}), {target: 'mac', methods: METHODS});
  assert.deepEqual(METHODS, ['list_apps', 'get_app_state', 'click', 'drag', 'paste', 'perform_secondary_action', 'press_key', 'scroll', 'select_text', 'set_value', 'type_text']);
  assert.equal(engine.received.length, 0, 'setup needs no engine');
  await assert.rejects(service.handleRpc({type: 'execute', method: 'launch_app', args: [{app: 'x'}]}), {message: 'Sky runtime method is not available: launch_app'});
});

test('get_app_state resolves the app first, asks once, observes by path with a screenshot, and renders the tree', async t => {
  const {execute, engine, state, dir} = await setup(t);
  const result = await execute('get_app_state', {app: 'TextEdit', disableDiff: true});
  const app = APPS.TextEdit;
  assert.deepEqual(result, {app: app.appPath, screenshot: {url: 'file:///tmp/shot.jpg'}, text: render(skyshotFor(app))});
  assert.ok(result.text.startsWith('Window: "Untitled", App: TextEdit.\n0 standard window Untitled, Secondary Actions: Raise\n'));
  const [resolve, observe] = engine.executes();
  assert.deepEqual([resolve.method, resolve.args], ['resolve_app', {app: 'TextEdit'}]);
  assert.equal(observe.method, 'get_app_state');
  assert.equal(observe.args.app, app.appPath, 'the bound identity is the resolved path, as the vendor binds');
  assert.equal(observe.args.disableDiff, true);
  assert.equal(observe.args.includeScreenshot, true, 'the facade cannot say which observations want the image, so every one asks, as the vendor\'s does');
  assert.equal(observe.args.outputDirectory, join(dir, 'cua-engine-screenshots'));
  assert.equal(statSync(observe.args.outputDirectory).mode & 0o777, 0o700);
  assert.deepEqual(state.suspendedDuring, {resolve_app: [false], get_app_state: [true]}, 'the engine\'s work runs under the suspended budget, the policy round trip does not');
  assert.deepEqual(state.meta['codex/toolSurface'], {app: {appId: 'com.apple.TextEdit', kind: 'appId'}, kind: 'computerUse'});
  assert.deepEqual(state.meta['cua/nativeEngine'], {engine: 'cua', version: '0.1.0', build: 'b1'});
  assert.equal(typeof state.meta['cua/engineMs'], 'number');
  assert.equal(state.elicitations.length, 1);
});

test('get_app_state forwards the engine\'s spike switches a call names, and only those', async t => {
  const {execute, engine} = await setup(t);
  await execute('get_app_state', {app: 'TextEdit', prefetch: 'hierarchy', valueMarkdown: false, focusableSelectable: false, webAreaWait: false, settle: true, readSet: 'full', other: 'dropped'});
  await execute('get_app_state', {app: 'TextEdit'});
  const [named, plain] = engine.executes().filter(p => p.method === 'get_app_state').map(p => p.args);
  const switches = ['prefetch', 'valueMarkdown', 'focusableSelectable', 'webAreaWait', 'settle', 'readSet'];
  assert.deepEqual(Object.fromEntries(switches.map(name => [name, named[name]])),
    {prefetch: 'hierarchy', valueMarkdown: false, focusableSelectable: false, webAreaWait: false, settle: true, readSet: 'full'});
  assert.equal('other' in named, false);
  for (const name of switches) assert.equal(name in plain, false, `${name} is absent unless named`);
});

test('the approval: the vendor\'s message and meta, which the harness matcher accepts; one per app per connection', async t => {
  const {execute, engine, state} = await setup(t);
  await execute('get_app_state', {app: 'TextEdit'});
  await execute('get_app_state', {app: '/System/Applications/TextEdit.app'});
  await assert.rejects(execute('click', {app: '/System/Applications/TextEdit.app', element_index: 1}), /not implemented/);
  assert.equal(state.elicitations.length, 1, 'repeats for the same app are answered by the service');
  assert.deepEqual(engine.executes().filter(p => p.method === 'resolve_app').map(p => p.args.app), ['TextEdit', APPS.TextEdit.appPath],
    'resolve_app once per app string in the connection');
  const [request] = state.elicitations;
  assert.deepEqual(request, {
    message: 'Allow Computer Use to use "TextEdit"?',
    meta: {
      codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', connector_name: 'Computer Use', persist: ['session'], riskLevel: 'low',
      tool_call_id: 'call-7', tool_name: 'get_app_state', tool_params: {app: 'com.apple.TextEdit'},
      tool_params_display: [{name: 'app', display_name: 'App', value: 'TextEdit'}],
    },
  });
  // The MCP request a host makes of it (the vendor's node_repl adds mode: form; R/A-contract.md §2.6).
  assert.ok(isTextEditApproval({method: 'elicitation/create', params: {message: request.message, requestedSchema: {type: 'object', properties: {}}, mode: 'form', _meta: request.meta}}));
  await execute('get_app_state', {app: 'Finder'});
  assert.equal(state.elicitations.length, 2, 'another app asks again');
  assert.equal(state.elicitations[1].message, 'Allow Computer Use to use "Finder"?');
});

test('resolution is kept per (connection, app string): a second call makes no resolve_app, concurrent first calls share one', async t => {
  const {execute, engine} = await setup(t);
  await Promise.all([execute('get_app_state', {app: 'TextEdit'}), execute('get_app_state', {app: 'TextEdit'})]);
  await execute('get_app_state', {app: 'TextEdit'});
  await assert.rejects(execute('click', {app: 'TextEdit', element_index: 1}), /not implemented/);
  assert.deepEqual(engine.executes().map(p => p.method), ['resolve_app', 'get_app_state', 'get_app_state', 'get_app_state', 'click']);
});

test('an observation whose pid differs from the kept identity drops it, and the next call resolves again', async t => {
  let pid = 501;
  const {execute, engine, state} = await setup(t, {handlers: {
    'execute:resolve_app': ({args}) => ({...(APPS[args.app] ?? byPath[args.app]), pid}),
    'execute:get_app_state': ({args}) => { const shot = skyshotFor(byPath[args.app]); return {...shot, app: {...shot.app, pid}}; },
  }});
  await execute('get_app_state', {app: 'TextEdit'});
  pid = 777;   // the app relaunched: same bundle, same path, a new process
  const result = await execute('get_app_state', {app: 'TextEdit'});
  assert.equal(result.app, APPS.TextEdit.appPath, 'the observation itself stands: the approved bundle is the same');
  await execute('get_app_state', {app: 'TextEdit'});
  await execute('get_app_state', {app: 'TextEdit'});
  assert.deepEqual(engine.executes().map(p => p.method), ['resolve_app', 'get_app_state', 'get_app_state', 'resolve_app', 'get_app_state', 'get_app_state']);
  assert.equal(state.elicitations.length, 1, 'the approval memory is unchanged');
});

test('an observation of another bundle than the approved one is discarded: resolved, approved and observed again in the same call', async t => {
  let impostor = true;
  const {execute, engine, state} = await setup(t, {handlers: {
    'execute:resolve_app': ({args}) => (impostor ? APPS.TextEdit : APPS.Finder),
    'execute:get_app_state': () => {
      const shot = skyshotFor(APPS.Finder);   // whatever the path names now is Finder
      impostor = false;
      return shot;
    },
  }});
  const result = await execute('get_app_state', {app: 'Editor'});
  assert.equal(result.app, APPS.Finder.appPath);
  assert.ok(result.text.includes('App: Finder.'));
  assert.deepEqual(engine.executes().map(p => p.method), ['resolve_app', 'get_app_state', 'resolve_app', 'get_app_state']);
  assert.deepEqual(state.elicitations.map(e => e.meta.tool_params.app), ['com.apple.TextEdit', 'com.apple.finder'], 'the new bundle is asked about before its text is returned');
  assert.equal((await execute('get_app_state', {app: 'Editor'})).app, APPS.Finder.appPath);
  assert.equal(engine.executes().filter(p => p.method === 'resolve_app').length, 2, 'the new identity is kept');
});

test('an app the engine reports not running is resolved again on the next call', async t => {
  let running = true;
  const {execute, engine} = await setup(t, {handlers: {
    'execute:click': () => {
      if (!running) throw new EngineFailure(-10007, 'Running application not found: TextEdit', 'runningApplicationNotFound');
      throw new EngineFailure(-10005, 'click is not implemented by this engine build', 'notImplemented');
    },
  }});
  await execute('get_app_state', {app: 'TextEdit'});
  running = false;
  await assert.rejects(execute('click', {app: 'TextEdit', element_index: 1}), error => error.errorName === 'runningApplicationNotFound');
  await execute('get_app_state', {app: 'TextEdit'});
  await assert.rejects(execute('click', {app: 'TextEdit', element_index: 1}), error => error.errorName === 'runningApplicationNotFound');
  assert.deepEqual(engine.executes().map(p => p.method), ['resolve_app', 'get_app_state', 'click', 'resolve_app', 'get_app_state', 'click']);
});

test('a decline is remembered for the connection; a cancel is not', async t => {
  let answer = 'decline';
  const {execute, engine, state} = await setup(t, {elicit: () => ({action: answer, content: null, _meta: null})});
  await assert.rejects(execute('get_app_state', {app: 'TextEdit'}), {message: 'Computer Use was not approved to use TextEdit'});
  await assert.rejects(execute('get_app_state', {app: 'TextEdit'}), {message: 'Computer Use was not approved to use TextEdit'});
  assert.equal(state.elicitations.length, 1);
  assert.equal(engine.executes().filter(p => p.method === 'get_app_state').length, 0, 'nothing observed without approval');
  answer = 'cancel';
  await assert.rejects(execute('get_app_state', {app: 'Finder'}), {message: 'Computer Use was not approved to use Finder'});
  answer = 'accept';
  await execute('get_app_state', {app: 'Finder'});
  assert.equal(state.elicitations.length, 3, 'the cancelled app was asked again');
});

test('concurrent first calls for one app share its one elicitation', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const {execute, state} = await setup(t, {elicit: async () => { await gate; return {action: 'accept', content: null, _meta: null}; }});
  const calls = [execute('get_app_state', {app: 'TextEdit'}), execute('get_app_state', {app: 'TextEdit'})];
  await new Promise(resolve => setTimeout(resolve, 50));
  release();
  await Promise.all(calls);
  assert.equal(state.elicitations.length, 1);
});

test('terminals and browsers are high risk, with the warning subtitle', async t => {
  const {execute, state} = await setup(t);
  await execute('get_app_state', {app: 'Terminal'});
  assert.equal(state.elicitations[0].meta.riskLevel, 'high');
  assert.match(state.elicitations[0].meta.subtitle, /introduces new risks/);
});

test('a forbidden app is refused with the engine\'s sentence and never asked about', async t => {
  const sentence = 'Computer Use is not allowed to use the app \'com.apple.keychainaccess\' for safety reasons.';
  const {execute, state} = await setup(t, {handlers: {'execute:resolve_app': () => { throw new EngineFailure(-10006, sentence, 'appNotAllowed'); }}});
  await assert.rejects(execute('get_app_state', {app: 'Keychain Access'}), error => error.message === sentence && !(error.name === 'SkyComputerUseError'));
  assert.equal(state.elicitations.length, 0);
});

test('the app must be a non-empty string, as the vendor\'s policy requires', async t => {
  const {execute, engine} = await setup(t);
  await assert.rejects(execute('get_app_state', {app: ''}), {message: 'Computer Use app approval requires a non-empty app'});
  await assert.rejects(execute('click', {element_index: 1}), {message: 'Computer Use app approval requires app to be a plain data property'});
  await assert.rejects(execute('click', null), {message: 'Computer Use app approval requires an object input'});
  assert.equal(engine.received.length, 0);
});

test('input methods forward the facade\'s arguments with the resolved path and the observation\'s lineage, and surface the engine\'s error as it is', async t => {
  const {execute, engine, state} = await setup(t);
  await execute('get_app_state', {app: 'TextEdit'});
  await assert.rejects(execute('click', {app: 'TextEdit', element_index: 1, click_count: 2}), error => error.name === 'SkyComputerUseError'
    && error.message === 'Computer Use server error -10005: click is not implemented by this engine build' && error.errorName === 'unknownError' && error.engineErrorName === 'notImplemented');
  await assert.rejects(execute('press_key', {app: 'TextEdit', key: 'super+n'}), /press_key is not implemented/);
  await assert.rejects(execute('type_text', {app: 'TextEdit', text: 'hello'}), /type_text is not implemented/);
  const sent = engine.executes().filter(p => ['click', 'press_key', 'type_text'].includes(p.method));
  assert.deepEqual(sent.map(p => [p.method, p.args, p.lineage]), [
    ['click', {app: APPS.TextEdit.appPath, element_index: 1, click_count: 2}, 'lineage-TextEdit'],
    ['press_key', {app: APPS.TextEdit.appPath, key: 'super+n'}, 'lineage-TextEdit'],
    ['type_text', {app: APPS.TextEdit.appPath, text: 'hello'}, 'lineage-TextEdit'],
  ]);
  assert.deepEqual(state.suspendedDuring.click, [true]);
});

test('an input result answers undefined and carries the engine\'s route and times as result meta; an input error carries them too', async t => {
  const meta = {inputRoute: 2, startedAt: 1000, endedAt: 1010, receivedAt: 995, hidIdleMs: 7000};
  const refusal = {startedAt: null, endedAt: null, receivedAt: 2000, hidIdleMs: 150};
  const {execute, state} = await setup(t, {handlers: {
    'execute:press_key': () => ({meta}),
    'execute:type_text': () => { throw new EngineFailure(-10016, 'The user is still interacting with \'TextEdit\'. Wait 5 seconds and retry.', 'userIntervened', {meta: refusal}); },
  }});
  assert.equal(await execute('press_key', {app: 'TextEdit', key: 'Return'}), undefined);
  assert.equal(state.meta['cua/inputRoute'], 2);
  assert.equal(state.meta['cua/settle'], null, 'settle belongs to the observation, never to an input result');
  assert.deepEqual(state.meta['cua/actionInterval'], {startedAt: 1000, endedAt: 1010});
  assert.equal(state.meta['cua/receivedAt'], 995);
  assert.equal(state.meta['cua/hidIdleMs'], 7000);
  await assert.rejects(execute('type_text', {app: 'TextEdit', text: 'x'}), error => error.errorName === 'userIntervened');
  assert.equal(state.meta['cua/engineMs'], null, 'a failed call does not keep resolve_app\'s round trip as its own');
  assert.equal(state.meta['cua/inputRoute'], null, 'the refusal carried no route: the earlier one is not left standing');
  assert.deepEqual(state.meta['cua/actionInterval'], {startedAt: null, endedAt: null});
  assert.equal(state.meta['cua/receivedAt'], 2000);
  assert.equal(state.meta['cua/hidIdleMs'], 150);
});

test('cua/settle comes from the observation the settle preceded; every call resets the per-call keys, so none outlives its call', async t => {
  let settle = 'capped';
  const {execute, state} = await setup(t, {handlers: {
    'execute:get_app_state': ({args}) => ({...skyshotFor(APPS.TextEdit), app: {...skyshotFor(APPS.TextEdit).app, appPath: args.app}, ...(settle ? {settle} : {})}),
    'execute:press_key': () => ({meta: {inputRoute: 1, startedAt: 1, endedAt: 2, receivedAt: 1, hidIdleMs: 9}}),
  }});
  await execute('press_key', {app: 'TextEdit', key: 'Return'});
  await execute('get_app_state', {app: 'TextEdit'});
  assert.equal(state.meta['cua/settle'], 'capped');
  for (const key of ['cua/inputRoute', 'cua/actionInterval', 'cua/receivedAt', 'cua/hidIdleMs'])
    assert.equal(state.meta[key], null, `${key} from the earlier press_key is reset by the observation in the same cell`);
  settle = null;
  await execute('get_app_state', {app: 'TextEdit'});
  assert.equal(state.meta['cua/settle'], null, 'an uncapped settle leaves no earlier capped one standing');
  await execute('list_apps', undefined);
  assert.equal(typeof state.meta['cua/engineMs'], 'number');
  assert.equal(state.meta['cua/settle'], null);
});

test('list_apps is not app-scoped: no resolve, no approval, the vendor\'s row shape', async t => {
  const {execute, engine, state} = await setup(t);
  assert.deepEqual(await execute('list_apps', undefined), [
    {id: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true},
    {id: 'io.example.old', displayName: 'Old', isRunning: false, lastUsedDate: 1.5, useCount: 2},
  ]);
  assert.deepEqual(engine.executes().map(p => p.method), ['list_apps']);
  assert.deepEqual(state.meta['codex/toolSurface'], {app: null, kind: 'computerUse'});
  assert.equal(state.meta['cua/nativeEngine'].engine, 'cua');
  assert.equal(state.elicitations.length, 0);
});

test('the spike-only last_observation request returns the raw Skyshot beside the text it rendered, by the bound path or the app string', async t => {
  const {service, execute} = await setup(t);
  assert.equal(await service.handleRpc({type: 'spike', op: 'last_observation', app: 'TextEdit'}), null);
  const result = await execute('get_app_state', {app: 'TextEdit'});
  const last = await service.handleRpc({type: 'spike', op: 'last_observation', app: 'TextEdit'});
  assert.deepEqual(last, {app: APPS.TextEdit.appPath, skyshot: skyshotFor(APPS.TextEdit), text: result.text});
  assert.deepEqual(await service.handleRpc({type: 'spike', op: 'last_observation', app: APPS.TextEdit.appPath}), last);
  await assert.rejects(service.handleRpc({type: 'spike', op: 'nope'}), /unknown spike request/);
});

test('behind the real trusted wrapper (src/services/sky.mjs): setup, execute and the spike request pass through it', async t => {
  const {service} = await setup(t);
  const wrapper = createSkyService({loadVendor: async () => service, secrets: null, secretsUnavailable: 'secrets_disabled', platform: 'darwin'});
  assert.deepEqual((await wrapper.handleRpc({type: 'setup'})).methods, METHODS);
  assert.equal((await wrapper.handleRpc({type: 'execute', method: 'get_app_state', args: [{app: 'TextEdit'}]})).app, APPS.TextEdit.appPath);
  assert.equal((await wrapper.handleRpc({type: 'spike', op: 'last_observation', app: 'TextEdit'})).skyshot.lineage, 'lineage-TextEdit');
});
