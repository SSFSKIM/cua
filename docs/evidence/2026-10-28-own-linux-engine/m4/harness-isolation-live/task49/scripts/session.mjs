// Task 49's private-display session (#171 M4), from task 46's: a private X server through the harness's own
// `startPrivateServer` (Xvfb -displayfd, the watchdog from its first client on, then the private mark), with no
// authority file and XAUTHORITY unset (task 45's item 8), Openbox, and an xterm standing for the person's window,
// active at the start. Then each phase runs on that display, one harness process at a time, and after each one the
// session looks for anything of the run's left behind. Never :0. A display sampler reads the display's client list
// every 500 ms and each new window's class, name, state and transient-for (every window here is the run's or this
// session's).
// usage: node session.mjs <out> <phases.json>
//   a phase: {name, kind: 'cli'|'driver', entry: 'norecord'|'harness' (cli), args: [...], sigterm: true (SIGTERM the
//   harness once at-spi-bus-launcher is its descendant, while its start's GetAddress is in flight), expect: 'nonzero'}

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const LIVE = '/Users/new/.local/share/cua-171/live-43';
const { startPrivateServer, PRIVATE_MARK } = await import(join(LIVE, 'scripts/linux-engine-diff/xtools.mjs'));
const { declareLiveRun } = await import(join(LIVE, 'scripts/linux-engine-diff/xspawn.mjs'));
// a live run of the harness's, as its command line declares one (xspawn.mjs): its X tools may reach the display it starts
declareLiveRun('task 49: a private-display session (session.mjs)');
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
const phases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
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
    return { ino: s.ino, mtime: s.mtime.toISOString() };
  } catch {
    return null;
  }
};
// the run's own scratch under TMPDIR (wrap.py sets it): what is there now
const scratchNow = () => {
  try {
    return readdirSync(tmpdir());
  } catch {
    return null;
  }
};

const server = await startPrivateServer({ out });
const display = server.display;
const N = display.slice(1);
const env = { ...process.env, DISPLAY: display };
// changed after the recorded runs (was `delete env.XAUTHORITY`, which sends a client to the person's ~/.Xauthority); it does not alter what they recorded
env.XAUTHORITY = join(out, 'no-xauthority'); // a path that is never created
log({ kind: 'server', display, pid: server.pid, mark: x(env, 'xprop', ['-root', PRIVATE_MARK]), at_spi_bus_root: x(env, 'xprop', ['-root', 'AT_SPI_BUS']), bus_0: socketStat('/run/user/501/at-spi/bus_0'), bus_N: socketStat(`/run/user/501/at-spi/bus_${N}`), tmpdir: tmpdir(), scratch: scratchNow() });
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
log({ kind: 'setup', openbox: wm.pid, person_pid: person.pid, person_window: personId, active: x(env, 'xdotool', ['getactivewindow']), env: { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS, AT_SPI_BUS_ADDRESS: process.env.AT_SPI_BUS_ADDRESS, XAUTHORITY: process.env.XAUTHORITY ?? null } });

// the display sampler: every window that appears on this display, as it first shows and 2 s later
let sampling = true;
let paused = false;
let phaseName = null;
const seen = new Map();
const windowsFile = join(out, 'windows.jsonl');
const props = (id) => {
  const text = x(env, 'xprop', ['-id', id, 'WM_CLASS', '_NET_WM_NAME', 'WM_NAME', '_NET_WM_STATE', 'WM_TRANSIENT_FOR', '_NET_WM_WINDOW_TYPE', '_NET_WM_PID']);
  const get = (name) => (text.match(new RegExp(`^${name}\\([^)]*\\) = (.*)$`, 'm')) ?? [])[1] ?? null;
  return { class: get('WM_CLASS'), name: get('_NET_WM_NAME') ?? get('WM_NAME'), state: get('_NET_WM_STATE'), transient_for: (text.match(/^WM_TRANSIENT_FOR\(WINDOW\): window id # (\S+)/m) ?? [])[1] ?? null, type: get('_NET_WM_WINDOW_TYPE'), pid: get('_NET_WM_PID') };
};
const sampler = (async () => {
  while (sampling) {
    if (paused) {
      await sleep(100);
      continue;
    }
    const ids = (x(env, 'xprop', ['-root', '_NET_CLIENT_LIST']).match(/0x[0-9a-f]+/g) ?? []);
    const now = Date.now();
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.set(id, { first: now, again: false });
        appendFileSync(windowsFile, `${JSON.stringify({ t: new Date(now).toISOString(), phase: phaseName, id, at: 'first', ...props(id) })}\n`);
      } else if (!seen.get(id).again && now - seen.get(id).first > 2000) {
        seen.get(id).again = true;
        appendFileSync(windowsFile, `${JSON.stringify({ t: new Date(now).toISOString(), phase: phaseName, id, at: '+2s', ...props(id) })}\n`);
      }
    }
    for (const [id, s] of seen) if (!ids.includes(id) && !s.gone) {
      s.gone = now;
      appendFileSync(windowsFile, `${JSON.stringify({ t: new Date(now).toISOString(), phase: phaseName, id, at: 'gone', lived_ms: now - s.first })}\n`);
    }
    await sleep(500);
  }
})();

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
  phaseName = phase.name;
  const started = Date.now();
  const pout = join(out, phase.name);
  mkdirSync(pout, { recursive: true });
  const before = { scratch: scratchNow(), bus_N: socketStat(`/run/user/501/at-spi/bus_${N}`) };
  let cmd;
  if (phase.kind === 'cli') cmd = [phase.entry === 'harness' ? join(LIVE, 'scripts/linux-engine-diff.mjs') : join(here, 'norecord.mjs'), ...phase.args, '--out', pout];
  else cmd = [join(here, phase.script), pout, ...(phase.args ?? [])];
  log({ kind: 'phase-start', phase: phase.name, cmd: cmd.join(' '), before });
  const child = spawn(process.execPath, cmd, { env: { ...env, ...Object.fromEntries(Object.entries(phase.env ?? {}).map(([k, v]) => [k, v.replace('{TMPDIR}', tmpdir())])) }, cwd: LIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  current = child;
  writeFileSync(join(out, 'driver.pid'), String(child.pid));
  child.stdout.on('data', (d) => appendFileSync(join(pout, 'stdout.log'), d));
  child.stderr.on('data', (d) => appendFileSync(join(pout, 'stderr.log'), d));
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  let sigterm = null;
  paused = Boolean(phase.sigterm);
  if (phase.sigterm) {
    let done = false;
    exited.then(() => (done = true));
    for (;;) {
      if (done) break;
      const tree = descendants(child.pid);
      const launcher = tree.find((p) => p.comm === 'at-spi-bus-laun');
      if (launcher) {
        const daemon = tree.find((p) => p.comm === 'dbus-daemon' && /session\.conf/.test(argv(p.pid) ?? ''));
        const busctl = tree.filter((p) => p.comm === 'busctl').map((p) => argv(p.pid));
        process.kill(child.pid, 'SIGTERM');
        sigterm = { at_ms: Date.now() - started, launcher: { pid: launcher.pid, pgid: launcher.pgid, argv: argv(launcher.pid) }, session_daemon: daemon ? { pid: daemon.pid, pgid: daemon.pgid } : null, busctl_in_flight: busctl, tree: tree.map((p) => ({ pid: p.pid, comm: p.comm, pgid: p.pgid })) };
        break;
      }
      await sleep(2);
    }
  }
  const result = await exited;
  paused = false;
  current = null;
  await sleep(3000);
  // what of the run is left: every process under this session but the server, its watchdog, Openbox, the person's xterm and its sleep
  const left = descendants(process.pid).filter((p) => !sideAndServer.has(p.pid) && !(p.comm === 'xprobe' && /watchdog/.test(argv(p.pid) ?? '')) && p.ppid !== person.pid && p.comm !== 'xprop');
  const everyLauncher = [...procs().values()].filter((p) => ['at-spi-bus-laun', 'at-spi2-registr'].includes(p.comm) || (p.comm === 'dbus-daemon' && /session\.conf|cua171/.test(argv(p.pid) ?? '')) || /a11y-stub\.mjs|record-run|xtrace/.test(argv(p.pid) ?? '')).map((p) => ({ pid: p.pid, comm: p.comm, argv: argv(p.pid) }));
  const row = { kind: 'phase-end', phase: phase.name, ms: Date.now() - started, exit: result, sigterm, left: left.map((p) => ({ pid: p.pid, comm: p.comm, argv: argv(p.pid) })), buses_and_launchers_now: everyLauncher, at_spi_bus_root: x(env, 'xprop', ['-root', 'AT_SPI_BUS']).slice(0, 120), bus_0: socketStat('/run/user/501/at-spi/bus_0'), bus_N: socketStat(`/run/user/501/at-spi/bus_${N}`), scratch_after: scratchNow(), active: x(env, 'xdotool', ['getactivewindow']), person_window: personId, client_list: (x(env, 'xprop', ['-root', '_NET_CLIENT_LIST']).match(/0x[0-9a-f]+/g) ?? []).length };
  log(row);
  const want = phase.expect === 'nonzero' ? result.code !== 0 : phase.expect === 'any' ? true : result.code === 0;
  if (!want) failed = true;
  if (left.length) failed = true;
  if (existsSync(join(out, 'flags.jsonl')) && readFileSync(join(out, 'flags.jsonl'), 'utf8').trim()) {
    log({ kind: 'guard-flagged', phase: phase.name });
    failed = true;
    break;
  }
  if (existsSync(join(out, 'owner-changed'))) {
    log({ kind: 'owner-changed', phase: phase.name });
    failed = true;
    break;
  }
}
sampling = false;
await sampler;
for (const c of side) c.kill('SIGTERM');
await sleep(500);
const verdict = await server.stop();
log({ kind: 'server-stopped', watchdog: { state: verdict.state, clean: verdict.clean, stalled: verdict.stalled, reason: verdict.reason, round_trips: verdict.round_trips }, scratch: scratchNow() });
writeFileSync(join(out, 'session.done'), '');
process.exit(failed || !verdict.clean ? 1 : 0);
