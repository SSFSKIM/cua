// The drop-signals experiment (#171 M4, T13: Chromium drop signals, measured only; the design session's M4 pre-flight,
// "The Chrome drop"): what the engine could observe of a Chromium drag and drop, measured against what landed, so the
// design session can rule on T14. It adopts nothing and changes no default: its lanes are the head's engine as it ships
// and its measurement flags (`--drag-dnd-release-at-accept`, `--drag-dnd-after-take-ms`, `--drag-ignore-cover`). T14
// reuses it for its live counts (plans `t14`, `t14-floor` and `t14-late`): each row also carries what the drag left
// pending, read on the same engine after its watch's lifetime (`notice`), and the answer of the acting request after it.
//
// Every drag goes into the drop-signals page (pages/drop-signals.html) in a window of the run's own Chrome (or Electron,
// `--family electron`), and around it:
// - before the press, the role probe at the start point (role-probe.mjs), and whether the window is `XdndAware`;
// - for the whole run, `xprobe drop-watch` on that window: `XdndSelection` takes, cursor changes with their images,
//   `_NET_ACTIVE_WINDOW` requests, root children's maps and ends, the window's crossings, each with its wall clock,
//   which the engine's `--stats` `wall` (press and release) lines each drag up with;
// - the page's status before and after: which source started a drag and drop and whether the zone counted its drop, or
//   a kind's effect on its own press (drop-signals-judge.mjs `dragOutcome`).
// A drag whose drag and drop is still open a second after its answer (a take after the release, which nothing cancels in
// front) is ended by the harness with an Escape to its own window, and the row says so.
//
// Plans (`--plan`): `main`, the never-take survey (every cell on the shipped lane), the release at the accept (300 short
// drops), the after-release signals (the floor at 0 for a mix of drops and leaves), and the late takes (#264); `cover`,
// which part of a covered path decides on the background route, and the start role beside it; `pilot`, a few of each.
// The gate's window load is `--ballast gate` (the gate's other Chrome windows open, and the shipped and accept lanes'
// gate-sequence cells: a fresh engine a drag, after the gate's preceding dedicated drop); twice the load is
// `--load-factor 2`. Tables: drop-signals-judge.mjs.

import { GATE_BALLAST } from './dnd.mjs';
import { locate } from './drag.mjs';
import { FREEZE_ENDS, acceptTable, afterReleaseTable, blockPlan, coverTable, dragOutcome, lateTakeTable, neverTakeTable, parseDropStatus, signalsOf } from './drop-signals-judge.mjs';
import { Engine } from './engine.mjs';
import { openFamily } from './families.mjs';
import { preorder } from './normalize.mjs';
import { Oracle } from './oracle.mjs';
import { probeAt } from './role-probe.mjs';
import { ParkRefused, ROOT, frontPoint, parkPointer } from './park.mjs';
import { openScene } from './run.mjs';
import { FIT_MARGIN, SCREEN, configure } from './scenes.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnXprobe, xdotool } from './xtools.mjs';
import { xExecFileSync } from './xspawn.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const PAGE = 'drop-signals.html';

/** Each cell's path in page pixels (pages/drop-signals.html's layout), by run. The drops are 40 px, 10 px into the zone. */
export const CELLS = {
  plain: () => [[530, 128], [570, 128]],
  // a long drop: through the zone's corner and on, as the drag scene's long drop
  'plain-long': () => [[530, 128], [640, 200], [900, 300]],
  // the plain source dragged away from the zone: a take, then a leave
  nozone: () => [[530, 128], [490, 128]],
  nested: () => [[530, 174], [570, 174]],
  // the nested span again, its dragstart handler busy 150 ms: a take under a text role that comes after the path
  'nested-late': () => [[530, 542], [570, 542]],
  slider: () => [[530, 220], [570, 220]],
  'dragstart-150': () => [[530, 266], [570, 266]],
  'press-150': () => [[530, 312], [570, 312]],
  // the press-150 source with the run's browser process stopped from 60 ms after the request to the cell's number
  // (`freezeOf`): the renderer's drag start, and the release, wait for the browser (#264's late take, by a lagging
  // browser)
  ...Object.fromEntries(FREEZE_ENDS.map((to) => [`freeze-${to}`, () => [[530, 312], [570, 312]]])),
  'dragstart-400': () => [[530, 358], [570, 358]],
  'press-400': () => [[530, 404], [570, 404]],
  link: () => [[530, 450], [570, 450]],
  image: () => [[530, 496], [570, 496]],
  // a draggable canvas: a drop source under the role the canvas rule predicts never takes (the review of task 68)
  'canvas-drag': () => [[530, 588], [570, 588]],
  seltext: () => [[60, 612], [100, 612]],
  select: () => [[50, 32], [90, 32]],
  range: (i) => (i % 2 === 0 ? [[28, 82], [68, 82]] : [[68, 82], [28, 82]]),
  scroller: () => [[313, 160], [313, 200]],
  canvas: () => [[60, 400], [100, 400]],
  inert: () => [[452, 418], [492, 418]],
  // T14's controls of the release at the accept (the design session, 2026-11-09 and 2026-11-10): a path that enters
  // the zone, 80 px in, and leaves it before its end, so its accept is withdrawn; and a press on a source inside the
  // zone, whose first status already accepts, then a path out of the zone below it
  left: () => [[530, 128], [640, 128], [500, 128]],
  'inzone-out': () => [[725, 578], [725, 632]],
  // the long path that crosses the zone and ends outside it, long enough (about 940 px) that its steps after the take
  // outlast the floor, so the release follows its last step at once (the design session, 2026-11-10: measure first)
  'long-left': () => [[530, 128], [800, 128], [800, 500], [500, 500]],
  // T17's second fix wave (the second review, P2; the design session, 2026-11-11): the plain source dragged out of the
  // window to the bare root 30 px beside it, on whichever side the screen has room (`rootBeside`), where nothing can
  // drop; and a drop that only moves, from the move source above the zone, 8 px into it
  root: (i, geometry) => [[530, 128], [640, 128], [rootBeside(geometry), 128]],
  // the design session's two cells beside it (2026-11-11): the release over a window that takes no drag and drop (the
  // run's front xterm, at its middle), and over another of the run's browser windows, XdndAware, outside any drop zone
  // (its page's scroller), where only its XdndStatus clears the accept (`ends`, in page pixels)
  xterm: (i, geometry) => [[530, 128], [640, 128], geometry.ends.xterm],
  other: (i, geometry) => [[530, 128], [640, 128], geometry.ends.other],
  move: () => [[725, 68], [725, 108]],
};

/**
 * The page x of a point on the bare root 30 px beside the window (`geometry`: its screen place and size, in page
 * pixels from the page's origin): right of it when the screen has room there, else left of it. A window with no room on
 * either side has no bare root beside it, and the cell cannot run.
 */
export function rootBeside({ x, width, pageX }) {
  const [screenWidth] = SCREEN;
  if (x + pageX + width + 30 < screenWidth - FIT_MARGIN) return width + 30;
  if (x + pageX - 30 >= FIT_MARGIN) return -pageX - 30;
  throw new Error(`no bare root beside the window (${x}, width ${width}) on a ${screenWidth} px screen`);
}

/** T14's cells' sources, beside the judge's (drop-signals-judge.mjs `CELL_SOURCE`): each a drop the zone never counts. */
export const T14_SOURCE = { left: 'plain', 'inzone-out': 'inzone', 'long-left': 'plain', root: 'plain', xterm: 'plain', other: 'plain' };

/** Where the `other` cell's window goes: right of the scene's, below the root cell's end (x, y, width, height). */
export const OTHER_PLACE = [920, 250, 340, 360];

/** A window's client origin on the screen. */
function clientOrigin(id) {
  const g = Object.fromEntries(xdotool('getwindowgeometry', '--shell', id).split('\n').map((l) => l.split('=')).map(([k, v]) => [k, Number(v)]));
  return { x: g.X, y: g.Y };
}

/** The cells that end off the source's window: where each ends, and what must be under that end (`OFF_WINDOW`). */
export const OFF_WINDOW = ['root', 'xterm', 'other'];

/**
 * The screen ends of the off-window cells and the window each must find there: the bare root beside the window, the
 * front xterm's middle, the other browser window's scroller (page (150, 150) from its client's origin).
 */
export function offWindowEnds({ front = null, other = null } = {}) {
  return {
    xterm: front && { x: front.x, y: front.y, over: front.id },
    other: other && { x: other.x + 150, y: other.y + 150, over: other.id },
  };
}

/** A T14 cell's outcome from the page's status before and after: its source's drag and drop started, and dropped. */
export function t14Outcome(cell, before, after) {
  const src = T14_SOURCE[cell];
  const b = before?.dnd?.[src];
  const a = after?.dnd?.[src];
  if (!a || !b) return { started: false, landed: false, effect: null };
  return { started: a.starts > b.starts, landed: a.drops > b.drops, effect: null };
}

/**
 * A freeze cell's browser stop, in ms after the drag is sent: Chrome refuses a renderer's mouse drag once the browser
 * has seen the left button go up (`WebContentsViewAura::StartDragging`, `IsLeftMouseButtonDown`), so a take can follow
 * the release only when the browser itself lags behind the X stream; a stopped browser lags by construction.
 */
export const freezeOf = (cell) => {
  const m = /^freeze-(\d+)$/.exec(cell);
  return m ? { from: 60, to: Number(m[1]) } : null;
};

/** The covered-path cells' paths: long enough that a cover of the middle touches neither end. */
export const COVER_CELLS = {
  select: () => [[50, 32], [290, 32]],
  range: (i) => (i % 2 === 0 ? [[28, 82], [268, 82]] : [[268, 82], [28, 82]]),
  scroller: () => [[313, 140], [313, 300]],
  canvas: () => [[60, 400], [300, 400]],
  plain: () => [[530, 128], [770, 128]],
};

/** The range input's value at page x (0 at 28, 100 at 412: its thumb's travel). */
export const rangeValueAt = (x) => Math.round(((x - 28) / 384) * 100);

/** The parts of a path a cover hides (page pixels, `{x, y, w, h}`), or null for none. */
export function coverRect(part, path) {
  const [first, last] = [path[0], path.at(-1)];
  const box = ([x, y], w = 24, h = 24) => ({ x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h });
  if (part === 'none') return null;
  if (part === 'start') return box(first);
  if (part === 'end') return box(last);
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (part === 'middle') {
    // the path's middle third, across it
    const mid = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
    return x1 - x0 >= y1 - y0 ? box(mid, Math.round((x1 - x0) / 3), 24) : box(mid, 24, Math.round((y1 - y0) / 3));
  }
  if (part === 'all') return { x: x0 - 12, y: y0 - 12, w: x1 - x0 + 24, h: y1 - y0 + 24 };
  throw new Error(`no cover part ${part}`);
}
export const COVER_PARTS = ['none', 'start', 'middle', 'end', 'all'];

/** The lanes: the engine's flags for each, and how its drags are made. */
export const LANES = {
  cua: { args: [] },
  'cua:accept': { args: ['--drag-dnd-release-at-accept'] },
  'cua:floor0': { args: ['--drag-dnd-after-take-ms', '0'] },
  // the gate's own sequence (`--ballast gate`): a fresh engine a drag, after the gate's preceding dedicated drop
  'cua:gate': { args: [], gate: true },
  'cua:accept-gate': { args: ['--drag-dnd-release-at-accept'], gate: true },
  // background drags along a covered path (measurement only), Chrome not in front
  'cua:cover': { args: ['--drag-ignore-cover'], cover: true },
  // the same under the harness's managed front window (frame and title bar included) in place of the override-redirect
  'cua:cover-managed': { args: ['--drag-ignore-cover'], cover: true, managed: true },
  // each drag as a drag_handle on the desktop route: a start at the path's first point, a move to each later one, the
  // end (M4's T17 fix wave: Electron's drop confirmed by its drag loop's accept cursor at the release)
  'cua:handle': { args: [], handle: true },
  // each drag on the desktop route: no window named, the path in screen coordinates (T17's second fix wave: the drag
  // loop's cursor watched by the source's family, wherever the path ends)
  'cua:desktop': { args: [], desktop: true },
};

/** One drag of a `desktop` lane: `drag` with no window, the path in screen coordinates. */
export async function desktopDrag(engine, scene, path) {
  return engine.request('drag', { path: path.map((p) => ({ x: scene.window.x + p.x, y: scene.window.y + p.y })) });
}

/**
 * One drag of a `handle` lane: the path as drag_handle steps in screen coordinates, the end sent whatever came before
 * it (as an agent's cell would release its handle), answered as the end's request, the time the whole sequence's.
 */
export async function handleDrag(engine, scene, path) {
  const screen = path.map((p) => ({ x: scene.window.x + p.x, y: scene.window.y + p.y }));
  const t0 = performance.now();
  const steps = [{ action: 'start', ...screen[0] }, ...screen.slice(1).map((p) => ({ action: 'move_to', ...p }))];
  let failed = null;
  for (const step of steps) {
    const value = await engine.request('drag_handle', step);
    if (value.response.ok !== true) {
      failed = value;
      break;
    }
  }
  const end = await engine.request('drag_handle', { action: 'end' });
  const value = failed ?? end;
  return { ...value, ms: performance.now() - t0, end: failed ? end.response : undefined };
}

/** The plans: `[lane, cell, drags]`. The never-take survey reads every drag's start point, whatever its lane. */
export const PLANS = {
  main: [
    ...[['plain', 60], ['nozone', 30], ['nested', 30], ['slider', 30], ['dragstart-150', 30], ['press-150', 30], ['dragstart-400', 30], ['press-400', 30], ['freeze-250', 30], ['link', 20], ['image', 20], ['seltext', 30], ['select', 30], ['range', 30], ['scroller', 30], ['canvas', 30], ['inert', 20]].map(([cell, n]) => ['cua', cell, n]),
    ['cua:accept', 'plain', 300],
    ['cua:accept', 'nozone', 30],
    ['cua:floor0', 'plain', 60],
  ],
  // with `--ballast gate` only
  gate: [
    ['cua:gate', 'plain', 30],
    ['cua:accept-gate', 'plain', 30],
  ],
  cover: Object.keys(COVER_CELLS).flatMap((cell) => COVER_PARTS.map((part) => ['cua:cover', `${cell}@${part}`, 20])),
  'cover-managed': Object.keys(COVER_CELLS).flatMap((cell) => COVER_PARTS.map((part) => ['cua:cover-managed', `${cell}@${part}`, 20])),
  // the false-negative control that joins two: a draggable under a text role whose take comes after the path
  extra: [['cua', 'nested-late', 30]],
  // the canvas rule's taking control: one take disproves a never-take rule, so idle is enough
  'canvas-drag': [['cua', 'canvas-drag', 30]],
  // the after-release signals and the accept in Electron (`--family electron`), which has no freeze cell: whether
  // Chrome's signals hold for the Chromium toolkit the floor and the hold also cover
  electron: [
    ['cua', 'plain', 30],
    ['cua', 'nozone', 30],
    ['cua:floor0', 'plain', 60],
    ['cua:accept', 'plain', 30],
  ],
  // the freeze sweep: where a lagging browser's thaw falls against the release
  freeze: FREEZE_ENDS.map((to) => ['cua', `freeze-${to}`, 10]),
  // T14's live counts for the release at the accept (the design session, 2026-11-10): a second source, the long drag
  // and drop, 300 drops; the accepted-then-left control and the press inside the zone, 30 each. Task 69 ran them on an
  // engine that shipped the release (f9bdb5c2, the lane `cua` there); the press-inside control's false release reverted
  // it to this measurement flag. `t14-floor`: the same drags on the engine as it ships, the floor and the confirmation
  t14: [['cua:accept', 'plain-long', 300], ['cua:accept', 'left', 30], ['cua:accept', 'inzone-out', 30]],
  't14-floor': [['cua', 'plain-long', 300], ['cua', 'left', 30], ['cua', 'inzone-out', 30]],
  // the long-path accepted-then-left control on the engine as it ships: 100 a load at idle and twice the load, 30 at
  // the gate's window load
  't14-long': [['cua', 'long-left', 100]],
  't14-long-gate': [['cua', 'long-left', 30]],
  // #264's real late takes (the design session's ruling 4, 2026-11-10): task 68's reproduction, the run's own browser
  // stopped from 60 ms after the request to 250 ms (its late takes came there), on a drag the engine lets drop; run on
  // the engine before T14 too, its failing first
  't14-late': [['cua', 'freeze-250', 40]],
  // M4's T17 fix wave (the design session's ruling on task 73's review, 2026-11-11): Electron's drop confirmed by its
  // drag loop's accept cursor at the release, for plain drops behind the floor and for handles (`--family electron`):
  // 300 short drops, the accepted-then-left control and the press inside the zone, 30 each. The short drop, not
  // `t14-floor`'s long one: in Electron's window the long path's end is not the zone (the fix wave's pilot: the plain
  // drag is refused there, and a handle's drop lands on another of the page's elements)
  't17-floor': [['cua', 'plain', 300], ['cua', 'left', 30], ['cua', 'inzone-out', 30]],
  't17-handle': [['cua:handle', 'plain', 300], ['cua:handle', 'left', 30], ['cua:handle', 'inzone-out', 30]],
  // its second fix wave (the second review; the design session, 2026-11-11), Electron, at each load: the two controls
  // and the three releases off the window (the bare root, the xterm, another browser window outside its zone; a
  // desktop drag, and a handle), 30 each, as plain drags and as handles; 100 drops each; and 30 drops that only move,
  // whose accept under breeze_cursors is drawn as no drop. `t17-root`: the three off-window releases alone, the
  // review's P2 case, run on the engine before the fix first
  't17-fix2': [
    ['cua', 'plain', 100], ['cua', 'left', 30], ['cua', 'inzone-out', 30], ['cua', 'move', 30],
    ...OFF_WINDOW.map((cell) => ['cua:desktop', cell, 30]),
    ['cua:handle', 'plain', 100], ['cua:handle', 'left', 30], ['cua:handle', 'inzone-out', 30], ['cua:handle', 'move', 30],
    ...OFF_WINDOW.map((cell) => ['cua:handle', cell, 30]),
  ],
  't17-root': OFF_WINDOW.map((cell) => ['cua:desktop', cell, 30]),
  pilot: [
    ...['plain', 'nozone', 'nested', 'slider', 'dragstart-150', 'press-150', 'dragstart-400', 'press-400', 'freeze-250', 'link', 'image', 'seltext', 'select', 'range', 'scroller', 'canvas', 'inert'].map((cell) => ['cua', cell, 2]),
    ['cua:accept', 'plain', 5],
    ['cua:accept', 'nozone', 2],
    ['cua:floor0', 'plain', 5],
    ...['select@middle', 'plain@end'].map((cell) => ['cua:cover', cell, 2]),
  ],
};

/** A plan's specs for the sitting: `--plan`'s, the gate cells added at the gate's window load, `--trials` capping each. */
export function planSpecs({ plan = 'main', ballast = null, trials = null, lanes = null } = {}) {
  const rows = [...(PLANS[plan] ?? (() => { throw new Error(`no plan ${plan}; known: ${Object.keys(PLANS).join(', ')}`); })()), ...(ballast === 'gate' && plan === 'main' ? PLANS.gate : [])];
  return rows.filter(([lane]) => !lanes || lanes.includes(lane)).map(([lane, cell, n]) => ({ lane, cell, n: trials ? Math.min(trials, n) : n }));
}

/** A cell's base cell and cover part (`select@middle`). */
const splitCell = (cell) => {
  const [base, cover = null] = cell.split('@');
  return { base, cover };
};

/** A spec's path for run `i`, in window coordinates; `window` the window's geometry, for a cell that leaves it. */
export function windowPath(at, cell, i, window = null, screenEnds = {}) {
  const { base, cover } = splitCell(cell);
  const toPage = (p) => p && [p.x - window.x - at.page.x, p.y - window.y - at.page.y];
  const ends = window ? Object.fromEntries(Object.entries(screenEnds).map(([k, p]) => [k, toPage(p)])) : {};
  const geometry = window && { x: window.x, pageX: at.page.x, width: window.width - at.page.x, height: window.height - at.page.y, ends };
  const path = (cover ? COVER_CELLS : CELLS)[base](i, geometry);
  return path.map(([x, y]) => ({ x: x + at.page.x, y: y + at.page.y }));
}

/** The whole run's drop watch: its lines kept with their wall clock, sliced per drag. */
async function startDropWatch(window) {
  const child = spawnXprobe(['drop-watch', window], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  const exited = new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
  const rl = createInterface({ input: child.stdout });
  const ready = new Promise((resolve, reject) => {
    rl.once('line', resolve);
    exited.then(() => reject(new Error('xprobe drop-watch exited before it was ready')));
  });
  rl.on('line', (l) => {
    try {
      lines.push(JSON.parse(l));
    } catch {
      // a torn line at the end
    }
  });
  await ready;
  return {
    between: (from, to) => lines.filter((l) => l.wall_ms >= from && l.wall_ms <= to),
    async stop() {
      child.stdin.end();
      await exited;
    },
  };
}

/** The page's status lines, read through the run's reader. */
async function readStatus(desktop, scene) {
  const nodes = preorder((await desktop.state(scene)).ax_tree);
  return parseDropStatus(nodes.flatMap((n) => [n.name, n.value, n.text].filter((s) => typeof s === 'string')));
}

/** Whether the window carries `XdndAware` (a drop target's mark; its value the protocol version). */
function xdndAware(id) {
  try {
    return /XdndAware\(ATOM\) = /.test(xExecFileSync('xprop', ['-id', String(id), 'XdndAware'], { encoding: 'utf8', timeout: 5000 }));
  } catch {
    return null;
  }
}

/** The window's frame, the role probe's root: the reader's tree's root node. */
async function frameOf(desktop, scene) {
  const tree = (await desktop.state(scene)).ax_tree;
  return tree?.id ?? preorder(tree)[0]?.id ?? null;
}

/**
 * A window of the harness's over a screen rectangle while `body` runs: an override-redirect one, or with `managed` the
 * run's front window (an xterm the window manager frames) moved there, its client at the rectangle, then put back in
 * its corner; the frame's extents are answered beside it.
 */
async function withCover(rect, body, { desktop = null, managed = false } = {}) {
  if (!rect) return body();
  if (managed) {
    configure(desktop.front.id, rect.x, rect.y, rect.w, rect.h);
    desktop.focusFront();
    await sleep(300);
    try {
      return await body(desktop.front.id);
    } finally {
      desktop.arrangeFront('visible');
      await sleep(150);
    }
  }
  const child = spawnXprobe(['overlay', rect.x, rect.y, rect.w, rect.h], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const shown = await new Promise((resolve) => {
    createInterface({ input: child.stdout }).once('line', (l) => resolve(JSON.parse(l)));
    exited.then(() => resolve(null));
  });
  if (!shown?.overlay) throw new Error('the cover did not map');
  try {
    await sleep(150);
    return await body(shown.overlay);
  } finally {
    child.stdin.end();
    await exited;
    await sleep(150);
  }
}

/**
 * The gate's preceding case (device.mjs `chrome_dnd_covered_dedicated`, as dnd.mjs `dedicatedDrop` runs it): the window
 * covered, then cua in dedicated mode drags the long drop into it through the foreground route, and the front window
 * takes the focus back.
 */
async function gatePrelude(ctx, scene, at) {
  const { desktop, emit } = ctx;
  const engine = new Engine({ label: 'prelude', bin: ctx.cua, args: ['--desktop', 'dedicated'] }).start();
  try {
    desktop.arrangeFront('covered');
    await sleep(1200);
    const { response, ms } = await engine.request('drag', { window: { id: scene.id }, path: windowPath(at, 'plain-long', 0) });
    emit({ kind: 'drop-signal-prelude', ok: response.ok === true, error: response.ok ? undefined : String(response.error).slice(0, 300), ms: Math.round(ms * 10) / 10 });
    await sleep(400);
  } finally {
    await engine.close();
  }
  desktop.focusFront();
}

/**
 * The run's browser process: the one whose command line names the run's profile and no child type. Chrome rewrites its
 * command line into one space-separated title (chrome.mjs `owns` reads it as separate arguments), so it is read as text.
 */
export function runBrowser(profile, { proc = '/proc', read = (path) => readFileSync(path, 'utf8') } = {}) {
  const own = `--user-data-dir=${profile}`;
  for (const name of readdirSync(proc)) {
    if (!/^\d+$/.test(name)) continue;
    let line;
    try {
      line = read(`${proc}/${name}/cmdline`).replace(/\0/g, ' ');
    } catch {
      continue;
    }
    const words = line.split(/\s+/);
    if (words.includes(own) && !words.some((w) => w.startsWith('--type='))) return Number(name);
  }
  return null;
}

/** The run's browser process stopped over `span` (ms from now), and always continued: what was done, with times. */
async function freezeBrowser(pid, span) {
  if (!pid) throw new Error('the freeze cell needs the run\'s browser process');
  const t0 = Date.now();
  await sleep(span.from);
  const stopped = Date.now();
  process.kill(pid, 'SIGSTOP');
  try {
    await sleep(span.to - span.from);
  } finally {
    process.kill(pid, 'SIGCONT');
  }
  return { pid, stopped_ms: stopped - t0, continued_ms: Date.now() - t0 };
}

/** The window in front for a drag the engine lets drop: raised, active and focused (the front window in its corner). */
function inFront(scene) {
  xdotool('windowraise', scene.id);
  xdotool('windowactivate', '--sync', scene.id);
}

/** One drag: the probe, the request, the watch's slice, the page's status, an Escape for a drag and drop left open. */
async function oneDrag(ctx, { lane, spec, cell, i, engine, before, cold }) {
  const { desktop, scene, at, watch, oracle, emit } = ctx;
  const { base, cover } = splitCell(cell);
  const path = windowPath(at, cell, i, scene.window, ctx.ends ?? {});
  const start = { x: scene.window.x + path[0].x, y: scene.window.y + path[0].y };
  const probe = ctx.frame ? probeAt(oracle, ctx.frame, start.x, start.y) : null;
  const rect = cover ? coverRect(cover, (COVER_CELLS[base])(i)) : null;
  const screenRect = rect && { ...rect, x: rect.x + at.page.x + scene.window.x, y: rect.y + at.page.y + scene.window.y };
  const sent = Date.now();
  const frozen = freezeOf(base) ? freezeBrowser(ctx.browser, freezeOf(base)) : null;
  const handled = LANES[lane].handle === true;
  const desktopLane = LANES[lane].desktop === true;
  // an off-window cell's end read before the drag: the window it is for under it (the bare root, the xterm, the other
  // browser window), or the row says what was there instead and the tables leave the drag out
  const end = { x: scene.window.x + path.at(-1).x, y: scene.window.y + path.at(-1).y };
  const offWindow = OFF_WINDOW.includes(base);
  let endPark = null;
  if (offWindow) {
    const over = base === 'root' ? ROOT : ctx.ends[base].over;
    try {
      parkPointer(end, over);
      endPark = { over, verified: true };
    } catch (error) {
      if (!(error instanceof ParkRefused)) throw error;
      endPark = { over, verified: false, why: error.message };
    }
  }
  const value = await withCover(screenRect, () => (handled ? handleDrag(engine, scene, path) : desktopLane ? desktopDrag(engine, scene, path) : engine.request('drag', { window: { id: scene.id }, path })), { desktop, managed: LANES[lane].managed === true });
  const freeze = frozen ? await frozen : undefined;
  const answered = Date.now();
  await sleep(1000);
  // a drag that ended off the window leaves the real pointer there, which a later background drag into the window would
  // answer as a pointer outside it: put back at the drag's start, in the window
  if (offWindow) parkPointer(start, scene.id);
  // what the drag left pending, past its watch's lifetime (M4's T14): the notice on a read's reply on the same engine,
  // then an acting request that sends nothing, refused while anything is pending (so the next drag is not the one
  // refused), its answer and the late drag and drop it reports kept: an engine before T14 runs it
  const read = await engine.request('list_windows', {});
  const notice = read.response.notice ?? null;
  const preflight = await engine.request('preflight', {});
  const next = { ok: preflight.response.ok === true, error: preflight.response.ok ? null : String(preflight.response.error), late_dnd: preflight.stats?.late_dnd ?? null };
  let after = await readStatus(desktop, scene);
  const stats = value.stats ?? {};
  // a handle's end records its release's wall time; its press is the start's, sent first
  const wall = stats.wall ?? (handled && stats.handle?.release_wall_ms ? { press_ms: sent, release_ms: stats.handle.release_wall_ms } : null);
  const lines = watch.between(sent - 2, Date.now());
  const signals = signalsOf(lines, { target: scene.id, pressMs: wall?.press_ms ?? sent, releaseMs: wall?.release_ms ?? answered, engineTook: typeof stats.hold?.taken === 'boolean' ? stats.hold.taken : null });
  // a drag and drop still open (its dragend not come): the harness ends it with an Escape to its own window
  let escaped = false;
  if (after.last && after.dnd && before.dnd && after.last.dur === -1 && Object.keys(after.dnd).some((s) => after.dnd[s].starts > (before.dnd[s]?.starts ?? 0))) {
    xdotool('key', '--window', scene.id, 'Escape');
    escaped = true;
    await sleep(400);
    after = await readStatus(desktop, scene);
  }
  const rangeEnd = base === 'range' ? rangeValueAt((cover ? COVER_CELLS : CELLS).range(i).at(-1)[0]) : undefined;
  const row = {
    kind: 'drop-signal',
    load: ctx.load,
    family: ctx.family,
    lane,
    cell,
    base,
    cover,
    i,
    // where the path ended on the screen, and for an off-window cell whether its window was there before the drag
    end,
    end_park: endPark,
    block: spec.block,
    cold,
    ok: value.response.ok === true,
    error: value.response.ok ? undefined : String(value.response.error).slice(0, 300),
    ms: Math.round(value.ms * 10) / 10,
    route: stats.route,
    hold: stats.hold,
    after_take: stats.after_take,
    wall,
    accept: stats.accept,
    press: stats.press,
    dnd: stats.dnd,
    probe,
    xdnd_aware: ctx.xdndAware,
    before,
    after,
    signals,
    outcome: T14_SOURCE[base] ? t14Outcome(base, before, after) : dragOutcome(base, before, after, { i, rangeEnd }),
    notice,
    next,
    after_release: stats.after_release,
    // Electron's drop: the drag loop's cursor read at the release (a drag's `drop_cursor`, a handle's in its record)
    drop_cursor: stats.drop_cursor ?? stats.handle?.drop_cursor,
    handle: handled ? { ...stats.handle, end: value.end } : undefined,
    escaped,
    freeze,
    // the watch's own lines for the drag, the crossings left out (their count kept)
    watch: lines.filter((l) => !['enter', 'leave'].includes(l.kind)),
    crossings: lines.filter((l) => ['enter', 'leave'].includes(l.kind)).length,
  };
  emit(row);
  return { row, after };
}

/** The run: the scene, the watch, the ballast, then every block of the plan. */
export async function runDropSignals(args, { desktop, emit }) {
  const family = args.families?.[0] ?? 'chrome';
  if (!['chrome', 'electron'].includes(family)) throw new Error('the drop-signals experiment runs in chrome or electron');
  const load = args.load ? `load${args.loadFactor ?? 1}` : args.ballast === 'gate' ? 'gate-windows' : 'idle';
  const specs = planSpecs({ plan: args.plan, ballast: args.ballast, trials: args.samplesTrials ?? null, lanes: args.lanes ?? null });
  const oracle = new Oracle();
  await desktop.openFront('visible');
  const ballast = [];
  const rows = [];
  let watch = null;
  let scene = null;
  let other = null;
  try {
    if (args.ballast === 'gate') {
      for (const [name, n] of Object.entries(GATE_BALLAST)) {
        for (let k = 0; k < n; k++) ballast.push(await openScene(desktop, name, `ballast${k}`, { text: ['chrome-textarea', 'chrome-address-bar'].includes(name) }));
      }
    }
    scene = await openFamily(desktop, oracle, family, 'dropsig', { page: PAGE });
    scene.kindOf = 'page';
    // the `other` cell's window: another of the run's browser windows, the same page, right of the scene's, below the
    // root cell's end
    if (specs.some((s) => splitCell(s.cell).base === 'other')) {
      other = await openFamily(desktop, oracle, family, 'dropsig-other', { page: PAGE });
      configure(other.id, ...OTHER_PLACE);
      await sleep(1000);
    }
    desktop.arrangeFront('visible');
    inFront(scene);
    await sleep(1000);
    const at = await locate({ desktop, oracle }, scene, ['dnd']);
    watch = await startDropWatch(scene.id);
    // the run's own browser process (the freeze cell's), never one found by name
    const browser = family === 'chrome' && desktop.chrome ? runBrowser(desktop.chrome.profile) : null;
    const ends = offWindowEnds({ front: frontPoint(desktop), other: other && { id: other.id, ...clientOrigin(other.id) } });
    const ctx = { desktop, scene, at, watch, oracle, emit, load, family, cua: args.cua, browser, frame: await frameOf(desktop, scene), xdndAware: xdndAware(scene.id), ends };
    emit({ kind: 'drop-signal-scene', family, load, browser, window: scene.id, page: at.page, frame: ctx.frame, xdnd_aware: ctx.xdndAware, ballast: ballast.length, plan: args.plan ?? 'main', specs, ends, other: other ? { id: other.id, xdnd_aware: xdndAware(other.id) } : null });
    const plan = blockPlan(specs.map((s, k) => ({ ...s, spec: k })));
    for (const [b, block] of plan.entries()) {
      const lane = LANES[block.lane];
      if (!lane) throw new Error(`no lane ${block.lane}`);
      const { cover } = splitCell(block.cell);
      if (Boolean(cover) !== Boolean(lane.cover)) throw new Error(`${block.lane} ${block.cell}: a covered cell runs on the cover lane, and only there`);
      const fresh = () => new Engine({ label: block.lane, bin: args.cua, args: lane.args, stats: true }).start();
      let engine = lane.gate ? null : fresh();
      try {
        let before = await readStatus(desktop, scene);
        for (let k = 0; k < block.n; k++) {
          const i = block.start + k;
          if (lane.gate) {
            await gatePrelude(ctx, scene, at);
            engine = fresh();
          }
          // the cover lane's drags background, as an agent's: the window raised, the focus in front
          if (k === 0 || lane.gate) desktop.arrangeFront('visible');
          if (lane.cover) desktop.raise(scene);
          else inFront(scene);
          await sleep(lane.gate ? 1200 : 150);
          if (lane.gate) before = await readStatus(desktop, scene);
          const { row, after } = await oneDrag(ctx, { lane: block.lane, spec: { block: b }, cell: block.cell, i, engine, before, cold: lane.gate || k === 0 });
          rows.push(row);
          before = after;
          if (lane.gate) {
            await engine.close();
            engine = null;
          }
        }
      } finally {
        if (engine) await engine.close();
      }
      process.stdout.write(`block ${b + 1}/${plan.length} ${block.lane} ${block.cell} x${block.n}\n`);
    }
  } finally {
    if (watch) await watch.stop();
    await desktop.close([...(scene ? [scene] : []), ...(other ? [other] : []), ...ballast]);
  }
  const md = [`Drop signals (drop-signals.mjs), ${family}, load ${load}, plan ${args.plan ?? 'main'}: ${rows.length} drags.`, ''];
  for (const table of [neverTakeTable(rows), afterReleaseTable(rows), acceptTable(rows), lateTakeTable(rows), coverTable(rows)]) md.push(...table.md, '');
  return { md, complete: true, failed: [] };
}
