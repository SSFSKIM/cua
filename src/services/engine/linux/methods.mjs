// The 20 methods of cua's Linux service and its drag handles (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Design "The service"; R/A §1.2-1.3), each what the vendor's Linux wrapper of the same name does with cua-engine
// behind it, plus the capability check:
//
// - The settle (./settle.mjs): every method but clipboard_release waits for the deferred settle before it reaches the
//   engine; an input that succeeds defers the next one (clicks, keys, scroll, drag, move, text, clipboard_read and
//   clipboard_write, activation, launch, each drag-handle step). Reads (the lists, observations, screenshots) defer
//   nothing; a failure defers nothing.
// - Element ids (./ids.mjs): click, scroll, type_text and perform_secondary_action translate a decimal element_id after
//   the wait; get_window_state numbers the tree it returns.
// - Screenshots: each file the engine wrote is read in the request and answered as {filepath, data_url} (JPEG), the
//   shape the vendor's service hands the facade.
// - Capabilities (Design, "The capability report"): a method that needs what the engine's report lacks (a value false,
//   null or absent) is refused in one sentence naming it, before anything is waited for or sent. Window-targeted input
//   needs input.background, input with no window input.desktop, text paste text.paste, a desktop screenshot
//   capture.desktop, an observation tree and, with its screenshot (the default), capture.window.
// Every input passes to the engine as the caller gave it (an absent one as {}), field for field: what cua-engine
// validates, it refuses with its own sentence.
import {readFile} from 'node:fs/promises';

// What a missing capability stops, in the refusal's words.
const CANNOT = {
  'input.background': 'send input to a window in the background',
  'input.desktop': 'send input to the desktop',
  'text.paste': 'paste text',
  'capture.desktop': 'capture the screen',
  'capture.window': 'capture a window',
  tree: 'read a window\'s accessibility tree',
};
const inputRoute = request => (request?.window != null ? 'input.background' : 'input.desktop');

// `engine` (./client.mjs), `settler` (./settle.mjs), `ids` (./ids.mjs) -> {method: function}, in the vendor's order.
export function createLinuxMethods({engine, settler, ids}) {
  async function need(path) {
    const caps = await engine.capabilities();
    const value = path.split('.').reduce((at, key) => at?.[key], caps);
    if (value === undefined || value === null || value === false)
      throw new Error(`cua-engine cannot ${CANNOT[path]} on this desktop: its ${caps?.backend ?? 'unknown'} backend reports no ${path} capability`);
  }
  const capture = async shot => ({filepath: shot.filepath, data_url: `data:image/jpeg;base64,${(await readFile(shot.filepath)).toString('base64')}`});

  // An input method: the capability `gate` names for its request, the wait, the request (its element id translated
  // when `resolve`), the defer.
  const input = (command, {gate = null, resolve = false} = {}) => async request => {
    if (gate) await need(gate(request));
    await settler.wait();
    await engine.request(command, (resolve ? ids.resolve(request) : request) ?? {});
    settler.defer();
  };
  const read = command => async () => {
    await settler.wait();
    return engine.request(command, {});
  };

  function dragHandle() {
    let state = 'idle';
    const step = async input => {
      await settler.wait();
      await engine.request('drag_handle', input);
    };
    return {
      async start(point) {
        if (state !== 'idle') throw new Error('drag handle can only be started once');
        await need('input.desktop');
        await step(Object.assign({action: 'start'}, point));
        state = 'dragging';
        settler.defer();
      },
      async move_to(point) {
        if (state !== 'dragging') throw new Error('drag handle must be started before moving');
        await step(Object.assign({action: 'move_to'}, point));
        settler.defer();
      },
      async end() {
        if (state !== 'dragging') throw new Error('drag handle must be started before ending');
        await step({action: 'end'});
        state = 'ended';
        settler.defer();
      },
    };
  }

  return {
    perform_secondary_action: input('perform_secondary_action', {resolve: true}),
    click: input('click', {gate: inputRoute, resolve: true}),
    async clipboard_read(request) {
      await settler.wait();
      const handle = await engine.request('clipboard_read', request ?? {});
      settler.defer();
      return handle;
    },
    async clipboard_release(request) {
      await engine.request('clipboard_release', request ?? {});
    },
    clipboard_write: input('clipboard_write', {gate: () => 'text.paste'}),
    drag: input('drag', {gate: inputRoute}),
    drag_handle: dragHandle,
    activate_window: input('activate_window'),
    async get_screenshot() {
      await need('capture.desktop');
      await settler.wait();
      return Promise.all((await engine.request('get_screenshot', {})).map(capture));
    },
    list_apps: read('list_apps'),
    list_windows: read('list_windows'),
    move: input('move', {gate: inputRoute}),
    move_relative: input('move_relative', {gate: () => 'input.desktop'}),
    press_key: input('press_key', {gate: inputRoute}),
    key_down: input('key_down', {gate: inputRoute}),
    key_up: input('key_up', {gate: inputRoute}),
    scroll: input('scroll', {gate: inputRoute, resolve: true}),
    type_text: input('type_text', {gate: () => 'text.paste', resolve: true}),
    launch_app: input('launch_app'),
    async get_window_state(request) {
      await need('tree');
      if (request?.include_screenshot !== false) await need('capture.window');
      await settler.wait();
      const state = await engine.request('get_window_state', request ?? {});
      const screenshots = await Promise.all(state.screenshots.map(capture));
      ids.assign(state.ax_tree, state.window, Boolean(request.query?.trim()));
      return {...state, screenshots};
    },
  };
}
