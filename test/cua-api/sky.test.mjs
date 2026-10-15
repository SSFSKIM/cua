// The Sky facade (src/cua-api/sky.mjs): `cua.computer` as a proxy over the trusted Sky service. Each scenario imports a
// fresh instance of the module (it asks the service for its setup once, as it loads) with a `nodeRepl.rpc` double and
// records every request. With CUA_VENDOR_CUA naming the readable @oai/cua directory, each scenario also runs against
// the vendor's sky.js and the records must be equal; otherwise that half skips visibly.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {plain} from './facade-harness.mjs';

const OWN = new URL('../../src/cua-api/sky.mjs', import.meta.url).href;
const VENDOR = process.env.CUA_VENDOR_CUA && pathToFileURL(join(process.env.CUA_VENDOR_CUA, 'dist/project/cua/sky_js/src/sky.js')).href;
const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
let instance = 0;

// Loads a fresh facade from `url` over `answer(request)` (the service's side) -> {requests, result?, error?}.
async function run(url, {setup, answer = () => null, noRpc = false}, scenario) {
  const requests = [];
  const saved = globalThis.nodeRepl;
  globalThis.nodeRepl = noRpc ? {} : {rpc: async (service, request) => {
    requests.push(plain({service, ...request}));
    if (request.type === 'setup') { if (setup instanceof Error) throw setup; return setup; }
    return answer(request);
  }};
  try {
    const {sky} = await import(`${url}?instance=${++instance}`);
    return {requests, result: plain(await scenario(sky))};
  } catch (error) {
    return {requests, error: plain(error)};
  } finally {
    globalThis.nodeRepl = saved;
  }
}

const scenarios = [
  {name: 'setup names the target and the methods; each method executes through the service; a null answer is undefined',
    options: {setup: {target: 'mac', methods: ['click', 'list_apps']}, answer: request => (request.method === 'list_apps' ? [{id: 'a'}] : null)},
    run: async sky => [sky.target, Object.keys(sky), 'click' in sky, 'type_text' in sky, Object.getOwnPropertyDescriptor(sky, 'target')?.value, await sky.click({app: 'X', x: 1}), await sky.list_apps()],
    check(record) {
      assert.deepEqual(record.result, ['mac', ['target', 'click', 'list_apps'], true, false, 'mac', undefined, [{id: 'a'}]]);
      assert.deepEqual(record.requests, [{service: 'sky', type: 'setup'}, {service: 'sky', type: 'execute', method: 'click', args: [{app: 'X', x: 1}]},
        {service: 'sky', type: 'execute', method: 'list_apps', args: []}]);
    }},
  {name: 'screenshots, Linux window states and recordings arrive decoded; a Linux tree renders',
    options: {setup: {target: 'linux', methods: ['get_screenshot', 'get_window_state', 'stop_audio_recording']}, answer: request => ({
      get_screenshot: [{filepath: '/s.png', data_url: dataUrl([1, 2])}],
      get_window_state: {window: {id: 3}, ax_tree_source: 'x11', ax_tree: {id: 'x11:1', role: 'frame', name: 'W', children: []}, screenshots: [{filepath: '/w.png', data_url: dataUrl([3])}]},
      stop_audio_recording: {filepath: '/a.wav', data_url: dataUrl([4])},
    })[request.method]},
    run: async sky => {
      const state = await sky.get_window_state({window: {id: 3}});
      return [await sky.get_screenshot(), state.screenshots, state.ax_tree.to_string(), await sky.stop_audio_recording()];
    },
    check(record) {
      assert.deepEqual(record.result, [[{filepath: '/s.png', bytes: {uint8: [1, 2]}, data_url: dataUrl([1, 2])}], [{filepath: '/w.png', bytes: {uint8: [3]}, data_url: dataUrl([3])}],
        'x11:1 frame W', {filepath: '/a.wav', bytes: {uint8: [4]}, data_url: dataUrl([4])}]);
    }},
  {name: 'a macOS window state is passed through as the service answers it',
    options: {setup: {target: 'mac', methods: ['get_window_state']}, answer: () => ({ax_tree: 'plain'})},
    run: async sky => sky.get_window_state({}),
    check(record) { assert.deepEqual(record.result, {ax_tree: 'plain'}); }},
  {name: 'Linux drag handles share one id across start, move and end when advertised',
    options: {setup: {target: 'linux', methods: ['drag_handle']}},
    run: async sky => {
      const handle = sky.drag_handle();
      await handle.start({x: 1, y: 2});
      await handle.move_to({x: 3, y: 4});
      await handle.end();
      return typeof sky.drag_handle;
    },
    check(record) {
      assert.equal(record.result, 'function');
      const [, start, move, end] = record.requests;
      assert.match(start.handle_id, /^[0-9a-f-]{36}$/);
      assert.deepEqual([start, move, end], [{service: 'sky', type: 'drag_start', handle_id: start.handle_id, point: {x: 1, y: 2}},
        {service: 'sky', type: 'drag_move', handle_id: start.handle_id, point: {x: 3, y: 4}}, {service: 'sky', type: 'drag_end', handle_id: start.handle_id}]);
    }},
  {name: 'a failed setup is kept: an unadvertised member rejects with it, the target reads undefined',
    options: {setup: new Error('sky helper unavailable')},
    run: async sky => {
      let rejection;
      try { await sky.click({}); } catch (error) { rejection = error; }
      return [sky.target, typeof sky.click, rejection, Object.keys(sky)];
    },
    check(record) {
      assert.deepEqual(record.result, [undefined, 'function', {error: 'Error', message: 'sky helper unavailable'}, ['target']]);
    }},
  {name: 'without a trusted rpc the facade refuses as the vendor does',
    options: {noRpc: true},
    run: async sky => sky.target,
    check(record) {
      assert.deepEqual(record.error, {error: 'Error', message: 'sky requires node_repl; configure NODE_REPL_TRUSTED_SERVICES'});
      assert.deepEqual(record.requests, []);
    }},
];

for (const scenario of scenarios) {
  test(scenario.name, async () => {
    const record = await run(OWN, scenario.options, scenario.run);
    if (!scenario.name.startsWith('without')) assert.equal(record.error, undefined, JSON.stringify(record.error));
    scenario.check(record);
  });
  test(`vendor differential: ${scenario.name}`, {skip: VENDOR ? false : 'set CUA_VENDOR_CUA to the readable @oai/cua directory to compare with the vendor Sky facade'}, async () => {
    const mine = await run(OWN, scenario.options, scenario.run);
    const theirs = await run(VENDOR, scenario.options, scenario.run);
    if (scenario.name.startsWith('Linux drag')) for (const record of [mine, theirs]) for (const request of record.requests) if (request.handle_id) request.handle_id = '<uuid>';
    assert.deepEqual(mine, theirs);
  });
}
