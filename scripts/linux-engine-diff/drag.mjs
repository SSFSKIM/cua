// The drag experiment (#171 M1a.4; Design, Clicks, scroll, drag, move; Decision Log, M1a.3): the pinned build's drag
// events are the reference and its 1 ms after each interpolated sample is to be dropped, but only where the drag still
// does what the pinned build's does. Per family of M0.4's matrix and per kind of drag that family has, every engine
// drags the same path `--trials` times (30 by default) in its own window of the family, each drag in a witness span,
// and the effect is read back after each: the selected text, a slider's or a scroll bar's value, a page's scroll
// position, an HTML5 drop, a canvas stroke's deviation from the path. The engines: the pinned build, `cua:0ms`
// (cua-engine with no wait after a sample, the press or before the release) and any `--variant` (a dwell after the
// press and before the release, or a step wait), so a family or kind that misses at 0 ms shows which wait it needs.
//
// The kinds (pages/drag.html for the browsers, pages/gtk-scale.py for the GTK scale, and the editors' own text and
// scroll bars): `select` (a text-selection drag), `range` (an HTML range input), `scale` (a GTK 3 scale), `scroller`
// (a page element's scrollbar thumb), `scrollbar` (an editor's vertical scroll bar thumb), `dnd` (HTML5 drag and
// drop) and `canvas` (a path-tracking target fed by plain pointermove events). Runs alternate between two paths where
// a drag's end state is the next one's start (even runs one way, odd runs back), so every run changes something.
//
// A run took effect when its result is the pinned build's: the same value as the pinned build's runs of the same
// parity mostly end at (numbers within 1), one more drop for `dnd`, a new stroke within 12 canvas pixels of every
// corner for `canvas`. A cell's verdict for each cua lane: every run position the pinned build took, the lane takes
// too (the M1a.3 review's per-sample rule); a cell the pinned build never takes is recorded, not judged.
//
// M4's judges (T10; Acceptance 3; the Decision Log's M4 pre-flight, "Speed judging" and "Drags"; their verdicts in
// drag-judge.mjs), which decide the run's verdict for the shipped `cua` lane (`dragVerdict`; every other cua lane is
// measured, not judged):
// - The long browser paths (`LONG_PATHS`: Chrome's and Firefox's canvas, Chrome's drag and drop) are judged on speed,
//   warm, under Acceptance 3's interval rule (stats.mjs `judgeSeriesSpeed`): a run that took is a usable sample, an
//   engine's first request is cold and left to the verdict run's scene drag, every side needs 20 usable, a vendor build
//   sets the bar only with 20 usable, and an undetermined cell is topped up in rounds to 40 drags a side (`topUpRuns`).
//   The verdict names the build that set the bar.
// - Chrome's and Electron's scrollbar thumbs (`reachJudged`): every run lands at or past the pinned build's mean distance
//   in the same sitting (`thumbReach`), beside the tolerance judge.
// - Under load (`--load`, `--load-factor`; 40 drags a side, `dragTrials`) the landed counts decide in place of every run
//   taking: cua's at least the pinned build's, with the distances reported (`loadCounts`). Speed is judged idle only.
// - Chrome's drag and drop runs in front for every lane (`inFront`), as its drop needs; a covered path stays a declared
//   refusal.
// - The page reports the motions Chrome received between a press and its release (`received`, pointerrawupdate events,
//   which Chrome dispatches during a scrollbar drag too), kept per run beside its distance.
// - Named only (`OPTIONAL_KINDS`): Writer's unprimed first drag (`select-unprimed`, a fresh window a run, judged
//   absolutely), and Firefox's held `drag_handle` moves (`handle-canvas`, `handle-dnd`) with a no-press control lane
//   that must miss every run (`controlVerdict`).

import { xExecFileSync, xSpawn } from './xspawn.mjs';

import { LOAD_RUNS, controlVerdict, dragSpeed, dragVerdict, judgeNotes, laneFailures, loadCounts, thumbReach, topUpRuns } from './drag-judge.mjs';
import { Engine } from './engine.mjs';
import { FAMILIES, familyNames, openFamily, readGtk4Status } from './families.mjs';
import { preorder } from './normalize.mjs';
import { Oracle } from './oracle.mjs';
import { captureWindow, pixelsChanged } from './pixels.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE, xdotool } from './scenes.mjs';
import { blockOrder, median } from './stats.mjs';
import { startWitness } from './witness.mjs';
import { SETTLE_MS } from '../../src/services/engine/linux/settle.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : '–');

export const PAGE = 'drag.html';
export const WORDS = 'alpha bravo charlie delta echo foxtrot golf';
/** The editors' document: the words on its first line, then enough lines for a scroll bar with a thumb to drag. */
export const DRAG_DOC = `${WORDS}\n${Array.from({ length: 240 }, (_, n) => `line ${n + 2} of the cua171 drag scene`).join('\n')}\n`;
/** The canvas path's corners, canvas pixels (pages/drag.html's CORNERS); the canvas sits at (20, 350) in the page. */
export const CORNERS = [[20, 20], [380, 40], [200, 180], [40, 100]];
/** A canvas stroke took the path when every corner is at most this far from it. */
export const CANVAS_TOLERANCE = 12;

/** The kinds each family runs. */
export const DRAG_FAMILIES = {
  chrome: ['select', 'range', 'scroller', 'dnd', 'canvas'],
  firefox: ['select', 'range', 'scroller', 'dnd', 'canvas'],
  electron: ['select', 'range', 'scroller', 'dnd', 'canvas'],
  gedit: ['select', 'scrollbar'],
  'gtk-scale': ['scale'],
  'gnome-text-editor': ['select'],
  kate: ['select', 'scrollbar'],
  qtcreator: ['select', 'scrollbar'],
  writer: ['select'],
  xterm: ['select'],
  'xterm-allow': ['select'],
  // M3.1: the device mode's measurement of every family of the matrix (Decision Log, M3 pre-flight): GTK 4's scale in
  // the harness's GTK 4 scene, VTE's text selection (PRIMARY, as xterm's), Writer through `gen` judged by its pixels
  'gtk4-input': ['scale4'],
  'gnome-terminal': ['select'],
  'writer-gen': ['select'],
};

/**
 * Kinds a run measures only when `--ops` names them: Writer's unprimed first drag (T16's measurement), and Firefox's
 * held `drag_handle` moves (whether Gecko's `held_lead_pause` can go, Decision Log, T9).
 */
export const OPTIONAL_KINDS = { writer: ['select-unprimed'], firefox: ['handle-canvas', 'handle-dnd'] };

/** The long browser paths Acceptance 3 judges from M4 on, on speed as well as effect. */
export const LONG_PATHS = { chrome: ['canvas', 'dnd'], firefox: ['canvas'] };
export const isLongPath = (family, kind) => LONG_PATHS[family]?.includes(kind) === true;

/** Chromium's scrollbar thumbs, held to the pinned build's mean distance (Acceptance 3). */
export const REACH_CELLS = { chrome: ['scroller'], electron: ['scroller'] };
export const reachJudged = (family, kind) => REACH_CELLS[family]?.includes(kind) === true;

/** Cells whose every lane drags with its window in front, the vendor builds' included: Chrome's drop is allowed there. */
export const IN_FRONT_CELLS = { chrome: ['dnd'] };
export const inFront = (family, kind) => IN_FRONT_CELLS[family]?.includes(kind) === true;

/** The drags a lane makes per cell: `--trials`, else 30; under load 40, and never fewer. */
export function dragTrials(args) {
  if (!args.load) return args.samplesTrials ?? 30;
  const n = args.samplesTrials ?? LOAD_RUNS;
  if (n < LOAD_RUNS) throw new Error(`the drag experiment under load runs ${LOAD_RUNS} drags a side (the load lane), not ${n}`);
  return n;
}

/** The no-press control of the held-move cells: the same points with the button never pressed. */
export const CONTROL_LANE = 'cua:no-press';

/**
 * The drag engines: the reference (the pinned build), the newest build (recorded beside it, not judged: its coarser
 * interpolation is not cua's), cua-engine as it ships (each drag paced by its target's family, families.rs),
 * cua-engine with every drag wait at zero (the check that decides the table), then the variants.
 */
export function dragEngines(args) {
  const all = [
    { label: 'pinned', bin: args.vendor, args: [] },
    ...(args.newest ? [{ label: 'newest', bin: args.newest, args: [] }] : []),
    { label: 'cua', bin: args.cua, args: [] },
    { label: 'cua:0ms', bin: args.cua, args: ['--drag-step-ms', '0', '--drag-press-dwell-ms', '0', '--drag-release-dwell-ms', '0'] },
    ...args.variants.map((v) => ({ ...v, bin: args.cua })),
    // M3.1's control (kinds.mjs): the window activated, then cua-engine's windowless drag along the same path in root
    // coordinates, through XTEST; only when `--lanes` names it
    { label: 'xtest', bin: args.cua, args: [], control: true },
  ];
  if (!args.lanes) return all.filter((l) => !l.control);
  for (const label of args.lanes) if (!all.some((l) => l.label === label)) throw new Error(`unknown drag lane ${label}; known: ${all.map((l) => l.label).join(', ')}`);
  if (!args.lanes.includes('pinned')) throw new Error('the drag lanes need pinned, the reference');
  return all.filter((l) => args.lanes.includes(l.label));
}

// ---------------------------------------------------------------------------------------------------------------
// paths, window-relative

/** The page's drag paths in page pixels (pages/drag.html's layout), by kind and run. */
export function pagePath(kind, i) {
  const even = i % 2 === 0;
  switch (kind) {
    case 'select':
      // the words are 20 px monospace (12.04 px a character) from x 20: characters 2 to 20, or 24 to 40
      return even ? [[50, 32], [266, 32]] : [[314, 32], [506, 32]];
    case 'range':
      return even ? [[28, 82], [316, 82]] : [[316, 82], [124, 82]];
    case 'scroller':
      // always down from the top: the page puts the scroller back at its top between drags
      return [[313, 160], [313, 220]];
    case 'dnd':
      return [[410, 155], [440, 160], [660, 170]];
    case 'dnd-short':
      // the near source to 10 px inside the target: a short drag and drop, 40 px (task 18)
      return [[530, 185], [570, 185]];
    case 'canvas':
      return CORNERS.map(([x, y]) => [x + 20, y + 350]);
    default:
      throw new Error(`no page path for ${kind}`);
  }
}

/** A character's centre. */
const centre = (e) => [Math.round(e.x + e.w / 2), Math.round(e.y + e.h / 2)];

/**
 * The selection runs' character offsets on the first line: even runs 2 to 20, odd runs 24 to 40. They do not overlap,
 * because a press inside the last run's selection would drag the selected text instead of selecting.
 */
export const selectOffsets = (i) => (i % 2 === 0 ? [2, 20] : [24, 40]);

/** xterm's default font is 6 by 13 pixels inside a 2-pixel border: a character's centre on the first line. */
export const xtermCell = (offset) => [2 + 6 * offset + 3, 2 + 6];

/**
 * A terminal's character cell from its window's size hints (a terminal resizes in whole cells: the increment is the
 * cell), from the first cell's corner `origin` (window-relative), as a character's centre on the first line.
 */
export function terminalCell(id, origin) {
  const hints = xExecFileSync('xprop', ['-id', String(id), 'WM_NORMAL_HINTS'], { encoding: 'utf8', timeout: 5000 });
  const pair = (label) => hints.match(new RegExp(`${label}: (\\d+) by (\\d+)`))?.slice(1).map(Number) ?? null;
  const [cw, ch] = pair('program specified resize increment') ?? [0, 0];
  if (!cw || !ch) throw new Error(`window ${id} names no resize increment`);
  return (offset) => [origin.x + cw * offset + Math.floor(cw / 2), origin.y + Math.floor(ch / 2)];
}

/**
 * Writer through gen has no accessibility tree to aim by: its first line's characters where a capture of its 1100x760
 * window shows them (M3.1: the line's 43 characters span x 198-542 at y 203, 8 px a character). The control lane
 * shows whether the estimate lands on the text.
 */
export const WRITER_GEN_LINE = { x: 202, y: 203, advance: 8 };
export const writerGenCell = (offset) => [WRITER_GEN_LINE.x + WRITER_GEN_LINE.advance * offset, WRITER_GEN_LINE.y];

/**
 * Where a family's scene puts each kind's targets, found once when its window opens: the page's origin in the
 * window, the text whose characters a selection spans, the slider, the vertical scroll bar.
 */
export async function locate(ctx, scene, kinds) {
  const { desktop, oracle } = ctx;
  const origin = { x: scene.window.x, y: scene.window.y };
  // GTK 4.14 reports extents relative to the window, not the screen (M0.4)
  const relative = scene.family === 'gnome-text-editor';
  const toWindow = ([x, y]) => (relative ? [x, y] : [x - origin.x, y - origin.y]);
  const at = { kinds };
  if (scene.kindOf === 'page') {
    const nodes = preorder((await desktop.state(scene)).ax_tree);
    // the page's origin from its range input, at (20, 70) in the page (Firefox's document node reports no extents)
    const range = nodes.find((n) => n.role === 'slider' && n.name === 'Range');
    if (!range) throw new Error(`${scene.label}: no range input`);
    // a window Firefox has not painted since it was raised reports no extents for its content yet
    let e = oracle.extents(range.id);
    for (let tries = 0; !(e.w > 0) && tries < 30; tries++) {
      await sleep(200);
      e = oracle.extents(range.id);
    }
    if (!(e.w > 0)) throw new Error(`${scene.label}: the range input has no extents`);
    at.page = { x: e.x - 20 - origin.x, y: e.y - 70 - origin.y };
    return at;
  }
  if (kinds.includes('scale4')) at.scale4 = FAMILIES['gtk4-input'].places.scale;
  if (kinds.includes('select')) {
    if (scene.family === 'gnome-terminal') {
      // VTE's terminal widget, below gnome-terminal's own header bar: its first cell at the widget's corner
      const node = preorder((await desktop.state(scene)).ax_tree).find((x) => x.role === 'terminal');
      if (!node) throw new Error(`${scene.label}: no terminal in its tree`);
      const e = oracle.extents(node.id);
      at.text = { cell: terminalCell(scene.id, { x: e.x - origin.x + 1, y: e.y - origin.y + 1 }) };
    }
    else if (scene.kindOf === 'terminal') at.text = { cell: xtermCell };
    else if (scene.pixels) at.text = { cell: writerGenCell, pixels: true };
    else {
      const id = scene.kindOf === 'paragraphs' ? oracle.children(scene.document).find((c) => oracle.role(c) === 'paragraph') : scene.field;
      if (!id) throw new Error(`${scene.label}: no text to select`);
      // GTK 4.14 answers no character extents: its first line, at an estimated 10 px a character past the margin
      const area = FAMILIES[scene.family]?.area?.(scene.window);
      const estimate = (offset) => [area.x - origin.x + 12 + 10 * offset + 5, area.y - origin.y + 14];
      at.text = { id, cell: area ? estimate : (offset) => toWindow(centre(oracle.charExtents(id, offset))) };
    }
  }
  if (kinds.includes('scale')) {
    if (!scene.slider) throw new Error(`${scene.label}: no slider`);
    const e = oracle.extents(scene.slider);
    at.scale = { id: scene.slider, extents: { ...e, x: e.x - origin.x, y: e.y - origin.y } };
  }
  if (kinds.includes('scrollbar')) {
    const { id, e } = await verticalScrollBar(desktop, oracle, scene, { extents: true });
    at.scrollbar = { id, extents: { ...e, x: e.x - origin.x, y: e.y - origin.y } };
  }
  return at;
}

/**
 * The window's tallest vertical scroll bar: its node id, with `extents` its extents too (`{id, e}`). kate's window does
 * not associate (the engines answer its X11 tree): its objects through the harness's own walk.
 */
export async function verticalScrollBar(desktop, oracle, scene, { extents = false } = {}) {
  const all = scene.source === 'at_spi' ? preorder((await desktop.state(scene)).ax_tree) : scene.frame ? oracle.walk(scene.frame, { prune: ['menu bar', 'menu', 'popup menu', 'tool bar', 'status bar'] }) : [];
  const nodes = all.filter((n) => n.role === 'scroll bar');
  const bars = nodes
    .map((n) => {
      try {
        return { id: n.id, e: oracle.extents(n.id) };
      } catch {
        return null;
      }
    })
    .filter((b) => b && b.e.h > 3 * b.e.w && b.e.w > 0)
    .sort((a, b) => b.e.h - a.e.h);
  if (!bars.length) throw new Error(`${scene.label}: no vertical scroll bar`);
  return extents ? bars[0] : bars[0].id;
}

/**
 * Harness setup that hides a real behaviour, so it is listed here with what it hides: a family whose fresh window takes
 * one untimed, unjudged, witnessed drag before its measured runs.
 */
export const DRAG_PRIMING = {
  writer: {
    reason:
      "Writer ignores the first drag of a fresh window in every engine, the pinned build's included (Surprises, M1a.4): the cell would measure the window's first drag, not the engine's",
    hides: "an agent's first drag in a fresh Writer window selects nothing: an M4 candidate (why, and whether the engine can prime the window itself)",
  },
};

/** The priming drag's path: the odd runs' text, so the first measured run (even) never presses inside its selection. */
export const primingPath = (at, kind) => runPath(at, kind, 1);

/** The kind whose target and effect reader a kind uses: a held-move cell draws on its plain kind's target. */
export const baseKind = (kind) => ({ 'handle-canvas': 'canvas', 'handle-dnd': 'dnd', 'select-unprimed': 'select' })[kind] ?? kind;

/**
 * A held-move cell's `drag_handle` requests, in root coordinates: its start at the path's first point, a held move to
 * each later point, its end. The control (`control`) makes the same moves with no start and no end: the button is never
 * pressed, so nothing can be drawn or dropped.
 */
export function handleSteps(at, kind, window, { control = false } = {}) {
  const points = runPath(at, baseKind(kind), 0).map((p) => ({ x: window.x + p.x, y: window.y + p.y }));
  if (control) return points.map((p) => ({ action: 'move_to', ...p }));
  return [{ action: 'start', ...points[0] }, ...points.slice(1).map((p) => ({ action: 'move_to', ...p })), { action: 'end' }];
}

/**
 * Whether a fresh window's first drag selected what its path spans: the first line's characters between the path's
 * two ends, each end allowed to round one character either way; nothing, or text the path does not span, is a miss.
 */
export function selectionCovers(text, i) {
  if (typeof text !== 'string' || text === '') return false;
  const [a, b] = selectOffsets(i);
  return WORDS.slice(Math.max(0, a - 1), b + 1).includes(text) && text.includes(WORDS.slice(a + 1, b - 1));
}

/**
 * The unprimed judge's positive reference: of the primed `select` cell's even runs that took (every lane's, in the same
 * sitting), how many `selectionCovers` takes too. Fewer than all, or none to check, and the judge could miss a first
 * drag that selects: the run reports REFERENCE MISMATCH (`dragVerdict`).
 */
export function primedReference(primedRuns) {
  const evens = primedRuns.filter((r) => r.i % 2 === 0 && r.took);
  return { covers: evens.filter((r) => selectionCovers(r.after, 0)).length, n: evens.length };
}

/** A run's path, window-relative: `[{x, y}, ...]`. */
export function runPath(at, kind, i) {
  let points;
  if (at.page) points = pagePath(kind, i).map(([x, y]) => [x + at.page.x, y + at.page.y]);
  else if (kind === 'select') {
    const [a, b] = selectOffsets(i);
    points = [at.text.cell(a), at.text.cell(b)];
  } else if (kind === 'scale4') {
    const { x0, x1, y } = at.scale4;
    const at25 = x0 + 12 + (x1 - x0 - 24) * 0.25;
    const at75 = x0 + 12 + (x1 - x0 - 24) * 0.75;
    points = i % 2 === 0 ? [[x0 + 12, y], [at75, y]] : [[at75, y], [at25, y]];
  } else if (kind === 'scale') {
    const e = at.scale.extents;
    const y = Math.round(e.y + e.h / 2);
    points = i % 2 === 0 ? [[e.x + 12, y], [Math.round(e.x + 12 + (e.w - 24) * 0.75), y]] : [[Math.round(e.x + 12 + (e.w - 24) * 0.75), y], [Math.round(e.x + 12 + (e.w - 24) * 0.25), y]];
  } else if (kind === 'scrollbar') {
    const e = at.scrollbar.extents;
    const x = Math.round(e.x + e.w / 2);
    points = i % 2 === 0 ? [[x, e.y + 30], [x, e.y + 180]] : [[x, e.y + 180], [x, e.y + 30]];
  } else throw new Error(`no path for ${kind}`);
  return points.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y) }));
}

// ---------------------------------------------------------------------------------------------------------------
// effects

/** The drag page's status lines (pages/drag.html), parsed. */
export function parseDragStatus(texts) {
  const line = (prefix) => texts.find((t) => t.startsWith(prefix)) ?? null;
  const num = (text, key) => {
    const m = text?.match(new RegExp(`\\b${key} (-?\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const select = line('select ');
  return {
    select: select === null ? null : select.slice('select '.length),
    range: num(line('range '), 'range'),
    scroller: num(line('scroller '), 'scroller'),
    dnd: Object.fromEntries(['starts', 'drops', 'downs', 'detail', 'gap', 'selects', 'ends', 'effect', 'lat', 'dur', 'ups', 'at'].map((key) => [key, num(line('dnd '), key)])),
    canvas: { strokes: num(line('canvas '), 'strokes'), moves: num(line('canvas '), 'moves'), dev: num(line('canvas '), 'dev') },
    moves: parsePointerLog(line('moves ')),
    received: parseReceived(line('received ')),
  };
}

/**
 * The page's count of the motions Chrome received during the last press (`received seq <press> target <id> raw <n>
 * moves <n>`): `raw` the pointerrawupdate events, which Chrome dispatches as it takes each motion, during a scrollbar
 * drag too (where no pointermove reaches the page), and `moves` the pointermove events. Null without the line.
 */
function parseReceived(text) {
  const m = text?.match(/^received seq (\d+) target (\S+) raw (\d+) moves (\d+)$/);
  return m ? { seq: Number(m[1]), target: m[2], raw: Number(m[3]), moves: Number(m[4]) } : null;
}

/** Blink's drag threshold off the Mac (`mouse_event_manager.cc` `kDragThresholdX/Y`): a press starts a drag on a move this far out in x or y. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * The drag page's pointer log of the drag source's last press (task 20): `moves seq <press count> n <moves> start <t>/<h>
 * up … cancel … end … m <t>/<h>/<dx>/<dy>/<buttons>/<coalesced> …`, where `t` is the event's own time and `h` the time its
 * handler ran, both ms after the press's, `dx`/`dy` the move's offset from the press in CSS px, and -1 an event that never
 * came. `past` is the first move past the drag threshold with the left button held, which is what lets Blink start the
 * drag (`MouseEventManager::HandleDrag`), or null.
 */
export function parsePointerLog(text) {
  if (text === null) return null;
  const num = (key) => text.match(new RegExp(`\\b${key} (-?\\d+)`))?.[1];
  const at = (key) => {
    const m = text.match(new RegExp(`\\b${key} (-1|(-?[\\d.]+)/(-?[\\d.]+))(?= |$)`));
    return !m || m[1] === '-1' ? null : { t: Number(m[2]), h: Number(m[3]) };
  };
  const moves = (text.split(/ m(?: |$)/)[1] ?? '')
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      const [t, h, dx, dy, buttons, coalesced] = token.split('/').map(Number);
      return { t, h, dx, dy, buttons, coalesced };
    });
  const past = moves.findIndex((m) => (Math.abs(m.dx) >= DRAG_THRESHOLD_PX || Math.abs(m.dy) >= DRAG_THRESHOLD_PX) && (m.buttons & 1) === 1);
  return { seq: Number(num('seq')), n: Number(num('n')), start: at('start'), up: at('up'), cancel: at('cancel'), end: at('end'), moves, past: past === -1 ? null : past };
}

function primary() {
  try {
    return xExecFileSync('xclip', ['-o', '-selection', 'primary'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** PRIMARY taken by the harness with a marker before a terminal's run, so a run that selects nothing reads as nothing. */
function claimPrimary() {
  const child = xSpawn('xclip', ['-i', '-selection', 'primary', '-loops', '1'], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
  child.stdin.end('cua171-none');
  child.unref();
}

/** The value a kind's effect is judged by. */
export async function readEffect(ctx, scene, at, cellKind) {
  const { desktop, oracle } = ctx;
  // a held-move cell reads its plain kind's target, Writer's unprimed drag its selection
  const kind = baseKind(cellKind);
  if (at.page) {
    const nodes = preorder((await desktop.state(scene)).ax_tree);
    const status = parseDragStatus(nodes.flatMap((n) => [n.name, n.value, n.text].filter((s) => typeof s === 'string')));
    // a drag and drop's counts carry the pointer log of the source's last press (task 20)
    return kind === 'dnd' ? { ...status.dnd, log: status.moves } : kind === 'canvas' ? status.canvas : status[kind];
  }
  if (kind === 'scale4') return (await readGtk4Status(desktop, scene))?.scale ?? null;
  if (kind === 'select' && at.text.pixels) return { capture: await captureWindow(ctx.cua, scene, desktop.dir) };
  if (kind === 'select') {
    if (scene.kindOf === 'terminal') {
      const text = primary();
      return text === 'cua171-none' ? '' : text;
    }
    return oracle.selectedText(at.text.id);
  }
  if (kind === 'scale') return Number(oracle.currentValue(at.scale.id));
  if (kind === 'scrollbar') return Number(oracle.currentValue(at.scrollbar.id));
  throw new Error(`no effect reader for ${kind}`);
}

const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1 : JSON.stringify(a) === JSON.stringify(b));

/** The effect once it settles: two equal reads 150 ms apart, after it changed or 1.2 s passed; at most 2.5 s. */
async function settled(read, before) {
  const started = Date.now();
  await sleep(200);
  let last = await read();
  for (;;) {
    await sleep(150);
    const now = await read();
    const steady = JSON.stringify(now) === JSON.stringify(last);
    if ((steady && (!same(now, before) || Date.now() - started > 1200)) || Date.now() - started > 2500) return now;
    last = now;
  }
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(JSON.stringify(v), (counts.get(JSON.stringify(v)) ?? 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)) best = v;
  return best === null ? null : JSON.parse(best);
}

/** The kinds whose drag moves a scroll position by how far the thumb went (relative), not to where it was dropped. */
export const THUMB_KINDS = ['scroller', 'scrollbar'];
/** A thumb drag took effect when it moved the content within this fraction of the pinned build's median movement. */
export const THUMB_TOLERANCE = 0.25;

/**
 * Whether each run took effect as the pinned build's do. A value kind (a selection, a slider) must end at the value
 * the pinned runs of its parity mostly end at; a thumb kind must move the content by the pinned runs' median movement
 * of its parity, within a quarter of it (the pinned build's own thumb drags in Chrome spread by about a tenth), a
 * scroll position stopping at 0; `dnd` needs one more drop, `canvas` a new stroke near every corner.
 */
export function judgeRuns(kind, runs) {
  const expected = {};
  if (THUMB_KINDS.includes(kind)) {
    for (const parity of [0, 1]) {
      const moves = runs.filter((r) => r.engine === 'pinned' && r.i % 2 === parity && r.ok && typeof r.after === 'number' && typeof r.before === 'number').map((r) => r.after - r.before);
      const moved = median(moves);
      expected[parity] = moved === null || moved === 0 ? null : { moved };
    }
  } else if (!['dnd', 'canvas'].includes(baseKind(kind)) && kind !== 'select-unprimed') {
    for (const parity of [0, 1]) {
      const values = runs.filter((r) => r.engine === 'pinned' && r.i % 2 === parity && r.ok && r.after !== null && r.after !== '' && !same(r.after, r.before)).map((r) => r.after);
      expected[parity] = values.length ? mode(values) : null;
    }
  }
  const took = (r) => {
    if (!r.ok || r.after === null || r.after === undefined) return false;
    // a fresh window's first drag, every run on the even path: judged against the text the path spans
    if (kind === 'select-unprimed') return selectionCovers(r.after, 0);
    // Writer through gen, whose selection reads only as its pixels: the capture after the drag differs from before
    if (r.after?.capture !== undefined) return r.pixels_changed === true;
    if (baseKind(kind) === 'dnd') return r.after.drops === (r.before?.drops ?? -2) + 1;
    if (baseKind(kind) === 'canvas') return r.after.strokes === (r.before?.strokes ?? -2) + 1 && r.after.dev >= 0 && r.after.dev <= CANVAS_TOLERANCE;
    if (THUMB_KINDS.includes(kind)) {
      const want = expected[r.i % 2];
      if (!want || typeof r.before !== 'number' || typeof r.after !== 'number') return false;
      return Math.abs(r.after - Math.max(0, r.before + want.moved)) <= Math.max(2, THUMB_TOLERANCE * Math.abs(want.moved));
    }
    const want = expected[r.i % 2];
    return want !== null && want !== undefined && same(r.after, want);
  };
  return { expected, runs: runs.map((r) => ({ ...r, took: took(r) })) };
}

/**
 * A cell's verdict per cua lane, absolute once the cell has a usable reference (Decision Log, M1a.4): every one of the
 * lane's runs must take effect, wherever the pinned build missed too. The reference is usable when the pinned build
 * took at least one run (the reader works) and, for a kind judged against the pinned build's values (`expected`),
 * every parity the runs use has one; a cell without it is recorded, not judged (`pass: null`). With `absolute` the kind's
 * effect needs no reference (Writer's unprimed first drag, which every engine's may miss): the cell is always judged.
 */
export function judgeCell(runs, lanes, expected = {}, { absolute = false } = {}) {
  const pinnedRuns = runs.filter((r) => r.engine === 'pinned');
  const pinnedTook = pinnedRuns.filter((r) => r.took).length;
  const positions = [...new Set(pinnedRuns.map((r) => r.i))].sort((a, b) => a - b);
  const parities = [...new Set(runs.map((r) => r.i % 2))];
  const usable = absolute || (pinnedTook > 0 && (Object.keys(expected).length === 0 || parities.every((p) => expected[p] !== null && expected[p] !== undefined)));
  // the witness is required of a lane where every pinned run kept it: Chrome's own drag and drop changes the stacking
  // (and its first one the focus), whichever engine drags
  const pinnedClean = pinnedRuns.every((r) => r.witness === true);
  const out = {};
  for (const lane of lanes) {
    const mine = new Map(runs.filter((r) => r.engine === lane).map((r) => [r.i, r]));
    const misses = [...new Set([...positions, ...mine.keys()])].filter((i) => mine.get(i)?.took !== true).sort((a, b) => a - b);
    const witness = runs.filter((r) => r.engine === lane).every((r) => r.witness === true);
    out[lane] = { took: [...mine.values()].filter((r) => r.took).length, n: mine.size, misses, witness, pass: usable ? misses.length === 0 && (witness || !pinnedClean) : null };
  }
  return { pinned_took: pinnedTook, reference: usable, pinned_witness: pinnedClean, lanes: out };
}

// ---------------------------------------------------------------------------------------------------------------
// the run

/**
 * The spacing of a held-move cell's `drag_handle` requests, every lane alike: cua's service defers each by its settle
 * (settle.mjs), so no caller through it sends them closer. Back to back, Firefox merged one held move's motions into the
 * next's and missed the canvas and the drop in every engine but the pinned build (task 65's probe); that would measure
 * a sequence no agent can send.
 */
export const HANDLE_GAP_MS = SETTLE_MS.drag_handle;

/**
 * A held-move cell's drag: its `drag_handle` requests in turn (`handleSteps`), `gapMs` apart, timed as the sum of the
 * requests, answered as the first that failed; a handle that pressed and then failed is ended, so no button stays down.
 */
export async function handleDrag(engine, steps, { gapMs = HANDLE_GAP_MS } = {}) {
  let ms = 0;
  for (const [k, step] of steps.entries()) {
    if (k > 0 && gapMs > 0) await sleep(gapMs);
    const value = await engine.request('drag_handle', step);
    ms += value.ms;
    if (!value.response.ok) {
      if (steps[0].action === 'start' && k > 0 && step.action !== 'end') await engine.request('drag_handle', { action: 'end' });
      return { response: value.response, ms };
    }
  }
  return { response: { ok: true }, ms };
}

/** The page's motion count of the drag's press (`received`), read once its effect has settled. */
async function readReceived(ctx, scene) {
  const nodes = preorder((await ctx.desktop.state(scene)).ax_tree);
  return parseDragStatus(nodes.flatMap((n) => [n.name, n.value, n.text].filter((s) => typeof s === 'string'))).received;
}

async function series(ctx, spec, scene, at, kind, n, { prime = false, start = 0 } = {}) {
  const { witness, emit, family } = ctx;
  const engine = new Engine(spec).start();
  const runs = [];
  try {
    if (prime) {
      // DRAG_PRIMING: one drag the cell neither times nor judges, witnessed like every other
      const { value, witness: w } = await witness.span(`${spec.label}:${family}:drag:${kind}:prime`, () => engine.request('drag', { window: { id: scene.id }, path: primingPath(at, kind) }));
      emit({ kind: 'drag-prime', family, drag: kind, engine: spec.label, ok: value.response.ok === true, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, reason: DRAG_PRIMING[family].reason });
      await sleep(700);
    }
    for (let i = start; i < start + n; i++) {
      if (kind === 'select' && scene.kindOf === 'terminal') {
        // the marker must own PRIMARY before the drag: an xclip slow to start would take it after the selection
        claimPrimary();
        for (let tries = 0; primary() !== 'cua171-none' && tries < 50; tries++) await sleep(20);
      }
      const read = () => readEffect(ctx, scene, at, kind);
      // the page's scroller goes back to its top by itself; the drag waits for it
      if (kind === 'scroller') for (let tries = 0; (await read()) !== 0 && tries < 40; tries++) await sleep(200);
      ctx.desktop.arrange(scene, ctx.occlusion);
      if (inFront(family, kind)) {
        // the window in front for every lane, the device case's way (dnd.mjs): raised, then activated
        xdotool('windowactivate', '--sync', scene.id);
        await sleep(400);
      }
      const before = await read();
      const handle = kind.startsWith('handle-');
      const path = handle ? handleSteps(at, kind, scene.window, { control: spec.handleControl }) : runPath(at, kind, i);
      const tag = `${spec.label}:${family}:drag:${kind}`;
      let sent;
      if (handle) sent = await witness.span(tag, () => handleDrag(engine, path));
      else if (spec.control) {
        xdotool('windowactivate', '--sync', scene.id);
        await sleep(150);
        const root = path.map((p) => ({ x: scene.window.x + p.x, y: scene.window.y + p.y }));
        sent = await witness.span(tag, () => engine.request('drag', { path: root }));
      } else sent = await witness.span(tag, () => engine.request('drag', { window: { id: scene.id }, path }));
      const { value, witness: w } = sent;
      const ok = value.response.ok === true;
      // the no-press control is answered success, and its effect is read like any other: it must show none
      const after = ok ? (at.text?.pixels ? await read() : await settled(read, before)) : null;
      // an engine's first request is cold: the long paths' speed is judged warm (dragSpeed)
      const run = { family, drag: kind, occlusion: ctx.occlusion, engine: spec.label, i, first_request: i === start && !prime, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), ms: Math.round(value.ms * 10) / 10, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, before, after, path };
      if (inFront(family, kind)) run.in_front = true;
      if (at.text?.pixels) run.pixels_changed = ok ? pixelsChanged(before.capture, after.capture) : false;
      if (at.page && ok) run.received = await readReceived(ctx, scene);
      runs.push(run);
      // what the application changed (Chrome's drag and drop activates and restacks, the control activates) is put
      // back for the next run by its arrangement
      // past the double-click time, so the next press starts a drag of its own
      await sleep(700);
    }
  } finally {
    await engine.close();
  }
  return runs;
}

/** The cells a run asks for: each family's kinds (`--ops` narrows them), in the order the run measures them. */
export function dragPlan(names, kindsAsked) {
  return names.flatMap((family) =>
    [...(DRAG_FAMILIES[family] ?? []), ...(OPTIONAL_KINDS[family] ?? [])]
      .filter((k) => (kindsAsked ? kindsAsked.includes(k) : !OPTIONAL_KINDS[family]?.includes(k)))
      .map((kind) => ({ family, kind })),
  );
}

/**
 * Whether the run measured what it asked for: every planned cell finished and nothing threw. A lane that misses
 * effects is a measured outcome; an error or a cell left unmeasured makes the run incomplete.
 */
export function dragCompleteness(plan, cells, errors) {
  const failed = [
    ...errors.map((e) => `${e.family}${e.kind ? ` ${e.kind}` : ''}: ${e.error}`),
    ...plan
      .filter((p) => !cells.some((c) => c.family === p.family && c.drag === p.kind))
      .filter((p) => !errors.some((e) => e.family === p.family && e.kind === p.kind))
      .map((p) => `${p.family} ${p.kind}: not measured`),
  ];
  return { complete: failed.length === 0, failed };
}

/**
 * Writer's unprimed lane (T16's measurement): every run a fresh window's first drag, no priming, the lanes taking turns
 * round by round, each lane on one engine throughout. The even path every run, judged by `selectionCovers`.
 */
async function unprimedRuns(ctx, lanes, n, open) {
  const { desktop, witness, family } = ctx;
  const engines = Object.fromEntries(lanes.map((l) => [l.label, new Engine(l).start()]));
  const runs = [];
  try {
    for (let i = 0; i < n; i++) {
      for (const spec of blockOrder(lanes, i)) {
        const scene = await open(`dragu${spec.label.replace(/[^a-z0-9]+/gi, '')}${i}`);
        try {
          desktop.arrangeFront(ctx.occlusion === 'covered' ? 'covered' : 'visible');
          await sleep(1000);
          if (ctx.occlusion !== 'covered') desktop.raise(scene);
          const at = await locate(ctx, scene, ['select']);
          const read = () => readEffect(ctx, scene, at, 'select-unprimed');
          desktop.arrange(scene, ctx.occlusion);
          const before = await read();
          const path = runPath(at, 'select', 0);
          const { value, witness: w } = await witness.span(`${spec.label}:${family}:drag:select-unprimed`, () => engines[spec.label].request('drag', { window: { id: scene.id }, path }));
          const ok = value.response.ok === true;
          const after = ok ? await settled(read, before) : null;
          runs.push({ family, drag: 'select-unprimed', occlusion: ctx.occlusion, engine: spec.label, i, first_request: i === 0, unprimed: true, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), ms: Math.round(value.ms * 10) / 10, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, before, after, path });
        } finally {
          await desktop.close([scene]);
        }
      }
    }
  } finally {
    await Promise.all(Object.values(engines).map((e) => e.close()));
  }
  return runs;
}

export async function runDrag(args, { desktop, emit }) {
  if (!args.vendor) throw new Error('the drag experiment needs --vendor (the pinned build is its reference)');
  const names = familyNames(args.families?.length ? args.families : Object.keys(DRAG_FAMILIES));
  const kindsAsked = args.ops && args.ops !== 'all' ? args.ops : null;
  const plan = dragPlan(names, kindsAsked);
  if (!plan.length) throw new Error(`no drag cell in families ${names.join(', ')} with kinds ${kindsAsked?.join(', ') ?? 'all'}: nothing to measure`);
  const n = dragTrials(args);
  // the unprimed lane's judge is checked against the primed cell's selections of the same sitting (primedReference)
  for (const { family } of plan.filter((p) => p.kind === 'select-unprimed')) {
    if (!plan.some((p) => p.family === family && p.kind === 'select')) throw new Error(`${family} select-unprimed needs the primed select cell beside it (--ops select,select-unprimed): its judge's positive reference`);
  }
  const lanes = dragEngines(args);
  const cuaLanes = lanes.filter((l) => l.label.startsWith('cua')).map((l) => l.label);
  const vendors = lanes.filter((l) => ['pinned', 'newest'].includes(l.label)).map((l) => l.label);
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront(args.occlusion === 'covered' ? 'covered' : 'visible');
  const witness = await startWitness(XPROBE);
  const md = [
    `Every engine drags the same path ${n} times per family and kind, in its own window (${args.occlusion}${args.load ? `, under load: ${args.loadFactor ?? 1} stress-ng worker${(args.loadFactor ?? 1) === 1 ? '' : 's'} per core` : ''}), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). \`cua:0ms\` has no wait after a sample, after the press or before the release.`,
    `The judges (T10), for the shipped lane \`cua\`: ${args.load ? "under load the landed counts decide, cua's at least the pinned build's, 40 a side" : "every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side"}. Every other cua lane is measured, not judged.`,
    '',
    `| family | kind | ${lanes.map((l) => `${l.label} took`).join(' | ')} | ${lanes.slice(1).map((l) => `${l.label} drag ms`).join(' | ')} | pinned drag ms | witness | judges | verdict |`,
    `|---|---|${lanes.map(() => '---:').join('|')}|${lanes.slice(1).map(() => '---:').join('|')}|---:|---|---|---|`,
  ];
  const cells = [];
  const errors = [];
  // each family's primed select runs, the unprimed lane's reference
  const primedSelect = {};
  const record = (family, kind, runs, { absolute = false, primed = null } = {}) => {
    const judged = judgeRuns(kind, runs);
    const cell = judgeCell(judged.runs.filter((r) => r.engine !== CONTROL_LANE), cuaLanes, judged.expected, { absolute });
    const reach = reachJudged(family, kind) ? thumbReach(judged.runs, cuaLanes) : null;
    for (const r of reach ? reach.runs : judged.runs) emit({ kind: 'drag-run', ...r });
    const speedOf = (lane) => {
      const { samples, ...verdict } = dragSpeed(judged.runs, { candidate: lane, vendors });
      return { ...verdict, usable: Object.fromEntries(Object.entries(samples).map(([e, s]) => [e, s.usable.length])), sampled: Object.fromEntries(Object.entries(samples).map(([e, s]) => [e, s.sampled])) };
    };
    const ms = (label) => median(judged.runs.filter((r) => r.engine === label && r.ok && !r.first_request).map((r) => r.ms));
    const withReceived = judged.runs.filter((r) => r.received);
    const row = {
      kind: 'drag-cell',
      family,
      drag: kind,
      expected: judged.expected,
      ...cell,
      ms: Object.fromEntries(lanes.map((l) => [l.label, ms(l.label)])),
      ...(reach ? { reach: { pinned_mean: reach.pinned_mean, lanes: reach.lanes } } : {}),
      ...(isLongPath(family, kind) && !args.load && vendors.length ? { speed: Object.fromEntries(cuaLanes.map((l) => [l, speedOf(l)])) } : {}),
      ...(args.load ? { load: loadCounts(judged.runs, cuaLanes) } : {}),
      ...(kind.startsWith('handle-') ? { control: controlVerdict(judged.runs.filter((r) => r.engine === CONTROL_LANE)) } : {}),
      ...(primed ? { primed_reference: primedReference(primed) } : {}),
      ...(withReceived.length ? { received: Object.fromEntries(lanes.map((l) => [l.label, { raw: median(withReceived.filter((r) => r.engine === l.label).map((r) => r.received.raw)), moves: median(withReceived.filter((r) => r.engine === l.label).map((r) => r.received.moves)) }])) } : {}),
    };
    emit(row);
    cells.push(row);
    if (kind === 'select') primedSelect[family] = judged.runs;
    const took = (label) => `${judged.runs.filter((r) => r.engine === label && r.took).length}/${judged.runs.filter((r) => r.engine === label).length}`;
    const verdict = !cell.reference && !row.load ? (cell.pinned_took === 0 ? 'no pinned effect: not judged' : 'no usable pinned reference: not judged') : cuaLanes.map((l) => `${l} ${laneFailures(row, l).length ? '**FAIL**' : 'PASS'}`).join(', ');
    const witnessClean = judged.runs.every((r) => r.witness) ? 'clean' : '**changed**';
    md.push(`| ${FAMILIES[family].title} | ${kind} | ${lanes.map((l) => took(l.label)).join(' | ')} | ${lanes.slice(1).map((l) => r1(row.ms[l.label])).join(' | ')} | ${r1(row.ms.pinned)} | ${witnessClean} | ${judgeNotes(row, cuaLanes)} | ${verdict} |`);
    process.stdout.write(`${md.at(-1)}\n`);
  };
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    for (const family of names) {
      const kinds = plan.filter((p) => p.family === family).map((p) => p.kind);
      if (!kinds.length) continue;
      const plain = kinds.filter((k) => k !== 'select-unprimed');
      let measuring = null;
      process.stdout.write(`family ${family}: ${kinds.join(', ')}\n`);
      const scenes = {};
      const ctx = { desktop, oracle, witness, emit, family, occlusion: args.occlusion, cua: args.cua };
      // the browsers show the drag page; gedit gets classic scroll bars (GTK 3's overlay ones hide until hovered)
      const page = ['chrome', 'firefox', 'electron'].includes(family) ? PAGE : null;
      const env = family === 'gedit' ? { GTK_OVERLAY_SCROLLING: '0' } : {};
      // Firefox opens maximized unless its profile asks for a size, and a maximized window is under the front window's
      // corner, where Gecko ignores coordinate input (Device mode, `unless_unobscured`)
      const geometry = ['firefox', 'writer-gen'].includes(family) ? FAMILIES[family].geometry : null;
      const open = async (label) => {
        const scene = await openFamily(desktop, oracle, family, label, { page, doc: DRAG_DOC, env, geometry });
        if (page) scene.kindOf = 'page';
        return scene;
      };
      try {
        if (plain.length) {
          for (const l of lanes) scenes[l.label] = await open(`drag${l.label.replace(/[^a-z0-9]+/gi, '')}`);
          desktop.arrangeFront(args.occlusion === 'covered' ? 'covered' : 'visible');
          await sleep(1000);
        }
        const at = {};
        for (const l of plain.length ? lanes : []) {
          if (args.occlusion !== 'covered') desktop.raise(scenes[l.label]);
          at[l.label] = await locate(ctx, scenes[l.label], plain.map(baseKind));
        }
        for (const [k, kind] of plain.entries()) {
          measuring = kind;
          const runs = [];
          // the lanes rotate per kind, so no lane always goes first
          const order = [...lanes.slice(k % lanes.length), ...lanes.slice(0, k % lanes.length)];
          const measure = async (count, start) => {
            for (const spec of order) {
              runs.push(...(await series(ctx, spec, scenes[spec.label], at[spec.label], kind, count, { prime: start === 0 && k === 0 && Boolean(DRAG_PRIMING[family]), start })));
              desktop.focusFront();
            }
          };
          await measure(n, 0);
          // a long path's speed still undetermined is sampled on, every lane alike, to 40 a side (topUpRuns), for the
          // shipped lane where the run has one (a measurement lane that misses would otherwise always run to 40)
          const topUpLanes = cuaLanes.includes('cua') ? ['cua'] : cuaLanes;
          for (let total = n; isLongPath(family, kind) && !args.load; ) {
            const now = judgeRuns(kind, runs).runs;
            const more = Math.max(0, ...topUpLanes.map((l) => topUpRuns(dragSpeed(now, { candidate: l, vendors }), total)));
            if (!more) break;
            emit({ kind: 'drag-top-up', family, drag: kind, from: total, more });
            process.stdout.write(`${family} ${kind}: speed undetermined at ${total} a side, ${more} more\n`);
            await measure(more, total);
            total += more;
          }
          if (kind.startsWith('handle-')) {
            // the no-press control, in the shipped lane's window: the same points, the button never pressed
            const host = cuaLanes.includes('cua') ? 'cua' : cuaLanes[0];
            runs.push(...(await series(ctx, { label: CONTROL_LANE, bin: args.cua, args: [], handleControl: true }, scenes[host], at[host], kind, n)));
            desktop.focusFront();
          }
          record(family, kind, runs);
          measuring = null;
        }
        if (kinds.includes('select-unprimed')) {
          measuring = 'select-unprimed';
          record(family, 'select-unprimed', await unprimedRuns(ctx, lanes, n, open), { absolute: true, primed: primedSelect[family] ?? [] });
          measuring = null;
        }
      } catch (error) {
        // the family's state is unknown after a structural error, so its remaining kinds are not measured
        errors.push({ family, kind: measuring, error: String(error.message ?? error).split('\n')[0].slice(0, 200) });
        emit({ kind: 'drag-error', family, drag: measuring, error: String(error.stack ?? error).slice(0, 1000) });
        process.stdout.write(`family ${family} failed: ${error.message}\n`);
        md.push(`| ${FAMILIES[family]?.title ?? family} | – | **failed: ${String(error.message).slice(0, 200)}** |`);
      } finally {
        await desktop.close(Object.values(scenes));
      }
    }
  } finally {
    await witness.stop();
  }
  const missing = cells.filter((c) => c.pinned_took > 0 && Object.values(c.lanes).some((l) => !l.pass));
  md.push('', missing.length ? `Cells where a cua lane missed a run the pinned build took: ${missing.map((c) => `${c.family} ${c.drag} (${Object.entries(c.lanes).filter(([, l]) => !l.pass).map(([k]) => k).join(', ')})`).join('; ')}.` : 'No cua lane missed a run the pinned build took.');
  const verdict = dragVerdict(cells);
  const completeness = dragCompleteness(plan, cells, errors);
  md.push('', cuaLanes.includes('cua') ? `The judges' verdict for \`cua\`: ${verdict.pass ? 'PASS' : `**FAIL**: ${verdict.failed.join('; ')}`}.` : 'No shipped `cua` lane: measured, not judged.');
  return { md, complete: completeness.complete, pass: verdict.pass, failed: [...completeness.failed, ...verdict.failed] };
}
