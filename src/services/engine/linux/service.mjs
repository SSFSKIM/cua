// cua's own Linux service (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Design "The service"; #171
// M3): the module CUA_SKY_SERVICE names for the `cua` engine selection on Linux (src/runtime/launch.mjs), in place of
// @oai/sky's service and its Linux target, which are then never loaded. The trusted wrapper src/services/sky.mjs
// delegates to it unchanged (approvals, secret substitution, launch_app through the supervisor stay there). It answers
// the vendor service's messages as the vendor does (R/A §1.2), with cua-engine (./client.mjs) behind it:
//
//   {type: 'setup'}                                -> {target: 'linux', methods: the 20 names in the vendor's order}
//   {type: 'execute', method, args}                -> what the method returns (./methods.mjs): window states with the
//                                                     tree numbered and screenshots as {filepath, data_url}, lists as
//                                                     the engine gives them, undefined for input
//   {type: 'drag_start', handle_id, point}         -> undefined; creates the handle or reuses the stored one, starts it
//   {type: 'drag_move', handle_id, point}          -> undefined
//   {type: 'drag_end', handle_id}                  -> undefined; the handle is forgotten
//
// with the vendor's sentences for a method it does not have and a drag handle never started. Setup also starts the
// engine: its version is checked (MIN_ENGINE_VERSION) and its capability report read, so an engine this service cannot
// drive fails setup with the sentence saying why, and the facade (src/cua-api/sky.mjs, which keeps a failed setup)
// rejects every computer method with it. The method list never depends on the report: a method whose capability is
// missing is refused when called. A window state's other fields pass through, `truncated` among them, which the
// facade renders as its truncation line (src/cua-api/bind-linux-app.mjs).
//
// Configuration, from the trusted worker's environment, which the launch sets: CUA_ENGINE_BIN, the engine (the
// selection's canonical path), and CUA_DESKTOP_MODE, the device mode it is started in (`shared`, the default, or
// `dedicated`). One service, one engine and one element numbering per trusted worker, which is the connection's.
import {createEngineClient} from './client.mjs';
import {ElementIds} from './ids.mjs';
import {createLinuxMethods} from './methods.mjs';
import {ActionSettler} from './settle.mjs';

export const LINUX_METHODS = ['perform_secondary_action', 'click', 'clipboard_read', 'clipboard_release', 'clipboard_write', 'drag', 'drag_handle', 'activate_window',
  'get_screenshot', 'list_apps', 'list_windows', 'move', 'move_relative', 'press_key', 'key_down', 'key_up', 'scroll', 'type_text', 'launch_app', 'get_window_state'];
const DESKTOP_MODES = ['shared', 'dedicated'];

export function createService({env = process.env, settler = new ActionSettler()} = {}) {
  let engine = null;
  let methods = null;
  const handles = new Map();

  function client() {
    if (methods) return methods;
    const path = env.CUA_ENGINE_BIN;
    if (!path) throw new Error('cua: cua-engine is not configured for this runtime (CUA_ENGINE_BIN) [engine_not_configured]');
    const desktop = env.CUA_DESKTOP_MODE || 'shared';
    if (!DESKTOP_MODES.includes(desktop)) throw new Error(`CUA_DESKTOP_MODE must be ${DESKTOP_MODES.join(' or ')}`);
    engine = createEngineClient({path, desktop});
    methods = Object.assign(Object.create(null), createLinuxMethods({engine, settler, ids: new ElementIds()}));
    return methods;
  }

  async function handleRpc(message) {
    switch (message.type) {
      case 'setup':
        client();
        await engine.capabilities();
        return {target: 'linux', methods: [...LINUX_METHODS]};
      case 'execute': {
        const method = Object.getOwnPropertyDescriptor(client(), message.method)?.value;
        if (typeof method !== 'function') throw new Error(`Sky runtime method is not available: ${message.method}`);
        return method(...message.args);
      }
      case 'drag_start': {
        const handle = handles.get(message.handle_id) ?? client().drag_handle();
        await handle.start(message.point);
        handles.set(message.handle_id, handle);
        return undefined;
      }
      case 'drag_move': {
        const handle = handles.get(message.handle_id);
        if (handle == null) throw new Error('Sky drag handle has not been started');
        return handle.move_to(message.point);
      }
      case 'drag_end': {
        const handle = handles.get(message.handle_id);
        if (handle == null) throw new Error('Sky drag handle has not been started');
        await handle.end();
        handles.delete(message.handle_id);
        return undefined;
      }
      default:
        throw new Error(`Unsupported sky request type: ${String(message.type)}`);
    }
  }

  return {handleRpc, close: () => engine?.close()};
}

// The service as the trusted worker loads it: one per worker.
let service = null;
export function handleRpc(message) {
  service ??= createService();
  return service.handleRpc(message);
}
