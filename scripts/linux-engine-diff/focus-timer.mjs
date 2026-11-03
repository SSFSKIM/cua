// The FocusOut timer's proof (M4's T7; the design session's rulings, M4 pre-flight, "The timer and the settle"):
// `--experiment focus-timer`. cua's engine answers a background request as soon as its input is sent and sends the
// window's synthetic FocusOut 100 ms after its last input, on a timer (the engine's `focus_timer.rs`); a FocusOut sooner
// than that after a pipelined burst is what makes Chromium cut its last keys and deliver them with the next FocusIn, out
// of order (M0.4). Per application family that takes background keys, in two lanes, the engine as it ships (`timer`)
// and a control with no delay (`control`, `--teardown-ms 0`, the FocusOut sent as each request's input ends):
//
// - `burst`: one window, pipelined `press_key` requests (Shift chords among them), the exact text read back;
// - `aba`: window A, then B, then A again, pipelined, each window's exact text and its order;
// - `paste`: keys to a window, then a `type_text` to it, pipelined, the exact text and its order.
//
// Each is read back from the window's own text at its caret (the caret read before the run), so a key cut and delivered
// later, or a paste that lands before keys sent ahead of it, fails the run. The timer lane must pass 30 consecutive
// runs of each scenario (a miss restarts the series and is reported); the control lane must show the reorder on the
// Chromium families (Chrome, Electron), which proves the test can see it. Then, per family and lane, an audit pass with
// the engine's connection through xtrace and its `--stats` records: every FocusOut in the trace is attributed to the
// request whose input started its timer (audit.mjs `attributeFocusOuts`), each synthetic-focus session is one burst's,
// no two windows are under synthetic focus at once, and on the timer lane no FocusOut comes sooner than 100 ms after its
// window's last input. Last, the exit drain on the bytes under test: SIGTERM straight after a burst's last answer,
// inside the 100 ms, must leave every key of the burst in order, its FocusOut in the trace and an exit of 128 + 15;
// SIGKILL, the documented limit, is the control that leaves the session unclosed.
//
// Where it runs: only on a private X server it starts itself (`startPrivateServer`, under its watchdog and marked
// private), with Openbox, and the harness's own Desktop on it: the run's own applications, homes and session bus, its
// own Chrome and Electron. Before anything starts it withdraws the harness's live-run declaration, so the spawner refuses
// any display this process did not create, `:0` included (xspawn.mjs). `--load-factor 2` runs it under twice the gate's
// load (16 stress-ng workers on 8 cores).

import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';

import { attributeFocusOuts, auditRequests, focusSessions, parseXtrace, startProxy } from './audit.mjs';
import { Engine } from './engine.mjs';
import { openFamily, readCaret, readText } from './families.mjs';
import { preorder } from './normalize.mjs';
import { Oracle } from './oracle.mjs';
import { Desktop, desktopEnding } from './scenes.mjs';
import { median } from './stats.mjs';
import { startPrivateServer } from './xtools.mjs';
import { LIVE_RUN, assertReachable, xExecFileSync } from './xspawn.mjs';

/** The families of the matrix whose background keys cua sends (GTK 4 and xterm refuse keys in shared mode). */
export const FAMILIES = ['chrome', 'electron', 'gedit', 'kate', 'qtcreator', 'firefox', 'writer', 'writer-gen', 'gnome-terminal'];
/** The families whose control lane must show the reorder: Chromium, where M0.4 saw a sooner FocusOut cut keys. */
export const CHROMIUM = ['chrome', 'electron'];
/** Chromium's scene page: a field whose page spends a few milliseconds on each key (pages/keys.html). */
export const KEYS_PAGE = 'keys.html';
export const SCENARIOS = ['burst', 'aba', 'paste'];
/** The engine's delay from a window's last input to its FocusOut. */
export const DELAY_MS = 100;
/** Consecutive passing runs a timer-lane series needs, and the runs it may take to get them. */
export const CONSECUTIVE = 30;
export const MAX_RUNS = 60;
export const CONTROL_RUNS = 10;
export const SIGTERM_RUNS = 10;
export const SIGKILL_RUNS = 3;
export const LANES = { timer: [], control: ['--teardown-ms', '0'] };
/** A SIGTERM run's exit after the burst's last answer, at most: its drain (at most the delay), not the engine's 2 s backstop. */
export const EXIT_WITHIN_MS = 1500;

const NO_DISPLAY = ':cua171-focus-timer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The keys of a text the layout types at levels 1 and 2: a capital is `shift+<letter>`. */
export function keysOf(text) {
  return [...text].map((c) => (c >= 'A' && c <= 'Z' ? `shift+${c.toLowerCase()}` : c));
}

/**
 * A scenario's requests on windows `a` and `b` (ids) and the text each window must gain at its caret. The texts are
 * the same every run, letters only (no space, so no autocorrection; a run's word typed again is completed by Writer to
 * exactly itself), capitals among them so Shift chords ride the burst.
 */
export function scenario(name, { a, b }) {
  const press = (window, text) => keysOf(text).map((key) => ({ command: 'press_key', input: { window: { id: window }, key } }));
  if (name === 'burst') {
    const text = 'abcDefgHijkLmnoPqrsT';
    return { requests: press(a, text), expected: { a: text } };
  }
  if (name === 'aba') {
    const [first, other, again] = ['abcDefgH', 'ijkLmnoP', 'qrsTuvwX'];
    return { requests: [...press(a, first), ...press(b, other), ...press(a, again)], expected: { a: first + again, b: other } };
  }
  if (name === 'paste') {
    const [typed, pasted] = ['abcDefgH', 'Pasted'];
    return { requests: [...press(a, typed), { command: 'type_text', input: { window: { id: a }, text: pasted } }], expected: { a: typed + pasted } };
  }
  throw new Error(`unknown scenario ${name}`);
}

/** Whether `after` is `before` with `inserted` put at `caret`, exactly. */
export function insertedAt(before, caret, inserted, after) {
  return typeof before === 'string' && typeof after === 'string' && Number.isInteger(caret) && caret >= 0 && caret <= before.length && after === before.slice(0, caret) + inserted + before.slice(caret);
}

/**
 * A series' verdict: the runs in order (`ok`), whether `need` consecutive passes came (the series stops there), and the
 * misses, each of which restarted it.
 */
export function seriesVerdict(oks, need = CONSECUTIVE) {
  let streak = 0;
  let reached = false;
  for (const ok of oks) {
    streak = ok ? streak + 1 : 0;
    if (streak >= need) reached = true;
  }
  return { runs: oks.length, misses: oks.filter((ok) => !ok).length, streak, reached };
}

/**
 * The synthetic-focus sessions a scenario must leave in the trace, by window, in order: on the timer lane one per burst
 * (A's flushed by B, B's by A again, a window's keys by its paste); on the control lane one per request.
 */
export function expectedSessions(name, lane, { a, b }) {
  const { requests } = scenario(name, { a, b });
  if (lane === 'control') return requests.map((r) => r.input.window.id);
  return { burst: [a], aba: [a, b, a], paste: [a, a] }[name];
}

/** A scene's text and caret, as one offset into that text (`families.mjs` `readCaret`; a terminal's text grows at its end). */
async function textAndCaret(desktop, oracle, scene) {
  const text = await readText(desktop, oracle, scene);
  if (text === null) return { text, caret: null };
  if (scene.kindOf === 'terminal') return { text, caret: text.length };
  const caret = await readCaret(desktop, oracle, scene);
  if (!caret) return { text, caret: null };
  if (scene.kindOf === 'paragraphs') {
    if (caret.paragraph === null) return { text, caret: null };
    const paragraphs = text.split('\n');
    const at = paragraphs.slice(0, caret.paragraph).reduce((n, p) => n + p.length + 1, 0) + caret.caret;
    return { text, caret: at };
  }
  return { text, caret: caret.caret };
}

/** Reads until two reads 150 ms apart agree (a covered Chromium page updates its tree late), at most 5 s. */
async function settledRead(read) {
  const started = Date.now();
  let previous = JSON.stringify(await read());
  for (;;) {
    await sleep(150);
    const now = await read();
    const same = JSON.stringify(now) === previous;
    if (same || Date.now() - started > 5000) return { ...now, settled: same };
    previous = JSON.stringify(now);
  }
}

/**
 * The engine's `--stats` records of its FocusOuts, in the order it wrote them: each `{window, cause, after_input_ms,
 * scheduled_by, reported_on}`, `reported_on` the id of the request whose line carried it, null for a line of its own.
 */
function collectFocusOuts(engine) {
  const records = [];
  const closed = new Promise((resolve) => engine.child.stderr.once('close', resolve));
  createInterface({ input: engine.child.stderr }).on('line', (line) => {
    if (!line.startsWith('{"stats"')) return;
    try {
      const { stats } = JSON.parse(line);
      for (const out of stats.focus_out ?? []) records.push({ ...out, reported_on: stats.id ?? null });
    } catch {
      records.push({ unparsable: line.slice(0, 200) });
    }
  });
  return { records, closed };
}

/** One run of a scenario on the scene windows: the answers, each window's text and caret before and after. */
async function oneRun(ctx, engine, name, windows) {
  const { desktop, oracle } = ctx;
  const { requests, expected } = scenario(name, { a: windows.a.id, b: windows.b?.id });
  const keys = Object.keys(expected);
  const before = {};
  for (const k of keys) before[k] = await settledRead(() => textAndCaret(desktop, oracle, windows[k]));
  const started = performance.now();
  const { responses, ms } = await engine.pipeline(requests);
  const answered = performance.now() - started;
  const after = {};
  for (const k of keys) after[k] = await settledRead(() => textAndCaret(desktop, oracle, windows[k]));
  const texts = Object.fromEntries(keys.map((k) => [k, insertedAt(before[k].text, before[k].caret, expected[k], after[k].text)]));
  const errors = responses.filter((r) => r.ok !== true).map((r) => String(r.error).slice(0, 300));
  const got = Object.fromEntries(keys.map((k) => [k, typeof after[k].text === 'string' && typeof before[k].text === 'string' ? after[k].text.slice(before[k].caret ?? 0, (before[k].caret ?? 0) + after[k].text.length - before[k].text.length) : null]));
  return { ok: errors.length === 0 && keys.every((k) => texts[k]), answered_ok: errors.length === 0, errors, expected, got, exact: texts, caret_read: keys.every((k) => before[k].caret !== null), burst_ms: Math.round(ms * 10) / 10, answered_ms: Math.round(answered * 10) / 10 };
}

/**
 * A lane's series of one scenario: the timer lane to `need` consecutive passes (30; `--trials` sets fewer for a
 * development run, which its rows record), at most twice that many runs, the control lane `CONTROL_RUNS` runs. Each run
 * is a fresh engine's, as M0.4's key-pace runs were and as a service's first burst is: its first request redirects the
 * window again, and the engine's exit drains its last FocusOut.
 */
async function series(ctx, family, lane, name, windows) {
  const { emit, cua, need } = ctx;
  const oks = [];
  const rows = [];
  for (let run = 0; run < (lane === 'timer' ? need * (MAX_RUNS / CONSECUTIVE) : CONTROL_RUNS); run++) {
    const engine = new Engine({ label: `cua-${lane}`, bin: cua, args: LANES[lane] }).start();
    let row;
    try {
      row = await oneRun(ctx, engine, name, windows);
    } finally {
      await engine.close();
    }
    oks.push(row.ok);
    rows.push(row);
    emit({ kind: 'focus-timer-run', family, lane, scenario: name, run, ...row });
    if (lane === 'timer' && seriesVerdict(oks, need).reached) break;
  }
  const verdict = seriesVerdict(oks, lane === 'timer' ? need : Infinity);
  const out = { family, lane, scenario: name, need, ...verdict, burst_ms_median: median(rows.map((r) => r.burst_ms)), first_miss: rows.find((r) => !r.ok) ?? null };
  emit({ kind: 'focus-timer-series', ...out });
  return out;
}

/**
 * The audit pass of a family and lane: one run of each scenario with the engine's X connection through an xtrace proxy
 * and its `--stats` records, then the trace judged: nothing the background route forbids (`auditRequests`), every
 * FocusOut attributed to its request and none sooner than the delay on the timer lane (`attributeFocusOuts`), and the
 * synthetic-focus sessions, by window and in order, exactly the scenarios' (`expectedSessions`).
 */
async function auditPass(ctx, family, lane, windows) {
  const { emit, cua } = ctx;
  const proxy = await startProxy();
  const engine = new Engine({ label: `cua-${lane}-audit`, bin: cua, args: LANES[lane], stats: true, env: proxy.env }).start();
  const { records, closed } = collectFocusOuts(engine);
  const runs = [];
  let text;
  try {
    for (const name of SCENARIOS) {
      const row = await oneRun(ctx, engine, name, windows);
      runs.push({ scenario: name, ok: row.ok, errors: row.errors });
    }
  } finally {
    await engine.close();
    await closed;
    // the trace complete before the proxy ends: the engine's last requests may still be on their way through it
    await proxy.mark('end');
    text = await proxy.stop();
  }
  const trace = parseXtrace(text);
  const forbidden = auditRequests(trace);
  const attributed = attributeFocusOuts(trace, records, { delayMs: lane === 'timer' ? DELAY_MS : 0 });
  const ids = { a: windows.a.id, b: windows.b.id };
  const want = SCENARIOS.flatMap((name) => expectedSessions(name, lane, ids));
  const seen = attributed.sessions.map((s) => s.destination);
  const sessionsOk = JSON.stringify(seen) === JSON.stringify(want);
  // the control lane's runs may reorder, which is what it is for; its audit judges the trace and the records alone
  const clean = forbidden.clean && attributed.clean && sessionsOk && (lane === 'control' || runs.every((r) => r.ok));
  const row = { kind: 'focus-timer-audit', family, lane, clean, runs, requests: forbidden.requests, forbidden: forbidden.forbidden.slice(0, 10), problems: attributed.problems.slice(0, 10), sessions: { expected: want, seen }, attributed: attributed.attributed, deferred: attributed.attributed.filter((a) => a.deferred).length };
  emit(row);
  return row;
}

/**
 * The exit drain: a burst to a fresh engine through the proxy, then `signal` straight after its last answer, inside the
 * delay. SIGTERM must leave every key in order, the session closed by its FocusOut after the keys, the engine's exit
 * record (`cause` exit, the full delay waited) and exit code 143; SIGKILL leaves the session unclosed.
 */
async function stopRun(ctx, family, signal, windows, i) {
  const { desktop, oracle, emit, cua } = ctx;
  const { requests, expected } = scenario('burst', { a: windows.a.id });
  const before = await settledRead(() => textAndCaret(desktop, oracle, windows.a));
  const proxy = await startProxy();
  const engine = new Engine({ label: `cua-${signal}`, bin: cua, stats: true, env: proxy.env }).start();
  const { records, closed } = collectFocusOuts(engine);
  let exit;
  let text;
  let gap;
  let drained;
  try {
    const { responses } = await engine.pipeline(requests);
    const answered = performance.now();
    engine.child.kill(signal);
    gap = performance.now() - answered;
    exit = await engine.exited;
    drained = performance.now() - answered;
    if (!responses.every((r) => r.ok)) exit = { ...exit, answers: responses.filter((r) => !r.ok).map((r) => r.error) };
  } finally {
    await engine.close();
    await closed;
    // the trace complete before the proxy ends: the engine's last requests may still be on their way through it
    await proxy.mark('end');
    text = await proxy.stop();
  }
  const after = await settledRead(() => textAndCaret(desktop, oracle, windows.a));
  const sessions = focusSessions(parseXtrace(text));
  const exitRecord = records.find((r) => r.cause === 'exit') ?? null;
  const keysInOrder = insertedAt(before.text, before.caret, expected.a, after.text);
  const closedSession = sessions.sessions.length === 1 && sessions.sessions[0].closed && sessions.problems.length === 0;
  // drained by its own exit, well before the 2 s backstop that would end the process at once
  const ok =
    signal === 'SIGTERM'
      ? keysInOrder && closedSession && exit.code === 143 && exitRecord !== null && exitRecord.after_input_ms >= DELAY_MS && drained < EXIT_WITHIN_MS && !exit.answers
      : !closedSession && sessions.sessions.length === 1;
  const row = { kind: 'focus-timer-stop', family, signal, run: i, ok, keys_in_order: keysInOrder, session_closed: closedSession, session_problems: sessions.problems, exit, exit_record: exitRecord, signalled_after_answer_ms: Math.round(gap * 10) / 10, exited_after_answer_ms: Math.round(drained * 10) / 10 };
  emit(row);
  return row;
}

/**
 * A family's scene windows, A and B, covered by the front window, the focus there. Chromium's show the keys page
 * (`KEYS_PAGE`), whose field is found by its name where the family's own resolution looks for its fixture's.
 */
async function openWindows(ctx, family) {
  const { desktop, oracle } = ctx;
  const page = CHROMIUM.includes(family) ? { page: KEYS_PAGE } : {};
  const open = async (role) => {
    const scene = await openFamily(desktop, oracle, family, role, page);
    if (page.page && !scene.field) {
      scene.field = preorder((await desktop.state(scene)).ax_tree).find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
    }
    if (scene.kindOf !== 'terminal' && !scene.field && !scene.document) throw new Error(`${family}'s window has no text field the harness can read`);
    return scene;
  };
  const a = await open('focus-a');
  const b = await open('focus-b');
  desktop.arrangeFront('covered');
  await sleep(500);
  return { a, b };
}

/** DISPLAY set to a display the spawner lets this process reach: its own, or the hermetic name before it has one. */
function useDisplay(display) {
  assertReachable('the focus-timer experiment', [], { DISPLAY: display });
  process.env.DISPLAY = display;
}

/** `--experiment focus-timer`: every family's lanes, audits and the exit drain; `{md, complete, failed, ending}`. */
export async function runFocusTimer(args, { emit, run, startLoad }) {
  // from here on the spawner refuses every display this process did not create, the person's included (xspawn.mjs)
  delete process.env[LIVE_RUN];
  useDisplay(NO_DISPLAY);
  const server = await startPrivateServer({ out: args.out });
  useDisplay(server.display);
  emit({ kind: 'focus-timer-display', display: server.display, cua_version: xExecFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim(), load_factor: args.load ? (args.loadFactor ?? 1) : 0 });
  const desktop = new Desktop({ cua: args.cua, run, logs: args.out });
  const families = args.families.length ? args.families : FAMILIES;
  const results = { series: [], audits: [], stops: [], skipped: [] };
  let wm = null;
  let load = null;
  let watched = null;
  try {
    await desktop.begin({ startRecord: async () => null });
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
    const oracle = new Oracle();
    desktop.oracle = oracle;
    await desktop.openFront('covered');
    load = args.load ? startLoad(emit, args.loadFactor ?? 1) : null;
    const ctx = { desktop, oracle, emit, cua: args.cua, need: args.samplesTrials ?? CONSECUTIVE };
    for (const family of families) {
      let windows;
      try {
        windows = await openWindows(ctx, family);
      } catch (error) {
        results.skipped.push({ family, why: String(error.message).slice(0, 300) });
        emit({ kind: 'focus-timer-skipped', family, why: String(error.message).slice(0, 300) });
        continue;
      }
      try {
        // the control lane and SIGKILL last: the keys they cut reach the window only with a later FocusIn, which would
        // fail whatever ran after them
        for (const name of SCENARIOS) results.series.push(await series(ctx, family, 'timer', name, windows));
        results.audits.push(await auditPass(ctx, family, 'timer', windows));
        const chromium = CHROMIUM.includes(family);
        if (chromium) for (let i = 0; i < SIGTERM_RUNS; i++) results.stops.push(await stopRun(ctx, family, 'SIGTERM', windows, i));
        for (const name of SCENARIOS) results.series.push(await series(ctx, family, 'control', name, windows));
        results.audits.push(await auditPass(ctx, family, 'control', windows));
        if (chromium) for (let i = 0; i < SIGKILL_RUNS; i++) results.stops.push(await stopRun(ctx, family, 'SIGKILL', windows, i));
      } finally {
        await desktop.close([windows.a, windows.b]);
      }
    }
  } finally {
    if (load) await load.stop();
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
  const { md, failed } = focusTimerVerdict(results, { families });
  for (const f of ending.foreign) failed.push(`a window the experiment did not open was changed: ${f}`);
  if (!watched.clean) failed.push(`the private display's watchdog: ${watched.reason}`);
  if (failed.length) md.push('', `**Incomplete or failed:** ${failed.join('; ')}.`);
  emit({ kind: 'focus-timer-verdict', pass: failed.length === 0, failed });
  return { md, complete: failed.length === 0, failed, ending };
}

/**
 * The experiment's verdict from its results: every timer series reached its consecutive passes, every Chromium control
 * series showed the reorder, every audit is clean, every SIGTERM run drained and every SIGKILL run did not; a family
 * that could not be opened fails it. Returns the summary's lines and the failures.
 */
export function focusTimerVerdict({ series: all, audits, stops, skipped }, { families }) {
  const failed = [];
  const md = ['| family | lane | scenario | runs | misses | longest passing streak at the end | verdict | median burst ms |', '|---|---|---|---:|---:|---:|---|---:|'];
  for (const s of all) {
    let verdict;
    if (s.lane === 'timer') {
      const need = s.need ?? CONSECUTIVE;
      verdict = s.reached ? `${need} consecutive` : '**not reached**';
      if (!s.reached) failed.push(`${s.family} ${s.scenario}: no ${need} consecutive passing runs in ${s.runs}`);
      if (need < CONSECUTIVE) failed.push(`${s.family} ${s.scenario}: a development series of ${need}, not the ${CONSECUTIVE} the proof needs`);
    } else {
      const required = CHROMIUM.includes(s.family);
      verdict = s.misses > 0 ? `shows the reorder (${s.misses}/${s.runs})` : required ? '**shows nothing**' : 'no reorder (not required)';
      if (required && s.misses === 0) failed.push(`${s.family} ${s.scenario}: the control lane showed no reorder in ${s.runs} runs, so the test cannot see one`);
    }
    md.push(`| ${s.family} | ${s.lane} | ${s.scenario} | ${s.runs} | ${s.misses} | ${s.streak} | ${verdict} | ${s.burst_ms_median ?? '–'} |`);
  }
  md.push('', '| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |', '|---|---|---|---:|---|---|');
  for (const a of audits) {
    md.push(`| ${a.family} | ${a.lane} | ${a.clean ? 'clean' : '**not clean**'} | ${a.attributed.length} (${a.deferred}) | ${JSON.stringify(a.sessions.seen) === JSON.stringify(a.sessions.expected) ? 'yes' : '**no**'} | ${[...a.problems, ...a.forbidden.map((f) => f.what)].join('; ') || '–'} |`);
    if (!a.clean) failed.push(`${a.family} ${a.lane}: the audit is not clean`);
  }
  if (stops.length) {
    md.push('', '| family | signal | runs | as required | exit ms after the last answer (median) |', '|---|---|---:|---|---:|');
    for (const family of new Set(stops.map((s) => s.family))) {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        const rows = stops.filter((s) => s.family === family && s.signal === signal);
        if (!rows.length) continue;
        const good = rows.filter((r) => r.ok).length;
        md.push(`| ${family} | ${signal} | ${rows.length} | ${good}/${rows.length} | ${median(rows.map((r) => r.exited_after_answer_ms))} |`);
        if (good !== rows.length) failed.push(`${family} ${signal}: ${rows.length - good} of ${rows.length} runs ${signal === 'SIGTERM' ? 'did not drain the burst and its FocusOut' : 'closed the session, so the drain check is blind'}`);
      }
    }
  }
  for (const s of skipped) failed.push(`${s.family} could not be opened: ${s.why}`);
  for (const family of families) {
    if (!all.some((s) => s.family === family) && !skipped.some((s) => s.family === family)) failed.push(`${family} was not measured`);
  }
  return { md, failed };
}
