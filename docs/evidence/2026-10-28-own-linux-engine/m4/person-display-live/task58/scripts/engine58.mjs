#!/usr/bin/env node
// Task 58 (#171 M4, T7's idle sitting on the person's display), the exit case: the engine-stop experiment through the
// production stop paths of the REPL host T7b built (the design session's ruling on task 58's stop: M0.4's `:0` cut was
// the exit's unredirect, so `:0` is where the exit settle and T7b's stop are proven). Each run is a fresh `cua serve`
// (or, on `remote`, cua's own Streamable HTTP handler in remote-serve.mjs), isolated as engine-stop.mjs isolates it on a
// private display (`serveEnv`, unchanged: cua's engine as CUA_LINUX_ENGINE_BIN, `dedicated`, the computer surface
// alone, no secrets, the scoped sandbox, this machine's cua home), stopped by one of the paths:
//   idle (end_task, then the idle stop), eof (the stream's end), signal (SIGTERM to the REPL host's supervisor),
//   remote (end_task, then DELETE on the remote session).
// Lanes and cases, as the coordinator's correction sets them for `:0`:
//   - drain (this checkout's REPL host): hold (key_down Shift on the run's xterm, the foreground route; the keymap
//     empty after the stop), burst (16 press_key into the run's covered Chrome; every key in order), handle (a
//     drag_handle started and moved on the run's own windows; no button down after, the pointer at the model's point);
//   - kill (`--control-root`, the REPL host before T7b, whose stop SIGKILLs the tree at once): burst only. No held-input
//     control on `:0`: it would leave Shift or button 1 down on the person's display, and Xvfb already proved it.
// After every run the X server's keymap and buttons are read; anything down is released at once (keyup Shift_L,
// mouseup 1, the only input the run holds), the release checked, and the sitting stops there. A handle run starts
// only when the top window at its start, middle and end points is one of the run's (`Desktop.pointerSafeAt`).
// The experiment's exported judges and readers are used as they are (engine-stop.mjs `runPasses`, `enginesUnder`,
// `stoppedProcesses`, `engineStopVerdict`; focus-timer.mjs's clean start and settled read); its unexported session,
// run and scene functions are copied, with the post-run check and the handle's safety check as the additions.
//
// Where it runs: `--display person` (the sitting): a declared live run on the display it inherits (`:0` under
// run58.sh's guard); `--display private` (the driver's own smoke): a private Xvfb with Openbox, as engine-stop.mjs runs.
// usage: engine58.mjs --display person|private --cua <bin> --control-root <checkout> --out <dir> --run <name>
//        [--paths idle,eof,signal,remote] [--trials N]
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const HARNESS = process.env.CUA171_HARNESS ?? join(homedir(), '.local/share/cua-171/live-43');
const lib = (name) => import(join(HARNESS, 'scripts/linux-engine-diff', name));
const es = await lib('engine-stop.mjs');
const ft = await lib('focus-timer.mjs');
const { openFamily } = await lib('families.mjs');
const { preorder } = await lib('normalize.mjs');
const { Oracle } = await lib('oracle.mjs');
const { Desktop, desktopEnding } = await lib('scenes.mjs');
const { startPrivateServer, xdotool, xprobe } = await lib('xtools.mjs');
const { LIVE_RUN, assertReachable, declareLiveRun, xExecFileSync, xSpawn } = await lib('xspawn.mjs');
const REMOTE_SERVE = join(HARNESS, 'scripts/linux-engine-diff/remote-serve.mjs');

const { values: opts } = parseArgs({ options: { display: { type: 'string' }, cua: { type: 'string' }, 'control-root': { type: 'string' }, out: { type: 'string' }, run: { type: 'string' }, paths: { type: 'string', default: 'idle,eof,signal,remote' }, trials: { type: 'string' }, 'negative-check': { type: 'boolean', default: false } } });
if (!['person', 'private'].includes(opts.display) || !opts.cua || !opts['control-root'] || !opts.out || !opts.run) throw new Error('usage: engine58.mjs --display person|private --cua <bin> --control-root <checkout> --out <dir> --run <name> [--paths …] [--trials N]');
const PATHS = opts.paths.split(',');
for (const p of PATHS) if (!['idle', 'eof', 'signal', 'remote'].includes(p)) throw new Error(`${p}: the production paths are idle, eof, signal and remote`);
const RUNS = opts.trials ? Number(opts.trials) : es.RUNS;
/** The lanes and their cases on `:0` (the coordinator's correction): no held-input control. */
const PLAN = { drain: ['hold', 'burst', 'handle'], kill: ['burst'] };
// the after-run check's own negative test, on a private display only: the control's hold first, which leaves Shift down
if (opts['negative-check']) {
  if (opts.display !== 'private') throw new Error('--negative-check runs only on a private display');
  PLAN.drain = [];
  PLAN.kill = ['hold'];
}
const HANDLE_START = [60, 60];
const HANDLE_MOVE = [80, 30];
const DESKTOP_APPROVAL = '(desktop)';
const RELEASE_KEYSYM = 'Shift_L';
const STOP_BOUND_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(opts.out, { recursive: true });
const results = join(opts.out, 'results.jsonl');
const emit = (row) => appendFileSync(results, `${JSON.stringify({ run: opts.run, ...row })}\n`);

/** A held input left on the display, or one that could not be ruled out: the sitting stops there. */
class LeftDown extends Error {}

// engine-stop.mjs's readers, copied
function buttonsDown() {
  try {
    return JSON.parse(xprobe(['buttons-down']).trim());
  } catch {
    return null;
  }
}
function keysDown() {
  try {
    return JSON.parse(xprobe(['keys-down']).trim());
  } catch {
    return null;
  }
}
function pointerAt() {
  try {
    const shell = Object.fromEntries(xdotool('getmouselocation', '--shell').split('\n').map((l) => l.split('=')));
    return [Number(shell.X), Number(shell.Y)];
  } catch {
    return null;
  }
}
function windowAt(id) {
  const shell = Object.fromEntries(xdotool('getwindowgeometry', '--shell', id).split('\n').map((l) => l.split('=')));
  return [Number(shell.X), Number(shell.Y)];
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
async function goneBy(pids, boundMs = STOP_BOUND_MS) {
  const deadline = performance.now() + boundMs;
  while (performance.now() < deadline) {
    if (allGone(pids)) return performance.now();
    await sleep(2);
  }
  return null;
}

/** engine-stop.mjs `serveEnv`, copied unchanged. */
function serveEnv(ctx, path, extra = {}) {
  return {
    ...process.env,
    CUA_NATIVE_ENGINE: 'cua',
    CUA_LINUX_ENGINE_BIN: ctx.cua,
    CUA_DESKTOP_MODE: 'dedicated',
    CUA_SHIM_SURFACES: 'computer',
    CUA_SHIM_SECRETS: 'off',
    CUA_RUNTIME_IDLE_MS: path === 'idle' ? '1' : '0',
    ...(ctx.sandbox === 'disabled' ? { CUA_SHIM_SANDBOX: 'disabled' } : {}),
    ...extra,
  };
}

/** engine-stop.mjs `approvals`, copied. */
function approvals(app, asked) {
  return (msg) => {
    const named = msg?.params?._meta?.tool_params?.app ?? null;
    const accept = msg?.method === 'elicitation/create' && named === app;
    asked.push({ method: msg?.method ?? null, app: named, action: accept ? 'accept' : 'decline' });
    return accept ? { action: 'accept', content: {} } : { action: 'decline' };
  };
}

/** engine-stop.mjs `stdioSession`, copied. */
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

/** engine-stop.mjs `remoteSession`, copied. */
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
const findWindow = (id) => `const w = (await cua.computer.list_windows({})).find((x) => x.id === ${Number(id)}); if (!w) throw new Error('window ${Number(id)} is not listed');`;

/**
 * After a run: the keymap and the buttons read; anything down is released at once (the only input a run holds is Shift
 * and button 1), the release checked, and the sitting stopped.
 */
function afterRunCheck(row) {
  const keys = keysDown();
  const buttons = buttonsDown();
  row.after_check = { keys, buttons };
  if (keys === null || buttons === null) throw new LeftDown(`the keymap or the buttons could not be read after the run (${JSON.stringify(row.after_check)})`);
  if (!keys.length && !buttons.length) return;
  if (keys.length) xdotool('keyup', RELEASE_KEYSYM);
  if (buttons.length) xdotool('mouseup', 1);
  row.released_by_harness = { keys: keysDown(), buttons: buttonsDown() };
  throw new LeftDown(`input left down after a ${row.lane} ${row.path} ${row.case} run: keys ${JSON.stringify(keys)}, buttons ${JSON.stringify(buttons)}; released by the harness: ${JSON.stringify(row.released_by_harness)}`);
}

/** engine-stop.mjs `oneRun`, copied, with the handle's safety check and the after-run check added. */
async function oneRun(ctx, lane, path, kind, scenes, trial) {
  const { desktop, oracle } = ctx;
  const root = lane === 'drain' ? HARNESS : ctx.controlRoot;
  const scene = kind === 'burst' ? scenes.chrome : scenes.xterm;
  const asked = [];
  const answer = approvals(kind === 'handle' ? DESKTOP_APPROVAL : scene.app, asked);
  const row = { kind: 'engine-stop-run', lane, path, case: kind, sandbox: ctx.sandbox, trial };
  let read = null;
  let before = null;
  if (kind === 'burst') {
    desktop.arrangeFront('covered');
    read = () => ft.textAndCaret(desktop, oracle, scene);
    const { tail } = await ft.cleanStart(ctx, scene, read);
    row.tail_at_start = tail;
    before = await ft.settledRead(read);
  } else {
    const stale = keysDown();
    if (stale === null || stale.length) throw new LeftDown(`keys down before the run: ${JSON.stringify(stale)}`);
    const pressed = buttonsDown();
    if (pressed === null || pressed.length) throw new LeftDown(`buttons down before the run: ${JSON.stringify(pressed)}`);
  }
  const stoppedBefore = new Set(es.stoppedProcesses().map((p) => p.pid));
  let handleEnd = null;
  if (kind === 'handle') {
    const [wx, wy] = windowAt(scene.id);
    const start = { x: wx + HANDLE_START[0], y: wy + HANDLE_START[1] };
    handleEnd = { x: start.x + HANDLE_MOVE[0], y: start.y + HANDLE_MOVE[1] };
    row.handle = { start, end: handleEnd };
    // the drag only over the run's own windows: the top window at its start, middle and end is the run's
    const middle = { x: Math.round((start.x + handleEnd.x) / 2), y: Math.round((start.y + handleEnd.y) / 2) };
    row.handle_safe = [start, middle, handleEnd].map((p) => desktop.pointerSafeAt(p));
    if (!row.handle_safe.every(Boolean)) {
      emit(row);
      throw new LeftDown(`the handle's path is not over the run's windows alone (${JSON.stringify(row.handle_safe)}): no drag was started`);
    }
  }
  const session = path === 'remote' ? await remoteSession(ctx, root, path, answer) : stdioSession(ctx, root, path, answer);
  try {
    await session.initialize();
    const setup = await session.js(`${findWindow(scene.id)} nodeRepl.write('found');`);
    if (!/found/.test(text(setup))) throw new Error(`the session's first cell: ${text(setup).slice(-400)}`);
    const code = {
      hold: `${findWindow(scene.id)} await cua.computer.key_down({window: w, key: ${JSON.stringify(es.HELD)}}); nodeRepl.write('held');`,
      burst: `${findWindow(scene.id)} for (const key of ${JSON.stringify(ft.keysOf(es.BURST))}) await cua.computer.press_key({window: w, key}); nodeRepl.write('sent');`,
      handle: `const h = cua.computer.drag_handle(); await h.start(${JSON.stringify(row.handle?.start)}); await h.move_to(${JSON.stringify(handleEnd)}); nodeRepl.write('held');`,
    }[kind];
    const reply = await session.js(code);
    const answered = performance.now();
    const said = text(reply);
    if (!/held|sent/.test(said.slice(-20))) throw new Error(`the case's cell: ${said.slice(-400)}`);
    const engines = es.enginesUnder(session.pid, ctx.cua);
    row.engines = engines.length;
    if (engines.length !== 1) throw new Error(`${engines.length} engines under the session before the stop, not 1`);
    if (kind === 'hold') row.held_before = (keysDown() ?? []).length > 0;
    if (kind === 'handle') row.buttons_before = buttonsDown();
    const stopped = performance.now();
    if (path === 'eof') session.endInput();
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
    if (kind === 'hold') row.keys_after = keysDown();
    else if (kind === 'handle') {
      row.buttons_after = buttonsDown();
      row.pointer_after = pointerAt();
    } else {
      const after = await ft.settledRead(read, { want: (before.text?.length ?? 0) + es.BURST.length });
      row.in_order = ft.insertedAt(before.text, before.caret, es.BURST, after.text);
      row.got = typeof after.text === 'string' && typeof before.text === 'string' ? after.text.slice(before.caret ?? 0, (before.caret ?? 0) + after.text.length - before.text.length) : null;
    }
  } catch (error) {
    row.error = String(error.message).slice(0, 500);
    row.stderr = session.stderr.slice(-1500);
  } finally {
    await session.close();
  }
  row.approvals = asked;
  row.stopped_left = es.stoppedProcesses().filter((p) => !stoppedBefore.has(p.pid));
  row.ok = es.runPasses(row);
  try {
    afterRunCheck(row);
  } finally {
    emit(row);
  }
  return row;
}

let server = null;
if (opts.display === 'private') {
  delete process.env[LIVE_RUN];
  assertReachable('task 58 engine-stop driver', [], { DISPLAY: ':cua171-task58' });
  process.env.DISPLAY = ':cua171-task58';
  server = await startPrivateServer({ out: opts.out });
  assertReachable('task 58 engine-stop driver', [], { DISPLAY: server.display });
  process.env.DISPLAY = server.display;
} else {
  declareLiveRun('task 58: the engine-stop sitting on the person display');
}
emit({ kind: 'meta', experiment: 'engine-stop (task 58 driver)', display_mode: opts.display, display: process.env.DISPLAY, cua_version: xExecFileSync(opts.cua, ['--version'], { encoding: 'utf8' }).trim(), control_label: es.controlLabel(opts['control-root']), plan: PLAN, paths: PATHS, runs: RUNS, sandbox: 'scoped', load: false, started: new Date().toISOString() });
const desktop = new Desktop({ cua: opts.cua, run: opts.run, logs: opts.out });
const rows = [];
let wm = null;
let watched = null;
let stoppedBy = null;
try {
  await desktop.begin({ startRecord: async () => null });
  if (server) {
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
  }
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  const ctx = { desktop, oracle, cua: opts.cua, controlRoot: opts['control-root'], sandbox: 'scoped' };
  // engine-stop.mjs `openScenes`, copied
  const xterm = await openFamily(desktop, oracle, 'xterm', 'stop-hold');
  const chrome = await openFamily(desktop, oracle, 'chrome', 'stop-burst', { page: ft.KEYS_PAGE });
  chrome.field ??= preorder((await desktop.state(chrome)).ax_tree).find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
  if (!chrome.field) throw new Error('the keys page has no field the harness can read');
  const listed = await desktop.listWindows();
  for (const scene of [xterm, chrome]) {
    scene.app = listed.find((w) => w.id === scene.id)?.app ?? null;
    if (!scene.app) throw new Error(`${scene.label} is not listed with an app`);
  }
  const scenes = { xterm, chrome };
  // the drain first, the control last, as the experiment orders them
  outer: for (const lane of ['drain', 'kill']) {
    for (const path of PATHS) {
      for (const kind of PLAN[lane]) {
        for (let i = 0; i < RUNS; i++) {
          try {
            rows.push(await oneRun(ctx, lane, path, kind, scenes, i));
          } catch (error) {
            if (!(error instanceof LeftDown)) throw error;
            stoppedBy = error.message;
            emit({ kind: 'engine-stop-stopped', lane, path, case: kind, trial: i, why: stoppedBy });
            break outer;
          }
        }
      }
    }
  }
} finally {
  await desktop.closeAll();
  if (wm) {
    try {
      process.kill(-wm.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
  if (server) watched = await server.stop();
}
const ending = desktopEnding(desktop.ending);
const drain = es.engineStopVerdict(rows.filter((r) => r.lane === 'drain'), { paths: PATHS, cases: PLAN.drain, lanes: ['drain'] });
const kill = es.engineStopVerdict(rows.filter((r) => r.lane === 'kill'), { paths: PATHS, cases: PLAN.kill, lanes: ['kill'] });
const md = [...drain.md, ...kill.md.slice(2)];
const failed = [...drain.failed, ...kill.failed];
if (stoppedBy) failed.push(`the sitting stopped: ${stoppedBy}`);
for (const f of ending.foreign) failed.push(`a window the run did not open was changed, or the run went unwatched: ${f}`);
if (watched && !watched.clean) failed.push(`the private display's watchdog: ${watched.reason}`);
if (failed.length) md.push('', `**Incomplete or failed:** ${failed.join('; ')}.`);
emit({ kind: 'engine-stop-verdict', pass: failed.length === 0, failed });
emit({ kind: 'experiment-summary', markdown: md, complete: failed.length === 0, failed, stopped_by: stoppedBy, desktop: ending.record, finished: new Date().toISOString() });
process.stdout.write(`${md.join('\n')}\n`);
process.exit(failed.length ? 1 : 0);
