// `cua agent run`: the resident cua process of an enrolled Mac. With `http: 'host:port'` it serves MCP Streamable HTTP
// (src/mcp/http.mjs) on exactly that address until a signal closes every session; the relay path (`relay: true`) is
// E3's and refuses until it exists. Before anything else the process takes $CUA_HOME/state/agent.lock, so a second
// agent for one home (a terminal `agent run` beside the launchd job, whatever its flags) refuses, naming the first.
//
// Limits, from the environment: CUA_AGENT_MAX_SESSIONS (default 1: every session drives the same mouse, keyboard and
// Chrome), CUA_AGENT_IDLE_MINUTES (default 15) and CUA_AGENT_ALLOWED_ORIGINS (browser origins allowed to call,
// comma-separated, none by default). Diagnostics go to stderr; the client credential never appears in them.
import {createServer as createHttpServer} from 'node:http';
import {linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createMcpHttp} from '../mcp/http.mjs';
import {settingsFrom} from '../mcp/server.mjs';
import {credentialsOf, readDevice} from './device.mjs';
import {describeSweep, sweepRun} from '../runtime/run-dir.mjs';
import {fail} from '../runtime/errors.mjs';

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

// ---- settings ----

export function parseAddress(text) {
  const found = /^(?:\[([0-9A-Fa-f:.]+)\]|([^:\s[\]]+)):(\d{1,5})$/.exec(text ?? '');
  const port = Number(found?.[3]);
  if (!found || port > 65535)
    fail('invalid_http_address', `--http takes <host>:<port>, such as 127.0.0.1:7801 or [::1]:7801 (got ${JSON.stringify(text)})`, {hint: 'name the address to listen on: 127.0.0.1 for this Mac only, the Mac\'s LAN address for other machines (never 0.0.0.0)'});
  return {host: found[1] ?? found[2], port};
}

function limitsFrom(env) {
  const max = env.CUA_AGENT_MAX_SESSIONS ?? '1';
  if (!/^[1-9]\d{0,3}$/.test(max)) fail('invalid_setting', 'CUA_AGENT_MAX_SESSIONS must be a whole number of sessions, at least 1');
  const idle = env.CUA_AGENT_IDLE_MINUTES ?? '15';
  if (!/^\d+(\.\d+)?$/.test(idle) || !(Number(idle) > 0)) fail('invalid_setting', 'CUA_AGENT_IDLE_MINUTES must be a positive number of minutes');
  const allowedOrigins = (env.CUA_AGENT_ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
  return {maxSessions: Number(max), idleMs: Math.round(Number(idle) * 60_000), allowedOrigins};
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

export async function runAgent({home, env = process.env, http = null, relay = false,
  diagnostics = line => process.stderr.write(`cua agent: ${line}\n`)}) {
  const lock = acquireAgentLock(home);
  let onSignal;
  try {
    if (relay) fail('remote_no_relay', 'this cua does not have the relay connection yet', {hint: 'serve this Mac\'s address directly with cua agent run --http <host>:<port>'});
    const device = readDevice(home);
    if (!device) fail('remote_not_enrolled', 'this Mac is not enrolled for remote control', {hint: 'run cua remote enroll'});
    settingsFrom(env);
    const limits = limitsFrom(env);
    const {host, port} = parseAddress(http);
    try {
      const swept = describeSweep(sweepRun(home));
      if (swept) diagnostics(`$CUA_HOME/run: ${swept}`);
    } catch (error) {
      diagnostics(`$CUA_HOME/run could not be swept (${error.code ?? error.message})`);
    }

    // The handlers are in place before the listener, so no session can open without a signal closing it.
    const stopped = new Promise(resolve => { onSignal = resolve; });
    for (const signal of SIGNALS) process.on(signal, onSignal);
    const mcp = createMcpHttp({home, env, clientCredential: credentialsOf(device).clientCredential, ...limits, diagnostics});
    const server = createHttpServer(nodeAdapter(mcp.handle));
    let address;
    try { address = await listen(server, host, port); } catch (error) {
      fail('http_listen_failed', `could not listen on ${http} (${error.code ?? error.message})`, {cause: error});
    }
    // A failure accepting a connection (EMFILE and the like) is reported; the sessions already open keep running.
    server.on('error', error => diagnostics(`the listener reported an error (${error.code ?? error.message}); still listening`));
    const shown = address.family === 'IPv6' ? `[${address.address}]` : address.address;
    diagnostics(`listening on http://${shown}:${address.port}/mcp (device ${device.deviceId}; at most ${limits.maxSessions} session${limits.maxSessions === 1 ? '' : 's'}, idle after ${limits.idleMs / 60_000} min)`);

    const signal = await stopped;
    diagnostics(`${signal}: closing every session`);
    server.close();
    await mcp.close('signal');
    server.closeAllConnections();
    return 0;
  } finally {
    if (onSignal) for (const signal of SIGNALS) process.off(signal, onSignal);
    lock.release();
  }
}
