// Whether a background input activates a Qt window (M4, task 61): `--experiment qt-activation`. At twice the gate's
// load a background click to kate or qtcreator made the front window lose its active state (task 60's fix, 27 of 30
// and 28 of 30), never idle. Qt's xcb backend asks the window manager to activate a window when it handles a button
// press while its own focus window (`QGuiApplication::focusWindow()`) is not that window
// (`QXcbWindow::handleButtonPressEvent`, Qt 5.15 and 6.4 alike), and it sets that focus window only once the window
// system event a FocusIn queued is delivered, after the batch of X events it read the FocusIn in. When the synthetic
// FocusIn and the press arrive in one batch, which a loaded Qt main thread makes likely, the press finds no focus
// window and Qt sends `_NET_ACTIVE_WINDOW` (source 1) itself. cua's engine therefore waits, before a background press
// to a family whose press activates it (families.rs), until the window's AT-SPI frame reports `active`: Qt's own focus
// state, which it sets in the same step as the focus window (`focus_ack.rs`).
//
// Per Qt family and input kind, in the lanes `--lanes` names (`LANES`): the pinned vendor build (`--vendor`), cua's
// released 0.3.0 (`--released`), cua's engine as it ships (`--cua`), the focus wait at each measured bound (`ack-<ms>`)
// and the control with no wait (`control`, `--focus-ack-ms 0`). Each run is a fresh engine's, one request (a key then a
// click for `key-click`), sent while the window is covered by the front window, which holds the focus, inside a witness
// span that lasts until the input's effect shows and a tail after it: any change of the active window, the stacking,
// the focus or the pointer, and any activation request (even one the window manager ignored), fails it, and so does a
// front window that is no longer active after the span. Kinds (`--kinds`, default `click`):
//
// - `click`: a click at the field's first character, the caret at the text's end before it; the effect is the caret at 0;
// - `key-click`: a `press_key` and that click pipelined, so the click's session opens while Qt still counts the key's
//   session's FocusOut down (its 100 ms focusInTimer), with the window still Qt's focus window;
// - `press_key`: `Left`, the caret moved back by one (keys never ask for activation in Qt's source);
// - `drag`: along the first line from its first character, the effect a selection from 0;
// - `scroll`: three wheel steps at the first character; Qt ignores synthetic wheel events (families.rs), so cua refuses
//   it in shared mode and the vendor sends it unheeded: judged by the desktop alone.
//
// A judged lane (`shipped`, `ack-<ms>`) must reach 30 consecutive passing runs in at most 60 (the wait rule); the
// comparison lanes (`pinned`, `released`, `control`) run 30 and count. At load the control must activate at least once
// per family on a click, which shows the witness sees an activation; idle it is the idle control.
//
// Where it runs: only on a private X server it starts itself, with Openbox, as the focus-timer experiment does
// (focus-timer.mjs); `--load-factor 2` runs it at twice the gate's load.

import { performance } from 'node:perf_hooks';

import { Engine } from './engine.mjs';
import { openFamily } from './families.mjs';
import { seriesVerdict } from './focus-timer.mjs';
import { Oracle } from './oracle.mjs';
import { Desktop, activeWindow, desktopEnding } from './scenes.mjs';
import { median } from './stats.mjs';
import { judgeSpan, startWitness } from './witness.mjs';
import { XPROBE, startPrivateServer } from './xtools.mjs';
import { LIVE_RUN, assertReachable, xExecFileSync } from './xspawn.mjs';

/** The Qt families of the matrix: Qt 5.15's kate and Qt 6.4's qtcreator. */
export const QT_FAMILIES = ['kate', 'qtcreator'];
/** The input kinds, in the experiment's order. */
export const KINDS = ['click', 'key-click', 'press_key', 'drag', 'scroll'];
export const DEFAULT_KINDS = ['click'];
/** The focus wait's measured bounds, in ms (`--focus-ack-ms`), by the wait rule. */
export const ACK_STEPS = [25, 50, 100, 200];
/** Each lane's engine: which binary (`--vendor`, `--released`, `--cua`) and its flags. */
export const LANES = {
  pinned: { bin: 'vendor', args: [] },
  released: { bin: 'released', args: [] },
  shipped: { bin: 'cua', args: [] },
  ...Object.fromEntries(ACK_STEPS.map((ms) => [`ack-${ms}`, { bin: 'cua', args: ['--focus-ack-ms', String(ms)] }])),
  control: { bin: 'cua', args: ['--focus-ack-ms', '0'] },
};
/** The lanes a sitting runs unless `--lanes` names others: the comparison the design session ruled first. */
export const DEFAULT_LANES = ['pinned', 'released', 'shipped', 'control'];
/** Whether a lane must pass by the wait rule; the others are counted. */
export const judged = (lane) => lane === 'shipped' || lane.startsWith('ack-');
export const CONSECUTIVE = 30;
export const MAX_RUNS = 60;
/** The runs of a comparison lane (the design session: 30 each). */
export const COMPARISON_RUNS = 30;
/** How long a run waits for its effect, inside its span, and the span's tail after it. */
export const EFFECT_BOUND_MS = 3000;
export const TAIL_MS = 200;
/** After the span, before the front window's state is read: the window manager's answer to a late request. */
export const AFTER_MS = 300;
/** Between runs: past Qt's 100 ms focusInTimer, so a run starts with Qt's focus window empty. */
export const QUIET_MS = 300;
/** A scroll's pixels: three wheel steps. */
export const SCROLL_PIXELS = 300;

const NO_DISPLAY = ':cua171-qt-activation';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tenth = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

/** A lane's engine: `{bin, args, cua}`, refusing a lane whose binary the command line did not give. */
export function laneEngine(lane, args) {
  const spec = LANES[lane];
  if (!spec) throw new Error(`unknown qt-activation lane ${lane}`);
  const bin = args[spec.bin];
  if (!bin) throw new Error(`the ${lane} lane needs --${spec.bin}`);
  return { bin, args: spec.args, cua: spec.bin !== 'vendor' };
}

/** The lanes a sitting runs, in the experiment's order. */
export function chosenLanes(args) {
  if (!args.lanes?.length) return DEFAULT_LANES;
  for (const name of args.lanes) if (!LANES[name]) throw new Error(`unknown qt-activation lane ${name}; known: ${Object.keys(LANES).join(', ')}`);
  return Object.keys(LANES).filter((name) => args.lanes.includes(name));
}

/** The kinds a sitting runs, in the experiment's order. */
export function chosenKinds(args) {
  if (!args.kinds?.length) return DEFAULT_KINDS;
  for (const name of args.kinds) if (!KINDS.includes(name)) throw new Error(`unknown qt-activation kind ${name}; known: ${KINDS.join(', ')}`);
  return KINDS.filter((name) => args.kinds.includes(name));
}

/** A kind's requests to window `w`, at the field's first character (`first`) and a point further along its line (`later`). */
export function kindRequests(kind, w, { first, later }) {
  const window = { id: w };
  const click = { command: 'click', input: { window, x: first.x, y: first.y } };
  if (kind === 'click') return [click];
  if (kind === 'key-click') return [{ command: 'press_key', input: { window, key: 'shift' } }, click];
  if (kind === 'press_key') return [{ command: 'press_key', input: { window, key: 'Left' } }];
  if (kind === 'drag') return [{ command: 'drag', input: { window, path: [{ x: first.x, y: first.y }, { x: later.x, y: later.y }] } }];
  if (kind === 'scroll') return [{ command: 'scroll', input: { window, x: first.x, y: first.y, direction: 'down', pixels: SCROLL_PIXELS } }];
  throw new Error(`unknown kind ${kind}`);
}

/**
 * Whether a kind's effect landed, from the field's caret and first selection before and after (`{caret, selection}`),
 * the caret before at the text's end, below the field's first line (`lineEnd`, its length): a click puts the caret in
 * that line, a key moves it back by one, a drag selects within that line; null for a scroll, which Qt ignores.
 */
export function effectLanded(kind, before, after, { lineEnd }) {
  const inLine = (offset) => Number.isInteger(offset) && offset >= 0 && offset <= lineEnd;
  if (kind === 'click' || kind === 'key-click') return after.caret !== before.caret && inLine(after.caret);
  if (kind === 'press_key') return after.caret === before.caret - 1;
  if (kind === 'drag') return Array.isArray(after.selection) && inLine(after.selection[0]) && inLine(after.selection[1]) && after.selection[1] > after.selection[0];
  return null;
}

/** The activation requests a span's witness saw (`xprobe witness`'s focus record): a client asking for any window. */
export function spanActivations(report) {
  return (report?.focus ?? []).filter((e) => e.kind === 'activate').map(({ window, source, t_ms: t }) => ({ window, source, t_ms: t }));
}

/** A span with no change of the desktop (`judgeSpan`, strict) and no activation request. */
export function spanClean(report) {
  return judgeSpan(report).clean && spanActivations(report).length === 0;
}

/** The Device mode sentence's tail (engine/way.rs `no_background_input`): a kind the family ignores, refused. */
const REFUSED = /does not accept background input; use a dedicated desktop or activate the window first$/;

/**
 * Whether a run passes: the desktop clean through its span and the front window still active after it, every answer a
 * success, and the effect landed; a scroll, which Qt ignores, is judged by the desktop and, on a cua lane, by its
 * refusal (nothing sent).
 */
export function runPasses({ kind, cua, answers, desktop, landed }) {
  if (!desktop.clean || !desktop.frontActive) return false;
  if (kind === 'scroll') return cua ? answers.every((a) => a.ok === false && REFUSED.test(String(a.error))) : answers.every((a) => a.ok === true);
  return answers.every((a) => a.ok === true) && landed === true;
}

/** The field's caret and first selection, read once the reads agree (a field still taking an input moves under them). */
async function fieldState(oracle, scene) {
  let last = null;
  for (let i = 0; i < 20; i++) {
    let now;
    try {
      now = { caret: oracle.caret(scene.field), selection: oracle.selection(scene.field), length: oracle.text(scene.field).length };
    } catch {
      now = null;
    }
    if (now && last && JSON.stringify(now) === JSON.stringify(last)) return now;
    last = now;
    await sleep(30);
  }
  return last ?? { caret: null, selection: null, length: null };
}

/** The field's first character and a point five characters on, window-relative. */
async function fieldPoints(desktop, oracle, scene) {
  const { response } = await desktop.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
  if (!response.ok) throw new Error(`${scene.label}: no window state (${response.error})`);
  const origin = response.output.window;
  // Qt's KTextEditor answers a character's width with no height: the point is then 6 px into the line
  const at = (offset, part) => {
    const e = oracle.charExtents(scene.field, offset);
    if (!(e.w > 0 && e.h >= 0)) throw new Error(`${scene.label}: no extents for character ${offset} (${JSON.stringify(e)})`);
    return { x: Math.round(e.x - origin.x + Math.max(1, e.w * part)), y: Math.round(e.y - origin.y + (e.h > 0 ? e.h / 2 : 6)) };
  };
  const lineEnd = oracle.text(scene.field).indexOf('\n');
  if (lineEnd < 6) throw new Error(`${scene.label}: its first line is too short to drag along (${lineEnd})`);
  return { first: at(0, 0.25), later: at(5, 0.75), lineEnd };
}

/** The front window active and covering the screen again after a run that activated the scene window. */
async function restoreFront(desktop) {
  if (activeWindow() === desktop.front.id) return false;
  desktop.arrangeFront('covered');
  await sleep(500);
  return true;
}

/** One run: the field prepared, a fresh engine's requests in a witness span, the effect and the desktop judged. */
async function oneRun(ctx, lane, kind, scene, points, trial) {
  const { desktop, oracle, witness } = ctx;
  const engineSpec = laneEngine(lane, ctx.args);
  const restored = await restoreFront(desktop);
  // the caret at the text's end and no selection, through AT-SPI (no input)
  oracle.on(scene.field, 'org.a11y.atspi.Text', 'RemoveSelection', 'i', 0);
  oracle.setCaret(scene.field, oracle.text(scene.field).length);
  await sleep(QUIET_MS);
  const before = await fieldState(oracle, scene);
  const engine = new Engine({ label: `qt-${lane}`, bin: engineSpec.bin, args: engineSpec.args, stats: engineSpec.cua }).start();
  let span;
  let ms;
  try {
    span = await witness.span(`${scene.family}-${lane}-${kind}-${trial}`, async () => {
      const started = performance.now();
      const { responses } = await engine.pipeline(kindRequests(kind, scene.id, points));
      ms = performance.now() - started;
      // the effect, inside the span: Qt asks for activation while it handles the press, before the press moves the caret
      let after = await fieldState(oracle, scene);
      const until = Date.now() + EFFECT_BOUND_MS;
      while (effectLanded(kind, before, after, points) === false && responses.every((r) => r.ok) && Date.now() < until) {
        await sleep(50);
        after = await fieldState(oracle, scene);
      }
      await sleep(TAIL_MS);
      return { responses, after };
    });
  } finally {
    await engine.close();
  }
  await sleep(AFTER_MS);
  const frontActive = activeWindow() === desktop.front.id;
  const { responses, after } = span.value;
  const landed = effectLanded(kind, before, after, points);
  const clean = spanClean(span.report);
  const answers = responses.map((r) => ({ ok: r.ok, ...(r.ok ? {} : { error: String(r.error).slice(0, 300) }) }));
  const ok = runPasses({ kind, cua: engineSpec.cua, answers, desktop: { clean, frontActive }, landed });
  const stats = engineSpec.cua ? [...engine.statsById.values()].map((s) => s?.focus_ack).filter(Boolean) : [];
  return {
    ok,
    activated: !clean || !frontActive,
    clean,
    front_active: frontActive,
    witness_fields: judgeSpan(span.report).fields,
    activations: spanActivations(span.report),
    answers,
    refused: answers.some((a) => a.ok === false),
    landed,
    before,
    after,
    restored_front: restored,
    focus_ack: stats,
    answered_ms: tenth(ms),
  };
}

/** A lane's series on one family and kind: by the wait rule for a judged lane, `COMPARISON_RUNS` for the others. */
async function series(ctx, lane, kind, scene, points) {
  const need = ctx.need;
  const runs = judged(lane) ? need * (MAX_RUNS / CONSECUTIVE) : need;
  const oks = [];
  const rows = [];
  for (let trial = 0; trial < runs; trial++) {
    const row = await oneRun(ctx, lane, kind, scene, points, trial);
    oks.push(row.ok);
    rows.push(row);
    ctx.emit({ kind: 'qt-activation-run', family: scene.family, lane, input: kind, trial, ...row });
    if (judged(lane) && seriesVerdict(oks, need).reached) break;
  }
  const verdict = seriesVerdict(oks, judged(lane) ? need : Infinity);
  const waits = rows.flatMap((r) => r.focus_ack.map((a) => a.waited_ms)).filter((v) => typeof v === 'number');
  const out = {
    family: scene.family,
    lane,
    kind,
    need,
    ...verdict,
    activated: rows.filter((r) => r.activated).length,
    refused: rows.filter((r) => r.refused).length,
    landed: rows.filter((r) => r.landed === true).length,
    activation_requests: rows.filter((r) => r.activations.length).length,
    ack_waited_median: waits.length ? tenth(median(waits)) : null,
    ack_waited_max: waits.length ? tenth(Math.max(...waits)) : null,
    answered_median: tenth(median(rows.map((r) => r.answered_ms))),
    first_miss: rows.find((r) => !r.ok) ?? null,
  };
  ctx.emit({ kind: 'qt-activation-series', ...out });
  return out;
}

/**
 * The experiment's verdict: every judged lane reached its consecutive passes; at load every control series of a click
 * activated at least once (the witness sees an activation); every family was measured. The comparison lanes are counted
 * in the table, not judged. Returns the summary's lines and the failures.
 */
export function qtActivationVerdict(all, { families, load }) {
  const failed = [];
  const md = ['| family | kind | lane | runs | activated | activation requests | refused | landed | misses | streak | verdict | focus wait median / max ms | answered median ms |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|'];
  for (const s of all) {
    let verdict;
    const name = `${s.family} ${s.kind}`;
    if (judged(s.lane)) {
      verdict = s.reached ? `${s.need} consecutive` : '**not reached**';
      if (!s.reached) failed.push(`${name} (${s.lane}): no ${s.need} consecutive passing runs in ${s.runs}`);
      if (s.need < CONSECUTIVE) failed.push(`${name} (${s.lane}): a development series of ${s.need}, not the ${CONSECUTIVE} the rule needs`);
    } else if (s.lane === 'control') {
      verdict = s.activated > 0 ? `activates without the wait (${s.activated}/${s.runs})` : load && ['click', 'key-click'].includes(s.kind) ? '**activated nothing**' : 'activated nothing';
      if (load && s.kind === 'click' && s.activated === 0) failed.push(`${name}: the control lane activated nothing in ${s.runs} runs at load, so the test cannot see an activation`);
    } else {
      verdict = 'counted';
    }
    const wait = s.ack_waited_median === null || s.ack_waited_median === undefined ? '–' : `${s.ack_waited_median} / ${s.ack_waited_max}`;
    md.push(`| ${s.family} | ${s.kind} | ${s.lane} | ${s.runs} | ${s.activated} | ${s.activation_requests ?? '–'} | ${s.refused} | ${s.landed} | ${s.misses} | ${s.streak} | ${verdict} | ${wait} | ${s.answered_median ?? '–'} |`);
  }
  for (const family of families) if (!all.some((s) => s.family === family)) failed.push(`${family} was not measured`);
  return { md, failed };
}

/** DISPLAY set to a display the spawner lets this process reach: its own, or the hermetic name before it has one. */
function useDisplay(display) {
  assertReachable('the qt-activation experiment', [], { DISPLAY: display });
  process.env.DISPLAY = display;
}

/** `--experiment qt-activation`: every family's kinds and lanes; `{md, complete, failed, ending}`. */
export async function runQtActivation(args, { emit, run, startLoad }) {
  // from here on the spawner refuses every display this process did not create, the person's included (xspawn.mjs)
  delete process.env[LIVE_RUN];
  useDisplay(NO_DISPLAY);
  // the lanes, the kinds and every lane's binary checked before anything starts
  const lanes = chosenLanes(args);
  const kinds = chosenKinds(args);
  for (const lane of lanes) laneEngine(lane, args);
  const cuaVersion = xExecFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim();
  const server = await startPrivateServer({ out: args.out });
  useDisplay(server.display);
  emit({ kind: 'qt-activation-display', display: server.display, load_factor: args.load ? (args.loadFactor ?? 1) : 0, lanes: Object.fromEntries(lanes.map((l) => [l, { ...LANES[l], path: laneEngine(l, args).bin }])), cua_version: cuaVersion, kinds });
  const desktop = new Desktop({ cua: args.cua, run, logs: args.out });
  const families = args.families.length ? args.families : QT_FAMILIES;
  const all = [];
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
    load = args.load ? startLoad(emit, args.loadFactor ?? 1) : null;
    const ctx = { desktop, oracle, witness, emit, args, need: args.samplesTrials ?? CONSECUTIVE };
    for (const family of families) {
      let scene;
      try {
        scene = await openFamily(desktop, oracle, family, 'qt-a');
        if (!scene.field) throw new Error(`${family}'s window has no text field the harness can read`);
        desktop.arrangeFront('covered');
        await sleep(500);
      } catch (error) {
        skipped.push({ family, why: String(error.message).slice(0, 300) });
        emit({ kind: 'qt-activation-skipped', family, why: String(error.message).slice(0, 300) });
        continue;
      }
      try {
        const points = await fieldPoints(desktop, oracle, scene);
        emit({ kind: 'qt-activation-scene', family, window: scene.id, points });
        for (const kind of kinds) for (const lane of lanes) all.push(await series(ctx, lane, kind, scene, points));
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
  const { md, failed } = qtActivationVerdict(all, { families, load: Boolean(args.load) });
  for (const s of skipped) failed.push(`${s.family} could not be opened: ${s.why}`);
  for (const f of ending.foreign) failed.push(`a window the experiment did not open was changed: ${f}`);
  if (!watched.clean) failed.push(`the private display's watchdog: ${watched.reason}`);
  if (failed.length) md.push('', `**Incomplete or failed:** ${failed.join('; ')}.`);
  emit({ kind: 'qt-activation-verdict', pass: failed.length === 0, failed });
  return { md, complete: failed.length === 0, failed, ending };
}
