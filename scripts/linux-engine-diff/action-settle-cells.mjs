// The settle experiment's cells and judges (#171 M4, T8; the live part is action-settle.mjs): which input kinds run on
// which scene, by which route and in which occlusion; what counts as each kind's complete effect in each scene's
// reading; when a run, a series, an audit and a sitting pass; and the constants of cua's service
// (src/services/engine/linux/settle.mjs) that the search sittings give. Nothing here reaches a display.
//
// The rule (the design session's wait rule, M4 pre-flight, 2026-11-02): a settle is shortened to a step only when every
// cell that takes it passes at that step, 30 consecutive independent runs, idle and at twice the gate's load; otherwise
// it keeps the vendor's 100. The 0 ms step is the control: where a settle is needed, it misses.

import { ANIMATED_ACTION, SETTLE_MS, animatedSettle } from '../../src/services/engine/linux/settle.mjs';
import { seriesVerdict } from './focus-timer.mjs';

/** The measured steps, in ms: the control at 0, then upward to the vendor's 100. */
export const STEPS = [0, 10, 25, 50, 75, 100];
/**
 * An animating family's element action (settle.mjs ANIMATED_ACTION; the design session, 2026-11-06: GTK 4 about 300,
 * Qt about 150): the control, then from the vendor's 100 upward by 25 ms to 400.
 */
export const ANIMATED_STEPS = [0, ...Array.from({ length: 13 }, (_, i) => 100 + 25 * i)];
/** What a settle keeps when no step held: the vendor's, every settle's before T8. */
export const VENDOR_MS = 100;
export const CONSECUTIVE = 30;
export const MAX_RUNS = 60;

/** The lanes: the shipped constants, or every settle at one step. */
export const LANES = ['shipped', ...[...new Set([...STEPS, ...ANIMATED_STEPS])].sort((a, b) => a - b).map((ms) => `settle-${ms}`)];

/** A lane's settles, in the shape `ActionSettler` takes. */
export function laneSettles(lane) {
  if (lane === 'shipped') return { ...SETTLE_MS };
  const ms = LANES.includes(lane) ? Number(lane.slice('settle-'.length)) : NaN;
  if (!Number.isInteger(ms)) throw new Error(`unknown settle lane ${lane}; known: ${LANES.join(', ')}`);
  return Object.fromEntries(Object.keys(SETTLE_MS).map((settle) => [settle, ms]));
}

/** The step a `settle-<ms>` lane measures, else null. */
export const laneStep = (lane) => (lane.startsWith('settle-') ? Number(lane.slice('settle-'.length)) : null);

/** The steps a settle is searched over: an animating family's from 100 to 400, every other's to the vendor's 100. */
export const stepsOf = (settle) => (Object.values(ANIMATED_ACTION).includes(settle) ? ANIMATED_STEPS : STEPS);

/**
 * A sitting's plan: each cell's steps searched upward (its series at a step, then the next step only if that one did
 * not hold; `planLanes`), or with `--lanes` those lanes, each run whole, in the experiment's order.
 */
export function chosenPlan(args) {
  if (!args.lanes?.length) return { search: true, lanes: null };
  for (const lane of args.lanes) laneSettles(lane);
  return { search: false, lanes: LANES.filter((lane) => args.lanes.includes(lane)) };
}

/** The lanes a cell runs in a sitting: searched, its settle's steps; else the sitting's lanes. */
export const planLanes = (plan, cell) => (plan.search ? stepsOf(settleOf(cell)).map((ms) => `settle-${ms}`) : plan.lanes);

/**
 * The scenes. `family` is families.mjs's; `page` the browser's page; `effects` how a reading of the scene is judged
 * (`landed`). The input page (pages/input.html) counts every pointer and key kind in its status lines; the matrix page's
 * field (pages/matrix.html) takes the text kinds; the editors are the real applications; the settle scenes
 * (pages/settle-gtk3.py, settle-qt.py) count presses, moves and wheel steps in accessible names. `animates`: the family,
 * by cua-engine's name for it, whose toolkit animates an element's primary action (families.rs
 * `animates_primary_action`), which cua's service then settles by that family's own constant.
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
  'settle-qt5': { family: 'settle-qt5', effects: 'settle-scene', animates: 'Qt' },
  'settle-qt6': { family: 'settle-qt6', effects: 'settle-scene', animates: 'Qt' },
  'gtk4-button': { family: 'gtk4-button', effects: 'counter', animates: 'GTK 4' },
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
  // `activate_window`, then a windowless click at the window's point as soon as it answers (task 63): the click must
  // land in the window, not in the window that covered it, in either mode
  activate_click: 'activate_window',
};

/** The kinds that activate their window on purpose, in either mode: their desktop changes and is not judged. */
export const ACTIVATING = ['activate_window', 'activate_click'];

/**
 * The settle a cell's observation waits for (settle.mjs SETTLE_MS): its method's, but a click's and a named action's
 * by what they run (the design session, 2026-11-06): a coordinate or right click `click`'s, an element's primary
 * action `click_element`'s, and that action in a family that animates it (a named action naming it included) the
 * family's own.
 */
export function settleOf(c) {
  const animates = SCENES[c.scene]?.animates;
  if (c.kind === 'click_element') return animates ? animatedSettle(animates) : 'click_element';
  if (c.kind === 'secondary_action') return animates ? animatedSettle(animates) : 'perform_secondary_action';
  return KIND_METHOD[c.kind];
}

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
 * dedicated mode instead (the foreground route), xterm's keys and Qt's scroll likewise, and so do the kinds Gecko and
 * Chromium take only unobscured, with their windows covered; the paste of a family with no verified route (xterm) is
 * left out. A kind whose usual effect is another window (an editor's right click or context
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
  cell('settle-gtk3', 'activate_click'),
  cell('settle-gtk3', 'activate_click', 'dedicated'),
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
  // the named action that is the button's primary action, on the families that animate it (the review's finding 1):
  // perform_secondary_action can run what an element click runs, and settles as it does
  cell('settle-qt5', 'secondary_action'),
  cell('settle-qt6', 'secondary_action'),
  cell('gtk4-button', 'secondary_action'),
  ...['press_key', 'click', 'move', 'scroll', 'drag'].map((kind) => cell('gtk4-input', kind, 'dedicated')),
  // the other families the foreground route carries pointer input for in dedicated mode, the window covered: Gecko's
  // pointer kinds, Chromium's drags along a covered path, Qt's scroll (task 63: each waits for its window's raise)
  ...['click', 'right_click', 'move', 'scroll', 'drag'].map((kind) => cell('firefox-input', kind, 'dedicated')),
  cell('chrome-input', 'drag', 'dedicated'),
  cell('electron-input', 'drag', 'dedicated'),
  cell('settle-qt5', 'scroll', 'dedicated'),
  cell('settle-qt6', 'scroll', 'dedicated'),
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
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A key's text effect: its character in at the caret's end, or BackSpace's one character out. */
function keyed(before, after, { key }) {
  if (typeof before?.text !== 'string' || typeof after?.text !== 'string') return false;
  const [b, a] = [[...before.text], [...after.text]];
  return key === 'BackSpace' ? a.length === b.length - 1 : a.length === b.length + 1;
}

/** The wheel button codes of a terminal's mouse reports, by the scroll's direction (X buttons 4 and 5). */
const WHEEL = { up: 64, down: 65 };

/**
 * A terminal's normal mouse reports (xterm's mode 1000: ESC [ M, then 32 plus the button code, the column and the row,
 * each a byte) in `bytes`, decoded in full: `[{code, col, row}]`, or null when the bytes are not whole reports.
 */
export function mouseReports(bytes) {
  if (typeof bytes !== 'string' || bytes.length % 6 !== 0) return null;
  const out = [];
  for (let i = 0; i < bytes.length; i += 6) {
    if (bytes.slice(i, i + 3) !== '\u001b[M') return null;
    out.push({ code: bytes.charCodeAt(i + 3) - 32, col: bytes.charCodeAt(i + 4) - 32, row: bytes.charCodeAt(i + 5) - 32 });
  }
  return out;
}

/** The new part of a recorder's file between two readings (`{bytes, data}`), or null. */
const appended = (before, after) => (typeof after?.data === 'string' && Number.isInteger(before?.bytes) && after.data.length >= before.bytes ? after.data.slice(before.bytes) : null);

/**
 * A page's wheel notches so far (pages/input.html): the legacy `wheelDeltaY` summed, 120 a notch in Chromium and Gecko
 * (a dev probe of each, task 62's fix wave), also over events a browser coalesces; else, with no legacy delta, the
 * events.
 */
const notches = (r) => (Number.isInteger(r?.wheel_legacy) && r.wheel_legacy !== 0 ? Math.abs(r.wheel_legacy) / 120 : r?.wheels);

/**
 * The fields of a reading that the scene's settled reading decides a kind's complete effect in (action-settle.mjs reads
 * the scene until it stops changing): a drag's selection and GTK 4's scale, and a move's motions (on a page, where its
 * last one left the pointer), each of which the application may still be taking in when the observation comes. Else
 * null: the effect is complete in itself.
 */
export function settledFields(effects, kind) {
  if ((kind === 'drag' || kind === 'drag_handle') && (effects === 'editor' || effects === 'paragraphs')) return ['selection'];
  if (kind === 'drag' && effects === 'gtk4-input') return ['scale'];
  // a page's by where its last move left the pointer: Blink moves it again by itself, at the same place, when the
  // status line's layout changes
  if ((kind === 'move' || kind === 'move_relative') && effects === 'input-page') return ['pointer_at'];
  if (kind === 'move' && ['settle-scene', 'gtk4-input'].includes(effects)) return ['moves'];
  return null;
}

/**
 * Whether a kind's complete effect shows in a reading of its scene (`after`), against the reading before the run
 * (`before`); `run` carries what the run sent (the key, the text, the clicked line, the copied word, the scroll's
 * direction and steps) and, where `settledFields` names fields, the scene's settled reading (`settled`), which the
 * reading must equal in them.
 */
export function landed(effects, kind, before, after, run = {}) {
  if (!before || !after) return false;
  const fields = settledFields(effects, kind);
  if (fields && !(run.settled && fields.every((f) => same(after[f], run.settled[f])))) return false;
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
    // every wheel step arrived, and the page moved its way (its smooth scroll may still be under way)
    if (kind === 'scroll') return notches(after) - notches(before) === run.steps && Number.isInteger(after.scroll) && (run.direction === 'down' ? after.scroll > before.scroll : after.scroll < before.scroll);
    if (kind === 'drag' || kind === 'drag_handle') return rose(before, after, 'drags') && rose(before, after, 'downs') && rose(before, after, 'ups');
  }
  if (effects === 'field' || effects === 'editor' || effects === 'paragraphs') {
    if (kind === 'press_key' || kind === 'key_down') return keyed(before, after, run);
    if (kind === 'type_text') return occurrences(after.text, run.text) === occurrences(before.text, run.text) + 1;
    if (kind === 'clipboard_write') return occurrences(after.text, run.word) === occurrences(before.text, run.word) + 1;
    // the copied word, on a clipboard that held another value before (action-settle.mjs puts one there each run)
    if (kind === 'clipboard_read') return before.clipboard !== run.word && after.clipboard === run.word;
    if (kind === 'click' || kind === 'key_click') return after.caret !== before.caret && insideLine(run.line, after.caret);
    // a new selection inside the line dragged (each drag's replaces the one before, which may still stand), the one the
    // scene settles at
    if (kind === 'drag' || kind === 'drag_handle') return Array.isArray(after.selection) && after.selection[1] > after.selection[0] && insideLine(run.line, after.selection[0]) && insideLine(run.line, after.selection[1]) && !same(after.selection, before.selection);
  }
  if (effects === 'screen') {
    if (typeof before.text !== 'string' || typeof after.text !== 'string') return false;
    if (kind === 'press_key' || kind === 'key_down') return trimEnd(after.text) === `${trimEnd(before.text)}x`;
    if (kind === 'type_text') return occurrences(after.text, run.text) === occurrences(before.text, run.text) + 1;
    // the terminal echoes what its program receives, each report deleting the line before it prints its three bytes:
    // the screen ends on the last report, a click's release (code 3) or the scroll's wheel step
    const last = after.text.split('\n')[0];
    if (last.length !== 3) return false;
    if (kind === 'click') return last.charCodeAt(0) - 32 === 3;
    if (kind === 'scroll') return last.charCodeAt(0) - 32 === WHEEL[run.direction];
  }
  if (effects === 'record') {
    const bytes = appended(before, after);
    if (kind === 'press_key') return bytes === run.key;
    const reports = mouseReports(bytes);
    if (!reports) return false;
    const [press, release] = reports;
    const at = (a, b) => a.col === b.col && a.row === b.row;
    if (kind === 'click') return reports.length === 2 && press.code === 0 && release.code === 3 && at(press, release);
    if (kind === 'drag') return reports.length === 2 && press.code === 0 && release.code === 3 && !at(press, release);
    if (kind === 'scroll') return reports.length === run.steps && reports.every((r) => r.code === WHEEL[run.direction]);
  }
  if (effects === 'settle-scene' || effects === 'counter') {
    if (['click', 'key_click', 'click_element', 'secondary_action', 'activate_click'].includes(kind)) return rose(before, after, 'presses');
    if (kind === 'move') return grew(before, after, 'moves');
    if (kind === 'scroll') return rose(before, after, 'scrolls', run.steps);
  }
  if (effects === 'gtk4-input') {
    if (kind === 'press_key') return rose(before, after, 'keys');
    if (kind === 'click') return rose(before, after, 'presses');
    if (kind === 'move') return grew(before, after, 'moves');
    if (kind === 'scroll') return Number.isInteger(after.scroll) && (run.direction === 'down' ? after.scroll > before.scroll : after.scroll < before.scroll);
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
  if (route !== 'background' || ACTIVATING.includes(kind)) return true;
  return desktopClean === true && frontActive === true;
}

/**
 * What a run's row shows: `pass`; `invalid` when what judges it failed (its preparation, a reader, the scene's settled
 * reading, or the settle the service deferred was not the cell's: `invalid` names which), so nothing is known of its
 * effect; `refused` when a command answered an error; `desktop` when the effect came but the desktop changed; `late`
 * when the effect came within the late bound after the reading; `never` when it did not.
 */
export function runClass(row) {
  if (row.ok) return 'pass';
  if (row.error || row.after?.error || row.invalid) return 'invalid';
  if (row.answers?.some((a) => !a.ok)) return 'refused';
  if (row.landed) return 'desktop';
  return row.late_ms !== null && row.late_ms !== undefined ? 'late' : 'never';
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
 * Whether a cell's series lost its input rather than met it late, on a complete and valid measurement: it held at no
 * step; it has a series of the rule's length at every step through the vendor's 100; in every series every command
 * answered and every run was judged (no preparation, reader or settled reading failed), and every miss was an effect
 * that never came within the late bound (`never`), with none that came late. A settle only delays the reading after an
 * input, so it cannot bring an effect that never comes. A loss is still only a candidate here: it sets the cell aside
 * only where it is established on its own (`SET_ASIDE`).
 */
export function lostInput(series, steps = STEPS) {
  if (heldStep(series) !== null || !series.length) return false;
  const through = steps.filter((ms) => ms <= VENDOR_MS);
  if (!through.every((ms) => series.some((s) => s.lane === `settle-${ms}`))) return false;
  return series.every((s) => s.need >= CONSECUTIVE && s.invalid === 0 && s.refused === 0 && s.late === 0 && s.never > 0);
}

/**
 * The cells whose input is lost at a load, each established by evidence of its own, not by the settle's series (a
 * trace of where the input went): `{cell, load, evidence}`. None: task 63 made GTK 4's dedicated cells, the three task
 * 62 set aside, land.
 */
export const SET_ASIDE = [];

/**
 * The service's constants from the search sittings' cells (`{cell, settle, load, held, lost}`, `held` the cell's held
 * step in that sitting or null, `lost` from `lostInput`): each settle's the largest held step across its cells and
 * sittings, naming the cells that set it. A cell that held at no step keeps the settle at the vendor's 100 (`unheld`),
 * unless it lost its input and `setAside` establishes that loss (`lost`, listed apart: no settle bears on it); a settle
 * no cell measured keeps the vendor's 100 too (`unmeasured`).
 */
export function methodConstants(rows, { setAside = SET_ASIDE } = {}) {
  const out = {};
  const established = (r) => r.lost === true && setAside.some((d) => d.cell === r.cell && d.load === r.load);
  for (const settle of Object.keys(SETTLE_MS)) {
    const mine = rows.filter((r) => r.settle === settle);
    const label = (r) => `${r.cell} at ${r.load ? `${r.load}x` : 'idle'}`;
    const lost = mine.filter((r) => r.held === null && established(r)).map(label);
    const unheld = mine.filter((r) => r.held === null && !established(r)).map(label);
    const held = mine.filter((r) => r.held !== null);
    if (!mine.length) {
      out[settle] = { ms: VENDOR_MS, by: [], unheld: [], lost: [], unmeasured: true };
      continue;
    }
    if (unheld.length || !held.length) {
      out[settle] = { ms: VENDOR_MS, by: [], unheld, lost };
      continue;
    }
    const ms = Math.max(...held.map((r) => r.held));
    out[settle] = { ms, by: held.filter((r) => r.held === ms).map(label), unheld: [], lost };
  }
  return out;
}

/**
 * A background cell's audit (action-settle.mjs `auditCell`): it passes only when the trace holds the engine's requests
 * and none forbidden, and every audited run ran its input as the timed runs do (its preparation and readers worked,
 * every command answered), and none changed the desktop (a `desktop` run: its input took effect while the background
 * witness or the front-window check failed; a client's own request, Qt activating itself, leaves the engine's trace
 * clean, so the trace alone cannot see it), its witness fields and activations kept in the failure. An effect that came
 * late or never is kept apart (`missed`): the audit judges what was sent.
 */
export function auditVerdict({ clean, requests, runs }, need) {
  const failed = [];
  if (!clean) failed.push('forbidden requests');
  if (!(requests > 0)) failed.push('no request of the engine in the trace');
  if (runs.length < need) failed.push(`${runs.length} of ${need} runs`);
  const notRun = runs.filter((r) => r.class === 'invalid' || r.class === 'refused');
  if (notRun.length) failed.push(`${notRun.length} of ${runs.length} runs did not run their input (${notRun.map((r) => r.why ?? r.class).join('; ').slice(0, 300)})`);
  const changed = runs.filter((r) => r.class === 'desktop');
  if (changed.length) {
    const evidence = changed.map((r) => JSON.stringify({ desktop_clean: r.desktop_clean, front_active: r.front_active, witness: r.witness, activations: r.activations }));
    failed.push(`${changed.length} of ${runs.length} runs changed the desktop (${evidence.join('; ').slice(0, 600)})`);
  }
  return { pass: failed.length === 0, failed, missed: runs.filter((r) => r.class === 'late' || r.class === 'never').length };
}

/**
 * A sitting's verdict from its series (`{cell, lane, reached, runs, misses, streak, need, late, never, refused,
 * invalid}`): searched, each cell must hold at some step; with lanes, each cell's every series must reach its passes. A
 * cell of the sitting with no series fails it, and so does a development series (`--trials` below 30). Returns the
 * summary's lines, the failures and each cell's held step (search sittings).
 */
export function settleVerdict(series, { search, cells }) {
  const failed = [];
  const held = {};
  const md = ['| cell | lane | runs | misses (late / never / refused / invalid) | streak at the end | verdict |', '|---|---|---:|---|---:|---|'];
  for (const s of series) {
    md.push(`| ${s.cell} | ${s.lane} | ${s.runs} | ${s.misses} (${s.late} / ${s.never} / ${s.refused ?? 0} / ${s.invalid ?? 0}) | ${s.streak} | ${s.reached ? `${s.need} consecutive` : 'not reached'} |`);
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
