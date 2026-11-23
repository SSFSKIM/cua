#!/usr/bin/env node
// Task 123, ruling 950 (with 951): the x64 activation measurement, linux-engine 0.4.1 against 0.4.2, interleaved. It is
// a development run, never counted. Its base is task 99's activation-872b.mjs (m5/arm64/scripts/), whose method it keeps:
// a fresh engine per run, `activate_window` from the front window, at the instant of the answer a GetInputFocus and a
// read of the root's `_NET_ACTIVE_WINDOW` on an X connection of this script's own (`XReader`), then one `press_key`
// "x" on the desktop route, and the target's own record of the key read after the run.
//
// What it changes from 872b, and why:
//   - The scene: L3a's failing cell. That is chrome-text's `activate_window` (action-settle-cells.mjs: Chrome,
//     pages/matrix.html, its autofocused `Field`), from the front window covering the screen ("covered", as the
//     cell's series ran).
//   - Two engines, one run of each in turn (0.4.1 first in each pair), 200 runs each, on one private display under
//     one load. `--cua` is the pinned 0.4.2, which the runner checks by the pinned rule. `--cua-old` is 0.4.1. Each
//     engine's sha256 is checked here against the pin it comes from before any run.
//   - Each engine is started as the shipped service starts it, `server --desktop shared` (client.mjs `launch`),
//     through the harness's engine client (engine.mjs), the same code path for both. That client has no version
//     check, and the service's (client.mjs `checkVersion`, MIN_ENGINE_VERSION 0.4.2) is not on this path. So nothing
//     steps around it, and no product code is changed.
//   - After the answer it polls GetInputFocus and `_NET_ACTIVE_WINDOW` on its own connection for 500 ms, beside the
//     key, and records when the property first names the target and whether the focus ever leaves it. The witness
//     span of 872b is kept for its focus timeline.
//   - A run that fails to start (an engine that cannot start or a request that throws) is counted apart, not dropped.
//
// The decision rule, fixed before the run (rulings 950 and 951). Call a run "late" when `_NET_ACTIVE_WINDOW` had not
// named the target by answer + 10 ms (L3a's settle). "Clearly above" means the late count is higher on 0.4.2, with a
// one-sided Fisher exact p < 0.05. The reading is (b) only when all three hold:
//   - X focus is on the target at the answer in every run of both engines;
//   - the key lands in the target in every run of both engines;
//   - the late rate is not clearly above.
// A key that lands anywhere else is (c), whatever the property did. Anything else reads "stop", with no further
// interpretation. At these rates the test can catch only a large difference; the summary says so beside it.
//
// usage (under locked.sh): node a950.mjs --cua <0.4.2> --cua-old <0.4.1> --pinned --pilot --load-factor 2
//          --out <dir> --run <name> [--runs n]
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import { performance } from 'node:perf_hooks';

const H = '/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/scripts/linux-engine-diff';
const { parseArgs } = await import(`${H}/cli.mjs`);
const { runExperiment } = await import(`${H}/experiments.mjs`);
const { Engine } = await import(`${H}/engine.mjs`);
const { FAMILIES, openFamily } = await import(`${H}/families.mjs`);
const { verifiedScene } = await import(`${H}/app-identity.mjs`);
const { Oracle } = await import(`${H}/oracle.mjs`);
const { preorder } = await import(`${H}/normalize.mjs`);
const { Desktop, desktopEnding } = await import(`${H}/scenes.mjs`);
const { startWitness } = await import(`${H}/witness.mjs`);
const { XPROBE, startPrivateServer } = await import(`${H}/xtools.mjs`);
const { LIVE_RUN, assertReachable, xExecFileSync } = await import(`${H}/xspawn.mjs`);

const PINS = {
  '0.4.2': 'a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78', // H6's runtime/engine/linux-engine.json
  '0.4.1': 'c432c8c2bc4f905b32a171f439bd5e500724b8ff7f8f961f64a34437d9241626', // H⁗'s (3b5c0441) runtime/engine/linux-engine.json
};

/** task 99's XReader (activation-872b.mjs), unchanged: GetInputFocus and the root's `_NET_ACTIVE_WINDOW`. */
class XReader {
  static async open(display) {
    const n = /^:(\d+)/.exec(display)[1];
    const r = new XReader();
    r.sock = createConnection(`/tmp/.X11-unix/X${n}`);
    r.buf = Buffer.alloc(0);
    r.seq = 0;
    r.pending = new Map();
    r.setup = null;
    await new Promise((resolve, reject) => { r.sock.once('connect', resolve); r.sock.once('error', reject); });
    const ready = new Promise((resolve, reject) => { r.onSetup = resolve; r.sock.once('error', reject); });
    r.sock.on('data', (d) => r.data(d));
    const hello = Buffer.alloc(12);
    hello.write('l', 0, 'latin1');
    hello.writeUInt16LE(11, 2);
    r.sock.write(hello);
    await ready;
    r.atom = (await r.request(16, 0, (() => { const name = Buffer.from('_NET_ACTIVE_WINDOW'); const b = Buffer.alloc(4 + Math.ceil(name.length / 4) * 4); b.writeUInt16LE(name.length, 0); name.copy(b, 4); return b; })())).readUInt32LE(8);
    return r;
  }
  data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (!this.setup) {
      if (this.buf.length < 8) return;
      const total = 8 + this.buf.readUInt16LE(6) * 4;
      if (this.buf.length < total) return;
      if (this.buf[0] !== 1) throw new Error('X connection refused');
      const vlen = this.buf.readUInt16LE(24);
      const nformats = this.buf[29];
      const screen = 40 + Math.ceil(vlen / 4) * 4 + nformats * 8;
      this.setup = { root: this.buf.readUInt32LE(screen) };
      this.buf = this.buf.subarray(total);
      this.onSetup();
    }
    while (this.buf.length >= 32) {
      const kind = this.buf[0];
      const len = kind === 1 ? 32 + this.buf.readUInt32LE(4) * 4 : 32;
      if (this.buf.length < len) return;
      const msg = this.buf.subarray(0, len);
      this.buf = this.buf.subarray(len);
      const seq = msg.readUInt16LE(2);
      const p = this.pending.get(seq);
      if (!p) continue;
      this.pending.delete(seq);
      if (kind === 1) p.resolve(Buffer.from(msg));
      else p.reject(new Error(`X error ${msg[1]} on request ${seq}`));
    }
  }
  request(opcode, data1, body = Buffer.alloc(0)) {
    const head = Buffer.alloc(4);
    head[0] = opcode;
    head[1] = data1;
    head.writeUInt16LE(1 + body.length / 4, 2);
    const seq = (this.seq = (this.seq + 1) & 0xffff);
    const reply = new Promise((resolve, reject) => this.pending.set(seq, { resolve, reject }));
    this.sock.write(Buffer.concat([head, body]));
    return reply;
  }
  async now() {
    const t = performance.now();
    const prop = Buffer.alloc(20);
    prop.writeUInt32LE(this.setup.root, 0);
    prop.writeUInt32LE(this.atom, 4);
    prop.writeUInt32LE(33, 8);
    prop.writeUInt32LE(0, 12);
    prop.writeUInt32LE(1, 16);
    const [f, a] = await Promise.all([this.request(43, 0), this.request(20, 0, prop)]);
    const items = a.readUInt32LE(16);
    return { focus: f.readUInt32LE(8), active: items ? a.readUInt32LE(32) : 0, ms: performance.now() - t, at: t };
  }
  close() { this.sock.destroy(); }
}

const WATCH_MS = 500;
const QUIET_MS = 300;
const SETTLE_MS = 10; // L3a's settle for activate_window (settle.mjs: activate_window 10)
const WARM_MS = 120000;
const KEY = 'x';
const NO_DISPLAY = ':cua171-a950';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tenth = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

const argv = process.argv.slice(2);
const take = (name, dflt) => { const i = argv.indexOf(name); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const RUNS = Number(take('--runs', '200'));
const OLD = take('--cua-old', null);
if (!OLD) throw new Error('--cua-old <0.4.1 engine> is required');
const args = parseArgs(['--experiment', 'qt-activation', ...argv]);

function useDisplay(display) {
  assertReachable('the a950 experiment', [], { DISPLAY: display });
  process.env.DISPLAY = display;
}
function treeOf(id) {
  const out = xExecFileSync('xwininfo', ['-tree', '-id', String(id)], { encoding: 'utf8' });
  return new Set([id, ...[...out.matchAll(/^\s+(0x[0-9a-f]+)/gm)].map((m) => Number.parseInt(m[1], 16))]);
}
const focusNow = () => Number(xExecFileSync('xdotool', ['getwindowfocus', '-f'], { encoding: 'utf8' }).trim());
const recordOf = (oracle, scene) => [...oracle.text(scene.field)].length;
async function settledRecord(oracle, scene) {
  let last = recordOf(oracle, scene);
  for (let i = 0; i < 20; i++) {
    await sleep(100);
    const now = recordOf(oracle, scene);
    if (now === last) return now;
    last = now;
  }
  return last;
}
function whose(id, { target, front, root }) {
  if (id === null || id === undefined) return 'unknown';
  if (target.has(id)) return 'target';
  if (front.has(id)) return 'front';
  if (id === root) return 'root';
  if (id === 0 || id === 1) return id === 0 ? 'none' : 'pointer-root';
  return `other ${id}`;
}

/** One engine's verified identity: its version line and sha256 against the pin it comes from. */
function verify(bin, version) {
  const sha = createHash('sha256').update(readFileSync(bin)).digest('hex');
  const line = xExecFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  if (sha !== PINS[version]) throw new Error(`${bin}: sha256 ${sha} is not ${version}'s pin ${PINS[version]}`);
  if (!line.startsWith(`cua-engine ${version} `)) throw new Error(`${bin}: --version reads ${line}, not ${version}`);
  return { bin, version, sha256: sha, version_line: line };
}

async function oneRun(ctx, scene, engineSpec, trial) {
  const { desktop, oracle, witness, reader, ids } = ctx;
  desktop.arrangeFront('covered');
  await sleep(QUIET_MS);
  const focusBefore = focusNow();
  const before = await settledRecord(oracle, scene);
  const engine = new Engine({ label: `a950-${engineSpec.version}`, bin: engineSpec.bin, args: ['--desktop', 'shared'], stats: false }).start();
  let span;
  try {
    const t0 = performance.now();
    let lead = null;
    span = await witness.span(`a950-${engineSpec.version}-${trial}`, async () => {
      lead = performance.now() - t0;
      const start = performance.now();
      const act = await engine.request('activate_window', { window: { id: scene.id } });
      const answerAt = performance.now();
      const answeredAt = answerAt - start;
      // at the instant of the answer, before anything else is sent
      const precise = await reader.now();
      // then the property and the focus polled on the same connection for 500 ms, beside the key
      const polls = [];
      const polling = (async () => {
        while (performance.now() < answerAt + WATCH_MS) {
          const p = await reader.now();
          polls.push({ t: p.at - answerAt, focus: p.focus, active: p.active });
        }
      })();
      const key = await engine.request('press_key', { key: KEY });
      const keyAnsweredAt = performance.now() - start;
      await polling;
      return { act, answeredAt, precise, polls, key, keyAnsweredAt };
    });
    span.value.lead = lead;
  } finally {
    await engine.close();
  }
  const after = await settledRecord(oracle, scene);
  const { act, answeredAt, precise, polls, key, keyAnsweredAt, lead } = span.value;
  const report = span.report;
  const tAnswer = answeredAt + lead;
  const changes = report.changes ?? [];
  const focusChanges = changes.filter((c) => c.field === 'focus').map((c) => ({ t_ms: c.t_ms, from: c.from, to: c.to, to_is: whose(c.to, ids) }));
  const activeAtAnswer = precise.active === scene.id;
  const firstNamed = activeAtAnswer ? 0 : (polls.find((p) => p.active === scene.id)?.t ?? null);
  const focusLeftPoll = polls.find((p) => whose(p.focus, ids) !== 'target');
  const focusLeftSpan = focusChanges.filter((c) => c.t_ms > tAnswer).find((c) => c.to_is !== 'target');
  const keyLanded = before !== null && after !== null ? after - before : null;
  return {
    engine: engineSpec.version,
    ok: act.response.ok === true,
    error: act.response.ok ? undefined : String(act.response.error).slice(0, 300),
    key_ok: key.response.ok === true,
    answered_ms: tenth(act.ms),
    span_lead_ms: tenth(lead),
    t_key_answered_ms: tenth(keyAnsweredAt),
    focus_before_is: whose(focusBefore, ids),
    focus_at_answer_read_is: whose(precise.focus, ids),
    active_at_answer_read_is: activeAtAnswer ? 'target' : whose(precise.active, ids),
    answer_read_ms: tenth(precise.ms),
    active_named_from_answer_ms: tenth(firstNamed),
    active_named_by_settle: firstNamed !== null && firstNamed <= SETTLE_MS,
    polls: polls.length,
    poll_gap_max_ms: tenth(polls.reduce((m, p, i) => Math.max(m, i ? p.t - polls[i - 1].t : p.t), 0)),
    focus_left_target_poll: focusLeftPoll ? { t_from_answer_ms: tenth(focusLeftPoll.t), to_is: whose(focusLeftPoll.focus, ids) } : null,
    focus_left_target_span: focusLeftSpan ? { t_from_answer_ms: tenth(focusLeftSpan.t_ms - tAnswer), to_is: focusLeftSpan.to_is } : null,
    key_recorded_by_target: keyLanded,
    witness_max_gap_ms: report.max_gap_ms,
  };
}

/** One-sided Fisher exact p for "group B's count is higher": P(X >= kB) under the hypergeometric of the margins. */
function fisherGreater(kA, nA, kB, nB) {
  const lf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
  const lc = (n, k) => lf(n) - lf(k) - lf(n - k);
  const K = kA + kB, N = nA + nB;
  let p = 0;
  for (let x = kB; x <= Math.min(K, nB); x++) p += Math.exp(lc(nB, x) + lc(nA, K - x) - lc(N, K));
  return Math.min(1, p);
}

async function body(runArgs, { emit, run, startLoad }) {
  delete process.env[LIVE_RUN];
  useDisplay(NO_DISPLAY);
  const engines = [verify(OLD, '0.4.1'), verify(runArgs.cua, '0.4.2')];
  const server = await startPrivateServer({ out: runArgs.out });
  useDisplay(server.display);
  emit({ kind: 'a950-display', display: server.display, load_factor: runArgs.load ? (runArgs.loadFactor ?? 1) : 0, engines, runs: RUNS, watch_ms: WATCH_MS, settle_ms: SETTLE_MS, key: KEY });
  const desktop = new Desktop({ cua: runArgs.cua, run, logs: runArgs.out });
  const rows = [];
  const failedStarts = [];
  let wm = null, load = null, witness = null, reader = null, watched = null, scene = null, setupError = null;
  try {
    await desktop.begin({ startRecord: async () => null });
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
    const oracle = new Oracle();
    desktop.oracle = oracle;
    await desktop.openFront('covered');
    witness = await startWitness(XPROBE, { tailMs: 20 });
    reader = await XReader.open(server.display);
    try {
      scene = await openFamily(desktop, oracle, 'chrome', 'a950-chrome-text', { geometry: FAMILIES.chrome.geometry, page: 'matrix.html' });
      await verifiedScene(desktop, oracle, scene, 'chrome');
      const state = await desktop.state(scene);
      scene.field ??= preorder(state.ax_tree).find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
      if (!scene.field) throw new Error('chrome-text: no Field on the page');
      desktop.arrangeFront('covered');
      await sleep(500);
    } catch (error) {
      setupError = String(error.message).slice(0, 300);
      emit({ kind: 'a950-setup-failed', why: setupError });
    }
    load = runArgs.load ? startLoad(emit, runArgs.loadFactor ?? 1) : null;
    // the load's 1-minute average climbs from idle for about two minutes: the runs start once it has, as L3a's cell ran
    // late in its step at full load
    if (load) { await sleep(WARM_MS); emit({ kind: 'load', loadavg_warm: loadavg(), after_ms: WARM_MS }); }
    if (!setupError) {
      const root = Number.parseInt(/Window id: (0x[0-9a-f]+)/.exec(xExecFileSync('xwininfo', ['-root'], { encoding: 'utf8' }))[1], 16);
      const ids = { target: treeOf(scene.id), front: treeOf(desktop.front.id), root };
      emit({ kind: 'a950-scene', window: scene.id, target_tree: [...ids.target], front: desktop.front.id, front_tree: [...ids.front] });
      for (let trial = 0; trial < RUNS; trial++) {
        for (const spec of engines) {
          try {
            const row = await oneRun({ desktop, oracle, witness, reader, ids }, scene, spec, trial);
            row.trial = trial;
            rows.push(row);
            emit({ kind: 'a950-run', ...row });
          } catch (error) {
            const f = { engine: spec.version, trial, why: String(error.message).slice(0, 300) };
            failedStarts.push(f);
            emit({ kind: 'a950-failed-start', ...f });
          }
        }
      }
    }
  } finally {
    if (load) await load.stop();
    if (witness) await witness.stop();
    if (reader) reader.close();
    await desktop.closeAll();
    if (wm) { try { process.kill(-wm.pid, 'SIGTERM'); } catch { /* gone */ } }
    watched = await server.stop();
  }
  const ending = desktopEnding(desktop.ending);
  const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
  const per = {};
  for (const spec of engines) {
    const r = rows.filter((x) => x.engine === spec.version);
    const lag = r.map((x) => x.active_named_from_answer_ms).filter((v) => v !== null);
    per[spec.version] = {
      runs: r.length,
      failed_starts: failedStarts.filter((f) => f.engine === spec.version).length,
      answered_ok: r.filter((x) => x.ok).length,
      focus_at_answer: r.filter((x) => x.focus_at_answer_read_is === 'target').length,
      active_at_answer: r.filter((x) => x.active_at_answer_read_is === 'target').length,
      active_by_settle: r.filter((x) => x.active_named_by_settle).length,
      late: r.filter((x) => !x.active_named_by_settle).length,
      never_named: r.filter((x) => x.active_named_from_answer_ms === null).length,
      lag_median: tenth(q(lag, 0.5)), lag_p95: tenth(q(lag, 0.95)), lag_max: tenth(lag.length ? Math.max(...lag) : null),
      focus_left: r.filter((x) => x.focus_left_target_poll || x.focus_left_target_span).length,
      key_in_target: r.filter((x) => x.key_recorded_by_target === 1).length,
      key_elsewhere: r.filter((x) => x.key_recorded_by_target !== 1).length,
    };
  }
  const a = per['0.4.1'], b = per['0.4.2'];
  const p = fisherGreater(a.late, a.runs, b.late, b.runs);
  const clearlyAbove = p < 0.05 && b.late / b.runs > a.late / a.runs;
  const focusAll = a.focus_at_answer === a.runs && b.focus_at_answer === b.runs && a.runs === RUNS && b.runs === RUNS;
  const keyAll = a.key_in_target === a.runs && b.key_in_target === b.runs;
  const failed = [
    ...(setupError ? [`the scene: ${setupError}`] : []),
    ...(failedStarts.length ? [`${failedStarts.length} runs failed to start`] : []),
    ...(ending.foreign ?? []).map((f) => `a window the experiment did not open was changed: ${f}`),
    ...(watched.clean ? [] : [`the private display's watchdog: ${watched.reason}`]),
  ];
  const reading = !keyAll ? 'c' : focusAll && !clearlyAbove && !failed.length ? 'b' : 'stop';
  const md = [
    '# ruling 950: the x64 activation measurement, 0.4.1 against 0.4.2 (development run, never counted)',
    '',
    `chrome-text's activate_window from the front window (covered), ${RUNS} runs per engine alternating, at load factor ${runArgs.load ? (runArgs.loadFactor ?? 1) : 0}; at the answer GetInputFocus and _NET_ACTIVE_WINDOW on a connection of the experiment's own, then both polled ${WATCH_MS} ms beside press_key "${KEY}".`,
    '',
    '| engine | runs | failed to start | answered ok | X focus on the target at the answer | _NET_ACTIVE_WINDOW the target at the answer | … by answer + 10 ms | late (not by + 10 ms) | never in 500 ms | lag after the answer median / p95 / max ms | focus left the target in 500 ms | key in the target |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|',
    ...engines.map(({ version: v }) => { const e = per[v]; return `| ${v} | ${e.runs} | ${e.failed_starts} | ${e.answered_ok} | ${e.focus_at_answer} | ${e.active_at_answer} | ${e.active_by_settle} | ${e.late} | ${e.never_named} | ${e.lag_median} / ${e.lag_p95} / ${e.lag_max} | ${e.focus_left} | ${e.key_in_target} |`; }),
    '',
    `Late rates: 0.4.1 ${a.late}/${a.runs}, 0.4.2 ${b.late}/${b.runs}; one-sided Fisher exact p (0.4.2 higher) = ${p.toPrecision(3)}: ${clearlyAbove ? 'clearly above' : 'not clearly above'}. At these rates the test can catch only a large difference.`,
    '',
    `The reading by the rule fixed before the run: ${reading === 'b' ? '(b): the focus on the target at the answer in every run of both engines, the key in the target in every run, and the late rate not clearly above' : reading === 'c' ? '(c): a key landed outside the target' : 'stop: a condition of (b) does not hold (see the table and the rows)'}.`,
  ];
  if (failed.length) md.push('', `**Incomplete:** ${failed.join('; ')}.`);
  emit({ kind: 'experiment-summary', markdown: md, complete: failed.length === 0, failed, reading, per, fisher_p: p, clearly_above: clearlyAbove, desktop: ending.record, finished: new Date().toISOString() });
  process.stdout.write(`${md.join('\n')}\n`);
  return failed.length === 0;
}

const { spawn, execFileSync } = await import('node:child_process');
const { availableParallelism, loadavg } = await import('node:os');
function startLoad(emit, factor = 1) {
  const cores = availableParallelism();
  const child = spawn('stress-ng', ['--cpu', String(cores * factor), '--cpu-method', 'matrixprod', '--timeout', '3h', '--quiet'], { stdio: 'ignore', detached: true });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const end = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } };
  process.once('exit', end);
  emit({ kind: 'load', started: true, cores, workers: cores * factor, pid: child.pid, loadavg_before: loadavg() });
  execFileSync('sleep', ['5']);
  emit({ kind: 'load', loadavg_running: loadavg() });
  return { async stop() { emit({ kind: 'load', loadavg_at_end: loadavg() }); end(); await exited; emit({ kind: 'load', stopped: true }); } };
}
const complete = await runExperiment(args, {
  start: async (runArgs, { emit }) => {
    emit({ kind: 'meta', experiment: 'a950', commit: execFileSync('git', ['-C', H, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), load: runArgs.load, load_factor: runArgs.loadFactor ?? null, started: new Date().toISOString() });
    return body(runArgs, { emit, run: runArgs.run, startLoad });
  },
});
process.exit(complete ? 0 : 1);
