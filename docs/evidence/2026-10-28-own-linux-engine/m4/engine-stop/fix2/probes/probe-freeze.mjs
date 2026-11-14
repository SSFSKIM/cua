// Probe (task 57 fix 2, a private display): the REPL host's freeze F, measured on the real trusted worker's tree. Each
// trial starts cua serve with cua's engine (sandboxed unless CUA_SHIM_SANDBOX says otherwise), holds Shift on the desktop
// route (XTEST), then calls the REPL host's own stop, kernel-child.mjs stopProcessTree, on the worker's tree (its
// launcher, or with the sandbox disabled the worker itself), as the supervisor's stop of the worker does, with every
// signal and the engine's exit timed: F is the time from the stop's start to the engine's SIGTERM; D the engine's exit
// after it. The keys the server holds are read after the stop.
// usage: node probe-freeze.mjs <root> <engine> <xprobe> <trials> <label>
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {performance} from 'node:perf_hooks';
import {loadavg} from 'node:os';

const [root, engine, xprobe, trialsArg, label] = process.argv.slice(2);
const {stopProcessTree, processExited, runsExecutable} = await import(`${root}/src/repl-host/kernel-child.mjs`);
const trials = Number(trialsArg ?? 20);
const keys = () => JSON.parse(execFileSync(xprobe, ['keys-down'], {encoding: 'utf8'}));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function table() {
  const rows = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const args = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').filter(Boolean);
      rows.push({pid: Number(name), state: rest[0], ppid: Number(rest[1]), args});
    } catch { /* gone */ }
  }
  return rows;
}
const parentOf = rows => new Map(rows.map(r => [r.pid, r.ppid]));
const chain = (rows, pid) => { const up = parentOf(rows); const out = []; for (let p = pid; p > 1 && out.length < 64; p = up.get(p)) out.push(p); return out; };

const holder = spawn(xprobe, ['selection-watch', 'PRIMARY'], {stdio: ['pipe', 'ignore', 'ignore']});
await sleep(300);
const out = [];
for (let i = 0; i < trials; i++) {
  const env = {...process.env, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: engine, CUA_SHIM_SURFACES: 'computer', CUA_SHIM_SECRETS: 'off', CUA_DESKTOP_MODE: 'dedicated', CUA_RUNTIME_IDLE_MS: '0'};
  const child = spawn(process.execPath, [`${root}/bin/cua.mjs`, 'serve'], {env, stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const waiters = new Map();
  let id = 0;
  createInterface({input: child.stdout}).on('line', line => {
    const msg = JSON.parse(line);
    if (msg.method && msg.id !== undefined) { child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: msg.id, result: {action: 'accept', content: {}}}) + '\n'); return; }
    waiters.get(msg.id)?.(msg);
  });
  const request = (method, params) => new Promise(resolve => { const n = ++id; waiters.set(n, resolve); child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n'); });
  await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'probe', version: '0'}});
  child.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
  const held = await request('tools/call', {name: 'js', arguments: {code: "await cua.computer.key_down({key: 'shift'}); nodeRepl.write('held');", timeout_ms: 60000}});
  const row = {label, trial: i, held: JSON.stringify(held).includes('held'), keys_before: keys()};
  const rows = table();
  const engines = rows.filter(r => runsExecutable(r.pid, engine) && chain(rows, r.pid).includes(child.pid));
  const supervisor = rows.find(r => r.args.some(a => a.endsWith('repl-host/supervisor.mjs')) && chain(rows, r.pid).includes(child.pid));
  if (engines.length !== 1 || !supervisor) { row.error = `engines ${engines.length}, supervisor ${Boolean(supervisor)}`; }
  else {
    // the supervisor's child the engine descends from: the worker's launcher (the tree the supervisor stops)
    const up = chain(rows, engines[0].pid);
    const top = up[up.indexOf(supervisor.pid) - 1];
    row.tree = rows.filter(r => chain(rows, r.pid).includes(top)).length;
    const marks = [];
    const t0 = performance.now();
    const signal = (pid, name) => { marks.push([name, pid, performance.now() - t0]); try { process.kill(pid, name); return true; } catch { return false; } };
    let exitedAt = null;
    const exited = pid => { const gone = processExited(pid); if (gone && exitedAt === null) exitedAt = performance.now() - t0; return gone; };
    await stopProcessTree(top, {engine, signal, exited});
    const term = marks.find(([n, pid]) => n === 'SIGTERM' && pid === engines[0].pid);
    const lastStop = marks.filter(([n]) => n === 'SIGSTOP').at(-1);
    row.freeze_ms = Math.round(lastStop[2] * 10) / 10;
    row.f_ms = Math.round(term[2] * 10) / 10;
    row.drain_ms = exitedAt === null ? null : Math.round((exitedAt - term[2]) * 10) / 10;
    row.stopped = marks.filter(([n]) => n === 'SIGSTOP').length;
  }
  row.keys_after = keys();
  child.stdin.end();
  await new Promise(resolve => child.once('exit', resolve));
  row.stopped_left = table().filter(r => r.state === 'T' || r.state === 't').map(r => [r.pid, (r.args[0] ?? '').split('/').pop()]);
  if (row.keys_after.length) execFileSync('xdotool', ['keyup', 'Shift_L']);
  out.push(row);
  console.log(JSON.stringify(row));
}
holder.kill();
const sorted = key => out.map(r => r[key]).filter(Number.isFinite).sort((a, b) => a - b);
const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const sum = key => { const xs = sorted(key); return {min: xs[0], p50: q(xs, 0.5), p90: q(xs, 0.9), max: xs.at(-1)}; };
console.log(JSON.stringify({summary: label, trials, loadavg: loadavg(), errors: out.filter(r => r.error).length, released_all: out.every(r => r.keys_after.length === 0),
  held_before_all: out.every(r => r.keys_before.length > 0), stopped_left: out.flatMap(r => r.stopped_left), f_ms: sum('f_ms'), drain_ms: sum('drain_ms')}));
