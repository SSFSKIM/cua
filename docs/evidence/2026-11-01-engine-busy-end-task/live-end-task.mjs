#!/usr/bin/env node
// #237 condition 4 live check (ledger.md RULING): against the installed cua engine, no GUI work. Speaks MCP over stdio
// to THIS worktree's `cua serve` (bin/cua.mjs serve), so the REPL host's trusted worker loads the branch's
// src/services/engine/service.mjs (launch.mjs ENGINE_SERVICE is resolved from launch.mjs's own location).
//
//   baseline status -> js cell 1 (cua.listApps, engine-bound, no app approval) -> status (our holder named)
//   [--try-build: engine build while the holder is connected; must refuse engine_busy] -> end_task -> status polls
//   -> js cell 2 (lazy reconnect) -> status (holder again) -> end_task -> status polls -> close the server
//
// Every event goes to --out as JSON lines; stdout gets one PASS/FAIL line. Elicitations are accepted and logged, as the
// plugin's hooks/cua-approve.sh does.
//
// node live-end-task.mjs --out FILE [--repo DIR] [--label TEXT] [--within-ms 1000] [--try-build] [--allow-unnamed]
import {spawn} from 'node:child_process';
import {createWriteStream, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createInterface} from 'node:readline';
import {parseArgs} from 'node:util';

const {values: args} = parseArgs({options: {
  out: {type: 'string'},
  repo: {type: 'string', default: '/Users/new/Developer/GitHub/cua/.claude/worktrees/fix-237'},
  label: {type: 'string', default: 'live-237'},
  'within-ms': {type: 'string', default: '1000'},
  'try-build': {type: 'boolean', default: false},
  'allow-unnamed': {type: 'boolean', default: false},
}});
if (!args.out) { process.stderr.write('usage: live-end-task.mjs --out FILE [--repo DIR] [--label TEXT] [--within-ms N] [--try-build] [--allow-unnamed]\n'); process.exit(2); }
const REPO = resolve(args.repo);
const CLI = join(REPO, 'bin', 'cua.mjs');
if (!existsSync(CLI)) { process.stderr.write(`no ${CLI}\n`); process.exit(2); }
const WITHIN = Number(args['within-ms']);
const POLLS = [0, 250, 500, 1000, 2000];
const LABEL = args.label;

const out = createWriteStream(resolve(args.out), {flags: 'w'});
const t0 = performance.now();
const ms = () => Math.round((performance.now() - t0) * 10) / 10;
const log = (ev, data = {}) => out.write(JSON.stringify({t: ms(), at: new Date().toISOString(), ev, ...data}) + '\n');
const sleep = n => new Promise(r => setTimeout(r, n));
const clip = (s, n = 1500) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…[${s.length - n} more]` : s);

// ---- child processes ----
function run(command, argv, {timeoutMs = 60_000, env = process.env} = {}) {
  return new Promise(done => {
    const started = ms();
    const child = spawn(command, argv, {cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code, signal) => { clearTimeout(timer); done({pid: child.pid, started, ended: ms(), code, signal, stdout, stderr}); });
    child.on('error', error => { clearTimeout(timer); done({pid: child.pid, started, ended: ms(), code: null, signal: null, stdout, stderr: `${stderr}${error.message}`}); });
  });
}

// `node bin/cua.mjs engine status` (text), parsed: "running: pid P, …, N other connection(s)[: pid A (label), pid B]".
async function status(tag, extra = {}) {
  const r = await run(process.execPath, [CLI, 'engine', 'status'], {timeoutMs: 30_000});
  const lines = r.stdout.split('\n').filter(Boolean);
  const running = lines.find(l => l.startsWith('running:')) ?? null;
  const m = running?.match(/, (\d+) other connection\(s\)(?:: (.*))?$/);
  const holders = m?.[2] ? [...m[2].matchAll(/pid (\d+)(?: \(([^)]*)\))?|a client of unknown pid/g)].map(h => ({pid: h[1] ? Number(h[1]) : null, label: h[2] ?? null})) : [];
  const s = {tag, ...extra, statusPid: r.pid, started: r.started, ended: r.ended, exit: r.code, lines, stderr: r.stderr.trim() || undefined,
    enginePid: Number(running?.match(/^running: pid (\d+)/)?.[1]) || null, connections: m ? Number(m[1]) : null, holders};
  log('status', s);
  return s;
}

// The server's process tree (server -> anchor -> supervisor -> kernel, trusted worker, connectors).
async function tree(tag) {
  const r = await run('/bin/ps', ['-axo', 'pid=,ppid=,command=']);
  const procs = r.stdout.split('\n').map(l => l.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(([, pid, ppid, command]) => ({pid: Number(pid), ppid: Number(ppid), command}));
  const ours = new Set([server.pid]);
  for (let grew = true; grew;) { grew = false; for (const p of procs) if (ours.has(p.ppid) && !ours.has(p.pid)) { ours.add(p.pid); grew = true; } }
  const members = procs.filter(p => ours.has(p.pid)).map(p => ({...p, command: clip(p.command, 400)}));
  log('tree', {tag, members});
  return {pids: ours, supervisor: members.find(p => /repl-host\/supervisor\.mjs/.test(p.command)) ?? null};
}

// ---- the MCP server ----
const serverEnv = {...process.env,
  CUA_SHIM_SURFACES: 'computer,browser',   // the plugin's surfaces (its recorded handshake answers initialize)
  CUA_NATIVE_ENGINE: 'cua',        // the default is the vendor engine; no ~/.config/cua/engine.json selects cua's
  CUA_CURSOR_LABEL: LABEL,         // the holder's label in `engine status`
  CUA_RUNTIME_IDLE_MS: '0',        // never idle-stop the runtime (keeps the holder through a --try-build compile)
  CUA_SHIM_SECRETS: 'off',
};
delete serverEnv.CUA_REPL_HOST;
const server = spawn(process.execPath, ['--disable-sigusr1', CLI, 'serve'], {cwd: REPO, env: serverEnv, stdio: ['pipe', 'pipe', 'pipe']});
log('server_spawn', {pid: server.pid, argv: [process.execPath, '--disable-sigusr1', CLI, 'serve'], env: Object.fromEntries(Object.entries(serverEnv).filter(([k]) => /^CUA_(SHIM_SURFACES|NATIVE_ENGINE|CURSOR_LABEL|RUNTIME_IDLE_MS|SHIM_SECRETS)$/.test(k)))});
let serverExit = null;
const exited = new Promise(r => server.on('exit', (code, signal) => { serverExit = {code, signal}; log('server_exit', serverExit); r(); }));
createInterface({input: server.stderr}).on('line', line => log('server_stderr', {line: clip(line, 2000)}));

let nextId = 1;
const pending = new Map();
const send = msg => server.stdin.write(JSON.stringify(msg) + '\n');
createInterface({input: server.stdout}).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return log('server_stdout_unparsed', {line: clip(line)}); }
  if (msg.method !== undefined && msg.id !== undefined) {
    if (msg.method === 'elicitation/create') {
      log('elicitation', {id: msg.id, message: msg.params?.message, params: msg.params, answer: 'accept'});
      return send({jsonrpc: '2.0', id: msg.id, result: {action: 'accept', content: {}}});
    }
    if (msg.method === 'ping') return send({jsonrpc: '2.0', id: msg.id, result: {}});
    log('server_request_refused', {id: msg.id, method: msg.method});
    return send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: `live-end-task: ${msg.method} not supported`}});
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const {resolve: ok, timer} = pending.get(msg.id);
    pending.delete(msg.id); clearTimeout(timer); return ok(msg);
  }
  log('server_notification', {method: msg.method, params: msg.method === 'notifications/message' ? msg.params : undefined, id: msg.id});
});

function request(method, params, timeoutMs = 120_000) {
  const id = nextId++;
  const sent = ms();
  log('request', {id, method, params});
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`${method} (id ${id}) had no answer in ${timeoutMs} ms`)); }, timeoutMs);
    pending.set(id, {resolve: ok, timer});
    send({jsonrpc: '2.0', id, method, params});
  }).then(msg => {
    log('response', {id, method, rtt: Math.round((ms() - sent) * 10) / 10, error: msg.error, result: summarize(msg.result)});
    if (msg.error) throw new Error(`${method}: ${msg.error.message}`);
    return msg.result;
  });
}
function summarize(result) {
  if (!result || typeof result !== 'object') return result;
  if (Array.isArray(result.tools)) return {tools: result.tools.map(t => t.name)};
  if (Array.isArray(result.content)) return {...result, content: result.content.map(c => (c.type === 'text' ? {type: 'text', text: clip(c.text)} : {type: c.type}))};
  return result;
}
const textOf = result => (result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');

// ---- the check ----
const failures = [];
const notes = [];
let baseline = null;
let ourPids = new Set();
const ours = s => s.holders.filter(h => ourPids.has(h.pid));
const named = s => ours(s).some(h => h.label === LABEL);

function judgeHolder(s, which) {
  if (s.exit !== 0 || s.connections === null) return failures.push(`${which}: status unreadable (exit ${s.exit})`);
  if (named(s)) return;
  if (s.connections > (baseline?.connections ?? 0) && s.holders.length === 0) {
    if (args['allow-unnamed']) return notes.push(`${which}: holder counted but unnamed (engine predates holder naming)`);
    return failures.push(`${which}: ${s.connections} connection(s) but no holders named (the running engine predates #237's holder naming; --allow-unnamed accepts the count)`);
  }
  failures.push(`${which}: no holder from this server named "${LABEL}" (${s.lines.find(l => l.startsWith('running:')) ?? 'not running'})`);
}

// Polls at 0/250/500/1000/2000 ms after the end_task reply, one at a time (a concurrent status would count another).
async function pollAfter(endedAt, which) {
  const results = [];
  for (const offset of POLLS) {
    const wait = endedAt + offset - ms();
    if (wait > 0) await sleep(wait);
    results.push(await status(`${which}+${offset}`, {scheduledMs: offset}));
  }
  for (const s of results) s.sinceEndTask = Math.round((s.started - endedAt) * 10) / 10;
  const zero = s => s.exit === 0 && s.connections !== null && ours(s).length === 0 && s.connections <= (baseline?.connections ?? 0);
  const firstZero = results.find(zero);
  log('poll_summary', {which, polls: results.map(s => ({sinceEndTask: s.sinceEndTask, connections: s.connections, holders: s.holders})), firstZeroAt: firstZero?.sinceEndTask ?? null});
  if (!firstZero || firstZero.sinceEndTask > WITHIN) failures.push(`${which}: not back to ${baseline?.connections ?? 0} other connection(s) within ${WITHIN} ms (first at ${firstZero?.sinceEndTask ?? 'never'})`);
  else if (!zero(results.at(-1))) failures.push(`${which}: a connection came back by the last poll (${results.at(-1).connections})`);
}

async function cell(n) {
  const code = `const apps = await cua.listApps({ emit: false });\nnodeRepl.write(JSON.stringify({ marker: "live-237", cell: ${n}, apps: apps.length }));`;
  const result = await request('tools/call', {name: 'js', arguments: {code, timeout_ms: 60_000}}, 90_000);
  const text = textOf(result);
  const engine = result?._meta?.['cua/nativeEngine'] ?? null;
  const ok = !result?.isError && text.includes(`"marker":"live-237","cell":${n}`);
  log('cell', {n, ok, isError: Boolean(result?.isError), nativeEngine: engine, marker: text.match(/\{"marker":"live-237"[^}]*\}/)?.[0] ?? null});
  if (!ok) failures.push(`cell ${n} failed: ${clip(text, 300)}`);
  else if (engine?.engine !== 'cua') failures.push(`cell ${n} ran on ${JSON.stringify(engine)}, not cua's engine`);
  return ok;
}

async function endTask(n) {
  const result = await request('tools/call', {name: 'end_task', arguments: {}}, 30_000);
  const endedAt = ms();
  const fields = result?.structuredContent ?? (() => { try { return JSON.parse(textOf(result)); } catch { return null; } })();
  log('end_task', {n, isError: Boolean(result?.isError), status: fields?.status ?? null});
  if (result?.isError || fields?.status !== 'ended') failures.push(`end_task ${n}: ${result?.isError ? 'error' : `status ${fields?.status}`}`);
  return endedAt;
}

async function tryBuild() {
  const pre = await status('before_build');
  if (!(pre.connections >= 1) || (!args['allow-unnamed'] && !named(pre))) {
    notes.push('build skipped: no holder of this server connected right before it');
    return log('build', {skipped: true});
  }
  log('build_start', {note: 'expect engine_busy before any swap; compiles first (minutes without a scratch build)'});
  const r = await run(process.execPath, [CLI, 'engine', 'build'], {timeoutMs: 40 * 60_000});
  const busy = /engine_busy/.test(r.stderr + r.stdout);
  const noop = /already this build|nothing to do/.test(r.stderr + r.stdout);
  log('build', {exit: r.code, signal: r.signal, busy, noop, stdout: r.stdout.split('\n').filter(Boolean), stderr: r.stderr.split('\n').filter(Boolean)});
  if (busy && r.code !== 0) notes.push('build refused engine_busy');
  else if (noop) notes.push('build was a no-op (installed bundle already this build): the busy refusal is unproven');
  else failures.push(`build did not refuse engine_busy (exit ${r.code})`);
  await status('after_build');
}

let verdictExtra = '';
try {
  const init = await request('initialize', {protocolVersion: '2025-11-25', capabilities: {elicitation: {}}, clientInfo: {name: 'live-end-task-237', version: '1'}}, 180_000);
  log('initialized', {serverInfo: init?.serverInfo, protocolVersion: init?.protocolVersion});
  send({jsonrpc: '2.0', method: 'notifications/initialized'});
  const tools = await request('tools/list', {});
  for (const name of ['js', 'end_task']) if (!tools?.tools?.some(t => t.name === name)) throw new Error(`tools/list has no ${name}`);

  baseline = await status('baseline');
  if (baseline.connections > 0) notes.push(`baseline: ${baseline.connections} other connection(s) before the check (${baseline.lines.find(l => l.startsWith('running:'))})`);
  if (baseline.connections === null) baseline = {...baseline, connections: 0};   // engine not running yet: cell 1 launches it

  if (await cell(1)) {
    const t1 = await tree('after_cell_1');
    ourPids = t1.pids;
    log('code_copy', {supervisor: t1.supervisor?.command ?? null, worktreeSupervisor: Boolean(t1.supervisor?.command.includes(join(REPO, 'src/repl-host/supervisor.mjs')))});
    if (!t1.supervisor?.command.includes(join(REPO, 'src/repl-host/supervisor.mjs'))) failures.push('the REPL host supervisor is not this worktree\'s');
    judgeHolder(await status('before_end_task_1', {supervisorPid: t1.supervisor?.pid ?? null}), 'before end_task 1');
    if (args['try-build']) await tryBuild();
  }
  await pollAfter(await endTask(1), 'after end_task 1');

  if (await cell(2)) {
    const t2 = await tree('after_cell_2');
    ourPids = t2.pids;
    judgeHolder(await status('before_end_task_2', {supervisorPid: t2.supervisor?.pid ?? null}), 'before end_task 2 (reconnected)');
  }
  await pollAfter(await endTask(2), 'after end_task 2');
} catch (error) {
  failures.push(`aborted: ${error.message}`);
  log('error', {message: error.message, stack: error.stack});
} finally {
  server.stdin.end();
  await Promise.race([exited, sleep(15_000)]);
  if (!serverExit) { log('server_kill', {signal: 'SIGTERM'}); server.kill('SIGTERM'); await Promise.race([exited, sleep(5_000)]); }
  await status('after_close');
  if (notes.length) verdictExtra = ` [${notes.join('; ')}]`;
  const verdict = failures.length ? `FAIL: ${failures.join('; ')}${verdictExtra}` : `PASS: holder ${notes.some(n => n.includes('unnamed')) ? 'counted (unnamed)' : `"${LABEL}" named`} before each end_task, ${baseline?.connections ?? 0} other connection(s) within ${WITHIN} ms after each, second cell reconnected${verdictExtra}`;
  log('verdict', {pass: !failures.length, failures, notes});
  out.end();
  process.stdout.write(`${verdict} (log ${resolve(args.out)})\n`);
  process.exitCode = failures.length ? 1 : 0;
}
