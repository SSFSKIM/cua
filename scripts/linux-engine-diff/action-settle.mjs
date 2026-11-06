// The action settle through cua's own Linux service (#171 M4, T8): `--experiment settle`. cua's service holds the call
// after a successful input until that input's method's settle has passed (src/services/engine/linux/settle.mjs), so the
// model's next observation finds the input's effect. Per cell (a scene, an input kind, a route, an occlusion;
// action-settle-cells.mjs CELLS), each run sends the input through the service, as a kernel's call reaches it, then
// reads the effect at once the way the model would see it:
//
// - where the window's tree carries the effect (the input page's status lines, a field's text where its node has a
//   value, a counter's name), through the same service's `get_window_state`, which itself waits for the settle the
//   input deferred;
// - where the tree hides it (a caret, a selection, a field whose node carries no text, a terminal's screen, the
//   clipboard, what xterm's program received, an activation: the window manager's `_NET_ACTIVE_WINDOW` and the frame's
//   ACTIVE state, which the vendor's state names leave out), through the harness's own reader the moment the service's
//   settle ends
//   (`settler.wait()`, the instant the next call would reach the engine): AT-SPI on a connection kept open
//   (bus-client.mjs), so the read starts at once.
//
// The lanes (`--lanes`): every method at one step (`settle-<ms>`, action-settle-cells.mjs STEPS) or the shipped
// constants (`shipped`). Without `--lanes` a sitting searches: each cell's series at 0 ms, then at the next step only
// while none held, so the 0 ms lane is the control that must miss where a settle is needed. A series is the wait rule's:
// 30 consecutive passing runs in at most 60 (`--trials` sets a development count), a fresh service and engine for each,
// one independent run after another (the previous input settled and its effect read before the next run's reading
// before). A run passes on its answers and its effect; on the background route its witness span (the input and the
// reading of its effect) must also leave the desktop alone, with no activation request, and the front window still
// active after (task 61). A missed run records whether its effect came later (`late_ms`) or never. With `--lanes
// shipped`, each background cell also gets an audit pass (`--no-audit` skips it): runs with the engine's X connection
// through xtrace, every request judged by audit.mjs `auditRequests`.
//
// Where it runs: only on a private X server it starts itself, with Openbox, as the focus-timer experiment does
// (focus-timer.mjs); `--load-factor 2` runs it at twice the gate's load. The cells of each family (`--family`,
// action-settle-cells.mjs FAMILY_SCENES) run with that family's windows open and close them after.

import { statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { auditRequests, parseXtrace, startProxy } from './audit.mjs';
import { AsyncOracle } from './bus-client.mjs';
import { clipRead } from './clip.mjs';
import { ACTIVATING, CONSECUTIVE, FAMILY_SCENES, KIND_METHOD, MAX_RUNS, SCENES, cellName, cellsFor, chosenPlan, hopeless, landed, laneSettles, runPasses, settleVerdict } from './action-settle-cells.mjs';
import { Engine, runTmpdirInProcess } from './engine.mjs';
import { FAMILIES, openFamily } from './families.mjs';
import { CHROMIUM, pasteTexts, seriesVerdict } from './focus-timer.mjs';
import { preorder } from './normalize.mjs';
import { parseInputStatus } from './ops.mjs';
import { Oracle } from './oracle.mjs';
import { Desktop, a11yBusAddress, activeWindow, desktopEnding } from './scenes.mjs';
import { median } from './stats.mjs';
import { judgeSpan, spanActivations, spanClean, startWitness } from './witness.mjs';
import { XPROBE, startPrivateServer, xdotool } from './xtools.mjs';
import { LIVE_RUN, assertReachable, xExecFileSync } from './xspawn.mjs';
import { ActionSettler } from '../../src/services/engine/linux/settle.mjs';
import { createService } from '../../src/services/engine/linux/service.mjs';

/**
 * Before each run: past every settle step. (A click alternates between two points far enough apart that no two make a
 * double click.)
 */
export const QUIET_MS = 250;
/** How long a missed run's effect is waited for after its reading, to tell a late effect from one that never came. */
export const LATE_BOUND_MS = 2000;
/** A background cell's audit runs through xtrace (`--lanes shipped`). */
export const AUDIT_RUNS = 5;
/** The word a clipboard cell copies, at the start of the field's text. */
export const WORD = 'cua171';
const SEED = `${WORD} settle field`;
const ACTIVE = 1;
const NO_DISPLAY = ':cua171-settle';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tenth = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n ?? null);
const execute = (method, input) => ({ type: 'execute', method, args: [input] });

/** A settled call: `{ok: true, value}` or `{ok: false, error}`. */
async function settled(run) {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).slice(0, 300) };
  }
}

/** The accessible names of a tree's nodes, in preorder. */
const names = (tree) => preorder(tree).map((n) => n.name).filter((n) => typeof n === 'string');
const counterOf = (list, pattern) => {
  const m = list.map((n) => n.match(pattern)).find(Boolean);
  return m ? Number(m[1]) : null;
};

/** A scene's reading from the window's tree (through the service), in the shape its effects are judged in. */
export function fromTree(sc, state) {
  const root = state.ax_tree;
  const list = names(root);
  if (sc.effects === 'input-page') return parseInputStatus(list);
  if (sc.effects === 'settle-scene' || sc.effects === 'counter') {
    return { presses: counterOf(list, /^presses (\d+)$/), moves: counterOf(list, /^moves (\d+)/), scrolls: counterOf(list, /\bscrolls (\d+)$/) };
  }
  if (sc.effects === 'gtk4-input') {
    const line = list.find((n) => /^scroll -?\d+ scale -?\d+ moves \d+ presses \d+ keys \d+ rights \d+$/.test(n));
    const num = (key) => (line ? Number(line.match(new RegExp(`\\b${key} (-?\\d+)`))[1]) : null);
    return { scroll: num('scroll'), scale: num('scale'), moves: num('moves'), presses: num('presses'), keys: num('keys') };
  }
  const field = sc.field ? preorder(root).find((n) => n.native_id === sc.field) : null;
  return { text: field?.value ?? null };
}

/**
 * Where a cell's effect is read: `tree` (through the service's observation) or `oracle` (the harness's reader, at the
 * settle's end). A field's text is the tree's where the scene's node carries it (`textInTree`, checked at open).
 */
export function sourceOf(cell, sc) {
  // the window manager's `_NET_ACTIVE_WINDOW` and the application's frame's ACTIVE state, neither of which the tree carries
  if (cell.kind === 'activate_window') return 'oracle';
  if (['input-page', 'settle-scene', 'counter', 'gtk4-input'].includes(sc.effects)) return 'tree';
  if (['field', 'editor', 'paragraphs'].includes(sc.effects) && ['press_key', 'key_down', 'type_text', 'clipboard_write'].includes(cell.kind)) return sc.textInTree ? 'tree' : 'oracle';
  return 'oracle';
}

/** A scene's reading from the harness's own readers, for a cell whose effect the tree hides. */
async function fromOracle(ctx, cell, sc, run) {
  const { bus } = ctx;
  if (cell.kind === 'activate_window') {
    // the application's word first, on the kept connection; then the window manager's, through xprop
    const active = CHROMIUM.includes(sc.family) ? null : Boolean((await bus.states(sc.frame))[0] & (1 << ACTIVE));
    return { active, wm: activeWindow() === sc.id };
  }
  if (sc.effects === 'record') return { bytes: statSync(sc.record).size };
  if (sc.effects === 'screen') return { text: await bus.text(sc.terminal) };
  if (cell.kind === 'clipboard_read') return { clipboard: clipRead().text ?? null };
  const node = run.node ?? sc.field;
  if (cell.kind === 'click' || cell.kind === 'key_click') return { caret: await bus.caret(node) };
  if (cell.kind === 'drag' || cell.kind === 'drag_handle') return { selection: await bus.selection(node) };
  return { text: await bus.text(node) };
}

/** A reading of the cell's effect, through its source; `tree` keeps the state read (its element numbers). */
async function readEffect(ctx, cell, sc, svc, run) {
  if (sourceOf(cell, sc) === 'tree') {
    const state = await svc.handleRpc(execute('get_window_state', { window: { id: sc.id }, include_screenshot: false }));
    return { reading: fromTree(sc, state), tree: state.ax_tree };
  }
  return { reading: await fromOracle(ctx, cell, sc, run) };
}

/** A reading once the scene has stopped changing (two equal 100 ms apart), for a run's reading before. */
async function quietReading(ctx, cell, sc, svc, run) {
  let last = await readEffect(ctx, cell, sc, svc, run);
  for (let i = 0; i < 20; i++) {
    await sleep(100);
    const now = await readEffect(ctx, cell, sc, svc, run);
    if (JSON.stringify(now.reading) === JSON.stringify(last.reading)) return now;
    last = now;
  }
  return last;
}

const decimalOf = (tree, nativeId) => preorder(tree ?? { children: [] }).find((n) => n.native_id === nativeId)?.id ?? null;
const at = (sc, { x, y }, route) => (route === 'desktop' ? { x: sc.origin.x + x, y: sc.origin.y + y } : { x, y });

/** A cell's requests to the service for run `run` (its window omitted on the desktop route). */
export function requestsOf(cell, sc, run) {
  const target = cell.route === 'desktop' ? {} : { window: { id: sc.id } };
  const point = (p) => at(sc, p, cell.route);
  switch (cell.kind) {
    case 'press_key':
    case 'key_down':
    case 'key_up':
      return [execute(cell.kind, { ...target, key: run.key })];
    case 'click':
      return [execute('click', { ...target, ...point(run.point) })];
    case 'key_click':
      return [execute('press_key', { ...target, key: 'shift' }), execute('click', { ...target, ...point(run.point) })];
    case 'click_element':
      return [execute('click', { ...target, element_id: run.element })];
    case 'right_click':
      return [execute('click', { ...target, element_id: run.element, mouse_button: 'right' })];
    case 'secondary_action':
      return [execute('perform_secondary_action', { ...target, element_id: run.element, action: run.action })];
    case 'move':
      return [execute('move', { ...target, ...point(run.point) })];
    case 'move_relative':
      return [execute('move_relative', { dx: run.dx, dy: 0 })];
    case 'scroll':
      return [execute('scroll', { ...target, ...point(run.point), direction: run.direction, pixels: run.pixels })];
    case 'drag':
      return [execute('drag', { ...target, path: run.path.map(point) })];
    case 'drag_handle': {
      const [start, ...rest] = run.path.map(point);
      return [{ type: 'drag_start', handle_id: run.handle, point: start }, ...rest.map((p) => ({ type: 'drag_move', handle_id: run.handle, point: p })), { type: 'drag_end', handle_id: run.handle }];
    }
    case 'type_text':
      return [execute('type_text', { ...target, text: run.text })];
    case 'clipboard_read':
      return [execute('clipboard_read', { ...target })];
    case 'clipboard_write':
      return [execute('clipboard_write', { ...target, handle: run.handle })];
    case 'activate_window':
      return [execute('activate_window', { window: { id: sc.id } })];
    case 'activate_click':
      // the click pipelined on the activation's answer, windowless at the window's point on the screen (task 63)
      return [execute('activate_window', { window: { id: sc.id } }), execute('click', at(sc, run.point, 'desktop'))];
    default:
      throw new Error(`no requests for ${cell.kind}`);
  }
}

/**
 * Puts a field's caret at `offset` (its text's end when none is given), with no selection, through AT-SPI (no input). GTK 4's text refuses both
 * (`NotSupported`); the kinds it runs (a paste, judged by the text's count of the pasted word) need neither.
 */
function caretAt(ctx, node, offset = null) {
  const { oracle } = ctx;
  try {
    oracle.on(node, 'org.a11y.atspi.Text', 'RemoveSelection', 'i', 0);
  } catch {
    // none to remove
  }
  try {
    oracle.setCaret(node, offset ?? [...oracle.text(node)].length);
  } catch (error) {
    if (!ctx.caretRefused?.has(node)) throw error;
  }
}

/**
 * A scene's text put back to what it opened with, through AT-SPI, where the toolkit lets the harness delete (not
 * Chromium's): the series before grew it at its end, and a long last line keeps the view scrolled sideways, the first
 * line out of view, whatever the caret does.
 */
function trimText(ctx, sc) {
  if (!sc.baseText || !sc.field || sc.effects === 'paragraphs') return;
  try {
    const text = ctx.oracle.text(sc.field);
    if (text.length > sc.baseText.length && text.startsWith(sc.baseText)) ctx.oracle.on(sc.field, 'org.a11y.atspi.EditableText', 'DeleteText', 'ii', [...sc.baseText].length, [...text].length);
  } catch {
    // a field that refuses: its runs are judged on the text as it is
  }
}

/**
 * A terminal's screen cleared and its cursor put home, by keys its program echoes (`ESC [ 2 J`, `ESC [ H`; a capital
 * is its letter with Shift, as press_key's chords name it).
 */
async function clearScreen(ctx, sc) {
  const engine = new Engine({ label: 'settle-clear', bin: ctx.cua }).start();
  try {
    for (const key of ['Escape', 'bracketleft', '2', 'shift+j', 'Escape', 'bracketleft', 'shift+h']) {
      const { response } = await engine.request('press_key', { window: { id: sc.id }, key });
      if (response.ok !== true) throw new Error(`clearing ${sc.label}: ${response.error}`);
    }
  } finally {
    await engine.close();
  }
  for (let i = 0; i < 40; i++) {
    if (!(await ctx.bus.text(sc.terminal)).trim()) return;
    await sleep(50);
  }
  throw new Error(`${sc.label}'s screen did not clear`);
}

/**
 * A run's preparation, untimed and outside its span, through AT-SPI or the service: what it sends (`run`) and the
 * state its effect is judged from. Every input it makes goes through the service under test, and the quiet before the
 * run lets that input's settle and effect pass.
 */
async function prepareRun(ctx, cell, sc, svc, trial) {
  const run = { trial };
  const effects = sc.effects;
  // the desktop route aims at the screen: the window's place read again, since the window manager may have moved it
  // since the scene opened (the points are the window's own)
  if (cell.route === 'desktop' || cell.kind === 'activate_click') sc.origin = (await ctx.desktop.state(sc)).window;
  // where a click or a drag goes in the text, read once the caret is parked (`aimAtText`): the view may have scrolled
  let line = null;
  const aimAtText = async () => {
    sc.origin = (await ctx.desktop.state(sc)).window;
    sc.lines = linesOf(ctx, sc, sc.lineSpec);
    line = sc.lines[trial % 2];
  };
  if (['press_key', 'key_down', 'key_up'].includes(cell.kind)) {
    run.key = 'x';
    if (['field', 'editor', 'paragraphs'].includes(effects)) {
      caretAt(ctx, sc.field);
      run.key = [...ctx.oracle.text(sc.field)].length > sc.baseLength ? 'BackSpace' : 'x';
    }
    if (effects === 'screen') await clearScreen(ctx, sc);
    if (cell.kind === 'key_up') {
      const down = await settled(() => svc.handleRpc(execute('key_down', { ...(cell.route === 'desktop' ? {} : { window: { id: sc.id } }), key: run.key })));
      if (!down.ok) throw new Error(`${cellName(cell)}: the key_down before the key_up failed: ${down.error}`);
    }
  } else if (['click', 'key_click', 'move', 'activate_click'].includes(cell.kind)) {
    if (effects === 'editor' || effects === 'paragraphs') {
      // the caret parked at the first line's end (in Writer, at the next paragraph's), so the click must move it
      caretAt(ctx, sc.park.node, sc.park.offset);
      await aimAtText();
      Object.assign(run, { point: line.point, line: line.span, node: line.node });
    } else run.point = sc.points[cell.kind === 'move' ? 'move' : 'click'][trial % 2];
    if (effects === 'screen') await clearScreen(ctx, sc);
  } else if (cell.kind === 'move_relative') {
    // the pointer over the pad's middle first (the harness's own move, through xdotool), then 40 px either way
    const [x, y] = [sc.origin.x + 500, sc.origin.y + 150];
    xdotool('mousemove', '--sync', String(x), String(y));
    run.dx = trial % 2 ? -40 : 40;
  } else if (cell.kind === 'scroll') {
    run.point = sc.points.scroll;
    run.pixels = sc.scrollPixels;
    run.direction = sc.effects === 'input-page' ? 'down' : trial % 2 ? 'up' : 'down';
    if (effects === 'screen') await clearScreen(ctx, sc);
  } else if (cell.kind === 'drag' || cell.kind === 'drag_handle') {
    if (effects === 'editor' || effects === 'paragraphs') {
      // the last drag's selection cleared and the caret parked first: a press inside a selection starts a drag and drop
      // of the selected text (GTK 3), not a new selection
      caretAt(ctx, sc.park.node, sc.park.offset);
      await aimAtText();
      Object.assign(run, { path: line.path, line: line.span, node: line.node });
    } else run.path = sc.paths[trial % 2];
    run.handle = `settle-${trial}`;
  } else if (cell.kind === 'type_text') {
    run.text = ctx.pasteText();
    if (effects === 'screen') await clearScreen(ctx, sc);
    else caretAt(ctx, sc.field);
  } else if (cell.kind === 'clipboard_read' || cell.kind === 'clipboard_write') {
    caretAt(ctx, sc.field);
    if (!ctx.oracle.select(sc.field, 0, WORD.length)) throw new Error(`${sc.label} refused the selection of its first word`);
    run.word = WORD;
    if (cell.kind === 'clipboard_write') {
      const read = await settled(() => svc.handleRpc(execute('clipboard_read', { window: { id: sc.id } })));
      if (!read.ok) throw new Error(`${cellName(cell)}: the clipboard_read for its handle failed: ${read.error}`);
      run.handle = read.value;
      caretAt(ctx, sc.field);
    }
  }
  // the input page scrolled back to its top after a scroll, untimed (the pad's points assume it)
  if (effects === 'input-page' && cell.kind !== 'scroll') await scrollPageToTop(ctx, sc, svc);
  // a preparation through AT-SPI can activate the window (Chromium's caret and selection calls focus it, as GrabFocus
  // does: focus-timer.mjs): the front window takes the focus back, the page's own focus left where it was
  if (cell.occlusion !== 'active' && activeWindow() !== ctx.desktop.front.id) {
    arrange(ctx, cell, sc);
    await sleep(200);
  }
  return run;
}

/** The input page back at its top (Home, which the page handles), when a scroll left it below. */
async function scrollPageToTop(ctx, sc, svc) {
  for (let i = 0; i < 3; i++) {
    const state = fromTree(sc, await svc.handleRpc(execute('get_window_state', { window: { id: sc.id }, include_screenshot: false })));
    if (state.scroll === 0 || state.scroll === null) return;
    const engine = new Engine({ label: 'settle-top', bin: ctx.cua }).start();
    try {
      await engine.request('press_key', { window: { id: sc.id }, key: 'Home' });
    } finally {
      await engine.close();
    }
    await sleep(600);
  }
}

/** What a run leaves to undo, outside its span: a held key released, a handle freed, the front window active again. */
async function afterRun(ctx, cell, sc, svc, run, answers) {
  if (cell.kind === 'key_down') await settled(() => svc.handleRpc(execute('key_up', { ...(cell.route === 'desktop' ? {} : { window: { id: sc.id } }), key: run.key })));
  if (cell.kind === 'clipboard_read' && answers[0]?.ok) await settled(() => svc.handleRpc(execute('clipboard_release', { handle: answers[0].value })));
  if (cell.kind === 'clipboard_write' && run.handle) await settled(() => svc.handleRpc(execute('clipboard_release', { handle: run.handle })));
  if (cell.kind === 'scroll' && sc.effects === 'input-page') await scrollPageToTop(ctx, sc, svc);
  if (cell.kind === 'activate_window' || cell.kind === 'activate_click') arrange(ctx, cell, sc);
}

/** The scene window in its cell's occlusion, the focus in front (or, on the desktop route, in the scene window). */
function arrange(ctx, cell, sc) {
  const { desktop } = ctx;
  if (cell.occlusion === 'covered') desktop.arrangeFront('covered');
  else if (cell.occlusion === 'unobscured') {
    // the front window in its corner, clear of the scene window, which is raised above the family's other one
    desktop.arrangeFront('visible');
    desktop.raise(sc);
  } else {
    desktop.arrangeFront('visible');
    xdotool('windowraise', sc.id);
    xdotool('windowactivate', '--sync', sc.id);
  }
}

/** One run: prepared, read before, its requests and the reading of their effect in one witness span, then judged. */
async function oneRun(ctx, cell, sc, svc, settler, trial) {
  const run = await prepareRun(ctx, cell, sc, svc, trial);
  await sleep(QUIET_MS);
  const before = await quietReading(ctx, cell, sc, svc, run);
  if (['click_element', 'right_click', 'secondary_action'].includes(cell.kind)) {
    // a named action: the menu's context menu where the toolkit offers one (Chromium), else the button's press (Gecko's
    // buttons offer only `press`)
    if (cell.kind === 'secondary_action') Object.assign(run, sc.secondary);
    run.element = decimalOf(before.tree, cell.kind === 'click_element' || run.action === 'press' ? sc.press : sc.menu);
    if (!run.element) throw new Error(`${cellName(cell)}: the element is not in the window's tree`);
  }
  const source = sourceOf(cell, sc);
  const span = await ctx.witness.span(`${cellName(cell)}#${trial}`, async () => {
    const started = performance.now();
    const answers = [];
    for (const call of requestsOf(cell, sc, run)) {
      const answer = await settled(() => svc.handleRpc(call));
      answers.push(answer);
      if (!answer.ok) break;
    }
    const answered = performance.now();
    let after;
    let waited = null;
    if (source === 'oracle') {
      await settler.wait();
      waited = performance.now() - answered;
      after = await settled(() => fromOracle(ctx, cell, sc, run));
    } else after = await settled(async () => (await readEffect(ctx, cell, sc, svc, run)).reading);
    return { answers, after, answered_ms: answered - started, read_ms: performance.now() - answered, waited_ms: waited };
  });
  const { answers, after, answered_ms: answeredMs, read_ms: readMs, waited_ms: waitedMs } = span.value;
  const background = cell.route === 'background' && !ACTIVATING.includes(cell.kind);
  const frontActive = background ? activeWindow() === ctx.desktop.front.id : null;
  const answersOk = answers.every((a) => a.ok);
  const effect = after.ok ? landed(sc.effects, cell.kind, before.reading, after.value, run) : false;
  let lateMs = null;
  if (!effect && answersOk) {
    const until = performance.now() + LATE_BOUND_MS;
    while (performance.now() < until) {
      await sleep(50);
      const now = await settled(async () => (await readEffect(ctx, cell, sc, svc, run)).reading);
      if (now.ok && landed(sc.effects, cell.kind, before.reading, now.value, run)) {
        lateMs = tenth(performance.now() - (until - LATE_BOUND_MS));
        break;
      }
    }
  }
  await afterRun(ctx, cell, sc, svc, run, answers);
  const desktopClean = spanClean(span.report);
  const ok = runPasses({ route: cell.route, kind: cell.kind, answersOk, landed: effect, desktopClean, frontActive });
  return {
    ok,
    landed: effect,
    late_ms: lateMs,
    answers: answers.map((a) => (a.ok ? { ok: true } : { ok: false, error: a.error })),
    source,
    before: before.reading,
    after: after.ok ? after.value : { error: after.error },
    sent: { key: run.key, point: run.point, path: run.path, direction: run.direction, text: run.text, dx: run.dx, line: run.line },
    desktop_clean: desktopClean,
    front_active: frontActive,
    ...(desktopClean ? {} : { witness: judgeSpan(span.report).fields, activations: spanActivations(span.report) }),
    answered_ms: tenth(answeredMs),
    read_ms: tenth(readMs),
    waited_ms: tenth(waitedMs),
  };
}

/**
 * A fresh service in the cell's mode, its settle the lane's. Its engine is spawned with this process's environment, so
 * the display it names must be the run's own (xspawn.mjs).
 */
function serviceFor(ctx, cell, lane) {
  assertReachable('the settle experiment\'s service', [], process.env);
  const settler = new ActionSettler({ settles: laneSettles(lane) });
  const svc = createService({ env: { CUA_ENGINE_BIN: ctx.cua, CUA_DESKTOP_MODE: cell.route === 'dedicated' ? 'dedicated' : 'shared' }, settler });
  return { svc, settler };
}

/** A lane's series on one cell: the wait rule's 30 consecutive in at most 60 (`ctx.need` for a development count). */
async function series(ctx, cell, sc, lane) {
  const { svc, settler } = serviceFor(ctx, cell, lane);
  const oks = [];
  const rows = [];
  try {
    await svc.handleRpc({ type: 'setup' });
    trimText(ctx, sc);
    arrange(ctx, cell, sc);
    await sleep(300);
    const max = ctx.need * (MAX_RUNS / CONSECUTIVE);
    for (let trial = 0; trial < max; trial++) {
      let row;
      try {
        row = await oneRun(ctx, cell, sc, svc, settler, trial);
      } catch (error) {
        // a preparation the scene refused: the run fails, its reason recorded, and the series goes on
        row = { ok: false, landed: false, late_ms: null, error: String(error.message).slice(0, 300) };
      }
      oks.push(row.ok);
      rows.push(row);
      ctx.emit({ kind: 'settle-run', cell: cellName(cell), scene: cell.scene, input: cell.kind, route: cell.route, lane, load: ctx.load, trial, ...row });
      if (seriesVerdict(oks, ctx.need).reached || hopeless(oks, ctx.need, max)) break;
    }
  } finally {
    svc.close();
  }
  const verdict = seriesVerdict(oks, ctx.need);
  const missed = rows.filter((r) => !r.ok);
  const out = {
    cell: cellName(cell),
    scene: cell.scene,
    input: cell.kind,
    method: KIND_METHOD[cell.kind],
    route: cell.route,
    occlusion: cell.occlusion,
    lane,
    load: ctx.load,
    need: ctx.need,
    ...verdict,
    late: missed.filter((r) => r.late_ms !== null && r.late_ms !== undefined).length,
    never: missed.filter((r) => r.landed === false && (r.late_ms === null || r.late_ms === undefined)).length,
    desktop_misses: missed.filter((r) => r.landed && r.desktop_clean === false).length,
    errors: missed.filter((r) => r.error || r.answers?.some((a) => !a.ok)).length,
    source: rows.find((r) => r.source)?.source ?? null,
    answered_median: tenth(median(rows.map((r) => r.answered_ms).filter(Number.isFinite))),
    read_median: tenth(median(rows.map((r) => r.read_ms).filter(Number.isFinite))),
    first_miss: missed[0] ?? null,
  };
  ctx.emit({ kind: 'settle-series', ...out });
  return out;
}

/** A background cell's audit pass: runs with the engine's X connection through xtrace; nothing forbidden sent. */
async function auditCell(ctx, cell, sc, lane) {
  const proxy = await startProxy();
  const { svc, settler } = serviceFor(ctx, cell, lane);
  const display = process.env.DISPLAY;
  let text;
  const runs = [];
  try {
    // the service's engine is spawned with this process's environment at setup: the proxy's display (the run's own,
    // through xtrace), then back
    assertReachable('the settle experiment\'s audit', [], { DISPLAY: proxy.env.DISPLAY });
    process.env.DISPLAY = proxy.env.DISPLAY;
    try {
      await svc.handleRpc({ type: 'setup' });
    } finally {
      process.env.DISPLAY = display;
    }
    arrange(ctx, cell, sc);
    await sleep(300);
    for (let trial = 0; trial < AUDIT_RUNS; trial++) {
      const row = await settled(() => oneRun(ctx, cell, sc, svc, settler, trial));
      runs.push(row.ok ? { ok: row.value.ok, landed: row.value.landed } : { ok: false, error: row.error });
    }
  } finally {
    svc.close();
    await sleep(300);
    await proxy.mark('end');
    text = await proxy.stop();
  }
  const forbidden = auditRequests(parseXtrace(text));
  const row = { kind: 'settle-audit', cell: cellName(cell), lane, load: ctx.load, clean: forbidden.clean, requests: forbidden.requests, forbidden: forbidden.forbidden.slice(0, 10), runs };
  ctx.emit(row);
  return row;
}

/**
 * Where a click and a drag go in a scene's text: two places on its first line, far enough apart that no two clicks make
 * a double click, each with the line's span of offsets and its points, window-relative. (Qt 6's text answers every
 * line's character extents with the first line's place, so the second line is never aimed at.)
 */
function linesOf(ctx, sc, nodes) {
  const { oracle } = ctx;
  const pointAt = (node, offset, part) => {
    const e = oracle.charExtents(node, offset);
    if (!(e.w > 0 && e.h >= 0)) throw new Error(`${sc.label}: no extents for character ${offset} (${JSON.stringify(e)})`);
    // Qt's KTextEditor answers a character's width with no height: the point is then 6 px into the line
    return { x: Math.round(e.x - sc.origin.x + Math.max(1, e.w * part)), y: Math.round(e.y - sc.origin.y + (e.h > 0 ? e.h / 2 : 6)) };
  };
  return nodes.map(({ node, start, end }) => ({
    node,
    span: [0, end],
    point: pointAt(node, start, 0.25),
    // a dozen characters along: Writer takes a shorter background drag for no selection at all
    path: [pointAt(node, start, 0.25), pointAt(node, Math.min(start + 12, end - 1), 0.75)],
  }));
}

/** A scene opened and resolved: its window, origin, tree source, targets, points and baseline. */
async function openScene(ctx, name) {
  const { desktop, oracle } = ctx;
  const def = SCENES[name];
  // the family's own size asked for, so a browser opens at it and not maximized (families.mjs: Firefox's first window)
  const sc = await openFamily(desktop, oracle, def.family, `settle-${name}`, { geometry: FAMILIES[def.family].geometry, ...(def.page ? { page: def.page } : {}) });
  Object.assign(sc, { name, effects: def.effects });
  const state = await desktop.state(sc);
  sc.origin = state.window;
  sc.treeSource = state.ax_tree_source;
  const nodes = preorder(state.ax_tree);
  sc.frame ??= state.ax_tree_source === 'at_spi' ? state.ax_tree.id : sc.frame;
  // a page's field by its name, where the family's own resolution looks for its fixture's (Electron)
  if (def.page) sc.field ??= nodes.find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
  const { width, height } = sc.origin;
  if (def.effects === 'input-page') {
    const button = (name) => nodes.find((n) => n.role === 'push button' && n.name === name);
    sc.press = button('Press')?.id ?? null;
    sc.menu = button('Menu')?.id ?? null;
    if (!sc.press || !sc.menu) throw new Error(`${sc.label}: the input page has no Press or Menu button`);
    sc.secondary = button('Menu').actions?.includes('showContextMenu') ? { action: 'showContextMenu' } : { action: 'press' };
    sc.points = { click: [{ x: 300, y: 150 }, { x: 700, y: 150 }], move: [{ x: 300, y: 200 }, { x: 700, y: 200 }], scroll: { x: 520, y: 500 } };
    sc.paths = [[{ x: 200, y: 150 }, { x: 380, y: 180 }, { x: 600, y: 240 }], [{ x: 600, y: 240 }, { x: 380, y: 180 }, { x: 200, y: 150 }]];
    sc.scrollPixels = 300;
  }
  if (def.effects === 'field' || def.effects === 'editor') {
    if (!sc.field) throw new Error(`${sc.label}: no text field`);
    if (def.effects === 'field' && !oracle.text(sc.field)) await seedField(ctx, sc);
    const text = oracle.text(sc.field);
    sc.baseText = text;
    sc.baseLength = [...text].length;
    sc.textInTree = (await fieldValue(desktop, sc)) === text;
    if (FAMILIES[def.family].gtk4) ctx.caretRefused.add(sc.field);
    if (def.effects === 'editor' && !FAMILIES[def.family].gtk4) {
      const first = text.indexOf('\n');
      // the text grows at its end through the runs, and a long last line scrolls the view: aimed at again each run
      sc.lineSpec = [{ node: sc.field, start: 0, end: first }, { node: sc.field, start: 10, end: first }];
      sc.lines = linesOf(ctx, sc, sc.lineSpec);
      // the caret parked at the first line's end: the runs grow the text at its end, and a caret parked there would
      // scroll a long last line into view and the first line out of it
      sc.park = { node: sc.field, offset: first };
    }
  }
  if (def.effects === 'paragraphs') {
    const paragraphs = oracle.children(sc.document).filter((id) => oracle.role(id) === 'paragraph');
    if (paragraphs.length < 2) throw new Error(`${sc.label}: fewer than two paragraphs`);
    sc.field = paragraphs[0];
    sc.baseLength = [...oracle.text(sc.field)].length;
    sc.textInTree = false;
    const end = [...oracle.text(sc.field)].length;
    sc.lineSpec = [{ node: sc.field, start: 0, end }, { node: sc.field, start: 10, end }];
    sc.lines = linesOf(ctx, sc, sc.lineSpec);
    sc.park = { node: paragraphs[1], offset: null };
  }
  if (def.effects === 'screen') {
    sc.terminal = nodes.find((n) => n.role === 'terminal')?.id ?? null;
    if (!sc.terminal) throw new Error(`${sc.label}: no terminal in the tree`);
    sc.points = { click: [{ x: Math.round(width / 2) - 20, y: Math.round(height / 2) }, { x: Math.round(width / 2) + 20, y: Math.round(height / 2) }], scroll: { x: Math.round(width / 2), y: Math.round(height / 2) } };
    sc.scrollPixels = 100;
  }
  if (def.effects === 'record') {
    const mid = { x: Math.round(width / 2), y: Math.round(height / 2) };
    sc.points = { click: [{ x: mid.x - 20, y: mid.y }, { x: mid.x + 20, y: mid.y }], scroll: mid };
    sc.paths = [[{ x: mid.x - 60, y: mid.y }, { x: mid.x + 60, y: mid.y }], [{ x: mid.x + 60, y: mid.y }, { x: mid.x - 60, y: mid.y }]];
    sc.scrollPixels = 100;
  }
  if (def.effects === 'settle-scene' || def.effects === 'counter') {
    if (!sc.button) throw new Error(`${sc.label}: no counting button`);
    sc.press = sc.button;
    const e = oracle.extents(sc.button);
    const button = { x: Math.round(e.x - sc.origin.x + e.w / 2), y: Math.round(e.y - sc.origin.y + e.h / 2) };
    sc.points = { click: [{ x: button.x - 40, y: button.y }, { x: button.x + 40, y: button.y }], move: [{ x: 200, y: 250 }, { x: 400, y: 250 }], scroll: { x: 300, y: 250 } };
    sc.scrollPixels = 100;
  }
  if (def.effects === 'gtk4-input') {
    const { places } = FAMILIES['gtk4-input'];
    sc.points = { click: [places.button, places.button], move: [{ x: places.list.x - 60, y: places.list.y }, { x: places.list.x + 60, y: places.list.y }], scroll: places.list };
    // the scale's knob (at its value, 50 at the start) taken to near its end, then back to the middle
    const mid = Math.round((places.scale.x0 + places.scale.x1) / 2);
    const near = places.scale.x1 - 40;
    sc.paths = [[{ x: mid, y: places.scale.y }, { x: near, y: places.scale.y }], [{ x: near, y: places.scale.y }, { x: mid, y: places.scale.y }]];
    sc.scrollPixels = 100;
  }
  ctx.emit({ kind: 'settle-scene', scene: name, window: sc.id, origin: sc.origin, tree_source: sc.treeSource, text_in_tree: sc.textInTree ?? null, lines: sc.lines?.map((l) => ({ span: l.span, point: l.point, path: l.path })) ?? null });
  return sc;
}

/**
 * A page's empty field given its first word and a line, typed by a fresh engine of the harness's (Chromium's field
 * implements no EditableText insert), so the clipboard cells have a word to select.
 */
async function seedField(ctx, sc) {
  const engine = new Engine({ label: 'settle-seed', bin: ctx.cua }).start();
  try {
    for (const c of SEED) {
      const key = c === ' ' ? 'space' : c === '\n' ? 'Return' : c;
      const { response } = await engine.request('press_key', { window: { id: sc.id }, key });
      if (response.ok !== true) throw new Error(`seeding ${sc.label}'s field: ${response.error}`);
    }
  } finally {
    await engine.close();
  }
  for (let i = 0; i < 40 && ctx.oracle.text(sc.field) !== SEED; i++) await sleep(50);
  if (ctx.oracle.text(sc.field) !== SEED) throw new Error(`${sc.label}'s field did not take its seed (${JSON.stringify(ctx.oracle.text(sc.field).slice(0, 60))})`);
}

/** The field's text as the window's tree carries it (its node's value), or null. */
async function fieldValue(desktop, sc) {
  const state = await desktop.state(sc);
  return preorder(state.ax_tree).find((n) => n.id === sc.field)?.value ?? null;
}

/** DISPLAY set to a display the spawner lets this process reach: its own, or the hermetic name before it has one. */
function useDisplay(display) {
  assertReachable('the settle experiment', [], { DISPLAY: display });
  process.env.DISPLAY = display;
}

/** `--experiment settle`: each family's cells, searched or in the named lanes; `{md, complete, failed, ending}`. */
export async function runSettle(args, { emit, run, startLoad }) {
  delete process.env[LIVE_RUN];
  useDisplay(NO_DISPLAY);
  const plan = chosenPlan(args);
  const cells = cellsFor({ families: args.families, kinds: args.kinds ?? [], routes: args.routes ?? [] });
  if (!cells.length) throw new Error('the settle experiment has no cell for these families, kinds and routes');
  const cuaVersion = xExecFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim();
  const server = await startPrivateServer({ out: args.out });
  useDisplay(server.display);
  const load = args.load ? (args.loadFactor ?? 1) : 0;
  emit({ kind: 'settle-display', display: server.display, cua_version: cuaVersion, load_factor: load, plan, cells: cells.map(cellName) });
  const desktop = new Desktop({ cua: args.cua, run, logs: args.out });
  const all = [];
  const audits = [];
  const skipped = [];
  let wm = null;
  let loadRun = null;
  let witness = null;
  let bus = null;
  let watched = null;
  let restoreTmpdir = () => {};
  try {
    await desktop.begin({ startRecord: async () => null });
    restoreTmpdir = runTmpdirInProcess();
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
    const oracle = new Oracle();
    desktop.oracle = oracle;
    bus = await AsyncOracle.open(a11yBusAddress());
    await desktop.openFront('covered');
    witness = await startWitness(XPROBE, { tailMs: 20 });
    loadRun = args.load ? startLoad(emit, args.loadFactor ?? 1) : null;
    const ctx = { desktop, oracle, bus, witness, emit, cua: args.cua, load, need: args.samplesTrials ?? CONSECUTIVE, pasteText: pasteTexts(), caretRefused: new Set() };
    for (const [family, sceneNames] of Object.entries(FAMILY_SCENES)) {
      const mine = cells.filter((c) => sceneNames.includes(c.scene));
      if (!mine.length) continue;
      const scenes = {};
      try {
        for (const name of sceneNames.filter((n) => mine.some((c) => c.scene === n))) scenes[name] = await openScene(ctx, name);
      } catch (error) {
        for (const c of mine) skipped.push({ cell: cellName(c), why: String(error.message).slice(0, 300) });
        emit({ kind: 'settle-skipped', family, why: String(error.message).slice(0, 300) });
        await desktop.close(Object.values(scenes));
        continue;
      }
      try {
        for (const cell of mine) {
          const sc = scenes[cell.scene];
          for (const lane of plan.lanes) {
            const s = await series(ctx, cell, sc, lane);
            all.push(s);
            if (plan.search && s.reached) break;
          }
          if (!plan.search && plan.lanes.includes('shipped') && cell.route === 'background' && !ACTIVATING.includes(cell.kind) && args.audit !== false) audits.push(await auditCell(ctx, cell, sc, 'shipped'));
        }
      } finally {
        await desktop.close(Object.values(scenes));
      }
    }
  } finally {
    if (loadRun) await loadRun.stop();
    if (witness) await witness.stop();
    bus?.close();
    restoreTmpdir();
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
  const measured = cells.filter((c) => !skipped.some((s) => s.cell === cellName(c))).map(cellName);
  const { md, failed, held } = settleVerdict(all, { search: plan.search, cells: measured });
  for (const s of skipped) failed.push(`${s.cell} could not be opened: ${s.why}`);
  for (const a of audits) if (!a.clean) failed.push(`${a.cell}: the audit found ${a.forbidden.length} forbidden request(s)`);
  for (const f of ending.foreign) failed.push(`a window the experiment did not open was changed: ${f}`);
  if (!watched.clean) failed.push(`the private display's watchdog: ${watched.reason}`);
  if (plan.search) md.push('', '| cell | held step (ms) |', '|---|---:|', ...Object.entries(held).map(([c, ms]) => `| ${c} | ${ms ?? '**none**'} |`));
  if (audits.length) md.push('', '| cell | audit | requests |', '|---|---|---:|', ...audits.map((a) => `| ${a.cell} | ${a.clean ? 'clean' : '**forbidden**'} | ${a.requests} |`));
  if (failed.length) md.push('', `**Incomplete or failed:** ${failed.join('; ')}.`);
  emit({ kind: 'settle-verdict', pass: failed.length === 0, failed, held });
  return { md, complete: failed.length === 0, failed, ending };
}
