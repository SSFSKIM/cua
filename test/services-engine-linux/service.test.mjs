// cua's own Linux service (src/services/engine/linux/service.mjs) end to end against a fake cua-engine speaking the
// wire (../helpers/fake-linux-engine.mjs): the vendor service's messages and answers (R/A §1.2-1.5) with cua's engine
// behind them, the element numbering, screenshots as {filepath, data_url}, the deferred settle, drag handles, the
// capability report turned into one sentence, and `truncated` passed through for the facade's line.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createService, LINUX_METHODS} from '../../src/services/engine/linux/service.mjs';
import {fakeLinuxEngine, SHOT_BYTES, TREE, WINDOWS} from '../helpers/fake-linux-engine.mjs';

const W = WINDOWS[0];
const JPEG_URL = `data:image/jpeg;base64,${SHOT_BYTES.toString('base64')}`;
// A settler double that records each wait and defer in order.
const recordingSettler = events => ({wait: async () => { events.push('wait'); }, defer: () => { events.push('defer'); }});

function service(t, engine, {env = {}, settler} = {}) {
  const made = createService({env: {CUA_ENGINE_BIN: engine.path, ...env}, ...(settler ? {settler} : {})});
  t.after(() => made.close());
  return made;
}
const execute = (svc, method, ...args) => svc.handleRpc({type: 'execute', method, args});
const sent = engine => engine.requests().filter(r => r.command !== 'capabilities').map(({command, input}) => [command, input]);

test('setup answers the vendor\'s target and its 20 methods in order, starting the engine with the device mode and reading its capabilities', async t => {
  assert.deepEqual(LINUX_METHODS, ['perform_secondary_action', 'click', 'clipboard_read', 'clipboard_release', 'clipboard_write', 'drag', 'drag_handle', 'activate_window',
    'get_screenshot', 'list_apps', 'list_windows', 'move', 'move_relative', 'press_key', 'key_down', 'key_up', 'scroll', 'type_text', 'launch_app', 'get_window_state']);
  const engine = fakeLinuxEngine(t);
  const svc = service(t, engine, {env: {CUA_DESKTOP_MODE: 'dedicated'}});
  assert.deepEqual(await svc.handleRpc({type: 'setup'}), {target: 'linux', methods: LINUX_METHODS});
  assert.deepEqual(engine.spawns().map(s => s.args), [['server', '--desktop', 'dedicated']]);
  assert.deepEqual(engine.requests().map(r => r.command), ['capabilities']);
  await svc.handleRpc({type: 'setup'});
  assert.equal(engine.spawns().length, 1, 'one engine per service');
});

test('an engine the service cannot drive: setup still answers the methods, every method then refuses with the sentence before anything is sent, and the next call retries', async t => {
  const OLD = 'cua-engine 0.2.0 is older than 0.3.0, which this cua needs; run cua install --engine';
  const old = fakeLinuxEngine(t, {version: 'cua-engine 0.2.0 (8b49b6825ae5)'});
  const svc = service(t, old);
  assert.deepEqual(await svc.handleRpc({type: 'setup'}), {target: 'linux', methods: LINUX_METHODS}, 'the facade gets its methods, never a rejected setup');
  for (const [method, input] of [['list_windows'], ['click', {window: W, x: 1, y: 1}], ['clipboard_release', {handle: 'h'}], ['get_window_state', {window: W}], ['type_text', {window: W, text: 'x'}]])
    await assert.rejects(execute(svc, method, input), {message: OLD}, method);
  await assert.rejects(svc.handleRpc({type: 'drag_start', handle_id: 'h', point: {x: 1, y: 1}}), {message: OLD});
  assert.deepEqual(old.spawns(), [], 'no server was started, so nothing was sent');
  // Installing the right engine needs no new session: the next call checks the version again and starts it.
  old.setVersion('cua-engine 0.3.0 (fixed000)');
  assert.deepEqual(await execute(svc, 'list_windows'), WINDOWS);
  assert.equal(old.spawns().length, 1);

  const missing = `${old.dir}/absent`;
  const unspawnable = service(t, {path: missing});
  assert.deepEqual((await unspawnable.handleRpc({type: 'setup'})).methods, LINUX_METHODS);
  await assert.rejects(execute(unspawnable, 'press_key', {key: 'a'}), {message: `cua-engine at ${missing} could not be run (ENOENT); run cua install --engine`});

  const unconfigured = createService({env: {}});
  assert.deepEqual((await unconfigured.handleRpc({type: 'setup'})).methods, LINUX_METHODS);
  await assert.rejects(execute(unconfigured, 'list_windows'), {message: 'cua: cua-engine is not configured for this runtime (CUA_ENGINE_BIN) [engine_not_configured]'});
  const badMode = service(t, fakeLinuxEngine(t), {env: {CUA_DESKTOP_MODE: 'mine'}});
  assert.deepEqual((await badMode.handleRpc({type: 'setup'})).methods, LINUX_METHODS);
  await assert.rejects(execute(badMode, 'list_windows'), {message: 'CUA_DESKTOP_MODE must be shared or dedicated'});

  const shared = fakeLinuxEngine(t);
  await service(t, shared).handleRpc({type: 'setup'});
  assert.deepEqual(shared.spawns()[0].args, ['server', '--desktop', 'shared'], 'shared when the launch names none');
});

test('the capability is checked against the engine that receives the command: one restarted during the settle is judged by its own report', async t => {
  // The first engine reports background input and dies on clipboard_release; the one started after it reports none.
  const engine = fakeLinuxEngine(t);
  engine.behave(`import {existsSync, writeFileSync} from 'node:fs';
    const marker = ${JSON.stringify(`${engine.dir}/first-started`)};
    export function answer(command, input, ctx) {
      if (command === 'capabilities') {
        const first = !existsSync(marker);
        if (first) writeFileSync(marker, String(ctx.pid));
        return {output: {backend: first ? 'x11' : 'later', tree: 'at_spi', input: {background: first, desktop: true}, capture: {window: 'retained', desktop: true},
          text: {paste: 'verified'}, desktop: ctx.desktop}};
      }
      if (command === 'clipboard_release') return {exit: 1};
    }`);
  const svc = service(t, engine);
  await execute(svc, 'press_key', {window: W, key: 'a'});
  // The click waits out the settle the key deferred; meanwhile clipboard_release, which never waits, ends the engine.
  const click = execute(svc, 'click', {window: W, x: 1, y: 1});
  await assert.rejects(execute(svc, 'clipboard_release', {handle: 'h'}), {message: /^cua-engine stopped \(exit=1\)/});
  await assert.rejects(click, {message: 'cua-engine cannot send input to a window in the background on this desktop: its later backend reports no input.background capability'});
  const [, second] = engine.spawns();
  assert.ok(second, 'a second engine was started for the click');
  assert.deepEqual(engine.requests().filter(r => r.pid === second.pid).map(r => r.command), ['capabilities'], 'the second engine never received the click');
});

test('get_window_state numbers the tree as the vendor does, keeps the native ids, reads the screenshot into a data URL and passes truncated through', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command, input) {
    if (command === 'get_window_state' && input.query === 'trunc') return {output: {window: ${JSON.stringify(W)}, ax_tree: ${JSON.stringify(TREE)}, ax_tree_source: 'at_spi',
      screenshots: [], truncated: {nodes: 12, depth: 0, failed: 1}}};
  }`});
  const svc = service(t, engine);
  const state = await execute(svc, 'get_window_state', {window: W});
  assert.deepEqual(state.window, W);
  assert.equal(state.ax_tree_source, 'at_spi');
  assert.deepEqual([state.ax_tree.id, state.ax_tree.native_id, state.ax_tree.children.map(c => [c.id, c.native_id])],
    ['0', TREE.id, [['1', TREE.children[0].id], ['2', TREE.children[1].id]]]);
  assert.deepEqual(state.screenshots, [{filepath: engine.shot, data_url: JPEG_URL}]);
  const again = await execute(svc, 'get_window_state', {window: W, include_screenshot: false});
  assert.equal(again.ax_tree.children[1].id, '2', 'numbers are kept across observations');
  assert.deepEqual(again.screenshots, []);
  const truncated = await execute(svc, 'get_window_state', {window: W, query: 'trunc'});
  assert.deepEqual(truncated.truncated, {nodes: 12, depth: 0, failed: 1});
  assert.deepEqual(sent(engine), [['get_window_state', {window: W}], ['get_window_state', {window: W, include_screenshot: false}], ['get_window_state', {window: W, query: 'trunc'}]]);
});

test('element ids are translated back to native ids before input reaches the engine; an unknown one is refused and nothing is sent', async t => {
  const engine = fakeLinuxEngine(t);
  const svc = service(t, engine);
  await execute(svc, 'get_window_state', {window: W, include_screenshot: false});
  await execute(svc, 'click', {window: W, element_id: '1'});
  await execute(svc, 'scroll', {window: W, element_id: '2', direction: 'down'});
  await execute(svc, 'type_text', {window: W, element_id: '2', text: 'hi'});
  await execute(svc, 'perform_secondary_action', {window: W, element_id: '0', action: 'expand'});
  await execute(svc, 'click', {window: W, x: 3, y: 4});
  await assert.rejects(execute(svc, 'click', {window: W, element_id: '9'}), {message: 'Unknown element ID 9 for this window; refresh get_window_state()'});
  assert.deepEqual(sent(engine).slice(1), [['click', {window: W, element_id: TREE.children[0].id}], ['scroll', {window: W, element_id: TREE.children[1].id, direction: 'down'}],
    ['type_text', {window: W, element_id: TREE.children[1].id, text: 'hi'}], ['perform_secondary_action', {window: W, element_id: TREE.id, action: 'expand'}],
    ['click', {window: W, x: 3, y: 4}]]);
});

test('answers: lists and handles as the engine gives them, void methods undefined, screenshots as {filepath, data_url}', async t => {
  const engine = fakeLinuxEngine(t);
  const svc = service(t, engine);
  assert.deepEqual(await execute(svc, 'list_windows'), WINDOWS);
  assert.deepEqual((await execute(svc, 'list_apps'))[0].id, 'org.gnome.gedit');
  assert.equal(await execute(svc, 'clipboard_read', {window: W}), 'handle-1');
  assert.equal(await execute(svc, 'press_key', {window: W, key: 'ctrl+a'}), undefined);
  assert.deepEqual(await execute(svc, 'get_screenshot'), [{filepath: engine.shot, data_url: JPEG_URL}]);
  assert.deepEqual(sent(engine).map(([command, input]) => [command, input]), [['list_windows', {}], ['list_apps', {}], ['clipboard_read', {window: W}],
    ['press_key', {window: W, key: 'ctrl+a'}], ['get_screenshot', {}]]);
});

test('an engine error reaches the caller as its sentence, the late drag-and-drop notice included, and defers nothing', async t => {
  const notice = 'Google-chrome started a drag and drop after your drag ended; it may have dropped and changed the desktop; this request was not run, so read the window before sending it again';
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command) { if (command === 'click') return {error: ${JSON.stringify(notice)}}; }`});
  const events = [];
  const svc = service(t, engine, {settler: recordingSettler(events)});
  await assert.rejects(execute(svc, 'click', {window: W, x: 1, y: 1}), error => error instanceof Error && error.message === notice);
  assert.deepEqual(events, ['wait']);
});

test('the settle: input waits then defers; reads wait and never defer; clipboard_release neither waits nor defers', async t => {
  const engine = fakeLinuxEngine(t);
  const events = [];
  const svc = service(t, engine, {settler: recordingSettler(events)});
  const record = async (label, run) => { events.push(label); await run(); };
  await record('click', () => execute(svc, 'click', {window: W, x: 1, y: 1}));
  await record('list_windows', () => execute(svc, 'list_windows'));
  await record('get_window_state', () => execute(svc, 'get_window_state', {window: W}));
  await record('get_screenshot', () => execute(svc, 'get_screenshot'));
  await record('clipboard_read', () => execute(svc, 'clipboard_read', {window: W}));
  await record('clipboard_release', () => execute(svc, 'clipboard_release', {handle: 'handle-1'}));
  await record('activate_window', () => execute(svc, 'activate_window', {window: W}));
  assert.deepEqual(events, ['click', 'wait', 'defer', 'list_windows', 'wait', 'get_window_state', 'wait', 'get_screenshot', 'wait', 'clipboard_read', 'wait', 'defer',
    'clipboard_release', 'activate_window', 'wait', 'defer']);
});

test('the settle\'s real clock: the call after an input waits out the 100 ms', async t => {
  const engine = fakeLinuxEngine(t);
  const svc = service(t, engine);
  await execute(svc, 'list_windows');
  await execute(svc, 'press_key', {window: W, key: 'a'});
  const started = performance.now();
  await execute(svc, 'list_windows');
  assert.ok(performance.now() - started >= 95, `waited ${performance.now() - started} ms`);
});

test('drag handles: start, move_to and end reach the engine as drag_handle actions; the vendor\'s state sentences', async t => {
  const engine = fakeLinuxEngine(t);
  const svc = service(t, engine);
  assert.equal(await svc.handleRpc({type: 'drag_start', handle_id: 'h1', point: {x: 1, y: 2}}), undefined);
  await assert.rejects(svc.handleRpc({type: 'drag_start', handle_id: 'h1', point: {x: 1, y: 2}}), {message: 'drag handle can only be started once'});
  assert.equal(await svc.handleRpc({type: 'drag_move', handle_id: 'h1', point: {x: 5, y: 6}}), undefined);
  assert.equal(await svc.handleRpc({type: 'drag_end', handle_id: 'h1'}), undefined);
  await assert.rejects(svc.handleRpc({type: 'drag_move', handle_id: 'h1', point: {x: 0, y: 0}}), {message: 'Sky drag handle has not been started'});
  await assert.rejects(svc.handleRpc({type: 'drag_end', handle_id: 'nope'}), {message: 'Sky drag handle has not been started'});
  assert.deepEqual(sent(engine), [['drag_handle', {action: 'start', x: 1, y: 2}], ['drag_handle', {action: 'move_to', x: 5, y: 6}], ['drag_handle', {action: 'end'}]]);
});

test('execute refuses a name that is not one of its methods with the vendor\'s sentence', async t => {
  const svc = service(t, fakeLinuxEngine(t));
  for (const name of ['type_characters', 'capabilities', 'target', 'toString', 'constructor'])
    await assert.rejects(execute(svc, name), {message: `Sky runtime method is not available: ${name}`});
  await assert.rejects(svc.handleRpc({type: 'other'}), {message: 'Unsupported sky request type: other'});
});

test('a missing capability is refused in one sentence naming it before anything reaches the engine', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command, input, ctx) {
    if (command === 'capabilities') return {output: {backend: 'wayland', tree: 'at_spi', input: {background: false, desktop: true}, capture: {window: 'portal', desktop: false},
      text: {paste: 'verified', literal: false}, desktop: ctx.desktop, version: '0.9.0', build: 'w'}};
  }`});
  const svc = service(t, engine);
  assert.deepEqual((await svc.handleRpc({type: 'setup'})).methods, LINUX_METHODS, 'the method list never changes');
  await assert.rejects(execute(svc, 'click', {window: W, x: 1, y: 1}),
    {message: 'cua-engine cannot send input to a window in the background on this desktop: its wayland backend reports no input.background capability'});
  await assert.rejects(execute(svc, 'get_screenshot'), {message: 'cua-engine cannot capture the screen on this desktop: its wayland backend reports no capture.desktop capability'});
  await execute(svc, 'click', {x: 1, y: 1});
  await execute(svc, 'get_window_state', {window: W});
  assert.deepEqual(sent(engine).map(([command]) => command), ['click', 'get_window_state']);
});

test('each gated method names the capability it needs', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command, input, ctx) {
    if (command === 'capabilities') return {output: {backend: 'none', desktop: ctx.desktop, version: '0.9.0', build: 'n'}};
  }`});
  const svc = service(t, engine);
  const needs = async (method, input, capability) => {
    await assert.rejects(execute(svc, method, input), error => error.message.endsWith(`its none backend reports no ${capability} capability`), `${method} ${capability}`);
  };
  for (const method of ['click', 'drag', 'move', 'scroll', 'press_key', 'key_down', 'key_up']) {
    await needs(method, {window: W}, 'input.background');
    await needs(method, {}, 'input.desktop');
  }
  await needs('move_relative', {dx: 1, dy: 1}, 'input.desktop');
  await assert.rejects(svc.handleRpc({type: 'drag_start', handle_id: 'h', point: {x: 1, y: 1}}), {message: /reports no input\.desktop capability$/});
  await needs('type_text', {window: W, text: 'x'}, 'text.paste');
  await needs('clipboard_write', {window: W, handle: 'h'}, 'text.paste');
  await needs('get_screenshot', undefined, 'capture.desktop');
  await needs('get_window_state', {window: W, include_screenshot: false}, 'tree');
  for (const method of ['list_windows', 'list_apps', 'activate_window', 'launch_app', 'perform_secondary_action', 'clipboard_read', 'clipboard_release'])
    await execute(svc, method, {window: W, app: 'x', element_id: 'n', action: 'a', handle: 'h'});
  assert.deepEqual(sent(engine).map(([command]) => command), ['list_windows', 'list_apps', 'activate_window', 'launch_app', 'perform_secondary_action', 'clipboard_read', 'clipboard_release']);
});

test('a window\'s screenshot needs capture.window; the tree alone does not', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command, input, ctx) {
    if (command === 'capabilities') return {output: {backend: 'x', tree: 'at_spi', input: {background: true, desktop: true}, capture: {window: false, desktop: true}, desktop: ctx.desktop}};
  }`});
  const svc = service(t, engine);
  await assert.rejects(execute(svc, 'get_window_state', {window: W}), {message: 'cua-engine cannot capture a window on this desktop: its x backend reports no capture.window capability'});
  await execute(svc, 'get_window_state', {window: W, include_screenshot: false});
});
