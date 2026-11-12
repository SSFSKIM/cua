// cua's own Linux service (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Design "The service"; #171
// M3): the module CUA_SKY_SERVICE names for the `cua` engine selection on Linux (src/runtime/launch.mjs), in place of
// @oai/sky's service and its Linux target, which are then never loaded. The trusted wrapper src/services/sky.mjs
// delegates to it unchanged (approvals, secret substitution, launch_app through the supervisor stay there). It answers
// the vendor service's messages as the vendor does (R/A §1.2), with cua-engine (./client.mjs) behind it:
//
//   {type: 'setup'}                                -> {target: 'linux', methods: the 20 names in the vendor's order};
//                                                     the handles a former kernel started are released and forgotten
//   {type: 'execute', method, args}                -> what the method returns (./methods.mjs): window states with the
//                                                     tree numbered and screenshots as {filepath, data_url}, lists as
//                                                     the engine gives them, undefined for input
//   {type: 'drag_start', handle_id, point}         -> undefined; creates the handle or reuses the stored one, starts it
//   {type: 'drag_move', handle_id, point}          -> undefined
//   {type: 'drag_end', handle_id}                  -> undefined; the handle is forgotten
//
// with the vendor's sentences for a method it does not have and a drag handle never started. Beside handleRpc it
// exports `beforeLaunch`, which the wrapper calls just before it launches an application through the supervisor
// (createService's beforeLaunch), and `kernelReset`, which the REPL host's js_reset and a cell's timeout reach through
// the trusted worker and the wrapper: the handles the ended kernel held are released then, never by a cell's request.
// Setup also starts the engine: its version is checked (MIN_ENGINE_VERSION) and its capability report read. Setup always answers with the methods, even when the engine cannot be driven (too old, not
// runnable, not configured): the facade's Sky proxy (src/cua-api/sky.mjs) answers every member of a failed setup,
// `then` included, with a rejecting function, so a rejected setup would leave the facade's bootstrap pending for ever.
// Instead every method then refuses with the sentence saying why, before anything is sent, and each call tries again
// (the version check and the start), so installing the right engine needs no new session. The method list never
// depends on the report: a method whose capability is missing is refused when called. A window state's other fields
// pass through, `truncated` among them, which the facade renders as its truncation line
// (src/cua-api/bind-linux-app.mjs).
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
  // the handles whose start is pending (waiting for the settle, the engine's start, or the engine's answer)
  const starting = new Set();

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
        // Starting the engine here reads its report early; a failure is not setup's to answer (below).
        try {
          client();
          await engine.capabilities();
        } catch { /* every method answers with the failure */ }
        await releaseHandles();
        return {target: 'linux', methods: [...LINUX_METHODS]};
      case 'execute': {
        const method = Object.getOwnPropertyDescriptor(client(), message.method)?.value;
        if (typeof method !== 'function') throw new Error(`Sky runtime method is not available: ${message.method}`);
        return method(...message.args);
      }
      case 'drag_start': {
        const handle = handles.get(message.handle_id) ?? client().drag_handle();
        starting.add(handle);
        try {
          await handle.start(message.point);
        } finally {
          starting.delete(handle);
        }
        // the engine holds one handle: every other one stored is no longer held (./methods.mjs dragHandle)
        for (const other of handles.values()) if (other !== handle) other.supersede();
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

  // At a kernel reset (js_reset or a cell's timeout; the REPL host tells the worker as it ends the kernel, #171 M4 T18)
  // and at a new kernel's setup, which comes from its first cell before its code (src/cua-api/bootstrap.mjs) and
  // catches a kernel that ended otherwise: the kernel that started the handles still stored here is gone, and its
  // handle objects with it, so nothing will end them. The engine releases a held handle at once (`release_handle`, a
  // release: never refused, and what the release leaves pending is reported as an end's is), and the handles are
  // forgotten, so desktop pointer input runs again from the reset (the design session's rulings on task 73's review,
  // 2026-11-11). Its answer is nobody's to read: an engine without the command, or one that cannot be driven, changes
  // nothing here. A start still pending is let go too (the whole-branch review of M4, P1): one not yet written to the
  // engine never is, and one already written is released by this release_handle, which the engine runs after it (it
  // runs requests one at a time, in order); either start then rejects, and its handle is never stored. With no handle
  // stored and no start written nothing is sent, and nothing is started.
  async function releaseHandles() {
    const written = [...starting].map(handle => handle.abandon()).some(Boolean);
    starting.clear();
    if (handles.size === 0 && !written) return;
    handles.clear();
    try {
      await engine.request('release_handle', {});
    } catch { /* the release is the engine's; the idle bound ends a handle it did not get */ }
  }

  // Before the wrapper launches an application through the supervisor (src/services/sky.mjs), which changes the desktop
  // by a route the engine never sees: the engine's `preflight`, a request that acts and sends nothing, so a late drag
  // and drop or a failed watch the engine has not reported yet is answered here, as it would be to any acting request
  // (Decision Log, 2026-10-31), and the launch does not happen. It waits for the settle as input does.
  async function beforeLaunch() {
    client();
    await settler.wait();
    await engine.request('preflight', {});
  }

  return {handleRpc, beforeLaunch, kernelReset: releaseHandles, close: () => engine?.close()};
}

// The service as the trusted worker loads it: one per worker. `beforeLaunch` is cua's own: the vendor's service has no
// such export, and the wrapper calls it only where the module has it.
let service = null;
export function handleRpc(message) {
  service ??= createService();
  return service.handleRpc(message);
}
export function beforeLaunch() {
  service ??= createService();
  return service.beforeLaunch();
}
// A worker that never made the service has nothing to release.
export async function kernelReset() {
  await service?.kernelReset();
}
