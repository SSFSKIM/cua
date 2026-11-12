// cua's own Linux service (src/services/engine/linux/service.mjs) end to end against a fake cua-engine speaking the
// wire (../helpers/fake-linux-engine.mjs): the vendor service's messages and answers (R/A §1.2-1.5) with cua's engine
// behind them, the element numbering, screenshots as {filepath, data_url}, the deferred settle, drag handles, the
// capability report turned into one sentence, and `truncated` passed through for the facade's line.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createService, kernelReset as linuxKernelReset, LINUX_METHODS} from '../../src/services/engine/linux/service.mjs';
import {createSkyService, kernelReset as skyKernelReset} from '../../src/services/sky.mjs';
import {ANIMATED_ACTION, ActionSettler, SETTLE_MS} from '../../src/services/engine/linux/settle.mjs';
import {fakeLinuxEngine, SHOT_BYTES, TREE, WINDOWS} from '../helpers/fake-linux-engine.mjs';

const W = WINDOWS[0];
const JPEG_URL = `data:image/jpeg;base64,${SHOT_BYTES.toString('base64')}`;
// A settler double that records each wait and defer in order, each defer with the method it names.
const recordingSettler = events => ({wait: async () => { events.push('wait'); }, defer: method => { events.push(`defer ${method}`); }});
// A settler double whose wait, once `hold` is called, does not return until the test lets it go: a test orders a call
// that waits against one that does not, by what it awaits and not by the settle's length.
function heldSettler() {
  let holding = false;
  const held = [];
  const waiting = [];
  return {
    wait: () => (holding ? new Promise(resolve => { held.push(resolve); waiting.splice(0).forEach(notify => notify()); }) : Promise.resolve()),
    defer: () => {},
    hold: () => { holding = true; },
    // resolves once a call is waiting
    waiting: () => (held.length ? Promise.resolve() : new Promise(notify => waiting.push(notify))),
    release: () => { holding = false; held.splice(0).forEach(resolve => resolve()); },
  };
}

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
  const OLD = 'cua-engine 0.3.0 is older than 0.4.0, which this cua needs; run cua install --engine';
  const old = fakeLinuxEngine(t, {version: 'cua-engine 0.3.0 (cd4c929758ca)'});
  const svc = service(t, old);
  assert.deepEqual(await svc.handleRpc({type: 'setup'}), {target: 'linux', methods: LINUX_METHODS}, 'the facade gets its methods, never a rejected setup');
  for (const [method, input] of [['list_windows'], ['click', {window: W, x: 1, y: 1}], ['clipboard_release', {handle: 'h'}], ['get_window_state', {window: W}], ['type_text', {window: W, text: 'x'}]])
    await assert.rejects(execute(svc, method, input), {message: OLD}, method);
  await assert.rejects(svc.handleRpc({type: 'drag_start', handle_id: 'h', point: {x: 1, y: 1}}), {message: OLD});
  assert.deepEqual(old.spawns(), [], 'no server was started, so nothing was sent');
  // Installing the right engine needs no new session: the next call checks the version again and starts it.
  old.setVersion('cua-engine 0.4.0 (fixed000)');
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

test('a 0.3.0 engine, which names no animated action, is refused before any settle applies: GTK 4\'s and Qt\'s element actions never settle at the element click\'s 10 ms', async t => {
  // T8 (Decision Log, 2026-11-07, binding on T18): `animated_action` is new in 0.4.0, so a 0.3.0 engine answers an
  // element action with null, and GTK 4's and Qt's actions would settle as a plain element click. No fallback is built;
  // the version gate refuses that engine instead, before anything is sent and before the settler defers anything.
  const OLD = 'cua-engine 0.3.0 is older than 0.4.0, which this cua needs; run cua install --engine';
  const old = fakeLinuxEngine(t, {version: 'cua-engine 0.3.0 (cd4c929758ca)'});
  const events = [];
  const svc = service(t, old, {settler: recordingSettler(events)});
  await svc.handleRpc({type: 'setup'});
  for (const [method, input] of [['click', {window: W, element_id: 'n'}], ['perform_secondary_action', {window: W, element_id: 'n', action: 'click'}], ['click', {window: W, x: 1, y: 1}]]) {
    events.length = 0;
    await assert.rejects(execute(svc, method, input), {message: OLD}, method);
    assert.deepEqual(events.filter(e => e.startsWith('defer')), [], `${method}: nothing deferred, so no settle applies`);
  }
  await assert.rejects(svc.handleRpc({type: 'drag_start', handle_id: 'h', point: {x: 1, y: 1}}), {message: OLD});
  assert.deepEqual(old.spawns(), [], 'no server was started, so nothing was sent');
  // the same service with a 0.4.0 engine settles the element action as T8 measured it
  old.setVersion('cua-engine 0.4.0 (cafe0000)');
  events.length = 0;
  await execute(svc, 'click', {window: W, element_id: 'n'});
  assert.deepEqual(events, ['wait', 'defer click_element']);
});

test('the capability is checked against the engine that receives the command: one restarted while a call waits for the settle is judged by its own report', async t => {
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
  const settler = heldSettler();
  const svc = service(t, engine, {settler});
  await execute(svc, 'press_key', {window: W, key: 'a'});
  // The click waits for the settle, held there until the test lets it go; meanwhile clipboard_release, which never
  // waits, ends the engine.
  settler.hold();
  const click = execute(svc, 'click', {window: W, x: 1, y: 1});
  await settler.waiting();
  await assert.rejects(execute(svc, 'clipboard_release', {handle: 'h'}), {message: /^cua-engine stopped \(exit=1\)/});
  settler.release();
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

// The pending drag notice (#171 M4 T14): cua-engine puts it beside every reply's output while a drag's watch left
// something pending; the state carries it to the facade, which renders it first (src/cua-api/bind-linux-app.mjs). The
// other replies keep their shapes, and a read that fails carries it after its own sentence.
test('a pending drag notice reaches the facade on the window state; lists, handles and void answers keep their shapes; a failed read carries it after its sentence', async t => {
  const NOTICE = 'Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop. Read the window before sending input again: your next input request will not be run';
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command, input) {
    const notice = ${JSON.stringify(NOTICE)};
    if (command === 'get_window_state' && input.query === 'fails') return {error: 'Window 7 is gone', notice};
    if (command === 'get_window_state' && input.query === 'clear') return undefined;
    if (['get_window_state', 'list_windows', 'clipboard_read', 'key_up', 'get_screenshot'].includes(command)) return {notice};
  }`});
  const svc = service(t, engine);
  const state = await execute(svc, 'get_window_state', {window: W});
  assert.equal(state.notice, NOTICE);
  assert.equal(state.ax_tree.children[1].id, '2', 'the state is otherwise as without it');
  assert.equal('notice' in (await execute(svc, 'get_window_state', {window: W, query: 'clear'})), false, 'no notice, no field');
  assert.deepEqual(await execute(svc, 'list_windows'), WINDOWS);
  assert.equal(await execute(svc, 'clipboard_read', {window: W}), 'handle-1');
  assert.equal(await execute(svc, 'key_up', {window: W, key: 'a'}), undefined);
  assert.deepEqual(await execute(svc, 'get_screenshot'), [{filepath: engine.shot, data_url: JPEG_URL}]);
  await assert.rejects(execute(svc, 'get_window_state', {window: W, query: 'fails'}), {message: `Window 7 is gone\n${NOTICE}`});
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
  const notice = 'Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop; this click request was not run, so read the window before sending it again';
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command) { if (command === 'click') return {error: ${JSON.stringify(notice)}}; }`});
  const events = [];
  const svc = service(t, engine, {settler: recordingSettler(events)});
  await assert.rejects(execute(svc, 'click', {window: W, x: 1, y: 1}), error => error instanceof Error && error.message === notice);
  assert.deepEqual(events, ['wait']);
});

test('beforeLaunch sends the engine its preflight, which acts: a pending late drag-and-drop notice is its answer, else it resolves', async t => {
  const notice = 'Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop; this preflight request was not run, so read the window before sending it again';
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command, input, ctx) { if (command === 'preflight' && ctx.count === 2) return {error: ${JSON.stringify(notice)}}; }`});
  const events = [];
  const svc = service(t, engine, {settler: recordingSettler(events)});
  await assert.rejects(svc.beforeLaunch(), {message: notice});
  assert.equal(await svc.beforeLaunch(), undefined);
  assert.deepEqual(sent(engine), [['preflight', {}], ['preflight', {}]]);
  assert.deepEqual(events, ['wait', 'wait'], 'it waits for the settle as input does; the launch it stands for is the supervisor\'s');
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
  assert.deepEqual(events, ['click', 'wait', 'defer click', 'list_windows', 'wait', 'get_window_state', 'wait', 'get_screenshot', 'wait', 'clipboard_read', 'wait', 'defer clipboard_read',
    'clipboard_release', 'activate_window', 'wait', 'defer activate_window']);
});

test('the settle: every input method defers by its own name, each drag-handle step by drag_handle\'s', async t => {
  const engine = fakeLinuxEngine(t);
  const events = [];
  const svc = service(t, engine, {settler: recordingSettler(events)});
  const inputs = {perform_secondary_action: {window: W, element_id: '0', action: 'expand'}, click: {window: W, x: 1, y: 1}, clipboard_write: {window: W, handle: 'h'},
    drag: {window: W, path: [{x: 1, y: 1}, {x: 2, y: 2}]}, activate_window: {window: W}, move: {window: W, x: 1, y: 1}, move_relative: {dx: 1, dy: 1},
    press_key: {window: W, key: 'a'}, key_down: {window: W, key: 'a'}, key_up: {window: W, key: 'a'}, scroll: {window: W, x: 1, y: 1, direction: 'down'},
    type_text: {window: W, text: 'x'}, launch_app: {app: 'x'}, clipboard_read: {window: W}};
  await execute(svc, 'get_window_state', {window: W, include_screenshot: false});
  for (const [method, input] of Object.entries(inputs)) {
    events.length = 0;
    await execute(svc, method, input);
    assert.deepEqual(events, ['wait', `defer ${method}`], method);
  }
  events.length = 0;
  await svc.handleRpc({type: 'drag_start', handle_id: 'h', point: {x: 1, y: 1}});
  await svc.handleRpc({type: 'drag_move', handle_id: 'h', point: {x: 2, y: 2}});
  await svc.handleRpc({type: 'drag_end', handle_id: 'h'});
  assert.deepEqual(events, ['wait', 'defer drag_handle', 'wait', 'defer drag_handle', 'wait', 'defer drag_handle']);
  assert.deepEqual(Object.keys(SETTLE_MS).sort(), [...Object.keys(inputs), 'drag_handle', 'click_element', ...Object.values(ANIMATED_ACTION)].sort(),
    'the settle has a constant for every method that defers, the element click\'s and each animating family\'s, and only those');
});

test('the settle of a click and a named action follows what it ran: a coordinate or right click, an element\'s primary action, and that action in a family the engine names as animating it', async t => {
  // the fake engine answers an element action with the family the test names in the element id's end, as cua-engine
  // answers DoAction(0) in a family whose toolkit animates it (families.rs `animates_primary_action`)
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command, input) {
    const family = String(input.element_id ?? '').split('#')[1];
    if ((command === 'click' || command === 'perform_secondary_action') && family) return {output: {animated_action: family}};
  }`});
  const events = [];
  const svc = service(t, engine, {settler: recordingSettler(events)});
  const settleOf = async (method, input) => {
    events.length = 0;
    await execute(svc, method, input);
    assert.equal(events[0], 'wait', method);
    return events[1];
  };
  assert.equal(await settleOf('click', {window: W, x: 1, y: 1}), 'defer click', 'a coordinate click');
  assert.equal(await settleOf('click', {window: W, x: 1, y: 1, mouse_button: 'right'}), 'defer click');
  assert.equal(await settleOf('click', {x: 1, y: 1}), 'defer click', 'a desktop click');
  assert.equal(await settleOf('click', {window: W, element_id: 'n'}), 'defer click_element', 'an element\'s primary action');
  assert.equal(await settleOf('click', {window: W, element_id: 'n', mouse_button: 'left'}), 'defer click_element');
  assert.equal(await settleOf('click', {window: W, element_id: 'n', mouse_button: 'l'}), 'defer click_element');
  assert.equal(await settleOf('click', {window: W, element_id: 'n', mouse_button: 'right'}), 'defer click', 'an element\'s right click presses at its point');
  assert.equal(await settleOf('click', {window: W, element_id: 'n', mouse_button: 'r'}), 'defer click');
  assert.equal(await settleOf('click', {window: W, element_id: 'n#GTK 4'}), `defer ${ANIMATED_ACTION['GTK 4']}`);
  assert.equal(await settleOf('click', {window: W, element_id: 'n#Qt'}), `defer ${ANIMATED_ACTION.Qt}`);
  assert.equal(await settleOf('perform_secondary_action', {window: W, element_id: 'n', action: 'expand'}), 'defer perform_secondary_action');
  assert.equal(await settleOf('perform_secondary_action', {window: W, element_id: 'n#Qt', action: 'Press'}), `defer ${ANIMATED_ACTION.Qt}`, 'a named primary action settles as the element click\'s');
  assert.equal(await settleOf('perform_secondary_action', {window: W, element_id: 'n#GTK 4', action: 'click'}), `defer ${ANIMATED_ACTION['GTK 4']}`);
  // a family this service does not know yet: the longest of the animating families' settles
  const longest = Object.values(ANIMATED_ACTION).reduce((a, b) => (SETTLE_MS[b] > SETTLE_MS[a] ? b : a));
  assert.equal(await settleOf('click', {window: W, element_id: 'n#Tk'}), `defer ${longest}`);
});

test('the settle\'s real clock: the call after an input waits out that input\'s constant', async t => {
  const engine = fakeLinuxEngine(t);
  const settles = {...SETTLE_MS, press_key: 100, click: 0};
  const svc = service(t, engine, {settler: new ActionSettler({settles})});
  await execute(svc, 'list_windows');
  await execute(svc, 'press_key', {window: W, key: 'a'});
  let started = performance.now();
  await execute(svc, 'list_windows');
  assert.ok(performance.now() - started >= 95, `waited ${performance.now() - started} ms after press_key`);
  await execute(svc, 'click', {window: W, x: 1, y: 1});
  started = performance.now();
  await execute(svc, 'list_windows');
  assert.ok(performance.now() - started < 50, `waited ${performance.now() - started} ms after a click whose constant is 0`);
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

test('a new kernel\'s setup releases the drag handles the old kernel left started: the engine is told at once, the handles are forgotten, and desktop input runs', async t => {
  // js_reset or a timeout ends the kernel whose cells held the handles; the next kernel's bootstrap asks for setup
  // first, before any of its code runs (src/cua-api/bootstrap.mjs), and nothing could end those handles again
  const engine = fakeLinuxEngine(t);
  const svc = service(t, engine);
  await svc.handleRpc({type: 'setup'});
  await svc.handleRpc({type: 'drag_start', handle_id: 'h1', point: {x: 1, y: 2}});
  await svc.handleRpc({type: 'drag_move', handle_id: 'h1', point: {x: 5, y: 6}});
  assert.deepEqual(await svc.handleRpc({type: 'setup'}), {target: 'linux', methods: LINUX_METHODS});
  await assert.rejects(svc.handleRpc({type: 'drag_end', handle_id: 'h1'}), {message: 'Sky drag handle has not been started'}, 'forgotten');
  await execute(svc, 'click', {x: 3, y: 4});
  assert.deepEqual(sent(engine), [
    ['drag_handle', {action: 'start', x: 1, y: 2}],
    ['drag_handle', {action: 'move_to', x: 5, y: 6}],
    ['release_handle', {}],
    ['click', {x: 3, y: 4}],
  ]);
  // with no handle left, a setup sends nothing
  await svc.handleRpc({type: 'setup'});
  assert.equal(sent(engine).length, 4);
});

test('a kernel reset releases the handles the ended kernel left started at once, before any new kernel\'s setup; with none held it sends nothing', async t => {
  // js_reset and a cell's timeout end the kernel; the REPL host tells the trusted worker, which calls kernelReset
  // (src/repl-host/supervisor.mjs, trusted-worker.mjs), so the button is up when the reset answers
  const engine = fakeLinuxEngine(t);
  const svc = service(t, engine);
  await svc.handleRpc({type: 'setup'});
  await svc.kernelReset();
  assert.deepEqual(sent(engine), [], 'no handle: nothing sent');
  await svc.handleRpc({type: 'drag_start', handle_id: 'h1', point: {x: 1, y: 2}});
  await svc.handleRpc({type: 'drag_move', handle_id: 'h1', point: {x: 5, y: 6}});
  await svc.kernelReset();
  assert.deepEqual(sent(engine).at(-1), ['release_handle', {}], 'released at the reset itself');
  await assert.rejects(svc.handleRpc({type: 'drag_end', handle_id: 'h1'}), {message: 'Sky drag handle has not been started'}, 'forgotten');
  await svc.handleRpc({type: 'setup'});
  await svc.kernelReset();
  assert.deepEqual(sent(engine).map(([command]) => command), ['drag_handle', 'drag_handle', 'release_handle'], 'released once: the next setup and reset have nothing to release');
});

test('a kernel reset whose release fails forgets the handles and resolves; one before the engine was ever started starts nothing', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: 'export function answer(command) { if (command === \'release_handle\') return {error: \'unknown command `release_handle`\'}; }'});
  const svc = service(t, engine);
  await svc.kernelReset();
  assert.deepEqual(engine.spawns(), [], 'a reset never starts the engine');
  await svc.handleRpc({type: 'drag_start', handle_id: 'h1', point: {x: 1, y: 2}});
  assert.equal(await svc.kernelReset(), undefined);
  await assert.rejects(svc.handleRpc({type: 'drag_move', handle_id: 'h1', point: {x: 0, y: 0}}), {message: 'Sky drag handle has not been started'});
});

test('the kernel reset is not a message the service answers: a cell\'s rpc asking for one is refused, and the handle stays held', async t => {
  const engine = fakeLinuxEngine(t);
  const svc = service(t, engine);
  await svc.handleRpc({type: 'drag_start', handle_id: 'h1', point: {x: 1, y: 2}});
  for (const type of ['kernel_reset', 'kernelReset', 'release_handle'])
    await assert.rejects(svc.handleRpc({type}), {message: `Unsupported sky request type: ${type}`});
  await assert.rejects(execute(svc, 'release_handle'), {message: 'Sky runtime method is not available: release_handle'});
  await svc.handleRpc({type: 'drag_end', handle_id: 'h1'});
  assert.deepEqual(sent(engine).map(([command]) => command), ['drag_handle', 'drag_handle']);
});

test('a setup whose handle release fails still answers the methods and forgets the handles', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: 'export function answer(command) { if (command === \'release_handle\') return {error: \'unknown command `release_handle`\'}; }'});
  const svc = service(t, engine);
  await svc.handleRpc({type: 'drag_start', handle_id: 'h1', point: {x: 1, y: 2}});
  assert.deepEqual(await svc.handleRpc({type: 'setup'}), {target: 'linux', methods: LINUX_METHODS});
  await assert.rejects(svc.handleRpc({type: 'drag_move', handle_id: 'h1', point: {x: 0, y: 0}}), {message: 'Sky drag handle has not been started'});
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

// The kernel reset's path above the service (#171 M4 T18): the trusted worker calls `kernelReset` on each trusted service
// module it already loaded (src/repl-host/trusted-worker.mjs), and the sky wrapper (src/services/sky.mjs) passes it to
// the engine service it loaded, where only cua's Linux service has one. Nothing is loaded or started for it.
test('the modules\' own kernelReset with no service made yet does nothing and makes none', async () => {
  // no CUA_ENGINE_BIN or CUA_SKY_SERVICE here: making a service would not even configure
  assert.equal(await linuxKernelReset(), undefined);
  assert.equal(await skyKernelReset(), undefined);
});

test('the sky wrapper passes a kernel reset to the engine service it loaded, and loads none for it', async () => {
  const calls = [];
  const engineService = {handleRpc: async request => { calls.push(request.type); return {target: 'linux', methods: []}; }, kernelReset: async () => { calls.push('kernelReset'); }};
  let loads = 0;
  const sky = createSkyService({loadVendor: async () => { loads++; return engineService; }, platform: 'linux', nodeRepl: {}, secrets: null});
  assert.equal(await sky.kernelReset(), undefined);
  assert.equal(loads, 0, 'nothing loaded for the reset');
  await sky.handleRpc({type: 'setup'});
  await sky.kernelReset();
  assert.deepEqual(calls, ['setup', 'kernelReset']);
  assert.equal(loads, 1);
});

test('the sky wrapper\'s kernel reset with a service that has none (the vendor\'s, macOS\'s), or one that failed to load, asks nothing and resolves', async () => {
  const vendor = {handleRpc: async () => ({target: 'linux', methods: []})};
  for (const platform of ['linux', 'darwin']) {
    const sky = createSkyService({loadVendor: async () => vendor, platform, nodeRepl: {}, secrets: null, setResponseMeta: () => {}});
    await sky.handleRpc({type: 'setup'});
    assert.equal(await sky.kernelReset(), undefined, platform);
  }
  const broken = createSkyService({loadVendor: async () => { throw new Error('no such module'); }, platform: 'linux', nodeRepl: {}, secrets: null});
  await assert.rejects(broken.handleRpc({type: 'setup'}), {message: 'no such module'});
  assert.equal(await broken.kernelReset(), undefined);
});
