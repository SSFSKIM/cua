// The target of one stdio connection (Phase G): `local`, this machine's runtime, or a registered device reached through
// a device session (src/remote/client.mjs, opened through the directory of src/remote/targets.mjs). The server
// (src/mcp/server.mjs) answers devices_list and devices_use here and hands every js, js_reset, end_task, secrets_list
// and profiles_list call to `route`, which runs it locally or on the device.
//
// - devices_use: refused with task_open while a task is open on the current target (local: the task lifecycle is not
//   idle; a device: a js/js_reset went there since its session's last end_task). Switching to a device opens its
//   session first, so a failure leaves the target unchanged; switching away ends the previous device's session.
//   Calls that arrive while a switch is under way wait for it, so each runs on the target its arrival order implies.
// - On a device, a call is a tools/call with the client's own params; its result is relayed unchanged (the device
//   corrected images and redacted tokens) and tagged `_meta["cua/device"]`; a JSON-RPC error is relayed as an error;
//   a transport failure is a classified tool error (statusResult) naming the device. end_task, once answered (or
//   failed), ends the device session, so the device's runtime is freed the moment a task ends; the next call opens a
//   session lazily. Every call that opened a session says, in its text and as `_meta["cua/deviceSession"]: "new"`,
//   that the device's REPL state is fresh.
// - The device ending the session (a 404, or its own connection_closing/connection_failed answer): with no task open
//   there and the call certainly not run, the session is re-opened once and the call retried; otherwise the call
//   answers device_session_ended (its REPL state is gone; a js cell never runs twice).
// - A local cancellation of a routed js/js_reset becomes the device's notifications/cancelled. A call that rejects
//   `cancelled` (withdrawn by the device before it ran, or cancelled while its session was opening) is never answered,
//   as the local server answers nothing for a withdrawn request.
// - The device's own requests (an elicitation) reach the local client under fresh ids `cua-device-<n>`, and its answer
//   goes back under the device's id, unchanged (the device applies its own persist mode). Its notifications pass as
//   they are, except its cancellation of such a request, which names our id for it.
// - close(): ends the device session (DELETE, bounded) and settles what is still in flight.
import {DeviceError} from '../remote/client.mjs';
import {DEVICE_NAME, LOCAL} from '../remote/devices.mjs';
import {statusResult, WORK_TOOLS} from './surface.mjs';

const idKey = id => JSON.stringify(id);
const NEVER = new AbortController().signal;
const ENDING_CODES = new Set(['connection_closing', 'connection_failed']);
const ENDING_ERROR = /^cua: connection_(?:closing|failed)\b/;

const lost = () => new DeviceError('device_session_ended', 'the device session ended while a task was open there: its REPL state is gone, and the next call opens a new session (rebind apps and tabs)');
const unsure = () => new DeviceError('device_session_ended', 'the device session ended as this call reached it, so whether it ran there is unknown and it was not resent; the next call opens a new session (rebind apps and tabs)');
const gone = () => new DeviceError('device_session_ended', 'the device session was ended while the call waited (the target changed or this connection is closing)');
const closingError = () => new DeviceError('connection_closing', 'this connection is closing and accepts no more work');

// Whether an outcome says the device session ended, and whether the call may have run there. Only a request the device
// refused with 404, or one never sent because the session had already ended, certainly did not run; the device's own
// connection_closing/connection_failed answer (a tool result or a JSON-RPC error) comes both for a call it refused and
// for one it was running when its connection closed.
function sessionEnd(reply, failure) {
  if (failure) return failure.code === 'device_session_ended' ? {ran: failure.sent !== false} : null;
  if (reply.result?.isError && ENDING_CODES.has(reply.result.structuredContent?.code)) return {ran: true};
  if (typeof reply.error?.message === 'string' && ENDING_ERROR.test(reply.error.message)) return {ran: true};
  return null;
}

export function connectionTarget({devices, write, diagnostics, initializeParams, localTaskOpen, onWithdrawn = () => {}}) {
  let current = null;              // the device target: {name, link, opening, taskOpen, inflight, ended}; null is local
  let switching = null;            // the devices_use under way
  let closing = false;
  const routed = new Map();        // client request id key -> AbortController: cancellable routed calls, devices_use
  const uses = new Set();          // the AbortControllers of devices_use calls not yet settled (close aborts their opens)
  const deviceRequests = new Map(); // 'cua-device-<n>' -> {link, id}: the device's requests awaiting the local client
  let nextDeviceRequest = 0;

  const targetName = () => current?.name ?? LOCAL;
  const respond = (id, result) => write({jsonrpc: '2.0', id, result});
  const named = name => (typeof name === 'string' && DEVICE_NAME.test(name) ? name : null);

  // A classified tool error, naming the device when there is one to name.
  function failed(error, device, {endTask = false} = {}) {
    const known = typeof error?.code === 'string';
    if (!known) diagnostics(`${device ? `device ${device}: ` : ''}a call failed: ${error?.stack ?? error}`);
    const code = known ? error.code : 'device_failed';
    const structured = {status: 'error', ...(endTask ? {ended: false} : {}), code, ...(device ? {device} : {})};
    const result = statusResult(structured, {isError: true, message: `cua: ${device ? `${device}: ` : ''}${known ? error.message : 'the call failed'}`});
    return device ? {...result, _meta: {'cua/device': device}} : result;
  }

  function tagged(result, device, fresh) {
    const content = Array.isArray(result?.content) ? result.content : [];
    const note = {type: 'text', text: `cua: this call opened a new session on ${device}: its REPL state is fresh (rebind apps and tabs).`};
    return {
      ...result,
      ...(fresh ? {content: [note, ...content]} : {}),
      _meta: {...(result?._meta ?? {}), 'cua/device': device, ...(fresh ? {'cua/deviceSession': 'new'} : {})},
    };
  }

  // ---- the device session and its requests ----

  function fromDevice(link, msg) {
    if (msg.method === undefined) return;
    if (msg.id === undefined) {
      // The device withdrawing one of its requests names it by its own id; the local client knows it by ours.
      if (msg.method === 'notifications/cancelled') {
        const local = [...deviceRequests].find(([, entry]) => entry.link === link && idKey(entry.id) === idKey(msg.params?.requestId))?.[0];
        if (local) {
          deviceRequests.delete(local);
          return write({...msg, params: {...msg.params, requestId: local}});
        }
      }
      return write(msg);
    }
    const id = `cua-device-${++nextDeviceRequest}`;
    deviceRequests.set(id, {link, id: msg.id});
    write({...msg, id});
  }

  // A link is one device session: {name, session} (session set once open).
  async function openLink(name, signal) {
    const link = {name, session: null};
    link.session = await devices.open(name, {initializeParams: initializeParams(), signal, diagnostics,
      onMessage: msg => fromDevice(link, msg)});
    return link;
  }

  function endLink(link) {
    for (const [id, entry] of deviceRequests) if (entry.link === link) deviceRequests.delete(id);
    return link.session.close();
  }

  function dropLink(rec, link) {
    if (rec.link === link) rec.link = null;
    endLink(link).catch(() => {});
  }

  // Ends the device target's session; calls still waiting on it settle.
  async function leave(rec) {
    rec.ended = true;
    rec.opening?.controller.abort();
    rec.opening = null;
    const link = rec.link;
    rec.link = null;
    rec.taskOpen = false;
    if (link) await endLink(link);
  }

  // The target's session, opened lazily and shared by the calls that need it at once. A waiter whose call is cancelled
  // leaves with `cancelled`; when the last one leaves, the open itself is abandoned (and a session already granted is
  // deleted by the client).
  function ensureLink(rec, signal) {
    if (rec.link) return Promise.resolve(rec.link);
    if (!rec.opening) {
      const op = {controller: new AbortController(), waiters: 0};
      op.promise = openLink(rec.name, op.controller.signal).then(link => {
        if (rec.opening === op) rec.opening = null;
        if (rec.ended) {
          endLink(link).catch(() => {});
          throw gone();
        }
        rec.link = link;
        return link;
      }, error => {
        if (rec.opening === op) rec.opening = null;
        throw error;
      });
      op.promise.catch(() => {});
      rec.opening = op;
    }
    const op = rec.opening;
    op.waiters++;
    return new Promise((resolve, reject) => {
      let left = false;
      const settle = fn => value => {
        if (left) return;
        left = true;
        signal.removeEventListener('abort', onAbort);
        op.waiters--;
        fn(value);
      };
      const onAbort = settle(() => {
        if (op.waiters === 0) {
          if (rec.opening === op) rec.opening = null;
          op.controller.abort();
        }
        reject(new DeviceError('cancelled', 'the call was cancelled while the device session was opening'));
      });
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, {once: true});
      op.promise.then(settle(resolve), settle(reject));
    });
  }

  // One routed call on the device target → {reply, fresh}, or a throw (a DeviceError, `cancelled` included).
  async function remoteCall(rec, msg, signal) {
    const tool = msg.params.name;
    const work = WORK_TOOLS.has(tool);
    // No session, so no task: nothing to end, and no session is opened to say so.
    if (tool === 'end_task' && !rec.link && !rec.opening) return {reply: {result: statusResult({status: 'noop', ended: false})}, fresh: false};
    let fresh = false;
    for (let attempt = 1; ; attempt++) {
      if (rec.ended) throw gone();
      let link = rec.link;
      if (!link) {
        link = await ensureLink(rec, signal);
        fresh = true;
      }
      const hadTask = rec.taskOpen;
      if (work) rec.taskOpen = true;
      let reply;
      let failure;
      try { reply = await link.session.request('tools/call', msg.params, {signal}); } catch (error) { failure = error; }
      const end = sessionEnd(reply, failure);
      if (!end) {
        if (failure) {
          if (work && failure.sent === false) rec.taskOpen = hadTask;
          throw failure;
        }
        return {reply, fresh};
      }
      dropLink(rec, link);
      rec.taskOpen = false;
      if (tool === 'end_task') {
        if (hadTask) throw lost();
        return {reply: {result: statusResult({status: 'noop', ended: false})}, fresh: false};
      }
      if (hadTask) throw lost();
      if (!(work && end.ran) && attempt === 1) continue;
      throw unsure();
    }
  }

  // Ends the device session after end_task, before the answer goes out, so the device's runtime and run/ entry are free
  // by then.
  async function endSession(rec) {
    const link = rec.link;
    rec.link = null;
    rec.taskOpen = false;
    if (link) await endLink(link).catch(() => {});
  }

  function routeRemote(rec, msg) {
    const tool = msg.params.name;
    const key = idKey(msg.id);
    // js and js_reset are cancellable, as locally; end_task and the listing tools are not.
    const controller = WORK_TOOLS.has(tool) ? new AbortController() : null;
    if (controller) routed.set(key, controller);
    const done = (async () => {
      try {
        const {reply, fresh} = await remoteCall(rec, msg, controller?.signal ?? NEVER);
        if (tool === 'end_task') await endSession(rec);
        if (reply.error) write({jsonrpc: '2.0', id: msg.id, error: reply.error});
        else respond(msg.id, tagged(reply.result, rec.name, fresh));
      } catch (error) {
        if (tool === 'end_task') await endSession(rec);
        if (error?.code === 'cancelled' && !closing) return onWithdrawn(msg.id);
        respond(msg.id, failed(closing && error?.code === 'cancelled' ? closingError() : error, rec.name, {endTask: tool === 'end_task'}));
      } finally {
        if (controller && routed.get(key) === controller) routed.delete(key);
      }
    })();
    rec.inflight.add(done);
    done.finally(() => rec.inflight.delete(done));
  }

  // ---- the two tools ----

  async function list(msg) {
    let entries;
    try { entries = await devices.list(); } catch (error) {
      return respond(msg.id, failed(error, null));
    }
    const probed = await Promise.all(entries.map(async ({name, deviceId, relayUrl}) => {
      let state;
      try { state = await devices.probe(name); } catch (error) { state = {status: 'offline', code: error?.code ?? 'device_protocol'}; }
      return {name, deviceId, relay: relayUrl, ...state};
    }));
    respond(msg.id, statusResult({status: 'ok', current: targetName(), devices: [{name: LOCAL, status: 'online'}, ...probed]}));
  }

  async function switchTo(msg, wanted, signal) {
    const previous = targetName();
    if (wanted === previous) return respond(msg.id, statusResult({status: 'ok', device: wanted, previous}));
    if (current ? current.taskOpen : localTaskOpen())
      return respond(msg.id, failed(new DeviceError('task_open', `a task is open on ${previous}: call end_task there first, then devices_use`), null));
    if (current) await Promise.allSettled([...current.inflight]);
    if (closing) throw closingError();
    if (wanted === LOCAL) {
      if (current) await leave(current);
      current = null;
      return respond(msg.id, statusResult({status: 'ok', device: LOCAL, previous},
        {message: 'cua: every tool now drives this machine (local) again, under the host notes in this server\'s instructions.'}));
    }
    const link = await openLink(wanted, signal);
    if (closing) {
      await endLink(link).catch(() => {});
      throw closingError();
    }
    if (current) await leave(current);
    current = {name: wanted, link, opening: null, taskOpen: false, inflight: new Set(), ended: false};
    const notes = link.session.initializeResult?.instructions;
    const message = `cua: every tool (js, js_reset, end_task, secrets_list, profiles_list) now drives ${wanted}, in a new session `
      + `there (its REPL state is fresh). Its host notes apply until devices_use switches again:\n\n${typeof notes === 'string' && notes ? notes : '(the device sent none)'}\n`;
    respond(msg.id, {...statusResult({status: 'ok', device: wanted, previous}, {message}), _meta: {'cua/device': wanted}});
  }

  function use(msg) {
    const wanted = msg.params?.arguments?.device;
    if (typeof wanted !== 'string' || !wanted) {
      write({jsonrpc: '2.0', id: msg.id, error: {code: -32602, message: 'cua: devices_use takes {device}: a name from devices_list, or "local"'}});
      return Promise.resolve();
    }
    const key = idKey(msg.id);
    const controller = new AbortController();
    routed.set(key, controller);
    uses.add(controller);
    const run = (switching ?? Promise.resolve()).then(() => switchTo(msg, wanted, controller.signal)).catch(error => {
      if (error?.code === 'cancelled' && !closing) return onWithdrawn(msg.id);
      respond(msg.id, failed(closing && error?.code === 'cancelled' ? closingError() : error, named(wanted)));
    }).finally(() => {
      if (routed.get(key) === controller) routed.delete(key);
      uses.delete(controller);
      if (switching === run) switching = null;
    });
    switching = run;
    return run;
  }

  // A js, js_reset, end_task, secrets_list or profiles_list call: `local()` runs it here (at once when no switch is under
  // way, so local calls keep their order), else it goes to the device.
  function route(msg, local) {
    if (switching) return void switching.then(() => route(msg, local));
    if (!current) return local();
    routeRemote(current, msg);
  }

  return {
    list,
    use,
    route,
    // A local notifications/cancelled: true when it named a routed call (or a devices_use), which is cancelled here.
    cancel(params) {
      const controller = routed.get(idKey(params?.requestId));
      if (!controller) return false;
      controller.abort(params?.reason);
      return true;
    },
    // The local client's answer to a request: true when it answered one of the device's, which goes back to it.
    answer(msg) {
      const entry = typeof msg.id === 'string' ? deviceRequests.get(msg.id) : undefined;
      if (!entry) return false;
      deviceRequests.delete(msg.id);
      const reply = msg.error !== undefined ? {error: msg.error} : {result: msg.result};
      entry.link.session.respond(entry.id, reply)
        .catch(error => diagnostics(`device ${entry.link.name}: the answer to its request ${JSON.stringify(entry.id)} could not be delivered (${error.code ?? error.message})`));
      return true;
    },
    async close() {
      closing = true;
      for (const controller of uses) controller.abort();
      const rec = current;
      if (rec) await leave(rec);
      await Promise.allSettled([...(rec?.inflight ?? []), switching]);
    },
  };
}
