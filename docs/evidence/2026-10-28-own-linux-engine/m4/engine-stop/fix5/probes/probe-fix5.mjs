// Probe (task 57 fix 5, a private display): the re-review's findings through cua serve. By <mode>:
//   - reach: cell 1 holds Shift and button 1, so the worker and the engine run; then every process on the machine that
//     holds a descriptor of the record's pipe (the shim's read end's pipe) is listed with its role, the descriptor and
//     whether it is close-on-exec, and a cell lists what model code can see: its own descriptors and the FIFOs under
//     the session's temporary directory (fix 4's record was one).
//   - forge: another XTEST client (xdotool) holds Shift; cell 1 makes the engine run without holding anything; a cell
//     (model code) writes a record naming Shift, in fix 4's layout and in fix 5's, into every FIFO under the session's
//     temporary directory, and drains them first; then the trusted worker is SIGKILLed, so the shim acts.
//   - busy: a recorder window (xprobe record) covers the screen; cell 1 holds Shift and button 1; cell 2 scrolls far
//     longer than the probe (655 wheel steps of 36 ms) and the supervisor is SIGKILLed during it. Every wheel press the
//     recorder receives is timed, with the engine's end and the shim's, polled every 2 ms.
// usage: node probe-fix5.mjs <root> <engine> <xprobe> <reach|forge|busy> <label>
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync, readdirSync, readlinkSync} from 'node:fs';
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
const role = r => {
  const a = r.args.join(' ');
  if (/cua-engine/.test(r.args[0] ?? '')) return r.args[1] === 'launcher-shim' ? 'shim' : 'engine';
  if (/supervisor\.mjs/.test(a)) return 'supervisor';
  if (/anchor\.mjs/.test(a)) return 'anchor';
  if (/codex-linux-sandbox/.test(r.args[0] ?? '')) return /trusted-worker/.test(a) ? 'worker-launcher' : 'kernel-launcher';
  if (/bwrap/.test(r.args[0] ?? '')) return /trusted-worker/.test(a) ? 'worker-bwrap' : 'kernel-bwrap';
  if (/trusted-worker/.test(a)) return 'worker';
  if (/kernel\.mjs|kernel-main/.test(a)) return 'kernel';
  if (/cua\.mjs serve/.test(a)) return 'cua-serve';
  return (r.args[0] ?? '?').split('/').pop();
};
const stateOf = pid => { try { const s = readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2, s.lastIndexOf(')') + 3); } catch { return 'gone'; } };
const gone = pid => ['gone', 'Z', 'X'].includes(stateOf(pid));
const fds = pid => { try { return readdirSync(`/proc/${pid}/fd`).map(fd => { try { return [Number(fd), readlinkSync(`/proc/${pid}/fd/${fd}`)]; } catch { return null; } }).filter(Boolean); } catch { return []; } };
const cloexec = (pid, fd) => { try { return (parseInt(readFileSync(`/proc/${pid}/fdinfo/${fd}`, 'utf8').match(/flags:\s+(\d+)/)[1], 8) & 0o2000000) !== 0; } catch { return null; } };

const recorder = mode === 'busy' ? spawn(xprobe, ['record', '0', '0', '1280', '800'], {stdio: ['pipe', 'pipe', 'inherit']}) : null;
const events = [];
let t0 = performance.now();
if (recorder) {
  const ready = new Promise(resolve => createInterface({input: recorder.stdout}).on('line', line => {
    const at = performance.now();
    let event; try { event = JSON.parse(line); } catch { return; }
    if (event.ready !== undefined) resolve();
    else events.push({at, ...event});
  }));
  await ready;
}

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
const cell = (code, timeout_ms = 60000) => request('tools/call', {name: 'js', arguments: {code, timeout_ms}});
const text = answer => JSON.stringify(answer?.result?.content ?? answer);
await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'probe', version: '0'}});
serve.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
const shiftCode = Number(execFileSync('sh', ['-c', "xmodmap -pke | awk '$4 == \"Shift_L\" {print $2; exit}'"], {encoding: 'utf8'}).trim()) || 50;

if (mode === 'forge') {
  execFileSync('xdotool', ['keydown', 'Shift_L']);
  console.log('another client holds Shift: keys', JSON.stringify(probe('keys-down')));
  const one = await cell("await cua.computer.key_down({key: 'a'}); await cua.computer.key_up({key: 'a'}); nodeRepl.write('ran');");
  console.log('cell 1', text(one).includes('ran'), 'keys', JSON.stringify(probe('keys-down')));
} else {
  const one = await cell("await cua.computer.key_down({key: 'shift'}); const h = cua.computer.drag_handle(); await h.start({x: 200, y: 200}); await h.move_to({x: 320, y: 260}); nodeRepl.write('held');");
  console.log('cell 1', text(one).includes('held'), 'keys', JSON.stringify(probe('keys-down')), 'buttons', JSON.stringify(probe('buttons-down')));
}
const tree = under(table(), serve.pid).filter(r => !['ps', 'pgrep'].includes(role(r)));
console.log('tree', JSON.stringify(tree.map(r => [role(r), r.pid, r.state])));
const find = name => tree.find(r => role(r) === name);
const [shim, worker, supervisor, engineRow] = ['shim', 'worker', 'supervisor', 'engine'].map(find);
const sessionTmp = (() => { try { return readFileSync(`/proc/${worker.pid}/environ`, 'utf8').split('\0').find(v => v.startsWith('TMPDIR='))?.slice(7); } catch { return null; } })();
console.log('the session\'s tmp', JSON.stringify(sessionTmp?.replace(process.env.HOME, '~')));
// what the record's pipe is: the shim's one pipe beyond its stdio (fix 5); fix 4 had a FIFO in the session's tmp
const record = fds(shim.pid).find(([fd, to]) => fd > 2 && to.startsWith('pipe:'))?.[1] ?? null;
console.log('the shim\'s record', JSON.stringify(record), 'its descriptors', JSON.stringify(fds(shim.pid).map(([fd, to]) => [fd, to.replace(process.env.HOME, '~')])));

// what model code can do with the session's tmp: find FIFOs; with `records`, drain them and write those records
const modelCell = records => `
const fs = await import('node:fs'); const path = await import('node:path');
const found = []; const errors = [];
const walk = dir => { let names = []; try { names = fs.readdirSync(dir, {withFileTypes: true}); } catch (e) { errors.push(dir + ' ' + e.code); return; }
  for (const d of names) { const p = path.join(dir, d.name); if (d.isDirectory()) walk(p); else if (d.isFIFO()) found.push(p); } };
walk(${JSON.stringify(sessionTmp)});
const own = fs.readdirSync('/proc/self/fd').map(n => { try { return n + '->' + fs.readlinkSync('/proc/self/fd/' + n); } catch { return n; } });
const wrote = [];
for (const p of found) {
  ${records ? `try { const r = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK); const b = Buffer.alloc(65536); try { while (fs.readSync(r, b) > 0); } catch {} fs.closeSync(r); } catch (e) { errors.push('drain ' + e.code); }
  try { const w = fs.openSync(p, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); for (const rec of ${JSON.stringify(records)}) fs.writeSync(w, Buffer.from(rec, 'base64')); fs.closeSync(w); wrote.push(p); } catch (e) { errors.push('write ' + e.code); }` : ''}
}
nodeRepl.write(JSON.stringify({found, wrote, errors, own}));`;
const forged = keys => {
  const listed = Buffer.alloc(128); listed.write('cuaH'); listed[4] = 1; listed[5] = keys.length; keys.forEach((k, i) => { listed[8 + 2 * i] = 1; listed[9 + 2 * i] = k; });
  const bitmap = Buffer.alloc(72); bitmap.write('cuaH'); bitmap[4] = 2; for (const k of keys) bitmap[8 + (k >> 3)] |= 1 << (k & 7);
  return [listed.toString('base64'), bitmap.toString('base64')];
};
const home = s => s.replaceAll(process.env.HOME, '~');

if (mode === 'reach') {
  const holders = [];
  if (record) for (const r of table()) for (const [fd, to] of fds(r.pid)) if (to === record) holders.push([role(r), r.pid, fd, cloexec(r.pid, fd) ? 'cloexec' : 'inherited']);
  console.log('holders of the record', JSON.stringify(holders));
  const kernels = tree.filter(r => /^kernel/.test(role(r)));
  console.log('kernel side holds it', JSON.stringify(kernels.map(r => [role(r), r.pid, fds(r.pid).filter(([, to]) => to === record).length])));
  const seen = await cell(modelCell(null));
  console.log('model code sees', home(text(seen)).slice(0, 1500));
} else if (mode === 'forge') {
  const said = await cell(modelCell(forged([shiftCode])));
  console.log('model code forged', home(text(said)).slice(0, 1200));
  t0 = performance.now();
  process.kill(worker.pid, 'SIGKILL');
  console.log('worker SIGKILLed');
  for (let i = 0; i < 600 && !gone(shim.pid) && !gone(engineRow.pid); i++) await sleep(5);
  await sleep(2500);
  const keys = probe('keys-down');
  console.log('keys after 2.5 s', JSON.stringify(keys), 'Shift still held by the other client:', Array.isArray(keys) && keys.includes(shiftCode));
} else if (mode === 'busy') {
  cell("await cua.computer.scroll({x: 400, y: 300, direction: 'down', pixels: 65535});");
  await sleep(800);
  const before = events.filter(e => e.type === 'ButtonPress' && e.detail === 5).length;
  t0 = performance.now();
  process.kill(supervisor.pid, 'SIGKILL');
  console.log(`supervisor SIGKILLed; wheel presses before: ${before}`);
  let engineGone = null, shimGone = null;
  while (performance.now() - t0 < 4000 && (engineGone === null || shimGone === null)) {
    if (engineGone === null && gone(engineRow.pid)) engineGone = performance.now() - t0;
    if (shimGone === null && gone(shim.pid)) shimGone = performance.now() - t0;
    await sleep(2);
  }
  await sleep(1000);
  const presses = events.filter(e => e.type === 'ButtonPress' && e.detail === 5).map(e => Math.round(e.at - t0)).filter(at => at >= 0);
  console.log(`engine gone at +${Math.round(engineGone)} ms, shim gone at +${Math.round(shimGone)} ms`);
  console.log(`wheel presses after the SIGKILL, at (ms): ${JSON.stringify(presses)}`);
  const afterShim = presses.filter(at => at > shimGone);
  console.log(JSON.stringify({ordering: label, engine_before_shim: engineGone !== null && engineGone <= shimGone, last_press: presses.at(-1) ?? null, presses_after_shim: afterShim.length,
    keys: probe('keys-down'), buttons: probe('buttons-down')}));
}
const left = tree.map(r => [role(r), r.pid, stateOf(r.pid)]).filter(([, , s]) => !['gone', 'Z', 'X'].includes(s));
console.log('left', JSON.stringify(left));
const shimSaid = serveErr.split('\n').filter(l => l.includes('launcher-shim:'));
console.log('shim said', JSON.stringify(shimSaid.map(l => l.replace(/^.*(launcher-shim:)/, '$1'))));
for (const [, pid] of left) try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
try { process.kill(serve.pid, 'SIGKILL'); } catch { /* gone */ }
try { recorder?.stdin.end(); } catch { /* gone */ }
try { execFileSync('xdotool', ['keyup', 'Shift_L', 'mouseup', '1']); } catch { /* none */ }
process.exit(0);
