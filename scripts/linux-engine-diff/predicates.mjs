// The adopted predicate cases (#171 M4, T15; Decision Log, M4 pre-flight, "The gate"): the manifest of the occlusions
// a loosened refusal now lets through, each with its effect and witness, and of the counterexamples it still refuses,
// with their counts. A predicate that loosens a refusal is a new way to send input the person might see, so the gate
// proves each case it allows, and a case the run did not measure fails it, as a missing operation does.
//
// T15 judged Gecko's Move and Drag at their points (families.rs Gecko, `unless_path_unobscured`; cover.rs
// `points_unobscured`): a move into a Firefox window that is not fully unobscured takes the background route when its
// point is visible in the window, and a drag when every point of its path is, where before any cover refused both.
// Its scroll and its coordinate clicks keep the window's rule (`unless_unobscured`). Chromium's drags kept their rule,
// and no start-role condition was adopted: T13 measured that no part of a Chromium covered path decides on a private
// display and that no start role predicts anything (`m4/drop-signals/`).
//
// Each case is one family, kind and occlusion (`PREDICATE_CASES`), measured on its own windows of the family, one a
// lane, each request in a witness span, the effect read back as the kinds experiment (a move: the page's motion count)
// and the drag experiment (a selection, a range, a scrollbar thumb, a drop, a canvas stroke) read it:
// - `cua`, as it ships, in shared mode: an allowed case takes effect on every run, answered ok, with the witness
//   unchanged; a refused case answers the Device mode sentence on every run, with the witness unchanged and nothing
//   taking effect;
// - `pinned`, the reference: the drag judges' values come from its runs, and its counts stand beside every case;
// - `cua:any-cover` (`--drag-ignore-cover`, measurement only) on a refused move or drag: cua's own events sent with
//   the cover left unjudged, the count of what the refusal keeps from being sent.
//
// The occlusions (`OCCLUSIONS`) are the kinds and drag experiments' (scenes.mjs `arrange`: a managed window over part
// of the scene window) and two more arranged here: an override-redirect window over the window's bottom-right corner,
// clear of every path (`overlay`), and the window's right fifth off the screen (`offscreen`). Each newly allowed
// occlusion also refuses a click and a scroll (the window's rule), which shows the window was not fully unobscured.

import { startOverlay } from './clip.mjs';
import { DEVICE_REFUSAL } from './deviations.mjs';
import { PAGE as DRAG_PAGE, series as dragSeries, judgeRuns, locate } from './drag.mjs';
import { FAMILIES, openFamily } from './families.mjs';
import { series as kindSeries } from './kinds.mjs';
import { Oracle } from './oracle.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE, configure, xdotool } from './scenes.mjs';
import { startWitness } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The runs of an allowed case, every one of which must take effect (the row's proof: 30 of 30). */
export const ALLOWED_RUNS = 30;
/** The runs of a still-refused counterexample: each answers the refusal, whatever the lanes beside it did. */
export const REFUSED_RUNS = 10;

/** The occlusions, as each case's request meets its window (`arrangeCase`). */
export const OCCLUSIONS = {
  visible: 'the window raised, nothing over it (the pointer probe)',
  partial: 'a managed window over the bottom half of the window',
  'partial-deep': 'a managed window over its bottom 70%',
  'partial-top': 'a managed window over its top 55%',
  overlay: "an override-redirect window over its bottom-right corner, clear of every case's points",
  offscreen: 'its right fifth off the screen, nothing over it',
  covered: 'a managed window over the whole screen',
};

/** The kinds a move case and a drag case read: `move` the page's motion count (pages/input.html), the drags drag.html's. */
export const MOVE_KINDS = ['move', 'click', 'scroll'];
export const DRAG_KINDS = ['select', 'range', 'scroller', 'dnd', 'canvas'];

const allowed = (occlusion, kinds, why) => kinds.map((kind) => ({ family: 'firefox', kind, occlusion, expect: 'allowed', why }));
const refused = (occlusion, kinds, why) => kinds.map((kind) => ({ family: 'firefox', kind, occlusion, expect: 'refused', why }));
const WINDOW_RULE = "Gecko's scroll and click keep the window's rule (unless_unobscured): the window is not fully unobscured";
const COVERED_POINT = 'a point the request sends is under the cover (unless_path_unobscured)';

/**
 * The manifest. Where the drag page's paths lie in a 1050-wide Firefox window (drag.mjs `pagePath`, the page about 85
 * px below the window's top): select near y 117, range 167, scroller 245-305, dnd 240-255, canvas 455-615; a move
 * (kinds.mjs) at y 200, x 300 or 700. So a bottom-half cover (from y 390) leaves every path but the canvas visible, a
 * bottom-70% cover (from 234) leaves the move, the selection and the range, and a top-55% cover (to 429) leaves only
 * the canvas.
 */
export const PREDICATE_CASES = [
  ...allowed('partial', ['move', 'select', 'range', 'scroller', 'dnd'], 'every point visible in the window'),
  ...refused('partial', ['canvas'], COVERED_POINT),
  ...refused('partial', ['click', 'scroll'], WINDOW_RULE),
  ...allowed('partial-deep', ['move', 'select', 'range'], 'every point visible in the window'),
  ...refused('partial-deep', ['scroller', 'dnd', 'canvas'], COVERED_POINT),
  ...refused('partial-deep', ['click', 'scroll'], WINDOW_RULE),
  ...allowed('partial-top', ['canvas'], 'every point visible in the window'),
  ...refused('partial-top', ['move', 'select', 'range', 'scroller', 'dnd'], COVERED_POINT),
  ...refused('partial-top', ['click', 'scroll'], WINDOW_RULE),
  ...allowed('overlay', ['move', ...DRAG_KINDS], 'every point visible in the window'),
  ...refused('overlay', ['click', 'scroll'], WINDOW_RULE),
  ...allowed('offscreen', ['move', ...DRAG_KINDS], 'every point on the screen and visible'),
  ...refused('offscreen', ['click', 'scroll'], WINDOW_RULE),
  ...refused('covered', ['move', ...DRAG_KINDS], COVERED_POINT),
];

/**
 * The pointer probe (`--plan pointer`, measured, never judged): what Gecko takes from cua's own background events (the
 * cover left unjudged, `cua:any-cover`) with the real pointer parked in the window's visible part (`park: 'in'`) or
 * outside the window (`'out'`), at visible and at covered points, so the plan tells the point's part from the pointer's.
 */
const probe = (occlusion, kinds, park) => kinds.map((kind) => ({ family: 'firefox', kind, occlusion, park, expect: 'probe', why: `the real pointer ${park === 'in' ? 'in the window' : 'outside it'}` }));
export const POINTER_PROBE = [
  ...probe('visible', ['move', 'select', 'canvas'], 'out'),
  ...probe('partial-deep', ['move', 'range'], 'in'),
  ...probe('partial-deep', ['move', 'range'], 'out'),
  ...probe('partial-top', ['move', 'range', 'canvas'], 'in'),
  ...probe('partial-top', ['move', 'range', 'canvas'], 'out'),
  ...probe('partial', ['move', 'select', 'canvas'], 'in'),
  ...probe('partial', ['move', 'select', 'canvas'], 'out'),
];

/** The pointer probe's second plan (`--plan pointer-clicks`): Gecko's clicks and scrolls, which keep the window's rule. */
export const POINTER_CLICKS_PROBE = [
  ...probe('visible', ['click', 'scroll', 'select'], 'in'),
  ...probe('visible', ['click', 'scroll'], 'out'),
  ...probe('partial', ['click', 'scroll'], 'in'),
  ...probe('partial', ['click', 'scroll'], 'out'),
];

export const caseKey = (c) => `${c.family} ${c.kind} ${c.occlusion}${c.park ? ` pointer-${c.park}` : ''}`;

/** The lanes a case runs: the reference and cua always; the any-cover lane on a refused move or drag. */
export function caseLanes(c, args) {
  // a probe's clicks and scrolls go out through the pinned build, which has no device mode (cua's keep the window's rule)
  if (c.expect === 'probe') return [['click', 'scroll'].includes(c.kind) ? { label: 'pinned', bin: args.vendor, args: [] } : { label: 'cua:any-cover', bin: args.cua, args: ['--drag-ignore-cover'] }];
  const lanes = [
    { label: 'pinned', bin: args.vendor, args: [] },
    { label: 'cua', bin: args.cua, args: [] },
  ];
  if (c.expect === 'refused' && !['click', 'scroll'].includes(c.kind)) lanes.push({ label: 'cua:any-cover', bin: args.cua, args: ['--drag-ignore-cover'] });
  return lanes;
}

// ---------------------------------------------------------------------------------------------------------------
// the judge (pure)

const refusal = (r) => r.ok !== true && DEVICE_REFUSAL.test(String(r.error ?? ''));

/**
 * One case judged from its runs (each `{engine, ok, error, took, witness}`, `took` as the kinds and drag experiments
 * judge it): an allowed case passes when cua ran `ALLOWED_RUNS` or more, every one ok, taking effect and with the
 * witness unchanged; a refused one when cua ran `REFUSED_RUNS` or more, every one the Device mode sentence with the
 * witness unchanged and no effect. The other lanes' counts stand beside it, never judged.
 */
export function judgeCase(c, runs, { allowedRuns = ALLOWED_RUNS, refusedRuns = REFUSED_RUNS } = {}) {
  const mine = runs.filter((r) => r.engine === 'cua');
  const counts = {};
  for (const r of runs) {
    counts[r.engine] ??= { took: 0, n: 0, refused: 0 };
    counts[r.engine].n++;
    if (r.took === true) counts[r.engine].took++;
    if (refusal(r)) counts[r.engine].refused++;
  }
  // a probe's counts are its finding
  if (c.expect === 'probe') return { kind: 'predicate-case', ...c, counts, pass: true, failed: [] };
  const need = c.expect === 'allowed' ? allowedRuns : refusedRuns;
  const failed = [];
  if (mine.length < need) failed.push(`cua ran ${mine.length} of ${need}`);
  const unclean = mine.filter((r) => r.witness !== true).length;
  if (unclean) failed.push(`the witness changed on ${unclean}`);
  if (c.expect === 'allowed') {
    const missed = mine.filter((r) => r.ok !== true || r.took !== true).length;
    if (missed) failed.push(`${missed} did not take effect`);
  } else {
    const answered = mine.filter((r) => !refusal(r)).length;
    if (answered) failed.push(`${answered} were not refused`);
    const took = mine.filter((r) => r.took === true).length;
    if (took) failed.push(`${took} took effect`);
  }
  return { kind: 'predicate-case', ...c, counts, pass: failed.length === 0, failed };
}

/** Every case of the manifest judged; a case with no runs fails as unmeasured. */
export function judgePredicates(cases, runs, options = {}) {
  const rows = cases.map((c) => {
    const own = runs.filter((r) => r.case === caseKey(c));
    if (!own.length) return { kind: 'predicate-case', ...c, counts: {}, pass: false, failed: ['not measured'] };
    return judgeCase(c, own, options);
  });
  const failed = rows.filter((r) => !r.pass).map((r) => `${caseKey(r)}: ${r.failed.join(', ')}`);
  return { rows, pass: failed.length === 0, failed };
}

/** The summary's table, one row a case. */
export function predicatesMarkdown(rows) {
  const count = (row, lane) => (row.counts[lane] ? `${row.counts[lane].took}/${row.counts[lane].n}` : '–');
  const cua = (row) => {
    const c = row.counts.cua;
    if (!c) return '–';
    return row.expect === 'allowed' ? `took ${c.took}/${c.n}` : `refused ${c.refused}/${c.n}`;
  };
  return [
    '| occlusion | kind | expected | cua | pinned took | cua:any-cover took | why | verdict |',
    '|---|---|---|---:|---:|---:|---|---|',
    ...rows.map((r) => `| ${r.occlusion}${r.park ? `, pointer ${r.park}` : ''} | ${r.kind} | ${r.expect} | ${cua(r)} | ${count(r, 'pinned')} | ${count(r, 'cua:any-cover')} | ${r.why} | ${r.pass ? 'PASS' : `**FAIL**: ${r.failed.join(', ')}`} |`),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// the occlusions

/** The overlay's side, px, and its margin from the window's bottom-right corner. */
const OVERLAY = 120;
const OVERLAY_MARGIN = 20;

/**
 * The desktop the series see, whose `arrange` also knows this module's two occlusions: the window at its place first
 * (an `offscreen` case moved it), then the occlusion. The overlay is the case's (`startCaseOcclusion`), raised over the
 * window each time.
 */
function arranging(desktop, state) {
  const arrange = (scene, occlusion) => {
    arrangeOcclusion(scene, occlusion);
    if (state.park) parkPointer(scene, occlusion, state.park);
  };
  const arrangeOcclusion = (scene, occlusion) => {
    const [w, h] = [scene.window.width, scene.window.height];
    if (state.moved.has(scene.id) && occlusion !== 'offscreen') {
      configure(scene.id, 0, 0, w, h);
      state.moved.delete(scene.id);
    }
    if (occlusion === 'overlay') {
      desktop.arrangeFront('visible');
      desktop.raise(scene);
      xdotool('windowraise', state.overlay.id);
      return;
    }
    if (occlusion === 'offscreen') {
      configure(scene.id, 1280 - Math.round(w * 0.8), 0, w, h);
      state.moved.add(scene.id);
      desktop.arrangeFront('visible');
      desktop.raise(scene);
      return;
    }
    desktop.arrange(scene, occlusion);
  };
  return new Proxy(desktop, {
    get(target, prop) {
      if (prop === 'arrange') return arrange;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * The real pointer parked for a case that names where (`park`), in root coordinates: `in`, a point of the window the
 * occlusion leaves visible and no case aims at (its top right, or its bottom right under a top cover); `out`, a point
 * of the screen outside the window (its bottom-right corner, or its bottom-left one while the window is off the right).
 */
export function parkPoint(window, occlusion, park, { offscreenX = null } = {}) {
  const x0 = offscreenX ?? window.x;
  if (park === 'in') return { x: x0 + Math.round(window.width * 0.7), y: window.y + (occlusion === 'partial-top' ? window.height - 40 : 110) };
  return occlusion === 'offscreen' ? { x: 20, y: 795 } : { x: 1265, y: 795 };
}

function parkPointer(scene, occlusion, park) {
  const offscreenX = occlusion === 'offscreen' ? 1280 - Math.round(scene.window.width * 0.8) : null;
  const { x, y } = parkPoint(scene.window, occlusion, park, { offscreenX });
  xdotool('mousemove', x, y);
}

/** What an occlusion needs beyond each request's arrangement: the overlay at the scene windows' common corner. */
async function startCaseOcclusion(occlusion, scenes, state) {
  if (occlusion !== 'overlay') return;
  const w = scenes[0].window;
  state.overlay = await startOverlay([w.x + w.width - OVERLAY - OVERLAY_MARGIN, w.y + w.height - OVERLAY - OVERLAY_MARGIN, OVERLAY, OVERLAY].map(String));
}

async function stopCaseOcclusion(state) {
  await state.overlay?.stop();
  state.overlay = null;
}

// ---------------------------------------------------------------------------------------------------------------
// the run

/** The cases a run measures: the manifest, narrowed by `--ops` (kinds) where asked; the gate runs them all. */
export function predicatePlan(args, cases = { pointer: POINTER_PROBE, 'pointer-clicks': POINTER_CLICKS_PROBE }[args.plan] ?? PREDICATE_CASES) {
  if (args.plan && !['pointer', 'pointer-clicks', 'manifest'].includes(args.plan)) throw new Error(`--plan ${args.plan}: the predicates plans are manifest (the gate's), pointer and pointer-clicks`);
  const kinds = args.ops && args.ops !== 'all' ? args.ops : null;
  return cases.filter((c) => !kinds || kinds.includes(c.kind));
}

export async function runPredicates(args, { desktop, emit }) {
  if (!args.vendor) throw new Error('the predicates experiment needs --vendor (the pinned build is its reference)');
  const plan = predicatePlan(args);
  if (!plan.length) throw new Error('no predicate case to measure');
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront('visible');
  const witness = await startWitness(XPROBE);
  const state = { moved: new Set(), overlay: null };
  const seen = arranging(desktop, state);
  const runs = [];
  const errors = [];
  // a window a lane for every lane some case of the plan runs
  const laneLabels = [...new Set(plan.flatMap((c) => caseLanes(c, args).map((l) => l.label)))];
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    // the move, click and scroll cases on the input page, then the drags on the drag page: each page's windows once,
    // one a lane, and the cases in the manifest's order, an occlusion's cases together
    for (const [page, kinds] of [['input.html', MOVE_KINDS], [DRAG_PAGE, DRAG_KINDS]]) {
      const cases = plan.filter((c) => kinds.includes(c.kind));
      if (!cases.length) continue;
      const scenes = {};
      const at = {};
      try {
        for (const label of laneLabels) {
          scenes[label] = await openFamily(desktop, oracle, 'firefox', `pred${label.replace(/[^a-z0-9]+/gi, '')}`, { page, doc: null, geometry: FAMILIES.firefox.geometry });
          scenes[label].kindOf = 'page';
        }
        desktop.arrangeFront('visible');
        await sleep(1000);
        if (page === DRAG_PAGE) {
          for (const label of laneLabels) {
            desktop.raise(scenes[label]);
            at[label] = await locate({ desktop, oracle }, scenes[label], DRAG_KINDS);
          }
        }
        for (const occlusion of [...new Set(cases.map((c) => c.occlusion))]) {
          await startCaseOcclusion(occlusion, Object.values(scenes), state);
          try {
            for (const c of cases.filter((x) => x.occlusion === occlusion)) {
              process.stdout.write(`case ${caseKey(c)} (${c.expect})\n`);
              const own = [];
              const ctx = { desktop: seen, oracle, witness, emit, family: c.family, occlusion, cua: args.cua, dir: desktop.dir };
              state.park = c.park ?? null;
              for (const spec of caseLanes(c, args)) {
                const n = c.expect === 'allowed' ? ALLOWED_RUNS : REFUSED_RUNS;
                const scene = scenes[spec.label];
                if (page === DRAG_PAGE) own.push(...(await dragSeries(ctx, spec, scene, at[spec.label], c.kind, n)));
                else own.push(...(await kindSeries(ctx, spec, scene, c.kind, n)));
                desktop.focusFront();
              }
              // a drag's effect is judged against the pinned build's values (drag.mjs `judgeRuns`); a move's, click's
              // and scroll's by the page's own counts (kinds.mjs), already in each run
              const judged = page === DRAG_PAGE ? judgeRuns(c.kind, own).runs : own;
              for (const r of judged) {
                const row = { ...r, kind: 'predicate-run', case: caseKey(c), expect: c.expect };
                emit(row);
                runs.push(row);
              }
              const row = judgeCase(c, judged);
              emit(row);
              process.stdout.write(`${predicatesMarkdown([row]).at(-1)}\n`);
            }
          } finally {
            await stopCaseOcclusion(state);
          }
        }
      } catch (error) {
        errors.push(String(error.message ?? error).split('\n')[0].slice(0, 200));
        emit({ kind: 'predicates-error', page, error: String(error.stack ?? error).slice(0, 1000) });
        process.stdout.write(`${page} failed: ${error.message}\n`);
      } finally {
        for (const scene of Object.values(scenes)) if (state.moved.has(scene.id)) configure(scene.id, 0, 0, scene.window.width, scene.window.height);
        state.moved.clear();
        await desktop.close(Object.values(scenes));
      }
    }
  } finally {
    await witness.stop();
  }
  const verdict = judgePredicates(plan, runs);
  for (const row of verdict.rows) emit({ ...row, kind: 'predicate-verdict' });
  const md = [
    `T15's adopted cases (predicates.mjs): each allowed case ${ALLOWED_RUNS} runs of cua as it ships, every one taking effect with the witness unchanged; each still-refused counterexample ${REFUSED_RUNS}, every one the Device mode sentence with the witness unchanged. Beside them the pinned build's counts and, on a refused move or drag, cua's own events with the cover left unjudged (\`cua:any-cover\`, \`--drag-ignore-cover\`). The occlusions: ${Object.entries(OCCLUSIONS).map(([k, v]) => `\`${k}\` ${v}`).join('; ')}.`,
    '',
    ...predicatesMarkdown(verdict.rows),
    '',
    verdict.pass ? 'Every case holds.' : `**FAIL**: ${verdict.failed.join('; ')}`,
  ];
  return { md, complete: errors.length === 0, pass: verdict.pass, failed: [...errors, ...verdict.failed] };
}
