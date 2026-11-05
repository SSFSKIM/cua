// The REPL host's stop of cua's engine, live (M4's T7b; the Decision Log, M4 T7b): `--experiment engine-stop`. On
// Linux the REPL host freezes the trusted worker's tree, sends the engine in it alone SIGTERM then SIGCONT, waits for
// its exit (bounded), then SIGKILLs everything it froze (src/repl-host/kernel-child.mjs `stopProcessTree`), so the
// engine's orderly exit runs: the release of what it holds, then the settle before its redirects go.
// This proves it through `cua serve` itself, on the engine under test (`--cua`, as CUA_LINUX_ENGINE_BIN), on each of
// the production stop paths:
//   - idle: end_task, then the runtime's idle stop (CUA_RUNTIME_IDLE_MS 1);
//   - eof: the MCP stream's end (the client closes cua serve's stdin);
//   - signal: SIGTERM to the REPL host (its supervisor);
//   - remote: a remote session's end, end_task then DELETE on a Streamable HTTP session (src/mcp/http.mjs, served by
//     remote-serve.mjs from the same checkout);
//   - held-back: the stream's end while admitted work runs past upstream's escalation (`HELD_BACK_MS`), so the owned
//     group's SIGTERM comes before the REPL host's own stop (hold only).
// `--sandbox disabled` runs each under CUA_SHIM_SANDBOX=disabled, the worker and the engine in the owned group.
// Three cases on each, each run a fresh `cua serve` in `dedicated` mode:
//   - hold: key_down of Shift on an xterm, whose keys only the foreground route delivers (XTEST): the X server holds the
//     key across requests (read before the stop, the case's positive control); after the stop its keymap is empty;
//   - burst: press_key requests one after another (`BURST`) into the run's own Chrome on the keys page (pages/keys.html),
//     covered by the front window, so the background route and the window's redirect: straight after their last answer,
//     the stop; every key lands, in order, at the field's caret;
//   - handle: a drag_handle started on the xterm and moved, not ended: the X server holds button 1 across requests (read
//     before the stop); after the stop no button is down, and the pointer is where the model left it.
// Lanes: `drain`, the REPL host of this checkout, must pass every run; `kill`, the same with the REPL host of
// `--control-root` (a checkout from before the change, whose stop SIGKILLs the tree at once), is the control: its hold
// and its handle leave the key and the button down (released by the harness after); its bursts are reported, since
// through these paths even an immediate kill lands every burst (`engineStopVerdict`), unless `--require-burst-cut`
// asks for a sitting where it must cut one. The engine is the same in both.
// Each run records how long the engine lived after the stop began and after the last answer, the budget's numbers, and
// every process left stopped once the run has ended, which must be none (the launcher hold: kernel-child.mjs
// `holdLauncher`).
//
// Where it runs: only on a private X server it starts itself, with Openbox and the harness's own Desktop on it (the
// run's applications, homes and session bus, its own Chrome), the live-run declaration withdrawn first, as the
// focus-timer experiment does. cua serve gets that display and that bus; it uses this machine's cua home (its runtime,
// its run directory), the computer surface alone and no secrets.

import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { cleanStart, insertedAt, keysOf, KEYS_PAGE, settledRead, tenth, textAndCaret } from './focus-timer.mjs';
import { openFamily } from './families.mjs';
import { preorder } from './normalize.mjs';
import { Oracle } from './oracle.mjs';
import { Desktop, desktopEnding } from './scenes.mjs';
import { median } from './stats.mjs';
import { startPrivateServer, xdotool, xprobe } from './xtools.mjs';
import { LIVE_RUN, assertReachable, xExecFileSync, xSpawn } from './xspawn.mjs';

export const PATHS = ['idle', 'eof', 'signal', 'remote', 'held-back'];
export const CASES = ['hold', 'burst', 'handle'];
export const LANES = ['drain', 'kill'];
/** Runs of each lane, path and case (`--trials` sets another count). */
export const RUNS = 10;
/**
 * The burst: letters only, capitals among them so Shift chords ride it (focus-timer.mjs `keysOf`). A cell sends them one
 * after another, as a model's typing does: cua's service holds each window input 100 ms behind the one before (its
 * action settle, settle.mjs), and concurrent calls through it leave that settle in no fixed order, so a burst of
 * concurrent calls arrives scrambled (seen in this experiment's first sitting), whatever the stop.
 */
export const BURST = 'abcDefgHijkLmnoP';
/** The key the hold holds, and the keysym the control's leftover is released by. */
export const HELD = 'shift';
const RELEASE_KEYSYM = 'Shift_L';
/** Where on the xterm the handle starts, and how far its one move goes, from the window's top left. */
const HANDLE_START = [60, 60];
const HANDLE_MOVE = [80, 30];
/** The app an approval of desktop input names (cua's elicitation for a request with no window). */
const DESKTOP_APPROVAL = '(desktop)';
/** The engine binary's subcommand for the REPL host's launcher shim (native/linux-engine/src/shim.rs). */
const LAUNCHER_SHIM = 'launcher-shim';
/**
 * `held-back`: how long the cell admitted before the stream's end runs. cua serve waits for the task's completion at
 * most 5 s after the end (server.mjs `completionDeadlineMs`), then tears the runtime down (upstream.mjs, budget 5 s):
 * SIGTERM to the owned group at by(0.4), 7 s after the end, SIGKILL at by(0.7), 8.5 s. The cell outlasts both.
 */
export const HELD_BACK_MS = 12000;
/** How long a stop may take before the run gives up on it: past the held-back teardown's SIGKILL and its 5 s budget. */
const STOP_BOUND_MS = 15000;
const REPO = fileURLToPath(new URL('../..', import.meta.url));
const REMOTE_SERVE = fileURLToPath(new URL('./remote-serve.mjs', import.meta.url));
const NO_DISPLAY = ':cua171-engine-stop';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The cases a path runs: `held-back` proves the release under upstream's escalation, so a held key's alone. */
export const casesOf = (path, cases) => (path === 'held-back' ? cases.filter((c) => c === 'hold') : cases);

/** The control's record: its checkout's directory name, never its path (the evidence is public). */
export const controlLabel = (root) => (root ? basename(root) : null);

/**
 * Whether the run stopped what it meant to: nothing failed on its way, its session's one engine was found first, and no
 * process was left stopped once it ended.
 */
const valid = (row) => !row.error && row.engines === 1 && leftNothingStopped(row);
const leftNothingStopped = (row) => Array.isArray(row.stopped_left) && row.stopped_left.length === 0;

/** A run's verdict: the drain lane's runs must pass, the kill lane's are counted. */
export function runPasses(row) {
  if (!valid(row)) return false;
  if (row.case === 'hold') return row.held_before === true && Array.isArray(row.keys_after) && row.keys_after.length === 0;
  if (row.case === 'handle') {
    const released = Array.isArray(row.buttons_before) && row.buttons_before.includes(1) && Array.isArray(row.buttons_after) && row.buttons_after.length === 0;
    // the drop where the model left the pointer: nobody else moves it on the run's private display
    const end = row.handle?.end;
    return released && Array.isArray(row.pointer_after) && row.pointer_after[0] === end?.x && row.pointer_after[1] === end?.y;
  }
  return row.in_order === true;
}

/**
 * Whether a control run shows the failure it stands for: after a hold that was down before the stop, the key still
 * down; after a burst whose every key was answered, a key lost or out of order. A run that failed on its way shows
 * nothing.
 */
export function controlShows(row) {
  if (!valid(row)) return false;
  if (row.case === 'hold') return row.held_before === true && Array.isArray(row.keys_after) && row.keys_after.length > 0;
  if (row.case === 'handle') return Array.isArray(row.buttons_before) && row.buttons_before.includes(1) && Array.isArray(row.buttons_after) && row.buttons_after.includes(1);
  return row.in_order === false;
}

/**
 * Whether the control's hold must leave the key down: everywhere but `held-back` with the sandbox disabled, where the
 * owned group's SIGTERM reaches the engine itself first in either lane, before any stop of the REPL host's.
 */
const controlLeavesHold = (path, sandbox) => !(path === 'held-back' && sandbox === 'disabled');

/** What the control's failure is, by case, as the verdict names it. */
const CONTROL_FAILURE = { hold: 'did not leave the key down', handle: "did not leave the drag's button down" };

/**
 * The experiment's verdict from its rows: every drain run passes on every path and case; the control (the kill lane)
 * shows its failure on every hold and handle run, so the check can see a missing release, and none of its runs failed
 * on its way; no run of either lane left a process stopped.
 * Its bursts are reported (`burstControl` 'report', the design session's ruling, M4 T7b): through the production paths
 * cua's service spaces each window input 100 ms behind the previous key, and the stop's own latency follows, so even
 * an immediate kill lands every burst, and the burst half is judged by the drain's effect alone. With 'cut'
 * (`--require-burst-cut`, for T8 once that spacing shrinks) at least one cut on each path is required, else the sitting
 * showed no pending burst.
 */
export function engineStopVerdict(rows, { paths = PATHS, cases = CASES, lanes = LANES, sandbox = 'scoped', burstControl = 'report' } = {}) {
  const failed = [];
  const controlBursts = [];
  const md = ['| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |', '|---|---|---|---:|---:|---:|---:|'];
  for (const lane of lanes) {
    for (const path of paths) {
      for (const kind of casesOf(path, cases)) {
        const runs = rows.filter((r) => r.lane === lane && r.path === path && r.case === kind);
        const passed = runs.filter(runPasses).length;
        const ms = (key) => tenth(median(runs.map((r) => r[key]).filter(Number.isFinite))) ?? '-';
        md.push(`| ${lane} | ${path} | ${kind} | ${runs.length} | ${passed} | ${ms('engine_after_stop_ms')} | ${ms('engine_after_answer_ms')} |`);
        const label = `${lane} ${path} ${kind}`;
        if (!runs.length) {
          failed.push(`${label}: no run`);
          continue;
        }
        const stoppedLeft = runs.filter((r) => !leftNothingStopped(r)).length;
        if (lane === 'drain') {
          if (passed < runs.length) failed.push(`${label}: ${runs.length - passed} of ${runs.length} failed`);
        } else {
          const errored = runs.filter((r) => !valid(r)).length;
          const shown = runs.filter(controlShows).length;
          if (kind === 'burst') controlBursts.push(...runs);
          if (kind in CONTROL_FAILURE && controlLeavesHold(path, sandbox)) {
            if (shown < runs.length) failed.push(`${label}: ${runs.length - shown} of ${runs.length} ${CONTROL_FAILURE[kind]} (the control's failure)${errored ? `: ${errored} errored` : ''}`);
          } else if (errored) failed.push(`${label}: ${errored} of ${runs.length} errored`);
          else if (kind === 'burst' && burstControl === 'cut' && shown === 0) failed.push(`${label}: the control cut no burst (0 of ${runs.length}): no pending burst was shown`);
        }
        if (stoppedLeft) failed.push(`${label}: ${stoppedLeft} of ${runs.length} left a stopped process`);
      }
    }
  }
  if (controlBursts.length) {
    const cut = controlBursts.filter(controlShows).length;
    md.push('', burstControl === 'cut'
      ? `The control's bursts: ${cut} of ${controlBursts.length} cut (required on each path).`
      : `The control's bursts: ${cut} of ${controlBursts.length} cut (reported, not required: through the production paths the service spaces each window input 100 ms behind the previous key, so the control cannot fail there).`);
  }
  return { md, failed };
}

/** Every process stopped or traced (state T or t) in `proc`: {pid, comm, state}. */
export function stoppedProcesses({ proc = '/proc' } = {}) {
  const out = [];
  for (const name of readdirSync(proc)) {
    if (!/^\d+$/.test(name)) continue;
    let stat;
    try {
      stat = readFileSync(join(proc, name, 'stat'), 'utf8');
    } catch {
      continue; // gone meanwhile
    }
    const close = stat.lastIndexOf(')');
    const state = stat.slice(close + 2, close + 3);
    if (state === 'T' || state === 't') out.push({ pid: Number(name), comm: stat.slice(stat.indexOf('(') + 1, close), state });
  }
  return out.sort((a, b) => a.pid - b.pid);
}

/** The pointer buttons the X server holds down, or null when they could not be read. */
function buttonsDown() {
  try {
    return JSON.parse(xprobe(['buttons-down']).trim());
  } catch {
    return null;
  }
}

/** The pointer's position, or null. */
function pointerAt() {
  try {
    const shell = Object.fromEntries(xdotool('getmouselocation', '--shell').split('\n').map((l) => l.split('=')));
    return [Number(shell.X), Number(shell.Y)];
  } catch {
    return null;
  }
}

/** A window's top left on the screen. */
function windowAt(id) {
  const shell = Object.fromEntries(xdotool('getwindowgeometry', '--shell', id).split('\n').map((l) => l.split('=')));
  return [Number(shell.X), Number(shell.Y)];
}

/**
 * The pids of the processes under `root` (its descendants, from /proc) that run the executable at `bin` as the engine:
 * not as the REPL host's launcher shim, the same binary run with that subcommand (native/linux-engine/src/shim.rs).
 */
export function enginesUnder(root, bin, { proc = '/proc' } = {}) {
  const parent = new Map();
  for (const name of readdirSync(proc)) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(join(proc, name, 'stat'), 'utf8');
      parent.set(Number(name), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]));
    } catch {
      // gone meanwhile
    }
  }
  const under = (pid) => {
    for (let p = parent.get(pid), hops = 0; p !== undefined && p > 1 && hops < 64; p = parent.get(p), hops++) if (p === root) return true;
    return false;
  };
  // the path as given or as resolved: the kernel's link names the file it ran by its resolved path
  const names = new Set([bin, realpathSync(bin)]);
  return [...parent.keys()].filter((pid) => {
    try {
      return names.has(readlinkSync(join(proc, String(pid), 'exe'))) && under(pid)
        && readFileSync(join(proc, String(pid), 'cmdline'), 'utf8').split('\0')[1] !== LAUNCHER_SHIM;
    } catch {
      return false;
    }
  });
}

/** The pids of the processes under `root` whose command line names `script`. */
function processesRunning(root, script) {
  const out = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const args = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0');
      if (args.some((a) => a.endsWith(script)) && descends(Number(name), root)) out.push(Number(name));
    } catch {
      // gone meanwhile
    }
  }
  return out;
}

function descends(pid, root) {
  for (let p = pid, hops = 0; p > 1 && hops < 64; hops++) {
    let stat;
    try {
      stat = readFileSync(`/proc/${p}/stat`, 'utf8');
    } catch {
      return false;
    }
    p = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    if (p === root) return true;
  }
  return false;
}

/** Whether every one of `pids` has exited (gone, or a zombie). */
function allGone(pids) {
  return pids.every((pid) => {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      return ['Z', 'X'].includes(stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3));
    } catch {
      return true;
    }
  });
}

/** Waits until every one of `pids` has exited, polled every 2 ms, at most `boundMs`: when, or null. */
async function goneBy(pids, boundMs = STOP_BOUND_MS) {
  const deadline = performance.now() + boundMs;
  while (performance.now() < deadline) {
    if (allGone(pids)) return performance.now();
    await sleep(2);
  }
  return null;
}

/** The keycodes the X server holds down, or null when they could not be read. */
function keysDown() {
  try {
    return JSON.parse(xprobe(['keys-down']).trim());
  } catch {
    return null;
  }
}

/** The environment of a `cua serve` under test: this display and bus, cua's engine, `dedicated`, nothing more. */
function serveEnv(ctx, path, extra = {}) {
  return {
    ...process.env,
    CUA_NATIVE_ENGINE: 'cua',
    CUA_LINUX_ENGINE_BIN: ctx.cua,
    CUA_DESKTOP_MODE: 'dedicated',
    CUA_SHIM_SURFACES: 'computer',
    CUA_SHIM_SECRETS: 'off',
    CUA_RUNTIME_IDLE_MS: path === 'idle' ? '1' : '0',
    // the REPL host's sandbox, scoped (cua's default) unless the sitting asks for none
    ...(ctx.sandbox === 'disabled' ? { CUA_SHIM_SANDBOX: 'disabled' } : {}),
    ...extra,
  };
}

/** The approval answer: accepted only for the scene's own app, everything else declined; each request recorded. */
function approvals(app, asked) {
  return (msg) => {
    const named = msg?.params?._meta?.tool_params?.app ?? null;
    const accept = msg?.method === 'elicitation/create' && named === app;
    asked.push({ method: msg?.method ?? null, app: named, action: accept ? 'accept' : 'decline' });
    return accept ? { action: 'accept', content: {} } : { action: 'decline' };
  };
}

/** `cua serve` of checkout `root` on stdio, through the spawner: {pid, request, js, call, endInput, exited, stderr}. */
function stdioSession(ctx, root, path, onServerRequest) {
  const child = xSpawn(process.execPath, [join(root, 'bin', 'cua.mjs'), 'serve'], { env: serveEnv(ctx, path), stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr = `${stderr}${d}`.slice(-20000);
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const waiters = new Map();
  let id = 0;
  const send = (msg) => {
    if (child.stdin.writable) child.stdin.write(`${JSON.stringify(msg)}\n`);
  };
  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.method !== undefined && msg.id !== undefined) return send({ jsonrpc: '2.0', id: msg.id, result: onServerRequest(msg) });
    waiters.get(msg.id)?.(msg);
  });
  const request = (method, params, timeoutMs = 60000) =>
    new Promise((resolve) => {
      const n = ++id;
      const timer = setTimeout(() => {
        waiters.delete(n);
        resolve({ timedOut: true });
      }, timeoutMs);
      waiters.set(n, (msg) => {
        clearTimeout(timer);
        waiters.delete(n);
        resolve(msg);
      });
      send({ jsonrpc: '2.0', id: n, method, params });
    });
  return {
    pid: child.pid,
    exited,
    get stderr() {
      return stderr;
    },
    async initialize() {
      const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: { elicitation: {} }, clientInfo: { name: 'cua171-engine-stop', version: '0' } }, 120000);
      if (init.timedOut || init.error) throw new Error(`cua serve's initialize failed (${init.timedOut ? 'no answer' : init.error.message})`);
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    },
    js: (code) => request('tools/call', { name: 'js', arguments: { code, timeout_ms: 60000 } }, 90000),
    call: (name, args = {}) => request('tools/call', { name, arguments: args }),
    endInput: () => child.stdin.end(),
    // the end of a run: stdin closed, then SIGTERM, then SIGKILL, each bounded
    async close() {
      if (child.stdin.writable) child.stdin.end();
      if (await Promise.race([exited, sleep(10000).then(() => null)])) return;
      child.kill('SIGTERM');
      if (await Promise.race([exited, sleep(5000).then(() => null)])) return;
      child.kill('SIGKILL');
      await exited;
    },
  };
}

/**
 * A remote session on remote-serve.mjs of checkout `root` (cua's Streamable HTTP handler), through the spawner:
 * {pid, js, call, remove, close}. Requests answered on the POST's event stream; a request of the server's (an approval)
 * found there is answered with a POST of its own.
 */
async function remoteSession(ctx, root, path, onServerRequest) {
  const token = randomBytes(24).toString('hex');
  const child = xSpawn(process.execPath, [REMOTE_SERVE, '--root', root], { env: serveEnv(ctx, path, { CUA171_REMOTE_TOKEN: token }), stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr = `${stderr}${d}`.slice(-20000);
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const port = await new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    lines.once('line', (line) => resolve(JSON.parse(line).port));
    child.once('exit', () => reject(new Error(`remote-serve ended before it listened: ${stderr.slice(-500)}`)));
  });
  const url = `http://127.0.0.1:${port}/mcp`;
  let session = null;
  let id = 0;
  const headers = () => ({ authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...(session ? { 'mcp-session-id': session } : {}) });
  const post = (msg) => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(msg) });
  // the answer to request `n`: the JSON body, or the event on the POST's stream that carries it
  async function answer(res, n) {
    if ((res.headers.get('content-type') ?? '').includes('application/json')) return res.json();
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      for (let end; (end = buffer.indexOf('\n\n')) !== -1; ) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = event
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        let msg;
        try {
          msg = JSON.parse(data);
        } catch {
          continue;
        }
        if (msg.method !== undefined && msg.id !== undefined) {
          await (await post({ jsonrpc: '2.0', id: msg.id, result: onServerRequest(msg) })).body?.cancel();
          continue;
        }
        if (msg.id === n) {
          res.body.cancel().catch(() => {});
          return msg;
        }
      }
    }
    return { closed: true };
  }
  const request = async (method, params) => {
    const n = ++id;
    const res = await post({ jsonrpc: '2.0', id: n, method, params });
    if (method === 'initialize') session = res.headers.get('mcp-session-id');
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${await res.text()}`);
    return answer(res, n);
  };
  return {
    pid: child.pid,
    exited,
    get stderr() {
      return stderr;
    },
    async initialize() {
      const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: { elicitation: {} }, clientInfo: { name: 'cua171-engine-stop', version: '0' } });
      if (init.error) throw new Error(`the remote initialize failed (${init.error.message})`);
      await (await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).body?.cancel();
    },
    js: (code) => request('tools/call', { name: 'js', arguments: { code, timeout_ms: 60000 } }),
    call: (name, args = {}) => request('tools/call', { name, arguments: args }),
    // DELETE: the session's end, answered once its connection has released everything
    async remove() {
      const res = await fetch(url, { method: 'DELETE', headers: headers() });
      await res.body?.cancel();
      return res.status;
    },
    async close() {
      child.kill('SIGTERM');
      if (await Promise.race([exited, sleep(10000).then(() => null)])) return;
      child.kill('SIGKILL');
      await exited;
    },
  };
}

const text = (reply) => (reply?.result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');

/** The cell that finds the window by its id among those the engine lists (the facade's own form of a window). */
const findWindow = (id) => `const w = (await cua.computer.list_windows({})).find((x) => x.id === ${Number(id)}); if (!w) throw new Error('window ${Number(id)} is not listed');`;

/**
 * One run: a fresh session of the lane's checkout, its case's input, then the path's stop straight after the last
 * answer; the engine's exit awaited and the effect read once it has gone. Returns the run's row.
 */
async function oneRun(ctx, lane, path, kind, scenes, trial) {
  const { desktop, oracle } = ctx;
  const root = lane === 'drain' ? REPO : ctx.controlRoot;
  const scene = kind === 'burst' ? scenes.chrome : scenes.xterm;
  const asked = [];
  // the handle acts on the desktop (its approval names no app: "(desktop)"), the other cases on their window's app
  const answer = approvals(kind === 'handle' ? DESKTOP_APPROVAL : scene.app, asked);
  const row = { kind: 'engine-stop-run', lane, path, case: kind, sandbox: ctx.sandbox, trial };
  let read = null;
  let before = null;
  if (kind === 'burst') {
    desktop.arrangeFront('covered');
    read = () => textAndCaret(desktop, oracle, scene);
    const { tail } = await cleanStart(ctx, scene, read);
    row.tail_at_start = tail;
    before = await settledRead(read);
  } else {
    const stale = keysDown();
    if (stale?.length) throw new Error(`keys down before the run: ${JSON.stringify(stale)}`);
    const pressed = buttonsDown();
    if (pressed?.length) throw new Error(`buttons down before the run: ${JSON.stringify(pressed)}`);
  }
  const stoppedBefore = new Set(stoppedProcesses().map((p) => p.pid));
  let handleEnd = null;
  if (kind === 'handle') {
    const [wx, wy] = windowAt(scene.id);
    const start = { x: wx + HANDLE_START[0], y: wy + HANDLE_START[1] };
    handleEnd = { x: start.x + HANDLE_MOVE[0], y: start.y + HANDLE_MOVE[1] };
    row.handle = { start, end: handleEnd };
  }
  const session = path === 'remote' ? await remoteSession(ctx, root, path, answer) : stdioSession(ctx, root, path, answer);
  try {
    await session.initialize();
    const setup = await session.js(`${findWindow(scene.id)} nodeRepl.write('found');`);
    if (!/found/.test(text(setup))) throw new Error(`the session's first cell: ${text(setup).slice(-400)}`);
    const code = {
      hold: `${findWindow(scene.id)} await cua.computer.key_down({window: w, key: ${JSON.stringify(HELD)}}); nodeRepl.write('held');`,
      burst: `${findWindow(scene.id)} for (const key of ${JSON.stringify(keysOf(BURST))}) await cua.computer.press_key({window: w, key}); nodeRepl.write('sent');`,
      // started and moved, never ended: the handle's button 1 held across requests
      handle: `const h = cua.computer.drag_handle(); await h.start(${JSON.stringify(row.handle?.start)}); await h.move_to(${JSON.stringify(handleEnd)}); nodeRepl.write('held');`,
    }[kind];
    const reply = await session.js(code);
    const answered = performance.now();
    const said = text(reply);
    if (!/held|sent/.test(said.slice(-20))) throw new Error(`the case's cell: ${said.slice(-400)}`);
    const engines = enginesUnder(session.pid, ctx.cua);
    row.engines = engines.length;
    // the session's one engine, or the stop below proves nothing: an empty list is gone at once
    if (engines.length !== 1) throw new Error(`${engines.length} engines under the session before the stop, not 1`);
    if (kind === 'hold') row.held_before = (keysDown() ?? []).length > 0;
    if (kind === 'handle') row.buttons_before = buttonsDown();
    if (path === 'held-back') {
      // admitted work the stream's end must wait for, past upstream's escalation; its answer is the closing refusal
      session.js(`await new Promise((r) => setTimeout(r, ${HELD_BACK_MS})); nodeRepl.write('slept');`);
      await sleep(300);
    }
    const stopped = performance.now();
    if (path === 'eof' || path === 'held-back') session.endInput();
    else if (path === 'signal') {
      const supervisors = processesRunning(session.pid, 'repl-host/supervisor.mjs');
      if (supervisors.length !== 1) throw new Error(`${supervisors.length} REPL host supervisors under the session`);
      process.kill(supervisors[0], 'SIGTERM');
    } else if (path === 'idle') {
      const ended = await session.call('end_task');
      if (ended.error || ended.timedOut) throw new Error(`end_task: ${JSON.stringify(ended).slice(0, 300)}`);
    } else {
      const ended = await session.call('end_task');
      if (ended.error) throw new Error(`end_task: ${JSON.stringify(ended).slice(0, 300)}`);
      row.delete_status = await session.remove();
    }
    const gone = await goneBy(engines);
    row.engine_after_stop_ms = gone === null ? null : Math.round((gone - stopped) * 10) / 10;
    row.engine_after_answer_ms = gone === null ? null : Math.round((gone - answered) * 10) / 10;
    if (gone === null) throw new Error(`the engine still ran ${STOP_BOUND_MS} ms after the stop`);
    // the effect, read once the engine has gone and before the run's own cleanup, which could change it
    if (kind === 'hold') row.keys_after = keysDown();
    else if (kind === 'handle') {
      row.buttons_after = buttonsDown();
      row.pointer_after = pointerAt();
    } else {
      const after = await settledRead(read, { want: (before.text?.length ?? 0) + BURST.length });
      row.in_order = insertedAt(before.text, before.caret, BURST, after.text);
      row.got = typeof after.text === 'string' && typeof before.text === 'string' ? after.text.slice(before.caret ?? 0, (before.caret ?? 0) + after.text.length - before.text.length) : null;
    }
  } catch (error) {
    row.error = String(error.message).slice(0, 500);
    row.stderr = session.stderr.slice(-1500);
  } finally {
    await session.close();
  }
  row.approvals = asked;
  // every process the run left stopped (none may be: the launcher hold), listed once it has ended
  row.stopped_left = stoppedProcesses().filter((p) => !stoppedBefore.has(p.pid));
  // whatever a run left down released, so the next one starts with nothing held
  if (kind === 'hold' && keysDown()?.length) {
    xdotool('keyup', RELEASE_KEYSYM);
    row.released_by_harness = keysDown()?.length === 0;
  }
  if (kind === 'handle' && buttonsDown()?.length) {
    xdotool('mouseup', 1);
    row.released_by_harness = buttonsDown()?.length === 0;
  }
  row.ok = runPasses(row);
  ctx.emit(row);
  return row;
}

/** The run's scenes: an xterm (the hold's) and the run's own Chrome on the keys page (the burst's), with their apps. */
async function openScenes(ctx) {
  const { desktop, oracle } = ctx;
  const xterm = await openFamily(desktop, oracle, 'xterm', 'stop-hold');
  const chrome = await openFamily(desktop, oracle, 'chrome', 'stop-burst', { page: KEYS_PAGE });
  chrome.field ??= preorder((await desktop.state(chrome)).ax_tree).find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
  if (!chrome.field) throw new Error('the keys page has no field the harness can read');
  const listed = await desktop.listWindows();
  for (const scene of [xterm, chrome]) {
    scene.app = listed.find((w) => w.id === scene.id)?.app ?? null;
    if (!scene.app) throw new Error(`${scene.label} is not listed with an app`);
  }
  return { xterm, chrome };
}

function useDisplay(display) {
  assertReachable('the engine-stop experiment', [], { DISPLAY: display });
  process.env.DISPLAY = display;
}

/** `--experiment engine-stop`: every lane, path and case; `{md, complete, failed, ending}`. */
export async function runEngineStop(args, { emit, run, startLoad }) {
  if (!args.controlRoot) throw new Error('--control-root names the checkout whose REPL host is the control (a stop that SIGKILLs at once)');
  const paths = args.paths?.length ? args.paths : PATHS;
  const cases = args.cases?.length ? args.cases : CASES;
  const lanes = args.lanes?.length ? args.lanes : LANES;
  for (const [named, known] of [[paths, PATHS], [cases, CASES], [lanes, LANES]]) {
    const unknown = named.filter((n) => !known.includes(n));
    if (unknown.length) throw new Error(`unknown ${unknown.join(', ')}: the experiment knows ${known.join(', ')}`);
  }
  const sandbox = args.sandbox ?? 'scoped';
  // the control's bursts are reported; a sitting that must show the cut asks for it (T8, the design session's ruling)
  const burstControl = args.requireBurstCut ? 'cut' : 'report';
  // from here on the spawner refuses every display this process did not create, the person's included (xspawn.mjs)
  delete process.env[LIVE_RUN];
  useDisplay(NO_DISPLAY);
  const server = await startPrivateServer({ out: args.out });
  useDisplay(server.display);
  emit({ kind: 'engine-stop-display', display: server.display, cua_version: xExecFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim(), control_label: controlLabel(args.controlRoot),
    sandbox, load_factor: args.load ? (args.loadFactor ?? 1) : 0, burst_control: burstControl });
  const desktop = new Desktop({ cua: args.cua, run, logs: args.out });
  const runs = args.samplesTrials ?? RUNS;
  const rows = [];
  let wm = null;
  let watched = null;
  let load = null;
  try {
    await desktop.begin({ startRecord: async () => null });
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
    const oracle = new Oracle();
    desktop.oracle = oracle;
    await desktop.openFront('covered');
    const ctx = { desktop, oracle, emit, cua: args.cua, controlRoot: args.controlRoot, sandbox };
    const scenes = await openScenes(ctx);
    load = args.load ? startLoad(emit, args.loadFactor ?? 1) : null;
    // the control last: the keys a killed engine cuts reach the window only with a later FocusIn
    for (const lane of lanes) {
      for (const path of paths) {
        for (const kind of casesOf(path, cases)) for (let i = 0; i < runs; i++) rows.push(await oneRun(ctx, lane, path, kind, scenes, i));
      }
    }
  } finally {
    await load?.stop();
    await desktop.closeAll();
    if (wm) {
      try {
        process.kill(-wm.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    watched = await server.stop();
  }
  const ending = desktopEnding(desktop.ending);
  const { md, failed } = engineStopVerdict(rows, { paths, cases, lanes, sandbox, burstControl });
  for (const f of ending.foreign) failed.push(`a window the experiment did not open was changed: ${f}`);
  if (!watched.clean) failed.push(`the private display's watchdog: ${watched.reason}`);
  if (failed.length) md.push('', `**Incomplete or failed:** ${failed.join('; ')}.`);
  emit({ kind: 'engine-stop-verdict', pass: failed.length === 0, failed });
  return { md, complete: failed.length === 0, failed, ending };
}
