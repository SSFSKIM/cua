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

import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { PAGE, locate, readEffect, runPath } from './drag.mjs';
import { Engine } from './engine.mjs';
import { FAMILIES, openFamily } from './families.mjs';
import { Oracle } from './oracle.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE, activeWindow } from './scenes.mjs';
import { stacking } from './clip.mjs';
import { startWitness } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The desktop state a drop could change: the active window, the X input focus, the stacking order. */
export function desktopState() {
  const focus = execFileSync('xdotool', ['getwindowfocus'], { encoding: 'utf8' }).trim();
  return { active: activeWindow(), focus: Number(focus), stacking: stacking() };
}

/** Which fields of the desktop state differ between two reads. */
export function changedFields(a, b) {
  return ['active', 'focus', 'stacking'].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** A running `xprobe selection-watch XdndSelection`: `stop()` answers its owner changes. */
async function watchXdnd() {
  const child = spawn(XPROBE, ['selection-watch', 'XdndSelection'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  const rl = createInterface({ input: child.stdout });
  const ready = new Promise((resolve) => rl.once('line', resolve));
  rl.on('line', (l) => lines.push(JSON.parse(l)));
  await ready;
  return {
    async stop() {
      child.stdin.end();
      await new Promise((r) => child.once('exit', r));
      return lines.filter((l) => !l.ready);
    },
  };
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
  return [
    { label: 'pinned', bin: args.vendor, args: [] },
    ...(args.newest ? [{ label: 'newest', bin: args.newest, args: [] }] : []),
    { label: 'cua', bin: args.cua, args: [] },
    ...args.variants.map((v) => ({ ...v, bin: args.cua })),
  ];
}

/** One lane's drags into its own window: the run rows, each emitted. */
async function series(ctx, spec, scene, family, n) {
  const { desktop, witness, emit, occlusion } = ctx;
  desktop.arrange(scene, occlusion);
  const at = await locate(ctx, scene, ['dnd']);
  const engine = new Engine(spec).start();
  const runs = [];
  try {
    for (let i = 0; i < n; i++) {
      desktop.arrange(scene, occlusion);
      await sleep(400);
      const before = desktopState();
      const drops = (await readEffect(ctx, scene, at, 'dnd')).drops;
      const xdnd = await watchXdnd();
      const grabs = sampleGrabs();
      const { value, witness: w, report } = await witness.span(`${spec.label}:dnd`, () => engine.request('drag', { window: { id: scene.id }, path: runPath(at, 'dnd', i) }));
      const during = await grabs.stop();
      const afterAnswer = desktopState();
      const grabAfter = JSON.parse(execFileSync(XPROBE, ['grabs'], { encoding: 'utf8' }));
      const owners = await xdnd.stop();
      await sleep(1000);
      const later = desktopState();
      const dropped = (await readEffect(ctx, scene, at, 'dnd')).drops;
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
        dropped: typeof drops === 'number' && dropped === drops + 1,
        witness: w.clean,
        witness_fields: w.fields,
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
      };
      emit(run);
      runs.push(run);
      desktop.focusFront();
      await sleep(700);
    }
  } finally {
    await engine.close();
  }
  return runs;
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
  return `| ${family} | ${label} | ${count((r) => r.dropped)}/${n} | ${fields('witness_fields')} | ${count((r) => r.xdnd_owners.some((o) => o.owner !== 0))}/${n} | ${count((r) => r.grabs_during.length > 0)}/${n} | ${count((r) => grabbed(r.grab_after))}/${n} | ${fields('changed_at_answer')} | ${fields('changed_later')} |`;
}

export async function runDnd(args, { desktop, emit }) {
  const n = args.samplesTrials ?? 10;
  const lanes = dndLanes(args);
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront(args.occlusion === 'covered' ? 'covered' : 'visible');
  const witness = await startWitness(XPROBE);
  const md = [
    `HTML5 drag and drop (pages/drag.html's \`dnd\` path), ${n} drags a lane, each window ${args.occlusion} (dnd.mjs). Columns: drops that landed; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.`,
    '',
    '| family | lane | drops | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |',
    '|---|---|---:|---|---:|---:|---:|---|---|',
  ];
  const ctx = { desktop, oracle, witness, emit, occlusion: args.occlusion };
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
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
        for (const spec of lanes) {
          md.push(summaryRow(family, spec.label, await series(ctx, spec, scenes[spec.label], family, n), n));
          process.stdout.write(`${md.at(-1)}\n`);
        }
      } finally {
        await desktop.close(Object.values(scenes));
      }
    }
  } finally {
    await witness.stop();
  }
  return { md, complete: true, failed: [] };
}
