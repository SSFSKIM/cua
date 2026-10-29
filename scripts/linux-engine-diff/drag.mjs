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

import { execFileSync, spawn } from 'node:child_process';

import { Engine } from './engine.mjs';
import { FAMILIES, familyNames, openFamily } from './families.mjs';
import { preorder } from './normalize.mjs';
import { Oracle } from './oracle.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE } from './scenes.mjs';
import { median } from './stats.mjs';
import { startWitness } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
};

/**
 * The drag engines: the reference (the pinned build), the newest build (recorded beside it, not judged: its coarser
 * interpolation is not cua's), cua-engine as it ships (each drag paced by its target's family, families.rs),
 * cua-engine with every drag wait at zero (the check that decides the table), then the variants.
 */
export function dragEngines(args) {
  return [
    { label: 'pinned', bin: args.vendor, args: [] },
    ...(args.newest ? [{ label: 'newest', bin: args.newest, args: [] }] : []),
    { label: 'cua', bin: args.cua, args: [] },
    { label: 'cua:0ms', bin: args.cua, args: ['--drag-step-ms', '0', '--drag-press-dwell-ms', '0', '--drag-release-dwell-ms', '0'] },
    ...args.variants.map((v) => ({ ...v, bin: args.cua })),
  ];
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
 * Where a family's scene puts each kind's targets, found once when its window opens: the page's origin in the
 * window, the text whose characters a selection spans, the slider, the vertical scroll bar.
 */
async function locate(ctx, scene, kinds) {
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
  if (kinds.includes('select')) {
    if (scene.kindOf === 'terminal') at.text = { cell: xtermCell };
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
    // kate's window does not associate (the engines answer its X11 tree): its objects through the harness's own walk
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
    const { id, e } = bars[0];
    at.scrollbar = { id, extents: { ...e, x: e.x - origin.x, y: e.y - origin.y } };
  }
  return at;
}

/** A run's path, window-relative: `[{x, y}, ...]`. */
export function runPath(at, kind, i) {
  let points;
  if (at.page) points = pagePath(kind, i).map(([x, y]) => [x + at.page.x, y + at.page.y]);
  else if (kind === 'select') {
    const [a, b] = selectOffsets(i);
    points = [at.text.cell(a), at.text.cell(b)];
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
    dnd: { starts: num(line('dnd '), 'starts'), drops: num(line('dnd '), 'drops') },
    canvas: { strokes: num(line('canvas '), 'strokes'), moves: num(line('canvas '), 'moves'), dev: num(line('canvas '), 'dev') },
  };
}

function primary() {
  try {
    return execFileSync('xclip', ['-o', '-selection', 'primary'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** PRIMARY taken by the harness with a marker before a terminal's run, so a run that selects nothing reads as nothing. */
function claimPrimary() {
  const child = spawn('xclip', ['-i', '-selection', 'primary', '-loops', '1'], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
  child.stdin.end('cua171-none');
  child.unref();
}

/** The value a kind's effect is judged by. */
async function readEffect(ctx, scene, at, kind) {
  const { desktop, oracle } = ctx;
  if (at.page) {
    const nodes = preorder((await desktop.state(scene)).ax_tree);
    const status = parseDragStatus(nodes.flatMap((n) => [n.name, n.value, n.text].filter((s) => typeof s === 'string')));
    return kind === 'dnd' ? status.dnd : kind === 'canvas' ? status.canvas : status[kind];
  }
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
  } else if (!['dnd', 'canvas'].includes(kind)) {
    for (const parity of [0, 1]) {
      const values = runs.filter((r) => r.engine === 'pinned' && r.i % 2 === parity && r.ok && r.after !== null && r.after !== '' && !same(r.after, r.before)).map((r) => r.after);
      expected[parity] = values.length ? mode(values) : null;
    }
  }
  const took = (r) => {
    if (!r.ok || r.after === null || r.after === undefined) return false;
    if (kind === 'dnd') return r.after.drops === (r.before?.drops ?? -2) + 1;
    if (kind === 'canvas') return r.after.strokes === (r.before?.strokes ?? -2) + 1 && r.after.dev >= 0 && r.after.dev <= CANVAS_TOLERANCE;
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
 * every parity the runs use has one; a cell without it is recorded, not judged (`pass: null`).
 */
export function judgeCell(runs, lanes, expected = {}) {
  const pinnedRuns = runs.filter((r) => r.engine === 'pinned');
  const pinnedTook = pinnedRuns.filter((r) => r.took).length;
  const positions = [...new Set(pinnedRuns.map((r) => r.i))].sort((a, b) => a - b);
  const parities = [...new Set(runs.map((r) => r.i % 2))];
  const usable = pinnedTook > 0 && (Object.keys(expected).length === 0 || parities.every((p) => expected[p] !== null && expected[p] !== undefined));
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

async function series(ctx, spec, scene, at, kind, n) {
  const { witness, emit, family } = ctx;
  const engine = new Engine(spec).start();
  const runs = [];
  try {
    for (let i = 0; i < n; i++) {
      if (kind === 'select' && scene.kindOf === 'terminal') {
        // the marker must own PRIMARY before the drag: an xclip slow to start would take it after the selection
        claimPrimary();
        for (let tries = 0; primary() !== 'cua171-none' && tries < 50; tries++) await sleep(20);
      }
      const read = () => readEffect(ctx, scene, at, kind);
      // the page's scroller goes back to its top by itself; the drag waits for it
      if (kind === 'scroller') for (let tries = 0; (await read()) !== 0 && tries < 40; tries++) await sleep(200);
      const before = await read();
      const path = runPath(at, kind, i);
      const { value, witness: w } = await witness.span(`${spec.label}:${family}:drag:${kind}`, () => engine.request('drag', { window: { id: scene.id }, path }));
      const ok = value.response.ok === true;
      const after = ok ? await settled(read, before) : null;
      const run = { family, drag: kind, engine: spec.label, i, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), ms: Math.round(value.ms * 10) / 10, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, before, after, path };
      runs.push(run);
      // what the application changed (Chrome's drag and drop activates and restacks) is put back for the next run
      if (!w.clean) {
        if (ctx.occlusion === 'visible') ctx.desktop.raise(scene);
        else ctx.desktop.focusFront();
      }
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
  return names.flatMap((family) => (DRAG_FAMILIES[family] ?? []).filter((k) => !kindsAsked || kindsAsked.includes(k)).map((kind) => ({ family, kind })));
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

export async function runDrag(args, { desktop, emit }) {
  if (!args.vendor) throw new Error('the drag experiment needs --vendor (the pinned build is its reference)');
  const names = familyNames(args.families?.length ? args.families : Object.keys(DRAG_FAMILIES));
  const kindsAsked = args.ops && args.ops !== 'all' ? args.ops : null;
  const plan = dragPlan(names, kindsAsked);
  if (!plan.length) throw new Error(`no drag cell in families ${names.join(', ')} with kinds ${kindsAsked?.join(', ') ?? 'all'}: nothing to measure`);
  const n = args.samplesTrials ?? 30;
  const lanes = dragEngines(args);
  const cuaLanes = lanes.filter((l) => l.label.startsWith('cua')).map((l) => l.label);
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront(args.occlusion);
  const witness = await startWitness(XPROBE);
  const md = [
    `Every engine drags the same path ${n} times per family and kind, in its own window (${args.occlusion}), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). \`cua:0ms\` has no wait after a sample, after the press or before the release.`,
    '',
    `| family | kind | ${lanes.map((l) => `${l.label} took`).join(' | ')} | ${lanes.slice(1).map((l) => `${l.label} drag ms`).join(' | ')} | pinned drag ms | witness | verdict |`,
    `|---|---|${lanes.map(() => '---:').join('|')}|${lanes.slice(1).map(() => '---:').join('|')}|---:|---|---|`,
  ];
  const cells = [];
  const errors = [];
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    for (const family of names) {
      const kinds = plan.filter((p) => p.family === family).map((p) => p.kind);
      if (!kinds.length) continue;
      let measuring = null;
      process.stdout.write(`family ${family}: ${kinds.join(', ')}\n`);
      const scenes = {};
      const ctx = { desktop, oracle, witness, emit, family, occlusion: args.occlusion };
      try {
        // the browsers show the drag page; gedit gets classic scroll bars (GTK 3's overlay ones hide until hovered)
        const page = ['chrome', 'firefox', 'electron'].includes(family) ? PAGE : null;
        const env = family === 'gedit' ? { GTK_OVERLAY_SCROLLING: '0' } : {};
        for (const l of lanes) {
          // Firefox opens maximized unless its profile asks for a size, and a maximized window is under the front
          // window's corner, where Gecko ignores coordinate input (Device mode, `unless_unobscured`)
          const geometry = family === 'firefox' ? FAMILIES.firefox.geometry : null;
          scenes[l.label] = await openFamily(desktop, oracle, family, `drag${l.label.replace(/[^a-z0-9]+/gi, '')}`, { page, doc: DRAG_DOC, env, geometry });
          if (page) scenes[l.label].kindOf = 'page';
        }
        desktop.arrangeFront(args.occlusion);
        await sleep(1000);
        const at = {};
        for (const l of lanes) {
          if (args.occlusion === 'visible') desktop.raise(scenes[l.label]);
          at[l.label] = await locate(ctx, scenes[l.label], kinds);
        }
        for (const [k, kind] of kinds.entries()) {
          measuring = kind;
          const runs = [];
          // the lanes rotate per kind, so no lane always goes first
          const order = [...lanes.slice(k % lanes.length), ...lanes.slice(0, k % lanes.length)];
          for (const spec of order) {
            if (args.occlusion === 'visible') desktop.raise(scenes[spec.label]);
            runs.push(...(await series(ctx, spec, scenes[spec.label], at[spec.label], kind, n)));
            desktop.focusFront();
          }
          const judged = judgeRuns(kind, runs);
          for (const r of judged.runs) emit({ kind: 'drag-run', ...r });
          const cell = judgeCell(judged.runs, cuaLanes, judged.expected);
          const ms = (label) => median(judged.runs.filter((r) => r.engine === label && r.ok).map((r) => r.ms));
          const row = { kind: 'drag-cell', family, drag: kind, expected: judged.expected, ...cell, ms: Object.fromEntries(lanes.map((l) => [l.label, ms(l.label)])) };
          emit(row);
          cells.push(row);
          const took = (label) => `${judged.runs.filter((r) => r.engine === label && r.took).length}/${n}`;
          const verdict = !cell.reference ? (cell.pinned_took === 0 ? 'no pinned effect: not judged' : 'no usable pinned reference: not judged') : cuaLanes.map((l) => `${l} ${cell.lanes[l].pass ? 'PASS' : `**misses ${cell.lanes[l].misses.length}${cell.lanes[l].witness || !cell.pinned_witness ? '' : ', witness changed'}**`}`).join(', ');
          const witnessClean = judged.runs.every((r) => r.witness) ? 'clean' : '**changed**';
          const f = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : '–');
          md.push(`| ${FAMILIES[family].title} | ${kind} | ${lanes.map((l) => took(l.label)).join(' | ')} | ${lanes.slice(1).map((l) => f(row.ms[l.label])).join(' | ')} | ${f(row.ms.pinned)} | ${witnessClean} | ${verdict} |`);
          process.stdout.write(`${md.at(-1)}\n`);
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
  return { md, ...dragCompleteness(plan, cells, errors) };
}
