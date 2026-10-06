#!/usr/bin/env node
// Checks the standalone server end to end through the actual launcher: `cua serve` on the installed runtime in
// $CUA_HOME (default ~/Library/Application Support/cua; on Linux ${XDG_DATA_HOME:-~/.local/share}/cua). It runs the MCP handshake, checks the tool surface (four
// tools; five with the browser surface of CUA_SHIM_SURFACES, which adds profiles_list and documents the browser API
// in the js description, while the default documents none) and instructions, and exercises task identity with trivial cells that touch no app: the first cell loads the vendor API
// (its banner), which reaches the native helper read-only. Then end_task, a second task, and EOF. It records which
// executables served (none may come from an installed desktop app), which helper held the native socket, and that
// the connection's own run entries are gone afterwards: the session is the one whose $CUA_HOME/run record names the
// server's pid (src/runtime/run-dir.mjs), so other connections in the same home are never mistaken for leftovers.
// Elicitations are declined; nothing is registered anywhere.
// secrets_list is checked for shape only (labels, or a value-free unavailable/error status): with a built Keychain
// helper the server runs that connection's broker as its second child, which must be gone after close too.
//
// profiles_list (browser surface) is checked for shape only and never opens a tab.
//
// On Linux the process tree is read from /proc (ps truncates executable names there), and the native-socket holder
// step reads skip: the computer-use helper is a child process of the runtime, not a socket holder. Under the scoped
// sandbox the pinned codex runs each runtime child inside the system bubblewrap, which starts a new session: bubblewrap
// is the one executable allowed outside the release, its subtree may leave the anchor's process group, and every
// runtime process seen must be gone shortly after the close.
//
//   node verify.mjs                                       exit 0 when every check passes; prints a JSON report
//   CUA_SHIM_SURFACES=computer,browser node verify.mjs   the same with the browser surface
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {defaultHome} from './src/runtime/layout.mjs';
import {resolveRuntime} from './src/runtime/manifest.mjs';
import {descendants, classifyProcesses, socketHolders, nativeSocketStep, procTable, outsideAnchorGroup, survivors} from './scripts/probe/lib.mjs';
import {locateHelper} from './src/secrets/helper.mjs';
import {settingsFrom} from './src/mcp/server.mjs';

const CLI = fileURLToPath(new URL('./bin/cua.mjs', import.meta.url));
const NATIVE_SOCKET = join(homedir(), 'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock');
const home = defaultHome();
const problems = [];
const {surfaces} = settingsFrom(process.env);
const browser = surfaces.includes('browser');
const MODEL_TOOLS = ['js', 'js_reset', 'end_task', 'secrets_list', ...(browser ? ['profiles_list'] : [])];
const report = {home, surfaces, problems};
const check = (ok, problem) => { if (!ok) problems.push(problem); return ok; };
const sh = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8'}).stdout ?? '';
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

const server = spawn(process.execPath, [CLI, 'serve'], {stdio: ['pipe', 'pipe', 'inherit'], env: {...process.env, CUA_HOME: home}});
const exited = new Promise(resolve => server.on('exit', (code, signal) => resolve({code, signal})));
// A server that exits (a refused open, say) answers nothing more: fail what waits instead of waiting out its timeout.
exited.then(({code, signal}) => { for (const waiter of pending.values()) waiter.reject(new Error(`cua serve exited (${JSON.stringify({code, signal})}) before answering`)); pending.clear(); });
const pending = new Map();
let nextId = 0;
report.elicitationsDeclined = 0;
const send = msg => server.stdin.write(JSON.stringify(msg) + '\n');
createInterface({input: server.stdout}).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.method === 'elicitation/create' && msg.id !== undefined) { report.elicitationsDeclined++; return send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}}); }
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
  const second = await call('js', {code: 'nodeRepl.write("cua-verify again")', title: 'cua verify'}, 60_000);
  check(!first.isError && !second.isError, 'a trivial js cell returned an error');
  const taskId = taskOf(first);
  report.task = {first: taskId, sameTaskAcrossCalls: taskId !== null && taskOf(second) === taskId};
  check(report.task.sameTaskAcrossCalls, 'two js calls in one task carried different task IDs');

  // Below the server: its group-lifetime anchor (this Node, running src/mcp/anchor.mjs), then the relocated runtime;
  // beside it, the connection's secrets broker when the Keychain helper is built.
  const helperPath = locateHelper({home}).path;
  const helper = existsSync(helperPath) ? realpathSync(helperPath) : null;
  const all = descendants(processTable(), server.pid).filter(p => p.pid !== server.pid);
  const brokers = all.filter(p => p.ppid === server.pid && helper && [helperPath, helper].includes(p.executable));
  const tree = all.filter(p => !brokers.includes(p));
  report.secretsBroker = brokers.map(p => ({pid: p.pid, executable: p.executable.replace(homedir(), '~')}));
  check(secrets?.status !== 'ok' || brokers.length === 1, 'secrets_list answered but no broker helper runs under the server');
  const hostNode = realpathSync(process.execPath);
  const anchor = tree.find(p => p.ppid === server.pid);
  runtimeTree = tree.filter(p => p !== anchor);
  const pgid = pid => Number(sh('ps', ['-o', 'pgid=', '-p', String(pid)]).trim());
  const label = executable => executable.replace(runtime.root, '$RUNTIME').replace(hostNode, '<host node>').replace(homedir(), '~');
  const classification = classifyProcesses(runtimeTree, {relocatedRoot: runtime.root, systemSandbox: SYSTEM_SANDBOX});
  report.processes = {
    ancestry: [{pid: server.pid, ppid: process.pid, pgid: pgid(server.pid), executable: '<host node> bin/cua.mjs serve'},
      ...tree.map(p => ({pid: p.pid, ppid: p.ppid, pgid: pgid(p.pid), executable: label(p.executable)}))],
    allExecutablesRelocated: classification.allExecutablesRelocated,
    desktopRuntimePaths: classification.desktopRuntimePaths.map(p => p.executable),
  };
  check(anchor?.executable === hostNode && runtimeTree.every(p => p.ppid !== server.pid), 'the runtime is not started under the server\'s anchor');
  check(anchor && outsideAnchorGroup(tree, {anchorPid: anchor.pid, pgidOf: pgid, systemSandbox: SYSTEM_SANDBOX}).length === 0, 'a runtime process is outside the anchor\'s process group');
  check(classification.desktopRuntimePaths.length === 0, 'an installed-desktop runtime path served this connection');
  check(classification.allExecutablesRelocated, `not every runtime process runs from the installed release: ${runtimeTree.filter(p => !p.executable.startsWith(runtime.root + '/') && !SYSTEM_SANDBOX.includes(p.executable)).map(p => `pid ${p.pid} ${label(p.executable)}`).join(', ') || 'no runtime process found'}`);
  report.nativeHelper = nativeSocketStep(process.platform) ?? (existsSync(NATIVE_SOCKET) ? socketHolders(sh('lsof', ['-F', 'pc', NATIVE_SOCKET])) : [])
    .map(h => ({pid: h.pid, executable: sh('ps', ['-o', 'comm=', '-p', String(h.pid)]).trim()}))
    .map(h => ({pid: h.pid, executable: h.executable.replace(homedir(), '~'), origin: h.executable.startsWith(runtime.root) ? 'pinned runtime' : 'another installation (not started or stopped by cua)'}));

  const ended = await call('end_task');
  report.task.end = ended.structuredContent;
  check(ended.structuredContent?.status === 'ended' && ended.structuredContent.taskId === taskId, `end_task returned ${JSON.stringify(ended.structuredContent)}`);
  report.task.repeatEnd = (await call('end_task')).structuredContent?.status;
  check(report.task.repeatEnd === 'noop', 'a repeated end_task after success was not a no-op');
  const next = await call('js', {code: 'nodeRepl.write("cua-verify next task")', title: 'cua verify'}, 60_000);
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
  for (const broker of report.secretsBroker ?? []) {
    let gone = false;
    try { process.kill(broker.pid, 0); } catch { gone = true; }
    check(gone, `the secrets broker (pid ${broker.pid}) outlived the connection`);
  }
}

console.log(JSON.stringify(report, null, 1));
process.exitCode = problems.length ? 1 : 0;
