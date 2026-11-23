// Probe (task 57 fix 3, a private display): a REPL host supervisor SIGKILLed, and what of its tree is left after it.
// cua serve of checkout <root> with cua's engine; cell 1 holds Shift on the desktop route (XTEST), so the worker and the
// engine run. Then, by <mode>:
//   - held: cell 2 sleeps (admitted work) and cua serve is SIGKILLed, so its anchor exits, the supervisor's input ends
//     and (from T7b's fix on) it holds the worker's launcher while it drains; no teardown of cua serve's is coming;
//   - unheld: cua serve is stopped (SIGSTOP), so it cannot react, and nothing is held.
// Then the supervisor is SIGKILLed, and every process of the tree recorded before is listed with its state, 3 s later.
// usage: node probe-supervisor-kill.mjs <root> <engine> <xprobe> <held|unheld> <label>
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {performance} from 'node:perf_hooks';

const [root, engine, xprobe, mode, label] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keys = () => { try { return JSON.parse(execFileSync(xprobe, ['keys-down'], {encoding: 'utf8'})); } catch (e) { return `error ${e.message}`; } };
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
  if (/cua-engine/.test(r.args[0] ?? '')) return 'engine';
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
serve.stderr.on('data', () => {});
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
const held = await request('tools/call', {name: 'js', arguments: {code: "await cua.computer.key_down({key: 'shift'}); nodeRepl.write('held');", timeout_ms: 60000}});
console.log('cell 1', JSON.stringify(held).includes('held'), 'keys', JSON.stringify(keys()));
const tree = under(table(), serve.pid).filter(r => !['ps', 'pgrep'].includes(label_(r)));
console.log('tree', JSON.stringify(tree.map(r => [label_(r), r.pid, r.state])));
const supervisor = tree.find(r => label_(r) === 'supervisor');
const launcher = tree.find(r => label_(r) === 'worker-launcher');
if (mode === 'held') {
  request('tools/call', {name: 'js', arguments: {code: 'await new Promise((r) => setTimeout(r, 30000));', timeout_ms: 60000}});
  await sleep(300);
  process.kill(serve.pid, 'SIGKILL');
  console.log('cua serve SIGKILLed');
  for (let i = 0; launcher && i < 150 && stateOf(launcher.pid) !== 'T'; i++) await sleep(20);
  console.log('worker launcher before the kill:', launcher ? stateOf(launcher.pid) : 'none (sandbox disabled)');
} else {
  process.kill(serve.pid, 'SIGSTOP');
  console.log('cua serve stopped');
  await sleep(300);
}
const t0 = performance.now();
process.kill(supervisor.pid, 'SIGKILL');
console.log('supervisor SIGKILLed');
await sleep(3000);
const left = tree.map(r => [label_(r), r.pid, stateOf(r.pid)]).filter(([, , s]) => !['gone', 'Z', 'X'].includes(s));
console.log(`left after 3 s: ${JSON.stringify(left)}`);
console.log('keys after', JSON.stringify(keys()));
console.log('stopped after', JSON.stringify(table().filter(r => r.state === 'T' || r.state === 't').map(r => [r.pid, label_(r)])));
console.log(JSON.stringify({summary: label, mode, left: left.filter(([name]) => name !== 'anchor' || mode === 'held')}));
// cleanup: whatever is left, then cua serve
for (const [, pid] of left) try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
try { process.kill(serve.pid, 'SIGKILL'); } catch { /* gone */ }
try { execFileSync('xdotool', ['keyup', 'Shift_L']); } catch { /* none */ }
process.exit(0);
