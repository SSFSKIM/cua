// T19's sitting (#171 M4, T19 (#353); the design session, 2026-11-10; Decision Log, "T15 closed as superseded; T19
// added"): what an application does with background pointer input, by where the real pointer is. T15's probe found that
// Firefox takes background moves, drags, clicks and scrolls only while the real pointer is in its window, on private
// displays; M0.4 had found on `:0` that Firefox ignores clicks while fully covered and takes them visible, without
// recording where the pointer was. This experiment reconciles the two on `:0` before T19 builds anything, and on a
// private display for its dry run. Measured, never judged: every count is a finding.
//
// The cells cross where the real pointer is (`in` the window's visible part, `under` a cover inside the window's
// geometry, `out` of the window's geometry), the window's occlusion (`visible`, `partial`: a managed window over its
// bottom half, `covered`: one over the whole screen), each combination that exists (`OCCLUSION_PARKS`), and four
// pointer kinds: a click, a scroll, a move and a drag (a text selection). Every request's points lie in the window's
// part the occlusion leaves visible, where there is one, so the pointer, and not the points, is what differs.
//
// Firefox is the subject, through cua and the pinned build; Chrome, Electron and gedit (GTK 3) are the controls,
// through cua, to learn whether their routes depend on the pointer too. cua's lane runs with `--ignore-cover`, so no
// cover rule of cua's refuses a request and what is counted is the application's answer, not cua's.
//
// The real pointer is parked before every run (`parkFor`) and read again just before every request, with what lies
// under it (`pointerRecord`). A park goes only onto the root or a live window of the run's, read at its point just
// before the move (scenes.mjs `pointerSafeAt`): a park point over another's window stops the run unmoved.

import { PAGE as DRAG_PAGE, DRAG_DOC, locate, selectionCovers, series as dragSeries, verticalScrollBar } from './drag.mjs';
import { FAMILIES, openFamily } from './families.mjs';
import { hoverTarget, series as kindSeries } from './kinds.mjs';
import { Oracle } from './oracle.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE, xdotool } from './scenes.mjs';
import { startWitness } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The runs of a cell, each lane. */
export const ROUTE_RUNS = 10;

/** Where the real pointer may be in each occlusion: a window fully covered has no visible part to be in. */
export const OCCLUSION_PARKS = {
  visible: ['in', 'out'],
  partial: ['in', 'under', 'out'],
  covered: ['under', 'out'],
};

/** The families and the lanes each runs: the subject beside the pinned build, the controls through cua alone. */
export const ROUTE_FAMILIES = {
  firefox: ['cua', 'pinned'],
  chrome: ['cua'],
  electron: ['cua'],
  gedit: ['cua'],
};

/** The kinds, by the scene each needs: the input page's (or gedit's) click, scroll and move; the drag page's selection. */
export const ROUTE_GROUPS = [
  { group: 'input', kinds: ['click', 'scroll', 'move'] },
  { group: 'drag', kinds: ['select'] },
];

const BROWSERS = ['firefox', 'chrome', 'electron'];

/** Every cell of a sitting, in its order: by family, then scene group, occlusion, pointer place and kind. */
export function routePlan(families = Object.keys(ROUTE_FAMILIES), kindsAsked = null) {
  const cells = [];
  for (const family of families) {
    if (!ROUTE_FAMILIES[family]) throw new Error(`the pointer-route sitting has no family ${family}; its families are ${Object.keys(ROUTE_FAMILIES).join(', ')}`);
    for (const { group, kinds } of ROUTE_GROUPS) {
      for (const [occlusion, parks] of Object.entries(OCCLUSION_PARKS)) {
        for (const park of parks) {
          for (const kind of kinds.filter((k) => !kindsAsked || kindsAsked.includes(k))) cells.push({ family, group, kind, occlusion, park });
        }
      }
    }
  }
  return cells;
}

export const cellKey = (c) => `${c.family} ${c.kind} ${c.occlusion} pointer-${c.park}`;

/** The lanes of a family: cua with no cover rule of its own in the way, and the pinned build where the family has it. */
export function routeLanes(family, args) {
  return ROUTE_FAMILIES[family].map((label) => (label === 'pinned' ? { label, bin: args.vendor, args: [] } : { label, bin: args.cua, args: ['--ignore-cover'] }));
}

/** The front window's middle in its corner in the visible arrangement (scenes.mjs `arrangeFront`), outside every scene. */
export const OUT_POINT = { x: 1170, y: 715 };

/**
 * The real pointer's park point for a run, in root coordinates, from the scene window's place (`{x, y, width, height}`):
 * `in`, a point of the window's top part no request aims at (its upper right); `under`, a point of its geometry under
 * the cover (its lower right; the partial cover is over the bottom half); `out`, the front window's middle, outside
 * the window's geometry in every occlusion.
 */
export function parkPoint(window, park) {
  if (park === 'in') return { x: window.x + Math.round(window.width * 0.7), y: window.y + 110 };
  if (park === 'under') return { x: window.x + Math.round(window.width * 0.7), y: window.y + Math.round(window.height * 0.85) };
  if (park === 'out') return { ...OUT_POINT };
  throw new Error(`no park ${park}`);
}

const inside = (p, w) => p.x >= w.x && p.x < w.x + w.width && p.y >= w.y && p.y < w.y + w.height;

/**
 * Where a pointer is, from its place and the top window there (`xprobe top-at`'s `{top, holds}` among the scene, the
 * cover and the run's other windows): `scene` (the scene's window holds it), `cover` (the front window, inside the
 * scene's geometry), `harness` (another window of the run's, or the front window outside the scene), `root` (no window)
 * or `foreign` (a window the run did not open).
 */
export function placeOf(point, { scene, front, ours }, { top, holds }) {
  if (!top) return 'root';
  if (holds === scene.id) return 'scene';
  if (holds === front) return inside(point, scene.window) ? 'cover' : 'harness';
  return ours.includes(holds) ? 'harness' : 'foreign';
}

/** The place a park must find under its point at the request: `in` the scene, `under` the cover, `out` not the scene. */
export function parkHeld(park, where, point, window) {
  if (park === 'in') return where === 'scene';
  if (park === 'under') return where === 'cover' && inside(point, window);
  return !inside(point, window) && ['harness', 'root'].includes(where);
}

/**
 * Whether a selection drag took, whatever the engine answered (the sitting reads a refused drag's effect too): the
 * selection, read after it, is the stretch of the line its path spans (drag.mjs
 * `selectionCovers`), and on a page the press reached the page (`received`, the drag's own motion record). A page
 * shows the selection with its spaces as `_`. gedit's selection is cleared before each run, so an old one cannot count.
 */
export function selectTook(run, page) {
  if (typeof run.after !== 'string') return false;
  if (page && !run.received) return false;
  return selectionCovers(page ? run.after.replaceAll('_', ' ') : run.after, run.i);
}

/**
 * One cell's counts per lane, from its runs: taken, answered ok, answered ok with no effect (the false success T19 is
 * for), witness changes, and how often the park held.
 */
export function cellCounts(runs) {
  const lanes = {};
  for (const r of runs) {
    const c = (lanes[r.engine] ??= { n: 0, took: 0, ok: 0, ok_no_effect: 0, witness_changed: 0, park_held: 0 });
    c.n++;
    if (r.took === true) c.took++;
    if (r.ok === true) c.ok++;
    if (r.ok === true && r.took !== true) c.ok_no_effect++;
    if (r.witness === false) c.witness_changed++;
    if (r.pointer?.held === true) c.park_held++;
  }
  return lanes;
}

/** The summary's table, one row a cell. */
export function routeMarkdown(rows) {
  const lane = (row, label) => {
    const c = row.lanes[label];
    if (!c) return '–';
    const notes = [c.ok < c.n ? `${c.n - c.ok} not ok` : null, c.ok_no_effect ? `${c.ok_no_effect} ok with no effect` : null, c.witness_changed ? `witness ${c.witness_changed}` : null, c.park_held < c.n ? `park missed ${c.n - c.park_held}` : null].filter(Boolean);
    return `${c.took}/${c.n}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  };
  return [
    '| family | kind | occlusion | pointer | cua took | pinned took |',
    '|---|---|---|---|---:|---:|',
    ...rows.map((r) => `| ${FAMILIES[r.family]?.title ?? r.family} | ${r.kind} | ${r.occlusion} | ${r.park} | ${lane(r, 'cua')} | ${lane(r, 'pinned')} |`),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// the pointer

/** The real pointer's place on the screen, and the client window xdotool finds under it. */
export function pointerAt(tool = xdotool) {
  const out = tool('getmouselocation', '--shell');
  const get = (k) => Number(out.match(new RegExp(`^${k}=(-?\\d+)`, 'm'))?.[1]);
  return { x: get('X'), y: get('Y'), window: get('WINDOW') };
}

/** The ids the run's windows have now: every registered one, the front and the holder included. */
const ownIds = (desktop) => desktop.windows.map((w) => w.id).filter((id) => Number.isSafeInteger(id) && id > 0);

/** The pointer now, what lies under it, and whether that is where the run's park put it. */
function pointerRecord(desktop, state) {
  const at = pointerAt();
  const ours = ownIds(desktop);
  const top = desktop.topAt(at, ours);
  const where = placeOf(at, { scene: state.scene, front: desktop.front.id, ours }, top);
  return { x: at.x, y: at.y, window: at.window, top: top.top, holds: top.holds ?? null, where, park: state.park, held: parkHeld(state.park, where, at, state.scene.window) };
}

/**
 * The real pointer parked for the run's place, only onto the root or a window of the run's, and only when it is not
 * there already (a motion to the pointer's own place still reaches the application, T9); then read back, at most 1 s.
 */
async function parkFor(desktop, state) {
  const point = parkPoint(state.scene.window, state.park);
  if (!desktop.pointerSafeAt(point)) throw new Error(`the park point (${point.x}, ${point.y}) is over a window the run did not open: the sitting stops unmoved`);
  const here = (p) => p.x === point.x && p.y === point.y;
  if (here(pointerAt())) return;
  xdotool('mousemove', point.x, point.y);
  for (let tries = 0; !here(pointerAt()) && tries < 50; tries++) await sleep(20);
}

/**
 * The desktop and the witness the series see: `arrange` puts the window in its occlusion, then parks the pointer, and
 * clears gedit's selection before a selection run; each witness span first records where the pointer is.
 */
function instrumented(desktop, witness, oracle, state) {
  const arrange = async (scene, occlusion) => {
    desktop.arrange(scene, occlusion);
    await parkFor(desktop, state);
    if (state.clearSelection) oracle.setCaret(state.clearSelection, 0);
  };
  const seenDesktop = new Proxy(desktop, {
    get(target, prop) {
      if (prop === 'arrange') return arrange;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const seenWitness = {
    ...witness,
    span: (tag, fn) => {
      state.requests.push(pointerRecord(desktop, state));
      return witness.span(tag, fn);
    },
  };
  return { seenDesktop, seenWitness };
}

// ---------------------------------------------------------------------------------------------------------------
// the run

/**
 * Where a kind's request points in gedit, window-relative, kept in the window's top part, which the partial cover leaves
 * visible: its scroll, and its move's second point (the first is a toolbar button, kinds.mjs); its click is kinds.mjs's.
 */
function pointFor(scene, kind, i) {
  if (scene.kindOf !== 'editor') return null;
  const top = { x: Math.round(scene.window.width / 2), y: Math.round(scene.window.height * 0.3) };
  if (kind === 'scroll' || (kind === 'move' && i % 2 === 1)) return top;
  return null;
}

/** A family's window of the group, one a lane, ready for its kinds. */
async function openGroup(desktop, oracle, family, group, label) {
  const page = BROWSERS.includes(family) ? (group === 'drag' ? DRAG_PAGE : 'input.html') : null;
  // gedit with classic scroll bars (GTK 3's overlay ones hide until hovered), on the drag scene's long document
  const env = family === 'gedit' ? { GTK_OVERLAY_SCROLLING: '0' } : {};
  const geometry = family === 'firefox' ? FAMILIES.firefox.geometry : null;
  const scene = await openFamily(desktop, oracle, family, `route${group}${label}`, { page, doc: page ? null : DRAG_DOC, env, geometry });
  if (page) scene.kindOf = 'page';
  if (group === 'input' && !page) {
    scene.scrollbar = await verticalScrollBar(desktop, oracle, scene).catch(() => null);
    scene.hover = await hoverTarget(desktop, oracle, scene);
  }
  return scene;
}

export async function runPointerRoute(args, { desktop, emit }) {
  if (!args.vendor) throw new Error('the pointer-route sitting needs --vendor (the pinned build beside cua on Firefox)');
  const families = args.families?.length ? args.families : Object.keys(ROUTE_FAMILIES);
  const kindsAsked = args.ops && args.ops !== 'all' ? args.ops : null;
  const plan = routePlan(families, kindsAsked);
  if (!plan.length) throw new Error('no pointer-route cell to measure');
  const n = args.samplesTrials ?? ROUTE_RUNS;
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront('visible');
  const witness = await startWitness(XPROBE);
  const started = pointerAt();
  emit({ kind: 'pointer-route-start', pointer: started, runs: n, cells: plan.length });
  const state = { scene: null, park: null, clearSelection: null, requests: [] };
  const { seenDesktop, seenWitness } = instrumented(desktop, witness, oracle, state);
  const rows = [];
  const errors = [];
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    for (const family of [...new Set(plan.map((c) => c.family))]) {
      const lanes = routeLanes(family, args);
      for (const { group } of ROUTE_GROUPS) {
        const cells = plan.filter((c) => c.family === family && c.group === group);
        if (!cells.length) continue;
        process.stdout.write(`family ${family}, ${group}: ${cells.length} cells\n`);
        const scenes = {};
        const at = {};
        try {
          for (const l of lanes) scenes[l.label] = await openGroup(desktop, oracle, family, group, l.label.replace(/[^a-z0-9]+/gi, ''));
          desktop.arrangeFront('visible');
          await sleep(1000);
          if (group === 'drag') {
            for (const l of lanes) {
              desktop.raise(scenes[l.label]);
              at[l.label] = await locate({ desktop, oracle }, scenes[l.label], ['select']);
            }
          }
          // each lane's runs alternate their paths from one cell to the next
          const next = Object.fromEntries(lanes.map((l) => [l.label, 0]));
          for (const c of cells) {
            process.stdout.write(`cell ${cellKey(c)}\n`);
            const runs = [];
            for (const spec of lanes) {
              const scene = scenes[spec.label];
              Object.assign(state, { scene, park: c.park, requests: [], clearSelection: group === 'drag' && scene.kindOf === 'editor' ? at[spec.label].text.id : null });
              const ctx = { desktop: seenDesktop, oracle, witness: seenWitness, emit, family, occlusion: c.occlusion, cua: args.cua, dir: desktop.dir, pointFor };
              const own = group === 'drag' ? await dragSeries(ctx, spec, scene, at[spec.label], 'select', n, { start: next[spec.label], readFailed: true }) : await kindSeries(ctx, spec, scene, c.kind, n);
              next[spec.label] += n;
              own.forEach((r, k) => {
                r.pointer = state.requests[k] ?? null;
                if (group === 'drag') r.took = selectTook(r, scene.kindOf === 'page');
                const row = { ...r, kind: 'pointer-route-run', case: cellKey(c), family, input: c.kind, occlusion: c.occlusion, park: c.park, engine: spec.label };
                emit(row);
                runs.push(row);
              });
              desktop.focusFront();
            }
            const row = { kind: 'pointer-route-cell', ...c, lanes: cellCounts(runs) };
            emit(row);
            rows.push(row);
            process.stdout.write(`${routeMarkdown([row]).at(-1)}\n`);
          }
        } catch (error) {
          errors.push(`${family} ${group}: ${String(error.message ?? error).split('\n')[0].slice(0, 200)}`);
          emit({ kind: 'pointer-route-error', family, group, error: String(error.stack ?? error).slice(0, 1000) });
          process.stdout.write(`${family} ${group} failed: ${error.message}\n`);
          // a park point over another's window stops the sitting: nothing more moves the pointer
          if (/the sitting stops/.test(String(error.message))) throw error;
        } finally {
          await desktop.close(Object.values(scenes));
        }
      }
    }
  } finally {
    await witness.stop();
    emit({ kind: 'pointer-route-end', pointer: pointerAt(), started });
  }
  const missed = rows.filter((r) => Object.values(r.lanes).some((c) => c.park_held < c.n));
  const md = [
    `T19's sitting (pointer-route.mjs): each cell ${n} runs a lane, the real pointer parked before each run and read before each request; cua's lane with \`--ignore-cover\`, so the counts are the application's. Occlusions: \`visible\` (raised, nothing over it), \`partial\` (a window over its bottom half), \`covered\` (a window over the whole screen). Pointer: \`in\` the window's visible part, \`under\` the cover inside its geometry, \`out\` of its geometry, on the front window.`,
    '',
    ...routeMarkdown(rows),
    '',
    missed.length ? `The park did not hold at every request in: ${missed.map((r) => cellKey(r)).join('; ')}.` : 'The park held at every request.',
  ];
  return { md, complete: errors.length === 0, failed: errors };
}
