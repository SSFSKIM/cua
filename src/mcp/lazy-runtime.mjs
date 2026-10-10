// The connection's runtime, launched on demand (issue #105). Every Claude Code session starts its plugin's MCP server
// at launch, used or not, so `cua serve` answers the MCP handshake and the tool list without a runtime and launches one
// on the first request that needs it: a tools/call (js, js_reset, or the turn_ended completion of a task such a call
// opened). From then on the runtime stays until the connection closes or `stop` ends it (the idle stop, issue #107, which
// createServer drives); a later call that needs it launches a fresh one the same way.
//
// `lazyRuntime` is an upstream for createServer (src/mcp/server.mjs): the same send/onMessage/onExit/terminate shape as
// spawnUpstream (upstream.mjs), with the launch behind it.
// - The handshake. The vendor runtime's answers to `initialize` and `tools/list` depend only on the installed release,
//   the enabled surfaces and the protocol version the client asks for, so the first live answers for that triple are
//   recorded (`handshakeRecords`) and later connections answer from the record. Without a record (the first connection
//   after an install or a new client protocol version) `initialize` launches the runtime, as before, and its answers
//   are recorded. The client's own `initialize` params are kept: a launch opens the runtime with them (the client's
//   capabilities, elicitation among them, reach the runtime unchanged) and sends `notifications/initialized` itself,
//   so the client's is never forwarded; once recorded, `tools/list` is always answered from the record.
// - Before a launch, `ping` is answered here, any other request that needs no runtime is method-not-found (what the
//   runtime itself answers it), and notifications and responses are dropped: nothing upstream could be told of them.
//   During a launch everything is held, in order, until the runtime has answered the handshake.
// - A launch that fails answers every held request with its reason, then reports an exit, which fails the connection
//   as a runtime exit does.
// - `stop` terminates a running runtime and returns to the state before a launch, the handshake kept: nothing of the
//   stopped runtime (its messages, its exit) reaches the connection from then on. Requests that need a runtime while it
//   stops are held and launch a fresh one once it is gone; `stopped` (the connection's cleanup of the launch's working
//   directory) runs after every stop. A runtime that is not running (never launched, launching, ended) has nothing to
//   stop.
// - `closing` (the connection began to close) abandons a launch that has not spawned the runtime yet: the calls it held
//   are answered connection_closing, and the task they opened completes with nothing to tell a runtime. `terminate`
//   of a connection that never launched confirms at once with nothing to stop; otherwise it terminates what was
//   spawned.
//
// `start({signal})` spawns the runtime and resolves the spawned upstream, or null when `signal` (aborted when
// termination begins) was aborted before anything was spawned; it may reject with a classified error.
import {randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fail} from '../runtime/errors.mjs';

const RECORD_SCHEMA = 1;
const PROTOCOL_VERSION = /^[A-Za-z0-9._-]{1,64}$/;
const HANDSHAKE_ID = 'cua-handshake';
const DEFAULT_RUNTIME_IDLE_MS = 15 * 60_000;

const isRequest = msg => msg.method !== undefined && msg.id !== undefined;
const validRecord = r => r?.schema === RECORD_SCHEMA && typeof r.initialize?.protocolVersion === 'string' && Array.isArray(r.tools?.tools);

// The recorded handshake answers of one installed release under `dir` (<home>/state/handshake/<release>), one file per
// surface set and requested protocol version. A record that cannot be read, or a version unfit for a file name, is a
// miss; a write is atomic (a concurrent connection reads the old file or the new one) and its failure only costs the
// next connection a launch.
export function handshakeRecords({dir, surfaces}) {
  const file = version => (typeof version === 'string' && PROTOCOL_VERSION.test(version) ? join(dir, `${surfaces.join(',')}@${version}.json`) : null);
  return {
    read(version) {
      const path = file(version);
      if (!path) return null;
      try {
        const record = JSON.parse(readFileSync(path, 'utf8'));
        return validRecord(record) ? {initialize: record.initialize, tools: record.tools} : null;
      } catch { return null; }
    },
    write(version, {initialize, tools}) {
      const path = file(version);
      if (!path) return;
      mkdirSync(dir, {recursive: true, mode: 0o700});
      const temp = `${path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temp, JSON.stringify({schema: RECORD_SCHEMA, initialize, tools}) + '\n', {mode: 0o600});
        renameSync(temp, path);
      } finally { rmSync(temp, {force: true}); }
    },
  };
}
// CUA_RUNTIME_IDLE_MS: how long a launched runtime may go without a tool call before it is stopped; 0 never stops it.
export function runtimeIdleFrom(env) {
  const value = env.CUA_RUNTIME_IDLE_MS;
  if (value === undefined) return DEFAULT_RUNTIME_IDLE_MS;
  if (!/^\d{1,10}$/.test(value)) fail('invalid_setting', 'CUA_RUNTIME_IDLE_MS must be a whole number of milliseconds (0 never stops the runtime)');
  return Number(value);
}

export function lazyRuntime({start, records, stopped = () => {}, diagnostics = () => {}}) {
  let onMessage = () => {};
  let onExit = () => {};
  let state = 'idle';          // idle | starting | running | stopping | failed | stopped
  let runtime = null;
  let spawned = null;          // settles when start() has: the runtime, or null
  let stopTeardown = null;     // settles when the last stop() has: its teardown
  const closeCtl = new AbortController();   // aborted when the connection begins to close
  let terminating = null;
  let clientInit = null;       // the client's initialize params
  let record = null;           // the handshake answered locally
  let firstInitialize = null;  // {id, version}: the client's initialize, answered from the launch's handshake
  let pendingRecord = null;    // {version, initialize}: waiting for the live tools/list
  const liveToolsLists = new Set();
  const held = [];

  const emit = msg => onMessage(msg);
  const later = msg => queueMicrotask(() => emit(msg));

  function launch() {
    state = 'starting';
    spawned = (async () => {
      let self;
      try {
        self = runtime = await start({signal: closeCtl.signal});
      } catch (error) {
        failLaunch(error);
        return null;
      }
      if (!runtime) { failLaunch(null); return null; }
      // A runtime being stopped, or already replaced, is not heard from again.
      runtime.onMessage(msg => { if (runtime === self && state !== 'stopping') fromRuntime(msg); });
      runtime.onExit(info => {
        if (runtime !== self) return;
        if (state === 'starting') failLaunch({code: 'runtime_exited', message: `the runtime exited before its handshake (${info.error ?? (info.signal ? `signal ${info.signal}` : `code ${info.code}`)})`}, info);
        else if (state === 'running') onExit(info);
      });
      // A spawn error can be reported before start() resolves and before our exit handler is attached.
      if (runtime.send({jsonrpc: '2.0', id: HANDSHAKE_ID, method: 'initialize', params: clientInit}) === false) {
        failLaunch({code: 'runtime_exited', message: 'the runtime exited before its handshake (initialize could not be sent)'});
      }
      return runtime;
    })();
  }

  function handshakeAnswered(msg) {
    if (state !== 'starting') return;
    if (msg.error || !msg.result) return failLaunch({code: 'handshake_failed', message: `the runtime refused the handshake (${msg.error?.message ?? 'no result'})`});
    if (firstInitialize) {
      emit({jsonrpc: '2.0', id: firstInitialize.id, result: msg.result});
      pendingRecord = {version: firstInitialize.version, initialize: msg.result};
      firstInitialize = null;
    } else if (record && msg.result.protocolVersion !== record.initialize.protocolVersion) {
      diagnostics(`the runtime negotiated protocol ${msg.result.protocolVersion}, its record says ${record.initialize.protocolVersion}`);
    }
    runtime.send({jsonrpc: '2.0', method: 'notifications/initialized'});
    state = 'running';
    for (const msg of held.splice(0)) runtime.send(msg);
  }

  function fromRuntime(msg) {
    if (msg.method === undefined && msg.id === HANDSHAKE_ID) return handshakeAnswered(msg);
    if (msg.method === undefined && liveToolsLists.delete(msg.id) && pendingRecord && Array.isArray(msg.result?.tools) && !msg.result.nextCursor) {
      record = {initialize: pendingRecord.initialize, tools: msg.result};
      try { records.write(pendingRecord.version, record); } catch (error) {
        diagnostics(`the runtime's handshake could not be recorded (${error.code ?? error.message}); the next connection launches at its handshake`);
      }
      pendingRecord = null;
    }
    emit(msg);
  }

  // `error` null: the launch was abandoned for termination. Every held request is answered (synchronously, ahead of
  // the exit report, which settles whatever createServer still awaits generically).
  function failLaunch(error, exitInfo) {
    if (state !== 'starting') return;
    state = error ? 'failed' : 'stopped';
    const message = error ? `cua: the runtime could not be started (${error.code ?? 'launch_failed'}): ${error.message}` : 'cua: connection_closing: the runtime was not started';
    const waiting = [...(firstInitialize ? [firstInitialize] : []), ...held.splice(0).filter(isRequest)];
    firstInitialize = null;
    for (const {id} of waiting) emit({jsonrpc: '2.0', id, error: {code: -32000, message}});
    if (!error) return;
    diagnostics(`the runtime could not be started (${error.code ?? 'launch_failed'}): ${error.message}`);
    // After the answers above have reached their callers: the exit report fails whatever is still pending generically.
    setImmediate(() => onExit(exitInfo ?? {code: null, signal: null, error: `${error.code ?? 'launch_failed'}: ${error.message}`}));
  }

  return {
    send(msg) {
      // A task whose launch was abandoned never ran a cell: its completion has nothing to tell a runtime.
      if (state === 'stopped' && isRequest(msg) && msg.method === 'tools/call' && msg.params?.name === 'turn_ended') {
        later({jsonrpc: '2.0', id: msg.id, result: {content: [], isError: false}});
        return true;
      }
      if (state === 'failed' || state === 'stopped') return false;
      if (msg.method === 'notifications/initialized' && msg.id === undefined) return true;   // a launch sends its own
      if (state === 'idle' || state === 'stopping') {
        if (!isRequest(msg)) return true;
        if (msg.method === 'initialize' && state === 'idle') {
          clientInit = msg.params ?? {};
          const version = clientInit.protocolVersion;
          record = records.read(version);
          if (record) { later({jsonrpc: '2.0', id: msg.id, result: record.initialize}); return true; }
          firstInitialize = {id: msg.id, version};
          launch();
          return true;
        }
        if (msg.method === 'tools/list' && record && !msg.params?.cursor) { later({jsonrpc: '2.0', id: msg.id, result: record.tools}); return true; }
        if (msg.method === 'ping') { later({jsonrpc: '2.0', id: msg.id, result: {}}); return true; }
        if (!(msg.method === 'tools/call' || msg.method === 'tools/list') || !clientInit) { later({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'Method not found'}}); return true; }
        if (state === 'idle') launch();
      }
      if (msg.method === 'tools/list' && isRequest(msg)) {
        if (record && !msg.params?.cursor) { later({jsonrpc: '2.0', id: msg.id, result: record.tools}); return true; }
        liveToolsLists.add(msg.id);
      }
      if (state === 'starting' || state === 'stopping') { held.push(msg); return true; }
      return runtime.send(msg);
    },
    // True while a runtime is up and answering: what `stop` would end.
    get running() { return state === 'running'; },
    // Terminates the running runtime and returns to the state before a launch. Resolves its teardown, or null when no
    // runtime was running.
    stop(options) {
      if (state !== 'running') return Promise.resolve(null);
      state = 'stopping';
      const dying = runtime;
      stopTeardown = (async () => {
        const teardown = await dying.terminate(options);
        runtime = null;
        spawned = null;
        state = 'idle';
        stopped();
        // What arrived meanwhile goes to a fresh runtime, unless the connection began to close.
        if (held.length && closeCtl.signal.aborted) {
          state = 'stopped';
          for (const {id} of held.splice(0).filter(isRequest)) emit({jsonrpc: '2.0', id, error: {code: -32000, message: 'cua: connection_closing: the runtime was not started'}});
        } else if (held.length) launch();
        return teardown;
      })();
      return stopTeardown;
    },
    onMessage(fn) { onMessage = fn; },
    onExit(fn) { onExit = fn; },
    // The connection began to close: a launch that has not spawned the runtime yet is abandoned.
    closing() { closeCtl.abort(); },
    terminate(options) {
      closeCtl.abort();
      terminating ??= (async () => {
        // A stop under way finishes first; its teardown is its own to report.
        await stopTeardown;
        if (!spawned) { state = 'stopped'; return {confirmed: true, steps: []}; }
        const spawnedRuntime = await spawned;
        if (state === 'starting') failLaunch(null);
        return spawnedRuntime ? spawnedRuntime.terminate(options) : {confirmed: true, steps: []};
      })();
      return terminating;
    },
  };
}
