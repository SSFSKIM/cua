// The 20 methods of cua's Linux service and its drag handles (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Design "The service"; R/A §1.2-1.3), each what the vendor's Linux wrapper of the same name does with cua-engine
// behind it, plus the capability check:
//
// - The settle (./settle.mjs): every method but clipboard_release waits for the deferred settle before it reaches the
//   engine; an input that succeeds defers the next one by its own method's constant (clicks, keys, scroll, drag, move,
//   text, clipboard_read and clipboard_write, activation, launch; each drag-handle step by drag_handle's), a click by
//   what it ran (a coordinate click, an element's primary action, or that action in a family whose toolkit animates
//   it, as cua-engine's answer names it), and so a named action that ran the element's primary action. Reads (the
//   lists, observations, screenshots) defer nothing; a failure defers nothing.
// - Element ids (./ids.mjs): click, scroll, type_text and perform_secondary_action translate a decimal element_id after
//   the wait; get_window_state numbers the tree it returns.
// - Screenshots: each file the engine wrote is read in the request and answered as {filepath, data_url} (JPEG), the
//   shape the vendor's service hands the facade.
// - Capabilities (Design, "The capability report"): a method that needs what the engine's report lacks (a value false,
//   null or absent) is refused in one sentence naming it, with nothing sent. The report checked is that of the engine
//   process the request would be written to (./client.mjs request's check), so an engine restarted while the request
//   waited is judged by its own report. Window-targeted input needs input.background, input with no window
//   input.desktop, text paste text.paste, a desktop screenshot capture.desktop, an observation tree and, with its
//   screenshot (the default), capture.window.
// - The pending drag notice (#171 M4 T14): get_window_state's state carries the engine's `notice` as its own field,
//   which the facade renders as the observation's first line (src/cua-api/bind-linux-app.mjs); the other answers keep
//   their shapes, and a failed request's sentence carries it after its own (./client.mjs).
// Every input passes to the engine as the caller gave it (an absent one as {}), field for field: what cua-engine
// validates, it refuses with its own sentence.
import {readFile} from 'node:fs/promises';
import {animatedSettle} from './settle.mjs';

// What a missing capability stops, in the refusal's words (cua doctor's engine row names them too).
export const CANNOT = {
  'input.background': 'send input to a window in the background',
  'input.desktop': 'send input to the desktop',
  'text.paste': 'paste text',
  'capture.desktop': 'capture the screen',
  'capture.window': 'capture a window',
  tree: 'read a window\'s accessibility tree',
};
const inputRoute = request => (request?.window != null ? 'input.background' : 'input.desktop');
// A drag handle's start that a kernel reset overtook (dragHandle's `abandon`).
export const ABANDONED = 'drag handle was let go: the kernel that started it was reset';
// A move or an end of a handle the engine no longer holds (dragHandle's `supersede`, and an answer of the engine's idle
// release), refused with nothing sent.
export const STALE_HANDLE = {
  later: 'this drag handle is no longer held: a later drag handle started since; this request was not run. Start a new handle to drag again',
  expired: 'this drag handle is no longer held: cua released it after it got no request for its idle bound; this request was not run. Start a new handle to drag again',
};
// cua-engine's answers that its handle was released for its idle bound: the timeout's pending refusal, then the expiry.
const IDLE_RELEASED = /^Pending from your last drag, a drag handle released by timeout: |^your drag handle in .* is no longer held: it got no request for /;

// `engine` (./client.mjs), `settler` (./settle.mjs), `ids` (./ids.mjs) -> {method: function}, in the vendor's order.
export function createLinuxMethods({engine, settler, ids}) {
  // The check of a capability report that refuses unless it has every one of `paths`.
  const needs = (...paths) => caps => {
    for (const path of paths) {
      const value = path.split('.').reduce((at, key) => at?.[key], caps);
      if (value === undefined || value === null || value === false)
        throw new Error(`cua-engine cannot ${CANNOT[path]} on this desktop: its ${caps?.backend ?? 'unknown'} backend reports no ${path} capability`);
    }
  };
  const capture = async shot => ({filepath: shot.filepath, data_url: `data:image/jpeg;base64,${(await readFile(shot.filepath)).toString('base64')}`});

  // An input method: the wait, the request (its element id translated when `resolve`) checked for the capability
  // `gate` names for it, the defer by the settle `settle` names for the request and the engine's answer (the command's
  // own by default).
  const input = (command, {gate = null, resolve = false, settle = () => command} = {}) => async request => {
    await settler.wait();
    const answer = await engine.request(command, (resolve ? ids.resolve(request) : request) ?? {}, gate ? needs(gate(request)) : undefined);
    settler.defer(settle(request, answer));
  };
  // An element action's settle: by the family cua-engine names when the action it ran was the element's primary action
  // in a family that animates it, else `otherwise`.
  const actionSettle = (answer, otherwise) => (typeof answer?.animated_action === 'string' ? animatedSettle(answer.animated_action) : otherwise);
  // A click's: an element's primary action (a left click naming an element, its button absent, left or l as cua-engine
  // reads it) by the element action's; a coordinate click, and an element's right click, which presses at its point, by
  // click's.
  const clickSettle = (request, answer) => (request?.element_id != null && !['right', 'r'].includes(request.mouse_button) ? actionSettle(answer, 'click_element') : 'click');
  const read = command => async () => {
    await settler.wait();
    return engine.request(command, {});
  };

  // A drag handle. Beside the vendor's three steps it has `abandon`, which the service calls at a kernel reset
  // (./service.mjs): a step not yet written to the engine is then refused where it would be written (the engine's
  // request check, with nothing awaited before the write), so nothing of the handle reaches the wire after the reset's
  // release; a start already written is the reset's to release, and `abandon` answers whether there is one. A start then
  // rejects either way, so the service never stores a handle of a kernel that is gone.
  //
  // The engine holds at most one handle, and the wire names none, so a move or an end goes to whichever handle the engine
  // holds. A handle is stale, and its move and end are refused here with nothing sent, once another handle's start
  // succeeded (`supersede`, which the service calls) or once one of its own requests came back with the engine's idle
  // release (the design session's ruling on the whole-branch review of M4): a stale handle's move would otherwise drag
  // the later handle the agent never named. The check comes again where the request would be written, so a move waiting
  // for the settle while another handle started is refused too.
  function dragHandle() {
    let state = 'idle';
    let abandoned = false;
    let startWritten = false;
    let stale = null;
    const fresh = () => {
      if (abandoned) throw new Error(ABANDONED);
      if (stale) throw new Error(stale);
    };
    const step = async (input, check) => {
      await settler.wait();
      await engine.request('drag_handle', input, check);
    };
    // a move's or an end's step: refused once stale; an answer of the engine's idle release makes it stale
    const held = async input => {
      fresh();
      try {
        await step(input, fresh);
      } catch (error) {
        if (IDLE_RELEASED.test(error.message)) stale = STALE_HANDLE.expired;
        throw error;
      }
    };
    return {
      async start(point) {
        if (state !== 'idle') throw new Error('drag handle can only be started once');
        await step(Object.assign({action: 'start'}, point), caps => {
          if (abandoned) throw new Error(ABANDONED);
          needs('input.desktop')(caps);
          startWritten = true;
        });
        if (abandoned) throw new Error(ABANDONED);
        state = 'dragging';
        settler.defer('drag_handle');
      },
      abandon() {
        abandoned = true;
        return startWritten;
      },
      supersede() {
        if (state === 'dragging') stale ??= STALE_HANDLE.later;
      },
      async move_to(point) {
        if (state !== 'dragging') throw new Error('drag handle must be started before moving');
        await held(Object.assign({action: 'move_to'}, point));
        settler.defer('drag_handle');
      },
      async end() {
        if (state !== 'dragging') throw new Error('drag handle must be started before ending');
        await held({action: 'end'});
        state = 'ended';
        settler.defer('drag_handle');
      },
    };
  }

  return {
    // a named action may be the element's primary action, which then settles as the element click's (the vendor lets
    // a name choose it too: its perform_action matches every action's name, the first included)
    perform_secondary_action: input('perform_secondary_action', {resolve: true, settle: (request, answer) => actionSettle(answer, 'perform_secondary_action')}),
    click: input('click', {gate: inputRoute, resolve: true, settle: clickSettle}),
    async clipboard_read(request) {
      await settler.wait();
      const handle = await engine.request('clipboard_read', request ?? {});
      settler.defer('clipboard_read');
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
      await settler.wait();
      return Promise.all((await engine.request('get_screenshot', {}, needs('capture.desktop'))).map(capture));
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
      await settler.wait();
      const {output: state, notice} = await engine.exchange('get_window_state', request ?? {}, needs('tree', ...(request?.include_screenshot !== false ? ['capture.window'] : [])));
      const screenshots = await Promise.all(state.screenshots.map(capture));
      ids.assign(state.ax_tree, state.window, Boolean(request.query?.trim()));
      return {...state, screenshots, ...(notice !== undefined ? {notice} : {})};
    },
  };
}
