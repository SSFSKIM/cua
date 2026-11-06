// The settle experiment's cells and judges (#171 M4, T8; the live part is action-settle.mjs): which input kinds run on
// which scene, by which route and in which occlusion; what counts as each kind's effect in each scene's reading; when a
// run, a series and a sitting pass; and the per-method constants of cua's service (src/services/engine/linux/settle.mjs)
// that the search sittings give. Nothing here reaches a display.
//
// The rule (the design session's wait rule, M4 pre-flight, 2026-11-02): a method's settle is shortened to a step only
// when every cell of the method passes at that step, 30 consecutive independent runs, idle and at twice the gate's load;
// otherwise it keeps its shipped value. The 0 ms step is the control: where a settle is needed, it misses.

import { SETTLE_MS } from '../../src/services/engine/linux/settle.mjs';
import { seriesVerdict } from './focus-timer.mjs';

/** The measured steps, in ms: the control at 0, then upward to the vendor's 100. */
export const STEPS = [0, 10, 25, 50, 75, 100];
export const CONSECUTIVE = 30;
export const MAX_RUNS = 60;

/** The lanes: the shipped constants, or every method at one step. */
export const LANES = ['shipped', ...STEPS.map((ms) => `settle-${ms}`)];

/** A lane's settles, in the shape `ActionSettler` takes. */
export function laneSettles(lane) {
  if (lane === 'shipped') return { ...SETTLE_MS };
  const ms = LANES.includes(lane) ? Number(lane.slice('settle-'.length)) : NaN;
  if (!Number.isInteger(ms)) throw new Error(`unknown settle lane ${lane}; known: ${LANES.join(', ')}`);
  return Object.fromEntries(Object.keys(SETTLE_MS).map((method) => [method, ms]));
}

/** The step a `settle-<ms>` lane measures, else null. */
export const laneStep = (lane) => (lane.startsWith('settle-') ? Number(lane.slice('settle-'.length)) : null);

/**
 * A sitting's plan: the steps searched upward (each cell's series at a step, then the next step only if that one did not
 * hold), or with `--lanes` those lanes, each run whole, in the experiment's order.
 */
export function chosenPlan(args) {
  if (!args.lanes?.length) return { search: true, lanes: STEPS.map((ms) => `settle-${ms}`) };
  for (const lane of args.lanes) laneSettles(lane);
  return { search: false, lanes: LANES.filter((lane) => args.lanes.includes(lane)) };
}

/**
 * The scenes. `family` is families.mjs's; `page` the browser's page; `effects` how a reading of the scene is judged
 * (`landed`). The input page (pages/input.html) counts every pointer and key kind in its status lines; the matrix page's
 * field (pages/matrix.html) takes the text kinds; the editors are the real applications; the settle scenes
 * (pages/settle-gtk3.py, settle-qt.py) count presses, moves and wheel steps in accessible names.
 */
export const SCENES = {
  'chrome-input': { family: 'chrome', page: 'input.html', effects: 'input-page' },
  'chrome-text': { family: 'chrome', page: 'matrix.html', effects: 'field' },
  'electron-input': { family: 'electron', page: 'input.html', effects: 'input-page' },
  'electron-text': { family: 'electron', page: 'matrix.html', effects: 'field' },
  'firefox-input': { family: 'firefox', page: 'input.html', effects: 'input-page' },
  'firefox-text': { family: 'firefox', page: 'matrix.html', effects: 'field' },
  gedit: { family: 'gedit', effects: 'editor' },
  kate: { family: 'kate', effects: 'editor' },
  qtcreator: { family: 'qtcreator', effects: 'editor' },
  writer: { family: 'writer', effects: 'paragraphs' },
  'gnome-terminal': { family: 'gnome-terminal', effects: 'screen' },
  xterm: { family: 'xterm', effects: 'record' },
  'settle-gtk3': { family: 'settle-gtk3', effects: 'settle-scene' },
  'settle-qt5': { family: 'settle-qt5', effects: 'settle-scene' },
  'settle-qt6': { family: 'settle-qt6', effects: 'settle-scene' },
  'gtk4-button': { family: 'gtk4-button', effects: 'counter' },
  'gtk4-input': { family: 'gtk4-input', effects: 'gtk4-input' },
  'gnome-text-editor': { family: 'gnome-text-editor', effects: 'editor' },
};

/** The families a sitting names (`--family`), each its scenes, opened together and closed after. */
export const FAMILY_SCENES = {
  chrome: ['chrome-input', 'chrome-text'],
  electron: ['electron-input', 'electron-text'],
  firefox: ['firefox-input', 'firefox-text'],
  gedit: ['gedit'],
  kate: ['kate'],
  qtcreator: ['qtcreator'],
  writer: ['writer'],
  'gnome-terminal': ['gnome-terminal'],
  xterm: ['xterm'],
  gtk3: ['settle-gtk3'],
  qt5: ['settle-qt5'],
  qt6: ['settle-qt6'],
  gtk4: ['gtk4-button', 'gtk4-input', 'gnome-text-editor'],
};

/** Each kind's method: the one whose settle the observation after it waits for. */
export const KIND_METHOD = {
  press_key: 'press_key',
  key_down: 'key_down',
  key_up: 'key_up',
  click: 'click',
  // a key then a click to the same window, two calls one after the other: the press_key's settle comes between them, so
  // a Qt window still counting a key's FocusOut down meets the click sooner (task 61: the click must not activate it)
  key_click: 'click',
  click_element: 'click',
  right_click: 'click',
  secondary_action: 'perform_secondary_action',
  move: 'move',
  move_relative: 'move_relative',
  scroll: 'scroll',
  drag: 'drag',
  drag_handle: 'drag_handle',
  type_text: 'type_text',
  clipboard_read: 'clipboard_read',
  clipboard_write: 'clipboard_write',
  activate_window: 'activate_window',
};

const cell = (scene, kind, route = 'background', occlusion = route === 'desktop' ? 'active' : 'covered') => ({ scene, kind, route, occlusion });
const browserCells = (browser, { pointer, clipboard = true }) => [
  cell(`${browser}-input`, 'press_key'),
  cell(`${browser}-input`, 'key_down'),
  cell(`${browser}-input`, 'key_up'),
  cell(`${browser}-input`, 'click', 'background', pointer),
  cell(`${browser}-input`, 'click_element'),
  cell(`${browser}-input`, 'right_click', 'background', pointer),
  cell(`${browser}-input`, 'secondary_action'),
  cell(`${browser}-input`, 'move', 'background', pointer),
  cell(`${browser}-input`, 'scroll', 'background', pointer),
  // Chromium refuses a background drag unless its whole path is in view; Gecko any pointer kind unless the window is
  cell(`${browser}-input`, 'drag', 'background', 'unobscured'),
  // a key into the page's field, whose text takes it at its keydown (the input page also counts the keyup)
  cell(`${browser}-text`, 'press_key'),
  cell(`${browser}-text`, 'type_text'),
  ...(clipboard ? [cell(`${browser}-text`, 'clipboard_read'), cell(`${browser}-text`, 'clipboard_write')] : []),
  cell(`${browser}-text`, 'activate_window'),
];
const desktopCells = (scene, kinds) => kinds.map((kind) => cell(scene, kind, 'desktop'));
const DESKTOP_PAGE_KINDS = ['press_key', 'key_down', 'key_up', 'click', 'move', 'move_relative', 'scroll', 'drag', 'drag_handle'];
const editorCells = (scene, extra = []) => ['press_key', 'key_down', 'click', ...extra, 'drag', 'activate_window'].map((kind) => cell(scene, kind));

/**
 * The cells, family by family. A kind a family's entry in families.rs lists as ignored on the background route is
 * refused in shared mode with nothing sent, so it has nothing to settle there: GTK 4's pointer and key kinds run in
 * dedicated mode instead (the foreground route), xterm's keys likewise; Qt's scroll and the paste of a family with no
 * verified route (xterm) are left out. A kind whose usual effect is another window (an editor's right click or context
 * action opens a menu) is measured where the page's handler shows it in the window's own tree instead.
 */
export const CELLS = [
  ...browserCells('chrome', { pointer: 'covered' }),
  ...desktopCells('chrome-input', DESKTOP_PAGE_KINDS),
  // the engine copies nothing from the page's field in Electron (`context menu did not open; no clipboard action was
  // sent`) or Firefox (`editable element has no selected text to Copy`, the harness's selection made through AT-SPI),
  // so their clipboard commands answer errors, which defer nothing: Chrome's and gedit's cells measure the clipboard
  ...browserCells('electron', { pointer: 'covered', clipboard: false }),
  ...desktopCells('electron-input', DESKTOP_PAGE_KINDS),
  ...browserCells('firefox', { pointer: 'unobscured', clipboard: false }),
  ...editorCells('gedit'),
  cell('gedit', 'type_text'),
  cell('gedit', 'clipboard_read'),
  cell('gedit', 'clipboard_write'),
  ...desktopCells('gedit', ['press_key', 'click', 'drag', 'drag_handle']),
  // Qt's paste lands and is never confirmed (focus-timer.mjs PASTE_UNCONFIRMED): its answer is an error, which defers
  // nothing, so a Qt editor has no paste to settle
  ...editorCells('kate', ['key_click']),
  ...editorCells('qtcreator', ['key_click']),
  // Writer selected nothing from a background drag in this experiment's scene, covered or unobscured, 5 and 12
  // characters long, 0 of 5 each (dev sittings of task 62; the drag experiment primes Writer's first drag, and why a
  // fresh window ignores it is T16's), so its drag has no effect to settle here
  ...editorCells('writer').filter((c) => c.kind !== 'drag'),
  cell('writer', 'type_text'),
  cell('gnome-terminal', 'press_key'),
  cell('gnome-terminal', 'key_down'),
  cell('gnome-terminal', 'click'),
  cell('gnome-terminal', 'scroll'),
  cell('gnome-terminal', 'type_text'),
  cell('gnome-terminal', 'activate_window'),
  cell('xterm', 'click'),
  cell('xterm', 'scroll'),
  cell('xterm', 'drag'),
  cell('xterm', 'press_key', 'dedicated'),
  cell('settle-gtk3', 'click'),
  cell('settle-gtk3', 'click_element'),
  cell('settle-gtk3', 'move'),
  cell('settle-gtk3', 'scroll'),
  cell('settle-qt5', 'click'),
  cell('settle-qt5', 'key_click'),
  cell('settle-qt5', 'click_element'),
  cell('settle-qt5', 'move'),
  cell('settle-qt6', 'click'),
  cell('settle-qt6', 'key_click'),
  cell('settle-qt6', 'click_element'),
  cell('settle-qt6', 'move'),
  cell('gtk4-button', 'click_element'),
  ...['press_key', 'click', 'move', 'scroll', 'drag'].map((kind) => cell('gtk4-input', kind, 'dedicated')),
  cell('gnome-text-editor', 'type_text', 'dedicated'),
  cell('gnome-text-editor', 'activate_window'),
];

export const cellName = (c) => `${c.scene} ${c.kind} ${c.route}`;

/** The cells a sitting runs: of the families, kinds and routes it names (each all when none are named). */
export function cellsFor({ families = [], kinds = [], routes = [] } = {}) {
  for (const f of families) if (!FAMILY_SCENES[f]) throw new Error(`unknown settle family ${f}; known: ${Object.keys(FAMILY_SCENES).join(', ')}`);
  for (const k of kinds) if (!KIND_METHOD[k]) throw new Error(`unknown settle kind ${k}; known: ${Object.keys(KIND_METHOD).join(', ')}`);
  const scenes = families.length ? new Set(families.flatMap((f) => FAMILY_SCENES[f])) : null;
  return CELLS.filter((c) => (!scenes || scenes.has(c.scene)) && (!kinds.length || kinds.includes(c.kind)) && (!routes.length || routes.includes(c.route)));
}

const rose = (before, after, key, by = 1) => Number.isInteger(before?.[key]) && Number.isInteger(after?.[key]) && after[key] === before[key] + by;
const grew = (before, after, key) => Number.isInteger(before?.[key]) && Number.isInteger(after?.[key]) && after[key] > before[key];
const occurrences = (text, part) => (typeof text === 'string' && part ? text.split(part).length - 1 : null);
const insideLine = ([start, end], offset) => Number.isInteger(offset) && offset >= start && offset <= end;
const trimEnd = (text) => text.replace(/\s+$/, '');

/** A key's text effect: its character in at the caret's end, or BackSpace's one character out. */
function keyed(before, after, { key }) {
  if (typeof before?.text !== 'string' || typeof after?.text !== 'string') return false;
  const [b, a] = [[...before.text], [...after.text]];
  return key === 'BackSpace' ? a.length === b.length - 1 : a.length === b.length + 1;
}

/**
 * Whether a kind's effect shows in a reading of its scene (`after`), against the reading before the run (`before`);
 * `run` carries what the run sent (the key, the text, the clicked line, the copied word, the scroll's direction).
 */
export function landed(effects, kind, before, after, run) {
  if (!before || !after) return false;
  // the window manager's activation done (`_NET_ACTIVE_WINDOW` names the window, as it does once it has raised it), and
  // the application's own word where it gives one (its frame's ACTIVE state; Chromium reports none, null)
  if (kind === 'activate_window') return before.wm === false && after.wm === true && after.active !== false;
  if (effects === 'input-page') {
    if (kind === 'press_key') return rose(before, after, 'key_downs') && rose(before, after, 'key_ups') && after.last_key === 'x';
    if (kind === 'key_down') return rose(before, after, 'key_downs') && after.last_key === 'x';
    if (kind === 'key_up') return rose(before, after, 'key_ups') && after.last_key === 'x';
    if (kind === 'click') return rose(before, after, 'downs') && rose(before, after, 'ups');
    if (kind === 'click_element') return rose(before, after, 'clicks');
    if (kind === 'secondary_action' && run.action === 'press') return rose(before, after, 'clicks');
    if (kind === 'right_click' || kind === 'secondary_action') return rose(before, after, 'context') && after.context_on === 'menu';
    if (kind === 'move' || kind === 'move_relative') return grew(before, after, 'moves');
    if (kind === 'scroll') return Number.isInteger(after.scroll) && (run.direction === 'down' ? after.scroll > before.scroll : after.scroll < before.scroll);
    if (kind === 'drag' || kind === 'drag_handle') return rose(before, after, 'drags') && rose(before, after, 'downs') && rose(before, after, 'ups');
  }
  if (effects === 'field' || effects === 'editor' || effects === 'paragraphs') {
    if (kind === 'press_key' || kind === 'key_down') return keyed(before, after, run);
    if (kind === 'type_text') return occurrences(after.text, run.text) === occurrences(before.text, run.text) + 1;
    if (kind === 'clipboard_write') return occurrences(after.text, run.word) === occurrences(before.text, run.word) + 1;
    if (kind === 'clipboard_read') return after.clipboard === run.word;
    if (kind === 'click' || kind === 'key_click') return after.caret !== before.caret && insideLine(run.line, after.caret);
    // a new selection inside the line dragged (each drag's replaces the one before, which may still stand)
    if (kind === 'drag' || kind === 'drag_handle') return Array.isArray(after.selection) && after.selection[1] > after.selection[0] && insideLine(run.line, after.selection[0]) && insideLine(run.line, after.selection[1]) && JSON.stringify(after.selection) !== JSON.stringify(before.selection);
  }
  if (effects === 'screen') {
    if (typeof before.text !== 'string' || typeof after.text !== 'string') return false;
    if (kind === 'press_key' || kind === 'key_down') return trimEnd(after.text) === `${trimEnd(before.text)}x`;
    if (kind === 'type_text') return occurrences(after.text, run.text) === occurrences(before.text, run.text) + 1;
    return after.text !== before.text;
  }
  if (effects === 'record') return grew(before, after, 'bytes');
  if (effects === 'settle-scene' || effects === 'counter') {
    if (kind === 'click' || kind === 'key_click' || kind === 'click_element') return rose(before, after, 'presses');
    if (kind === 'move') return grew(before, after, 'moves');
    if (kind === 'scroll') return grew(before, after, 'scrolls');
  }
  if (effects === 'gtk4-input') {
    if (kind === 'press_key') return rose(before, after, 'keys');
    if (kind === 'click') return rose(before, after, 'presses');
    if (kind === 'move') return grew(before, after, 'moves');
    if (kind === 'scroll') return Number.isInteger(after.scroll) && after.scroll !== before.scroll;
    if (kind === 'drag') return Number.isInteger(after.scale) && after.scale !== before.scale;
  }
  throw new Error(`no effect for ${kind} in a ${effects} scene`);
}

/**
 * Whether a run passes: every answer a success and the effect in the reading; on the background route, its desktop
 * left alone too (the witness clean through the span, no activation request, and the front window still active after:
 * task 61). `activate_window`, the desktop route and the foreground route change the desktop on purpose.
 */
export function runPasses({ route, kind, answersOk, landed: effect, desktopClean, frontActive }) {
  if (!answersOk || effect !== true) return false;
  if (route !== 'background' || kind === 'activate_window') return true;
  return desktopClean === true && frontActive === true;
}

/** Whether a series can no longer reach `need` consecutive passes in `max` runs. */
export function hopeless(oks, need = CONSECUTIVE, max = MAX_RUNS) {
  const { streak, reached } = seriesVerdict(oks, need);
  return !reached && streak + (max - oks.length) < need;
}

/** A cell's smallest step whose series reached its passes, from its series (`{lane, reached}`), or null. */
export function heldStep(series) {
  const held = series.filter((s) => s.reached && laneStep(s.lane) !== null).map((s) => laneStep(s.lane));
  return held.length ? Math.min(...held) : null;
}

/**
 * Whether a cell's series lost its input rather than met it late: it held at no step, and every miss of every series
 * was one whose effect never came, within 2 s of its reading (`never`), with none that came late. A settle only delays
 * the reading after an input, so it cannot bring an effect that never comes: such a cell fails at every step alike, the
 * shipped value included, and says nothing about how long the reading must wait.
 */
export function lostInput(series) {
  return heldStep(series) === null && series.length > 0 && series.every((s) => s.late === 0 && s.never > 0);
}

/**
 * The service's constants from the search sittings' cells (`{cell, method, load, held, lost}`, `held` the cell's held
 * step in that sitting or null, `lost` from `lostInput`): each method's the largest held step across its cells and
 * sittings, naming the cells that set it. A cell that held at no step keeps the method at its shipped value (`unheld`),
 * unless it lost its input at every step (`lost`, listed apart and set aside: no settle bears on it); a method no cell
 * measured keeps it too (`unmeasured`).
 */
export function methodConstants(rows) {
  const out = {};
  for (const method of Object.keys(SETTLE_MS)) {
    const mine = rows.filter((r) => r.method === method);
    const label = (r) => `${r.cell} at ${r.load ? `${r.load}x` : 'idle'}`;
    const lost = mine.filter((r) => r.held === null && r.lost).map(label);
    const unheld = mine.filter((r) => r.held === null && !r.lost).map(label);
    const held = mine.filter((r) => r.held !== null);
    if (!mine.length) {
      out[method] = { ms: SETTLE_MS[method], by: [], unheld: [], lost: [], unmeasured: true };
      continue;
    }
    if (unheld.length || !held.length) {
      out[method] = { ms: SETTLE_MS[method], by: [], unheld, lost };
      continue;
    }
    const ms = Math.max(...held.map((r) => r.held));
    out[method] = { ms, by: held.filter((r) => r.held === ms).map(label), unheld: [], lost };
  }
  return out;
}

/**
 * A sitting's verdict from its series (`{cell, lane, reached, runs, misses, streak, need, late, never}`): searched, each
 * cell must hold at some step; with lanes, each cell's every series must reach its passes. A cell of the sitting with no
 * series fails it, and so does a development series (`--trials` below 30). Returns the summary's lines, the failures and
 * each cell's held step (search sittings).
 */
export function settleVerdict(series, { search, cells }) {
  const failed = [];
  const held = {};
  const md = ['| cell | lane | runs | misses (late / never) | streak at the end | verdict |', '|---|---|---:|---|---:|---|'];
  for (const s of series) {
    md.push(`| ${s.cell} | ${s.lane} | ${s.runs} | ${s.misses} (${s.late} / ${s.never}) | ${s.streak} | ${s.reached ? `${s.need} consecutive` : 'not reached'} |`);
    if (s.need < CONSECUTIVE) failed.push(`${s.cell} (${s.lane}): a development series of ${s.need}, not the ${CONSECUTIVE} the rule needs`);
  }
  for (const name of cells) {
    const mine = series.filter((s) => s.cell === name);
    if (!mine.length) {
      failed.push(`${name} was not measured`);
      continue;
    }
    if (search) {
      held[name] = heldStep(mine);
      if (held[name] === null) failed.push(`${name}: no step held (${mine.map((s) => s.lane).join(', ')})`);
    } else {
      for (const s of mine) if (!s.reached) failed.push(`${name} (${s.lane}): no ${s.need} consecutive passing runs in ${s.runs}`);
    }
  }
  return { md, failed, held };
}
