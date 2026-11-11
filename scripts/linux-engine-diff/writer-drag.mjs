// T16's probe (#171 M4; measured, never judged): why a LibreOffice Writer window's drag selects nothing. The drag
// experiment's Writer cell found that a fresh window's first drag selects nothing in every engine (M1a.4, on `:0`), and
// then (T10) that on a private display even the primed drag selects nothing, the pinned build's included. So the probe
// first settles what the harness can see (`--plan observe`): a selection made by other means than a background drag
// (the AT-SPI selection call, real XTEST input with the window active, background keys) read by every observer the
// probe has, so that a drag that selects nothing is told from a reader that sees nothing. Then it varies one condition
// at a time on the background route (`--plan mechanism`): a fresh window or a primed one, where the real pointer is,
// and how the drag's motions are spaced.
//
// The observers of a run, each read after the drag has settled:
// - `selection`: the AT-SPI selections of the document's first paragraphs (`Text.GetSelection`), with their text;
// - `primary`: the PRIMARY selection's text, the harness's marker claimed before the drag (LibreOffice offers its
//   selection there);
// - `caret`: where the caret is (`readCaret`), which says whether the press arrived at all.
// A run `selected` when an observer shows the text its path spans (`selectionCovers`, the drag cell's rule).
//
// The cases' lanes: an engine by its drag lane label (`pinned`, `cua`, a `--variant` lane `cua:<label>`), or `xtest`,
// the drag experiment's control: the window activated, then cua-engine's windowless drag through XTEST (real input on
// this private display), or `atspi` and `keys`, the selection made without a drag. Every drag runs in a witness span.

import { xExecFileSync, xSpawn } from './xspawn.mjs';

import { DRAG_DOC, WORDS, locate, runPath, selectOffsets, selectionCovers } from './drag.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { runElementPlan, runHierarchyPlan, runIdentityPlan } from './vcl-probe.mjs';

import { auditAnswered, parseXtrace, startProxy } from './audit.mjs';
import { Engine } from './engine.mjs';
import { captureWindow } from './pixels.mjs';
import { openFamily, readCaret } from './families.mjs';
import { Oracle } from './oracle.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE, xdotool } from './scenes.mjs';
import { ParkRefused, frontPoint, parkOnFront, parkPointer } from './park.mjs';
import { verifyIdentity } from './app-identity.mjs';
import { startWitness } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How many of the document's paragraphs the selection observer reads: the drag's line and the few after it. */
export const READ_PARAGRAPHS = 4;
/** PRIMARY's marker, owned by the harness before each run, so a run that offers nothing reads as nothing. */
export const PRIMARY_MARKER = 'cua171-writer-none';

/**
 * Where the real pointer is parked before a run, a screen point and the window it must then be over (park.mjs):
 * `text` at the path's start and `blank` in the document's empty lower part, both over the scene's window; `out` on
 * another window of the run's, off Writer: the front window's middle (`front`, `{id, x, y}`), as T19's sitting parked
 * its own (the design session, 2026-11-10; task 72's review, finding 2: the old fixed point was inside the maximized
 * Writer, and a park on the bare root changes a window the run did not open by the harness's own audit); `none` left
 * where it is.
 */
export function parkPoint(park, window, path, { id, front = null } = {}) {
  if (park === 'text') return { point: { x: window.x + path[0].x, y: window.y + path[0].y }, intended: id };
  if (park === 'blank') return { point: { x: window.x + Math.round(window.width / 2), y: window.y + window.height - 120 }, intended: id };
  if (park === 'out') {
    if (!front) throw new ParkRefused('no front window to park the pointer on, off Writer');
    return { point: { x: front.x, y: front.y }, intended: front.id };
  }
  if (park === 'none') return null;
  throw new Error(`unknown pointer park ${park}`);
}

/**
 * A case: a lane, a fresh window per run or one window for the case's runs, its priming, where the pointer is, how the
 * path is aimed (`aimAt`), its runs (`n`, else `--trials`) and whether its engine's X requests are audited (`audit`).
 * The aims: `locate`, the drag cell's (drag.mjs `locate`, LibreOffice's VCL extents moved by the host panel's offset
 * since T16, vcl-aim.mjs); `raw`, the drag cell's before T16 (each character's AT-SPI extents less the X11 window's
 * origin), which every pilot plan below ran with; `frame`, less the origin of the window's AT-SPI frame instead.
 */
const c = (name, lane, { fresh = true, prime = null, park = 'out', aim = 'raw', n = null, audit = false, why }) => ({ name, lane, fresh, prime, park, aim, n, audit, why });

/** The proof's cases (`--plan first`): every run a fresh, unprimed window's first drag, aimed as the drag cell aims. */
const first = (name, lane, options) => c(name, lane, { aim: 'locate', ...options });

export const PLANS = {
  // T16's proof: a fresh window's first drag selects, in every engine, wherever the real pointer is, with the witness
  // clean and the audit clean; the pre-T16 aim as the control that misses
  first: [
    first('cua-first', 'cua', { n: 30, why: 'cua as shipped, the pointer on another window of the run's (the front window), off Writer' }),
    first('cua-first-text', 'cua', { n: 10, park: 'text', why: "the pointer on the path's start" }),
    first('cua-first-blank', 'cua', { n: 10, park: 'blank', why: 'the pointer in the window, off the text' }),
    first('pinned-first', 'pinned', { n: 10, why: 'the pinned build' }),
    first('newest-first', 'newest', { n: 10, why: 'the newest build' }),
    first('cua-first-audit', 'cua', { n: 3, audit: true, why: "cua through an xtrace proxy: no forbidden request on the background route" }),
    c('cua-first-raw', 'cua', { n: 5, why: "the control: the drag cell's aim before T16, 27 px above the text" }),
  ],
  // the pilots, as they ran (task 72, before the aim was fixed): the aim `raw` throughout but `geometry`'s `frame` cases
  // the harness question (T10): can the harness see a Writer selection on a private display at all
  observe: [
    c('atspi-fresh', 'atspi', { why: 'the selection set through AT-SPI: every observer should see it' }),
    c('keys-fresh', 'keys', { why: 'a background click on the text, then Shift+Right: a selection made by keys' }),
    c('xtest-fresh', 'xtest', { why: "real input: the window activated, the desktop route's drag" }),
    c('xtest-primed', 'xtest', { fresh: false, why: 'real input, the same window drag after drag' }),
    c('cua-fresh', 'cua', { why: 'the background route on a fresh window (the known miss)' }),
    c('cua-primed', 'cua', { fresh: false, prime: 'drag', why: "the background route after one drag (the harness's priming)" }),
    c('pinned-primed', 'pinned', { fresh: false, prime: 'drag', why: "the pinned build after one drag (the harness's priming)" }),
  ],
  // one condition at a time on the background route
  mechanism: [
    c('cua-fresh-out', 'cua', { park: 'out', why: 'pointer outside the window' }),
    c('cua-fresh-text', 'cua', { park: 'text', why: "pointer on the path's start" }),
    c('cua-fresh-blank', 'cua', { park: 'blank', why: 'pointer in the window, off the text' }),
    c('cua-primed-out', 'cua', { fresh: false, prime: 'drag', park: 'out', why: 'primed, pointer outside' }),
    c('cua-primed-text', 'cua', { fresh: false, prime: 'drag', park: 'text', why: 'primed, pointer on the text' }),
    c('cua-clickprimed-out', 'cua', { fresh: false, prime: 'click', park: 'out', why: 'primed by a click, pointer outside' }),
    c('pinned-fresh-out', 'pinned', { park: 'out', why: 'the pinned build, pointer outside' }),
  ],
  // where the path lands: the drag cell's aim against the window's own AT-SPI frame (`aimAt`), each run's geometry
  // recorded before and after its input (`geometry`)
  geometry: [
    c('cua-fresh-atspi', 'cua', { why: "the drag cell's aim before T16" }),
    c('cua-fresh-frame', 'cua', { aim: 'frame', why: "aimed from the window's own AT-SPI frame" }),
    c('pinned-fresh-frame', 'pinned', { aim: 'frame', why: 'the pinned build, aimed from the frame' }),
    c('xtest-fresh-frame', 'xtest', { aim: 'frame', why: 'real input, aimed from the frame' }),
    c('cua-run-frame', 'cua', { fresh: false, aim: 'frame', why: 'one window, drag after drag, aimed from the frame' }),
  ],
  // how the drag's motions are spaced, on fresh windows with the pointer outside: GTK 3 drops a motion that reaches a
  // window selecting motion hints before the toolkit has asked for the next one (gdkwindow.c `proxy_pointer_event`), so
  // a burst can lose its last motions. Each lane a `--variant`: `cua:rest` (a rest at the end, then the end again),
  // `cua:press` (a dwell after the press), `cua:step` (a wait after each sample)
  // what a press does at all: real and background clicks, a held press with no move, a real drag at a person's pace
  press: [
    c('click-fresh', 'click', { why: "a background click at the path's start" }),
    c('xclick-fresh', 'xclick', { why: "a real click at the path's start, the window active" }),
    c('xhold-fresh', 'xhold', { why: 'the real button held 300 ms there, no move' }),
    c('xdotool-fresh', 'xdotool', { why: "a real drag at a person's pace: 300 ms held, 12 moves 40 ms apart" }),
    c('xdotool-primed', 'xdotool', { fresh: false, why: "a real drag at a person's pace, drag after drag" }),
  ],
  pacing: [
    c('xdotool-fresh', 'xdotool', { why: "real input at a person's pace: 300 ms held, 12 moves 40 ms apart" }),
    c('cua-fresh', 'cua', { why: 'as shipped (no wait)' }),
    c('rest-fresh', 'cua:rest', { why: 'a rest at the end, then the end visited again' }),
    c('press-fresh', 'cua:press', { why: 'a dwell after the press' }),
    c('step-fresh', 'cua:step', { why: 'a wait after each sample' }),
    c('rest-primed', 'cua:rest', { fresh: false, prime: 'drag', why: 'primed, the rest at the end' }),
  ],
};

/** The cases of `--plan` (observe by default), each lane checked against the lanes the run has. */
export function writerPlan(args, lanes) {
  const plan = PLANS[args.plan ?? 'observe'];
  if (!plan) throw new Error(`--plan ${args.plan}: the writer-drag plans are ${Object.keys(PLANS).join(', ')}, element, hierarchy and identity`);
  const known = new Set(['atspi', 'keys', 'click', ...Object.keys(REAL), 'xtest', ...lanes.map((l) => l.label)]);
  for (const k of plan) if (!known.has(k.lane)) throw new Error(`case ${k.name} needs lane ${k.lane}, which the run does not have (--vendor, --variant)`);
  return plan;
}

/**
 * Where the drag's characters are, window-relative, by the case's aim: `locate` keeps the drag cell's (null), `raw`
 * measures each character's AT-SPI centre from the X11 window's origin (the drag cell's aim before T16), `frame` from
 * the window's AT-SPI frame's origin.
 */
export function aimAt(aim, { charExtents, frame, window }) {
  if (aim === 'locate') return null;
  const origin = { raw: window, frame }[aim];
  if (!origin) throw new Error(`unknown aim ${aim}`);
  return (offset) => {
    const e = charExtents(offset);
    return [Math.round(e.x + e.w / 2 - origin.x), Math.round(e.y + e.h / 2 - origin.y)];
  };
}

/** A window's geometry as the X server and as AT-SPI tell it: the X11 window, its WM frame, its AT-SPI frame, a character. */
function geometry(ctx, scene, at) {
  const frameExtents = xExecFileSync('xprop', ['-id', String(scene.id), '_NET_FRAME_EXTENTS'], { encoding: 'utf8', timeout: 5000 }).trim();
  const x11 = xdotool('getwindowgeometry', '--shell', scene.id).replace(/\n/g, ' ').trim();
  return { window: scene.window, x11, wm_frame: frameExtents, atspi_frame: ctx.oracle.extents(scene.frame), char2: ctx.oracle.charExtents(at.text.id, 2) };
}

/** Whether a run's observers saw its path's selection: `{atspi, primary, any}`. */
export function observed(run) {
  const spans = (run.selection ?? []).map((s) => s.text);
  const atspi = spans.some((t) => selectionCovers(t, 0));
  const primary = run.primary !== null && run.primary !== PRIMARY_MARKER && selectionCovers(run.primary, 0);
  return { atspi, primary, any: atspi || primary };
}

/** A case's counts: runs, selected by each observer, anything selected at all, witness clean. */
export function caseRow(k, runs) {
  const seen = runs.map((r) => r.observed ?? observed(r));
  const nonempty = runs.filter((r) => (r.selection ?? []).some((s) => s.text) || (r.primary && r.primary !== PRIMARY_MARKER)).length;
  return {
    kind: 'writer-case',
    case: k.name,
    lane: k.lane,
    fresh: k.fresh,
    prime: k.prime,
    park: k.park,
    why: k.why,
    n: runs.length,
    ok: runs.filter((r) => r.ok).length,
    atspi: seen.filter((s) => s.atspi).length,
    primary: seen.filter((s) => s.primary).length,
    selected: seen.filter((s) => s.any).length,
    nonempty,
    caret_moved: runs.filter((r) => r.caret_moved).length,
    witness: runs.every((r) => r.witness !== false),
  };
}

function primary() {
  try {
    return xExecFileSync('xclip', ['-o', '-selection', 'primary'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

async function claimPrimary() {
  const child = xSpawn('xclip', ['-i', '-selection', 'primary', '-loops', '1'], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
  child.stdin.end(PRIMARY_MARKER);
  child.unref();
  for (let tries = 0; primary() !== PRIMARY_MARKER && tries < 50; tries++) await sleep(20);
}

function selections(oracle, scene) {
  const ids = oracle.children(scene.document).filter((id) => oracle.role(id) === 'paragraph').slice(0, READ_PARAGRAPHS);
  return ids.map((id, paragraph) => {
    const range = oracle.selection(id);
    return range ? { paragraph, start: range[0], end: range[1], text: oracle.selectedText(id) } : null;
  }).filter(Boolean);
}

/** The observers after a run, once nothing has changed for 300 ms (at most 2.5 s). */
async function observe(ctx, scene) {
  const read = async () => ({ selection: selections(ctx.oracle, scene), primary: primary(), caret: await readCaret(ctx.desktop, ctx.oracle, scene) });
  const started = Date.now();
  await sleep(200);
  let last = await read();
  for (;;) {
    await sleep(300);
    const now = await read();
    if (JSON.stringify(now) === JSON.stringify(last) || Date.now() - started > 2500) return now;
    last = now;
  }
}

/** The selection made without a drag: through AT-SPI, or by a background click and Shift+Right on the even path. */
async function selectOtherwise(ctx, scene, at, lane, engine) {
  const [a, b] = selectOffsets(0);
  if (lane === 'atspi') {
    ctx.oracle.on(at.text.id, 'org.a11y.atspi.Text', 'AddSelection', 'ii', a, b);
    return { response: { ok: true } };
  }
  const [x, y] = at.text.cell(a);
  const click = await engine.request('click', { window: { id: scene.id }, x: Math.round(x), y: Math.round(y) });
  if (!click.response.ok) return click;
  await sleep(300);
  for (let k = a; k < b; k++) {
    const key = await engine.request('press_key', { window: { id: scene.id }, key: 'shift+Right' });
    if (!key.response.ok) return key;
  }
  return { response: { ok: true } };
}

/**
 * Real input through xdotool's XTEST (on this private display only), the window activated first, at the path's root
 * points: `xdotool` a drag at a person's pace (the button down, 300 ms, 12 moves 40 ms apart to the end, 300 ms, the
 * button up), `xclick` a click at the start (80 ms held), `xhold` the button held 300 ms at the start with no move.
 */
const REAL = {
  async xdotool([a, b]) {
    xdotool('mousedown', 1);
    await sleep(300);
    for (let k = 1; k <= 12; k++) {
      xdotool('mousemove', Math.round(a.x + ((b.x - a.x) * k) / 12), Math.round(a.y + ((b.y - a.y) * k) / 12));
      await sleep(40);
    }
    await sleep(300);
    xdotool('mouseup', 1);
  },
  async xclick() {
    xdotool('mousedown', 1);
    await sleep(80);
    xdotool('mouseup', 1);
  },
  async xhold() {
    xdotool('mousedown', 1);
    await sleep(300);
    xdotool('mouseup', 1);
  },
};

async function realInput(lane, root) {
  const started = performance.now();
  xdotool('mousemove', root[0].x, root[0].y);
  await sleep(100);
  await REAL[lane]([root[0], root.at(-1)]);
  return { response: { ok: true }, ms: performance.now() - started };
}

async function oneRun(ctx, k, scene, at, engine, i, path) {
  const { witness, emit } = ctx;
  ctx.desktop.arrange(scene, 'visible');
  if (k.lane === 'xtest' || REAL[k.lane]) {
    xdotool('windowactivate', '--sync', scene.id);
    await sleep(150);
  }
  const parked = parkPoint(k.park, scene.window, path, { id: scene.id, front: frontPoint(ctx.desktop) });
  const park = parked?.point ?? null;
  let parkedOver = null;
  if (parked) {
    // only onto the root or a window of the run's (scenes.mjs `pointerSafeAt`), then verified where it landed: a park
    // that is not where it was meant to be refuses the case, so its runs never count (park.mjs)
    if (!ctx.desktop.pointerSafeAt(park)) throw new Error(`the pointer's park point (${park.x}, ${park.y}) is over a window the run did not open`);
    parkedOver = parkPointer(park, parked.intended).chain;
  }
  await claimPrimary();
  await sleep(300);
  const before = await readCaret(ctx.desktop, ctx.oracle, scene);
  const tag = `${k.lane}:writer:${k.name}`;
  let sent;
  if (['atspi', 'keys'].includes(k.lane)) sent = await witness.span(tag, () => selectOtherwise(ctx, scene, at, k.lane, engine));
  else if (k.lane === 'xtest') sent = await witness.span(tag, () => engine.request('drag', { path: path.map((p) => ({ x: scene.window.x + p.x, y: scene.window.y + p.y })) }));
  else if (REAL[k.lane]) sent = await witness.span(tag, () => realInput(k.lane, path.map((p) => ({ x: scene.window.x + p.x, y: scene.window.y + p.y }))));
  else if (k.lane === 'click') sent = await witness.span(tag, () => engine.request('click', { window: { id: scene.id }, ...path[0] }));
  else sent = await witness.span(tag, () => engine.request('drag', { window: { id: scene.id }, path }));
  const { value, witness: w } = sent;
  const ok = value.response.ok === true;
  const after = await observe(ctx, scene);
  // the window as it looks once observed, kept for reading by eye (`shots/`)
  const shot = ctx.shots ? await captureWindow(ctx.cua, scene, ctx.shots) : null;
  const pointer = xdotool('getmouselocation', '--shell');
  const run = {
    kind: 'writer-run',
    case: k.name,
    lane: k.lane,
    i,
    ok,
    error: ok ? undefined : String(value.response.error).slice(0, 300),
    ms: value.ms === undefined ? undefined : Math.round(value.ms * 10) / 10,
    // xtest moves the real pointer and activates on purpose: its witness is recorded, not required
    witness: k.lane === 'xtest' || REAL[k.lane] ? null : w.clean,
    witness_fields: w.clean ? undefined : w.fields,
    park,
    // the windows the pointer was verified over (`xprobe pointer-chain`, from the root's child down; empty: the root)
    park_chain: parkedOver,
    pointer_after: String(pointer).replace(/\n/g, ' ').trim(),
    path,
    shot: shot ? shot.split('/').at(-1) : null,
    before_caret: before,
    ...after,
    caret_moved: JSON.stringify(before) !== JSON.stringify(after.caret),
  };
  Object.assign(run, { observed: observed(run) });
  emit(run);
  return run;
}

/**
 * A case's engine: started plainly, or (`audit`) with its X connection through an xtrace proxy, each request marked in
 * the trace so its forbidden requests are found by its answer (audit.mjs `auditAnswered`, as the matrix's audit pass).
 */
async function caseEngine(k, spec) {
  if (k.lane === 'atspi') return { engine: null, finish: async () => null };
  if (!k.audit) {
    const engine = new Engine(spec).start();
    return { engine, finish: async () => engine.close().then(() => null) };
  }
  const proxy = await startProxy();
  const inner = new Engine({ ...spec, env: proxy.env }).start();
  const answers = [];
  const engine = {
    async request(command, input) {
      const j = answers.length;
      await proxy.mark(`request:${j}`);
      const value = await inner.request(command, input);
      await proxy.mark(`answered:${j}`);
      answers.push({ command, ok: value.response.ok === true });
      return value;
    },
  };
  return {
    engine,
    async finish() {
      await inner.close();
      return { answers: answers.length, ...auditAnswered(parseXtrace(await proxy.stop()), proxy.marks, answers) };
    },
  };
}

/** A case's runs: a fresh window each (`fresh`), or one window for all, primed once before the first. */
async function runCase(ctx, k, lanes, n, open) {
  const spec = lanes.find((l) => l.label === (['xtest', 'keys', 'click'].includes(k.lane) || REAL[k.lane] ? 'cua' : k.lane));
  const { engine, finish } = await caseEngine(k, spec);
  const runs = [];
  let shared = null;
  let audited = null;
  try {
    for (let i = 0; i < n; i++) {
      // the real pointer on the front window while a fresh window opens, so no motion of the harness's reaches it
      // before the case's own park (park.mjs `parkOnFront`)
      if (k.fresh || !shared) parkOnFront(ctx.desktop);
      const scene = k.fresh ? await open(`wd${k.name.replace(/[^a-z0-9]+/gi, '')}${i}`) : (shared ??= await open(`wd${k.name.replace(/[^a-z0-9]+/gi, '')}`));
      try {
        // Writer, as AT-SPI shows it, before any of its runs counts (app-identity.mjs)
        scene.identity ??= verifyIdentity(ctx.oracle, scene, 'writer');
        ctx.desktop.arrangeFront('visible');
        await sleep(800);
        ctx.desktop.raise(scene);
        const at = await locate(ctx, scene, ['select']);
        const before = geometry(ctx, scene, at);
        const cell = aimAt(k.aim, { charExtents: (o) => ctx.oracle.charExtents(at.text.id, o), frame: before.atspi_frame, window: scene.window });
        if (cell) at.text = { ...at.text, cell };
        // a shared window's runs alternate between the two paths (the drag cell's), a fresh window's first drag the even
        const path = runPath(at, 'select', k.fresh ? 0 : i);
        if (k.prime && (k.fresh || i === 0)) {
          const prime = k.prime === 'drag'
            ? await ctx.witness.span(`${k.lane}:writer:${k.name}:prime`, () => engine.request('drag', { window: { id: scene.id }, path: runPath(at, 'select', 1) }))
            : await ctx.witness.span(`${k.lane}:writer:${k.name}:prime`, () => engine.request('click', { window: { id: scene.id }, ...runPath(at, 'select', 1)[0] }));
          ctx.emit({ kind: 'writer-prime', case: k.name, prime: k.prime, ok: prime.value.response.ok === true, witness: prime.witness.clean });
          await sleep(700);
        }
        // a shared window's odd runs undo the even ones: judged on its own path (selectionCovers on run parity)
        const run = await oneRun(ctx, k, scene, at, engine, i, path);
        ctx.emit({ kind: 'writer-geometry', case: k.name, i, before, after: geometry(ctx, scene, at) });
        runs.push({ ...run, parity: k.fresh ? 0 : i % 2 });
        await sleep(700);
      } finally {
        if (k.fresh) await ctx.desktop.close([scene]);
      }
    }
  } finally {
    if (shared) await ctx.desktop.close([shared]);
    audited = await finish();
  }
  if (audited) ctx.emit({ kind: 'writer-audit', case: k.name, clean: audited.clean, traced: audited.traced, requests: audited.requests, answers: audited.answers, forbidden: audited.forbidden.slice(0, 10) });
  return Object.assign(runs, { audited });
}

/** A shared window's odd runs select the odd path's text: re-observed against it, so `observed` reads every run alike. */
export function observedOnParity(run) {
  if (!run.parity) return run.observed;
  const [a, b] = selectOffsets(1);
  const covers = (t) => typeof t === 'string' && t !== '' && WORDS.slice(Math.max(0, a - 1), b + 1).includes(t) && t.includes(WORDS.slice(a + 1, b - 1));
  const atspi = (run.selection ?? []).some((s) => covers(s.text));
  const prim = run.primary !== null && run.primary !== PRIMARY_MARKER && covers(run.primary);
  return { atspi, primary: prim, any: atspi || prim };
}

export async function runWriterDrag(args, { desktop, emit }) {
  if (args.plan === 'element') return runElementPlan(args, { desktop, emit });
  if (args.plan === 'hierarchy') return runHierarchyPlan(args, { desktop, emit });
  if (args.plan === 'identity') return runIdentityPlan(args, { desktop, emit });
  if (!args.vendor) throw new Error('the writer-drag probe needs --vendor (the pinned build)');
  const lanes = [
    { label: 'pinned', bin: args.vendor, args: [] },
    ...(args.newest ? [{ label: 'newest', bin: args.newest, args: [] }] : []),
    { label: 'cua', bin: args.cua, args: [] },
    ...args.variants.map((v) => ({ ...v, bin: args.cua })),
  ];
  const plan = writerPlan(args, lanes);
  const n = args.samplesTrials ?? 5;
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront('visible');
  const witness = await startWitness(XPROBE);
  const shots = join(args.out, 'shots');
  mkdirSync(shots, { recursive: true });
  const ctx = { desktop, oracle, witness, emit, family: 'writer', occlusion: 'visible', cua: args.cua, shots };
  const open = (label) => openFamily(desktop, oracle, 'writer', label, { doc: DRAG_DOC });
  const md = [
    `T16's probe (writer-drag.mjs, plan ${args.plan ?? 'observe'}): each case's runs (its own count, else ${n}) on LibreOffice Writer (gtk3), the path's text read by AT-SPI and by PRIMARY. The AT-SPI caret is not updated by a click alone in Writer, so "caret moved" says little for pointer input.`,
    '',
    '| case | lane | window | primed | pointer | aim | why | ok | AT-SPI saw it | PRIMARY saw it | anything selected | caret moved | witness | audit |',
    '|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|',
  ];
  const rows = [];
  const failed = [];
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    for (const k of plan) {
      try {
        const runs = await runCase(ctx, k, lanes, k.n ?? n, open);
        const row = { ...caseRow(k, runs.map((r) => ({ ...r, observed: observedOnParity(r) }))), aim: k.aim, audit: runs.audited ? { clean: runs.audited.clean, traced: runs.audited.traced, requests: runs.audited.requests } : null };
        emit(row);
        rows.push(row);
        const s = (v) => `${v}/${row.n}`;
        const audit = row.audit ? (row.audit.clean ? `clean (${row.audit.requests} requests)` : `**${row.audit.traced ? 'forbidden request' : 'not traced'}**`) : '–';
        md.push(`| ${k.name} | ${k.lane} | ${k.fresh ? 'fresh each run' : 'one'} | ${k.prime ?? '–'} | ${k.park} | ${k.aim} | ${k.why} | ${s(row.ok)} | ${s(row.atspi)} | ${s(row.primary)} | ${s(row.nonempty)} | ${s(row.caret_moved)} | ${row.witness ? 'clean' : '**changed**'} | ${audit} |`);
        process.stdout.write(`${md.at(-1)}\n`);
      } catch (error) {
        failed.push(`${k.name}: ${String(error.message).split('\n')[0].slice(0, 200)}`);
        emit({ kind: 'writer-error', case: k.name, error: String(error.stack ?? error).slice(0, 1000) });
        md.push(`| ${k.name} | ${k.lane} | **failed: ${String(error.message).slice(0, 160)}** |`);
      }
    }
  } finally {
    await witness.stop();
  }
  if ((args.plan ?? 'observe') === 'first') {
    const verdict = firstVerdict(rows);
    md.push('', `The row's proof (T16: on fresh unprimed windows the first drag selects, 30 of 30, witness and audit clean; the control misses): ${verdict.pass ? 'PASS' : `**FAIL**: ${verdict.failed.join('; ')}`}.`);
    if (!verdict.pass) failed.push(...verdict.failed);
  }
  return { md, complete: failed.length === 0, failed };
}

/**
 * The `first` plan's verdict: every aimed case selected on every run with its witness clean, cua's own on 30 or more,
 * the audited case's trace clean, and the control (the pre-T16 aim) missing on every run, so the proof discriminates.
 */
export function firstVerdict(rows) {
  const failed = [];
  for (const r of rows.filter((x) => x.aim === 'locate')) {
    if (r.selected < r.n) failed.push(`${r.case} selected ${r.selected} of ${r.n}`);
    if (!r.witness) failed.push(`${r.case}'s witness changed`);
    if (r.audit && !r.audit.clean) failed.push(`${r.case}'s audit is not clean`);
  }
  const cua = rows.find((x) => x.case === 'cua-first');
  if (!cua || cua.n < 30) failed.push('cua-first ran fewer than 30');
  if (!rows.some((x) => x.audit?.clean)) failed.push('no audited case');
  const control = rows.find((x) => x.aim === 'raw');
  if (!control || control.selected > 0) failed.push(`the control selected ${control?.selected ?? '–'}: CONTROL NON-DISCRIMINATING`);
  return { pass: failed.length === 0, failed };
}
