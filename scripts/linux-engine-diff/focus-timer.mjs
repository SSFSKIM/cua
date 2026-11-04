// The FocusOut timer's proof (M4's T7; the design session's rulings, M4 pre-flight, "The timer and the settle"):
// `--experiment focus-timer`. cua's engine answers a background request as soon as its input is sent and sends the
// window's synthetic FocusOut 100 ms after its last input, on a timer (the engine's `focus_timer.rs`); a FocusOut sooner
// than that after a pipelined burst is what makes Chromium cut its last keys and deliver them with the next FocusIn, out
// of order (M0.4). Per application family that takes background keys, in three lanes (`LANES`): the engine as it ships
// (`timer`), a control with no delay (`control`, the FocusOut and the unredirect sent as each request's input ends) and
// the delay with the control's unredirect (`unredirect`):
//
// - `burst`: one window, pipelined `press_key` requests (Shift chords among them), the exact text read back;
// - `aba`: window A, then B, then A again, pipelined, each window's exact text and its order;
// - `paste`: keys to a window, then a `type_text` to it, pipelined, the exact text and its order.
//
// Each is read back from the window's own text at its caret (the caret read before the run), so a key cut and delivered
// later, or a paste that lands before keys sent ahead of it, fails the run. The timed lanes must pass 30 consecutive
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

/**
 * The families of the matrix whose background keys cua sends and whose text the harness reads (GTK 4 and xterm refuse
 * keys in shared mode; Writer on `gen` exposes no text, M0.4's matrix).
 */
export const FAMILIES = ['chrome', 'electron', 'gedit', 'kate', 'qtcreator', 'firefox', 'writer', 'gnome-terminal'];
/**
 * The families where cua's paste never confirms, in every engine release (Qt 5 and 6: the text lands once and the
 * answer is the unconfirmed sentence; the released 0.3.0 answers so too, task 56): their paste runs are judged by the
 * text, the unconfirmed answer allowed.
 */
export const PASTE_UNCONFIRMED = ['kate', 'qtcreator'];
export const UNCONFIRMED = 'Paste was sent once and could not be confirmed; read the field before retrying';
/** The families whose control lane must show the reorder: Chromium, where M0.4 saw a sooner FocusOut cut keys. */
export const CHROMIUM = ['chrome', 'electron'];
/** Chromium's scene page: a field whose page spends a few milliseconds on each key (pages/keys.html). */
export const KEYS_PAGE = 'keys.html';
export const SCENARIOS = ['burst', 'aba', 'paste'];

/**
 * The scenarios a sitting runs, in the experiment's order, and whether it runs the stop runs: every scenario and the
 * stops, or with `--scenarios` only those named and no stops (a rerun of one scenario, as task 56 fix 2's other
 * families' paste at twice the load).
 */
export function chosenScenarios(args) {
  if (!args.scenarios?.length) return { scenarios: SCENARIOS, stops: true };
  if (args.stopsOnly) throw new Error('--stops-only runs no scenario; drop --scenarios');
  for (const name of args.scenarios) if (!SCENARIOS.includes(name)) throw new Error(`unknown focus-timer scenario ${name}`);
  return { scenarios: SCENARIOS.filter((name) => args.scenarios.includes(name)), stops: false };
}
/** The engine's delay from a window's last input to its FocusOut. */
export const DELAY_MS = 100;
/** Consecutive passing runs a timer-lane series needs, and the runs it may take to get them. */
export const CONSECUTIVE = 30;
export const MAX_RUNS = 60;
export const CONTROL_RUNS = 10;
/** SIGTERM straight after a burst: every run must pass (the exit settle's rule: 30 consecutive at twice the load). */
export const SIGTERM_RUNS = 30;
export const SIGKILL_RUNS = 3;
/**
 * SIGTERM straight after ten clicks on the keys page's pad (`clicks`): whether the exit's unredirect cuts pointer input
 * as it cuts keys. A drag has no such case on Chromium: shared mode refuses a background drag to it ("does not accept
 * background input"), so no drag release to a Chromium window goes by the redirected route.
 */
export const POINTER_STOP_RUNS = 10;
export const STOP_KINDS = ['keys', 'clicks'];
/**
 * The lanes. `timer`: the engine as it ships (session retention: a window stays redirected until the engine exits).
 * `control`: no delay, and each request's redirect dropped with its FocusOut (`--retention per-request`): on the private
 * Xvfb a FocusOut alone, the redirect kept, cuts no key (task 56: 0 of 10 runs, idle and at twice the load), while a
 * FocusOut followed by the unredirect cuts keys as M0.4 saw a FocusOut alone cut them on `:0`. `unredirect`: the
 * delay with the control's per-request unredirect, so the delay is the one thing the control changes.
 */
export const LANES = { timer: [], unredirect: ['--retention', 'per-request'], control: ['--teardown-ms', '0', '--retention', 'per-request'] };
/** Whether a lane runs with the delay, and so must pass its series. */
export const timed = (lane) => lane !== 'control';
/** A SIGTERM run's exit after the burst's last answer, at most: its drain (at most the delay), not the engine's 2 s backstop. */
export const EXIT_WITHIN_MS = 1500;

const NO_DISPLAY = ':cua171-focus-timer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The keys of a text the layout types at levels 1 and 2: a capital is `shift+<letter>`. */
export function keysOf(text) {
  return [...text].map((c) => (c >= 'A' && c <= 'Z' ? `shift+${c.toLowerCase()}` : c));
}

/**
 * A scenario's requests on windows `a` and `b` (ids) and the text each window must gain at its caret. The typed texts
 * are the same every run, letters only (no space, so no autocorrection; a run's word typed again is completed by Writer
 * to exactly itself), capitals among them so Shift chords ride the burst; the paste's text is the caller's (`pasted`,
 * each run's own in a sitting: `pasteTexts`).
 */
export function scenario(name, { a, b }, { pasted: pasteText = 'Pasted' } = {}) {
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
    const [typed, pasted] = ['abcDefgH', pasteText];
    return { requests: [...press(a, typed), { command: 'type_text', input: { window: { id: a }, text: pasted } }], expected: { a: typed + pasted } };
  }
  throw new Error(`unknown scenario ${name}`);
}

/**
 * The paste texts of a sitting, one per paste run, each its own: `Pasted` and three letters counting the runs. A
 * terminal's screen holds many runs' text, and once it scrolls, a paste whose text the screen already shows cannot be
 * confirmed (the engine's scrolled-field rule, task 56 fix 2), so a run's paste must not repeat an earlier run's.
 */
export function pasteTexts() {
  let n = 0;
  return () => {
    const letters = [Math.floor(n / 676) % 26, Math.floor(n / 26) % 26, n % 26].map((i) => String.fromCharCode(97 + i)).join('');
    n += 1;
    return `Pasted${letters}`;
  };
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

/**
 * Reads until two reads 150 ms apart agree and the text is at least `want` characters long, at most `boundMs`: a covered
 * Chromium page updates its tree late, and under load two reads can agree before the renderer has taken the first key.
 * Keys that never come within the bound (a cut, delivered only with a later FocusIn) leave the read short, and the run
 * is judged on it (`long_enough` false).
 */
export async function settledRead(read, { want = 0, boundMs = 5000, gapMs = 150, sleep: wait = sleep, now: clock = Date.now } = {}) {
  const started = clock();
  const longEnough = (r) => (typeof r.text === 'string' ? r.text.length : 0) >= want;
  let previous = await read();
  for (;;) {
    await wait(gapMs);
    const current = await read();
    const same = JSON.stringify(current) === JSON.stringify(previous);
    if ((same && longEnough(current)) || clock() - started > boundMs) return { ...current, settled: same, long_enough: longEnough(current) };
    previous = current;
  }
}

/** The length a window's text must reach once a run has put `text` into it. */
const grown = (before, text) => (typeof before.text === 'string' ? before.text.length : 0) + [...text].length;

/**
 * The engine's `--stats` records of its FocusOuts, in the order it wrote them: each `{window, cause, after_input_ms,
 * scheduled_by, reported_on}`, `reported_on` the id of the request whose line carried it, null for a line of its own.
 */
function collectFocusOuts(engine) {
  const records = [];
  const settles = [];
  const closed = new Promise((resolve) => engine.child.stderr.once('close', resolve));
  createInterface({ input: engine.child.stderr }).on('line', (line) => {
    let read;
    try {
      read = readStatsLine(line);
    } catch {
      records.push({ unparsable: line.slice(0, 200) });
      return;
    }
    if (!read) return;
    records.push(...read.focusOuts);
    if (read.settle) settles.push(read.settle);
  });
  return { records, settles, closed };
}

/**
 * One stderr line of the engine's: null when it is no `--stats` line, else its FocusOuts (each with the id of the
 * request whose line carried it, null for a line of its own) and the exit's settle, which is no FocusOut.
 */
export function readStatsLine(line) {
  if (!line.startsWith('{"stats"')) return null;
  const { stats } = JSON.parse(line);
  return { focusOuts: (stats.focus_out ?? []).map((out) => ({ ...out, reported_on: stats.id ?? null })), settle: stats.exit_settle ?? null };
}

/** A value to a tenth, as each run's times are (null stays null). */
export const tenth = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);

/**
 * A run's row: `trial` its index in its series, since `emit` names the sitting itself as `run` (experiments.mjs) and a
 * row's own `run` would overwrite it.
 */
export function trialRow(kind, labels, trial, row) {
  const { run: _ignored, ...rest } = row;
  return { kind, ...labels, trial, ...rest };
}

/**
 * Input a Chromium window holds back since an earlier run's cut, delivered now: a fresh engine's Shift to the window
 * (its FocusIn releases what was held; Shift adds no text), its session ended as the engine ships. Without it a cut's
 * tail lands in the next run, which then fails too, and each cut would count twice.
 */
async function clearTail(ctx, scene) {
  const engine = new Engine({ label: 'cua-clear', bin: ctx.cua }).start();
  try {
    const { response } = await engine.request('press_key', { window: { id: scene.id }, key: 'shift' });
    if (response.ok !== true) throw new Error(`clearing ${scene.label}'s held input: ${response.error}`);
  } finally {
    await engine.close();
  }
}

/** Chromium's field emptied by a fresh engine (Ctrl+A, then BackSpace), so a run starts on its own text. */
async function resetField(ctx, scene) {
  const engine = new Engine({ label: 'cua-reset', bin: ctx.cua }).start();
  try {
    for (const key of ['ctrl+a', 'BackSpace']) {
      const { response } = await engine.request('press_key', { window: { id: scene.id }, key });
      if (response.ok !== true) throw new Error(`resetting ${scene.label}'s field: ${response.error}`);
    }
  } finally {
    await engine.close();
  }
}

/**
 * An independent start on Chromium (the design session's ruling on the review): input an earlier run's cut held back
 * delivered now (`clearTail`), then, for a field, the field emptied. Returns whether such a tail arrived: the cascade the
 * run would have met at its first FocusIn, which the raw count keeps (`rawOks`).
 */
async function cleanStart(ctx, scene, read, { reset = true } = {}) {
  const before = await settledRead(read);
  await clearTail(ctx, scene);
  const after = await settledRead(read);
  if (reset) await resetField(ctx, scene);
  return { tail: JSON.stringify(before.text) !== JSON.stringify(after.text) };
}

/**
 * Each run's pass as it would have been without independent starts: a run whose start met an earlier cut's tail fails,
 * and so does the run after an unconfirmed paste, whose own paste the retry guard would have refused.
 */
export function rawOks(rows) {
  return rows.map((r, i) => r.ok && !r.tail_at_start && !(i > 0 && ['unconfirmed', 'guard'].includes(rows[i - 1].miss)));
}

/** After an unconfirmed paste, how long the next run waits for the engine's retry guard to lift (its quarantine). */
export const GUARD_WAIT_MS = 11000;

/** The keys stop: the burst scenario to window A, read from its field at its caret. */
function keysStop(ctx, windows) {
  const { requests, expected } = scenario('burst', { a: windows.a.id });
  return { requests, expected, read: () => textAndCaret(ctx.desktop, ctx.oracle, windows.a) };
}

/**
 * The clicks stop on the keys page's pad (pages/keys.html): ten clicks, each press and release written to the page's
 * log as `d` and `u`, read at the log's end.
 */
async function pointerStop(ctx, windows) {
  const { desktop, oracle } = ctx;
  const scene = windows.a;
  const { response } = await desktop.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
  if (!response.ok) throw new Error(`${scene.label}: no window state (${response.error})`);
  const nodes = preorder(response.output.ax_tree);
  const pad = nodes.find((n) => n.name === 'Pad');
  const log = nodes.find((n) => n.name === 'Log');
  if (!pad || !log) throw new Error(`${scene.label}: the keys page has no pad or log`);
  const e = oracle.extents(pad.id);
  const origin = response.output.window;
  const y = Math.round(e.y - origin.y + e.h / 2);
  const x = Math.round(e.x - origin.x + e.w / 4);
  const window = { id: scene.id };
  const requests = Array.from({ length: 10 }, () => ({ command: 'click', input: { window, x, y } }));
  const logScene = { ...scene, field: log.id, kindOf: 'field' };
  const read = async () => {
    const text = await readText(desktop, oracle, logScene);
    return { text, caret: typeof text === 'string' ? text.length : null };
  };
  return { requests, expected: { a: 'du'.repeat(10) }, read };
}

/** One run of a scenario on the scene windows: the answers, each window's text and caret before and after. */
async function oneRun(ctx, engine, name, windows) {
  const { desktop, oracle } = ctx;
  const { requests, expected } = scenario(name, { a: windows.a.id, b: windows.b?.id }, name === 'paste' ? { pasted: ctx.pasteText() } : {});
  const keys = Object.keys(expected);
  let tail = false;
  if (CHROMIUM.includes(windows.a.family)) {
    for (const k of keys) tail = (await cleanStart(ctx, windows[k], () => textAndCaret(desktop, oracle, windows[k]))).tail || tail;
  }
  const before = {};
  for (const k of keys) before[k] = await settledRead(() => textAndCaret(desktop, oracle, windows[k]));
  const started = performance.now();
  const { responses, ms } = await engine.pipeline(requests);
  const answered = performance.now() - started;
  const after = {};
  for (const k of keys) after[k] = await settledRead(() => textAndCaret(desktop, oracle, windows[k]), { want: grown(before[k], expected[k]) });
  const texts = Object.fromEntries(keys.map((k) => [k, insertedAt(before[k].text, before[k].caret, expected[k], after[k].text)]));
  const errors = responses.filter((r) => r.ok !== true).map((r) => String(r.error).slice(0, 300));
  const got = Object.fromEntries(keys.map((k) => [k, typeof after[k].text === 'string' && typeof before[k].text === 'string' ? after[k].text.slice(before[k].caret ?? 0, (before[k].caret ?? 0) + after[k].text.length - before[k].text.length) : null]));
  return { ok: runPasses({ family: windows.a.family, errors, exact: texts }), tail_at_start: tail, answered_ok: errors.length === 0, errors, expected, got, exact: texts, caret_read: keys.every((k) => before[k].caret !== null), burst_ms: Math.round(ms * 10) / 10, answered_ms: Math.round(answered * 10) / 10 };
}

/**
 * Why a run missed, null when it passed: `guard` (the engine refused the paste because an earlier paste is still
 * unconfirmed, which follows a miss and is not one of the run's own), `unconfirmed`, `refused` (the field changed between
 * the paste's observation and its dispatch), `error` (another answer) or `text` (every answer a success, the text wrong).
 */
export function missCause(run) {
  if (run.ok) return null;
  const errors = run.errors ?? [];
  if (errors.some((e) => e.startsWith('a previous paste could not be confirmed'))) return 'guard';
  if (errors.some((e) => e === UNCONFIRMED)) return 'unconfirmed';
  if (errors.some((e) => e.startsWith('requested field or selection changed before dispatch'))) return 'refused';
  if (errors.length) return 'error';
  return 'text';
}

/** The paste's own `--stats` record of a run, the parts that say what its observation and confirmation saw. */
function pasteRecord(engine) {
  const stats = [...engine.statsById.values()].find((s) => s?.paste);
  if (!stats) return null;
  const { observed, expected, confirmed, confirm_ms: confirmMs, transfer, requests, attributed, settle, observed_around: observedAround, unconfirmed_around: unconfirmedAround } = stats.paste;
  return { id: stats.id, elapsed_ms: stats.elapsed_ms, observed, expected, confirmed, confirm_ms: confirmMs, transfer, requests, attributed, settle: settle ?? null, observed_around: observedAround ?? null, unconfirmed_around: unconfirmedAround ?? null };
}

/**
 * Whether a run passes: every window's text exact, and every answer a success, except, on a family whose paste never
 * confirms (`PASTE_UNCONFIRMED`), the unconfirmed paste's own answer, its text still judged exactly.
 */
export function runPasses({ family, errors, exact }) {
  const excused = (e) => PASTE_UNCONFIRMED.includes(family) && e === UNCONFIRMED;
  return Object.values(exact).every(Boolean) && errors.every(excused);
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
  for (let run = 0; run < (timed(lane) ? need * (MAX_RUNS / CONSECUTIVE) : CONTROL_RUNS); run++) {
    const engine = new Engine({ label: `cua-${lane}`, bin: cua, args: LANES[lane], stats: true }).start();
    const stderrClosed = new Promise((resolve) => engine.child.stderr.once('close', resolve));
    let row;
    try {
      row = await oneRun(ctx, engine, name, windows);
    } finally {
      await engine.close();
    }
    await stderrClosed;
    // what the paste's observation and confirmation saw, from its --stats line
    if (name === 'paste') row.paste = pasteRecord(engine);
    row.miss = missCause(row);
    oks.push(row.ok);
    rows.push(row);
    emit(trialRow('focus-timer-run', { family, lane, scenario: name }, run, row));
    if (timed(lane) && seriesVerdict(oks, need).reached) break;
    // an independent start for the next run's paste: the retry guard an unconfirmed paste raises waited out
    if (row.miss === 'unconfirmed') await sleep(GUARD_WAIT_MS);
  }
  const verdict = seriesVerdict(oks, timed(lane) ? need : Infinity);
  const raw = seriesVerdict(rawOks(rows), timed(lane) ? need : Infinity);
  // a run can fail on its text (a key cut, or the order) or only on an answer (a paste that raced the keys)
  const wrongText = rows.filter((r) => !Object.values(r.exact).every(Boolean)).length;
  const missCauses = {};
  for (const r of rows) if (r.miss) missCauses[r.miss] = (missCauses[r.miss] ?? 0) + 1;
  const out = { family, lane, scenario: name, need, ...verdict, raw: { misses: raw.misses, streak: raw.streak, reached: raw.reached }, wrong_text: wrongText, miss_causes: missCauses, burst_ms_median: tenth(median(rows.map((r) => r.burst_ms))), first_miss: rows.find((r) => !r.ok) ?? null };
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
    for (const name of ctx.scenarios) {
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
  const attributed = attributeFocusOuts(trace, records, { delayMs: timed(lane) ? DELAY_MS : 0 });
  const ids = { a: windows.a.id, b: windows.b.id };
  const want = ctx.scenarios.flatMap((name) => expectedSessions(name, lane, ids));
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
async function stopRun(ctx, family, signal, windows, i, kind = 'keys') {
  const { desktop, oracle, emit, cua } = ctx;
  const { requests, expected, read } = kind === 'keys' ? keysStop(ctx, windows) : await pointerStop(ctx, windows);
  // an independent start: the log of the pointer stops is read-only, so only the field is emptied
  const { tail } = await cleanStart(ctx, windows.a, read, { reset: kind === 'keys' });
  const before = await settledRead(read);
  const proxy = await startProxy();
  const engine = new Engine({ label: `cua-${signal}`, bin: cua, args: ctx.stopArgs, stats: true, env: proxy.env }).start();
  const { records, settles, closed } = collectFocusOuts(engine);
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
  const after = await settledRead(read, { want: grown(before, expected.a) });
  const sessions = focusSessions(parseXtrace(text));
  const exitRecord = records.find((r) => r.cause === 'exit') ?? null;
  const inOrder = insertedAt(before.text, before.caret, expected.a, after.text);
  const closedSession = sessions.sessions.length === 1 && sessions.sessions[0].closed && sessions.problems.length === 0;
  // drained by its own exit, well before the 2 s backstop that would end the process at once
  const ok =
    signal === 'SIGTERM'
      ? inOrder && closedSession && exit.code === 143 && exitRecord !== null && exitRecord.after_input_ms >= DELAY_MS && drained < EXIT_WITHIN_MS && !exit.answers
      : !closedSession && sessions.sessions.length === 1;
  const got = typeof after.text === 'string' && typeof before.text === 'string' ? after.text.slice(before.caret ?? 0, (before.caret ?? 0) + after.text.length - before.text.length) : null;
  const settle = settles[0] ?? null;
  const row = { kind: 'focus-timer-stop', family, signal, input: kind, trial: i, ok, tail_at_start: tail, exit_settle_ms: settle?.waited_ms ?? null, in_order: inOrder, got, session_closed: closedSession, session_problems: sessions.problems, exit, exit_record: exitRecord, signalled_after_answer_ms: Math.round(gap * 10) / 10, exited_after_answer_ms: Math.round(drained * 10) / 10 };
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
  const chosen = chosenScenarios(args);
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
    // the stop runs' engine: as it ships, or with the exit settle a measurement step sets
    const stopArgs = args.exitSettleMs === undefined ? [] : ['--exit-settle-ms', String(args.exitSettleMs)];
    const ctx = { desktop, oracle, emit, cua: args.cua, need: args.samplesTrials ?? CONSECUTIVE, stopArgs, pasteText: pasteTexts(), scenarios: chosen.scenarios };
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
        const cutsKeys = CHROMIUM.includes(family) && chosen.stops;
        if (!args.stopsOnly) {
          for (const name of ctx.scenarios) results.series.push(await series(ctx, family, 'timer', name, windows));
          results.audits.push(await auditPass(ctx, family, 'timer', windows));
          for (const name of ctx.scenarios) results.series.push(await series(ctx, family, 'unredirect', name, windows));
        }
        if (cutsKeys) {
          for (let i = 0; i < SIGTERM_RUNS; i++) results.stops.push(await stopRun(ctx, family, 'SIGTERM', windows, i));
          for (let i = 0; i < POINTER_STOP_RUNS; i++) results.stops.push(await stopRun(ctx, family, 'SIGTERM', windows, i, 'clicks'));
        }
        if (!args.stopsOnly) {
          for (const name of ctx.scenarios) results.series.push(await series(ctx, family, 'control', name, windows));
          results.audits.push(await auditPass(ctx, family, 'control', windows));
        }
        if (cutsKeys) for (let i = 0; i < SIGKILL_RUNS; i++) results.stops.push(await stopRun(ctx, family, 'SIGKILL', windows, i));
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
  const { md, failed } = focusTimerVerdict(results, { families, stopsOnly: Boolean(args.stopsOnly) });
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
export function focusTimerVerdict({ series: all, audits, stops, skipped }, { families, stopsOnly = false }) {
  const failed = [];
  const md = ['| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |', '|---|---|---|---:|---:|---:|---|---:|---:|---:|'];
  for (const s of all) {
    let verdict;
    if (timed(s.lane)) {
      const need = s.need ?? CONSECUTIVE;
      const name = `${s.family} ${s.scenario}${s.lane === 'timer' ? '' : ` (${s.lane})`}`;
      verdict = s.reached ? `${need} consecutive` : '**not reached**';
      if (!s.reached) failed.push(`${name}: no ${need} consecutive passing runs in ${s.runs}`);
      if (need < CONSECUTIVE) failed.push(`${name}: a development series of ${need}, not the ${CONSECUTIVE} the proof needs`);
    } else {
      const required = CHROMIUM.includes(s.family);
      verdict = s.misses > 0 ? `fails without the delay (${s.misses}/${s.runs}; the text wrong in ${s.wrong_text ?? '?'})` : required ? '**shows nothing**' : 'no reorder (not required)';
      if (required && s.misses === 0) failed.push(`${s.family} ${s.scenario}: the control lane showed no reorder in ${s.runs} runs, so the test cannot see one`);
    }
    // a timed lane's misses by cause: the retry guard refusing after an earlier miss is not a miss of its own
    const causes = timed(s.lane) && s.misses ? ` (${Object.entries(s.miss_causes ?? {}).map(([c, n]) => `${c} ${n}`).join(', ')})` : '';
    md.push(`| ${s.family} | ${s.lane} | ${s.scenario} | ${s.runs} | ${s.misses} | ${s.streak} | ${verdict}${causes} | ${s.raw?.misses ?? '–'} | ${s.raw?.streak ?? '–'} | ${s.burst_ms_median ?? '–'} |`);
  }
  md.push('', '| family | lane | audit | FocusOuts attributed (deferred) | sessions as expected | problems |', '|---|---|---|---:|---|---|');
  for (const a of audits) {
    md.push(`| ${a.family} | ${a.lane} | ${a.clean ? 'clean' : '**not clean**'} | ${a.attributed.length} (${a.deferred}) | ${JSON.stringify(a.sessions.seen) === JSON.stringify(a.sessions.expected) ? 'yes' : '**no**'} | ${[...a.problems, ...a.forbidden.map((f) => f.what)].join('; ') || '–'} |`);
    if (!a.clean) failed.push(`${a.family} ${a.lane}: the audit is not clean`);
  }
  if (stops.length) {
    md.push('', '| family | signal | input | runs | as required | raw (a tail met at the start fails) | exit ms after the last answer (median) |', '|---|---|---|---:|---|---|---:|');
    for (const family of new Set(stops.map((s) => s.family))) {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        for (const input of STOP_KINDS) {
          const rows = stops.filter((s) => s.family === family && s.signal === signal && (s.input ?? 'keys') === input);
          if (!rows.length) continue;
          const good = rows.filter((r) => r.ok).length;
          const rawGood = rows.filter((r) => r.ok && !r.tail_at_start).length;
          md.push(`| ${family} | ${signal} | ${input} | ${rows.length} | ${good}/${rows.length} | ${rawGood}/${rows.length} | ${tenth(median(rows.map((r) => r.exited_after_answer_ms)))} |`);
          const what = input === 'keys' ? 'the burst' : 'the clicks';
          if (good !== rows.length) failed.push(`${family} ${signal}${input === 'keys' ? '' : ` (${input})`}: ${rows.length - good} of ${rows.length} runs ${signal === 'SIGTERM' ? `did not drain ${what} and its FocusOut` : 'closed the session, so the drain check is blind'}`);
        }
      }
    }
  }
  for (const s of skipped) failed.push(`${s.family} could not be opened: ${s.why}`);
  for (const family of families) {
    const measured = all.some((s) => s.family === family) || (stopsOnly && stops.some((s) => s.family === family));
    if (!measured && !skipped.some((s) => s.family === family)) failed.push(`${family} was not measured`);
  }
  return { md, failed };
}
