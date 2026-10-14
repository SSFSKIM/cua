// Coordinate and DOM-CUA input (src/browser-service/input.mjs, the port of Bf and the cua_* and dom_cua_* commands):
// the CDP mouse and key events each command sends, in order and with the vendor's parameters, the cursor aimed first,
// the page load a click starts waited for, and the vendor's refusals. Over a recording controller, cursor and
// visible-DOM registry; typing (paste.mjs) and keys (keyboard.mjs) have their own tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Clipboard} from '../../src/browser-service/clipboard.mjs';
import {Cursor} from '../../src/browser-service/cursor.mjs';
import {CuaInput, INPUT_HANDLERS, pointThroughQuad} from '../../src/browser-service/input.mjs';

const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

// `frames` the DOM-CUA frames by id ({frameId, parentFrameId?, size?, target}); `nodes` the listed nodes by public id;
// `points` the page point each node's expression answers (by localRef).
function setup({frames = {}, nodes = {}, points = {}, quads = {}} = {}) {
  const log = [];
  const loads = [];
  const cdp = {
    async callTarget(target, method, params, options = {}) {
      options.deadline?.timeoutMs();            // as the controller: nothing is dispatched once the deadline is spent
      log.push({target, method, params, deadline: options.deadline});
      if (method === 'DOM.getFrameOwner') return {backendNodeId: `owner-${params.frameId}`};
      if (method === 'DOM.getContentQuads') return {quads: [quads[params.backendNodeId]]};
      if (method === 'Page.getLayoutMetrics') return {cssVisualViewport: {clientWidth: 800, clientHeight: 600}};
      if (method === 'Runtime.evaluate') return {result: {value: {ok: true, data: {}}}};
      return {};
    },
    async call(tabId, method, params, options) { return await this.callTarget({tabId}, method, params, options); },
    waitForPageLoadEvent(target, options) { loads.push({target, ...options}); log.push({method: 'waitForPageLoadEvent', target}); return Promise.resolve(); },
  };
  const moves = [];
  const cursor = new Cursor({async moveMouse(params) { moves.push(params); log.push({method: 'moveMouse', params}); return {}; }});
  const visibleDom = {
    node(tabId, id) { const node = nodes[id]; if (node == null) throw new Error(`DOM node ${id} is stale or missing`); return node; },
    frame(tabId, frameId) { return frames[frameId]; },
    async evaluate(target, frameId, loaderId, expression, {returnByValue}) {
      log.push({method: 'Runtime.evaluate', target, frameId, expression, returnByValue});
      const ref = JSON.parse(expression.match(/\)\((".*?"), /)[1]);
      return {result: {value: points[ref] ?? null}};
    },
  };
  const session = {cdp, cursor, visibleDom, platform: 'linux', clipboard: new Clipboard(), tabs: {get: async id => ({id, url: 'https://fixture.test/'})}};
  session.input = new CuaInput(cdp, cursor, visibleDom, {platform: 'linux'});
  const run = (type, params) => INPUT_HANDLERS[type]({browser_id: 'b', tab_id: '4', ...params}, session);
  const mouse = () => log.filter(e => e.method === 'Input.dispatchMouseEvent').map(e => e.params);
  return {log, loads, moves, run, mouse, session};
}

test('cua_click aims the cursor, moves, presses and releases at the point, then waits for a load the click starts', async () => {
  const {log, loads, moves, run, mouse} = setup();
  assert.deepEqual(await run('cua_click', {x: 10, y: 20, button: 3, keys: ['Shift']}), {});
  assert.deepEqual(moves, [{tabId: 4, x: 10, y: 20}]);
  assert.deepEqual(mouse(), [
    {type: 'mouseMoved', x: 10, y: 20, button: 'none', buttons: 0, modifiers: 8},
    {type: 'mousePressed', x: 10, y: 20, button: 'right', buttons: 2, clickCount: 1, modifiers: 8},
    {type: 'mouseReleased', x: 10, y: 20, button: 'right', buttons: 0, clickCount: 1, modifiers: 8},
  ]);
  assert.deepEqual(log.map(e => e.method), ['waitForPageLoadEvent', 'moveMouse', 'Input.dispatchMouseEvent', 'Input.dispatchMouseEvent', 'Input.dispatchMouseEvent'],
    'the load wait is armed before the click');
  assert.deepEqual(loads.map(({target, timeoutMs, deadline}) => [target, timeoutMs, deadline.ms]), [[4, 3000, 3000]], 'the vendor\'s 10 s, cut by its own clamp to 3 s');
  for (const e of log.filter(e => e.method === 'Input.dispatchMouseEvent')) assert.ok(e.deadline.ms === 3000);
});

test('a click\'s budget bounds the cursor\'s acknowledgment and the load wait: a silent cursor sends nothing after it', async () => {
  const {session, loads, mouse} = setup();
  const sent = [];
  session.input.cursor = new Cursor({moveMouse(params, options) { sent.push(options); return new Promise(() => {}); }});
  const started = Date.now();
  const error = await rejection(session.input.clickPoint({clickCount: 1, modifiers: 0, point: {x: 1, y: 2}, tabId: 4, timeoutMs: 30}));
  assert.equal(error.code, 'timeout');
  assert.ok(Date.now() - started < 300, `settled with its budget (${Date.now() - started} ms)`);
  assert.equal(mouse().length, 0, 'no Input event once the budget is spent');
  assert.equal(sent[0].deadline.ms, 30, 'the backend request carries the deadline');
  assert.equal(loads[0].deadline.ms, 30, 'the load wait carries the deadline');
});

test('cua_double_click presses twice with rising click counts, left button', async () => {
  const {run, mouse} = setup();
  await run('cua_double_click', {x: 5, y: 6});
  assert.deepEqual(mouse().map(e => `${e.type} ${e.button} ${e.clickCount ?? ''}`.trim()),
    ['mouseMoved none', 'mousePressed left 1', 'mouseReleased left 1', 'mousePressed left 2', 'mouseReleased left 2']);
});

test('the coordinate commands refuse non-finite points and unknown buttons before sending anything', async () => {
  const {log, run} = setup();
  assert.equal((await rejection(run('cua_click', {x: Number.NaN, y: 1}))).message, 'cua_click requires finite x and y coordinates');
  assert.equal((await rejection(run('cua_click', {x: 1, y: 1, button: 4}))).message, 'Unsupported CUA mouse button: 4');
  assert.equal((await rejection(run('cua_scroll', {x: 1, y: Infinity, scroll_x: 0, scroll_y: 1}))).message, 'cua_scroll requires finite x and y coordinates');
  assert.equal((await rejection(run('cua_drag', {path: []}))).message, 'cua_drag requires a non-empty path');
  assert.equal((await rejection(run('cua_drag', {path: [{x: 1, y: 1}, {x: 'a', y: 2}]}))).message, 'cua_drag requires finite x and y coordinates');
  assert.equal((await rejection(run('cua_click', {x: 1, y: 1, tab_id: 'x'}))).message, 'Expected a positive integer');
  assert.equal(log.length, 0);
});

test('cua_drag presses at the first point, moves through the path with the button held, releases at the last', async () => {
  const {moves, run, mouse} = setup();
  await run('cua_drag', {path: [{x: 60, y: 180}, {x: 100, y: 180}, {x: 160, y: 180}], keys: ['Alt']});
  assert.deepEqual(mouse(), [
    {type: 'mouseMoved', x: 60, y: 180, button: 'none', buttons: 0, modifiers: 1},
    {type: 'mousePressed', x: 60, y: 180, button: 'left', buttons: 1, clickCount: 1, modifiers: 1},
    {type: 'mouseMoved', x: 100, y: 180, button: 'left', buttons: 1, modifiers: 1},
    {type: 'mouseMoved', x: 160, y: 180, button: 'left', buttons: 1, modifiers: 1},
    {type: 'mouseReleased', x: 160, y: 180, button: 'left', buttons: 0, clickCount: 1, modifiers: 1},
  ]);
  assert.deepEqual(moves, [{tabId: 4, x: 60, y: 180}, {tabId: 4, waitForArrival: false, x: 100, y: 180}, {tabId: 4, waitForArrival: false, x: 160, y: 180}]);
});

test('a drag that fails midway still releases the button, where it was going (the vendor\'s order)', async () => {
  const {session, mouse} = setup();
  const send = session.cdp.callTarget.bind(session.cdp);
  let moved = 0;
  session.cdp.callTarget = async (target, method, params, options) => {
    if (params?.type === 'mouseMoved' && params.buttons === 1 && ++moved === 2) throw new Error('Debugger unattached');
    return await send(target, method, params, options);
  };
  await assert.rejects(INPUT_HANDLERS.cua_drag({tab_id: '4', path: [{x: 1, y: 1}, {x: 2, y: 2}, {x: 3, y: 3}]}, session), {message: 'Debugger unattached'});
  assert.deepEqual(mouse().at(-1), {type: 'mouseReleased', x: 3, y: 3, button: 'left', buttons: 0, clickCount: 1, modifiers: 0});
});

test('cua_scroll moves to the point and synthesizes a mouse scroll gesture of the opposite distances', async () => {
  const {log, run} = setup();
  await run('cua_scroll', {x: 280, y: 200, scroll_x: 0, scroll_y: 400});
  const gesture = log.find(e => e.method === 'Input.synthesizeScrollGesture');
  assert.deepEqual(gesture.params, {x: 280, y: 200, xDistance: 0, yDistance: -400, gestureSourceType: 'mouse', preventFling: true, speed: 8000});
  assert.deepEqual(log.filter(e => e.method === 'Input.dispatchMouseEvent').map(e => e.params.type), ['mouseMoved']);
});

test('cua_keypress presses the keys on the tab; a clipboard shortcut goes to the virtual clipboard instead', async () => {
  const {log, run} = setup();
  await run('cua_keypress', {keys: ['END']});
  assert.deepEqual(log.filter(e => e.method === 'Input.dispatchKeyEvent').map(e => `${e.params.type} ${e.params.key}`), ['rawKeyDown End', 'keyUp End']);
  assert.equal((await rejection(run('cua_keypress', {keys: []}))).message, 'cua_keypress requires a non-empty keys array');
  assert.equal((await rejection(run('dom_cua_keypress', {keys: 'Enter'}))).message, 'dom_cua_keypress requires a non-empty keys array');
  log.length = 0;
  await run('cua_keypress', {keys: ['ctrl', 'c']}).catch(() => {});
  assert.equal(log.filter(e => e.method === 'Input.dispatchKeyEvent').length, 0, 'no native copy is pressed');
});

test('dom_cua_click clicks the centre of the listed node, mapped through its frames to the top document', async () => {
  const frames = {
    MAIN: {frameId: 'MAIN', target: {tabId: 4}},
    CHILD: {frameId: 'CHILD', parentFrameId: 'MAIN', size: {width: 200, height: 100}, target: {tabId: 4}},
  };
  const nodes = {7: {frameId: 'CHILD', loaderId: 'L', localRef: 'r7', target: {tabId: 4}, viewportClip: {left: 0, top: 0, right: 200, bottom: 100}}};
  const {log, run, mouse} = setup({frames, nodes, points: {r7: {x: 20, y: 10}}, quads: {'owner-CHILD': [100, 50, 300, 50, 300, 150, 100, 150]}});
  await run('dom_cua_click', {node_id: '7'});
  const evaluation = log.find(e => e.method === 'Runtime.evaluate');
  assert.equal(evaluation.frameId, 'CHILD');
  assert.equal(evaluation.returnByValue, true);
  assert.match(evaluation.expression, /__browserUseVisibleDomState/);
  assert.deepEqual(mouse().map(e => [e.type, e.x, e.y]), [['mouseMoved', 120, 60], ['mousePressed', 120, 60], ['mouseReleased', 120, 60]]);
  assert.ok(log.every(e => e.method !== 'Input.dispatchMouseEvent' || e.target.tabId === 4 && e.target.sessionId == null));
});

test('a node in an out-of-process frame is clicked in its own target at its own point; the cursor and load wait use the tab', async () => {
  const oopif = {tabId: 4, sessionId: 'S1'};
  const frames = {
    MAIN: {frameId: 'MAIN', target: {tabId: 4}},
    OOP: {frameId: 'OOP', parentFrameId: 'MAIN', size: {width: 200, height: 100}, target: oopif},
  };
  const nodes = {3: {frameId: 'OOP', localRef: 'r3', target: oopif}};
  const {loads, moves, run, mouse, log} = setup({frames, nodes, points: {r3: {x: 20, y: 10}}, quads: {'owner-OOP': [100, 50, 300, 50, 300, 150, 100, 150]}});
  await run('dom_cua_double_click', {node_id: '3'});
  assert.deepEqual(moves, [{tabId: 4, x: 120, y: 60}]);
  assert.deepEqual(mouse().map(e => [e.type, e.x, e.y]).slice(0, 2), [['mouseMoved', 20, 10], ['mousePressed', 20, 10]]);
  assert.ok(log.filter(e => e.method === 'Input.dispatchMouseEvent').every(e => e.target.sessionId === 'S1'));
  assert.deepEqual(loads.map(l => l.target), [oopif, 4]);
});

test('dom_cua commands refuse a missing, empty or stale node id with the vendor\'s sentences', async () => {
  const {run} = setup({nodes: {9: {frameId: 'MAIN', localRef: 'gone', target: {tabId: 4}}}, frames: {MAIN: {frameId: 'MAIN', target: {tabId: 4}}}});
  assert.equal((await rejection(run('dom_cua_click', {}))).message, 'dom_cua_click node_id is required');
  assert.equal((await rejection(run('dom_cua_click', {node_id: ''}))).message, 'dom_cua_click node_id must not be empty');
  assert.equal((await rejection(run('dom_cua_double_click', {node_id: 5}))).message, 'dom_cua_double_click node_id must be a string');
  assert.equal((await rejection(run('dom_cua_click', {node_id: '1'}))).message, 'DOM node 1 is stale or missing');
  assert.equal((await rejection(run('dom_cua_click', {node_id: '9'}))).message, 'DOM node 9 is stale or missing');
  assert.equal((await rejection(run('dom_cua_scroll', {node_id: '', scroll_x: 0, scroll_y: 1}))).message, 'dom_cua_scroll node_id must not be empty');
});

test('dom_cua_scroll scrolls at the node, or at the viewport\'s centre without one', async () => {
  const frames = {MAIN: {frameId: 'MAIN', target: {tabId: 4}}};
  const {log, run} = setup({frames, nodes: {2: {frameId: 'MAIN', localRef: 'r2', target: {tabId: 4}}}, points: {r2: {x: 33, y: 44}}});
  await run('dom_cua_scroll', {node_id: '2', scroll_x: 0, scroll_y: 100});
  await run('dom_cua_scroll', {scroll_x: 10, scroll_y: 0});
  assert.deepEqual(log.filter(e => e.method === 'Input.synthesizeScrollGesture').map(e => [e.params.x, e.params.y, e.params.xDistance, e.params.yDistance]),
    [[33, 44, 0, -100], [400, 300, -10, 0]]);
});

test('cua_type and dom_cua_type type by paste into the focused element', async () => {
  const {log, run} = setup();
  await run('cua_type', {text: 'pointer'});
  await run('dom_cua_type', {text: 'dom'});
  const pastes = log.filter(e => e.method === 'Runtime.evaluate' && e.params?.expression?.includes('pageFunction'));
  assert.equal(pastes.length, 2);
  assert.match(pastes[0].params.expression, /"action":"paste"/);
  assert.match(pastes[1].params.expression, /"text":"dom"/);
});

test('a point maps through a frame owner\'s quad by its size, or by its offset when the size is unknown', () => {
  const quad = [100, 50, 300, 50, 300, 150, 100, 150];
  assert.deepEqual(pointThroughQuad({x: 20, y: 10}, {width: 400, height: 200}, quad), {x: 110, y: 55});
  assert.deepEqual(pointThroughQuad({x: 20, y: 10}, null, quad), {x: 120, y: 60});
  assert.equal(pointThroughQuad({x: 1, y: 1}, null, [1, 2]), null);
});
