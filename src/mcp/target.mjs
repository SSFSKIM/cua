// The target of one stdio connection (Phase G): `local`, this machine's runtime, or a registered device reached through
// a device session (src/remote/client.mjs, opened through the directory of src/remote/directory.mjs). The server
// (src/mcp/server.mjs) answers devices_list and devices_use here and hands every js, js_reset, end_task, secrets_list
// and profiles_list call to `route`, which runs it locally or on the device.
//
// - devices_use: refused with task_open while a task is open on the current target (local: the task lifecycle is not
//   idle; a device: a js/js_reset went there since its session's last end_task). Switching to a device opens its
//   session and lists its tools first, so a failure leaves the target unchanged; the answer carries the device's host
//   notes and its js and profiles_list descriptions, where its surface rules are. Switching away ends the previous
//   device's session.
//   Calls that arrive while a switch is under way wait for it, so each runs on the target its arrival order implies.
// - On a device, a call is a tools/call with the client's own params; its result is relayed unchanged (the device
//   corrected images and redacted tokens) and tagged `_meta["cua/device"]`; a JSON-RPC error is relayed as an error;
//   a transport failure is a classified tool error (statusResult) naming the device. end_task, once answered (or
//   failed), ends the device session, so the device's runtime is freed the moment a task ends; the next call opens a
//   session lazily. The first call answered on a session opened that way says, in its text and as
//   `_meta["cua/deviceSession"]: "new"`, that the device's REPL state is fresh (devices_use's own answer says it for the
//   session it opens). A failed end_task says the device session is closed and devices_use still works.
// - The device ending the session (a 404, or its own connection_closing/connection_failed answer): with no task open
//   there and the call certainly not run, the session is re-opened once and the call retried; otherwise the call
//   answers device_session_ended (its REPL state is gone; a js cell never runs twice).
// - A local cancellation of a routed js/js_reset becomes the device's notifications/cancelled. A call that rejects
//   `cancelled` (withdrawn by the device before it ran, cancelled while its session was opening, or while it waited for
//   a switch) is never answered, as the local server answers nothing for a withdrawn request. On a closing connection a
//   call cut short answers connection_closing.
// - The device's own requests (an elicitation) reach the local client under fresh ids `cua-device-<n>`, and its answer
//   goes back under the device's id, unchanged (the device applies its own persist mode). Its notifications pass as
//   they are, except its cancellation of such a request, which names our id for it (and is dropped when it names none);
//   a local answer to a `cua-device-` id no longer awaited is dropped.
// - close(): ends the device session (DELETE, bounded) and settles what is still in flight.
import {DeviceError} from '../remote/client.mjs';
import {DEVICE_NAME, LOCAL} from '../remote/devices.mjs';
import {statusResult, WORK_TOOLS} from './surface.mjs';

const idKey = id => JSON.stringify(id);
const DEVICE_REQUEST = 'cua-device-';     // the local ids of the device's own requests
const NEVER = new AbortController().signal;
const ENDING_CODES = new Set(['connection_closing', 'connection_failed']);
const ENDING_ERROR = /^cua: connection_(?:closing|failed)\b/;
const RULED_TOOLS = ['js', 'profiles_list'];  // the tools whose descriptions carry a surface's rules (surface.mjs)

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
  let current = null;              // the device target: {name, link, opening, taskOpen, pendingWork, inflight, ended}; null is local
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
  function failed(error, device, {endTask = false, after = null} = {}) {
    const known = typeof error?.code === 'string';
    if (!known) diagnostics(`${device ? `device ${device}: ` : ''}a call failed: ${error?.stack ?? error}`);
    const code = known ? error.code : 'device_failed';
    const structured = {status: 'error', ...(endTask ? {ended: false} : {}), code, ...(device ? {device} : {})};
    const text = `${device ? `${device}: ` : ''}${known ? error.message : 'the call failed'}${after ? `; ${after}` : ''}`;
    const result = statusResult(structured, {isError: true, message: `cua: ${text}`});
    return device ? {...result, _meta: {'cua/device': device}} : result;
  }

  // Claude Code shows the model only the structured content of a successful result that has one, dropping its text, so
  // a note the model must read goes in both.
  function tagged(result, device, fresh) {
    const content = Array.isArray(result?.content) ? result.content : [];
    const text = `cua: this is a new session on ${device}: its REPL state is fresh (rebind apps and tabs).`;
    const structured = result?.structuredContent;
    const noted = fresh && structured && typeof structured === 'object' && !Array.isArray(structured);
    return {
      ...result,
      ...(fresh ? {content: [{type: 'text', text}, ...content]} : {}),
      ...(noted ? {structuredContent: {...structured, 'cua/note': text}} : {}),
      _meta: {...(result?._meta ?? {}), 'cua/device': device, ...(fresh ? {'cua/deviceSession': 'new'} : {})},
    };
  }

  // A devices_use answer: the note (and a device's host notes) in the text for clients that read it, and in the
  // structured content for Claude Code, which reads only that; the text's JSON line repeats neither. A device's surface
  // rules, its own js and profiles_list descriptions (`tools`), are fields of both.
  function switched({device, previous, note, hostNotes, tools}) {
    const fields = {status: 'ok', device, previous, ...(tools === undefined ? {} : {tools})};
    const text = [note, ...(hostNotes === undefined ? [] : ['', hostNotes, '']), JSON.stringify(fields)].join('\n');
    return {content: [{type: 'text', text}], structuredContent: {...fields, note, ...(hostNotes === undefined ? {} : {hostNotes})}, isError: false};
  }

  // ---- the device session and its requests ----

  function fromDevice(link, msg) {
    if (msg.method === undefined) return;
    if (msg.id === undefined) {
      // The device withdrawing one of its requests names it by its own id; the local client knows it by ours.
      if (msg.method === 'notifications/cancelled') {
        const local = [...deviceRequests].find(([, entry]) => entry.link === link && idKey(entry.id) === idKey(msg.params?.requestId))?.[0];
        // A withdrawal of nothing the local client was asked would name an id it never saw: dropped.
        if (!local) return diagnostics(`device ${link.name}: a cancellation names no request of its awaiting an answer; dropped`);
        deviceRequests.delete(local);
        return write({...msg, params: {...msg.params, requestId: local}});
      }
      return write(msg);
    }
    const id = `${DEVICE_REQUEST}${++nextDeviceRequest}`;
    deviceRequests.set(id, {link, id: msg.id});
    write({...msg, id});
  }

  // A link is one device session: {name, session (set once open), announced}. A link opened lazily is announced (the
  // new-session note) on the first call it answers; devices_use's own answer announces the one it opens.
  async function openLink(name, signal, {announced = false} = {}) {
    const link = {name, session: null, announced};
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

  // Whether a task is open on the device target, or a js/js_reset is on its way there (waiting for the session).
  const taskOpenOn = rec => rec.taskOpen || rec.pendingWork > 0;

  // One routed call on the device target → {reply, link} (link: the session that answered, null for a local answer),
  // or a throw (a DeviceError, `cancelled` included).
  async function remoteCall(rec, msg, signal) {
    const tool = msg.params.name;
    const work = WORK_TOOLS.has(tool);
    // No session, so no task: nothing to end, and no session is opened to say so.
    if (tool === 'end_task' && !rec.link && !rec.opening) return {reply: {result: statusResult({status: 'noop', ended: false})}, link: null};
    for (let attempt = 1; ; attempt++) {
      if (rec.ended) throw gone();
      let link = rec.link;
      if (!link) {
        // While it waits for the session, a js/js_reset already holds the task open against devices_use.
        if (work) rec.pendingWork++;
        try { link = await ensureLink(rec, signal); } finally { if (work) rec.pendingWork--; }
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
        return {reply, link};
      }
      dropLink(rec, link);
      rec.taskOpen = false;
      if (tool === 'end_task') {
        if (hadTask) throw lost();
        return {reply: {result: statusResult({status: 'noop', ended: false})}, link: null};
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
        const {reply, link} = await remoteCall(rec, msg, controller?.signal ?? NEVER);
        if (tool === 'end_task') await endSession(rec);
        if (reply.error) return write({jsonrpc: '2.0', id: msg.id, error: reply.error});
        const fresh = Boolean(link && !link.announced);
        if (link) link.announced = true;
        respond(msg.id, tagged(reply.result, rec.name, fresh));
      } catch (error) {
        const endTask = tool === 'end_task';
        if (endTask) await endSession(rec);
        if (error?.code === 'cancelled' && !closing) return onWithdrawn(msg.id);
        // On a closing connection no next call follows: the call is answered as the local ones are.
        const answered = closing && ['cancelled', 'device_session_ended'].includes(error?.code) ? closingError() : error;
        respond(msg.id, failed(answered, rec.name, {endTask, after: endTask && !closing ? 'the device session is closed; devices_use still works' : null}));
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
    const refuse = () => respond(msg.id, failed(new DeviceError('task_open', `a task is open on ${previous}: call end_task there first, then devices_use`), null));
    if (current ? taskOpenOn(current) : localTaskOpen()) return refuse();
    if (current) {
      await Promise.allSettled([...current.inflight]);
      if (taskOpenOn(current)) return refuse();
    }
    if (closing) throw closingError();
    if (wanted === LOCAL) {
      if (current) await leave(current);
      current = null;
      return respond(msg.id, switched({device: LOCAL, previous,
        note: 'cua: every tool now drives this machine (local) again, under the host notes in this server\'s instructions.'}));
    }
    const link = await openLink(wanted, signal, {announced: true});
    // The device's own tool descriptions carry its surface rules; a session that cannot list them cannot be driven.
    let listed;
    try { listed = await link.session.request('tools/list', {}, {signal}); } catch (error) {
      await endLink(link).catch(() => {});
      throw error;
    }
    if (!Array.isArray(listed.result?.tools)) {
      await endLink(link).catch(() => {});
      throw new DeviceError('device_protocol', 'the device did not list its tools');
    }
    if (closing) {
      await endLink(link).catch(() => {});
      throw closingError();
    }
    if (current) await leave(current);
    // The connection may have closed during the previous device's DELETE: close() ended that one, not this one.
    if (closing) {
      await endLink(link).catch(() => {});
      throw closingError();
    }
    current = {name: wanted, link, opening: null, taskOpen: false, pendingWork: 0, inflight: new Set(), ended: false};
    const notes = link.session.initializeResult?.instructions;
    const note = `cua: every tool (js, js_reset, end_task, secrets_list, profiles_list) now drives ${wanted}, in a new session `
      + 'there (its REPL state is fresh). Its host notes (hostNotes) and its js and profiles_list descriptions (tools) apply '
      + 'until devices_use switches again, in place of this server\'s.';
    const hostNotes = typeof notes === 'string' && notes ? notes : '(the device sent none)';
    const tools = Object.fromEntries(listed.result.tools
      .filter(tool => RULED_TOOLS.includes(tool?.name) && typeof tool.description === 'string')
      .map(tool => [tool.name, tool.description]));
    respond(msg.id, {...switched({device: wanted, previous, note, hostNotes, tools}), _meta: {'cua/device': wanted}});
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
  // way, so local calls keep their order), else it goes to the device. Behind a switch it takes its place in the same
  // chain the devices_use calls do: it is dispatched on the target that switch leaves (taking the task open there
  // synchronously), before any devices_use that arrived after it, which then sees that task. A js/js_reset waiting there
  // can be cancelled meanwhile: it is withdrawn and never runs.
  function route(msg, local) {
    const dispatch = () => (current ? routeRemote(current, msg) : local());
    if (!switching) return void dispatch();
    const key = idKey(msg.id);
    const controller = WORK_TOOLS.has(msg.params.name) ? new AbortController() : null;
    if (controller) routed.set(key, controller);
    const step = switching.then(() => {
      if (controller && routed.get(key) === controller) routed.delete(key);
      if (controller?.signal.aborted) return onWithdrawn(msg.id);
      dispatch();
    }).catch(error => diagnostics(`a call queued behind a switch could not be dispatched: ${error?.stack ?? error}`))
      .finally(() => { if (switching === step) switching = null; });
    switching = step;
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
    // The local client's answer to a request: true when it answered one of the device's (every `cua-device-` id is
    // ours, never the local runtime's), which goes back to it; an answer to one no longer awaited is dropped.
    answer(msg) {
      if (typeof msg.id !== 'string' || !msg.id.startsWith(DEVICE_REQUEST)) return false;
      const entry = deviceRequests.get(msg.id);
      if (!entry) {
        diagnostics(`an answer to ${msg.id} came after its device session ended or the device withdrew it; dropped`);
        return true;
      }
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
