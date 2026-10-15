// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/project/cua/sky_js/src/sky.js:6-128 (the Sky
// facade: the computer namespace as a proxy over the trusted Sky service), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, CuaBootstrap; Table 1 cua.computer, computer.target,
// computer.launch_app). #120's clean-room rewrite replaces this port before distribution.
//
// Importing this module asks the trusted service once (`nodeRepl.rpc("sky", {type: "setup"})`) for the target and its
// methods; `sky` then exposes `target`, one method per advertised name (each `rpc("sky", {type: "execute", method,
// args})`) and, on Linux when advertised, `drag_handle`. Screenshots and Linux window state arrive as data URLs and are
// decoded to bytes; a Linux window state's ax_tree gains to_string (./linux-accessibility-tree.mjs). A failed setup is
// kept: reading an unadvertised member then returns a function that rejects with it. Not ported: the branch for a
// process with no nodeRepl at all, which drives Sky's native client directly (the native engine, not this facade);
// cua's kernel always has nodeRepl, so this module refuses as the vendor does when no trusted rpc is configured.
import {accessibility_tree} from './linux-accessibility-tree.mjs';

const nodeRepl = globalThis.nodeRepl;
let setup;
let setupError;
let client;
if (typeof nodeRepl?.rpc == 'function') {
  try {
    setup = await request({type: 'setup'});
  } catch (error) {
    setupError = error;
  }
}

export const sky = new Proxy({}, {
  get(_, name) {
    const target = skyClient();
    const value = Reflect.get(target, name);
    if (typeof value == 'function') return value.bind(target);
    if (name in target || setupError === undefined) return value;
    return () => Promise.reject(setupError);
  },
  getOwnPropertyDescriptor(_, name) {
    return Object.getOwnPropertyDescriptor(skyClient(), name);
  },
  has: (_, name) => name in skyClient(),
  ownKeys() {
    return Object.keys(skyClient());
  },
});

function skyClient() {
  if (client != null) return client;
  if (typeof nodeRepl?.rpc != 'function') throw new Error('sky requires node_repl; configure NODE_REPL_TRUSTED_SERVICES');
  const methods = {target: setup == null ? undefined : setup.target};
  for (const method of (setup == null ? undefined : setup.methods) ?? []) {
    Reflect.set(methods, method, (...args) => request({type: 'execute', method, args}));
  }
  if (methods.target === 'linux' && (setup == null ? undefined : setup.methods.includes('drag_handle'))) {
    methods.drag_handle = () => {
      const handle_id = crypto.randomUUID();
      return {
        start: point => request({type: 'drag_start', handle_id, point}),
        move_to: point => request({type: 'drag_move', handle_id, point}),
        end: () => request({type: 'drag_end', handle_id}),
      };
    };
  }
  client = methods;
  return client;
}

async function request(message) {
  if (typeof nodeRepl?.rpc != 'function') throw new Error('Computer Use requires a trusted Node REPL Sky service');
  let result = await nodeRepl.rpc('sky', message);
  if (message.type === 'execute' && message.method === 'get_screenshot') result = result.map(decodeCapture);
  if (message.type === 'execute' && message.method === 'get_window_state' && (setup == null ? undefined : setup.target) === 'linux') {
    const state = result;
    result = Object.assign(Object.assign({}, state), {ax_tree: accessibility_tree(state.ax_tree), screenshots: state.screenshots.map(decodeCapture)});
  }
  if (message.type === 'execute' && message.method === 'stop_audio_recording') result = decodeCapture(result);
  return result ?? undefined;
}

// A captured file (a screenshot, a recording) with its data URL decoded to bytes.
function decodeCapture(capture) {
  const data = capture.data_url.split(',')[1] ?? '';
  return {filepath: capture.filepath, bytes: Uint8Array.from(Buffer.from(data, 'base64')), data_url: capture.data_url};
}
