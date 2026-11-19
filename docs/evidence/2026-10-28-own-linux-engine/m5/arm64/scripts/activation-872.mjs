#!/usr/bin/env node
// Task 99 (T7, ruling 872): the activation experiment, a development run, never counted. Whether cua's engine
// (linux-engine-v0.4.1, the pinned home's, taken by the pinned rule) answers `activate_window` only once the X input
// focus is on the target, and whether the focus stays there, at twice the gate's load, per family: gedit, kate,
// qtcreator, writer and gnome-terminal.
//
// It lives outside the harness and the H'''' checkout, which it imports read-only (scripts/linux-engine-diff at
// 3b5c0441): the harness's experiment runner (`runExperiment`, its candidate check and labels, given this body as
// `start`), its Desktop, families, witness and engine client. Everything runs on a private X server it starts, with
// Openbox, as the qt-activation experiment does (qt-activation.mjs); the load is stress-ng at twice the gate's
// (`--load-factor 2`, 16 workers on 8 cores), as the twice-load block runs.
//
// One run, per family, `--trials` of them (default 40):
//   1. the front window (an xterm) covering the screen, active and focused (`arrangeFront('covered')`, read back);
//   2. a fresh engine, then inside one witness span (xprobe witness: GetInputFocus and the pointer sampled every 5 ms,
//      every `_NET_ACTIVE_WINDOW` and stacking change as its PropertyNotify comes, every FocusIn/FocusOut and activation
//      request, each with its time from the span's start):
//        - `activate_window` to the target, timed from its write to its answer;
//        - at once on its answer, one `press_key` "x" on the desktop route (no window: XTEST, delivered to whatever has
//          the X focus);
//        - the span held open until 500 ms after the answer;
//   3. after the span, where the key landed: the target's own record of it (the editor field's text, Writer's
//      paragraphs, the terminal's input record) read until it settles.
// Per run it records: the answer time; the X focus at the answer (from the span's focus timeline, which starts at the
// front window, read before the span); every focus change in the span, before and after the answer; when
// `_NET_ACTIVE_WINDOW` first named the target; the focus when the key was sent; and whether the target recorded the
// key. A run is (b)-consistent when the focus is on the target at the answer, never leaves it in the 500 ms, and the
// key lands in the target; ruling 872 reads any other run, in any family, as (a).
//
// Times: the span's clock starts when the witness begins the span, a round trip before this process's own clock for
// the run starts (`span_lead_ms`, measured per run as the time from writing `begin` to the witness's reply), so an
// event's time relative to the answer is exact up to that lead.
//
// usage (under locked.sh): node activation-872.mjs --cua <home>/engine/linux/cua-engine --pinned --pilot
//          --load-factor 2 --out <dir> --run <name> [--family a,b] [--trials n]
import { readFileSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const H = '/Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/scripts/linux-engine-diff';
const { parseArgs } = await import(`${H}/cli.mjs`);
const { runExperiment } = await import(`${H}/experiments.mjs`);
const { Engine } = await import(`${H}/engine.mjs`);
const { openFamily } = await import(`${H}/families.mjs`);
const { verifiedScene } = await import(`${H}/app-identity.mjs`);
const { Oracle } = await import(`${H}/oracle.mjs`);
const { Desktop, activeWindow, desktopEnding } = await import(`${H}/scenes.mjs`);
const { startWitness } = await import(`${H}/witness.mjs`);
const { XPROBE, startPrivateServer } = await import(`${H}/xtools.mjs`);
const { LIVE_RUN, assertReachable, xExecFileSync } = await import(`${H}/xspawn.mjs`);
const { writeSummary } = await import(`${H}/report.mjs`);

const FAMILIES = ['gedit', 'kate', 'qtcreator', 'writer', 'gnome-terminal'];
const WATCH_MS = 500;
const QUIET_MS = 300;
const KEY = 'x';
const NO_DISPLAY = ':cua171-activation-872';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tenth = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

// the harness's parser takes a known experiment name; this body replaces the experiment proper (`start`)
const argv = process.argv.slice(2);
let trials = 40;
const ti = argv.indexOf('--trials');
if (ti >= 0) { trials = Number(argv[ti + 1]); argv.splice(ti, 2); }
const args = parseArgs(['--experiment', 'qt-activation', ...argv]);

function useDisplay(display) {
  assertReachable('the activation-872 experiment', [], { DISPLAY: display });
  process.env.DISPLAY = display;
}

/** A window and every window under it, from xwininfo's tree: the ids the X focus may name for it. */
function treeOf(id) {
  const out = xExecFileSync('xwininfo', ['-tree', '-id', String(id)], { encoding: 'utf8' });
  return new Set([id, ...[...out.matchAll(/^\s+(0x[0-9a-f]+)/gm)].map((m) => Number.parseInt(m[1], 16))]);
}

/** The X focus window now (xdotool), as a number. */
const focusNow = () => Number(xExecFileSync('xdotool', ['getwindowfocus', '-f'], { encoding: 'utf8' }).trim());

/** What the target recorded of typed keys: a length that grows by one per key it took. */
function recordOf(oracle, scene) {
  if (scene.kindOf === 'terminal') return scene.record && existsSync(scene.record) ? readFileSync(scene.record, 'latin1').length : null;
  if (scene.field) return [...oracle.text(scene.field)].length;
  if (scene.document) return oracle.children(scene.document).filter((id) => oracle.role(id) === 'paragraph').reduce((n, id) => n + [...oracle.text(id)].length, 0);
  return null;
}

/** The record once two reads 100 ms apart agree (an application still taking the key moves under the first). */
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

/** Whose a window id is: the target's, the front window's, the root, none, or another. */
function whose(id, { target, front, root }) {
  if (id === null || id === undefined) return 'unknown';
  if (target.has(id)) return 'target';
  if (front.has(id)) return 'front';
  if (id === root) return 'root';
  if (id === 0 || id === 1) return id === 0 ? 'none' : 'pointer-root';
  return `other ${id}`;
}

async function oneRun(ctx, scene, trial) {
  const { desktop, oracle, witness, ids } = ctx;
  desktop.arrangeFront('covered');
  await sleep(QUIET_MS);
  const focusBefore = focusNow();
  const before = await settledRecord(oracle, scene);
  const engine = new Engine({ label: 'a872', bin: ctx.args.cua, args: [], stats: false }).start();
  let span;
  try {
    const t0 = performance.now();
    let lead = null;
    span = await witness.span(`${scene.family}-${trial}`, async () => {
      lead = performance.now() - t0;
      const start = performance.now();
      const act = await engine.request('activate_window', { window: { id: scene.id } });
      const answeredAt = performance.now() - start;
      const key = await engine.request('press_key', { key: KEY });
      const keyAnsweredAt = performance.now() - start;
      const until = start + answeredAt + WATCH_MS;
      while (performance.now() < until) await sleep(5);
      return { act, answeredAt, key, keyAnsweredAt };
    });
    span.value.lead = lead;
  } finally {
    await engine.close();
  }
  const after = await settledRecord(oracle, scene);
  const { act, answeredAt, key, keyAnsweredAt, lead } = span.value;
  const report = span.report;
  // the span's times are the witness's; the answer, in them, is the request's own time plus the begin round trip's lead
  const tAnswer = answeredAt + lead;
  const tKey = keyAnsweredAt + lead;
  const changes = report.changes ?? [];
  const focusChanges = changes.filter((c) => c.field === 'focus').map((c) => ({ t_ms: c.t_ms, from: c.from, to: c.to, to_is: whose(c.to, ids) }));
  const focusAt = (t) => focusChanges.filter((c) => c.t_ms <= t).reduce((f, c) => c.to, focusBefore);
  const activeNamed = changes.find((c) => c.field === 'active' && Array.isArray(c.to) && c.to.includes(scene.id));
  const atAnswer = focusAt(tAnswer);
  const afterAnswer = focusChanges.filter((c) => c.t_ms > tAnswer);
  const left = afterAnswer.find((c) => c.to_is !== 'target');
  const keyLanded = before !== null && after !== null ? after - before : null;
  const consistent = whose(atAnswer, ids) === 'target' && !left && keyLanded === 1 && act.response.ok === true;
  return {
    ok: act.response.ok === true,
    error: act.response.ok ? undefined : String(act.response.error).slice(0, 300),
    key_ok: key.response.ok === true,
    answered_ms: tenth(act.ms),
    span_lead_ms: tenth(lead),
    t_answer_ms: tenth(tAnswer),
    t_key_answered_ms: tenth(tKey),
    focus_before: focusBefore,
    focus_before_is: whose(focusBefore, ids),
    focus_at_answer: atAnswer,
    focus_at_answer_is: whose(atAnswer, ids),
    focus_changes: focusChanges.map((c) => ({ ...c, t_from_answer_ms: tenth(c.t_ms - tAnswer) })),
    focus_left_target_after_answer: left ? { t_from_answer_ms: tenth(left.t_ms - tAnswer), to: left.to, to_is: left.to_is } : null,
    active_named_target_from_answer_ms: activeNamed ? tenth(activeNamed.t_ms - tAnswer) : null,
    focus_at_key_is: whose(focusAt(tKey), ids),
    key_recorded_by_target: keyLanded,
    activations: (report.focus ?? []).filter((e) => e.kind === 'activate').map((e) => ({ window: e.window, source: e.source, t_from_answer_ms: tenth(e.t_ms - tAnswer) })),
    focus_events: (report.focus ?? []).filter((e) => e.kind !== 'activate').map((e) => ({ ...e, t_from_answer_ms: tenth(e.t_ms - tAnswer) })),
    witness_max_gap_ms: report.max_gap_ms,
    consistent_with_b: consistent,
  };
}

async function body(runArgs, { emit, run, startLoad }) {
  delete process.env[LIVE_RUN];
  useDisplay(NO_DISPLAY);
  const cuaVersion = xExecFileSync(runArgs.cua, ['--version'], { encoding: 'utf8' }).trim();
  const server = await startPrivateServer({ out: runArgs.out });
  useDisplay(server.display);
  const families = runArgs.families.length ? runArgs.families : FAMILIES;
  emit({ kind: 'activation-872-display', display: server.display, load_factor: runArgs.load ? (runArgs.loadFactor ?? 1) : 0, cua_version: cuaVersion, families, trials, watch_ms: WATCH_MS, key: KEY });
  const desktop = new Desktop({ cua: runArgs.cua, run, logs: runArgs.out });
  const rows = [];
  const skipped = [];
  let wm = null;
  let load = null;
  let witness = null;
  let watched = null;
  try {
    await desktop.begin({ startRecord: async () => null });
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
    const oracle = new Oracle();
    desktop.oracle = oracle;
    await desktop.openFront('covered');
    witness = await startWitness(XPROBE, { tailMs: 20 });
    load = runArgs.load ? startLoad(emit, runArgs.loadFactor ?? 1) : null;
    const root = Number.parseInt(/Window id: (0x[0-9a-f]+)/.exec(xExecFileSync('xwininfo', ['-root'], { encoding: 'utf8' }))[1], 16);
    for (const family of families) {
      let scene;
      try {
        scene = await verifiedScene(desktop, oracle, await openFamily(desktop, oracle, family, 'a872'), family);
        if (recordOf(oracle, scene) === null) throw new Error(`${family}: no record of typed keys the experiment can read`);
        desktop.arrangeFront('covered');
        await sleep(500);
      } catch (error) {
        skipped.push({ family, why: String(error.message).slice(0, 300) });
        emit({ kind: 'activation-872-skipped', family, why: String(error.message).slice(0, 300) });
        continue;
      }
      try {
        const ids = { target: treeOf(scene.id), front: treeOf(desktop.front.id), root };
        emit({ kind: 'activation-872-scene', family, window: scene.id, target_tree: [...ids.target], front: desktop.front.id, front_tree: [...ids.front] });
        for (let trial = 0; trial < trials; trial++) {
          const row = await oneRun({ desktop, oracle, witness, ids, args: runArgs }, scene, trial);
          row.family = family;
          row.trial = trial;
          rows.push(row);
          emit({ kind: 'activation-872-run', ...row });
        }
      } finally {
        await desktop.close([scene]);
      }
    }
  } finally {
    if (load) await load.stop();
    if (witness) await witness.stop();
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
  const md = [
    '# ruling 872: the activation experiment (development run, never counted)',
    '',
    `Per family, ${trials} runs at load factor ${runArgs.load ? (runArgs.loadFactor ?? 1) : 0}: activate_window from the front window, then press_key "${KEY}" on the desktop route at the answer, the focus watched ${WATCH_MS} ms past the answer.`,
    '',
    '| family | runs | answered ok | X focus on the target at the answer | focus left the target in the 500 ms | key recorded by the target | _NET_ACTIVE_WINDOW named the target, ms from the answer (median / max; never) | answer median / max ms | (b)-consistent |',
    '|---|---:|---:|---:|---:|---:|---|---|---:|',
  ];
  const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  for (const family of families) {
    const r = rows.filter((x) => x.family === family);
    if (!r.length) continue;
    const named = r.map((x) => x.active_named_target_from_answer_ms).filter((v) => v !== null);
    const ans = r.map((x) => x.answered_ms);
    md.push(`| ${family} | ${r.length} | ${r.filter((x) => x.ok).length} | ${r.filter((x) => x.focus_at_answer_is === 'target').length} | ${r.filter((x) => x.focus_left_target_after_answer).length} | ${r.filter((x) => x.key_recorded_by_target === 1).length} | ${named.length ? `${tenth(med(named))} / ${tenth(Math.max(...named))}` : '–'}; never ${r.length - named.length} | ${tenth(med(ans))} / ${tenth(Math.max(...ans))} | ${r.filter((x) => x.consistent_with_b).length} |`);
  }
  const all = rows.length && rows.every((x) => x.consistent_with_b);
  const failed = [...skipped.map((s) => `${s.family} not measured: ${s.why}`), ...(ending.foreign ?? []).map((f) => `a window the experiment did not open was changed: ${f}`), ...(watched.clean ? [] : [`the private display's watchdog: ${watched.reason}`])];
  md.push('', `Ruling 872's reading: ${all && !failed.length ? '(b): every run had the X focus on the target at the answer, kept it for 500 ms, and the key landed in the target' : '(a): at least one run missed (see the table and the rows)'}.`);
  if (failed.length) md.push('', `**Incomplete:** ${failed.join('; ')}.`);
  emit({ kind: 'experiment-summary', markdown: md, complete: failed.length === 0, failed, reading: all && !failed.length ? 'b' : 'a', desktop: ending.record, finished: new Date().toISOString() });
  process.stdout.write(`${md.join('\n')}\n`);
  try { writeSummary(runArgs.out); } catch { /* the harness's summary renderer may not know these rows */ }
  return failed.length === 0;
}

// the runner's own setup (the candidate check by the pinned rule, the labels), this experiment as its body; the load is
// the runner's (experiments.mjs keeps startLoad private: the same stress-ng, started here as it starts it)
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
    emit({ kind: 'meta', experiment: 'activation-872', commit: execFileSync('git', ['-C', H, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), families: runArgs.families, load: runArgs.load, load_factor: runArgs.loadFactor ?? null, started: new Date().toISOString() });
    return body(runArgs, { emit, run: runArgs.run, startLoad });
  },
});
process.exit(complete ? 0 : 1);
