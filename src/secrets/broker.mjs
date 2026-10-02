// The server's side of the per-connection secret broker. `cua serve` starts one `cua-keychain broker` for each MCP
// connection, before the runtime, and stops it when the connection closes:
//   - the endpoint is <home>/run/<session>.sock, a path the server owns (the helper creates it 0600 and never
//     replaces an existing path);
//   - the capability token is 32 random bytes, generated here, written to the helper's stdin with the endpoint (never
//     argv or a file) and otherwise handed only to the launch environment of the trusted worker;
//   - the helper's stdout is a private pipe carrying one ready line, never the MCP stream; its stdin staying open is
//     its lease, so it also stops if the server dies;
//   - close is bounded: EOF, then SIGTERM, then SIGKILL, and a socket left behind by a killed helper is removed. Only
//     the socket this broker created is ever removed: its identity (device and inode) is recorded once the helper
//     reports ready and checked again before unlinking. A broker that never became ready removes nothing, and a path
//     that now holds anything else (an earlier socket, a replacement) is left alone; a path is not ownership.
// Secrets being unavailable (disabled, helper not built, broker failed to start) never fails the connection; native
// control works without them and secrets_list reports why.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {lstatSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import net from 'node:net';
import {createInterface} from 'node:readline';
import {fail} from '../runtime/errors.mjs';
import {realHome, homeLayout} from '../runtime/layout.mjs';
import {brokerClient, BROKER_PROTOCOL} from './client.mjs';
import {BUILD_HINT} from './helper.mjs';

const MAX_SOCKET_PATH_BYTES = 103;  // sockaddr_un.sun_path is 104 bytes on macOS, including the terminator
const AMBIENT_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG'];
const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

const sleepUntil = (promise, ms) => {
  let timer;
  return Promise.race([promise.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), Math.max(0, ms)); })])
    .finally(() => clearTimeout(timer));
};

export function endpointFor(home, sessionId) {
  const endpoint = join(homeLayout(realHome(home)).run, `${sessionId}.sock`);
  if (Buffer.byteLength(endpoint) > MAX_SOCKET_PATH_BYTES)
    fail('endpoint_path_too_long', `the broker endpoint ${endpoint} is longer than a unix socket path may be (${MAX_SOCKET_PATH_BYTES} bytes)`, {hint: 'use a shorter CUA_HOME'});
  return endpoint;
}

function helperEnv(ambient, extra) {
  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  return {...env, PATH: FIXED_PATH, ...extra};
}

// Starts the broker and resolves once it is serving, or rejects with a classified CuaError after making sure the
// helper is gone. `env` adds helper variables (test doubles only; production passes none).
export async function startBroker({command, args = ['broker'], env = {}, endpoint, ambient = process.env, readyTimeoutMs = 3000}) {
  const token = randomBytes(32).toString('base64url');
  const child = spawn(command, args, {env: helperEnv(ambient, env), stdio: ['pipe', 'pipe', 'inherit']});
  // A helper that could not be spawned emits 'error' and never 'exit'.
  const exited = new Promise(resolve => {
    child.once('exit', () => resolve());
    child.once('error', () => resolve());
  });
  child.stdin.on('error', () => {});
  const lines = createInterface({input: child.stdout});
  const firstLine = new Promise(resolve => {
    lines.once('line', resolve);
    lines.once('close', () => resolve(null));
  });

  let owned = null;  // {dev, ino} of the socket the helper created, once it is ready
  const isOwned = () => {
    if (!owned) return false;
    try {
      const now = lstatSync(endpoint);
      return now.isSocket() && now.dev === owned.dev && now.ino === owned.ino;
    } catch { return false; }
  };
  let closing = null;
  let spawnFailed = false;
  child.once('error', () => { spawnFailed = true; });
  const isGone = () => spawnFailed || child.exitCode !== null || child.signalCode !== null;
  async function close({budgetMs = 2000} = {}) {
    closing ??= (async () => {
      const started = Date.now();
      const steps = ['eof'];
      child.stdin.end();
      let gone = isGone() || await sleepUntil(exited, budgetMs * 0.4);
      if (!gone) {
        steps.push('SIGTERM');
        child.kill('SIGTERM');
        gone = await sleepUntil(exited, started + budgetMs * 0.7 - Date.now());
      }
      if (!gone) {
        steps.push('SIGKILL');
        child.kill('SIGKILL');
        gone = await sleepUntil(exited, started + budgetMs - Date.now());
      }
      lines.close();
      // A helper that was killed could not remove its own socket. (There is a window between the check and the
      // unlink; the run directory is the server's own, so nothing else is expected to replace the socket within it.)
      // An unlink failure (a run directory made unwritable, say) is reported, never thrown: close always settles.
      let unlinkError = null;
      if (isOwned()) try { rmSync(endpoint, {force: true}); } catch (error) { unlinkError = error.code ?? 'error'; }
      const leftover = isOwned();
      const problems = [...(gone ? [] : ['the broker helper did not exit']),
        ...(leftover ? [unlinkError ? `${endpoint} could not be removed (${unlinkError})` : `${endpoint} remains`] : [])];
      return {confirmed: !problems.length, steps, ...(problems.length ? {reason: problems.join('; ')} : {})};
    })();
    return closing;
  }

  child.stdin.write(JSON.stringify({socket: endpoint, token}) + '\n');
  let timer;
  const line = await Promise.race([firstLine, new Promise(resolve => { timer = setTimeout(() => resolve(undefined), readyTimeoutMs); })]);
  clearTimeout(timer);
  let ready;
  try { ready = line ? JSON.parse(line) : null; } catch { ready = null; }
  if (ready?.ready !== true || ready.protocol !== BROKER_PROTOCOL) {
    await close({budgetMs: 1000});
    if (line === undefined) fail('broker_timeout', `the Keychain helper did not start its broker within ${readyTimeoutMs} ms`);
    if (ready?.ready === true) fail('helper_incompatible', `the Keychain helper speaks broker protocol ${ready.protocol}, cua expects ${BROKER_PROTOCOL}`, {hint: BUILD_HINT});
    fail('broker_failed', `the Keychain helper could not start its broker (${typeof ready?.error === 'string' ? ready.error : 'no reason given'})`);
  }

  try {
    const created = lstatSync(endpoint);
    if (created.isSocket()) owned = {dev: created.dev, ino: created.ino};
  } catch {}
  const client = brokerClient({endpoint, token, connect: path => net.createConnection(path)});
  return {endpoint, token, pid: child.pid, exited, list: () => client.list(), close};
}

// The secrets side of one connection: either a running broker ({broker: {endpoint, token}, list, close}) or the
// reason there is none ({unavailable: {code, message}, close}).
export async function openSecrets({enabled, helper, home, sessionId, ambient = process.env, diagnostics = () => {}}) {
  const none = (code, message) => ({unavailable: {code, message}, close: async () => ({confirmed: true, steps: []})});
  if (!enabled) return none('secrets_disabled', 'secret storage is turned off for this server (CUA_SHIM_SECRETS=off)');
  if (!helper?.built) return none('helper_not_built', `the Keychain helper is not built; ${BUILD_HINT}`);
  try {
    const broker = await startBroker({command: helper.command ?? helper.path, args: helper.args, env: helper.env, endpoint: endpointFor(home, sessionId), ambient});
    let closing = false;
    broker.exited.then(() => { if (!closing) diagnostics('the secrets broker exited unexpectedly; secrets are unavailable for the rest of this connection'); });
    return {
      broker: {endpoint: broker.endpoint, token: broker.token},
      list: broker.list,
      close: options => { closing = true; return broker.close(options); },
    };
  } catch (error) {
    if (!error?.code) throw error;
    diagnostics(`secrets are unavailable on this connection: ${error.message} [${error.code}]`);
    return none(error.code, error.message);
  }
}
