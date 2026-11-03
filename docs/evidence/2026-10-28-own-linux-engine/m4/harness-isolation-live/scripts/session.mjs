// Task 46's private-display session (#171 M4): a private X server through the harness's own `startPrivateServer`
// (Xvfb -displayfd, the watchdog from its first client on, guarding the server, then the private mark), Openbox, and
// an xterm standing for the person's window, active at the start. Then each phase runs as a harness driver
// (driver.mjs) on that display, and after each one the session looks for anything of the run left behind. Never :0.
// usage: node session.mjs <out> <phase...>   (phases: families, sigterm)

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIVE = '/Users/new/.local/share/cua-171/live-43';
const { startPrivateServer, PRIVATE_MARK } = await import(join(LIVE, 'scripts/linux-engine-diff/xtools.mjs'));
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
const phases = process.argv.slice(3);
const log = (row) => appendFileSync(join(out, 'session.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), ...row })}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function procs() {
  const all = new Map();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const s = readFileSync(`/proc/${d}/stat`, 'utf8');
      const r = s.lastIndexOf(')');
      const f = s.slice(r + 2).split(' ');
      all.set(Number(d), { pid: Number(d), comm: s.slice(s.indexOf('(') + 1, r), ppid: Number(f[1]), pgid: Number(f[2]) });
    } catch {
      // gone
    }
  }
  return all;
}
function descendants(root, all = procs()) {
  const kids = new Map();
  for (const p of all.values()) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p.pid]);
  const outp = [];
  const stack = [...(kids.get(root) ?? [])];
  while (stack.length) {
    const p = stack.pop();
    outp.push(all.get(p));
    stack.push(...(kids.get(p) ?? []));
  }
  return outp;
}
const argv = (pid) => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ').slice(0, 300);
  } catch {
    return null;
  }
};
const x = (env, cmd, args) => {
  try {
    return execFileSync(cmd, args, { env, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return `error: ${String(e.stderr || e.message).trim().slice(0, 200)}`;
  }
};
const socketStat = (path) => {
  try {
    const s = statSync(path);
    return { ino: s.ino, mtime: s.mtime.toISOString(), ctime: s.ctime.toISOString() };
  } catch {
    return null;
  }
};

const server = await startPrivateServer({ out });
const display = server.display;
const N = display.slice(1);
// an authority file of the session's own, with an entry for the display (the server checks none): without one the
// harness's trace copies the person's ~/.Xauthority and xtrace cannot parse the copy for this display
const auth = join(out, 'Xauthority');
writeFileSync(auth, '', { mode: 0o600 });
execFileSync('xauth', ['-q', '-f', auth, 'add', display, '.', execFileSync('mcookie', { encoding: 'utf8' }).trim()]);
const env = { ...process.env, DISPLAY: display, XAUTHORITY: auth };
log({ kind: 'server', display, pid: server.pid, mark: x(env, 'xprop', ['-root', PRIVATE_MARK]), at_spi_bus_root: x(env, 'xprop', ['-root', 'AT_SPI_BUS']), bus_0: socketStat('/run/user/501/at-spi/bus_0'), bus_N: socketStat(`/run/user/501/at-spi/bus_${N}`) });
const side = [];
const wm = spawn('openbox', [], { env, stdio: 'ignore' });
side.push(wm);
for (let i = 0; i < 50 && !/window id/.test(x(env, 'xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'])); i++) await sleep(100);
const person = spawn('xterm', ['-T', 'person', '-e', 'sleep', '100000'], { env, stdio: 'ignore' });
side.push(person);
let personId = '';
for (let i = 0; i < 100 && !/^\d+$/.test(personId); i++) {
  personId = x(env, 'xdotool', ['search', '--name', '^person$']).split('\n')[0];
  await sleep(100);
}
x(env, 'xdotool', ['windowactivate', '--sync', personId]);
log({ kind: 'setup', openbox: wm.pid, person_pid: person.pid, person_window: personId, active: x(env, 'xdotool', ['getactivewindow']), env: { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS, AT_SPI_BUS_ADDRESS: process.env.AT_SPI_BUS_ADDRESS } });

let current = null;
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
  if (current) current.kill('SIGTERM');
});

const sideAndServer = new Set([...side.map((c) => c.pid), server.pid]);
let failed = false;
for (const phase of phases) {
  if (stopping) break;
  const started = Date.now();
  const child = spawn(process.execPath, [join(here, 'driver.mjs'), phase, out, display], { env, stdio: ['ignore', 'inherit', 'inherit'] });
  current = child;
  writeFileSync(join(out, 'driver.pid'), String(child.pid));
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  let sigterm = null;
  if (phase === 'sigterm') {
    // the SIGTERM lands while begin starts the run's session bus: once at-spi-bus-launcher (activated by the start's
    // GetAddress call) is a descendant of the driver, before the start has answered
    let done = false;
    exited.then(() => (done = true));
    for (;;) {
      if (done) break;
      const tree = descendants(child.pid);
      const launcher = tree.find((p) => p.comm === 'at-spi-bus-laun');
      if (launcher) {
        const daemon = tree.find((p) => p.comm === 'dbus-daemon' && /session\.conf/.test(argv(p.pid) ?? ''));
        process.kill(child.pid, 'SIGTERM');
        sigterm = { at_ms: Date.now() - started, launcher: { pid: launcher.pid, pgid: launcher.pgid, argv: argv(launcher.pid) }, session_daemon: daemon ? { pid: daemon.pid, pgid: daemon.pgid, argv: argv(daemon.pid) } : null, tree: tree.map((p) => ({ pid: p.pid, comm: p.comm, pgid: p.pgid })), started_log: existsSync(join(out, 'driver-sigterm.jsonl')) ? readFileSync(join(out, 'driver-sigterm.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).kind) : [] };
        break;
      }
      await sleep(2);
    }
  }
  const result = await exited;
  current = null;
  await sleep(2000);
  // what of the run is left: every process under this session but the server, its watchdog, Openbox and the person's xterm
  const left = descendants(process.pid).filter((p) => !sideAndServer.has(p.pid) && !(p.comm === 'xprobe' && /watchdog/.test(argv(p.pid) ?? '')) && p.ppid !== person.pid);
  const everyLauncher = [...procs().values()].filter((p) => ['at-spi-bus-laun', 'at-spi2-registr'].includes(p.comm) || (p.comm === 'dbus-daemon' && /session\.conf|cua171/.test(argv(p.pid) ?? ''))).map((p) => ({ pid: p.pid, comm: p.comm, argv: argv(p.pid) }));
  const row = { kind: 'phase-end', phase, ms: Date.now() - started, exit: result, sigterm, left: left.map((p) => ({ pid: p.pid, comm: p.comm, argv: argv(p.pid) })), buses_and_launchers_now: everyLauncher, at_spi_bus_root: x(env, 'xprop', ['-root', 'AT_SPI_BUS']).slice(0, 120), bus_0: socketStat('/run/user/501/at-spi/bus_0'), bus_N: socketStat(`/run/user/501/at-spi/bus_${N}`), active: x(env, 'xdotool', ['getactivewindow']), person_window: personId };
  log(row);
  if (phase !== 'sigterm' && result.code !== 0) failed = true;
  if (phase === 'sigterm' && (result.code === 0 || result.code === null && !result.signal)) failed = true;
}
for (const c of side) c.kill('SIGTERM');
await sleep(500);
const verdict = await server.stop();
log({ kind: 'server-stopped', watchdog: { state: verdict.state, clean: verdict.clean, stalled: verdict.stalled, reason: verdict.reason, round_trips: verdict.round_trips } });
process.exit(failed || !verdict.clean ? 1 : 0);
