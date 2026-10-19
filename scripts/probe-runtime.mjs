#!/usr/bin/env node
// M1 read-only runtime probe: can the pinned, relocated, vendor-signed runtime serve MCP, reach the native computer-use
// service, and load a delegating trusted sky wrapper, with nothing resolved from an installed desktop app?
//
//   node scripts/probe-runtime.mjs --home "$CUA_HOME" [--release 26.928.40906-darwin-arm64] [--out DIR]
//
// Expects the release installed by `cua install` in that home (resolveRuntime). It launches the runtime as the vendor
// host exactly as `cua serve` does (src/runtime/launch.mjs buildLaunch, under a claimed run/ session: cua's compat
// executable as CODEX_CLI_PATH, so both children run under cua's own sandbox and the native helper's app-server is
// cua's, #115; the per-session TMPDIR and compat settings), with the probe's wrapper as the trusted sky service, as an
// MCP stdio child; runs initialize, tools/list, one js cell (`cua.getState()` inventory counts only, the probe
// wrapper's report, and whether the trusted worker or untrusted cell code can reach a probe-owned unix socket), and the
// hidden turn_ended; snapshots the owned process tree and the native socket's holder; then shuts the child down and
// removes its session. Elicitations are declined, never accepted. No GUI actions, no app approvals, no secrets. There is
// one variant, `none`: the socket allowance variant is gone, since cua's compat executable refuses
// node_repl's --allow-unix-socket (cua never grants one).
// Writes sanitized JSON evidence to --out (default $CUA_HOME/probe/runtime-probe.json).
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync, existsSync, rmSync, realpathSync} from 'node:fs';
import {homedir, platform, arch} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {parseArgs} from 'node:util';
import {descendants, classifyProcesses, socketHolders, sanitize} from './probe/lib.mjs';
import {buildLaunch, createLaunchDirs, removeLaunchDirs} from '../src/runtime/launch.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {claimRunSession} from '../src/runtime/run-dir.mjs';
import {SEATBELT_EXEC} from '../src/sandbox/seatbelt.mjs';

const {values: opts} = parseArgs({options: {
  home: {type: 'string', default: process.env.CUA_HOME},
  release: {type: 'string', default: '26.928.40906-darwin-arm64'},
  out: {type: 'string'},
}});
if (!opts.home) fail('pass --home or set CUA_HOME to an explicit scratch directory');
if (platform() !== 'darwin' || arch() !== 'arm64') fail(`unsupported platform ${platform()}-${arch()}; the pinned runtime is darwin-arm64`);

const home = realpathSync(opts.home);
let runtime;
try { runtime = resolveRuntime({home, release: opts.release}); } catch (error) { fail(`${error.message}${error.hint ? `; ${error.hint}` : ''}`); }
const paths = {...runtime.paths, root: runtime.root};
const probeDir = dirname(fileURLToPath(import.meta.url)) + '/probe';
const wrapperPath = probeDir + '/sky-wrapper-fixture.mjs';
const outFile = opts.out ? join(opts.out, 'runtime-probe.json') : join(home, 'probe', 'runtime-probe.json');
const NATIVE_SOCKET = join(homedir(), 'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock');
const TEAM = '2DC432GLL2';

function fail(message) { process.stderr.write(`probe-runtime: ${message}\n`); process.exit(2); }
// stdout and stderr together (codesign -d reports on stderr); a nonzero exit is reported, not thrown.
function run(cmd, args) { const r = spawnSync(cmd, args, {encoding: 'utf8'}); return {status: r.status, output: (r.stdout ?? '') + (r.stderr ?? '')}; }
const sh = (cmd, args) => run(cmd, args).output;


function checkSignature(path) {
  const verify = run('codesign', ['--verify', '--deep', '--strict', path]);
  const info = sh('codesign', ['-dvv', path]);
  return {
    path,
    valid: verify.status === 0,
    error: verify.status === 0 ? null : verify.output.trim(),
    identifier: info.match(/^Identifier=(.*)$/m)?.[1] ?? null,
    team: info.match(/^TeamIdentifier=(.*)$/m)?.[1] ?? null,
    runtimeFlag: /flags=0x10000\(runtime\)/.test(info),
  };
}

function helperSnapshot() {
  const holders = existsSync(NATIVE_SOCKET) ? socketHolders(sh('lsof', ['-F', 'pc', NATIVE_SOCKET])) : [];
  return holders.map(h => ({...h, executable: sh('ps', ['-o', 'comm=', '-p', String(h.pid)]).trim()}));
}

// A stand-in for the M4 broker endpoint (a unix socket only trusted code should reach; the broker itself is gone since
// issue #66): answers `ack:<nonce>` to a known nonce line. Each nonce names the side that used it, so the report shows
// whether the trusted worker and/or the untrusted kernel reached the socket.
function startEchoBroker(socketPath, nonces) {
  rmSync(socketPath, {force: true});
  const seen = {connections: 0, acknowledged: {}};
  const labels = new Map(Object.entries(nonces).map(([label, nonce]) => [nonce, label]));
  const server = createServer(socket => {
    seen.connections++;
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      if (!buffer.includes('\n')) return;
      const label = labels.get(buffer.trim());
      if (label) { seen.acknowledged[label] = (seen.acknowledged[label] ?? 0) + 1; socket.end(`ack:${buffer.trim()}\n`); } else socket.end('nack\n');
    });
    socket.on('error', () => {});
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => resolve({server, seen}));
  });
}

function mcpClient(child, record) {
  let nextId = 0;
  const pending = new Map();
  const send = msg => child.stdin.write(JSON.stringify(msg) + '\n');
  createInterface({input: child.stdout}).on('line', line => {
    let msg; try { msg = JSON.parse(line); } catch { record.nonJsonLines++; return; }
    if (msg.method === 'elicitation/create' && msg.id !== undefined) {
      record.elicitations.push(msg.params?.message ?? null);
      send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}});
    } else if (msg.method !== undefined && msg.id !== undefined) {
      record.serverRequests.push(msg.method);
      send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'not supported by probe'}});
    } else if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
      msg.error ? p.reject(Object.assign(new Error(msg.error.message), {rpc: msg.error})) : p.resolve(msg.result);
    }
  });
  return {
    notify: (method, params) => send({jsonrpc: '2.0', method, params}),
    request: (method, params, timeoutMs) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs} ms`)); }, timeoutMs);
      pending.set(id, {resolve, reject, timer});
      send({jsonrpc: '2.0', id, method, params});
    }),
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function runVariant(name) {
  const runDir = join(home, 'run');
  mkdirSync(runDir, {recursive: true, mode: 0o700});
  const socketPath = join(runDir, `probe-${name}.sock`);
  const nonce = randomUUID();
  const kernelNonce = randomUUID();
  const broker = await startEchoBroker(socketPath, {trustedWorker: nonce, kernel: kernelNonce});
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const launch = buildLaunch({runtime, home, sessionId, surfaces: ['computer'], services: {sky: wrapperPath}, secretsUnavailable: 'secrets_disabled',
    replHost: {host: 'vendor', reason: 'explicit'}, ambient: process.env});
  const claim = claimRunSession(home, sessionId);
  createLaunchDirs(launch);
  const {env} = launch;
  const result = {name, sandboxAllowance: env.NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS ?? null, helperBefore: helperSnapshot(), elicitations: [], serverRequests: [], nonJsonLines: 0, stderrTail: ''};
  const child = spawn(launch.command, launch.args, {env, cwd: launch.cwd, stdio: ['pipe', 'pipe', 'pipe']});
  child.stderr.on('data', d => { result.stderrTail = (result.stderrTail + d).slice(-2000); });
  const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal})));
  const client = mcpClient(child, result);
  try {
    const init = await client.request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-probe-runtime', version: '0'}}, 120_000);
    client.notify('notifications/initialized', {});
    result.handshake = {serverInfo: init.serverInfo, protocolVersion: init.protocolVersion, instructionsChars: (init.instructions ?? '').length};
    const tools = await client.request('tools/list', {}, 30_000);
    result.tools = tools.tools.map(t => t.name);
    const meta = callId => ({callId, threadId: sessionId, sessionId, 'x-codex-turn-metadata': {session_id: sessionId, thread_id: sessionId, turn_id: turnId, call_id: callId, model: 'probe'}});
    const code = `const __probe = await nodeRepl.rpc("sky", {type: "cua_probe", socketPath: ${JSON.stringify(socketPath)}, nonce: ${JSON.stringify(nonce)}});
let __state;
try { const s = await cua.getState(); __state = {ok: true, apps: s.apps.length, browsers: s.browsers.length, errors: s.errors ?? []}; }
catch (e) { __state = {ok: false, error: String(e?.message ?? e)}; }
const __after = await nodeRepl.rpc("sky", {type: "cua_probe"});
const __kernel = {nativePipe: typeof nodeRepl.nativePipe?.createConnection, envKeys: Object.keys(nodeRepl.env ?? {}).sort()};
__kernel.netConnect = await (async () => { try { const net = await import("node:net"); return await new Promise(resolve => {
  const s = net.connect(${JSON.stringify(socketPath)}); const t = setTimeout(() => { s.destroy(); resolve({ok: false, error: "timeout"}); }, 3000);
  s.on("error", e => { clearTimeout(t); resolve({ok: false, error: e.code ?? e.message}); });
  s.on("connect", () => s.write(${JSON.stringify(kernelNonce)} + "\\n"));
  s.on("data", d => { clearTimeout(t); s.end(); resolve({ok: String(d).trim() === "ack:" + ${JSON.stringify(kernelNonce)}}); }); }); }
  catch (e) { return {ok: false, error: String(e?.message ?? e)}; } })();
// Can untrusted code read the trusted worker's environment (where a broker capability could live)?
__kernel.workerEnvViaPs = await (async () => { try { const cp = await import("node:child_process");
  const out = cp.execFileSync("/bin/ps", ["-E", "-ww", "-o", "command=", "-p", String(__probe.pid)], {encoding: "utf8"});
  return {ok: true, sawWorkerOnlyVariable: out.includes("CUA_SKY_SERVICE=")}; }
  catch (e) { return {ok: false, error: String(e?.code ?? e?.message ?? e).slice(0, 200)}; } })();
nodeRepl.write("CUA_PROBE_RESULT " + JSON.stringify({probe: __probe, state: __state, delegatedAfterState: __after.delegated, kernel: __kernel}));`;
    const call = await client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: 60_000}, _meta: meta(randomUUID())}, 120_000);
    const text = (call.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const marker = text.match(/CUA_PROBE_RESULT (\{.*\})/);
    result.js = {isError: call.isError === true, apiDocumentChars: text.length, report: marker ? JSON.parse(marker[1]) : null, errorText: marker ? null : text.slice(-1500)};
    result.processes = descendants(sh('ps', ['-axo', 'pid=,ppid=,comm=']), child.pid);
    for (const p of result.processes) p.args = sh('ps', ['-o', 'args=', '-p', String(p.pid)]).trim().slice(0, 2000);
    result.classification = classifyProcesses(result.processes, {relocatedRoot: paths.root, systemSandbox: [SEATBELT_EXEC]});
    result.helperAfter = helperSnapshot();
    try {
      result.turnEnded = {ok: true, result: await client.request('tools/call', {name: 'turn_ended', arguments: {hook_event_name: 'Stop', session_id: sessionId, turn_id: turnId}, _meta: meta(randomUUID())}, 30_000)};
    } catch (e) { result.turnEnded = {ok: false, error: e.message}; }
  } catch (e) {
    result.error = e.message;
  } finally {
    result.broker = {...broker.seen};
    child.stdin.end();
    let exit = await Promise.race([exited, sleep(5000).then(() => null)]);
    if (!exit) { child.kill('SIGTERM'); exit = await Promise.race([exited, sleep(5000).then(() => null)]); result.teardownSignal = 'SIGTERM'; }
    if (!exit) { child.kill('SIGKILL'); exit = await exited; result.teardownSignal = 'SIGKILL'; }
    result.exit = exit;
    await sleep(500);
    // Owned descendants still alive after the launcher exited; terminate only ones whose executable is still ours.
    const leftover = (result.processes ?? []).filter(p => p.pid !== child.pid && alive(p.pid) && sh('ps', ['-o', 'comm=', '-p', String(p.pid)]).trim() === p.executable);
    result.leftoverAfterExit = leftover.map(p => ({pid: p.pid, executable: p.executable}));
    for (const p of leftover) if (p.executable.startsWith(paths.root + '/')) process.kill(p.pid, 'SIGTERM');
    broker.server.close();
    rmSync(socketPath, {force: true});
    try { removeLaunchDirs(launch); } catch (error) { result.cleanupError = error.code ?? error.message; }
    claim.release();
  }
  return result;
}

const evidence = {
  probe: 'scripts/probe-runtime.mjs',
  at: new Date().toISOString(),
  release: opts.release,
  hostNode: process.version,
  // The launcher's parent: shows whether anything OpenAI-signed sits above the vendor node.
  launcherParent: {executable: process.execPath, team: sh('codesign', ['-dvv', process.execPath]).match(/^TeamIdentifier=(.*)$/m)?.[1] ?? 'none'},
  signatures: [paths.node, paths.nodeRepl, paths.skyServiceApp].map(checkSignature),
  variants: [],
};
evidence.variants.push(await runVariant('none'));

const okVariant = evidence.variants.find(v => v.js?.report?.state?.ok);
const report = okVariant?.js.report;
evidence.verdict = {
  signaturesValid: evidence.signatures.every(s => s.valid && s.team === TEAM && s.runtimeFlag),
  mcpHandshake: evidence.variants.every(v => v.handshake && v.tools?.includes('js')),
  nativeReadOnlyRequest: Boolean(okVariant),
  wrapperDelegated: Boolean(report && report.probe.delegated.includes('setup') && report.delegatedAfterState.includes('execute:list_apps')),
  noDesktopRuntimePaths: evidence.variants.every(v => v.classification && v.classification.desktopRuntimePaths.length === 0 && v.classification.allExecutablesRelocated),
  elicitationsDeclined: evidence.variants.reduce((n, v) => n + v.elicitations.length, 0),
  socketAccess: Object.fromEntries(evidence.variants.map(v => [v.name, {
    trustedWorker: {netConnect: v.js?.report?.probe?.netConnect ?? null, nativePipe: v.js?.report?.probe?.nativePipe ?? null},
    kernel: v.js?.report?.kernel ?? null,
    brokerAcknowledged: v.broker?.acknowledged ?? null,
  }])),
  helperServed: okVariant?.helperAfter ?? null,
};
const clean = sanitize(evidence, {cuaHome: home, userHome: homedir()});
mkdirSync(dirname(outFile), {recursive: true});
writeFileSync(outFile, JSON.stringify(clean, null, 1) + '\n');
process.stdout.write(JSON.stringify(clean.verdict, null, 1) + `\nevidence: ${outFile}\n`);
