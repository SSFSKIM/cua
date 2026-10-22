#!/usr/bin/env node
// Checks the standalone server end to end through the actual launcher: `cua serve` on the installed runtime in
// $CUA_HOME (default ~/Library/Application Support/cua; on Linux ${XDG_DATA_HOME:-~/.local/share}/cua). It runs the MCP handshake, checks the tool surface (four
// tools; five with the browser surface of CUA_SHIM_SURFACES, which adds profiles_list and documents the browser API
// in the js description, while the default documents none; then devices_list and devices_use, which stdio serve always
// lists) and instructions, and exercises task identity with trivial cells that touch no app: the first cell loads the vendor API
// (its banner), which reaches the native helper read-only. Then end_task, a second task, and EOF. It records which
// executables served (none may come from an installed desktop app), which helper held the native socket, and that
// the connection's own run entries are gone afterwards: the session is the one whose $CUA_HOME/run record names the
// server's pid (src/runtime/run-dir.mjs), so other connections in the same home are never mistaken for leftovers.
// Elicitations are declined; nothing is registered anywhere.
// secrets_list is checked for shape only (the keys of the file store under $HOME/.config/claude-secrets, or a
// value-free unavailable/error status); it lists file names and never reads a value.
//
// profiles_list (browser surface) is checked for shape only and never opens a tab.
//
// On Linux the process tree is read from /proc (ps truncates executable names there), and the native-socket holder
// step reads skip: the computer-use helper is a child process of the runtime, not a socket holder. Under the scoped
// sandbox the pinned codex runs each runtime child inside the system bubblewrap, which starts a new session: bubblewrap
// is the one executable allowed outside the release, its subtree may leave the anchor's process group, and every
// runtime process seen must be gone shortly after the close.
//
// The native engine (#117; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, acceptance 2 and 9, the
// Decision Log's "M3 pre-flight"). On macOS with the computer surface verify pins the engine the session drives, so the
// account's ~/.config/cua/engine.json never chooses it: --engine, else CUA_NATIVE_ENGINE, else the launcher's default;
// it predicts the host and engine as the launcher selects them (replHostFor), refuses before serving when the launcher
// would, and checks every js result's `_meta['cua/nativeEngine']` against the pinned engine (cua's: the approved
// bundle's version and build; the vendor's: its helper's version and the runtime release): any mismatch stops the run,
// sending nothing more. On macOS the runtime tree is judged by its host: the vendor host's runs from the installed
// release, cua's own host's runs cua's Node (and sandbox-exec, which execs it), never node_repl or the vendor's Node.
// With cua's engine the approved engine's socket must be bound only by that bundle's cua-engine and connected to only by
// cua's Node, its clients found by their peer address among every Unix socket lsof shows (a connection whose client is
// not seen leaves the clients unproven, a problem), and nothing may start from
// cua's roots (the home, the engine directory) during the session but cua-engine and cua's Node: the pinned runtime's
// SkyComputerUseService or node_repl started then is a problem, while other installations' helpers (the ChatGPT app's)
// lie outside those roots and are only reported.
// --bind <bundle id> binds that app twice in the connection, each bind only while the app is running with a layer-0
// window the window server shows (FrontWindowProbe, read with no engine observation), the same pid and the same windows
// before the second bind as before the first: verify never has the engine launch the app or reopen a windowless one,
// which would open and capture its panel (TextEdit's Open panel can list the owner's documents). It accepts only the
// policy's approval for that bundle (session persistence pinned) and declines everything else: the first bind must ask
// once, the second nothing. The report carries counts, process and socket identities and the attestation; never the
// tree's text, a title or a screenshot.
//
//   node verify.mjs                                       exit 0 when every check passes; prints a JSON report
//   CUA_SHIM_SURFACES=computer,browser node verify.mjs   the same with the browser surface
//   node verify.mjs --engine cua --bind com.apple.TextEdit   acceptance 2: cua's engine on cua's host, one approval
//   CUA_NATIVE_ENGINE=vendor node verify.mjs             acceptance 9: the vendor engine and host, attested as such
// Exit 2: a usage error (--engine or --bind where they do not apply, an unknown engine, a --bind that is no bundle id).
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {defaultHome} from './src/runtime/layout.mjs';
import {resolveRuntime} from './src/runtime/manifest.mjs';
import {REPL_HOST_META_KEY} from './src/repl-host/identity.mjs';
import {SEATBELT_EXEC} from './src/sandbox/seatbelt.mjs';
import {
  approvalsByBehaviour, attestationProblem, bindRefusal, boundedError, classifyOwnHostTree, classifyProcesses, cuaRootProcesses, descendants, engineSocketPeers,
  isAppApproval, lsappinfoPid, nativeSocketStep, outsideAnchorGroup, procTable, psRows, socketHolders, survivors, unixSocketEnds, unixSockets,
} from './scripts/probe/lib.mjs';
import {approvedEngineFacts, cuaNodes as cuaNodesOf, LaneUsageError, pinLane, selectLane} from './scripts/probe/pinned-engine.mjs';
import {readWindows} from './scripts/accept/window-close.mjs';
import {settingsFrom} from './src/mcp/server.mjs';

const CLI = fileURLToPath(new URL('./bin/cua.mjs', import.meta.url));
const NATIVE_SOCKET = join(homedir(), 'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock');
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const usage = message => { console.error(`verify: ${message}`); process.exit(2); };
let options;
try {
  ({values: options} = parseArgs({options: {engine: {type: 'string'}, bind: {type: 'string'}}, strict: true}));
} catch (error) { usage(error.message); }
const home = defaultHome();
const problems = [];
const {surfaces} = settingsFrom(process.env);
const browser = surfaces.includes('browser');
const darwin = process.platform === 'darwin';
if (options.bind !== undefined && !(darwin && surfaces.includes('computer'))) usage('--bind applies only to the computer surface on macOS');
if (options.bind !== undefined && !BUNDLE_ID.test(options.bind)) usage('--bind takes the bundle id of an app running with its window open, such as com.apple.TextEdit');
let pinned;
try { pinned = pinLane({flag: options.engine, env: process.env, home, surfaces}); } catch (error) {
  if (error instanceof LaneUsageError) usage(error.message);
  throw error;
}
const {pin} = pinned;
// With --bind, session-long approvals (CUA_SHIM_PERSIST=none would ask on every bind, not the behaviour observed here).
const serveEnv = {...pinned.serveEnv, ...(options.bind ? {CUA_SHIM_PERSIST: 'session'} : {})};
const MODEL_TOOLS = ['js', 'js_reset', 'end_task', 'secrets_list', ...(browser ? ['profiles_list'] : []), 'devices_list', 'devices_use'];
const report = {home, surfaces, problems};
const check = (ok, problem) => { if (!ok) problems.push(problem); return ok; };
const sh = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8'}).stdout ?? '';
const finish = () => { console.log(JSON.stringify(report, null, 1)); process.exitCode = problems.length ? 1 : 0; };
const exeOf = pid => readlinkSync(`/proc/${pid}/exe`);
// `pid ppid executable` for every process (descendants reads it).
const processTable = () => process.platform === 'linux' ? procTable(sh('ps', ['-eo', 'pid=,ppid=']), exeOf) : sh('ps', ['-axo', 'pid=,ppid=,comm=']);
// Linux: the system bubblewrap the pinned codex sandboxes each runtime child with, as the runtime's fixed PATH finds it.
const SYSTEM_SANDBOX = process.platform === 'linux' ? [...new Set(['/usr/bin/bwrap', '/bin/bwrap'].filter(existsSync).map(path => realpathSync(path)))] : [];
const isAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
let runtimeTree = [];

let runtime;
try {
  runtime = resolveRuntime({home});
  report.release = runtime.release;
} catch (error) {
  console.error(`verify: ${error.message}${error.hint ? `\n  ${error.hint}` : ''}`);
  process.exit(1);
}
// The pinned engine and, on macOS, the host and engine the launcher selects for it, as cua serve's connection does
// (src/mcp/connection.mjs): a selection the launcher refuses (an engine not installed, a host that cannot run) is
// refused here before anything is served.
let lane;
try { lane = selectLane({pin, serveEnv, home, runtime, surfaces}); } catch (error) {
  problems.push(`the launcher refuses this selection: [${error.code ?? 'error'}] ${error.message}`);
  finish();
  process.exit();
}
const {selection, expected} = lane;
const engineFacts = expected?.engine === 'cua' ? approvedEngineFacts(selection) : null;
if (pin) report.engine = {engine: pin.engine, pinnedBy: pin.pinnedBy, host: selection.host, expected, attested: 0, ...(engineFacts ? {bundle: engineFacts.bundlePath.replace(homedir(), '~')} : {})};
// Every js result attests the pinned engine. Any mismatch stops the run: nothing more is sent (no bind is approved on an
// engine the lane did not mean), the serve is closed through the cleanup below, and the report says why.
const attest = result => {
  if (!expected) return;
  report.engine.attested++;
  const problem = attestationProblem(result?._meta, expected);
  if (problem) throw new Error(`refused on the attestation: ${problem}`);
};
const psBefore = darwin ? psRows(sh('ps', ['-axo', 'pid=,ppid=,comm='])) : [];
const runDir = join(runtime.home, 'run');
const runEntries = () => existsSync(runDir) ? readdirSync(runDir) : [];
const runBefore = runEntries();
// The sessions whose run record names `pid` (a record still being written by another process reads empty: skipped).
const sessionsOf = pid => runEntries().flatMap(name => {
  const session = /^(.+)\.pid$/.exec(name)?.[1];
  if (!session) return [];
  try { return readFileSync(join(runDir, name), 'utf8').trim() === String(pid) ? [session] : []; } catch { return []; }
});
const present = path => { try { lstatSync(path); return true; } catch { return false; } };
const sessionEntries = session => [`${session}.pid`, session, `${session}.sock`];

const server = spawn(process.execPath, [CLI, 'serve'], {stdio: ['pipe', 'pipe', 'inherit'], env: serveEnv});
const exited = new Promise(resolve => server.on('exit', (code, signal) => resolve({code, signal})));
const pending = new Map();
// A server that has gone (a refused open, say) answers nothing more: fail what waits instead of waiting out its timeout.
// 'close' comes after its stdout is drained, so an answer still in the pipe is read first.
server.on('close', (code, signal) => { for (const waiter of pending.values()) waiter.reject(new Error(`cua serve exited (${JSON.stringify({code, signal})}) before answering`)); pending.clear(); });
let nextId = 0;
report.elicitationsDeclined = 0;
// The bind in flight ({asked, accepted, error}): only it may be approved, and only for --bind's app.
let binding = null;
const send = msg => server.stdin.write(JSON.stringify(msg) + '\n');
createInterface({input: server.stdout}).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.method === 'elicitation/create' && msg.id !== undefined) {
    if (binding && isAppApproval(msg, options.bind)) {
      binding.asked++;
      binding.accepted++;
      return send({jsonrpc: '2.0', id: msg.id, result: {action: 'accept', content: {}}});
    }
    report.elicitationsDeclined++;
    return send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}});
  }
  if (msg.method !== undefined && msg.id !== undefined) return send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'not supported by verify'}});
  const waiter = pending.get(msg.id);
  if (!waiter) return;
  pending.delete(msg.id);
  msg.error ? waiter.reject(new Error(`${msg.error.code}: ${msg.error.message}`)) : waiter.resolve(msg.result);
});
const request = (method, params = {}, timeoutMs = 30_000) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} got no answer within ${timeoutMs} ms`)); }, timeoutMs);
  pending.set(id, {resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); }});
  send({jsonrpc: '2.0', id, method, params});
});
const call = (name, args = {}, timeoutMs) => request('tools/call', {name, arguments: args}, timeoutMs);
const taskOf = result => result?._meta?.['cua/taskId'] ?? null;

try {
  const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-verify', version: '0'}}, 120_000);
  send({jsonrpc: '2.0', method: 'notifications/initialized'});
  // The server claims its session before it reads the client, so the record is there once initialize is answered.
  const own = sessionsOf(server.pid);
  report.session = own.length === 1 ? {id: own[0], entries: sessionEntries(own[0]).filter(name => present(join(runDir, name)))} : null;
  check(own.length === 1, `expected one run record naming the server's pid ${server.pid} under ${runDir}, found ${own.length}`);
  const instructions = init.instructions ?? '';
  report.server = init.serverInfo;
  report.protocolVersion = init.protocolVersion;
  report.instructionsChars = instructions.length;
  check(/Host notes/.test(instructions), 'host notes missing from instructions');
  check(instructions.length <= 2048, 'instructions exceed the 2048-character cap');

  const {tools} = await request('tools/list');
  report.tools = tools.map(t => t.name);
  check(JSON.stringify(report.tools) === JSON.stringify(MODEL_TOOLS), `tools are ${report.tools.join(', ')}, expected ${MODEL_TOOLS.join(', ')}`);
  check(tools.every(t => t._meta?.['anthropic/searchHint']), 'a tool lacks anthropic/searchHint');
  check(!tools.some(t => t._meta?.['anthropic/alwaysLoad']), 'a tool carries anthropic/alwaysLoad; the tools are meant to defer');
  const jsDescription = tools.find(t => t.name === 'js')?.description ?? '';
  report.browserApiDocumented = /createBrowserTab/.test(jsDescription);
  check(report.browserApiDocumented === browser, browser ? 'the js description does not document the browser API' : 'the js description documents the browser API without the browser surface');
  if (browser) {
    // A bound profile's readiness takes one bounded listing launch of its own.
    const profiles = (await call('profiles_list', {}, 150_000)).structuredContent;
    report.profilesList = profiles?.status === 'ok' ? {status: 'ok', keys: profiles.profiles.map(p => p.key), ready: profiles.profiles.filter(p => p.ready).map(p => p.key)} : profiles;
    check(profiles?.status === 'ok' && Array.isArray(profiles.profiles) && profiles.profiles.every(p => typeof p.key === 'string' && typeof p.ready === 'boolean' && !('chromeProfileDirectory' in p)),
      `profiles_list returned ${JSON.stringify(report.profilesList)}`);
  }

  const idleEnd = await call('end_task');
  check(idleEnd.structuredContent?.status === 'noop', `end_task with no task returned ${JSON.stringify(idleEnd.structuredContent)}`);
  const secrets = (await call('secrets_list')).structuredContent;
  report.secretsList = secrets?.status === 'ok' ? {status: 'ok', labelCount: secrets.labels.length} : secrets;
  check(secrets?.status === 'ok' ? Array.isArray(secrets.labels) && Object.keys(secrets).join() === 'status,labels'
    : ['unavailable', 'error'].includes(secrets?.status) && typeof secrets.code === 'string', `secrets_list returned ${JSON.stringify(report.secretsList)}`);

  const first = await call('js', {code: 'nodeRepl.write("cua-verify")', title: 'cua verify'}, 120_000);
  attest(first);
  const second = await call('js', {code: 'nodeRepl.write("cua-verify again")', title: 'cua verify'}, 60_000);
  attest(second);
  check(!first.isError && !second.isError, 'a trivial js cell returned an error');
  const taskId = taskOf(first);
  report.task = {first: taskId, sameTaskAcrossCalls: taskId !== null && taskOf(second) === taskId};
  check(report.task.sameTaskAcrossCalls, 'two js calls in one task carried different task IDs');
  if (selection) {
    report.host = first?._meta?.[REPL_HOST_META_KEY]?.host ?? 'vendor';
    check(report.host === selection.host, `the session ran on the ${report.host} host where the launcher selects the ${selection.host} host`);
  }

  // --bind: the app twice in this connection, observed by behaviour (the first bind asks once, the second nothing).
  // Before each bind the window server, not an observation, must show the app's window (bindRefusal): an observation of
  // a windowless app reopens it and captures what it opens, so a missing scene is refused before any js call.
  if (options.bind) {
    const binds = [];
    report.bind = {app: options.bind, binds};
    let firstRead;
    for (const timeoutMs of [120_000, 60_000]) {
      const pid = lsappinfoPid(sh('/usr/bin/lsappinfo', ['info', '-only', 'pid', '-app', options.bind]));
      const windows = pid === null ? null : await readWindows([pid]);
      report.bind.running ??= pid !== null;
      const refusal = bindRefusal({app: options.bind, pid, windows, first: firstRead});
      if (refusal) throw new Error(refusal);
      firstRead ??= {pid, windows};
      report.bind.windows = windows.length;
      binding = {asked: 0, accepted: 0, error: false};
      try {
        const result = await call('js', {code: `await cua.getApp(${JSON.stringify(options.bind)}); nodeRepl.write("bound")`, title: 'cua verify bind'}, timeoutMs);
        attest(result);
        // The result's text is the app's tree: only whether it failed, and a bounded first line when it did, is kept.
        if (result.isError) Object.assign(binding, {error: true, message: boundedError(result.content?.find(c => c.type === 'text')?.text)});
      } finally { binds.push(binding); binding = null; }
    }
    const observed = approvalsByBehaviour([{name: 'connection', binds, declined: report.elicitationsDeclined}]);
    report.bind.approvals = observed.detail;
    for (const problem of observed.problems) check(false, `--bind ${options.bind}: ${problem}`);
  }

  // Below the server: its group-lifetime anchor (this Node, running src/mcp/anchor.mjs), then the runtime: the
  // relocated vendor host, or cua's own host on cua's Node.
  const psText = processTable();
  const tree = descendants(psText, server.pid).filter(p => p.pid !== server.pid);
  const hostNode = realpathSync(process.execPath);
  const anchor = tree.find(p => p.ppid === server.pid);
  runtimeTree = tree.filter(p => p !== anchor);
  const pgid = pid => Number(sh('ps', ['-o', 'pgid=', '-p', String(pid)]).trim());
  const label = executable => executable.replace(runtime.root, '$RUNTIME').replace(hostNode, '<host node>').replace(homedir(), '~');
  const ownHost = selection?.host === 'cua';
  const cuaNodes = cuaNodesOf({hostNode, selection});
  const classification = classifyProcesses(runtimeTree, {relocatedRoot: runtime.root, systemSandbox: SYSTEM_SANDBOX});
  const ownTree = ownHost ? classifyOwnHostTree(runtimeTree, {cuaNodes, systemSandbox: [SEATBELT_EXEC], vendorRoot: runtime.root}) : null;
  report.processes = {
    ...(selection ? {host: selection.host} : {}),
    ancestry: [{pid: server.pid, ppid: process.pid, pgid: pgid(server.pid), executable: '<host node> bin/cua.mjs serve'},
      ...tree.map(p => ({pid: p.pid, ppid: p.ppid, pgid: pgid(p.pid), executable: label(p.executable)}))],
    // The vendor host's rule (every runtime process runs from the installed release); cua's own host runs none from it.
    allExecutablesRelocated: ownHost ? null : classification.allExecutablesRelocated,
    // The rule of the host that served: the vendor host's above, or cua's own host's (cua's Node and sandbox-exec only).
    allExecutablesExpected: ownHost ? ownTree.allExecutablesExpected : classification.allExecutablesRelocated,
    desktopRuntimePaths: classification.desktopRuntimePaths.map(p => p.executable),
  };
  check(anchor?.executable === hostNode && runtimeTree.every(p => p.ppid !== server.pid), 'the runtime is not started under the server\'s anchor');
  check(anchor && outsideAnchorGroup(tree, {anchorPid: anchor.pid, pgidOf: pgid, systemSandbox: SYSTEM_SANDBOX}).length === 0, 'a runtime process is outside the anchor\'s process group');
  check(classification.desktopRuntimePaths.length === 0, 'an installed-desktop runtime path served this connection');
  if (ownHost) check(ownTree.allExecutablesExpected, `not every process of cua's own host runs cua's Node: ${ownTree.unexpected.map(p => `pid ${p.pid} ${label(p.executable)}`).join(', ') || 'no runtime process found'}${ownTree.vendorRuntime.length ? ` (node_repl or the vendor's Node from the installed release: ${ownTree.vendorRuntime.map(p => p.pid).join(', ')})` : ''}`);
  else check(classification.allExecutablesRelocated, `not every runtime process runs from the installed release: ${runtimeTree.filter(p => !p.executable.startsWith(runtime.root + '/') && !SYSTEM_SANDBOX.includes(p.executable)).map(p => `pid ${p.pid} ${label(p.executable)}`).join(', ') || 'no runtime process found'}`);
  report.nativeHelper = nativeSocketStep(process.platform) ?? (existsSync(NATIVE_SOCKET) ? socketHolders(sh('lsof', ['-F', 'pc', NATIVE_SOCKET])) : [])
    .map(h => ({pid: h.pid, executable: sh('ps', ['-o', 'comm=', '-p', String(h.pid)]).trim()}))
    .map(h => ({pid: h.pid, executable: h.executable.replace(homedir(), '~'), origin: h.executable.startsWith(runtime.root) ? 'pinned runtime' : 'another installation (not started or stopped by cua)'}));

  // cua's engine: who holds the approved engine's socket, and what this session started from cua's roots.
  if (engineFacts) {
    const {executable: engineExecutable, socket, directory} = engineFacts;
    const executables = new Map(psRows(psText).map(p => [p.pid, p.executable]));
    const executableOf = pid => executables.get(pid) ?? sh('ps', ['-o', 'comm=', '-p', String(pid)]).trim();
    // Every Unix socket lsof can see, so the clients are found by their peer address: a client's end is unbound, and a
    // listing filtered by the socket's path shows the engine alone.
    const ends = unixSocketEnds(unixSockets(sh('/usr/sbin/lsof', ['-U', '-F', 'pcfdn'])), socket);
    // On the vendor host (comparison A's lane) the relay that connects is the runtime's own Node or node_repl.
    const vendorRelay = ownHost ? [] : [runtime.paths.node, runtime.paths.nodeRepl];
    const sockets = engineSocketPeers(ends, {engineExecutable, executableOf, requireEngine: Boolean(options.bind),
      mayConnect: executable => cuaNodes.includes(executable) || vendorRelay.includes(executable)});
    const roots = cuaRootProcesses({before: psBefore, during: psRows(psText), roots: [runtime.home, directory], allowed: [engineExecutable, ...cuaNodes, ...vendorRelay]});
    const show = p => ({pid: p.pid, executable: label(p.executable)});
    Object.assign(report.engine, {
      socket: {
        bound: [...new Set(ends.bound.map(e => e.pid))].map(pid => ({...show({pid, executable: executableOf(pid)}), role: sockets.engine.includes(pid) ? 'engine' : 'unexpected'})),
        clients: [...new Set(ends.clients.map(e => e.pid))].map(pid => ({...show({pid, executable: executableOf(pid)}), role: sockets.clients.includes(pid) ? 'client' : 'unexpected'})),
        unseenClients: ends.unseen,
      },
      startedFromCuaRoots: roots.started.map(show),
      runningBefore: roots.preExisting.map(show),
    });
    for (const problem of [...sockets.problems, ...roots.problems]) check(false, problem.replace(runtime.root, '$RUNTIME').replace(homedir(), '~'));
  }

  const ended = await call('end_task');
  report.task.end = ended.structuredContent;
  check(ended.structuredContent?.status === 'ended' && ended.structuredContent.taskId === taskId, `end_task returned ${JSON.stringify(ended.structuredContent)}`);
  report.task.repeatEnd = (await call('end_task')).structuredContent?.status;
  check(report.task.repeatEnd === 'noop', 'a repeated end_task after success was not a no-op');
  const next = await call('js', {code: 'nodeRepl.write("cua-verify next task")', title: 'cua verify'}, 60_000);
  attest(next);
  report.task.nextTaskDiffers = taskOf(next) !== null && taskOf(next) !== taskId;
  check(report.task.nextTaskDiffers, 'work after end_task did not start a new task');
  check((await call('end_task')).structuredContent?.status === 'ended', 'the second task did not end');
} catch (error) {
  problems.push(`verify failed: ${error.message}`);
} finally {
  server.stdin.end();
  const exit = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve(null), 15_000))]);
  if (!exit) { server.kill('SIGTERM'); problems.push('cua serve did not exit within 15 s of EOF'); }
  report.exit = exit ?? await exited;
  check(report.exit.code === 0, `cua serve exited with ${JSON.stringify(report.exit)}`);
  // This connection's entries (and any other session its process claimed, e.g. a profiles_list listing) must be gone.
  const leftover = [...new Set([...(report.session ? [report.session.id] : []), ...sessionsOf(server.pid)])]
    .flatMap(sessionEntries).filter(name => present(join(runDir, name)));
  check(leftover.length === 0, `this connection's run entries left under ${runDir}: ${leftover.join(', ')}`);
  // Every runtime process seen during the session is gone shortly after the close: a sandboxed subtree outside the
  // anchor's group (Linux bubblewrap) ends through its parent, not through the group's signal.
  let left = survivors(runtimeTree, isAlive);
  for (let waited = 0; left.length && waited < 5000; waited += 250) {
    await new Promise(resolve => setTimeout(resolve, 250));
    left = survivors(left, isAlive);
  }
  check(left.length === 0, `runtime processes outlived the connection: ${left.map(p => `pid ${p.pid} ${p.executable}`).join(', ')}`);
  // Informational: entries that appeared while verify ran belong to other connections in this home, not to this one.
  const others = runEntries().filter(name => !runBefore.includes(name) && !leftover.includes(name));
  if (others.length) report.runNote = `${others.length} other entr${others.length === 1 ? 'y' : 'ies'} appeared under ${runDir} while verify ran (another cua serve or listing in this home; not counted): ${others.join(', ')}`;
}

finish();
