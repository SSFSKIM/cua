#!/usr/bin/env node
// Task 58 (#171 M4, T7's idle sitting on the person's display), the exit case: the engine-stop experiment's burst case
// through one production stop path of the REPL host T7b built, on the drain lane (this checkout's REPL host), with no
// bare SIGTERM to the engine. Each run is a fresh `cua serve` of the harness checkout, isolated as engine-stop.mjs
// isolates it on a private display (`serveEnv`, unchanged: cua's engine as CUA_LINUX_ENGINE_BIN, `dedicated`, the
// computer surface alone, no secrets, the scoped sandbox, this machine's cua home), 16 press_key one after another into
// the run's own Chrome on the keys page, covered by the front window (the background route and the window's redirect),
// the stop straight after the last answer, every key judged in order at the field's caret once the engine has gone.
// The experiment's exported judges and readers are used as they are (engine-stop.mjs `runPasses`, `enginesUnder`,
// `stoppedProcesses`, `engineStopVerdict`; focus-timer.mjs's clean start and settled read); its unexported session and
// run functions are copied, the burst case's branch alone (the hold and handle cases are XTEST, which on a shared
// display lands where the focus is). No kill lane: through these paths the immediate kill cannot cut (the design
// session, 2026-11-04), so its bursts would be reported only.
//
// Where it runs: `--display person` (the sitting): a declared live run on the display it inherits (`:0` under
// run58.sh's guard); `--display private` (the driver's own smoke): a private Xvfb with Openbox, as engine-stop.mjs runs.
// usage: engine58.mjs --display person|private --cua <bin> --out <dir> --run <name> [--path eof|idle] [--trials N]
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
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
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN, assertReachable, declareLiveRun, xExecFileSync, xSpawn } = await lib('xspawn.mjs');

const { values: opts } = parseArgs({ options: { display: { type: 'string' }, cua: { type: 'string' }, out: { type: 'string' }, run: { type: 'string' }, path: { type: 'string', default: 'eof' }, trials: { type: 'string' } } });
if (!['person', 'private'].includes(opts.display) || !opts.cua || !opts.out || !opts.run) throw new Error('usage: engine58.mjs --display person|private --cua <bin> --out <dir> --run <name> [--path eof|idle] [--trials N]');
if (!['eof', 'idle'].includes(opts.path)) throw new Error('--path is eof or idle: the production stops that send the engine no signal of the harness');
const PATH = opts.path;
const RUNS = opts.trials ? Number(opts.trials) : es.RUNS;
const LANE = 'drain';
const STOP_BOUND_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(opts.out, { recursive: true });
const results = join(opts.out, 'results.jsonl');
const emit = (row) => appendFileSync(results, `${JSON.stringify({ run: opts.run, ...row })}\n`);

/** engine-stop.mjs `allGone` and `goneBy`, copied. */
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

/** engine-stop.mjs `serveEnv`, copied unchanged: this display and bus, cua's engine, `dedicated`, nothing more. */
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

/** engine-stop.mjs `approvals`, copied: accepted only for the scene's own app, everything else declined. */
function approvals(app, asked) {
  return (msg) => {
    const named = msg?.params?._meta?.tool_params?.app ?? null;
    const accept = msg?.method === 'elicitation/create' && named === app;
    asked.push({ method: msg?.method ?? null, app: named, action: accept ? 'accept' : 'decline' });
    return accept ? { action: 'accept', content: {} } : { action: 'decline' };
  };
}

/** engine-stop.mjs `stdioSession`, copied: `cua serve` of checkout `root` on stdio, through the spawner. */
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

const text = (reply) => (reply?.result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
const findWindow = (id) => `const w = (await cua.computer.list_windows({})).find((x) => x.id === ${Number(id)}); if (!w) throw new Error('window ${Number(id)} is not listed');`;

/** engine-stop.mjs `oneRun`, copied: the burst case's branch on the drain lane. */
async function oneRun(ctx, path, scene, trial) {
  const { desktop, oracle } = ctx;
  const asked = [];
  const answer = approvals(scene.app, asked);
  const row = { kind: 'engine-stop-run', lane: LANE, path, case: 'burst', sandbox: ctx.sandbox, trial };
  desktop.arrangeFront('covered');
  const read = () => ft.textAndCaret(desktop, oracle, scene);
  const { tail } = await ft.cleanStart(ctx, scene, read);
  row.tail_at_start = tail;
  const before = await ft.settledRead(read);
  const stoppedBefore = new Set(es.stoppedProcesses().map((p) => p.pid));
  const session = stdioSession(ctx, HARNESS, path, answer);
  try {
    await session.initialize();
    const setup = await session.js(`${findWindow(scene.id)} nodeRepl.write('found');`);
    if (!/found/.test(text(setup))) throw new Error(`the session's first cell: ${text(setup).slice(-400)}`);
    const reply = await session.js(`${findWindow(scene.id)} for (const key of ${JSON.stringify(ft.keysOf(es.BURST))}) await cua.computer.press_key({window: w, key}); nodeRepl.write('sent');`);
    const answered = performance.now();
    const said = text(reply);
    if (!/sent/.test(said.slice(-20))) throw new Error(`the case's cell: ${said.slice(-400)}`);
    const engines = es.enginesUnder(session.pid, ctx.cua);
    row.engines = engines.length;
    if (engines.length !== 1) throw new Error(`${engines.length} engines under the session before the stop, not 1`);
    const stopped = performance.now();
    if (path === 'eof') session.endInput();
    else {
      const ended = await session.call('end_task');
      if (ended.error || ended.timedOut) throw new Error(`end_task: ${JSON.stringify(ended).slice(0, 300)}`);
    }
    const gone = await goneBy(engines);
    row.engine_after_stop_ms = gone === null ? null : Math.round((gone - stopped) * 10) / 10;
    row.engine_after_answer_ms = gone === null ? null : Math.round((gone - answered) * 10) / 10;
    if (gone === null) throw new Error(`the engine still ran ${STOP_BOUND_MS} ms after the stop`);
    const after = await ft.settledRead(read, { want: (before.text?.length ?? 0) + es.BURST.length });
    row.in_order = ft.insertedAt(before.text, before.caret, es.BURST, after.text);
    row.got = typeof after.text === 'string' && typeof before.text === 'string' ? after.text.slice(before.caret ?? 0, (before.caret ?? 0) + after.text.length - before.text.length) : null;
  } catch (error) {
    row.error = String(error.message).slice(0, 500);
    row.stderr = session.stderr.slice(-1500);
  } finally {
    await session.close();
  }
  row.approvals = asked;
  row.stopped_left = es.stoppedProcesses().filter((p) => !stoppedBefore.has(p.pid));
  row.ok = es.runPasses(row);
  emit(row);
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
  declareLiveRun('task 58: the engine-stop burst on the person display');
}
emit({ kind: 'meta', experiment: 'engine-stop (task 58 driver)', display_mode: opts.display, display: process.env.DISPLAY, cua_version: xExecFileSync(opts.cua, ['--version'], { encoding: 'utf8' }).trim(), lane: LANE, path: PATH, case: 'burst', runs: RUNS, sandbox: 'scoped', load: false, started: new Date().toISOString() });
const desktop = new Desktop({ cua: opts.cua, run: opts.run, logs: opts.out });
const rows = [];
let wm = null;
let watched = null;
try {
  await desktop.begin({ startRecord: async () => null });
  if (server) {
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
  }
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  const ctx = { desktop, oracle, cua: opts.cua, sandbox: 'scoped' };
  // engine-stop.mjs `openScenes`, the burst's scene alone: the run's own Chrome on the keys page, with its app
  const chrome = await openFamily(desktop, oracle, 'chrome', 'stop-burst', { page: ft.KEYS_PAGE });
  chrome.field ??= preorder((await desktop.state(chrome)).ax_tree).find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
  if (!chrome.field) throw new Error('the keys page has no field the harness can read');
  chrome.app = (await desktop.listWindows()).find((w) => w.id === chrome.id)?.app ?? null;
  if (!chrome.app) throw new Error(`${chrome.label} is not listed with an app`);
  for (let i = 0; i < RUNS; i++) rows.push(await oneRun(ctx, PATH, chrome, i));
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
const { md, failed } = es.engineStopVerdict(rows, { paths: [PATH], cases: ['burst'], lanes: [LANE] });
for (const f of ending.foreign) failed.push(`a window the run did not open was changed, or the run went unwatched: ${f}`);
if (watched && !watched.clean) failed.push(`the private display's watchdog: ${watched.reason}`);
if (failed.length) md.push('', `**Incomplete or failed:** ${failed.join('; ')}.`);
emit({ kind: 'engine-stop-verdict', pass: failed.length === 0, failed });
emit({ kind: 'experiment-summary', markdown: md, complete: failed.length === 0, failed, desktop: ending.record, finished: new Date().toISOString() });
process.stdout.write(`${md.join('\n')}\n`);
process.exit(failed.length ? 1 : 0);
