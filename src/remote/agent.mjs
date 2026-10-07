// `cua agent run`: the resident cua process of an enrolled Mac. It serves MCP Streamable HTTP (src/mcp/http.mjs) on
// one or both of two paths, one handler and one set of sessions behind both: with `http: 'host:port'` on a listener at
// exactly that address (the LAN mode), with `relay: true` through the relay enrolled in device.json (relay-link.mjs),
// until a signal closes every session, or until the relay closes the link for good (4001: another connection for this
// device replaced it; 4003: the relay refused its hello), after which it closes every session too and exits 0. Every
// check that can refuse runs before either path starts, and the listener is up before the relay is dialled, so a
// refusal never leaves one path half-started. Before anything else the process takes $CUA_HOME/state/agent.lock, so a
// second agent for one home (a terminal `agent run` beside the launchd job, whatever its flags) refuses, naming the
// first.
//
// The agent follows device.json while it runs (followDevice): the client credential is read at each request, and the
// device credential and relay URL at each relay dial, so `remote enroll --rotate` refuses the old client credential at
// once and ends every open session (a leaked credential's standing stream included), and `remote enroll --relay <url>`
// moves the link to the new relay (checked at each request and each relay ping), with no restart. A device.json that
// is gone or unreadable refuses every client until it is back.
//
// Limits, from the environment (src/remote/limits.mjs): CUA_AGENT_MAX_SESSIONS (default 1: every session drives the
// same mouse, keyboard and Chrome), CUA_AGENT_IDLE_MINUTES (default 15) and CUA_AGENT_ALLOWED_ORIGINS (browser origins
// allowed to call, comma-separated, none by default). CUA_AGENT_CONSOLE_CHECK (on by default; off stops it) makes js
// and js_reset answer console_locked while this user's session is off the console or its screen is locked
// (src/remote/console.mjs). The console is read on macOS only; elsewhere the setting is validated and nothing is
// refused (Linux has no portable screen-lock signal; doctor's agent.console checks the agent's X display instead).
// Diagnostics go to stderr (under launchd or the systemd user unit, $CUA_HOME/state/agent.log); no credential ever
// appears in them.
import {createServer as createHttpServer} from 'node:http';
import {linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createMcpHttp} from '../mcp/http.mjs';
import {settingsFrom} from '../mcp/server.mjs';
import {checkRelayUrl, followDevice, readDevice} from './device.mjs';
import {parseAddress} from './address.mjs';
import {limitsFrom} from './limits.mjs';
import {checkConsole, consoleCheckFrom} from './console.mjs';
import {connectRelay, loadWebSocket} from './relay-link.mjs';
import {describeSweep, sweepRun} from '../runtime/run-dir.mjs';
import {fail} from '../runtime/errors.mjs';

export {connectRelay};

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

// ---- the agent lock ----
// Published with link(2), so it is never half-written and never clobbered, and names its holder's pid. A lock whose
// pid no longer runs (or that names none) is stale and broken; one whose pid runs refuses the second agent. A reused pid
// can only keep a stale lock, never break a live one; the refusal names the lock file for that case.

const running = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const holderOf = bytes => {
  let pid;
  try { ({pid} = JSON.parse(bytes.toString('utf8'))); } catch {}
  return Number.isInteger(pid) && pid > 0 ? pid : null;
};

function publish(path, bytes) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, bytes, {mode: 0o600, flag: 'wx'});
  try { linkSync(temp, path); return true; } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally { rmSync(temp, {force: true}); }
}

// Moves the stale lock aside and deletes it only if it is still the one read; a lock another agent took meanwhile goes
// back.
function breakStale(path, stale) {
  const aside = `${path}.${randomUUID()}.stale`;
  try { renameSync(path, aside); } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  let same = false;
  try { same = readFileSync(aside).equals(stale); } catch {}
  if (!same) try { linkSync(aside, path); } catch {}
  rmSync(aside, {force: true});
}

export function acquireAgentLock(home) {
  const path = join(home, 'state', 'agent.lock');
  const bytes = Buffer.from(`${JSON.stringify({pid: process.pid, token: randomUUID()})}\n`);
  try {
    mkdirSync(join(home, 'state'), {recursive: true, mode: 0o700});
    for (let attempt = 0; attempt < 5; attempt++) {
      if (publish(path, bytes)) {
        const release = () => { try { if (readFileSync(path).equals(bytes)) rmSync(path, {force: true}); } catch {} };
        process.once('exit', release);
        return {path, release: () => { process.off('exit', release); release(); }};
      }
      let held;
      try { held = readFileSync(path); } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const pid = holderOf(held);
      if (pid !== null && running(pid))
        fail('agent_already_running', `a cua agent is already running for ${home} (process ${pid})`, {hint: `stop process ${pid} first; if it is not a cua agent, remove the stale lock (rm "${path}")`});
      breakStale(path, held);
    }
  } catch (error) {
    if (error.code === 'agent_already_running') throw error;
    fail('agent_lock_failed', `could not take the agent lock ${path} (${error.code ?? error.message})`, {cause: error});
  }
  fail('agent_lock_failed', `could not take the agent lock ${path}: it kept changing hands`);
}

// ---- node:http to the handler's abstract request and response ----

function nodeAdapter(handle) {
  return (req, res) => {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    handle({method: req.method, url: req.url, headers: req.headers, body: req, signal: controller.signal}, {
      writeHead: (status, headers) => {
        res.writeHead(status, headers);
        // A stream's headers go out at once: the client waits on them before its first event.
        if (headers?.['Content-Type'] === 'text/event-stream') res.flushHeaders();
      },
      write: chunk => res.write(chunk),
      end: chunk => res.end(chunk),
    });
  };
}

const listen = (server, host, port) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen({host, port}, () => { server.off('error', reject); resolve(server.address()); });
});

// `createHttp` is the HTTP handler's factory and `platform` picks whether the console is read, seams for tests.
export async function runAgent({home, env = process.env, http = null, relay = false, platform = process.platform,
  diagnostics = line => process.stderr.write(`cua agent: ${line}\n`), createHttp = createMcpHttp}) {
  const lock = acquireAgentLock(home);
  let onSignal;
  let server = null;
  let link = null;
  let mcp = null;
  // Closes whatever has started, in order: no new requests, every session closed (its streams ended while the relay
  // can still carry them), then the relay link.
  async function stopAll(reason) {
    server?.close();
    await mcp?.close(reason);
    server?.closeAllConnections();
    await link?.close();
  }
  try {
    const device = readDevice(home);
    if (!device) fail('remote_not_enrolled', 'this Mac is not enrolled for remote control', {hint: 'run cua remote enroll'});
    if (relay && !device.relayUrl) fail('remote_no_relay', 'this Mac is enrolled without a relay, so --relay has nothing to dial', {hint: 'cua remote enroll --relay wss://<relay>/ws adds one (nothing is rotated); or serve this Mac\'s address with --http <host>:<port>'});
    if (relay) checkRelayUrl(device.relayUrl);
    settingsFrom(env);
    const limits = limitsFrom(env);
    const consoleChecked = consoleCheckFrom(env) && platform === 'darwin';
    if (http === null && !relay) fail('agent_nothing_to_serve', 'the agent was given nothing to serve', {hint: 'give --http <host>:<port>, --relay, or both'});
    const address = http === null ? null : parseAddress(http);
    if (relay) await loadWebSocket();
    try {
      const swept = describeSweep(sweepRun(home));
      if (swept) diagnostics(`$CUA_HOME/run: ${swept}`);
    } catch (error) {
      diagnostics(`$CUA_HOME/run could not be swept (${error.code ?? error.message})`);
    }

    // The handlers are in place before anything serves, so no session can open without a signal closing it.
    const signalled = new Promise(resolve => { onSignal = resolve; });
    for (const signal of SIGNALS) process.on(signal, onSignal);
    const followed = followDevice(home, {diagnostics});
    let credential = followed()?.clientCredential ?? null;
    // The record as it is now. A different client credential ends every open session: whoever held the old one, its
    // standing stream and in-flight results included, is cut off (the legitimate client initializes again).
    const current = () => {
      const now = followed();
      const next = now?.clientCredential ?? null;
      if (next !== credential) {
        credential = next;
        diagnostics('the client credential changed (device.json was rotated or removed); ending every open session');
        mcp.endSessions('eof');
      }
      return now;
    };
    // Each request's authentication reads the record as it is now, and gives the relay link its chance to follow a new URL.
    const clientCredential = () => {
      link?.refresh();
      return current()?.clientCredential ?? null;
    };
    mcp = createHttp({home, env, clientCredential, ...limits, ...(consoleChecked ? {console: checkConsole} : {}), diagnostics});
    const served = `device ${device.deviceId}; at most ${limits.maxSessions} session${limits.maxSessions === 1 ? '' : 's'}, idle after ${limits.idleMs / 60_000} min`;
    if (address) {
      server = createHttpServer(nodeAdapter(mcp.handle));
      let bound;
      try { bound = await listen(server, address.host, address.port); } catch (error) {
        server = null;
        fail('http_listen_failed', `could not listen on ${http} (${error.code ?? error.message})`, {cause: error});
      }
      // A failure accepting a connection (EMFILE and the like) is reported; the sessions already open keep running.
      server.on('error', error => diagnostics(`the listener reported an error (${error.code ?? error.message}); still listening`));
      const shown = bound.family === 'IPv6' ? `[${bound.address}]` : bound.address;
      diagnostics(`listening on http://${shown}:${bound.port}/mcp (${served})`);
    }
    if (relay) {
      const target = () => {
        const now = current();
        return now?.relayUrl ? {url: now.relayUrl, deviceCredential: now.deviceCredential, deviceId: now.deviceId} : null;
      };
      link = await connectRelay({target, handle: mcp.handle, diagnostics});
      diagnostics(`serving through the relay (${served})`);
    }

    const ended = await Promise.race([signalled.then(signal => ({signal})), ...(link ? [link.stopped] : [])]);
    diagnostics(ended.signal ? `${ended.signal}: closing every session` : `the relay link stopped (${ended.code}): closing every session`);
    await stopAll('signal');
    return 0;
  } catch (error) {
    // The refusal or failure is what the caller must see; a failure while stopping is only logged.
    try { await stopAll('signal'); } catch (stopError) { diagnostics(`stopping after a failure also failed: ${stopError.message}`); }
    throw error;
  } finally {
    if (onSignal) for (const signal of SIGNALS) process.off(signal, onSignal);
    lock.release();
  }
}
