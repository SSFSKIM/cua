// Probe (task 57 fix 2, a private display): the engine's forced exit, measured. Each trial starts the engine, holds a
// drag_handle's button 1 and Shift at the server (XTEST), starts a desktop scroll far longer than the backstop, then
// sends SIGTERM inside it: the backstop (B) ends the engine, its forced release first. R, the release's own time, is the
// exit's time after the signal less B. After each exit the keys and buttons the server holds are read.
// usage: node probe-forced.mjs <engine> <xprobe> <trials> <label>
import {execFileSync, spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {performance} from 'node:perf_hooks';
import {loadavg} from 'node:os';

const [engine, xprobe, trialsArg, label] = process.argv.slice(2);
const trials = Number(trialsArg ?? 20);
const B = 1000;
const read = what => JSON.parse(execFileSync(xprobe, [what], {encoding: 'utf8'}));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// a client of the probe's own, held throughout: xvfb-run's server resets its state once its last client leaves
const holder = spawn(xprobe, ['selection-watch', 'PRIMARY'], {stdio: ['pipe', 'ignore', 'ignore']});
await sleep(300);

const rows = [];
for (let i = 0; i < trials; i++) {
  const child = spawn(engine, ['server'], {stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const waiters = new Map();
  createInterface({input: child.stdout}).on('line', line => { const m = JSON.parse(line); waiters.get(m.id)?.(m); });
  let id = 0;
  const request = (command, input, wait = true) => {
    const n = ++id;
    const answered = wait ? new Promise(resolve => waiters.set(n, resolve)) : null;
    child.stdin.write(JSON.stringify({id: n, command, input}) + '\n');
    return answered;
  };
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal, at: performance.now()})));
  const a = await request('drag_handle', {action: 'start', x: 200, y: 200});
  const b = await request('key_down', {key: 'shift'});
  const before = {keys: read('keys-down'), buttons: read('buttons-down')};
  request('scroll', {direction: 'down', pixels: 65535}, false);
  await sleep(300);
  const t0 = performance.now();
  child.kill('SIGTERM');
  const exit = await exited;
  const after = {keys: read('keys-down'), buttons: read('buttons-down')};
  const ms = exit.at - t0;
  rows.push({label, trial: i, ok_before: a.ok && b.ok, before, after, exit_code: exit.code, exit_ms: Math.round(ms * 10) / 10, release_ms: Math.round((ms - B) * 10) / 10, stderr: stderr.slice(-300)});
  console.log(JSON.stringify(rows.at(-1)));
  // whatever a trial left down released, so the next starts clean
  if (after.keys.length) execFileSync('xdotool', ['keyup', 'Shift_L']);
  if (after.buttons.length) execFileSync('xdotool', ['mouseup', '1']);
  await sleep(100);
}
holder.kill();
const r = rows.map(x => x.release_ms).sort((x, y) => x - y);
const q = p => r[Math.min(r.length - 1, Math.floor(p * r.length))];
console.log(JSON.stringify({summary: label, trials, loadavg: loadavg(), released_all: rows.every(x => x.after.keys.length === 0 && x.after.buttons.length === 0),
  held_before_all: rows.every(x => x.before.keys.length > 0 && x.before.buttons.includes(1)), release_ms: {min: r[0], p50: q(0.5), p90: q(0.9), max: r.at(-1)}}));
