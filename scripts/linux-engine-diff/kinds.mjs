// Which input kinds each family ignores on the background route (#171 M3.1; Design, Device mode and the foreground
// route; Decision Log, M3 pre-flight). M0.4's matrix measured clicks, keys and text; this measures what it did not,
// scroll and the pointer move, in every family, with the click alongside, where the family has a reader for it, as
// the reference for the cover condition. Drags are drag.mjs's, which also runs here's occlusions and control lane. A kind shown ignored is
// listed in families.rs with the run that showed it; a kind not shown ignored stays on the background route.
//
// Per family and kind, every lane sends the same request `--trials` times (10 by default) to its own window of the
// family, each in a witness span, and the effect is read back:
// - `pinned`, `newest`: the vendor builds, over the wire;
// - `cua`: cua-engine as it ships, in shared mode (a listed kind refuses, so a run measuring a kind before listing it
//   uses the build before the listing, or the kind is already decided);
// - `xtest`: the control. The window activated (`xdotool windowactivate`), then cua-engine's windowless request at the
//   same point in root coordinates, through XTEST: the foreground route's mechanics. A cell where the control takes
//   effect and the background lanes do not is a kind the family ignores; a cell where the control misses too says the
//   reader or the target, not the family, and decides nothing.
//
// Occlusions (`--occlusion`): `covered` (the front window over the whole screen), `visible` (each window raised above
// the others, the front window in a corner), `partial` (each window raised, the front window over its bottom half,
// every target point in the top half) and `partial-deep` (over its bottom 70%, every target point in the top 30%).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { DRAG_DOC, verticalScrollBar } from './drag.mjs';
import { Engine } from './engine.mjs';
import { FAMILIES, familyNames, openFamily, readGtk4Status, readQtCounts } from './families.mjs';
import { Oracle } from './oracle.mjs';
import { captureWindow, pixelsChanged } from './pixels.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE } from './scenes.mjs';
import { startWitness } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The kinds each family runs. Browsers show pages/input.html, whose status counts pointer moves, presses and the scroll. */
// A pointer move's effect: the page's or the GTK 4 scene's motion count, a terminal's motion report (mouse reporting
// 1003, every motion), and elsewhere a toolbar button's hover highlight, read as pixels: the moves alternate between
// the button and the middle of the window, so each changes what is highlighted (gnome-text-editor's GTK 4 is the
// GTK 4 scene's, whose motion count reads it directly).
export const KIND_FAMILIES = {
  chrome: ['scroll', 'move', 'click'],
  firefox: ['scroll', 'move', 'click'],
  electron: ['scroll', 'move', 'click'],
  gedit: ['scroll', 'move'],
  'gnome-text-editor': ['scroll'],
  'gtk4-input': ['scroll', 'move', 'click'],
  kate: ['scroll', 'move'],
  qtcreator: ['scroll', 'move'],
  writer: ['scroll', 'move'],
  'writer-gen': ['scroll', 'move'],
  xterm: ['scroll', 'move'],
  'xterm-allow': ['scroll', 'move'],
  'gnome-terminal': ['scroll', 'move'],
  'qt5-input': ['scroll', 'move', 'click'],
  'qt6-input': ['scroll', 'move', 'click'],
  'qt5-breeze': ['move'],
  'qt5-fusion': ['move'],
};

/**
 * Writer's first toolbar's first button (New), window-relative, from a capture of each (M3.1): gen has no tree, and
 * Writer through gtk3 reports its objects' extents about 24 px above where it draws them.
 */
export const WRITER_BUTTONS = { writer: { x: 18, y: 45 }, 'writer-gen': { x: 15, y: 33 } };
/** The Qt style scene's auto-raise tool button, window-relative (pages/qt-input.py). */
export const QT_TOOL_BUTTON = { x: 50, y: 30 };
/** A hover took effect when more pixels than this changed (a caret's few dozen do not count). */
export const HOVER_PIXELS = 40;

const BROWSERS = ['chrome', 'firefox', 'electron'];
/** A scroll's pixels: three wheel steps. */
export const SCROLL_PIXELS = 300;

/** The lanes, narrowed by `--lanes` (cua and the control always run). */
export function kindLanes(args) {
  const all = [
    { label: 'pinned', bin: args.vendor, args: [] },
    ...(args.newest ? [{ label: 'newest', bin: args.newest, args: [] }] : []),
    { label: 'cua', bin: args.cua, args: [] },
    { label: 'xtest', bin: args.cua, args: [], control: true },
  ];
  if (!args.lanes) return all;
  for (const label of ['cua', 'xtest']) if (!args.lanes.includes(label)) throw new Error(`the kinds lanes need ${label}`);
  return all.filter((l) => args.lanes.includes(l.label));
}

// ---------------------------------------------------------------------------------------------------------------
// judgements (pure)

/** Whether a scroll moved the content its way: a position grew going down and shrank going up. */
export function scrolled(direction, before, after) {
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  return direction === 'down' ? after > before : after < before;
}

/** Whether a terminal's program received a pointer motion: a mode-1003 report with no button down (`C`, 32 + 32 + 3). */
export function motionReported(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return null;
  return /\x1b\[MC/.test(after.slice(before.length));
}

/**
 * Whether a terminal's program received a wheel event: a mouse report (`ESC [ M`, mode 1000) of button 4 or 5, whose
 * button byte is 32 + 64 + 0 or 1 (`` ` `` or `a`), in what it received since `before`.
 */
export function wheelReported(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return null;
  const fresh = after.slice(before.length);
  return /\x1b\[M[`a]/.test(fresh);
}

/** A count that grew. */
export const grew = (before, after) => (typeof before === 'number' && typeof after === 'number' ? after > before : null);

/**
 * A cell's verdict from its lanes' runs: `ignored` when the control took every run and no background lane took any;
 * `taken` when cua took every run; `undecided` otherwise (the control missed, so the reader decides nothing, or the
 * background lanes took some runs and missed others).
 */
export function cellVerdict(runs, n) {
  const took = (lane) => runs.filter((r) => r.engine === lane && r.took === true).length;
  const background = [...new Set(runs.map((r) => r.engine))].filter((l) => l !== 'xtest');
  if (took('xtest') === n && background.every((l) => took(l) === 0)) return 'ignored';
  if (took('cua') === n) return 'taken';
  return 'undecided';
}

// ---------------------------------------------------------------------------------------------------------------
// the targets and the readers

/** Where a kind's request points, window-relative, for run `i`; and what reads its effect. */
function target(scene, kind, i) {
  const w = scene.window;
  if (scene.kindOf === 'page') {
    // the page's pad (pages/input.html): the top 300 px of the page, below the browser's own bars
    if (kind === 'move') return { x: i % 2 ? 700 : 300, y: 200 };
    return { x: 520, y: 200 };
  }
  if (scene.kindOf === 'gtk4-input') {
    const { button, list } = FAMILIES['gtk4-input'].places;
    if (kind === 'click') return button;
    if (kind === 'move') return { x: i % 2 ? 400 : 200, y: list.y };
    return list;
  }
  if (scene.kindOf === 'qt-input') return { x: kind === 'move' && i % 2 ? 400 : 200, y: 200 };
  if (scene.kindOf === 'terminal') {
    // a move to a cell of its own each run
    if (kind === 'move') return { x: i % 2 ? 100 : 300, y: Math.round(w.height / 2) };
    return { x: Math.round(w.width / 2), y: Math.round(w.height / 2) };
  }
  // an editor or a document: a move alternates between a toolbar button and the middle of the window
  if (kind === 'move' && i % 2 === 0) return scene.hover;
  return { x: Math.round(w.width / 2), y: Math.round(w.height / 2) };
}

/** A toolbar button near the window's top to hover, window-relative: from the tree, or Writer through gen's fixed one. */
export async function hoverTarget(desktop, oracle, scene) {
  if (WRITER_BUTTONS[scene.family]) return WRITER_BUTTONS[scene.family];
  if (scene.kindOf === 'qt-style') return QT_TOOL_BUTTON;
  const { preorder } = await import('./normalize.mjs');
  const nodes = scene.source === 'at_spi' ? preorder((await desktop.state(scene)).ax_tree) : scene.frame ? oracle.walk(scene.frame, { prune: ['menu', 'popup menu'] }) : [];
  const w = scene.window;
  for (const n of nodes.filter((x) => ['push button', 'toggle button'].includes(x.role))) {
    try {
      const e = oracle.extents(n.id);
      if (e.w >= 12 && e.h >= 12 && e.x >= w.x && e.x + e.w <= w.x + w.width && e.y >= w.y && e.y + e.h <= w.y + 200) return { x: Math.round(e.x - w.x + e.w / 2), y: Math.round(e.y - w.y + e.h / 2) };
    } catch {
      // not a component
    }
  }
  throw new Error(`${scene.label}: no toolbar button to hover`);
}

/** How many pixels of two captures differ (a channel by more than 32), the whole window compared. */
function pixelsOver(xprobe, a, b) {
  if (!a || !b) return null;
  const d = JSON.parse(execFileSync(xprobe, ['imgdiff', a, b, '0'], { encoding: 'utf8' }));
  return d.over;
}

/** The value a kind's effect is judged by: a scroll position, a count, a terminal's received bytes, or a capture. */
async function readValue(ctx, scene, kind) {
  const { desktop, oracle } = ctx;
  try {
    if (scene.kindOf === 'page') {
      const s = await desktop.inputStatus(scene);
      return kind === 'scroll' ? s.scroll : kind === 'move' ? s.moves : s.downs;
    }
    if (scene.kindOf === 'gtk4-input') {
      const s = await readGtk4Status(desktop, scene);
      return s === null ? null : kind === 'scroll' ? s.scroll : kind === 'move' ? s.moves : s.presses;
    }
    if (scene.kindOf === 'qt-input') {
      const s = readQtCounts(scene);
      return s === null ? null : kind === 'scroll' ? s.wheels : kind === 'move' ? s.moves : s.presses;
    }
    if (scene.kindOf === 'terminal') return readFileSync(scene.record, 'latin1');
    if (kind === 'move' || scene.pixels || !scene.scrollbar) return await captureWindow(ctx.cua, scene, ctx.dir);
    return Number(oracle.currentValue(scene.scrollbar));
  } catch {
    return null;
  }
}

/** Whether a run took effect, from the values before and after. */
function judge(scene, kind, input, before, after) {
  if (scene.kindOf === 'terminal') return kind === 'move' ? motionReported(before, after) : wheelReported(before, after);
  if (scene.kindOf === 'qt-input') return grew(before, after);
  if (kind === 'move' && !['page', 'gtk4-input'].includes(scene.kindOf)) {
    const over = pixelsOver(XPROBE, before, after);
    return over === null ? null : over > HOVER_PIXELS;
  }
  if (scene.pixels || (kind === 'scroll' && !['page', 'gtk4-input'].includes(scene.kindOf) && !scene.scrollbar)) return pixelsChanged(before, after);
  if (kind === 'scroll') return scrolled(input.direction, before, after);
  return grew(before, after);
}

/** The effect once it settles: two equal reads 150 ms apart after it changed, or 1.5 s; at most 2.5 s. */
async function settledEffect(read, decide) {
  const started = Date.now();
  await sleep(200);
  let last = await read();
  for (;;) {
    await sleep(150);
    const now = await read();
    const steady = JSON.stringify(now) === JSON.stringify(last);
    if ((steady && (decide(now) === true || Date.now() - started > 1500)) || Date.now() - started > 2500) return now;
    last = now;
  }
}

function request(scene, kind, i, point) {
  if (kind === 'scroll') return ['scroll', { direction: i % 2 === 0 ? 'down' : 'up', pixels: SCROLL_PIXELS, ...point }];
  if (kind === 'move') return ['move', point];
  return ['click', point];
}

// ---------------------------------------------------------------------------------------------------------------
// the run

async function series(ctx, spec, scene, kind, n) {
  const { witness, emit, family, desktop } = ctx;
  const engine = new Engine(spec).start();
  const runs = [];
  try {
    for (let i = 0; i < n; i++) {
      desktop.arrange(scene, ctx.occlusion);
      await sleep(300);
      const point = target(scene, kind, i);
      const [command, input] = request(scene, kind, i, point);
      const read = () => readValue(ctx, scene, kind);
      const before = await read();
      let sent;
      if (spec.control) {
        // the control: the window activated, then the same point in root coordinates through XTEST
        execFileSync('xdotool', ['windowactivate', '--sync', String(scene.id)]);
        await sleep(150);
        sent = await witness.span(`${spec.label}:${family}:${kind}`, () => engine.request(command, { ...input, x: scene.window.x + point.x, y: scene.window.y + point.y }));
      } else {
        sent = await witness.span(`${spec.label}:${family}:${kind}`, () => engine.request(command, { window: { id: scene.id }, ...input }));
      }
      const { value, witness: w } = sent;
      const ok = value.response.ok === true;
      const after = ok ? await settledEffect(read, (now) => judge(scene, kind, input, before, now)) : null;
      const took = ok ? judge(scene, kind, input, before, after) : false;
      const shown = (v) => (typeof v === 'string' && v.length > 80 ? `${v.length} bytes` : v);
      const run = { kind: 'kinds-run', family, input: kind, occlusion: ctx.occlusion, engine: spec.label, i, point, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), ms: Math.round(value.ms * 10) / 10, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, before: shown(before), after: shown(after), took };
      // a hover read as pixels: how many changed, for the record
      if (kind === 'move' && ok && typeof before === 'string' && before.endsWith('.jpg')) run.pixels_over = pixelsOver(XPROBE, before, after);
      // the Qt style scene: the hover events its tool button received so far, beside its highlight's pixels
      if (scene.kindOf === 'qt-style') run.hovers = readQtCounts(scene)?.hovers ?? null;
      emit(run);
      runs.push(run);
      if (spec.control) desktop.focusFront();
      // past the double-click time, so a click is a click of its own
      await sleep(kind === 'click' ? 700 : 300);
    }
  } finally {
    await engine.close();
  }
  return runs;
}

export async function runKinds(args, { desktop, emit }) {
  if (!args.vendor) throw new Error('the kinds experiment needs --vendor');
  if (!['covered', 'visible', 'partial', 'partial-deep', 'partial-top'].includes(args.occlusion)) throw new Error('--occlusion is covered, visible or partial(-deep, -top)');
  const names = familyNames(args.families?.length ? args.families : Object.keys(KIND_FAMILIES));
  const kindsAsked = args.ops && args.ops !== 'all' ? args.ops : null;
  const n = args.samplesTrials ?? 10;
  const lanes = kindLanes(args);
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront(args.occlusion === 'covered' ? 'covered' : 'visible');
  const witness = await startWitness(XPROBE);
  const md = [
    `Each lane sends the same request ${n} times per family and kind to its own window (${args.occlusion}); \`xtest\` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is ${SCROLL_PIXELS} px, down then up.`,
    '',
    `| family | kind | ${lanes.map((l) => `${l.label} took`).join(' | ')} | background witness | verdict |`,
    `|---|---|${lanes.map(() => '---:').join('|')}|---|---|`,
  ];
  const cells = [];
  const errors = [];
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    for (const family of names) {
      const kinds = (KIND_FAMILIES[family] ?? []).filter((k) => !kindsAsked || kindsAsked.includes(k));
      if (!kinds.length) continue;
      process.stdout.write(`family ${family}: ${kinds.join(', ')}\n`);
      const scenes = {};
      const ctx = { desktop, oracle, witness, emit, family, occlusion: args.occlusion, cua: args.cua, dir: desktop.dir };
      try {
        const page = BROWSERS.includes(family) ? 'input.html' : null;
        // gedit with classic scroll bars, as the drag experiment reads them
        const env = family === 'gedit' ? { GTK_OVERLAY_SCROLLING: '0' } : {};
        const geometry = family === 'firefox' ? FAMILIES.firefox.geometry : null;
        for (const l of lanes) {
          // a terminal runs its recorder (mouse reporting on), so a wheel event arrives as a report; a document long
          // enough to scroll everywhere else
          const doc = FAMILIES[family].kind === 'terminal' ? null : DRAG_DOC;
          // a terminal's recorder reports every motion (mode 1003) as well as the buttons and the wheel
          scenes[l.label] = await openFamily(desktop, oracle, family, `kinds${l.label.replace(/[^a-z0-9]+/gi, '')}`, { page, doc, env, geometry, motion: true });
          if (page) scenes[l.label].kindOf = 'page';
          // an editor's or a document's effect is its vertical scroll bar's value, where it has one
          if (!['terminal', 'gtk4-input', 'qt-input', 'qt-style'].includes(scenes[l.label].kindOf) && !page && !scenes[l.label].pixels) {
            scenes[l.label].scrollbar = await verticalScrollBar(desktop, oracle, scenes[l.label]).catch(() => null);
          }
          if (kinds.includes('move') && !page && !['terminal', 'gtk4-input', 'qt-input'].includes(scenes[l.label].kindOf)) scenes[l.label].hover = await hoverTarget(desktop, oracle, scenes[l.label]);
        }
        desktop.arrangeFront(args.occlusion === 'covered' ? 'covered' : 'visible');
        await sleep(1000);
        for (const kind of kinds) {
          const runs = [];
          for (const spec of lanes) runs.push(...(await series(ctx, spec, scenes[spec.label], kind, n)));
          const verdict = cellVerdict(runs, n);
          const took = Object.fromEntries(lanes.map((l) => [l.label, runs.filter((r) => r.engine === l.label && r.took === true).length]));
          const reader = scenes.cua.kindOf === 'qt-input' ? 'event counts' : scenes.cua.kindOf === 'terminal' ? (kind === 'move' ? 'motion report' : 'wheel report') : kind === 'move' && !['page', 'gtk4-input'].includes(scenes.cua.kindOf) ? 'hover pixels' : scenes.cua.pixels || (!['page', 'gtk4-input'].includes(scenes.cua.kindOf) && !scenes.cua.scrollbar) ? 'pixels' : scenes.cua.kindOf === 'page' ? 'page status' : scenes.cua.kindOf === 'gtk4-input' ? 'status line' : 'scroll bar value';
          const witnessClean = runs.filter((r) => r.engine !== 'xtest').every((r) => r.witness) ? 'clean' : '**changed**';
          const row = { kind: 'kinds-cell', family, input: kind, occlusion: args.occlusion, n, took, reader, verdict, background_witness: witnessClean };
          emit(row);
          cells.push(row);
          md.push(`| ${FAMILIES[family].title} | ${kind} (${reader}) | ${lanes.map((l) => `${took[l.label]}/${n}`).join(' | ')} | ${witnessClean} | ${verdict === 'ignored' ? '**ignored**' : verdict} |`);
          process.stdout.write(`${md.at(-1)}\n`);
        }
      } catch (error) {
        errors.push({ family, error: String(error.message ?? error).split('\n')[0].slice(0, 200) });
        emit({ kind: 'kinds-error', family, error: String(error.stack ?? error).slice(0, 1000) });
        process.stdout.write(`family ${family} failed: ${error.message}\n`);
        md.push(`| ${FAMILIES[family]?.title ?? family} | – | **failed: ${String(error.message).slice(0, 200)}** |`);
      } finally {
        await desktop.close(Object.values(scenes));
      }
    }
  } finally {
    await witness.stop();
  }
  const ignored = cells.filter((c) => c.verdict === 'ignored');
  md.push('', ignored.length ? `Ignored on the background route: ${ignored.map((c) => `${c.family} ${c.input}`).join('; ')}.` : 'No kind was shown ignored.');
  const undecided = cells.filter((c) => c.verdict === 'undecided');
  if (undecided.length) md.push(`Undecided (the control missed, or the background lanes took some runs): ${undecided.map((c) => `${c.family} ${c.input}`).join('; ')}.`);
  return { md, complete: errors.length === 0, failed: errors.map((e) => `${e.family}: ${e.error}`) };
}
