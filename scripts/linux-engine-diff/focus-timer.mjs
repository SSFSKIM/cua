// T7's proof of the background route's FocusOut and the paste's settle (M4's T7, as the design session ruled on task
// 59's measurement, 2026-11-04): `--experiment focus-timer`, named for T7's timer, which it measured and which is gone.
// cua's engine sends a background request's synthetic FocusOut as its input ends, before its answer, the window's
// redirect kept: with the redirect held, a FocusOut at once cut and reordered no key on any family, idle or at twice the
// load (task 59). A paste whose window took keys just before waits its settle before it observes its field (the
// engine's `settle.rs`), since an observation that reads the field before those keys land refuses the paste or misses
// its confirmation. Per application family that takes background keys, in the lanes `LANES` names: the engine as it
// ships (`shipped`), the paste's settle at each of its measured steps (`settle-<ms>`, named with `--lanes`), and a
// control that drops each request's redirect with its FocusOut (`control`), which cuts Chromium's keys:
//
// - `burst`: one window, pipelined `press_key` requests (Shift chords among them), the exact text read back;
// - `aba`: window A, then B, then A again, pipelined, each window's exact text and its order;
// - `paste`: keys to a window, then a `type_text` to it, pipelined, the exact text and its order;
// - `click-paste` (named with `--scenarios`): a click into the window's field at its first character, the caret at the
//   field's end before it, then a `type_text` with no element, pipelined: the paste's text where the click put the
//   caret, its answer confirmed (the design session's ruling on task 60's review, 2026-11-05: a paste's observation can
//   come before a click just before it lands, and then reads the caret or the field the click left).
//
// Each is read back from the window's own text at its caret (the caret read before the run), so a key cut and delivered
// later, or a paste that lands before keys sent ahead of it, fails the run. The judged lanes must pass 30 consecutive
// runs of each scenario (a miss restarts the series and is reported); the control lane must show the reorder on the
// Chromium families (Chrome, Electron), which proves the test can see it. Then, per family and lane, an audit pass with
// the engine's connection through xtrace and its `--stats` records: every FocusOut in the trace is attributed to the
// request whose input it ends and none is left past that request's answer (audit.mjs `attributeFocusOuts`,
// `auditVerdict`), each synthetic-focus session is one request's, and no two windows are under synthetic focus at once.
// Last, the exit on the bytes under test: SIGTERM straight after a burst's last answer, inside the exit's settle, must
// leave every key of the burst in order and an exit of 128 + 15 that settled first; SIGKILL, the documented limit, is
// the control that skips the settle.
//
// Where it runs: only on a private X server it starts itself (`startPrivateServer`, under its watchdog and marked
// private), with Openbox, and the harness's own Desktop on it: the run's own applications, homes and session bus, its
// own Chrome and Electron. Before anything starts it withdraws the harness's live-run declaration, so the spawner refuses
// any display this process did not create, `:0` included (xspawn.mjs). `--load-factor 2` runs it under twice the gate's
// load (16 stress-ng workers on 8 cores).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';

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
/** Every scenario, in the experiment's order: the default ones, then those a sitting names with `--scenarios`. */
export const ALL_SCENARIOS = [...SCENARIOS, 'click-paste'];
/** The scenarios whose last request is a paste: their runs keep the paste's `--stats` record. */
const PASTES = ['paste', 'click-paste'];

/**
 * The scenarios a sitting runs, in the experiment's order, and whether it runs the stop runs: every scenario and the
 * stops, or with `--scenarios` only those named and no stops (a rerun of one scenario, as task 56 fix 2's other
 * families' paste at twice the load).
 */
export function chosenScenarios(args) {
  if (!args.scenarios?.length) return { scenarios: SCENARIOS, stops: true };
  if (args.stopsOnly) throw new Error('--stops-only runs no scenario; drop --scenarios');
  for (const name of args.scenarios) if (!ALL_SCENARIOS.includes(name)) throw new Error(`unknown focus-timer scenario ${name}`);
  return { scenarios: ALL_SCENARIOS.filter((name) => args.scenarios.includes(name)), stops: false };
}
/** Consecutive passing runs a judged lane's series needs, and the runs it may take to get them. */
export const CONSECUTIVE = 30;
export const MAX_RUNS = 60;
export const CONTROL_RUNS = 10;
/** SIGTERM straight after a burst: every run must pass (the exit settle's rule: 30 consecutive at twice the load). */
export const SIGTERM_RUNS = 30;
export const SIGKILL_RUNS = 3;
/**
 * SIGTERM straight after ten clicks on the keys page's pad (`clicks`): the exit's unredirect cuts pointer input as it
 * cuts keys once no FocusOut drain waits before it (task 60: 7 of 10 on Chrome and on Electron, idle, with the settle
 * after keys only), so the settle follows clicks too, and these runs hold it to the keys' rule, 30 a family. A drag has
 * no such case on Chromium: shared mode refuses a background drag to it ("does not accept background input"), so no
 * drag release to a Chromium window goes by the redirected route.
 */
export const POINTER_STOP_RUNS = 30;
export const STOP_KINDS = ['keys', 'clicks'];
/** The paste settle's measured steps, in ms (the design session's wait rule, 2026-11-04: the smallest that passes). */
export const SETTLE_STEPS = [25, 50, 75, 100];
/**
 * The click settle's measured steps, in ms: a paste's settle after a click to its window (`--paste-click-settle-ms`),
 * 0 the engine before it (the design session's ruling on task 60's review, 2026-11-05, by the wait rule).
 */
export const CLICK_STEPS = [0, 25, 50, 75, 100];
/**
 * The lanes. `shipped`: the engine as it ships (each request's FocusOut as its input ends, session retention: a window
 * stays redirected until the engine exits; its paste settle). `settle-<ms>`: the same with the paste's settle set to one
 * of its measured steps (`--paste-settle-ms`), the redirect kept. `control`: each request's redirect dropped with its
 * FocusOut (`--retention per-request`): on the private Xvfb a FocusOut with the redirect kept cuts no key (tasks 56 and
 * 59), while a FocusOut followed by the unredirect cuts Chromium's keys and delivers them with the next FocusIn, the
 * reorder M0.4 saw (task 58 found M0.4's own control ended its engine, and with it every redirect, before its read).
 * The control's paste series drops the paste's settle instead (`CONTROL_PASTE`, `laneArgs`), the redirect kept, so its
 * observation races the keys it follows, as at 0 in task 59.
 */
export const LANES = {
  shipped: [],
  ...Object.fromEntries(SETTLE_STEPS.map((ms) => [`settle-${ms}`, ['--paste-settle-ms', String(ms)]])),
  ...Object.fromEntries(CLICK_STEPS.map((ms) => [`click-${ms}`, ['--paste-click-settle-ms', String(ms)]])),
  control: ['--retention', 'per-request'],
};
/**
 * The control's flags for the key-then-paste scenario: no settle, the redirect kept. With each request's redirect
 * dropped as well, the race went out of sight on Chrome (0 of 10, idle, task 60), the per-request redirects slowing the
 * paste's own path; with the redirect kept it missed 21 of 60 (task 59).
 */
export const CONTROL_PASTE = ['--paste-settle-ms', '0'];
/** The control's flags for click-then-paste: no settle after the click, the redirect and the key settle kept. */
export const CONTROL_CLICK_PASTE = ['--paste-click-settle-ms', '0'];
const CONTROLS = { paste: CONTROL_PASTE, 'click-paste': CONTROL_CLICK_PASTE };
/** A lane's engine flags for a scenario's series: each control drops the one protection its scenario rests on. */
export const laneArgs = (lane, scenario) => (lane === 'control' ? (CONTROLS[scenario] ?? LANES.control) : LANES[lane]);
/**
 * An audit pass's runs, one engine each: every scenario on the flags its series ran with (`laneArgs`), so the audit of
 * a control's paste judges the engine the series measured, with no settle, and not one unredirected (task 60's review).
 */
export const auditRuns = (lane, scenarios) => scenarios.map((scenario) => ({ scenario, args: laneArgs(lane, scenario) }));
/** The lanes a sitting runs unless `--lanes` names others: T7's proof on the engine as it ships. */
export const DEFAULT_LANES = ['shipped', 'control'];
/** Whether a lane must pass its series (30 consecutive): every lane but `control`, which must show the reorder. */
export const judged = (lane) => lane !== 'control';

/**
 * The lanes a sitting runs, in the experiment's order (`LANES`), and whether it runs the stop runs: T7's lanes and the
 * stops, or with `--lanes` only those named, at least one of them judged, and no stops (the stops prove the engine as
 * it ships, not a lane).
 */
export function chosenLanes(args) {
  if (!args.lanes?.length) return { lanes: DEFAULT_LANES, stops: true };
  if (args.stopsOnly) throw new Error('--stops-only runs no lane; drop --lanes');
  for (const name of args.lanes) if (!LANES[name]) throw new Error(`unknown focus-timer lane ${name}; known: ${Object.keys(LANES).join(', ')}`);
  if (!args.lanes.some(judged)) throw new Error('the focus-timer lanes need a judged lane beside the control');
  return { lanes: Object.keys(LANES).filter((name) => args.lanes.includes(name)), stops: false };
}
/**
 * A SIGTERM run's exit after the burst's last answer, at most: the exit's settle (300 ms after the last key), not the
 * engine's 1 s backstop (serve.rs EXIT_BACKSTOP).
 */
export const EXIT_WITHIN_MS = 900;

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
export function scenario(name, { a, b }, { pasted: pasteText = 'Pasted', click = { x: 0, y: 0 } } = {}) {
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
  if (name === 'click-paste') {
    return { requests: [{ command: 'click', input: { window: { id: a }, ...click } }, { command: 'type_text', input: { window: { id: a }, text: pasteText } }], expected: { a: pasteText } };
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

/**
 * Where a scenario's text goes in a window's text read before the run (`{text, caret}`): at the caret, except
 * click-then-paste's, which goes where its click puts the caret, at the text's start; a terminal takes it at its end.
 */
export function insertionAt(name, scene, before) {
  if (name !== 'click-paste') return before.caret;
  return scene.kindOf === 'terminal' ? before.caret : 0;
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
 * The synthetic-focus sessions a scenario must leave in the trace, by window, in order: one per request, on every lane,
 * since each request's FocusOut goes as its input ends.
 */
export function expectedSessions(name, { a, b }) {
  return scenario(name, { a, b }).requests.map((r) => r.input.window.id);
}

/**
 * An audit pass's verdict: nothing forbidden in the trace, every FocusOut attributed to its request and none deferred
 * past that request's answer, the sessions exactly the scenarios', and the runs passing (the control's runs may
 * reorder, which is what it is for).
 */
export function auditVerdict({ forbidden, attributed, sessionsOk, runsOk, lane }) {
  const noneDeferred = attributed.attributed.every((a) => !a.deferred);
  return forbidden.clean && attributed.clean && noneDeferred && sessionsOk && (lane === 'control' || runsOk);
}

/**
 * A stop run's verdict. SIGTERM: the burst in order at the caret, every synthetic-focus session closed, an orderly exit
 * (128 + 15) that ended by itself before the backstop, every answer a success, and the exit's settle run (its `--stats`
 * record), after keys and after clicks alike: with no FocusOut drain before the exit, its unredirect cuts both (task
 * 60). SIGKILL, the control: the kill skipped the settle, so the settle check can fail.
 */
export function stopPasses({ signal, inOrder, sessions, exit, settle, drainedMs }) {
  if (signal === 'SIGKILL') return exit.signal === 'SIGKILL' && settle === null;
  const closed = sessions.sessions.length > 0 && sessions.sessions.every((s) => s.closed) && sessions.problems.length === 0;
  return inOrder && closed && exit.code === 143 && settle !== null && drainedMs < EXIT_WITHIN_MS && !exit.answers;
}

/**
 * The paste settle's cost over a series' runs: how many pastes, the median and the largest wait, and the median times
 * since the window's last key and its last click when the paste came (each paste's `--stats` record, `paste.settle`).
 * Null for none.
 */
export function settleCost(rows) {
  const settles = rows.map((r) => r.paste?.settle).filter(Boolean);
  if (!settles.length) return null;
  const waited = settles.map((s) => s.waited_ms);
  const since = (field) => {
    const values = settles.map((s) => s[field]).filter((v) => typeof v === 'number');
    return values.length ? tenth(median(values)) : null;
  };
  return { pastes: settles.length, waited_median: tenth(median(waited)), waited_max: tenth(Math.max(...waited)), after_key_median: since('after_key_ms'), after_click_median: since('after_click_ms') };
}

/** A scene's text and caret, as one offset into that text (`families.mjs` `readCaret`; a terminal's text grows at its end). */
export async function textAndCaret(desktop, oracle, scene) {
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
  return { focusOuts: focusOutsOf([stats]), settle: stats.exit_settle ?? null };
}

/** The FocusOuts of a run's `--stats` records, in order, each with the id of the request whose line carried it. */
export function focusOutsOf(statsList) {
  return statsList.flatMap((stats) => (stats?.focus_out ?? []).map((out) => ({ ...out, reported_on: stats.id ?? null })));
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
export async function cleanStart(ctx, scene, read, { reset = true } = {}) {
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

/**
 * Click-then-paste's start on window A: the caret put at the field's end by a fresh engine's `ctrl+End` (an empty field
 * first given text to click into), so that the click at the first character moves it; then the click's point,
 * window-relative: the first character's left part. A terminal takes a paste at its end whatever the click, so it is
 * clicked in its middle and nothing is prepared.
 */
async function clickPasteStart(ctx, scene) {
  const { desktop, oracle } = ctx;
  const { response } = await desktop.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
  if (!response.ok) throw new Error(`${scene.label}: no window state (${response.error})`);
  const origin = response.output.window;
  if (scene.kindOf === 'terminal') return { x: Math.round(origin.width / 2), y: Math.round(origin.height / 2) };
  const { text } = await settledRead(() => textAndCaret(desktop, oracle, scene));
  const engine = new Engine({ label: 'cua-caret', bin: ctx.cua }).start();
  try {
    for (const key of [...(text ? [] : keysOf('seed')), 'ctrl+End']) {
      const { response: pressed } = await engine.request('press_key', { window: { id: scene.id }, key });
      if (pressed.ok !== true) throw new Error(`putting ${scene.label}'s caret at its end: ${pressed.error}`);
    }
  } finally {
    await engine.close();
  }
  const field = scene.kindOf === 'paragraphs' ? oracle.children(scene.document).find((id) => oracle.role(id) === 'paragraph') : scene.field;
  const e = oracle.charExtents(field, 0);
  return { x: Math.round(e.x - origin.x + Math.max(1, e.w / 4)), y: Math.round(e.y - origin.y + e.h / 2) };
}

/** One run of a scenario on the scene windows: the answers, each window's text and caret before and after. */
async function oneRun(ctx, engine, name, windows) {
  const { desktop, oracle } = ctx;
  const clicks = name === 'click-paste';
  let tail = false;
  // a Chromium field is emptied for each run's keys; click-then-paste needs text to click into, so it keeps it
  if (CHROMIUM.includes(windows.a.family)) {
    for (const k of clicks ? ['a'] : Object.keys(scenario(name, { a: 0, b: 0 }).expected)) tail = (await cleanStart(ctx, windows[k], () => textAndCaret(desktop, oracle, windows[k]), { reset: !clicks })).tail || tail;
  }
  const click = clicks ? await clickPasteStart(ctx, windows.a) : undefined;
  const { requests, expected } = scenario(name, { a: windows.a.id, b: windows.b?.id }, PASTES.includes(name) ? { pasted: ctx.pasteText(), click } : {});
  const keys = Object.keys(expected);
  const before = {};
  for (const k of keys) before[k] = await settledRead(() => textAndCaret(desktop, oracle, windows[k]));
  const started = performance.now();
  const { responses, ms } = await engine.pipeline(requests);
  const answered = performance.now() - started;
  const after = {};
  for (const k of keys) after[k] = await settledRead(() => textAndCaret(desktop, oracle, windows[k]), { want: grown(before[k], expected[k]) });
  const at = Object.fromEntries(keys.map((k) => [k, insertionAt(name, windows[k], before[k])]));
  const texts = Object.fromEntries(keys.map((k) => [k, insertedAt(before[k].text, at[k], expected[k], after[k].text)]));
  const errors = responses.filter((r) => r.ok !== true).map((r) => String(r.error).slice(0, 300));
  const got = Object.fromEntries(keys.map((k) => [k, typeof after[k].text === 'string' && typeof before[k].text === 'string' ? after[k].text.slice(at[k] ?? 0, (at[k] ?? 0) + after[k].text.length - before[k].text.length) : null]));
  return { ok: runPasses({ family: windows.a.family, errors, exact: texts }), tail_at_start: tail, answered_ok: errors.length === 0, errors, expected, got, exact: texts, caret_read: keys.every((k) => before[k].caret !== null), ...(clicks ? { click, caret_before: before.a.caret } : {}), burst_ms: Math.round(ms * 10) / 10, answered_ms: Math.round(answered * 10) / 10 };
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
  return pasteRecordOf([...engine.statsById.values()].find((s) => s?.paste));
}

/**
 * A paste's `--stats` record, the parts a run keeps: what its observation saw (the field whole too, where its family's
 * text scrolls), how it was confirmed (`confirm_rule`: the inserted segment, or the scrolled field) or not, and its
 * transfer. Null for none.
 */
export function pasteRecordOf(stats) {
  if (!stats?.paste) return null;
  const { observed, expected, confirmed, confirm_ms: confirmMs, confirm_rule: confirmRule, observed_whole: observedWhole, observed_whole_ms: observedWholeMs, transfer, requests, attributed, settle, observed_around: observedAround, unconfirmed_around: unconfirmedAround } = stats.paste;
  return { id: stats.id, elapsed_ms: stats.elapsed_ms, observed, expected, confirmed, confirm_ms: confirmMs, confirm_rule: confirmRule ?? null, observed_whole: observedWhole ?? null, observed_whole_ms: observedWholeMs ?? null, transfer, requests, attributed, settle: settle ?? null, observed_around: observedAround ?? null, unconfirmed_around: unconfirmedAround ?? null };
}

/** A series' paste runs counted by the rule that confirmed each (runs no rule confirmed are not counted). */
export function confirmRules(rows) {
  const out = {};
  for (const r of rows) {
    const rule = r.paste?.confirm_rule;
    if (rule) out[rule] = (out[rule] ?? 0) + 1;
  }
  return out;
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
 * A missed run's X trace kept, gzipped, under the sitting's `traces/` (`file`, relative to the sitting), with what it
 * shows of the synthetic focus: each session's window, inputs and whether its FocusOut closed it, and the Composite
 * requests (a redirect or its release) the engine made.
 */
export function keepTrace(out, name, text) {
  const dir = join(out, 'traces');
  mkdirSync(dir, { recursive: true });
  const file = `${name}.xtrace.gz`;
  writeFileSync(join(dir, file), gzipSync(text));
  const trace = parseXtrace(text);
  const { sessions, problems } = focusSessions(trace);
  const composite = trace.requests.filter((r) => r.ext === 'Composite').map((r) => r.name);
  return { file: `traces/${file}`, requests: trace.requests.length, sessions, problems, composite };
}

/**
 * A lane's series of one scenario: a judged lane to `need` consecutive passes (30; `--trials` sets fewer for a
 * development run, which its rows record), at most twice that many runs, the control lane `CONTROL_RUNS` runs. Each run
 * is a fresh engine's, as M0.4's key-pace runs were and as a service's first burst is: its first request redirects the
 * window again, and the engine's exit settles after its last key.
 */
async function series(ctx, family, lane, name, windows) {
  const { emit, cua, need } = ctx;
  const oks = [];
  const rows = [];
  for (let run = 0; run < (judged(lane) ? need * (MAX_RUNS / CONSECUTIVE) : CONTROL_RUNS); run++) {
    // with --trace, the run's engine connection through xtrace (a sitting of its own: the proxy delays every request)
    const proxy = ctx.trace ? await startProxy() : null;
    const engine = new Engine({ label: `cua-${lane}`, bin: cua, args: laneArgs(lane, name), stats: true, ...(proxy ? { env: proxy.env } : {}) }).start();
    const stderrClosed = new Promise((resolve) => engine.child.stderr.once('close', resolve));
    let row;
    let text = null;
    try {
      row = await oneRun(ctx, engine, name, windows);
    } finally {
      await engine.close();
      if (proxy) {
        // the trace complete before the proxy ends: the engine's last requests may still be on their way through it
        await proxy.mark('end');
        text = await proxy.stop();
      }
    }
    await stderrClosed;
    // what the paste's observation and confirmation saw, from its --stats line
    if (PASTES.includes(name)) row.paste = pasteRecord(engine);
    row.miss = missCause(row);
    // a miss keeps when each FocusOut went, after which input and on whose answer (the cut's grounds, if one), and
    // with --trace the engine's whole X trace
    if (!row.ok) row.focus_outs = focusOutsOf([...engine.statsById.values()]);
    if (!row.ok && text !== null) row.trace = keepTrace(ctx.out, `${family}-${lane}-${name}-${run}`, text);
    oks.push(row.ok);
    rows.push(row);
    emit(trialRow('focus-timer-run', { family, lane, scenario: name }, run, row));
    if (judged(lane) && seriesVerdict(oks, need).reached) break;
    // an independent start for the next run's paste: the retry guard an unconfirmed paste raises waited out
    if (row.miss === 'unconfirmed') await sleep(GUARD_WAIT_MS);
  }
  const verdict = seriesVerdict(oks, judged(lane) ? need : Infinity);
  const raw = seriesVerdict(rawOks(rows), judged(lane) ? need : Infinity);
  // a run can fail on its text (a key cut, or the order) or only on an answer (a paste that raced the keys)
  const wrongText = rows.filter((r) => !Object.values(r.exact).every(Boolean)).length;
  const missCauses = {};
  for (const r of rows) if (r.miss) missCauses[r.miss] = (missCauses[r.miss] ?? 0) + 1;
  const out = { family, lane, scenario: name, need, ...verdict, raw: { misses: raw.misses, streak: raw.streak, reached: raw.reached }, wrong_text: wrongText, miss_causes: missCauses, ...(PASTES.includes(name) ? { confirm_rules: confirmRules(rows), settle: settleCost(rows) } : {}), burst_ms_median: tenth(median(rows.map((r) => r.burst_ms))), first_miss: rows.find((r) => !r.ok) ?? null };
  emit({ kind: 'focus-timer-series', ...out });
  return out;
}

/**
 * The audit pass of a family and lane: one run of each scenario, each on its own engine with the flags its series ran
 * with (`auditRuns`), its X connection through an xtrace proxy and its `--stats` records, then each trace judged:
 * nothing the background route forbids (`auditRequests`), every FocusOut attributed to its request and none deferred
 * past its answer (`attributeFocusOuts`, `auditVerdict`), and the synthetic-focus sessions, by window and in order,
 * exactly the scenario's (`expectedSessions`). One row per scenario.
 */
async function auditPass(ctx, family, lane, windows) {
  const rows = [];
  for (const { scenario: name, args } of auditRuns(lane, ctx.scenarios)) rows.push(await auditRun(ctx, family, lane, name, args, windows));
  return rows;
}

/** One scenario's audit run (`auditPass`). */
async function auditRun(ctx, family, lane, name, args, windows) {
  const { emit, cua } = ctx;
  const proxy = await startProxy();
  const engine = new Engine({ label: `cua-${lane}-audit`, bin: cua, args, stats: true, env: proxy.env }).start();
  const { records, closed } = collectFocusOuts(engine);
  let run;
  let text;
  try {
    const row = await oneRun(ctx, engine, name, windows);
    run = { scenario: name, ok: row.ok, errors: row.errors };
  } finally {
    await engine.close();
    await closed;
    // the trace complete before the proxy ends: the engine's last requests may still be on their way through it
    await proxy.mark('end');
    text = await proxy.stop();
  }
  const trace = parseXtrace(text);
  const forbidden = auditRequests(trace);
  const attributed = attributeFocusOuts(trace, records, { delayMs: 0 });
  const want = expectedSessions(name, { a: windows.a.id, b: windows.b.id });
  const seen = attributed.sessions.map((s) => s.destination);
  const sessionsOk = JSON.stringify(seen) === JSON.stringify(want);
  // the control lane's runs may reorder, which is what it is for; its audit judges the trace and the records alone
  const clean = auditVerdict({ forbidden, attributed, sessionsOk, runsOk: run.ok, lane });
  const row = { kind: 'focus-timer-audit', family, lane, scenario: name, args, clean, runs: [run], requests: forbidden.requests, forbidden: forbidden.forbidden.slice(0, 10), problems: attributed.problems.slice(0, 10), sessions: { expected: want, seen }, attributed: attributed.attributed, deferred: attributed.attributed.filter((a) => a.deferred).length };
  emit(row);
  return row;
}

/**
 * The exit: a burst to a fresh engine through the proxy, then `signal` straight after its last answer, inside the exit's
 * settle (`stopPasses`). SIGTERM must leave every key in order, each request's session closed by its FocusOut, the
 * exit's settle run after keys and exit code 143; SIGKILL, the control, skips the settle.
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
  const inOrder = insertedAt(before.text, before.caret, expected.a, after.text);
  const settle = settles[0] ?? null;
  // settled by its own exit, before the 1 s backstop that would end the process at once
  const ok = stopPasses({ signal, inOrder, sessions, exit, settle, drainedMs: drained });
  const got = typeof after.text === 'string' && typeof before.text === 'string' ? after.text.slice(before.caret ?? 0, (before.caret ?? 0) + after.text.length - before.text.length) : null;
  const closedSessions = sessions.sessions.filter((s) => s.closed).length;
  const row = { kind: 'focus-timer-stop', family, signal, input: kind, trial: i, ok, tail_at_start: tail, exit_settle_ms: settle?.waited_ms ?? null, in_order: inOrder, got, sessions: sessions.sessions.length, sessions_closed: closedSessions, session_problems: sessions.problems, exit, focus_outs: records.length, signalled_after_answer_ms: Math.round(gap * 10) / 10, exited_after_answer_ms: Math.round(drained * 10) / 10 };
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

/** `--experiment focus-timer`: every family's lanes, audits and the exit; `{md, complete, failed, ending}`. */
export async function runFocusTimer(args, { emit, run, startLoad }) {
  // from here on the spawner refuses every display this process did not create, the person's included (xspawn.mjs)
  delete process.env[LIVE_RUN];
  useDisplay(NO_DISPLAY);
  const server = await startPrivateServer({ out: args.out });
  useDisplay(server.display);
  const chosen = chosenScenarios(args);
  const { lanes, stops: laneStops } = chosenLanes(args);
  const stops = chosen.stops && laneStops;
  // each lane's engine flags, as the sitting ran them
  const laneFlags = Object.fromEntries(lanes.map((name) => [name, LANES[name]]));
  if (lanes.includes('control')) for (const name of chosen.scenarios) if (CONTROLS[name]) laneFlags[`control ${name}`] = CONTROLS[name];
  emit({ kind: 'focus-timer-display', display: server.display, cua_version: xExecFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim(), load_factor: args.load ? (args.loadFactor ?? 1) : 0, lanes: laneFlags });
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
    // the stop runs' engine: as it ships, or with the exit settle a measurement step sets
    const stopArgs = args.exitSettleMs === undefined ? [] : ['--exit-settle-ms', String(args.exitSettleMs)];
    const ctx = { desktop, oracle, emit, cua: args.cua, out: args.out, trace: Boolean(args.trace), need: args.samplesTrials ?? CONSECUTIVE, stopArgs, pasteText: pasteTexts(), scenarios: chosen.scenarios };
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
        const cutsKeys = CHROMIUM.includes(family) && stops;
        const lane = async (name) => {
          for (const scenarioName of ctx.scenarios) results.series.push(await series(ctx, family, name, scenarioName, windows));
          results.audits.push(...(await auditPass(ctx, family, name, windows)));
        };
        if (!args.stopsOnly) for (const name of lanes.filter((l) => l !== 'control')) await lane(name);
        if (cutsKeys) {
          for (let i = 0; i < SIGTERM_RUNS; i++) results.stops.push(await stopRun(ctx, family, 'SIGTERM', windows, i));
          for (let i = 0; i < POINTER_STOP_RUNS; i++) results.stops.push(await stopRun(ctx, family, 'SIGTERM', windows, i, 'clicks'));
        }
        if (!args.stopsOnly && lanes.includes('control')) await lane('control');
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
 * The experiment's verdict from its results: every judged series reached its consecutive passes, every Chromium control
 * series showed the reorder, every audit is clean, every SIGTERM run kept its order and settled, every SIGKILL run did
 * not settle; a family that could not be opened fails it. Returns the summary's lines and the failures.
 */
export function focusTimerVerdict({ series: all, audits, stops, skipped }, { families, stopsOnly = false }) {
  const failed = [];
  const md = ['| family | lane | scenario | runs | misses | passing streak at the end | verdict | raw misses | raw streak | median burst ms |', '|---|---|---|---:|---:|---:|---|---:|---:|---:|'];
  for (const s of all) {
    let verdict;
    if (judged(s.lane)) {
      const need = s.need ?? CONSECUTIVE;
      const name = `${s.family} ${s.scenario}${s.lane === 'shipped' ? '' : ` (${s.lane})`}`;
      verdict = s.reached ? `${need} consecutive` : '**not reached**';
      if (!s.reached) failed.push(`${name}: no ${need} consecutive passing runs in ${s.runs}`);
      if (need < CONSECUTIVE) failed.push(`${name}: a development series of ${need}, not the ${CONSECUTIVE} the proof needs`);
    } else {
      const required = CHROMIUM.includes(s.family);
      verdict = s.misses > 0 ? `fails without its protection (${s.misses}/${s.runs}; the text wrong in ${s.wrong_text ?? '?'})` : required ? '**shows nothing**' : 'no reorder (not required)';
      if (required && s.misses === 0) failed.push(`${s.family} ${s.scenario}: the control lane showed no reorder in ${s.runs} runs, so the test cannot see one`);
    }
    // a timed lane's misses by cause: the retry guard refusing after an earlier miss is not a miss of its own
    const causes = judged(s.lane) && s.misses ? ` (${Object.entries(s.miss_causes ?? {}).map(([c, n]) => `${c} ${n}`).join(', ')})` : '';
    md.push(`| ${s.family} | ${s.lane} | ${s.scenario} | ${s.runs} | ${s.misses} | ${s.streak} | ${verdict}${causes} | ${s.raw?.misses ?? '–'} | ${s.raw?.streak ?? '–'} | ${s.burst_ms_median ?? '–'} |`);
  }
  md.push('', '| family | lane | scenario | engine flags | audit | FocusOuts attributed (deferred) | sessions as expected | problems |', '|---|---|---|---|---|---:|---|---|');
  for (const a of audits) {
    md.push(`| ${a.family} | ${a.lane} | ${a.scenario ?? 'all'} | ${a.args?.length ? `\`${a.args.join(' ')}\`` : '–'} | ${a.clean ? 'clean' : '**not clean**'} | ${a.attributed.length} (${a.deferred}) | ${JSON.stringify(a.sessions.seen) === JSON.stringify(a.sessions.expected) ? 'yes' : '**no**'} | ${[...a.problems, ...a.forbidden.map((f) => f.what)].join('; ') || '–'} |`);
    if (!a.clean) failed.push(`${a.family} ${a.lane}${a.scenario ? ` ${a.scenario}` : ''}: the audit is not clean`);
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
          if (good !== rows.length) failed.push(`${family} ${signal}${input === 'keys' ? '' : ` (${input})`}: ${rows.length - good} of ${rows.length} runs ${signal === 'SIGTERM' ? `did not keep ${what} in order through the exit's settle` : 'settled, so the settle check is blind'}`);
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
