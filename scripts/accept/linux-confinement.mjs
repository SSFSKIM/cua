// The confinement step the Linux fixtures share (#171 M6a, T6; the M6a pre-flight §5.2, "The confinement step"): the
// item 1 smoke (linux-native.mjs) runs it, and the browser-only fixture will. A bare runner has no sshd on port 22 and
// no $XDG_RUNTIME_DIR/bus, so a refused connect to those proved nothing there (the pre-flight's finding 11). Each target
// here is one that is known to answer:
//   x11   the run's X server's socket, /tmp/.X11-unix/X<display>
//   bus   the session bus's actual socket, parsed from DBUS_SESSION_BUS_ADDRESS (a path, or an abstract name)
//   tcp   a TCP listener this step opens on 127.0.0.1
//   unix  a Unix-socket listener this step opens in a directory of the run's
// Positive controls first: the fixture, outside the kernel, connects to each and must succeed, and each listener must
// have counted its control. Then the kernel's cell must be refused on all four, and the listeners must have accepted
// nothing past the controls. Last, the kernel process (found by its command line among the serve's descendants) must have
// the pinned helper and bubblewrap among its parents. The report carries outcomes (error codes), counts and pids only.
import {readdirSync, readFileSync, readlinkSync} from 'node:fs';
import net from 'node:net';
import {join} from 'node:path';
import {sessionBusAddress} from '../../src/runtime/linux-desktop.mjs';

export const TARGETS = ['x11', 'bus', 'tcp', 'unix'];
const CONNECT_TIMEOUT_MS = 3000;
const LISTENERS = ['tcp', 'unix'];

/** The socket a D-Bus address names for a connect: the first `unix:` entry with a path or an abstract name, or null. */
export function busSocket(address) {
  for (const entry of String(address ?? '').split(';')) {
    const [transport, rest] = entry.split(/:(.*)/s);
    if (transport !== 'unix' || !rest) continue;
    const keys = Object.fromEntries(rest.split(',').map(pair => pair.split(/=(.*)/s)).map(([k, v]) => [k, decodeURIComponent(v ?? '')]));
    if (keys.path) return {path: keys.path};
    if (keys.abstract) return {path: `\0${keys.abstract}`};
  }
  return null;
}

/** The local socket of an X display name (`[host]:<n>[.<screen>]`), or null. */
export function xSocket(display) {
  const number = /:(\d+)(?:\.\d+)?$/.exec(display ?? '')?.[1];
  return number === undefined ? null : `/tmp/.X11-unix/X${number}`;
}

/** The four targets for `env` and the opened `listeners`, in TARGETS' order. */
export function confinementTargets({env, listeners}) {
  const x11 = xSocket(env.DISPLAY);
  if (!x11) throw new Error(`no X display to confine against (DISPLAY is ${JSON.stringify(env.DISPLAY ?? null)})`);
  const bus = busSocket(sessionBusAddress(env));
  if (!bus) throw new Error(`no session bus socket to confine against (the address is ${JSON.stringify(sessionBusAddress(env) ?? null)})`);
  return {x11: {path: x11}, bus, tcp: {host: listeners.tcp.host, port: listeners.tcp.port}, unix: {path: listeners.unix.path}};
}

/** A TCP listener on 127.0.0.1 and a Unix listener in `dir`, each counting the connections it accepted. */
export async function openListeners(dir) {
  const counts = {tcp: 0, unix: 0};
  const server = kind => net.createServer(socket => { counts[kind] += 1; socket.destroy(); });
  const tcp = server('tcp');
  const unix = server('unix');
  const path = join(dir, 'confinement.sock');
  await new Promise((done, fail) => tcp.once('error', fail).listen(0, '127.0.0.1', done));
  await new Promise((done, fail) => unix.once('error', fail).listen(path, done));
  return {
    tcp: {host: '127.0.0.1', port: tcp.address().port},
    unix: {path},
    accepted: () => ({...counts}),
    close: () => Promise.all([tcp, unix].map(s => new Promise(done => s.close(() => done())))),
  };
}

/** One connect from this process: 'ok', or the error's code ('timeout' when it neither connects nor fails in time). */
export function connectOutcome(target, timeoutMs = CONNECT_TIMEOUT_MS) {
  return new Promise(done => {
    const socket = net.connect(target);
    const timer = setTimeout(() => { socket.destroy(); done('timeout'); }, timeoutMs);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); done('ok'); });
    socket.once('error', error => { clearTimeout(timer); done(error.code ?? 'error'); });
  });
}

/** The positive controls: this process connects to each target. */
export async function controlOutcomes(targets) {
  const outcomes = {};
  for (const name of TARGETS) outcomes[name] = await connectOutcome(targets[name]);
  return outcomes;
}

/** The kernel's cell: the same connects from inside the sandbox, written as one line of JSON under `confinement`. */
export function kernelCell(targets) {
  return `const net = await import('node:net');
    const targets = ${JSON.stringify(Object.fromEntries(TARGETS.map(name => [name, targets[name]])))};
    const connect = target => new Promise(done => { const s = net.connect(target);
      const timer = setTimeout(() => { s.destroy(); done('timeout'); }, ${CONNECT_TIMEOUT_MS});
      s.once('connect', () => { clearTimeout(timer); s.destroy(); done('ok'); }); s.once('error', e => { clearTimeout(timer); done(e.code ?? 'error'); }); });
    const outcomes = {};
    for (const [name, target] of Object.entries(targets)) outcomes[name] = await connect(target);
    nodeRepl.write(JSON.stringify({confinement: outcomes}));`;
}

/** The kernel's outcomes from its cell's text, or null. */
export function kernelOutcomes(text) {
  const line = /\{"confinement":.*\}$/m.exec(text ?? '')?.[0];
  if (!line) return null;
  try { return JSON.parse(line).confinement; } catch { return null; }
}

const readProc = (pid, file) => { try { return readFileSync(`/proc/${pid}/${file}`, 'utf8'); } catch { return null; } };
const exeOf = pid => { try { return readlinkSync(`/proc/${pid}/exe`); } catch { return null; } };

// Every process's parent, its comm and its argv, from /proc.
function processTable() {
  const table = new Map();
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const stat = readProc(name, 'stat');
    const cmdline = readProc(name, 'cmdline');
    if (!stat || cmdline === null) continue;
    const close = stat.lastIndexOf(')');
    table.set(Number(name), {ppid: Number(stat.slice(close + 2).split(' ')[1]), comm: stat.slice(stat.indexOf('(') + 1, close), argv: cmdline.split('\0').filter(Boolean)});
  }
  return table;
}

// The kernel's own process: Node running src/repl-host/kernel.mjs. The helper and bubblewrap carry the same words after
// their `--`, so the program itself must be Node.
const isKernel = ({argv}) => /(^|\/)node[^/]*$/.test(argv[0] ?? '') && argv.some(arg => /src\/repl-host\/kernel\.mjs$/.test(arg));

/**
 * The kernel among `serve`'s descendants and its parents up to the serve: `{kernel, underServe, helper, ancestors}`,
 * each ancestor `{pid, comm, exe}`. `table` is a test seam.
 */
export function kernelAncestry({serve, helper, table = processTable(), exe = exeOf}) {
  const chain = pid => { const up = []; for (let p = table.get(pid)?.ppid; p && table.has(p); p = table.get(p).ppid) up.push(p); return up; };
  const kernels = [...table].filter(([, entry]) => isKernel(entry)).map(([pid]) => pid);
  const kernel = kernels.find(pid => chain(pid).includes(serve)) ?? kernels[0] ?? null;
  if (kernel === null) return {kernel: null, underServe: false, helper, ancestors: []};
  const up = chain(kernel);
  const ancestors = (up.includes(serve) ? up.slice(0, up.indexOf(serve) + 1) : up).map(pid => ({pid, comm: table.get(pid).comm, exe: exe(pid) ?? table.get(pid).argv[0] ?? null}));
  return {kernel, underServe: up.includes(serve), helper, ancestors};
}

const plural = n => `${n} connection${n === 1 ? '' : 's'}`;

/** The step's judge over what it observed: `{pass, problems}`. */
export function confinementVerdict({controls, accepted, kernel, ancestry}) {
  const problems = [];
  for (const name of TARGETS) if (controls?.[name] !== 'ok') problems.push(`the positive control could not connect to ${name} (${controls?.[name] ?? 'not tried'}), so a refusal there would show nothing`);
  for (const name of LISTENERS) {
    const counted = accepted?.afterControls?.[name] ?? 0;
    if (counted !== 1) problems.push(`the ${name} listener counted ${counted} control connections, not 1`);
    const past = (accepted?.afterKernel?.[name] ?? 0) - counted;
    if (past !== 0) problems.push(`the ${name} listener accepted ${plural(past)} past the controls`);
  }
  if (!kernel) problems.push('the kernel\'s cell reported no outcomes');
  else for (const name of TARGETS) {
    if (!(name in kernel)) problems.push(`the kernel reported nothing for ${name}`);
    else if (kernel[name] === 'ok') problems.push(`the kernel connected to ${name}`);
  }
  if (!ancestry?.kernel) problems.push('no kernel process was found among the processes');
  else {
    if (!ancestry.underServe) problems.push(`the kernel ${ancestry.kernel} is not a descendant of this session's cua serve`);
    if (!ancestry.ancestors.some(a => a.exe === ancestry.helper)) problems.push(`the pinned helper ${ancestry.helper} is not among the kernel's parents`);
    if (!ancestry.ancestors.some(a => a.comm === 'bwrap')) problems.push('no bwrap among the kernel\'s parents');
  }
  return {pass: problems.length === 0, problems};
}

/**
 * The step, run in a fixture's open session: `session` (scripts/accept/mcp-session.mjs), `env` (the run's display and
 * bus), `dir` (where the Unix listener goes), `helper` (the home's pinned helper path). The listeners are opened and
 * closed here. -> `{targets, controls, accepted, kernel, ancestry, verdict}`.
 */
export async function confinementStep({session, env, dir, helper, resultText}) {
  const listeners = await openListeners(dir);
  try {
    const targets = confinementTargets({env, listeners});
    const controls = await controlOutcomes(targets);
    await new Promise(r => setTimeout(r, 200));
    const afterControls = listeners.accepted();
    const cell = await session.js(kernelCell(targets), 60_000);
    const kernel = cell.result?.isError ? null : kernelOutcomes(resultText(cell));
    const ancestry = kernelAncestry({serve: session.pid, helper});
    await new Promise(r => setTimeout(r, 200));
    const observed = {controls, accepted: {afterControls, afterKernel: listeners.accepted()}, kernel, ancestry};
    return {targets: Object.fromEntries(TARGETS.map(name => [name, targets[name].path ? {path: targets[name].path.replace('\0', '@')} : targets[name]])), ...observed, verdict: confinementVerdict(observed)};
  } finally {
    await listeners.close();
  }
}
