// cua's own macOS engine service (src/services/engine/service.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-
// design.md, Design "The service" with its Result meta, "Protocol", "Indexes, tokens and handles", "Policy and
// approvals"), driven through the facade as a cell drives it: src/cua-api/sky.mjs and bind-mac-app.mjs over a
// `nodeRepl.rpc` that hands each request to the real trusted wrapper (src/services/sky.mjs), which delegates to the
// service, whose client talks to a fake engine on a Unix socket (test/helpers/fake-engine.mjs). The worker's nodeRepl
// puts the supervisor's approval memory (src/repl-host/elicitation.mjs) in front of the client's answers, as the own
// host does. Synthetic trees only; no app is observed or driven.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {EngineFailure, nativePipe, startFakeEngine} from './helpers/fake-engine.mjs';
import {node} from './native-goldens/builder.mjs';
import {approvalMemory} from '../src/repl-host/elicitation.mjs';
import {createSkyService} from '../src/services/sky.mjs';
import {bind_mac_app} from '../src/cua-api/bind-mac-app.mjs';
import {createEngineClient} from '../src/services/engine/client.mjs';
import {METHODS, createService} from '../src/services/engine/service.mjs';

const APPS = {
  TextEdit: {appPath: '/System/Applications/TextEdit.app', bundleIdentifier: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true, pid: 501},
  Finder: {appPath: '/System/Library/CoreServices/Finder.app', bundleIdentifier: 'com.apple.finder', displayName: 'Finder', isRunning: true, pid: 502},
  Chrome: {appPath: '/Applications/Google Chrome.app', bundleIdentifier: 'com.google.Chrome', displayName: 'Google Chrome', isRunning: true, pid: 503},
};
const byPath = Object.fromEntries(Object.values(APPS).map(app => [app.appPath, app]));
const NO_LONGER_VALID = 'The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.';
const ENGINE_MS = {resolve_app: 999};
const INPUT_META = {inputRoute: 3, startedAt: 1000, endedAt: 1042, receivedAt: 990, hidIdleMs: 31000, activationGuardMs: 41.5, pointUnconfirmed: true};

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
async function session(t, {handlers = {}, answer = () => ({action: 'accept', content: null, _meta: {persist: 'session'}}), secrets = {}, env = {}} = {}) {
  const s = shortScratch('cua-esv-');
  t.after(s.cleanup);
  const socket = join(s.dir, 'engine.sock');
  const shot = join(s.dir, 'shot.jpg');
  writeFileSync(shot, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const trees = new Map(Object.values(APPS).map(app => [app.appPath, scene(app, {screenshot: {url: pathToFileURL(shot).href, width: 600, height: 400, scale: 1}})]));
  const record = {elicitations: [], asked: [], meta: [], budget: 0, suspendedAt: {}};
  const during = method => { (record.suspendedAt[method] ??= []).push(record.budget > 0); };
  const engine = await startFakeEngine(t, socket, {handlers: {
    'execute:resolve_app': ({args}) => {
      during('resolve_app');
      const app = APPS[args.app] ?? byPath[args.app] ?? Object.values(APPS).find(each => each.bundleIdentifier === args.app);
      if (!app) throw new EngineFailure(-10010, 'invalidApp', 'invalidApp');
      return app;
    },
    'execute:get_app_state': ({args}) => { during('get_app_state'); return trees.get(args.app); },
    'execute:list_apps': () => { during('list_apps'); return [{id: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true, extra: 1}, {id: 'io.example.old', displayName: 'Old', isRunning: false, lastUsedDate: 1.5, useCount: 2}]; },
    'execute:click': () => { during('click'); return {meta: INPUT_META}; },
    'execute:press_key': () => ({meta: {...INPUT_META, inputRoute: "2'", activationGuardMs: undefined, pointUnconfirmed: undefined}}),
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
    // The supervisor's side: a remembered app is answered from memory, anything else asks the client.
    createElicitation: async request => {
      record.elicitations.push(structuredClone(request));
      const message = {message: request.message, meta: request.meta};
      const recalled = memory.recall(message);
      if (recalled) { const {ok, ...fields} = recalled; return fields; }
      record.asked.push(structuredClone(request));
      const outcome = {ok: true, ...answer(request)};
      memory.record(message, outcome);
      const {ok, ...fields} = outcome;
      return fields;
    },
    setResponseMeta: value => { record.meta.push(structuredClone(value)); Object.assign(meta, structuredClone(value)); },
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
  assert.equal(meta['cua/pointUnconfirmed'], true);
  assert.deepEqual(meta['cua/nativeEngine'], {engine: 'cua', version: '0.1.0', build: 'b1'});

  await call(() => app.click([120, 40], {mouseButton: 'right', clickCount: 2}));
  const coordinate = engine.executes().at(-1);
  assert.deepEqual([coordinate.args, coordinate.lineage], [{app: APPS.TextEdit.appPath, x: 120, y: 40, mouse_button: 'right', click_count: 2}, 'L-TextEdit']);

  await call(() => app.pressKey('super+s'));
  assert.equal(engine.executes().at(-1).lineage, 'L-TextEdit', 'keys carry the lineage too');
  assert.equal(meta['cua/inputRoute'], "2'");
  assert.equal(meta['cua/activationGuardMs'], null, 'a key\'s result does not inherit the click\'s guard time');
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

test('intervention, entered and routeAdvice ride as cua/ meta on results and on the userIntervened error that stopped a type_text; the next call starts over', async t => {
  const stopped = {...INPUT_META, inputRoute: "2'", activationGuardMs: undefined, pointUnconfirmed: undefined, entered: 3};
  const {getApp, call, meta} = await session(t, {handlers: {
    'execute:type_text': () => { throw new EngineFailure(-10016, 'The user changed \'/System/Applications/TextEdit.app\'. Re-query the latest state with `get_app_state` before sending more actions.', 'userIntervened', {meta: stopped}); },
    'execute:press_key': () => ({meta: {...INPUT_META, inputRoute: "2'", activationGuardMs: undefined, pointUnconfirmed: undefined, intervention: 'off', hidIdleMs: 52000}}),
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
  await assert.rejects(call(() => app.click(1)), /another app came to the front/);
  assert.equal(meta['cua/routeAdvice'], 'add "routes": {"com.apple.TextEdit": 4}');
  assert.equal(meta['cua/intervention'], null);
  await call(() => app.getAXState({emit: false}));
  for (const key of ['cua/intervention', 'cua/entered', 'cua/routeAdvice']) assert.equal(meta[key], null, key);
});

test('cua/settle rides on the observation whose settle hit its cap, and on no other', async t => {
  const {getApp, call, meta, trees} = await session(t);
  const {app} = await getApp('TextEdit');
  assert.equal(meta['cua/settle'], null);
  trees.get(APPS.TextEdit.appPath).settle = 'capped';
  await call(() => app.getAXState({emit: false}));
  assert.equal(meta['cua/settle'], 'capped');
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
