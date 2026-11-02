// Chrome's HTML5 drag and drop and the desktop (#171 M3.1; Plan of Work, M3, "Open, decided on measurement"; Surprises,
// M1a.4): what a drop into a browser page changes on the desktop, in every engine, and whether it is put back. Per
// family (`--family`, Chrome by default; Electron and Firefox for comparison) and lane, the harness's drag page
// (pages/drag.html) in a window of its own, the page's `dnd` path dragged `--trials` times, each drag in a witness
// span, and around it:
// - the owners of `XdndSelection` (the drag source's selection, XFixes, `xprobe selection-watch`) during the span;
// - whether a pointer or keyboard grab is in force, sampled every 100 ms during the span (`xprobe grabs`; a sample
//   that finds none holds a grab of its own for a moment), and right after the answer;
// - the active window, the X input focus and the stacking order before the drag, right after its answer and 1 s
//   later: whether what the drop changed was put back;
// - the witness's record: the changed fields, the focus events (with their modes: a keyboard grab shows as mode 1 and
//   its end as mode 2), the activation requests and the restacks, maps and unmaps;
// - the drop itself: the page's drop count.
// The lanes (`--lanes` narrows them): the pinned and newest vendor engines, cua, cua's `--variant` lanes (the
// drag-and-drop candidate's `dedicated` and forced-late ones), and `cua:active`, cua with the window activated before
// each drag, the window already in front, where the candidate lets the drop go ahead in shared mode.
// `--dnd-cold` (task 20, the m3-gate's no-dragstart miss) makes every drag a fresh engine's first request in front, the
// lanes taking turns, optionally after the gate's preceding case (`--prelude dedicated`), a full cover (`--cover-ms`) and
// with the gate's other Chrome windows open (`--ballast gate`); each row carries the page's counters and pointer log.

import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { PAGE, locate, readEffect, runPath } from './drag.mjs';
import { Engine } from './engine.mjs';
import { FAMILIES, openFamily } from './families.mjs';
import { Oracle } from './oracle.mjs';
import { DND_REFUSAL } from './deviations.mjs';
import { desktopState } from './device.mjs';
import { negativeCheck, openScene } from './run.mjs';
import { blockOrder } from './stats.mjs';
import { XPROBE } from './scenes.mjs';
import { spawnXdotool, spawnXprobe, xdotool } from './xtools.mjs';
import { judgeRestacks, startWitness } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/** Which fields of the desktop state differ between two reads. */
export function changedFields(a, b) {
  return ['active', 'focus', 'stacking'].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** A running `xprobe selection-watch XdndSelection`: `stop()` answers its owner changes. */
async function watchXdnd() {
  const child = spawn(XPROBE, ['selection-watch', 'XdndSelection'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
  const lines = [];
  const rl = createInterface({ input: child.stdout });
  const ready = new Promise((resolve, reject) => {
    rl.once('line', resolve);
    exited.then(() => reject(new Error('xprobe selection-watch exited before it was ready')));
  });
  rl.on('line', (l) => lines.push(JSON.parse(l)));
  await ready;
  return {
    async stop() {
      child.stdin.end();
      await exited;
      return lines.filter((l) => !l.ready);
    },
  };
}

/** A probe whose `stop()` runs once: a second call answers the first's result (or its failure) again. */
function once(probe) {
  let stopped = null;
  return { ...probe, stop: () => (stopped ??= Promise.resolve().then(() => probe.stop())) };
}

/**
 * One drag's probes around `body(probes)`: the `XdndSelection` watcher and the grab sampler, each started and each
 * stopped whatever happens (Decision Log, M2.3: every probe a case starts is disposed of unconditionally). The body
 * stops them itself where it reads their results; whatever it left running is stopped after it, each stop tried on its
 * own. A body that threw keeps its error, the cleanup failures attached (`cleanup`); a cleanup that fails after a body
 * that did not fails the drag.
 */
export async function withDropProbes(body, { startXdnd = watchXdnd, startGrabs = sampleGrabs } = {}) {
  const probes = {};
  let result;
  let failure = null;
  try {
    probes.xdnd = once(await startXdnd());
    probes.grabs = once(await startGrabs());
    result = await body(probes);
  } catch (error) {
    failure = error;
  }
  const cleanup = [];
  for (const name of ['grabs', 'xdnd']) {
    if (!probes[name]) continue;
    try {
      await probes[name].stop();
    } catch (error) {
      // a failure the body already met through this stop is its own error, not a second one
      if (error !== failure) cleanup.push(error);
    }
  }
  if (failure) {
    if (cleanup.length) failure.cleanup = cleanup;
    throw failure;
  }
  if (cleanup.length) throw new AggregateError(cleanup, `the drop probes did not stop: ${cleanup.map((e) => e.message).join('; ')}`);
  return result;
}

/** Grabs sampled every 100 ms until `stop()`, which answers the samples that found a grab in force. */
function sampleGrabs() {
  const found = [];
  const started = Date.now();
  let running = true;
  const loop = (async () => {
    while (running) {
      const out = await new Promise((resolve) => {
        const child = spawn(XPROBE, ['grabs'], { stdio: ['ignore', 'pipe', 'ignore'] });
        let text = '';
        child.stdout.on('data', (d) => {
          text += d;
        });
        child.once('exit', () => resolve(text));
        // a probe that could not start is a failed sample, never a loop that waits for ever
        child.once('error', () => resolve(''));
      });
      try {
        const g = JSON.parse(out);
        if (g.pointer !== 'free' || g.keyboard !== 'free') found.push({ t_ms: Date.now() - started, ...g });
      } catch {
        // the probe failed: not a sample
      }
      await sleep(100);
    }
  })();
  return {
    async stop() {
      running = false;
      await loop;
      return found;
    },
  };
}

export function dndLanes(args) {
  const all = [
    { label: 'pinned', bin: args.vendor, args: [] },
    ...(args.newest ? [{ label: 'newest', bin: args.newest, args: [] }] : []),
    { label: 'cua', bin: args.cua, args: [] },
    { label: 'cua:active', bin: args.cua, args: [], activate: true },
    // a variant named `active…` activates its window before each drag, as `cua:active` does
    ...args.variants.map((v) => ({ ...v, bin: args.cua, ...(v.label.startsWith('cua:active') ? { activate: true } : {}) })),
  ];
  const lanes = args.lanes ? all.filter((l) => args.lanes.includes(l.label)) : all.filter((l) => l.label !== 'cua:active');
  // the short drop, and every cold drag, is measured in front for every lane, the vendor builds' included (tasks 18, 20)
  return args.dndShort || args.dndCold ? lanes.map((l) => ({ ...l, activate: true })) : lanes;
}

/** The cold run's drags in order: round `i` makes one drag a lane, the lanes' order rotating from round to round. */
export function coldRounds(lanes, n) {
  return Array.from({ length: n }, (_, i) => blockOrder(lanes, i).map((spec) => ({ i, spec }))).flat();
}

/** A lane's engine, with its `--stats` line for cua: its route and its drag-and-drop record (`dnd`, `after_take`). */
const laneEngine = (spec) => new Engine({ ...spec, stats: spec.label.startsWith('cua') }).start();

/** One lane's drags into its own window, on one engine: the run rows, each emitted. */
async function series(ctx, spec, scene, family, n) {
  const { desktop, occlusion } = ctx;
  desktop.arrange(scene, occlusion);
  const at = await locate(ctx, scene, ['dnd']);
  const engine = laneEngine(spec);
  const runs = [];
  try {
    for (let i = 0; i < n; i++) {
      desktop.arrange(scene, occlusion);
      if (spec.activate) xdotool('windowactivate', '--sync', scene.id);
      await sleep(400);
      runs.push(await oneDrag(ctx, spec, scene, family, at, engine, i));
    }
  } finally {
    await engine.close();
  }
  return runs;
}

/**
 * The cold run (task 20; the m3-gate miss): every drag the first request of a fresh engine process, as a block's cold
 * sample of the differential run's device case is. The engine starts before its window's arrangement, as `runSample`
 * starts it before a case's preparation. Then, with `prelude`, the case a block runs just before (`dedicatedDrop`); with
 * `coverMs`, the front window covers the screen that long; and the window is put in front (visible, raised, activated)
 * and left to settle for the device case's 1200 ms before the drag. The lanes take turns (`coldRounds`), each on its own
 * window.
 */
async function coldSeries(ctx, lanes, scenes, family, n, { coverMs = 0, prelude = null } = {}) {
  const { desktop } = ctx;
  const at = {};
  for (const spec of lanes) {
    desktop.arrange(scenes[spec.label], 'visible');
    at[spec.label] = await locate(ctx, scenes[spec.label], ['dnd']);
  }
  const runs = Object.fromEntries(lanes.map((l) => [l.label, []]));
  for (const { i, spec } of coldRounds(lanes, n)) {
    const scene = scenes[spec.label];
    const engine = laneEngine(spec);
    try {
      if (prelude) await dedicatedDrop(ctx, scene, at[spec.label], prelude);
      if (coverMs > 0) {
        desktop.arrangeFront('covered');
        await sleep(coverMs);
      }
      if (ctx.parkPointer) xdotool('mousemove', '--sync', ctx.parkPointer.x, ctx.parkPointer.y);
      // the device case's `alreadyInFront`: the front window back in its corner, the window raised, then activated
      desktop.arrangeFront('visible');
      desktop.raise(scene);
      xdotool('windowactivate', '--sync', scene.id);
      await sleep(COLD_SETTLE_MS);
      runs[spec.label].push(await oneDrag(ctx, spec, scene, family, at[spec.label], engine, i, { cold: true, cover_ms: coverMs, prelude: prelude ? 'dedicated' : null, pointer_at_press: pointerAt() }));
    } finally {
      await engine.close();
    }
  }
  return runs;
}

/**
 * The Chrome windows the m3-gate run had open besides the drag page and the stub, per scene, as run.mjs opens them for a
 * full verdict run (a shared window for reads, one per engine for input and screenshots, one per engine for text): the
 * Chrome the gate's cold drop met, whose stalls task 18 saw only in full runs.
 */
export const GATE_BALLAST = { chrome: 4, 'chrome-input': 3, 'over-budget': 1, retention: 3, 'chrome-textarea': 3, 'chrome-address-bar': 3, 'device-chrome': 1 };

/**
 * The device case a block runs just before its cold short drop in front (device.mjs, `chrome_dnd_covered_dedicated`):
 * the window covered, its settle, then cua in dedicated mode drags the long path into it through the foreground route
 * (activated, XTEST: the real pointer ends at the drop zone), and the front window takes the focus back.
 */
async function dedicatedDrop(ctx, scene, at, { cua }) {
  const { desktop, emit } = ctx;
  const engine = new Engine({ label: 'prelude', bin: cua, args: ['--desktop', 'dedicated'] }).start();
  try {
    desktop.arrangeFront('covered');
    await sleep(COLD_SETTLE_MS);
    const { response, ms } = await engine.request('drag', { window: { id: scene.id }, path: runPath(at, 'dnd', 0) });
    emit({ kind: 'dnd-prelude', window: scene.id, ok: response.ok === true, error: response.ok ? undefined : String(response.error).slice(0, 300), ms: Math.round(ms * 10) / 10 });
    await sleep(400);
  } finally {
    await engine.close();
  }
  desktop.focusFront();
}

/** The device case's settle before a drag-and-drop sample (device.mjs `DND_SETTLE_MS`). */
const COLD_SETTLE_MS = 1200;

/** `xprobe grabs` started `ms` after now: when it started (ms after now) and what it found. */
function foreignGrabAfter(ms) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    setTimeout(() => {
      const started = Date.now() - t0;
      const child = spawn(XPROBE, ['grabs'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (d) => {
        out += d;
      });
      child.once('error', () => resolve({ started_ms: started, found: null }));
      child.once('exit', () => {
        let found = null;
        try {
          found = JSON.parse(out);
        } catch {
          // the probe failed
        }
        resolve({ started_ms: started, found });
      });
    }, ms);
  });
}

/** The real pointer's place on the screen (`xdotool getmouselocation`). */
function pointerAt() {
  const out = xdotool('getmouselocation', '--shell');
  const get = (k) => Number(out.match(new RegExp(`^${k}=(\\d+)`, 'm'))?.[1]);
  return { x: get('X'), y: get('Y') };
}

/** `stray.kind` (`nudge` or `popup`) at the real pointer, `stray.ms` after now: when it began and where. */
function strayAfter({ kind, ms }) {
  const t0 = Date.now();
  const at = pointerAt();
  return new Promise((resolve) => {
    setTimeout(() => {
      const started = Date.now() - t0;
      const done = () => resolve({ kind, started_ms: started, at, took_ms: Date.now() - t0 - started });
      if (kind === 'nudge') {
        const child = spawnXdotool(['mousemove_relative', '--', '1', '0', 'mousemove_relative', '--', '-1', '0'], { stdio: 'ignore' });
        child.once('exit', done);
        child.once('error', done);
      } else {
        const child = spawnXprobe(['popup', at.x - 2, at.y - 2, 5, 5, 5], { stdio: 'ignore' });
        child.once('exit', done);
        child.once('error', done);
      }
    }, ms);
  });
}

/** The drag page's drag-and-drop counters, without the pointer log. */
const counts = ({ log, ...rest }) => rest;

/** One drag in its witness span, the probes around it, and its run row, emitted. */
async function oneDrag(ctx, spec, scene, family, at, engine, i, extra = {}) {
  const { desktop, witness, emit, occlusion } = ctx;
  const before = desktopState();
  const page = await readEffect(ctx, scene, at, 'dnd');
  const drops = page.drops;
  // `--no-grabs`: no sampler during the drag (its own grabs can fail Chrome's), the grab after the answer still read
  const probes = ctx.grabs ? undefined : { startGrabs: async () => ({ stop: async () => [] }) };
  let foreignGrab = null;
  let strayEvent = null;
  const { value, w, report, during, afterAnswer, grabAfter, owners } = await withDropProbes(async ({ xdnd, grabs }) => {
    const { value, witness: w, report } = await witness.span(`${spec.label}:dnd`, () => {
      // measurement only (`--grab-at-ms`): another client grabs the pointer and the keyboard for a moment that long
      // after the request is sent (`xprobe grabs`), as the dnd experiment's grab sampler did at random
      if (ctx.grabAtMs !== undefined) foreignGrab = foreignGrabAfter(ctx.grabAtMs);
      // measurement only (`--stray`): a pointer event that is not the drag's, that long after the request is sent:
      // the real pointer nudged a pixel and back (XTEST), or another client's window mapped under it for 5 ms
      if (ctx.stray) strayEvent = strayAfter(ctx.stray);
      return engine.request('drag', { window: { id: scene.id }, path: runPath(at, ctx.path, i) });
    });
    const during = await grabs.stop();
    const afterAnswer = desktopState();
    const grabAfter = JSON.parse(execFileSync(XPROBE, ['grabs'], { encoding: 'utf8' }));
    const owners = await xdnd.stop();
    return { value, w, report, during, afterAnswer, grabAfter, owners };
  }, probes);
  await sleep(1000);
  const later = desktopState();
  const after = await readEffect(ctx, scene, at, 'dnd');
  const dropped = after.drops;
  const run = {
    kind: 'dnd-run',
    family,
    occlusion,
    engine: spec.label,
    i,
    ok: value.response.ok === true,
    error: value.response.ok ? undefined : String(value.response.error).slice(0, 300),
    ms: Math.round(value.ms * 10) / 10,
    stats_route: value.stats?.route,
    stats_dnd: value.stats?.dnd,
    stats_after_take: value.stats?.after_take,
    stats_hold: value.stats?.hold,
    stats_event_time: value.stats?.event_time,
    // the rest of the engine's --stats line, whatever a measurement build adds to it
    stats_extra: value.stats ? Object.fromEntries(Object.entries(value.stats).filter(([k]) => !['bus', 'route', 'dnd', 'after_take', 'hold', 'event_time'].includes(k))) : undefined,
    dropped: typeof drops === 'number' && dropped === drops + 1,
    witness: w.clean,
    witness_fields: w.fields,
    // the witness's record: each change read back (a notify that left the value as it was is marked `notify`), the
    // activation requests, and whether any restack moved a mapped window that is not override-redirect
    witness_changes: (report.changes ?? []).slice(0, 20),
    activations: (report.focus ?? []).filter((e) => e.kind === 'activate'),
    restacked_managed: (judgeRestacks(report, null).violations ?? []).filter((e) => !e.or).length,
    focus_events: (report.focus ?? []).slice(0, 30),
    restacks: (report.restacks ?? []).slice(0, 30),
    xdnd_owners: owners,
    grabs_during: during,
    grab_after: grabAfter,
    before,
    changed_at_answer: changedFields(before, afterAnswer),
    changed_later: changedFields(before, later),
    after_answer: afterAnswer,
    later,
    // the page's pointer log of the drag (task 20), and the cold run's conditions
    page_counts: { before: counts(page), after: counts(after) },
    page_log: after.log,
    ...(foreignGrab ? { foreign_grab: await foreignGrab } : {}),
    ...(strayEvent ? { stray: await strayEvent } : {}),
    ...extra,
  };
  emit(run);
  desktop.focusFront();
  await sleep(700);
  return run;
}

/** A lane's summary row. */
function summaryRow(family, label, runs, n) {
  const count = (pred) => runs.filter(pred).length;
  const fields = (key) => {
    const all = runs.flatMap((r) => r[key]);
    const tally = [...new Set(all)].map((f) => `${f} ${all.filter((x) => x === f).length}`);
    return tally.length ? tally.join(', ') : 'none';
  };
  const grabbed = (g) => g.pointer !== 'free' || g.keyboard !== 'free';
  // cua's answers: the declared refusal (deviations.mjs: the cancel before the drop), or that the drop may have happened
  const answers = `${count((r) => DND_REFUSAL.test(r.error ?? ''))} / ${count((r) => /could not be cancelled in time/.test(r.error ?? ''))}`;
  return `| ${family} | ${label} | ${count((r) => r.dropped)}/${n} | ${answers} | ${fields('witness_fields')} | ${count((r) => r.xdnd_owners.some((o) => o.owner !== 0))}/${n} | ${count((r) => r.grabs_during.length > 0)}/${n} | ${count((r) => grabbed(r.grab_after))}/${n} | ${fields('changed_at_answer')} | ${fields('changed_later')} |`;
}

export async function runDnd(args, { desktop, emit }) {
  const n = args.samplesTrials ?? 10;
  const lanes = dndLanes(args);
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront(args.occlusion === 'covered' ? 'covered' : 'visible');
  const witness = await startWitness(XPROBE);
  const ctx = { desktop, oracle, witness, emit, occlusion: args.occlusion, grabs: args.grabs !== false, path: args.dndShort ? 'dnd-short' : 'dnd', grabAtMs: args.grabAtMs, stray: args.stray, parkPointer: args.parkPointer };
  const md = [
    `HTML5 drag and drop (pages/drag.html's \`${ctx.path}\` path), ${n} drags a lane, each window ${args.dndCold ? `in front, every drag a fresh engine's first request${args.coverMs ? ` after ${args.coverMs} ms under a full cover` : ''}` : args.occlusion} (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.`,
    '',
    '| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |',
    '|---|---|---:|---|---|---:|---:|---:|---|---|',
  ];
  const ballast = [];
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    if (args.ballast === 'gate') {
      for (const [scene, n] of Object.entries(GATE_BALLAST)) {
        for (let k = 0; k < n; k++) ballast.push(await openScene(desktop, scene, `ballast${k}`, { text: ['chrome-textarea', 'chrome-address-bar'].includes(scene) }));
      }
    }
    for (const family of args.families?.length ? args.families : ['chrome']) {
      const scenes = {};
      try {
        const geometry = family === 'firefox' ? FAMILIES.firefox.geometry : null;
        for (const l of lanes) {
          scenes[l.label] = await openFamily(desktop, oracle, family, `dnd${l.label.replace(/[^a-z0-9]+/gi, '')}`, { page: PAGE, geometry });
          scenes[l.label].kindOf = 'page';
        }
        desktop.arrangeFront(args.occlusion === 'covered' ? 'covered' : 'visible');
        await sleep(1000);
        const prelude = args.prelude === 'dedicated' ? { cua: args.cua } : null;
        const runs = args.dndCold ? await coldSeries(ctx, lanes, scenes, family, n, { coverMs: args.coverMs, prelude }) : null;
        for (const spec of lanes) {
          md.push(summaryRow(family, spec.label, runs?.[spec.label] ?? (await series(ctx, spec, scenes[spec.label], family, n)), n));
          process.stdout.write(`${md.at(-1)}\n`);
        }
      } finally {
        await desktop.close(Object.values(scenes));
      }
    }
  } finally {
    await desktop.close(ballast);
    await witness.stop();
  }
  return { md, complete: true, failed: [] };
}
