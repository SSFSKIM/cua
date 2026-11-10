// cua's own macOS engine service (src/services/engine/service.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-
// design.md, Design "The service" with its Result meta, "Protocol", "Indexes, tokens and handles", "Policy and
// approvals"), driven through the facade as a cell drives it: src/cua-api/sky.mjs and bind-mac-app.mjs over a
// `nodeRepl.rpc` that hands each request to the real trusted wrapper (src/services/sky.mjs), which delegates to the
// service, whose client talks to a fake engine on a Unix socket (test/helpers/fake-engine.mjs). The worker's nodeRepl
// puts the supervisor's approval memory (src/repl-host/elicitation.mjs) in front of the client's answers, as the own
// host does. Synthetic trees only; no app is observed or driven.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {EngineFailure, NO_REPLY, nativePipe, startFakeEngine} from './helpers/fake-engine.mjs';
import {node} from './native-goldens/builder.mjs';
import {approvalMemory} from '../src/mcp/approval-memory.mjs';
import {createSkyService} from '../src/services/sky.mjs';
import {bind_mac_app} from '../src/cua-api/bind-mac-app.mjs';
import {createEngineClient} from '../src/services/engine/client.mjs';
import {METHODS, createService, cursorParams} from '../src/services/engine/service.mjs';
import {infoPlist} from '../scripts/spike/engine/assemble.mjs';

const APPS = {
  TextEdit: {appPath: '/System/Applications/TextEdit.app', bundleIdentifier: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true, pid: 501},
  Finder: {appPath: '/System/Library/CoreServices/Finder.app', bundleIdentifier: 'com.apple.finder', displayName: 'Finder', isRunning: true, pid: 502},
  Chrome: {appPath: '/Applications/Google Chrome.app', bundleIdentifier: 'com.google.Chrome', displayName: 'Google Chrome', isRunning: true, pid: 503},
};
const byPath = Object.fromEntries(Object.values(APPS).map(app => [app.appPath, app]));
const NO_LONGER_VALID = 'The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.';
const ENGINE_MS = {resolve_app: 999};
const INPUT_META = {inputRoute: 3, startedAt: 1000, endedAt: 1042, receivedAt: 990, hidIdleMs: 31000, activationGuardMs: 41.5, activationClick: 'posted',
  activationClickKind: {kind: 'activationPoint'}, activationJoin: 'rearmed', pointUnconfirmed: true};
// Route 3's delivery guard after a pointer action (#200): one restore, under the cap.
const DELIVERY = {restores: 1, frontmostRestored: false, otherAppFront: false, restoreLatencyMs: 10, guardMs: 40, screenHoldMs: 52.5, capped: false,
  raiseLeft: false, holdStartedAt: 1793399999947, releasedAt: 1793400000000};

const win = title => node('t0', 0, 'AXWindow', {roleDescription: 'standard window', title, actions: ['AXRaise']});
const button = (token, title) => node(token, 1, 'AXButton', {roleDescription: 'button', title, actions: ['AXPress']});

// The tree the fake engine answers for an app: its lineage, revision and nodes are the test's to move.
function scene(app, overrides = {}) {
  return {
    app: {bundleIdentifier: app.bundleIdentifier, displayName: app.displayName, appPath: app.appPath, pid: app.pid, catalyst: false},
    window: {title: 'Untitled', frame: {x: 0, y: 0, width: 600, height: 400}, pid: app.pid},
    lineage: `L-${app.displayName}`, revision: 1, nodes: [win('Untitled'), button('t1', 'OK'), button('t2', 'Cancel')],
    menuBar: [], truncated: null, screenshot: null, focused: null, selectedText: null, selectedElements: [], timings: {totalMs: 1},
    ...overrides,
  };
}

let facadeInstance = 0;

// A session: the fake engine, the worker's nodeRepl, the service behind the real wrapper, and the facade over it.
// `handlers` override the engine's; `answer(request)` is the client's answer to an approval (accept for the session).
async function session(t, {handlers = {}, answer = () => ({action: 'accept', content: null, _meta: {persist: 'session'}}), secrets = {}, env = {},
  identity} = {}) {
  const s = shortScratch('cua-esv-');
  t.after(s.cleanup);
  const socket = join(s.dir, 'engine.sock');
  const shot = join(s.dir, 'shot.jpg');
  writeFileSync(shot, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const trees = new Map(Object.values(APPS).map(app => [app.appPath, scene(app, {screenshot: {url: pathToFileURL(shot).href, width: 600, height: 400, scale: 1}})]));
  const record = {elicitations: [], asked: [], meta: [], items: [], budget: 0, suspendedAt: {}};
  const during = method => { (record.suspendedAt[method] ??= []).push(record.budget > 0); };
  const engine = await startFakeEngine(t, socket, {identity, handlers: {
    'execute:resolve_app': ({args}) => {
      during('resolve_app');
      const app = APPS[args.app] ?? byPath[args.app] ?? Object.values(APPS).find(each => each.bundleIdentifier === args.app);
      if (!app) throw new EngineFailure(-10010, 'invalidApp', 'invalidApp');
      return app;
    },
    'execute:get_app_state': ({args}) => { during('get_app_state'); return trees.get(args.app); },
    'execute:list_apps': () => { during('list_apps'); return [{id: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true, extra: 1}, {id: 'io.example.old', displayName: 'Old', isRunning: false, lastUsedDate: 1.5, useCount: 2}]; },
    'execute:click': () => { during('click'); return {meta: INPUT_META}; },
    'execute:press_key': () => ({meta: {...INPUT_META, inputRoute: "2'", activationGuardMs: undefined, activationClick: undefined, activationClickKind: undefined, activationJoin: undefined, pointUnconfirmed: undefined}}),
    'execute:type_text': () => ({meta: {...INPUT_META, inputRoute: "2'"}}),
    ...handlers,
  }});
  const memory = approvalMemory();
  const meta = {};
  const nodeRepl = {
    env: {CUA_ENGINE_APP: join(s.dir, 'cua Engine.app'), TMPDIR: join(s.dir, 'tmp'), CUA_ENGINE_SCREENSHOTS: join(s.dir, 'screenshots'), ...env},
    requestMeta: {'x-codex-turn-metadata': {call_id: 'call-7'}},
    nativePipe: nativePipe(),
    launchServices: {openApplication: async () => assert.fail('the engine is running; nothing launches it')},
    // The connection's side (cua's proxy): a remembered app is answered from memory, anything else asks the client.
    createElicitation: async request => {
      record.elicitations.push(structuredClone(request));
      const message = {message: request.message, _meta: request.meta};
      const recalled = memory.recall(message);
      if (recalled) return {...recalled, _meta: null};
      record.asked.push(structuredClone(request));
      const reply = answer(request);
      const outcome = {ok: true, ...reply};
      memory.record(message, {result: reply});
      const {ok, ...fields} = outcome;
      return fields;
    },
    setResponseMeta: value => { record.meta.push(structuredClone(value)); Object.assign(meta, structuredClone(value)); },
    emitContentItem: item => { record.items.push(item); },
    withSuspendedTimeout: async fn => { record.budget++; try { return await fn(); } finally { record.budget--; } },
  };
  const client = createEngineClient({nodeRepl, appPath: nodeRepl.env.CUA_ENGINE_APP, socketPath: socket, expected: {engineVersion: '0.1.0', build: 'b1'}});
  t.after(() => client.close());
  // The client's round trips, fixed per method: the policy's resolve_app slower than any method's, so a result meta
  // that took its time would show.
  const timed = {get identity() { return client.identity; }, execute: async (method, args, options) => ({...await client.execute(method, args, options), engineMs: ENGINE_MS[method] ?? 7.25})};
  const service = createService({nodeRepl, client: timed});
  const wrapper = createSkyService({loadVendor: async () => service, secrets: {read: async label => secrets[label]}, platform: 'darwin'});
  const saved = globalThis.nodeRepl;
  globalThis.nodeRepl = {rpc: async (name, request) => { assert.equal(name, 'sky'); return wrapper.handleRpc(request); }};
  let sky;
  try { ({sky} = await import(`../src/cua-api/sky.mjs?engine-service=${++facadeInstance}`)); } finally { globalThis.nodeRepl = saved; }
  // One facade call as one execution: its response meta starts empty.
  const call = async fn => { for (const key of Object.keys(meta)) delete meta[key]; return fn(); };
  const getApp = async app => {
    const state = await call(() => sky.get_app_state({app, disableDiff: true}));
    return {state, app: bind_mac_app(sky, state.app)};
  };
  return {engine, sky, service, wrapper, record, meta, trees, call, getApp, dir: s.dir, shot};
}

const appStates = engine => engine.executes().filter(p => p.method === 'get_app_state');

test('setup answers the facade\'s mac target and its 11 methods; other methods and request types are refused as the vendor\'s service refuses them', async t => {
  const {sky, service, engine} = await session(t);
  assert.equal(sky.target, 'mac');
  assert.deepEqual(METHODS, ['list_apps', 'get_app_state', 'click', 'drag', 'paste', 'perform_secondary_action', 'press_key', 'scroll', 'select_text', 'set_value', 'type_text']);
  assert.deepEqual(Object.keys(sky), ['target', ...METHODS]);
  await assert.rejects(service.handleRpc({type: 'execute', method: 'launch_app', args: [{app: 'x'}]}), {message: 'Sky runtime method is not available: launch_app'});
  await assert.rejects(service.handleRpc({type: 'drag_start'}), {message: 'Unsupported sky request type: drag_start'});
  assert.equal(engine.received.length, 0, 'none of this needs the engine');
});

test('getApp: resolved once, approved, observed by path with a screenshot, rendered with the service\'s numbering; the meta names the app and the engine', async t => {
  const {getApp, engine, record, meta, dir} = await session(t);
  const {state} = await getApp('TextEdit');
  assert.equal(state.app, APPS.TextEdit.appPath, 'the bound identity is the resolved path, as the vendor binds');
  assert.equal(state.text, 'Window: "Untitled", App: TextEdit.\n0 standard window Untitled, Secondary Actions: Raise\n\t1 button OK\n\t2 button Cancel\n');
  assert.match(state.screenshot.url, /^file:/);
  const [resolve, observe] = engine.executes();
  assert.deepEqual([resolve.method, resolve.args, 'lineage' in resolve], ['resolve_app', {app: 'TextEdit'}, false]);
  assert.deepEqual(observe.args, {app: APPS.TextEdit.appPath, includeScreenshot: true, outputDirectory: join(dir, 'screenshots'), disableDiff: true});
  assert.equal(existsSync(observe.args.outputDirectory), false, 'the directory the launcher names is the engine\'s to create: the worker writes nothing');
  assert.deepEqual(record.suspendedAt, {resolve_app: [false], get_app_state: [true]}, 'the observation, its settle and any launch wait run under the suspended budget; the policy round trip does not');
  assert.equal(record.asked.length, 1);
  assert.equal(record.asked[0].message, 'Allow Computer Use to use "TextEdit"?');
  assert.deepEqual(record.asked[0].meta.tool_params, {app: 'com.apple.TextEdit'}, 'the supervisor\'s memory keys on the resolved bundle id');
  assert.deepEqual(meta['codex/toolSurface'], {app: {appId: 'com.apple.TextEdit', kind: 'appId'}, kind: 'computerUse'});
  assert.deepEqual(meta['cua/nativeEngine'], {engine: 'cua', version: '0.1.0', build: 'b1'});
  assert.equal(meta['cua/engineMs'], 7.25, 'the observation\'s own round trip, not the policy\'s');
  assert.equal(meta['cua/settle'], null);
});

test('an observation without the launcher\'s screenshot directory fails with its configuration sentence before anything is asked', async t => {
  for (const value of [undefined, 'relative/screenshots']) {
    const {getApp, engine, record} = await session(t, {env: {CUA_ENGINE_SCREENSHOTS: value}});
    await assert.rejects(getApp('TextEdit'), {message: 'cua: the engine\'s screenshot directory is not configured for this runtime: CUA_ENGINE_SCREENSHOTS must name it by absolute path [engine_not_configured]'});
    assert.deepEqual([engine.executes().length, record.elicitations.length], [0, 0], String(value));
  }
});

test('every call asks; the host\'s memory answers the repeats; resolution is kept per app string, concurrent first calls sharing one', async t => {
  const {getApp, engine, record, call, sky} = await session(t);
  const {app} = await getApp('TextEdit');
  await call(() => app.getAXState());
  await call(() => Promise.all([sky.get_app_state({app: 'com.apple.TextEdit'}), sky.get_app_state({app: 'com.apple.TextEdit'})]));
  assert.equal(record.elicitations.length, 4, 'the policy asks on every call');
  assert.equal(record.asked.length, 1, 'the connection\'s memory answers every repeat for the same bundle, whatever string named it');
  assert.deepEqual(engine.executes().filter(p => p.method === 'resolve_app').map(p => p.args.app), ['TextEdit', APPS.TextEdit.appPath, 'com.apple.TextEdit']);
});

test('the diff per app: a repeat answers the no-change sentence; a screenshot-only observation advances the baseline; disableDiff renumbers from 0', async t => {
  const {getApp, call, trees, engine} = await session(t);
  const {app} = await getApp('TextEdit');
  assert.equal(await call(() => app.getAXState({emit: false})), 'There has been no change in the accessibility tree for Window: "Untitled".');
  const tree = trees.get(APPS.TextEdit.appPath);
  tree.nodes = [win('Untitled'), button('t2', 'Cancel'), button('t3', 'Help')];
  await call(() => app.getScreenshot({emit: false}));
  assert.equal(await call(() => app.getAXState({emit: false})), 'There has been no change in the accessibility tree for Window: "Untitled".',
    'the screenshot\'s observation was the baseline');
  tree.nodes = [win('Untitled'), button('t2', 'Cancel'), button('t3', 'Help'), button('t4', 'More')];
  assert.match(await call(() => app.getAXState({emit: false})), /^The following is a diff from the previous accessibility tree for Window: "Untitled" .*\n\+\t4 button More$/);
  tree.lineage = 'L-TextEdit-2';
  tree.nodes = [win('Untitled'), button('t1', 'Help'), button('t2', 'More')];
  assert.equal(await call(() => app.getAXState({disableDiffing: true, emit: false})),
    'Window: "Untitled", App: TextEdit.\n0 standard window Untitled, Secondary Actions: Raise\n\t1 button Help\n\t2 button More\n');
  assert.equal(appStates(engine).at(-1).args.disableDiff, true);
  assert.equal('disableDiff' in appStates(engine)[1].args, false, 'disableDiff is sent only when the caller passed it');
});

test('an element index becomes the lineage\'s token, every execute carrying its lineage; input results carry the engine\'s meta and return nothing', async t => {
  const {getApp, call, engine, meta, record} = await session(t);
  const {app} = await getApp('TextEdit');
  assert.equal(await call(() => app.click(2)), undefined);
  const click = engine.executes().at(-1);
  assert.deepEqual([click.method, click.args, click.lineage], ['click', {app: APPS.TextEdit.appPath, element: 't2'}, 'L-TextEdit']);
  assert.deepEqual(record.suspendedAt.click, [true]);
  assert.equal(meta['cua/inputRoute'], 3);
  assert.deepEqual(meta['cua/actionInterval'], {startedAt: 1000, endedAt: 1042});
  assert.equal(meta['cua/receivedAt'], 990);
  assert.equal(meta['cua/hidIdleMs'], 31000);
  assert.equal(meta['cua/activationGuardMs'], 41.5);
  assert.equal(meta['cua/activationClick'], 'posted');
  assert.deepEqual(meta['cua/activationClickKind'], {kind: 'activationPoint'});
  assert.equal(meta['cua/activationJoin'], 'rearmed');
  assert.equal(meta['cua/pointUnconfirmed'], true);
  assert.deepEqual(meta['cua/nativeEngine'], {engine: 'cua', version: '0.1.0', build: 'b1'});

  await call(() => app.click([120, 40], {mouseButton: 'right', clickCount: 2}));
  const coordinate = engine.executes().at(-1);
  assert.deepEqual([coordinate.args, coordinate.lineage], [{app: APPS.TextEdit.appPath, x: 120, y: 40, mouse_button: 'right', click_count: 2}, 'L-TextEdit']);

  await call(() => app.pressKey('super+s'));
  assert.equal(engine.executes().at(-1).lineage, 'L-TextEdit', 'keys carry the lineage too');
  assert.equal(meta['cua/inputRoute'], "2'");
  assert.equal(meta['cua/activationGuardMs'], null, 'a key\'s result does not inherit the click\'s guard time');
  assert.equal(meta['cua/activationClick'], null, 'nor its activation click');
  assert.equal(meta['cua/activationClickKind'], null);
  assert.equal(meta['cua/activationJoin'], null, 'nor its join');
  assert.equal(meta['cua/pointUnconfirmed'], null);
  assert.equal(engine.executes().at(-1).args.element, undefined);
});

test('model code reaches the raw methods, but only the vendor\'s fields reach the engine: no spike switch, no stray key', async t => {
  const handlers = Object.fromEntries(METHODS.filter(m => !['list_apps', 'get_app_state'].includes(m)).map(m => [`execute:${m}`, () => ({meta: INPUT_META})]));
  const {getApp, call, sky, engine} = await session(t, {handlers});
  await getApp('TextEdit');
  const app = APPS.TextEdit.appPath;
  const spike = {spikeRoute: 3, spikeKeyed: true, spikeEventSource: 1, pid: 9, settle: false, extra: 'x'};
  const sent = [
    ['click', {app, x: 1, y: 2, mouse_button: 'left', click_count: 1}],
    ['click', {app, element_index: 1}],
    ['drag', {app, from_x: 1, from_y: 2, to_x: 3, to_y: 4}],
    ['paste', {app, text: 'a', format: 'text'}],
    ['perform_secondary_action', {app, element_index: 0, action: 'AXRaise'}],
    ['press_key', {app, key: 'Return'}],
    ['scroll', {app, direction: 'down', x: 1, y: 2, pages: 0.5}],
    ['select_text', {app, element_index: 1, text: 'a', prefix: 'b', suffix: 'c', selection_type: 'cursorAfter'}],
    ['set_value', {app, element_index: 1, value: 'v'}],
    ['type_text', {app, text: 'a'}],
  ];
  for (const [method, input] of sent) {
    await call(() => sky[method]({...input, ...spike}));
    const {element_index: index, ...expected} = input;
    if (index !== undefined) expected.element = `t${index}`;
    assert.deepEqual(engine.executes().at(-1).args, expected, method);
  }
  await call(() => sky.type_text({app, text: 'a', concealed: true, spikeKeyed: true}));
  assert.deepEqual(engine.executes().at(-1).args, {app, text: 'a', concealed: true}, 'concealed, on the methods the wrapper conceals');
  await call(() => sky.press_key({app, key: 'a', concealed: true}));
  assert.deepEqual(engine.executes().at(-1).args, {app, key: 'a'}, 'and on no other');
});

test('CUA_ENGINE_SPIKE_ROUTE=1 (the route A/B\'s serve only) forwards a click\'s spikeRoute, a known route only, and no other method\'s or switch', async t => {
  const handlers = Object.fromEntries(METHODS.filter(m => !['list_apps', 'get_app_state'].includes(m)).map(m => [`execute:${m}`, () => ({meta: INPUT_META})]));
  const {getApp, call, sky, engine} = await session(t, {handlers, env: {CUA_ENGINE_SPIKE_ROUTE: '1'}});
  await getApp('TextEdit');
  const app = APPS.TextEdit.appPath;
  for (const route of ['1', "2'", '2', '3']) {
    await call(() => sky.click({app, element_index: 1, spikeRoute: route, spikeKeyed: true}));
    assert.deepEqual(engine.executes().at(-1).args, {app, element: 't1', spikeRoute: route}, route);
  }
  await call(() => sky.click({app, x: 1, y: 2}));
  assert.deepEqual(engine.executes().at(-1).args, {app, x: 1, y: 2}, 'a click without one sends none');
  const before = engine.executes().length;
  for (const route of [3, '4', '', null]) {
    await assert.rejects(call(() => sky.click({app, element_index: 1, spikeRoute: route})), /\[invalid_spike_route\]/, String(route));
  }
  assert.equal(engine.executes().length, before, 'an invalid route reaches no engine');
  await call(() => sky.press_key({app, key: 'Return', spikeRoute: '3'}));
  assert.deepEqual(engine.executes().at(-1).args, {app, key: 'Return'}, 'only a click');
  await call(() => sky.type_text({app, text: 'a', spikeRoute: '3', spikeKeyed: true}));
  assert.deepEqual(engine.executes().at(-1).args, {app, text: 'a'}, 'only a click');

  const other = await session(t, {handlers, env: {CUA_ENGINE_SPIKE_ROUTE: 'true'}});
  await other.getApp('TextEdit');
  await other.call(() => other.sky.click({app, element_index: 1, spikeRoute: '1'}));
  assert.deepEqual(other.engine.executes().at(-1).args, {app, element: 't1'}, 'only the value 1 turns it on');
});

test('an index never issued answers "<n> is an invalid element ID", a retired one the "no longer valid" sentence, before the engine is asked', async t => {
  const {getApp, call, engine, trees} = await session(t);
  const {app} = await getApp('TextEdit');
  const clicks = () => engine.executes().filter(p => p.method === 'click').length;
  await assert.rejects(call(() => app.click(9)), {message: 'Computer Use server error -10005: 9 is an invalid element ID'});
  trees.get(APPS.TextEdit.appPath).nodes = [win('Untitled'), button('t2', 'Cancel')];
  await call(() => app.getAXState({emit: false}));
  await assert.rejects(call(() => app.setValue(1, 'x')), {message: `Computer Use server error -10005: ${NO_LONGER_VALID}`});
  await assert.rejects(call(() => app.performSecondaryAction('1.5', 'AXShowMenu')), {message: 'elementIndex must be an integer'});
  assert.equal(clicks(), 0);
  assert.equal(engine.executes().filter(p => ['set_value', 'perform_secondary_action'].includes(p.method)).length, 0);
});

test('an app not yet observed on the connection: an index is no longer valid, a coordinate click goes without a lineage for the engine to refuse', async t => {
  const {sky, call, engine, meta} = await session(t, {handlers: {'execute:click': ({args, lineage}) => {
    assert.equal(lineage, undefined);
    throw new EngineFailure(-10005, 'There is no screenshot of the app\'s window to place the coordinates in. Use getScreenshot to get one.', 'noScreenshotForCoordinates', {meta: {...INPUT_META, startedAt: null, endedAt: null}});
  }}});
  const app = bind_mac_app(sky, APPS.Finder.appPath);
  await assert.rejects(call(() => app.click(0)), {message: `Computer Use server error -10005: ${NO_LONGER_VALID}`});
  assert.equal(meta['cua/engineMs'], null, 'refused in the service after the policy resolved the app: the click never reached the engine');
  await assert.rejects(call(() => app.click([1, 2])), /noScreenshot|getScreenshot/);
  assert.equal(engine.executes().filter(p => p.method === 'click').length, 1);
});

test('an input error carries the engine\'s meta; the next call\'s meta starts over', async t => {
  const meta0 = {...INPUT_META, startedAt: null, endedAt: null, activationGuardMs: 1000.2, pointUnconfirmed: undefined};
  const {getApp, call, meta} = await session(t, {handlers: {'execute:click': () => {
    throw new EngineFailure(-10005, 'The click was refused: the user\'s app lost the front during the activation guard.', 'activationFailed', {meta: meta0});
  }}});
  const {app} = await getApp('TextEdit');
  await assert.rejects(call(() => app.click(1)), {message: 'Computer Use server error -10005: The click was refused: the user\'s app lost the front during the activation guard.'});
  assert.deepEqual(meta['cua/actionInterval'], {startedAt: null, endedAt: null});
  assert.equal(meta['cua/activationGuardMs'], 1000.2);
  assert.equal(meta['cua/engineMs'], null, 'a failed call leaves no round trip standing as its own');
  assert.deepEqual(meta['cua/nativeEngine'], {engine: 'cua', version: '0.1.0', build: 'b1'});
  await call(() => app.getAXState({emit: false}));
  for (const key of ['cua/inputRoute', 'cua/actionInterval', 'cua/receivedAt', 'cua/hidIdleMs', 'cua/activationGuardMs', 'cua/pointUnconfirmed']) assert.equal(meta[key], null, key);
});

test('an unknown secondary action answers the vendor\'s sentence with the model\'s index, which only the service knows; its meta rides along', async t => {
  const refusedMeta = {...INPUT_META, inputRoute: 1, startedAt: null, endedAt: null, activationGuardMs: undefined, pointUnconfirmed: undefined};
  const {engine, getApp, call, meta} = await session(t, {handlers: {'execute:perform_secondary_action': () => {
    throw new EngineFailure(-10005, 'Frobnicate is not a valid secondary action for the element', 'invalidSecondaryAction', {meta: refusedMeta});
  }}});
  const {app} = await getApp('TextEdit');
  await assert.rejects(call(() => app.performSecondaryAction(2, 'Frobnicate')), error => {
    assert.equal(error.message, 'Computer Use server error -10005: Frobnicate is not a valid secondary action for 2');
    assert.equal(error.errorName, 'invalidSecondaryAction');
    return true;
  });
  assert.equal(engine.executes().find(p => p.method === 'perform_secondary_action').args.element, 't2', 'the engine got the token, never the index');
  assert.equal(meta['cua/inputRoute'], 1);
  assert.deepEqual(meta['cua/actionInterval'], {startedAt: null, endedAt: null});
});

test('a paste reports its route as "paste", and its clipboard sentences reach the model as the engine wrote them', async t => {
  const pasted = {...INPUT_META, inputRoute: 'paste', pointUnconfirmed: undefined};
  const timedOut = 'Timed out waiting for the application to read the clipboard';
  let fail = false;
  const {getApp, call, meta, engine} = await session(t, {handlers: {'execute:paste': () => {
    if (fail) throw new EngineFailure(-10005, timedOut, 'clipboardReadTimedOut', {meta: pasted});
    return {meta: pasted};
  }}});
  const {app} = await getApp('TextEdit');
  await call(() => app.paste('# Title', {format: 'md'}));
  assert.deepEqual(engine.executes().at(-1).args, {app: APPS.TextEdit.appPath, text: '# Title', format: 'md'});
  assert.equal(meta['cua/inputRoute'], 'paste');
  assert.equal(meta['cua/activationGuardMs'], 41.5);
  fail = true;
  await assert.rejects(call(() => app.paste('x')), {message: `Computer Use server error -10005: ${timedOut}`});
  assert.equal(meta['cua/inputRoute'], 'paste');
  assert.deepEqual(meta['cua/actionInterval'], {startedAt: 1000, endedAt: 1042}, '⌘V was posted before the wait ran out');
});

test('#187: pasteUnconfirmed and its type_text count reach the model in the message, and the paste diagnostics ride as cua/paste on results and errors alone', async t => {
  const diagnostics = {line: 2, lines: 3, notificationSource: 'untrusted', baselineEmpty: true, readWait: 'handedOver', readWaitMs: 1.2,
    readAfterPostMs: -4.5, effectWait: 'noChannel', effectWaitMs: 0, mainLagMs: 0.3, restore: 'restored',
    keyFocusAtPaste: {holds: false, frontmost: false, keyFocusProcess: false, focusedInWindow: true}};
  const unconfirmed = 'The paste could not be confirmed: ⌘V was sent and the pasted text was read from the clipboard, but no change was seen in the field. The text may have arrived: observe the field with get_app_state before any retry, and never retry blindly. Confirmed entered: 3 of 8 characters (1 of 3 lines complete); line 2 is in an unknown state.';
  const typed = {...INPUT_META, inputRoute: 'paste', pointUnconfirmed: undefined, entered: 3, paste: diagnostics};
  const {getApp, call, meta} = await session(t, {handlers: {
    'execute:type_text': () => { throw new EngineFailure(-10005, unconfirmed, 'pasteUnconfirmed', {meta: typed}); },
    'execute:paste': () => ({meta: {...typed, entered: undefined, paste: {...diagnostics, effectWait: 'reading'}}}),
    'execute:press_key': () => ({meta: {...INPUT_META, inputRoute: "2'", pointUnconfirmed: undefined}}),
  }});
  const {app} = await getApp('TextEdit');
  await assert.rejects(call(() => app.typeText('ab\ncd\nef')), error => {
    assert.equal(error.message, `Computer Use server error -10005: ${unconfirmed}`, 'the whole sentence, the count included');
    assert.equal(error.errorName, 'pasteUnconfirmed');
    return true;
  });
  assert.deepEqual(meta['cua/paste'], diagnostics);
  assert.equal(meta['cua/entered'], 3);
  await call(() => app.paste('x'));
  assert.equal(meta['cua/paste'].effectWait, 'reading', 'a landed paste carries them too');
  await call(() => app.pressKey('a'));
  assert.equal(meta['cua/paste'], null, 'none left standing after a call off the paste route');
});

test('#187, #283: a paste or type_text success the engine could not confirm, and a focusing click, put their note in the tool result\'s text; a confirmed paste adds nothing', async t => {
  const focusNote = 'Chrome\'s text field was focused through accessibility, with the caret at the point. No mouse event was sent, so the page saw no click.';
  const pasteNote = 'Pasted, unconfirmed: the app read the text after ⌘V, but this field can\'t be read back, so the change couldn\'t be seen. Observe the field if the next step depends on it.';
  const typedNote = '3 lines pasted, 1 unconfirmed: the app read each after ⌘V, but this field can\'t be read back, so the change couldn\'t be seen. Observe the field if the next step depends on it.';
  const unconfirmed = {line: 1, lines: 1, notificationSource: 'none', baselineEmpty: true, readWait: 'handedOver', readAfterPostMs: 2, effectWait: 'noChannel',
    stage: 'effect', confirmed: false, unconfirmedLines: 1, restore: 'restored'};
  let confirmedPaste = false;
  const {getApp, call, meta, record} = await session(t, {handlers: {
    'execute:paste': () => (confirmedPaste
      ? {meta: {...INPUT_META, inputRoute: 'paste', paste: {...unconfirmed, effectWait: 'reading', confirmed: true, unconfirmedLines: undefined}}}
      : {meta: {...INPUT_META, inputRoute: 'paste', paste: unconfirmed}, note: pasteNote}),
    'execute:type_text': () => ({meta: {...INPUT_META, inputRoute: 'paste', entered: 8, paste: {...unconfirmed, line: 3, lines: 3, confirmed: true}}, note: typedNote}),
    'execute:click': () => ({meta: INPUT_META, note: focusNote}),
    'execute:press_key': () => ({meta: INPUT_META, note: 'not a noted method'}),
  }});
  const {app} = await getApp('TextEdit');
  await call(() => app.paste('x'));
  assert.deepEqual(record.items, [pasteNote]);
  assert.equal(meta['cua/paste'].confirmed, false);
  assert.equal(meta['cua/paste'].stage, 'effect');
  await call(() => app.typeText('ab\ncd\nef'));
  assert.deepEqual(record.items, [pasteNote, typedNote]);
  assert.equal(meta['cua/entered'], 8);
  confirmedPaste = true;
  await call(() => app.paste('y'));
  await call(() => app.pressKey('a'));
  assert.deepEqual(record.items, [pasteNote, typedNote], 'nothing for a confirmed paste, nor for another method');
  await call(() => app.click(1));
  assert.deepEqual(record.items, [pasteNote, typedNote, focusNote], 'a focusing click\'s note (#283)');
});

test('intervention, entered and routeAdvice ride as cua/ meta on results and on the userIntervened error that stopped a type_text; the next call starts over', async t => {
  const stopped = {...INPUT_META, inputRoute: "2'", activationGuardMs: undefined, pointUnconfirmed: undefined, entered: 3};
  const {getApp, call, meta} = await session(t, {handlers: {
    'execute:type_text': () => { throw new EngineFailure(-10016, 'The user changed \'/System/Applications/TextEdit.app\'. Re-query the latest state with `get_app_state` before sending more actions.', 'userIntervened', {meta: stopped}); },
    'execute:press_key': () => ({meta: {...INPUT_META, inputRoute: "2'", activationGuardMs: undefined, pointUnconfirmed: undefined, intervention: 'off', hidIdleMs: 52000}}),
    'execute:drag': () => ({meta: {...INPUT_META, delivery: DELIVERY}}),
    'execute:click': () => { throw new EngineFailure(-10005, 'The action was not performed: another app came to the front.', 'activationFailed', {meta: {...INPUT_META, startedAt: null, endedAt: null, routeAdvice: 'add "routes": {"com.apple.TextEdit": 4}'}}); },
  }});
  const {app} = await getApp('TextEdit');
  await assert.rejects(call(() => app.typeText('hello')), /The user changed/);
  assert.equal(meta['cua/entered'], 3);
  assert.deepEqual(meta['cua/actionInterval'], {startedAt: 1000, endedAt: 1042}, 'the stopped action\'s interval');
  assert.equal(meta['cua/intervention'], null, 'detection was on');
  await call(() => app.pressKey('a'));
  assert.equal(meta['cua/intervention'], 'off');
  assert.equal(meta['cua/entered'], null, 'a key press carries no count, and none is left standing');
  assert.equal(meta['cua/hidIdleMs'], 52000);
  await call(() => app.drag([1, 2], [3, 4]));
  assert.deepEqual(meta['cua/delivery'], DELIVERY, 'route 3\'s delivery guard (#200), as the engine sent it');
  await assert.rejects(call(() => app.click(1)), /another app came to the front/);
  assert.equal(meta['cua/delivery'], null, 'a refused click carries none, and none is left standing');
  assert.equal(meta['cua/routeAdvice'], 'add "routes": {"com.apple.TextEdit": 4}');
  assert.equal(meta['cua/intervention'], null);
  await call(() => app.getAXState({emit: false}));
  for (const key of ['cua/intervention', 'cua/entered', 'cua/routeAdvice', 'cua/delivery']) assert.equal(meta[key], null, key);
});

test('cua/settle rides on the observation whose settle hit its cap, and on no other', async t => {
  const {getApp, call, meta, trees} = await session(t);
  const {app} = await getApp('TextEdit');
  assert.equal(meta['cua/settle'], null);
  trees.get(APPS.TextEdit.appPath).settle = 'capped';
  await call(() => app.getAXState({emit: false}));
  assert.equal(meta['cua/settle'], 'capped');
});

// Route 3's after-action watch (#200): its repairs, made after the action answered, ride on the connection's later
// results, an input's meta or an observation's.
const AFTER_ACTION = {repairs: 2, actions: [{postedAt: 1793400000000, repairs: 2, latencyMs: 81.5}]};

test('cua/afterActionRepairs rides on a later input result and on an observation, as the engine sent it, and stands on no other call', async t => {
  let report = AFTER_ACTION;
  const {getApp, call, meta, trees} = await session(t, {handlers: {
    'execute:drag': () => ({meta: {...INPUT_META, delivery: DELIVERY, ...(report ? {afterActionRepairs: report} : {})}}),
  }});
  const {app} = await getApp('TextEdit');
  assert.equal(meta['cua/afterActionRepairs'], null);
  await call(() => app.drag([1, 2], [3, 4]));
  assert.deepEqual(meta['cua/afterActionRepairs'], AFTER_ACTION);
  report = null;
  await call(() => app.drag([1, 2], [3, 4]));
  assert.equal(meta['cua/afterActionRepairs'], null, 'none left standing from the call before');
  trees.get(APPS.TextEdit.appPath).afterActionRepairs = AFTER_ACTION;
  await call(() => app.getAXState({emit: false}));
  assert.deepEqual(meta['cua/afterActionRepairs'], AFTER_ACTION, 'an observation after the last action reports its repairs too');
});

// The engine's observation diagnostics (Skyshot timings) as Chromium and Electron rows need them: enablement, the web
// area's wait and the settle.
const DIAGNOSED_TIMINGS = {totalMs: 1, walkMs: 3.5, nodes: 40, webShaped: true, appRoleReadMs: 0.375, enablementPrior: 'false', enabled: 'AXManualAccessibility', enablementWrite: 'failed', enablementWriteError: -25204, chromium: true, webAreaSeen: true,
  webAreaFound: true, webAreaWaitMs: 12.25, unplacedClips: 1, clipReread: 'unplaced', clipRereadReads: 7, clipRereadMs: 731.5, settle: 'settled', settleMs: 251.5, settleNotifications: 3, settleNotificationCounts: {AXValueChanged: 2, AXFocusedUIElementChanged: 1},
  settleBusyWalks: 0, settleBusyVetoes: 0, settleObserved: true, settleQuietAtMs: 101.125, settleTreeReused: true, focusRead: 'notAnElement', enableMs: 0.5};

test('the observation\'s diagnostics ride only as cua/observation meta, a bounded whitelist; the model-facing result is byte-identical with and without them', async t => {
  const {getApp, call, meta, trees, service} = await session(t);
  const {app} = await getApp('TextEdit');
  const tree = trees.get(APPS.TextEdit.appPath);
  assert.deepEqual(meta['cua/observation'], {focusedIndex: null}, 'timings with none of the diagnostics: the focus read alone (#188)');
  // The same observation with and without the diagnostics: what the facade returns (what a cell prints, the model's
  // text) and what the service answers are the same bytes.
  const plain = {facade: JSON.stringify(await call(() => app.getAXStateAndScreenshot({emit: false, disableDiffing: true})))};
  plain.service = JSON.stringify(await call(() => service.handleRpc({type: 'execute', method: 'get_app_state', args: [{app: APPS.TextEdit.appPath, disableDiff: true}]})));
  plain.meta = {...meta};
  tree.timings = {...DIAGNOSED_TIMINGS, settleNotificationCounts: {...DIAGNOSED_TIMINGS.settleNotificationCounts}, extra: {nested: 'x'}, longLabel: 'y'.repeat(200)};
  const diagnosed = {facade: JSON.stringify(await call(() => app.getAXStateAndScreenshot({emit: false, disableDiffing: true})))};
  diagnosed.service = JSON.stringify(await call(() => service.handleRpc({type: 'execute', method: 'get_app_state', args: [{app: APPS.TextEdit.appPath, disableDiff: true}]})));
  assert.equal(diagnosed.facade, plain.facade);
  assert.equal(diagnosed.service, plain.service);
  for (const word of ['webShaped', 'enablementPrior', 'settleTreeReused', 'webArea', 'unplacedClips', 'clipReread', 'AXManualAccessibility', 'AXValueChanged']) assert.ok(!diagnosed.service.includes(word), word);
  // The js tool result the host assembles from the execution: the content is the cell's output alone; the meta rides
  // apart in _meta, never in content.
  const {assembleResult} = await import('../src/repl-host/results.mjs');
  const output = JSON.parse(diagnosed.service).text;
  assert.deepEqual(assembleResult({ok: true, output, responseMeta: {...meta}}).content, assembleResult({ok: true, output, responseMeta: plain.meta}).content);
  assert.deepEqual(meta['cua/observation'], {webShaped: true, appRoleReadMs: 0.375, enablementPrior: 'false', enabled: 'AXManualAccessibility', enablementWrite: 'failed', enablementWriteError: -25204, chromium: true, webAreaSeen: true, webAreaFound: true,
    webAreaWaitMs: 12.25, unplacedClips: 1, clipReread: 'unplaced', clipRereadReads: 7, clipRereadMs: 731.5, settle: 'settled', settleMs: 251.5, settleNotifications: 3, settleNotificationCounts: {AXValueChanged: 2, AXFocusedUIElementChanged: 1},
    settleBusyWalks: 0, settleBusyVetoes: 0, settleObserved: true, settleQuietAtMs: 101.125, settleTreeReused: true, focusRead: 'notAnElement', focusedIndex: null},
  'the whitelist only: no phase timing, node count or unknown key, nothing nested beyond the notification counts');
  // An input call resets it, and an observation without the diagnostics leaves it reset.
  await call(() => app.click(1));
  assert.equal(meta['cua/observation'], null);
  tree.timings = {totalMs: 1};
  await call(() => app.getAXState({emit: false}));
  assert.deepEqual(meta['cua/observation'], {focusedIndex: null});
});

// #188: the focus a selection cannot mask. The trailer shows selected text instead of the focused element (render.mjs
// trailer), so the observation's meta names the app's focused element by its index and role, and the engine's focus
// read when it named none; never its text.
test('cua/observation names the focused element by index and role whatever the trailer shows, and the focus read when none was named', async t => {
  const {getApp, call, meta, trees} = await session(t);
  const {app} = await getApp('TextEdit');
  const tree = trees.get(APPS.TextEdit.appPath);
  Object.assign(tree, {focused: 't2', selectedText: 'a secret selection'});
  const text = await call(() => app.getAXState({emit: false, disableDiffing: true}));
  assert.ok(text.includes('Selected text:') && !text.includes('The focused UI element is'), 'the selection masks the trailer\'s focus line');
  assert.deepEqual(meta['cua/observation'], {focusedIndex: 2, focusedRole: 'AXButton'});
  assert.ok(!JSON.stringify(meta['cua/observation']).includes('secret'), 'value-free');
  Object.assign(tree, {selectedText: null});
  assert.match(await call(() => app.getAXState({emit: false, disableDiffing: true})), /The focused UI element is 2 /, 'the same index as the unmasked trailer\'s');
  assert.deepEqual(meta['cua/observation'], {focusedIndex: 2, focusedRole: 'AXButton'});
  Object.assign(tree, {focused: null, timings: {totalMs: 1, focusRead: 'AXError -25212'}});
  await call(() => app.getAXState({emit: false}));
  assert.deepEqual(meta['cua/observation'], {focusRead: 'AXError -25212', focusedIndex: null});
});

test('an element click\'s plan rides as cua/elementClick on its result, and stands on no other call', async t => {
  const record = {plan: 'action', action: 'AXPress', reason: 'advertised', hit: 'element', hitTest: 'application'};
  const {getApp, call, meta} = await session(t, {handlers: {'execute:click': () => ({meta: {...INPUT_META, elementClick: record}})}});
  const {app} = await getApp('TextEdit');
  assert.equal(meta['cua/elementClick'], null);
  await call(() => app.click(1));
  assert.deepEqual(meta['cua/elementClick'], record);
  await call(() => app.getAXState({emit: false}));
  assert.equal(meta['cua/elementClick'], null, 'reset by the next call');
});

test('a coordinate click\'s placement rides as cua/coordinateClick on its result, and stands on no other call', async t => {
  const point = (x, y) => ({x, y});
  const record = {screenshotPoint: point(120, 168), windowPoint: point(60, 84), postedLocation: point(200, 184), postedWindowLocation: point(60, 84),
    windowFrame: {x: 140, y: 100, width: 720, height: 560}, frameBeforePost: {x: 140, y: 100, width: 720, height: 560}};
  const {getApp, call, meta} = await session(t, {handlers: {'execute:click': () => ({meta: {...INPUT_META, coordinateClick: record}})}});
  const {app} = await getApp('TextEdit');
  assert.equal(meta['cua/coordinateClick'], null);
  await call(() => app.click([120, 168]));
  assert.deepEqual(meta['cua/coordinateClick'], record);
  await call(() => app.getAXState({emit: false}));
  assert.equal(meta['cua/coordinateClick'], null, 'reset by the next call');
});

test('#288: a click\'s establishment of a page tree not yet seen rides as cua/pointerEstablish, on a refusal too', async t => {
  const record = {ms: 312.5, webAreaFound: true, rehits: 9};
  const refusal = "Google Chrome for Testing's web page does not accept a background click; use a dedicated desktop, or ask the person to bring Google Chrome for Testing forward";
  let refuse = false;
  const {getApp, call, meta} = await session(t, {handlers: {'execute:click': () => {
    if (refuse) throw new EngineFailure(-10005, refusal, 'backgroundClickRefused', {meta: {...INPUT_META, pointerEstablish: record}});
    return {meta: {...INPUT_META, pointerEstablish: record}};
  }}});
  const {app} = await getApp('TextEdit');
  await call(() => app.click([120, 168]));
  assert.deepEqual(meta['cua/pointerEstablish'], record);
  await call(() => app.getAXState({emit: false}));
  assert.equal(meta['cua/pointerEstablish'], null, 'reset by the next call');
  refuse = true;
  await assert.rejects(call(() => app.click([120, 168])));
  assert.deepEqual(meta['cua/pointerEstablish'], record);
});

test('#296: the stale-point guard\'s verdict rides as cua/stalePoint, and its refusal reaches the model with its sentence, name and meta', async t => {
  const kept = {verdict: 'kept', reason: 'nonInteractiveHit', identity: 'handle', recordedRole: 'AXButton', hitRole: 'AXStaticText', ms: 0.912};
  const refused = {verdict: 'refused', reason: 'frameMoved', identity: 'handle', recordedRole: 'AXButton', hitRole: 'AXButton', ms: 0.4};
  const sentence = 'The screen changed since the screenshot: the AXButton "Reload" it showed at this point has moved away from it. Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.';
  let refuse = false;
  const {getApp, call, meta} = await session(t, {handlers: {'execute:click': () => {
    if (refuse) throw new EngineFailure(-10005, sentence, 'screenChangedSinceScreenshot', {meta: {...INPUT_META, startedAt: null, endedAt: null, stalePoint: refused}});
    return {meta: {...INPUT_META, stalePoint: kept}};
  }}});
  const {app} = await getApp('TextEdit');
  await call(() => app.click([120, 168]));
  assert.deepEqual(meta['cua/stalePoint'], kept);
  await call(() => app.getAXState({emit: false}));
  assert.equal(meta['cua/stalePoint'], null, 'reset by the next call');
  refuse = true;
  await assert.rejects(call(() => app.click([918, 188])), error => {
    assert.equal(error.message, `Computer Use server error -10005: ${sentence}`, 'the whole sentence');
    assert.equal(error.errorName, 'screenChangedSinceScreenshot');
    return true;
  });
  assert.deepEqual(meta['cua/stalePoint'], refused);
  assert.deepEqual(meta['cua/actionInterval'], {startedAt: null, endedAt: null}, 'nothing posted');
});

test('#328: a scroll\'s confirmation rides as cua/scroll, its at-end note reaches the tool result\'s text, and scrollUnconfirmed and the out-of-screenshot refusal reach the model with their sentence, name and meta', async t => {
  const moved = {container: 'scrollArea', outcome: 'moved', moved: 120, by: 'content', polls: 3, readMs: 4.1, ms: 49.2, walked: 61};
  const atEnd = {container: 'scrollArea', outcome: 'atEnd', atEnd: true, endBefore: true, barBefore: 1, polls: 0, readMs: 3, ms: 3.2, walked: 40};
  const unconfirmed = {container: null, outcome: 'unconfirmed', polls: 0, readMs: 0.3, ms: 0.5};
  const endNote = 'What is at that point in TextEdit is already scrolled as far down as it goes.';
  const unsent = 'The scroll was sent to TextEdit, but nothing at that point was seen to move. Observe the app (take a screenshot or call getAXState()) before scrolling again.';
  const outside = 'The point (600, 2000) lies outside the screenshot, which is 1220 × 860 pixels. Give a point inside it: x from 0 to 1219 and y from 0 to 859.';
  let answer = 'moved';
  const {getApp, call, meta, record} = await session(t, {handlers: {'execute:scroll': () => {
    if (answer === 'moved') return {meta: {...INPUT_META, scroll: moved}};
    if (answer === 'atEnd') return {meta: {...INPUT_META, scroll: atEnd}, note: endNote};
    if (answer === 'outside') throw new EngineFailure(-10005, outside, 'pointOutsideScreenshot', {meta: {...INPUT_META, inputRoute: null, startedAt: null, endedAt: null}});
    throw new EngineFailure(-10005, unsent, 'scrollUnconfirmed', {meta: {...INPUT_META, scroll: unconfirmed}});
  }}});
  const {app} = await getApp('TextEdit');
  await call(() => app.scroll([300, 400], 'down', 1));
  assert.deepEqual(meta['cua/scroll'], moved);
  assert.deepEqual(record.items, [], 'no note for a move');
  answer = 'atEnd';
  await call(() => app.scroll([300, 400], 'down', 1));
  assert.deepEqual(meta['cua/scroll'], atEnd);
  assert.deepEqual(record.items, [endNote]);
  await call(() => app.getAXState({emit: false}));
  assert.equal(meta['cua/scroll'], null, 'reset by the next call');
  answer = 'unconfirmed';
  await assert.rejects(call(() => app.scroll([300, 400], 'down', 1)), error => {
    assert.equal(error.message, `Computer Use server error -10005: ${unsent}`, 'the whole sentence');
    assert.equal(error.errorName, 'scrollUnconfirmed');
    return true;
  });
  assert.deepEqual(meta['cua/scroll'], unconfirmed);
  answer = 'outside';
  await assert.rejects(call(() => app.scroll([600, 2000], 'down', 1)), error => error.errorName === 'pointOutsideScreenshot' && error.message.endsWith(outside));
  assert.equal(meta['cua/scroll'], null);
  assert.deepEqual(meta['cua/actionInterval'], {startedAt: null, endedAt: null}, 'nothing posted');
});

test('#354: type_text\'s read-back rides as cua/typeReadback, typeUnconfirmed reaches the model with its excerpt, and press_key says its effect is unconfirmed', async t => {
  const confirmed = {confirmed: true, snapshotMs: 1.2, pollMs: 21.4, reads: 3};
  const mismatch = {confirmed: false, reason: 'valueMismatch', snapshotMs: 1.1, pollMs: 1003.2, reads: 201, expectedLength: 8, actualLength: 10};
  const sentence = 'The text was typed, but the field does not read as expected, so it is not confirmed and some or all of it may have gone in. Observe the field with getAXState() before going on, then use setValue to put it right; do not type the text again. From character 1, expected "word  is"; the field reads "word. . is". The expected text is 8 characters long, the field\'s 10.';
  let answer = 'confirmed';
  const {getApp, call, meta} = await session(t, {handlers: {
    'execute:type_text': () => {
      if (answer === 'confirmed') return {meta: {...INPUT_META, inputRoute: "2'", entered: 3, typeReadback: confirmed}};
      throw new EngineFailure(-10005, sentence, 'typeUnconfirmed', {meta: {...INPUT_META, inputRoute: "2'", entered: 4, typeReadback: mismatch}});
    },
    'execute:press_key': () => ({meta: {...INPUT_META, inputRoute: "2'", keyEffect: 'unconfirmed'}}),
  }});
  const {app} = await getApp('TextEdit');
  await call(() => app.typeText('abc'));
  assert.deepEqual(meta['cua/typeReadback'], confirmed);
  assert.equal(meta['cua/keyEffect'], null);
  answer = 'mismatch';
  await assert.rejects(call(() => app.typeText('  is')), error => {
    assert.equal(error.message, `Computer Use server error -10005: ${sentence}`, 'the whole sentence, the excerpt included');
    assert.equal(error.errorName, 'typeUnconfirmed');
    return true;
  });
  assert.deepEqual(meta['cua/typeReadback'], mismatch);
  assert.equal(meta['cua/entered'], 4);
  await call(() => app.pressKey('super+a'));
  assert.equal(meta['cua/keyEffect'], 'unconfirmed');
  assert.equal(meta['cua/typeReadback'], null, 'reset by the next call');
});

test('a control build\'s variant rides in cua/nativeEngine, on its results and its input errors alike', async t => {
  const {getApp, call, meta} = await session(t, {identity: {engineVersion: '0.1.0', build: 'b1', variant: 'control-no-inert-click'},
    handlers: {'execute:press_key': () => { throw new EngineFailure(-10005, 'activationFailed', 'activationFailed', {meta: INPUT_META}); }}});
  const {app} = await getApp('TextEdit');
  const control = {engine: 'cua', version: '0.1.0', build: 'b1', variant: 'control-no-inert-click'};
  assert.deepEqual(meta['cua/nativeEngine'], control);
  await assert.rejects(call(() => app.pressKey('super+l')));
  assert.deepEqual(meta['cua/nativeEngine'], control);
});

test('an observation of a minimized window carries no screenshot and its meta says why; the next observation clears it', async t => {
  const {getApp, call, meta, trees} = await session(t);
  const {app} = await getApp('TextEdit');
  assert.equal(meta['cua/screenshotOmitted'], null);
  const tree = trees.get(APPS.TextEdit.appPath);
  const shown = tree.screenshot;
  Object.assign(tree, {screenshot: null, screenshotOmitted: 'windowMinimized'});
  const state = await call(() => app.getAXStateAndScreenshot({emit: false}));
  assert.equal(state.screenshot, undefined, 'the facade returns the state alone');
  assert.equal(meta['cua/screenshotOmitted'], 'windowMinimized');
  await assert.rejects(call(() => app.getScreenshot({emit: false})), {message: `Screenshot unavailable for ${APPS.TextEdit.appPath}.`});
  assert.equal(meta['cua/screenshotOmitted'], 'windowMinimized', 'getScreenshot\'s refusal is the facade\'s; the meta says why');
  Object.assign(tree, {screenshot: shown, screenshotOmitted: undefined});
  await call(() => app.getAXState({emit: false}));
  assert.equal(meta['cua/screenshotOmitted'], null);
});

test('a declined app fails "Computer Use was not approved to use <app>" with nothing observed; a forbidden one the vendor\'s sentence with nothing asked', async t => {
  const declined = await session(t, {answer: () => ({action: 'decline', content: null, _meta: null})});
  await assert.rejects(declined.getApp('TextEdit'), {message: 'Computer Use was not approved to use TextEdit'});
  assert.equal(declined.meta['cua/engineMs'], null, 'the policy\'s resolve_app is not the declined call\'s round trip');
  await assert.rejects(declined.getApp('TextEdit'), {message: 'Computer Use was not approved to use TextEdit'});
  assert.deepEqual(declined.engine.executes().map(p => p.method), ['resolve_app'], 'nothing past the policy');
  assert.equal(declined.record.asked.length, 1, 'the decline is remembered for the connection');

  const forbidden = await session(t, {handlers: {'execute:resolve_app': () => {
    throw new EngineFailure(-10006, 'Computer Use is not allowed to use the app \'com.apple.keychainaccess\' for safety reasons.', 'appNotAllowed');
  }}});
  await assert.rejects(forbidden.getApp('Keychain Access'), {message: 'Computer Use is not allowed to use the app \'com.apple.keychainaccess\' for safety reasons.'});
  assert.equal(forbidden.record.elicitations.length, 0);
});

test('the untrusted engine: without the Accessibility grant, its permissionsPending reaches the model with its sentence', async t => {
  const sentence = 'cua Engine needs the Accessibility permission: allow "cua Engine" in System Settings > Privacy & Security > Accessibility, then retry.';
  const {getApp} = await session(t, {handlers: {'execute:get_app_state': () => { throw new EngineFailure(-10014, sentence, 'permissionsPending'); }}});
  await assert.rejects(getApp('TextEdit'), {message: `Computer Use server error -10014: ${sentence}`});
});

test('the kept identity: a new pid drops it so the next call resolves again; a new bundle is never shown, the call redone once; a vanished app is resolved again', async t => {
  let pid = 501;
  let bundle = 'com.apple.TextEdit';
  const {getApp, call, engine, record} = await session(t, {handlers: {
    'execute:resolve_app': () => ({...APPS.TextEdit, pid}),
    'execute:get_app_state': () => { const tree = scene(APPS.TextEdit, {lineage: `L-${pid}`}); return {...tree, app: {...tree.app, pid, bundleIdentifier: bundle}}; },
    'execute:click': () => { throw new EngineFailure(-10007, 'Running application not found: TextEdit', 'runningApplicationNotFound'); },
  }});
  const resolves = () => engine.executes().filter(p => p.method === 'resolve_app').length;
  const {app} = await getApp('TextEdit');
  await call(() => app.getAXState({emit: false}));
  assert.equal(resolves(), 2, 'one resolution per app string: the name, then the bound path');
  pid = 777;   // the app relaunched: the same bundle at the same path, a new process
  assert.ok((await call(() => app.getAXState({emit: false}))).startsWith('Window: "Untitled", App: TextEdit.\n0 '), 'the observation stands, a new lineage in full');
  assert.equal(resolves(), 2);
  await call(() => app.getAXState({emit: false}));
  assert.equal(resolves(), 3, 'the pid moved, so the kept identity was dropped and the path resolved again');

  bundle = 'io.example.impostor';
  await assert.rejects(call(() => app.getAXState({emit: false})), /could not observe .*TextEdit\.app: the app it names changed during the call; retry/);
  assert.equal(appStates(engine).length, 6, 'observed, discarded, and redone once');
  assert.equal(resolves(), 4, 'the redo resolved again');
  bundle = 'com.apple.TextEdit';
  await call(() => app.getAXState({emit: false}));
  const before = resolves();
  await assert.rejects(call(() => app.click(1)), /Running application not found/);
  await call(() => app.getAXState({emit: false}));
  assert.equal(resolves(), before + 1, 'the engine reported the app gone: resolved again');
  assert.ok(record.elicitations.length >= 9, 'and every call asked');
});

test('a secret typed through the wrapper reaches the engine concealed; the engine\'s concealedInputUnavailable is the wrapper\'s own sentence, unchanged', async t => {
  const {getApp, call, engine} = await session(t, {secrets: {WORK_PASSWORD: 'hunter2-value'}, handlers: {'execute:type_text': ({args}) => {
    if (args.concealed) throw new EngineFailure(-10005, 'Concealed text is keyed only under a reliable Latin input source.', 'concealedInputUnavailable', {meta: {...INPUT_META, startedAt: null, endedAt: null}});
    return {meta: INPUT_META};
  }}});
  const {app} = await getApp('TextEdit');
  const error = await call(() => app.typeText('{{secret:WORK_PASSWORD}}')).then(() => assert.fail('expected a refusal'), e => e);
  assert.match(error.message, /^cua: type_text with secret "WORK_PASSWORD" was refused and nothing was entered: /);
  assert.ok(!error.message.includes('hunter2-value'));
  const sent = engine.executes().at(-1);
  assert.deepEqual([sent.method, sent.args.concealed, sent.args.text], ['type_text', true, 'hunter2-value']);
});

test('list_apps: no policy, the tool surface naming no app, the vendor\'s row shape', async t => {
  const {sky, call, meta, record, engine} = await session(t);
  assert.deepEqual(await call(() => sky.list_apps()), [{id: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true}, {id: 'io.example.old', displayName: 'Old', isRunning: false, lastUsedDate: 1.5, useCount: 2}]);
  assert.deepEqual(meta['codex/toolSurface'], {app: null, kind: 'computerUse'});
  assert.deepEqual(meta['cua/nativeEngine'], {engine: 'cua', version: '0.1.0', build: 'b1'});
  assert.equal(record.elicitations.length, 0);
  assert.deepEqual(record.suspendedAt.list_apps, [false]);
  assert.deepEqual(engine.executes().map(p => p.method), ['list_apps']);
});

test('Chrome: the tool surface carries the vendor\'s Chrome flag, and the approval is high risk with the subtitle', async t => {
  const {getApp, meta, record} = await session(t);
  await getApp('Chrome');
  assert.equal(meta['codex/computerUseChrome'], true);
  assert.equal(record.asked[0].meta.riskLevel, 'high');
  assert.match(record.asked[0].meta.subtitle, /^Allowing Computer Use to use this app introduces new risks/);
});

// The agent cursor (#235's spec, "Lifecycle and identity", Interfaces): the session's cursor request is made from the
// three variables the launcher put in the worker's environment, sent on the service's own connection at connect, and
// end_task's turn-ended hook hides it and closes the connection (#237).
test('the cursor request the service sends for each environment: the label, a #rrggbb colour, and CUA_CURSOR=0\'s off switch', () => {
  assert.deepEqual(cursorParams({}), {enabled: true});
  assert.deepEqual(cursorParams({CUA_CURSOR_LABEL: 'Research', CUA_CURSOR_COLOR: '#2f6feb'}), {label: 'Research', color: '#2f6feb', enabled: true});
  assert.deepEqual(cursorParams({CUA_CURSOR_LABEL: 'linux171', CUA_CURSOR_COLOR: '#8250df', CUA_CURSOR: '0'}), {label: 'linux171', color: '#8250df', enabled: false});
  assert.deepEqual(cursorParams({CUA_CURSOR_LABEL: '', CUA_CURSOR_COLOR: 'blue', CUA_CURSOR: '1'}), {enabled: true}, 'what is not a label or a colour is not sent');
  assert.deepEqual(cursorParams(undefined), {enabled: true});
});

// The service as the trusted worker makes it: its own client, from CUA_ENGINE_APP (a fixture bundle with the engine's
// Info.plist), the socket beside it, and the turn-ended hook it registers.
async function ownService(t, env, {handlers = {}} = {}) {
  const s = shortScratch('cua-esc-');
  t.after(s.cleanup);
  const app = join(s.dir, 'cua Engine.app');
  mkdirSync(join(app, 'Contents'), {recursive: true});
  writeFileSync(join(app, 'Contents', 'Info.plist'), infoPlist({version: '0.1.0', build: 'b1'}));
  const engine = await startFakeEngine(t, join(s.dir, 'engine.sock'), {handlers: {
    'execute:list_apps': () => [], cursor: () => ({cursor: 'on', reason: null}), ...handlers}});
  const hooks = [];
  const nodeRepl = {env: {CUA_ENGINE_APP: app, ...env}, nativePipe: nativePipe(), launchServices: {openApplication: async () => assert.fail('no launch')},
    setResponseMeta: () => {}, withSuspendedTimeout: fn => fn(), addTurnEndedHandler: hook => { hooks.push(hook); return () => {}; }};
  const service = createService({nodeRepl});
  const turnEnded = () => Promise.all(hooks.map(hook => hook.run({session_id: 's', turn_id: 't'})));
  return {service, engine, hooks, turnEnded};
}

// Resolves once `check()` holds, polling; fails the test past `ms`.
async function until(check, ms = 2_000) {
  for (const end = Date.now() + ms; !check();) {
    if (Date.now() > end) assert.fail('the condition never held');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('the service tells the engine its session\'s cursor at connect, and end_task\'s turn-ended hook hides it, ends the task (#292) and closes the connection (#237)', async t => {
  const {service, engine, hooks, turnEnded} = await ownService(t, {CUA_CURSOR_LABEL: 'linux171', CUA_CURSOR_COLOR: '#8250df'});
  assert.equal(hooks.length, 1);
  assert.ok(Number.isSafeInteger(hooks[0].timeoutMs) && hooks[0].timeoutMs > 0);
  await turnEnded();
  assert.equal(engine.received.length, 0, 'a session that never reached the engine has nothing to hide or close, and connects for neither');
  await service.handleRpc({type: 'execute', method: 'list_apps', args: [{}]});
  assert.equal(engine.sockets.size, 1);
  await turnEnded();
  await until(() => engine.sockets.size === 0);
  assert.deepEqual(engine.received.map(r => [r.method, r.method === 'cursor' ? r.params : r.params?.method ?? null]),
    [['ping', null], ['cursor', {label: 'linux171', color: '#8250df', enabled: true}], ['execute', 'list_apps'], ['cursor', {hide: true}], ['endTask', null]]);
  // The next task's first engine-bound call reconnects, and its end_task closes that connection too.
  assert.deepEqual(await service.handleRpc({type: 'execute', method: 'list_apps', args: [{}]}), []);
  assert.equal(engine.sockets.size, 1);
  assert.deepEqual(engine.received.slice(5).map(r => r.method), ['ping', 'cursor', 'execute']);
  await turnEnded();
  await until(() => engine.sockets.size === 0);
  assert.deepEqual(engine.received.slice(8).map(r => r.method), ['cursor', 'endTask'], 'that task\'s end too');
});

test('the service names its session\'s device mode in the ping (#282): CUA_DESKTOP_MODE, shared when the launch names none', async t => {
  for (const [env, desktop] of [[{}, 'shared'], [{CUA_DESKTOP_MODE: ''}, 'shared'], [{CUA_DESKTOP_MODE: 'dedicated'}, 'dedicated']]) {
    const {service, engine} = await ownService(t, {CUA_CURSOR: '0', ...env});
    await service.handleRpc({type: 'execute', method: 'list_apps', args: [{}]});
    assert.deepEqual(engine.received[0], {...engine.received[0], method: 'ping', params: {clientApiVersion: 'cua-engine-1', desktop}}, JSON.stringify(env));
  }
  const {service, engine} = await ownService(t, {CUA_DESKTOP_MODE: 'kiosk'});
  await assert.rejects(service.handleRpc({type: 'execute', method: 'list_apps', args: [{}]}), {message: 'cua: CUA_DESKTOP_MODE must be shared or dedicated [invalid_setting]'});
  assert.equal(engine.received.length, 0, 'nothing reaches the engine in a mode it was not given');
});

test('#282: the engine\'s background-click refusal and clickUnconfirmed reach the model with their sentence, name and meta', async t => {
  const refusal = "Google Chrome for Testing's web page does not accept a background click; use a dedicated desktop, or ask the person to bring Google Chrome for Testing forward";
  const unconfirmed = 'The click could not be confirmed: it was sent to Example in the background, but it may only have activated the window without reaching what is under the pointer. Observe the app with get_app_state before any retry, and never retry blindly.';
  for (const [name, message, meta] of [['backgroundClickRefused', refusal, {...INPUT_META, startedAt: null, endedAt: null, activationJoin: 'fresh'}],
    ['clickUnconfirmed', unconfirmed, {...INPUT_META, activationClickKind: {kind: 'action', when: 'consumedByAction'}}]]) {
    const {getApp, call, meta: seen} = await session(t, {handlers: {'execute:click': () => { throw new EngineFailure(-10005, message, name, {meta}); }}});
    const {app} = await getApp('TextEdit');
    await assert.rejects(call(() => app.click([10, 20])), error => {
      assert.equal(error.message, `Computer Use server error -10005: ${message}`, 'the whole sentence');
      assert.equal(error.errorName, name);
      return true;
    });
    assert.equal(seen['cua/inputRoute'], meta.inputRoute, name);
    assert.deepEqual(seen['cua/actionInterval'], {startedAt: meta.startedAt, endedAt: meta.endedAt}, `the interval says whether anything was posted: ${name}`);
  }
});

test('against an engine without the cursor method the session goes on, and end_task still ends the task and closes the connection, sending no hide', async t => {
  const {service, engine, turnEnded} = await ownService(t, {CUA_CURSOR: '0'}, {handlers: {cursor: undefined}});
  assert.deepEqual(await service.handleRpc({type: 'execute', method: 'list_apps', args: [{}]}), []);
  await turnEnded();
  await until(() => engine.sockets.size === 0);
  assert.deepEqual(engine.received.map(r => r.method), ['ping', 'cursor', 'execute', 'endTask']);
  assert.deepEqual(engine.received[1].params, {enabled: false});
});

test('end_task\'s hook waits at most endTask\'s bound: a hide and an endTask the engine never answers hold it no longer', async t => {
  const {service, engine, turnEnded} = await ownService(t, {CUA_CURSOR_LABEL: 'linux171'}, {handlers: {cursor: ({hide}) => (hide ? NO_REPLY : {cursor: 'on', reason: null}),
    endTask: () => NO_REPLY}});
  await service.handleRpc({type: 'execute', method: 'list_apps', args: [{}]});
  const started = performance.now();
  await turnEnded();
  const waited = performance.now() - started;
  assert.ok(waited < 1_500, `the hook returned within endTask's 1 s bound (${Math.round(waited)} ms), under its own 2 s`);
  await until(() => engine.sockets.size === 0);
});
