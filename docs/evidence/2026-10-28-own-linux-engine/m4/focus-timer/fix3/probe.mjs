// Task 56's never-taken probe (M4 T7): gnome-terminal's key-then-paste at twice the load, the terminal server's X
// connection through an xtrace proxy of the probe's own (lossless: every byte VTE sends or receives passes through it),
// each trace line stamped on arrival. The private display is the harness's own (`startPrivateServer`), the live-run
// declaration withdrawn first, so the spawner refuses every display this process did not create, `:0` included.
//
// The scene is the focus-timer experiment's: Openbox, the front window covering two gnome-terminal windows (A, B), the
// paste scenario (`abcDefgH`, then `type_text` of the run's own text, pipelined, one fresh engine per run, the lane's
// flags), the text read back from the recorder's file as the harness reads it (`settledRead`), the retry guard waited
// out after an unconfirmed paste. Runs go on until `--never-taken N` never-taken runs (transfer `ended`, nothing
// landed) or `--max-runs`.
//
// usage: node probe.mjs <harness dir> <cua-engine> <out dir> [--direct] [--lane timer] [--never-taken 3] [--max-runs 300]
//        [--runs N] [--no-load] [--engine-arg <arg>]...
// `--direct`: no proxy (the control sitting for the proxy's cost); `--runs N`: exactly N runs; each `--engine-arg` is
// one more argument of every run's engine (task 56 fix 3: `--targets-wait-ms <ms>`, measurement only).
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';

const [harness, cua, out, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(name);
const opt = (name, dflt) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : dflt;
};
const direct = flag('--direct');
const lane = opt('--lane', 'timer');
const wantNeverTaken = Number(opt('--never-taken', 3));
const maxRuns = Number(opt('--max-runs', 300));
const exactRuns = opt('--runs', null) === null ? null : Number(opt('--runs'));
const load = !flag('--no-load');
const engineArgs = rest.flatMap((a, i) => (a === '--engine-arg' ? [rest[i + 1]] : []));

const lib = (m) => import(join(harness, 'scripts/linux-engine-diff', m));
const { Engine } = await lib('engine.mjs');
const { openFamily, readText } = await lib('families.mjs');
const { Oracle } = await lib('oracle.mjs');
const { Desktop } = await lib('scenes.mjs');
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN, assertReachable, registerDisplay, xSpawn, xExecFileSync } = await lib('xspawn.mjs');
const { LANES, GUARD_WAIT_MS, UNCONFIRMED, keysOf, pasteTexts, scenario, settledRead } = await lib('focus-timer.mjs');

mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = createWriteStream(join(out, 'runs.jsonl'));
const emit = (o) => {
  const s = JSON.stringify(o);
  rows.write(`${s}\n`);
  console.log(s.slice(0, 400));
};

// from here on the spawner refuses every display this process did not create, the person's included (xspawn.mjs)
delete process.env[LIVE_RUN];
const use = (d) => {
  assertReachable('the never-taken probe', [], { DISPLAY: d });
  process.env.DISPLAY = d;
};
use(':cua171-never-taken-probe');
const server = await startPrivateServer({ out });
use(server.display);

/** The probe's xtrace proxy in front of the private server, each line stamped (performance.now, ms) as it arrives. */
async function startTrace() {
  let n = 40;
  while (existsSync(`/tmp/.X11-unix/X${n}`) || existsSync(`/tmp/.X${n}-lock`)) n++;
  const display = `:${n}`;
  const file = join(out, 'xtrace.stamped.log');
  const sink = createWriteStream(file);
  // no list cut (-m): the connection setup's resource-id base must be read whole
  const child = xSpawn('xtrace', ['-k', '-n', '-d', server.display, '-D', display], { stdio: ['ignore', 'pipe', 'pipe'] });
  let lines = 0;
  createInterface({ input: child.stdout }).on('line', (line) => {
    lines++;
    sink.write(`${performance.now().toFixed(3)} ${line}\n`);
  });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  const deadline = Date.now() + 5000;
  while (!existsSync(`/tmp/.X11-unix/X${n}`)) {
    if (Date.now() > deadline || child.exitCode !== null) throw new Error(`xtrace did not start: ${stderr.trim()}`);
    await sleep(20);
  }
  const release = registerDisplay(display, "the never-taken probe's trace proxy in front of the private server");
  return {
    display,
    file,
    lines: () => lines,
    async stop() {
      release();
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
      await new Promise((r) => sink.end(r));
      // xtrace leaves its display's socket behind when it is ended; a later run would find the number taken
      rmSync(`/tmp/.X11-unix/X${n}`, { force: true });
    },
  };
}

const desktop = new Desktop({ cua, run: 'never-taken-probe', logs: out });
let wm;
let stress;
let trace = null;
let neverTaken = 0;
try {
  await desktop.begin({ startRecord: async () => null });
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1500);
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  if (!direct) trace = await startTrace();
  // the terminal servers (and their clients) connect through the proxy; everything else, the engines included, directly
  const open = async (role) => {
    if (trace) process.env.DISPLAY = trace.display;
    try {
      return await openFamily(desktop, oracle, 'gnome-terminal', role);
    } finally {
      process.env.DISPLAY = server.display;
    }
  };
  const a = await open('focus-a');
  const b = await open('focus-b');
  desktop.arrangeFront('covered');
  await sleep(500);
  emit({ kind: 'meta', version: xExecFileSync(cua, ['--version'], { encoding: 'utf8' }).trim(), lane, engine_args: engineArgs, direct, load, display: server.display, proxy: trace?.display ?? null, a: a.id, b: b.id, a_record: a.record });
  const window = { id: a.id };
  const press = (text) => keysOf(text).map((key) => ({ command: 'press_key', input: { window, key } }));
  // a full screen, as the experiment's earlier scenarios leave it
  {
    const engine = new Engine({ label: 'fill', bin: cua }).start();
    try {
      await engine.pipeline(press('abcDefgHPasted'.repeat(110)));
    } finally {
      await engine.close();
    }
  }
  await sleep(1000);
  if (load) {
    const workers = availableParallelism() * 2;
    stress = spawn('stress-ng', ['--cpu', String(workers), '--cpu-method', 'matrixprod', '--timeout', '3h', '--quiet'], { stdio: 'ignore', detached: true });
    await sleep(5000);
    emit({ kind: 'load', workers });
  }
  const next = pasteTexts();
  const read = () => {
    const text = readText(desktop, oracle, a);
    return Promise.resolve(text).then((t) => ({ text: t, caret: typeof t === 'string' ? t.length : null }));
  };
  for (let trial = 0; trial < (exactRuns ?? maxRuns); trial++) {
    const pasted = next();
    const { requests, expected } = scenario('paste', { a: a.id }, { pasted });
    const before = await settledRead(read);
    const engine = new Engine({ label: `cua-${lane}`, bin: cua, args: [...LANES[lane], ...engineArgs], stats: true }).start();
    const stderrClosed = new Promise((resolve) => engine.child.stderr.once('close', resolve));
    const traceFrom = trace?.lines() ?? null;
    const started = performance.now();
    let responses;
    let answeredAt;
    try {
      ({ responses } = await engine.pipeline(requests));
      answeredAt = performance.now();
    } finally {
      await engine.close();
    }
    const closedAt = performance.now();
    await stderrClosed;
    const after = await settledRead(read, { want: (before.text?.length ?? 0) + expected.a.length });
    const got = typeof after.text === 'string' && typeof before.text === 'string' ? after.text.slice(before.caret) : null;
    const stats = [...engine.statsById.values()].find((s) => s?.paste)?.paste ?? null;
    const answer = responses.at(-1);
    const errors = responses.filter((r) => r.ok !== true).map((r) => String(r.error).slice(0, 300));
    const ok = errors.length === 0 && got === expected.a;
    const kind = ok ? 'ok' : stats?.transfer === 'ended' && got === 'abcDefgH' ? 'never-taken' : 'other';
    if (kind === 'never-taken') neverTaken++;
    // what the recorder received, every byte, in hex where it is not a printable letter
    const bytes = got === null ? null : [...got].map((c) => (/[A-Za-z]/.test(c) ? c : `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`)).join('');
    emit({ kind: 'run', trial, lane, outcome: kind, ok, pasted, got_bytes: bytes, errors, answer_ok: answer.ok === true, started_ms: started, answered_ms: answeredAt - started, closed_ms: closedAt - started, trace_from: traceFrom, paste: stats });
    if (errors.includes(UNCONFIRMED)) {
      await sleep(GUARD_WAIT_MS);
    }
    emit({ kind: 'run-end', trial, at_ms: performance.now(), trace_to: trace?.lines() ?? null });
    if (exactRuns === null && neverTaken >= wantNeverTaken) break;
  }
  await desktop.close([a, b]);
} finally {
  if (stress) {
    try {
      process.kill(-stress.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
  await desktop.closeAll();
  if (wm) {
    try {
      process.kill(-wm.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
  if (trace) await trace.stop();
  const watched = await server.stop();
  emit({ kind: 'end', never_taken: neverTaken, watchdog: watched });
  await new Promise((r) => rows.end(r));
}
