// Probe (task 57 fix, run under xvfb-run, a private display): what an EOF teardown that admitted work holds back does to
// the engine. cua serve with cua's engine; cell 1 holds Shift on the desktop route (XTEST); cell 2 sleeps (admitted
// work) and is not awaited; then stdin closes. Every 20 ms: whether the engine, the supervisor and the outer sandbox
// launcher still run, and the keys the server holds down. usage: node probe-admitted.mjs <root> <engine> <xprobe> [sleep ms]
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {performance} from 'node:perf_hooks';

const [root, engine, xprobe, sleepArg] = process.argv.slice(2);
const sleepMs = Number(sleepArg ?? 6000);
const env = {...process.env, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: engine, CUA_SHIM_SURFACES: 'computer', CUA_SHIM_SECRETS: 'off', CUA_DESKTOP_MODE: 'dedicated', CUA_RUNTIME_IDLE_MS: '0'};
const child = spawn(process.execPath, [`${root}/bin/cua.mjs`, 'serve'], {env, stdio: ['pipe', 'pipe', 'pipe']});
let stderr = '';
child.stderr.on('data', d => { stderr += d; });
const waiters = new Map();
let id = 0;
createInterface({input: child.stdout}).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.method && msg.id !== undefined) {
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: msg.id, result: {action: 'accept', content: {}}}) + '\n');
    return;
  }
  waiters.get(msg.id)?.(msg);
});
const request = (method, params) => new Promise(resolve => { const n = ++id; waiters.set(n, resolve); child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n'); });
const text = reply => (reply?.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
const keys = () => { try { return JSON.parse(execFileSync(xprobe, ['keys-down'], {encoding: 'utf8'})); } catch (e) { return `error ${e.message}`; } };

function table() {
  const rows = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const args = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').filter(Boolean);
      rows.push({pid: Number(name), state: rest[0], ppid: Number(rest[1]), pgid: Number(rest[2]), args});
    } catch { /* gone */ }
  }
  return rows;
}
function under(rows, top) {
  const set = new Set([top]);
  for (let changed = true; changed;) { changed = false; for (const r of rows) if (set.has(r.ppid) && !set.has(r.pid)) { set.add(r.pid); changed = true; } }
  return rows.filter(r => set.has(r.pid) && r.pid !== top);
}
const label = r => {
  const a = r.args.join(' ');
  if (/cua-engine$/.test(r.args[0] ?? '') || /cua-engine/.test(r.args[0] ?? '')) return 'engine';
  if (/supervisor\.mjs/.test(a)) return 'supervisor';
  if (/trusted-worker/.test(a)) return 'worker';
  if (/kernel\.mjs|kernel-main/.test(a)) return 'kernel';
  if (/anchor\.mjs/.test(a)) return 'anchor';
  if (/^bwrap/.test(r.args[0] ?? '') || /bwrap$/.test(r.args[0] ?? '')) return 'bwrap';
  if (/codex-linux-sandbox/.test(r.args[0] ?? '')) return 'sandbox';
  return (r.args[0] ?? '?').split('/').pop();
};

const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'probe', version: '0'}});
console.log('init', Boolean(init.result));
child.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
const held = await request('tools/call', {name: 'js', arguments: {code: "await cua.computer.key_down({key: 'shift'}); nodeRepl.write('held');", timeout_ms: 60000}});
console.log('cell 1', text(held).slice(-200));
console.log('keys before', JSON.stringify(keys()));
const rows0 = under(table(), child.pid);
console.log('tree', JSON.stringify(rows0.map(r => [label(r), r.pid, r.ppid, r.pgid])));
for (const r of rows0) { try { const st = readFileSync(`/proc/${r.pid}/status`, 'utf8'); const f = k => (st.match(new RegExp(`^${k}:\\s*(\\S+)`, 'm')) ?? [])[1]; console.log('sig', label(r), r.pid, 'SigBlk', f('SigBlk'), 'SigIgn', f('SigIgn'), 'SigCgt', f('SigCgt')); } catch {} }
if (process.env.CMDLINE_OUT) {
  const sup = rows0.find(r => label(r) === 'supervisor');
  const outer = rows0.find(r => label(r) === 'worker' && r.ppid === sup.pid);
  (await import('node:fs')).writeFileSync(process.env.CMDLINE_OUT, JSON.stringify(outer.args));
}
if (process.env.STRACE_OUT) {
  const sup = rows0.find(r => label(r) === 'supervisor');
  const outer = rows0.find(r => label(r) === 'worker' && r.ppid === sup.pid);
  const traced = process.env.STRACE_WHO === 'engine' ? rows0.find(r => label(r) === 'engine') : outer;
  const st = spawn('strace', ['-tt', '-e', 'trace=exit_group,kill,tgkill', '-o', process.env.STRACE_OUT, '-p', String(traced.pid)], {stdio: ['ignore', 'ignore', 'pipe']});
  st.stderr.on('data', d => process.stderr.write(`[strace] ${d}`));
  await new Promise(r => setTimeout(r, 500));
}
if (process.env.KILL_WORKER) {
  // the worker ends on its own (as process.exit would end it): the node whose child is the engine
  const engineRow = rows0.find(r => label(r) === 'engine');
  const t1 = performance.now();
  process.kill(engineRow.ppid, process.env.KILL_WORKER);
  console.log('killed the worker', engineRow.ppid, 'with', process.env.KILL_WORKER);
  let lastLine = '';
  while (performance.now() - t1 < 4000) {
    const line = `${under(table(), child.pid).map(r => label(r)).sort().join(',')} keys=${JSON.stringify(keys())}`;
    if (line !== lastLine) { console.log(`+${(performance.now() - t1).toFixed(0)} ms`, line); lastLine = line; }
    await new Promise(r => setTimeout(r, 20));
  }
  console.log('keys after the worker\'s end', JSON.stringify(keys()));
  child.stdin.end();
  console.log('serve exit', JSON.stringify(await new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal})))));
  process.exit(0);
}
request('tools/call', {name: 'js', arguments: {code: process.env.CELL2 ?? `await new Promise(r => setTimeout(r, ${sleepMs})); nodeRepl.write('slept');`, timeout_ms: 60000}}).then(r => console.log('cell 2 answered', performance.now().toFixed(0), text(r).slice(-120)));
await new Promise(r => setTimeout(r, 300));
const t0 = performance.now();
const stopAt = 20000;
child.stdin.end();
console.log('eof at', t0.toFixed(0));
let last = '';
const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal})));
let done = false;
exited.then(() => { done = true; });
while (!done && performance.now() - t0 < stopAt) {
  const alive = under(table(), child.pid).map(r => `${label(r)}${r.state === 'T' ? '(T)' : r.state === 'Z' ? '(Z)' : ''}`).sort().join(',');
  const k = JSON.stringify(keys());
  const line = `${alive} keys=${k}`;
  if (line !== last) { console.log(`+${(performance.now() - t0).toFixed(0)} ms`, line); last = line; }
  await new Promise(r => setTimeout(r, 20));
}
console.log('serve exit', JSON.stringify(await exited), `+${(performance.now() - t0).toFixed(0)} ms`);
console.log('keys after', JSON.stringify(keys()));
console.log('stopped after', JSON.stringify(table().filter(r => r.state === 'T' || r.state === 't').map(r => [r.pid, (r.args[0] ?? '').split('/').pop()])));
console.log('stderr tail', stderr.slice(-1500));
