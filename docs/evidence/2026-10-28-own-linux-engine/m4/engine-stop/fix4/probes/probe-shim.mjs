// Probe (task 57 fix 4, a private display): the resident launcher shim's regressions through cua serve. Cell 1 holds
// Shift on the desktop route (XTEST) and button 1 (a drag_handle started and moved, never ended), so the worker and the
// engine run. Then, by <mode>:
//   - held: cell 2 sleeps (admitted work) and cua serve is SIGKILLed, so its anchor exits, the supervisor's input ends
//     and it holds the worker's launcher while it drains; then the supervisor is SIGKILLed;
//   - unheld: cua serve is stopped (SIGSTOP), so it cannot react, and nothing is held; then the supervisor is SIGKILLed;
//   - worker: the trusted worker is SIGKILLed on its own (sandboxed, its PID namespace ends with it), the supervisor
//     and cua serve living on.
// 3 s later every process of the tree recorded before is listed with its state, and the keys and buttons the X server
// holds down are read.
// usage: node probe-shim.mjs <root> <engine> <xprobe> <held|unheld|worker> <label>
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {performance} from 'node:perf_hooks';

const [root, engine, xprobe, mode, label] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const probe = what => { try { return JSON.parse(execFileSync(xprobe, [what], {encoding: 'utf8'})); } catch (e) { return `error ${e.message}`; } };
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
function under(rows, top) {
  const set = new Set([top]);
  for (let changed = true; changed;) { changed = false; for (const r of rows) if (set.has(r.ppid) && !set.has(r.pid)) { set.add(r.pid); changed = true; } }
  return rows.filter(r => set.has(r.pid) && r.pid !== top);
}
const label_ = r => {
  const a = r.args.join(' ');
  if (/cua-engine/.test(r.args[0] ?? '')) return r.args[1] === 'launcher-shim' ? 'shim' : 'engine';
  if (/supervisor\.mjs/.test(a)) return 'supervisor';
  if (/anchor\.mjs/.test(a)) return 'anchor';
  if (/codex-linux-sandbox/.test(r.args[0] ?? '')) return /trusted-worker/.test(a) ? 'worker-launcher' : 'kernel-launcher';
  if (/bwrap/.test(r.args[0] ?? '')) return 'bwrap';
  if (/trusted-worker/.test(a)) return 'worker';
  if (/kernel\.mjs|kernel-main/.test(a)) return 'kernel';
  return (r.args[0] ?? '?').split('/').pop();
};
const stateOf = pid => { try { const s = readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2, s.lastIndexOf(')') + 3); } catch { return 'gone'; } };

const env = {...process.env, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: engine, CUA_SHIM_SURFACES: 'computer', CUA_SHIM_SECRETS: 'off', CUA_DESKTOP_MODE: 'dedicated', CUA_RUNTIME_IDLE_MS: '0'};
const serve = spawn(process.execPath, [`${root}/bin/cua.mjs`, 'serve'], {env, stdio: ['pipe', 'pipe', 'pipe']});
let serveErr = '';
serve.stderr.on('data', chunk => { serveErr += chunk; });
const waiters = new Map();
let id = 0;
createInterface({input: serve.stdout}).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method && msg.id !== undefined) { serve.stdin.write(JSON.stringify({jsonrpc: '2.0', id: msg.id, result: {action: 'accept', content: {}}}) + '\n'); return; }
  waiters.get(msg.id)?.(msg);
});
serve.stdin.on('error', () => {});
const request = (method, params) => new Promise(resolve => { const n = ++id; waiters.set(n, resolve); serve.stdin.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n'); });
await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'probe', version: '0'}});
serve.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
const cell = "await cua.computer.key_down({key: 'shift'}); const h = cua.computer.drag_handle(); await h.start({x: 200, y: 200}); await h.move_to({x: 320, y: 260}); nodeRepl.write('held');";
const held = await request('tools/call', {name: 'js', arguments: {code: cell, timeout_ms: 60000}});
console.log('cell 1', JSON.stringify(held).includes('held'), 'keys', JSON.stringify(probe('keys-down')), 'buttons', JSON.stringify(probe('buttons-down')));
if (!JSON.stringify(held).includes('held')) console.log('cell 1 answer', JSON.stringify(held).slice(0, 600));
const tree = under(table(), serve.pid).filter(r => !['ps', 'pgrep'].includes(label_(r)));
console.log('tree', JSON.stringify(tree.map(r => [label_(r), r.pid, r.state])));
const supervisor = tree.find(r => label_(r) === 'supervisor');
const launcher = tree.find(r => label_(r) === 'worker-launcher');
const worker = tree.find(r => label_(r) === 'worker');
let t0 = performance.now();
if (mode === 'held') {
  request('tools/call', {name: 'js', arguments: {code: 'await new Promise((r) => setTimeout(r, 30000));', timeout_ms: 60000}});
  await sleep(300);
  process.kill(serve.pid, 'SIGKILL');
  console.log('cua serve SIGKILLed');
  for (let i = 0; launcher && i < 150 && stateOf(launcher.pid) !== 'T'; i++) await sleep(20);
  console.log('worker launcher before the kill:', launcher ? stateOf(launcher.pid) : 'none (sandbox disabled)');
  t0 = performance.now();
  process.kill(supervisor.pid, 'SIGKILL');
  console.log('supervisor SIGKILLed');
} else if (mode === 'unheld') {
  process.kill(serve.pid, 'SIGSTOP');
  console.log('cua serve stopped');
  await sleep(300);
  t0 = performance.now();
  process.kill(supervisor.pid, 'SIGKILL');
  console.log('supervisor SIGKILLed');
} else {
  if (mode === 'worker-busy') {
    // the engine inside a request that runs far longer (655 wheel steps of 36 ms): its stdin's end waits for it
    request('tools/call', {name: 'js', arguments: {code: "await cua.computer.scroll({x: 400, y: 300, direction: 'down', pixels: 65535});", timeout_ms: 60000}});
    await sleep(800);
  }
  t0 = performance.now();
  process.kill(worker.pid, 'SIGKILL');
  console.log('worker SIGKILLed');
}
const engineRow = tree.find(r => label_(r) === 'engine');
for (let i = 0; engineRow && i < 300 && !['gone', 'Z'].includes(stateOf(engineRow.pid)); i++) await sleep(5);
console.log(`engine gone after ${Math.round(performance.now() - t0)} ms`);
for (const at of [0, 50, 200, 1000]) {
  while (performance.now() - t0 < at) await sleep(5);
  console.log(`+${Math.round(performance.now() - t0)} ms keys ${JSON.stringify(probe('keys-down'))} buttons ${JSON.stringify(probe('buttons-down'))}`);
}
await sleep(2000);
const left = tree.map(r => [label_(r), r.pid, stateOf(r.pid)]).filter(([, , s]) => !['gone', 'Z', 'X'].includes(s));
const expected = mode.startsWith('worker') ? ['anchor', 'supervisor', 'kernel-launcher', 'kernel', 'bwrap'] : mode === 'unheld' ? ['anchor'] : [];
console.log(`left after 3 s: ${JSON.stringify(left)}`);
const keys = probe('keys-down');
const buttons = probe('buttons-down');
console.log('keys after', JSON.stringify(keys), 'buttons after', JSON.stringify(buttons));
console.log('stopped after', JSON.stringify(table().filter(r => r.state === 'T' || r.state === 't').map(r => [r.pid, label_(r)])));
const released = serveErr.split('\n').filter(l => l.includes('launcher-shim:'));
console.log('shim said', JSON.stringify(released.map(l => l.replace(/^.*(launcher-shim:)/, '$1'))));
console.log(JSON.stringify({summary: label, mode, left: left.filter(([name]) => !expected.includes(name)), keys, buttons}));
// cleanup: whatever is left, then cua serve
for (const [, pid] of left) try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
try { process.kill(serve.pid, 'SIGKILL'); } catch { /* gone */ }
try { execFileSync('xdotool', ['keyup', 'Shift_L', 'mouseup', '1']); } catch { /* none */ }
process.exit(0);
