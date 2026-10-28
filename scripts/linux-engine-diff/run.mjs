// The differential run: the same well-formed requests to every engine, in blocks. A block is one engine with its
// process started fresh for the block, so nothing an engine retained outlives it: the cold sample (the first
// request after the spawn) and then the warm series. Block order rotates across the sitting. Tree reads of a scene
// window serve every engine; screenshots and input go to each engine's own equivalent window, so one engine's
// retained window is never the window another is measured on. Every window-targeted request runs inside a witness
// span; input effects are read back through the tree; accessibility-bus calls are counted in a separate pass.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMonitor } from './busmon.mjs';
import { DESKTOP_OPS } from './cli.mjs';
import { Engine } from './engine.mjs';
import { compareStates, normalizeState, retainedIds } from './normalize.mjs';
import { writeSummary } from './report.mjs';
import { Desktop, XPROBE, a11yBusAddress } from './scenes.mjs';
import { compareShots, xprobeDiff } from './images.mjs';
import { blockOrder, judgeOperation, runOutcome } from './stats.mjs';
import { startWitness } from './witness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VENDORS = ['pinned', 'newest'];

/** Which operations each scene runs. `tree` is get_window_state without the screenshot, `tree_shot` with it. */
export const SCENE_OPS = {
  desktop: DESKTOP_OPS,
  gedit: ['tree', 'tree_shot', 'press_key', 'click'],
  chrome: ['tree', 'tree_shot', 'press_key', 'click'],
  'over-budget': ['tree'],
  'big-text': ['tree'],
};
const OWN_WINDOW_OPS = new Set(['tree_shot', 'press_key', 'click']);
const INPUT_OPS = new Set(['press_key', 'click']);

/**
 * The plan: each scene's operations that `ops` names. An operation no scene has, a scene none of whose operations is
 * named, and a plan with nothing in it are refused, so a mistyped or unsupported operation never runs as a pass. A
 * plan of desktop operations alone (`--ops list_windows`) needs no scene and ignores the scenes it is given.
 */
export function planOps(scenes, ops) {
  const known = new Set(Object.values(SCENE_OPS).flat());
  if (ops !== 'all') for (const op of ops) if (!known.has(op)) throw new Error(`unknown operation ${op}; known: ${[...known].join(', ')}`);
  const plan = [];
  const wanted = (op) => ops === 'all' || ops.includes(op);
  const desktopOnly = ops !== 'all' && ops.length > 0 && ops.every((op) => SCENE_OPS.desktop.includes(op));
  for (const op of SCENE_OPS.desktop) if (wanted(op)) plan.push({ scene: 'desktop', op });
  for (const scene of scenes) {
    if (!SCENE_OPS[scene]) throw new Error(`unknown scene ${scene}`);
    if (desktopOnly) continue;
    if (scene === 'desktop' && ops === 'all') continue;
    const mine = SCENE_OPS[scene].filter(wanted);
    if (scene === 'desktop') {
      if (mine.length === 0) throw new Error(`scene desktop has none of the operations asked for (it has ${SCENE_OPS.desktop.join(', ')})`);
      continue;
    }
    if (mine.length === 0) throw new Error(`scene ${scene} has none of the operations asked for (it has ${SCENE_OPS[scene].join(', ')})`);
    for (const op of mine) plan.push({ scene, op });
  }
  if (plan.length === 0) throw new Error('nothing to run: no scene and no desktop operation');
  return plan;
}

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

function fileSha(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null;
  }
}

function gitHead() {
  try {
    return execFileSync('git', ['-C', here, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function engineVersion(bin) {
  try {
    return execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

const PAGE_OF = { chrome: 'scene.html', 'over-budget': 'over-budget.html', 'big-text': 'big-text.html' };
const GEDIT_TEXT = 'cua171 differential scene\nline two of the scratch file\n';

/**
 * The input each sample sends. gedit's press_key types `x` while the document is at its original length and takes
 * it back with BackSpace otherwise, so a key that did not arrive never makes a later BackSpace delete the scene's own
 * text. gedit's clicks alternate between two points far apart in the empty area below the text (they move only the
 * caret): clicks at one point less than the double-click time apart would be a double and a triple click, which
 * selects a line the next key then replaces. Chrome: the scene's big button.
 */
function inputFor(scene, op, i, before) {
  const [w, h] = scene.kind === 'chrome' ? [1050, 780] : [910, 756];
  if (op === 'press_key') {
    const key = scene.kind === 'gedit' ? (before.text.length > scene.originalLength ? 'BackSpace' : 'x') : 'x';
    return { window: { id: scene.id }, key };
  }
  if (scene.kind === 'chrome') return { window: { id: scene.id }, x: Math.round(w / 2), y: Math.round(h * 0.45) };
  return { window: { id: scene.id }, x: Math.round(w / 2) + (i % 2 ? 150 : -150), y: Math.round(h * 0.8) };
}

async function readEffect(desktop, scene, op) {
  if (scene.kind === 'gedit') return op === 'press_key' ? { text: await desktop.geditText(scene) } : null;
  return desktop.chromeCounters(scene);
}

/** Whether the effect arrived: gedit's text one longer or one shorter, Chrome's counter one higher. */
function effectArrived(scene, op, input, before, after) {
  if (!before || !after) return null;
  if (scene.kind === 'gedit') {
    if (op !== 'press_key' || before.text === null || after.text === null) return null;
    return input.key === 'x' ? after.text.length === before.text.length + 1 : after.text.length === before.text.length - 1;
  }
  return op === 'click' ? after.clicks === before.clicks + 1 : after.keys === before.keys + 1 && after.last === input.key;
}

async function pollEffect(desktop, scene, op, input, before) {
  const deadline = Date.now() + 1500;
  let after = null;
  for (;;) {
    after = await readEffect(desktop, scene, op);
    const arrived = effectArrived(scene, op, input, before, after);
    if (arrived !== false || Date.now() > deadline) return arrived;
    await sleep(30);
  }
}

/** The negative check: the activate-and-restore stub engine must fail the witness. Returns whether it did. */
export async function negativeCheck(desktop, witness, stubScene, emit) {
  const stub = new Engine({ label: 'stub-activating', bin: join(here, 'stub-activating.mjs') }).start();
  const { value, witness: w } = await witness.span('stub', () => stub.request('press_key', { window: { id: stubScene.id }, key: 'x' }));
  await stub.close();
  desktop.focusFront();
  const failed = !w.clean;
  emit({ kind: 'stub-check', ok: value.response.ok, witness: w, witness_failed_it: failed, audit: 'M1a' });
  process.stdout.write(`negative check: the witness ${failed ? 'failed' : 'PASSED'} the activating stub (${w.fields.join(', ') || 'no change'})\n`);
  return failed;
}

export async function runDiff(args) {
  const run = args.run ?? `run-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
  mkdirSync(args.out, { recursive: true });
  const results = join(args.out, 'results.jsonl');
  const emit = (row) => appendFileSync(results, `${JSON.stringify({ run, ...row })}\n`);
  if (!existsSync(XPROBE)) throw new Error(`build the harness's X client first: cargo build --release --manifest-path ${join(here, 'xprobe', 'Cargo.toml')}`);

  const engines = [
    { label: 'pinned', bin: args.vendor, args: [] },
    { label: 'newest', bin: args.newest, args: [] },
    { label: 'cua', bin: args.cua, args: [], stats: true },
    ...args.variants.map((v) => ({ label: v.label, bin: args.cua, args: v.args, stats: true })),
  ];
  const labels = engines.map((e) => e.label);
  const plan = planOps(args.scenes, args.ops);
  const samplesFor = (op) => (INPUT_OPS.has(op) ? args.samplesInput : args.samplesTree);

  emit({
    kind: 'meta',
    commit: gitHead(),
    cua_version: engineVersion(args.cua),
    engines: engines.map((e) => ({ label: e.label, args: e.args, sha256: fileSha(e.bin) })),
    vendor: args.vendor,
    newest: args.newest,
    scenes: args.scenes,
    ops: plan.map((p) => `${p.scene}:${p.op}`),
    blocks: args.blocks,
    samples_tree: args.samplesTree,
    samples_input: args.samplesInput,
    occlusion: args.occlusion,
    started: new Date().toISOString(),
  });

  const desktop = new Desktop({ cua: args.cua, run });
  // Every scene label of this run: equivalent windows differ in their own label and list each other's (gedit's
  // recent files), so comparisons across windows replace them all.
  const labelPattern = new RegExp(`cua171-diff-${run.replace(/[^A-Za-z0-9_-]/g, '\\$&')}-[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*`, 'g');
  let witness = null;
  let valid = true;
  const keep = {}; // first ok output per engine/scene/op, for the first difference
  const shots = []; // every tree_shot sample's screenshot
  let outcome = { valid: false, pass: false, failed: ['the run did not finish'], code: 1 };
  try {
    // Scenes: one shared window per scene for tree reads, one window per engine for screenshots and input.
    const windows = {};
    for (const scene of args.scenes) {
      const ops = plan.filter((p) => p.scene === scene).map((p) => p.op);
      const open = async (role) => {
        if (scene !== 'gedit') return desktop.openChrome(role, PAGE_OF[scene]);
        const opened = await desktop.openGedit(role, GEDIT_TEXT);
        opened.originalLength = (await desktop.geditText(opened)).length;
        return opened;
      };
      windows[scene] = { shared: ops.includes('tree') ? await open('read') : null, own: {} };
      if (ops.some((op) => OWN_WINDOW_OPS.has(op))) {
        for (const label of labels) windows[scene].own[label] = await open(label.replace(/[^a-z0-9]+/gi, '_'));
      }
    }
    const needsStub = plan.some((p) => INPUT_OPS.has(p.op));
    const stubScene = needsStub ? await desktop.openChrome('stub', 'scene.html') : null;
    await desktop.openFront(args.occlusion);
    witness = await startWitness(XPROBE);
    const busAddress = a11yBusAddress();

    if (stubScene && !(await negativeCheck(desktop, witness, stubScene, emit))) valid = false;

    for (let block = 0; block < args.blocks; block++) {
      for (const { scene: sceneName, op } of plan) {
        for (const label of blockOrder(labels, block)) {
          const spec = engines.find((e) => e.label === label);
          const target = sceneName === 'desktop' ? null : OWN_WINDOW_OPS.has(op) ? windows[sceneName].own[label] : windows[sceneName].shared;
          if (target && args.occlusion === 'visible') desktop.raise(target);
          const engine = new Engine(spec);
          const n = 1 + samplesFor(op);
          for (let i = 0; i < n; i++) {
            const series = i === 0 ? 'cold' : 'warm';
            const row = { kind: 'sample', engine: label, scene: sceneName, op, block, series, i };
            let request;
            let before = null;
            if (op === 'list_windows') request = ['list_windows', {}];
            else if (op === 'tree' || op === 'tree_shot') request = ['get_window_state', { window: { id: target.id }, include_screenshot: op === 'tree_shot' }];
            else {
              before = await readEffect(desktop, target, op);
              request = [op, inputFor(target, op, i, before)];
            }
            // The engine starts inside the first sample's span, after the before-state is read and the witness is
            // watching: the cold time is the engine's start and its first request, nothing of the harness's.
            const send = () => {
              if (i === 0) engine.start();
              return engine.request(...request);
            };
            const answered = target ? await witness.span(`${label}:${sceneName}:${op}`, send) : { value: await send(), witness: null };
            const { response, ms, sinceSpawnMs, stats } = answered.value;
            row.ms = Math.round((series === 'cold' ? sinceSpawnMs : ms) * 100) / 100;
            row.request_ms = Math.round(ms * 100) / 100;
            row.ok = response.ok === true;
            if (!row.ok) row.error = String(response.error).slice(0, 300);
            if (answered.witness) row.witness = answered.witness.clean;
            if (answered.witness && !answered.witness.clean) row.witness_fields = answered.witness.fields;
            if (stats) {
              row.stats = { calls: stats.bus.calls, waits_alone: stats.bus.waits_alone, max_in_flight: stats.bus.max_in_flight, connections: stats.bus.connections };
              if (stats.tree) row.stats.tree = stats.tree;
            }
            if (row.ok && op === 'list_windows') {
              row.digest = sha(JSON.stringify(response.output));
              row.windows = response.output.length;
              keep[`${label}|${sceneName}|${op}`] ??= response.output;
            } else if (row.ok && (op === 'tree' || op === 'tree_shot')) {
              const exactIds = op === 'tree';
              const normalized = normalizeState(response.output, { exactIds, label: exactIds ? null : labelPattern });
              row.digest = sha(JSON.stringify(normalized));
              row.nodes = retainedIds(response.output).length;
              row.source = response.output.ax_tree_source;
              const key = `${label}|${sceneName}|${op}`;
              keep[key] ??= { output: response.output, label: exactIds ? null : labelPattern };
              if (op === 'tree_shot') {
                // every sample's screenshot is kept for the comparison after the blocks
                const copy = join(desktop.dir, `${label.replace(/[^a-z0-9]+/gi, '_')}-${sceneName}-${block}-${i}.jpg`);
                if (response.output.screenshots[0]) copyFileSync(response.output.screenshots[0].filepath, copy);
                shots.push({ engine: label, scene: sceneName, op, block, i, image: response.output.screenshots[0] ? copy : null });
              }
              for (const shot of response.output.screenshots) {
                if (shot.filepath.startsWith('/tmp/') && !shot.filepath.startsWith('/tmp/cua-engine-')) rmSync(shot.filepath, { force: true });
              }
            } else if (row.ok && INPUT_OPS.has(op)) {
              row.effect = await pollEffect(desktop, target, op, request[1], before);
              if (row.effect === null) delete row.effect;
            }
            emit(row);
          }
          await engine.close();
          // gedit's press_key series ends with the document back at its original length
          if (op === 'press_key' && target.kind === 'gedit' && (await desktop.geditText(target)).length > target.originalLength) {
            const fix = new Engine({ label: 'restore', bin: args.cua }).start();
            await fix.request('press_key', { window: { id: target.id }, key: 'BackSpace' });
            await fix.close();
          }
        }
      }
    }

    // Accessibility-bus calls, in their own untimed pass: a fresh process per engine, the cold read then a warm one.
    if (args.counts) {
      for (const { scene: sceneName, op } of plan.filter((p) => p.op === 'tree')) {
        const target = windows[sceneName].shared;
        for (const spec of engines) {
          const engine = new Engine(spec);
          let names = [];
          for (const pass of ['cold', 'warm']) {
            const monitor = await startMonitor(busAddress);
            if (pass === 'cold') engine.start();
            const { response, stats } = await engine.request('get_window_state', { window: { id: target.id }, include_screenshot: false });
            const calls = await monitor.stop({ names });
            names = Object.keys(calls.by_connection);
            const row = { kind: 'counts', engine: spec.label, scene: sceneName, op, pass, ok: response.ok === true, calls: calls.calls, serial_calls: calls.serial_calls, max_in_flight: calls.max_in_flight, connections: calls.connections, by_member: calls.by_member };
            if (response.ok) row.nodes = retainedIds(response.output).length;
            if (stats) row.engine_reported = { calls: stats.bus.calls, waits_alone: stats.bus.waits_alone, wasted: stats.tree?.wasted_calls ?? null };
            emit(row);
          }
          await engine.close();
        }
      }
    }

    // Screenshots: every sample's against the pinned build's of its block, before any verdict is drawn.
    const rows = readFileSync(results, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.run === run && r.kind === 'sample');
    const imageOf = new Map();
    for (const c of compareShots(shots, xprobeDiff(XPROBE))) {
      const { image, ...rest } = c;
      emit({ kind: 'image', ...rest });
      imageOf.set(`${c.engine}|${c.scene}|${c.op}|${c.block}|${c.i}`, c.ok);
    }

    // Verdicts: each sample's output against the pinned build's, then the operation judged per candidate.
    const verdicts = [];
    for (const { scene: sceneName, op } of plan) {
      const opRows = rows.filter((r) => r.scene === sceneName && r.op === op);
      // The reference is the pinned build's answer in the same block: a scene's own windows change across blocks
      // (gedit marks a document modified, a counter grows), and so does the window list.
      const reference = (block) => mode(opRows.filter((r) => r.engine === 'pinned' && r.ok && r.block === block).map((r) => r.digest));
      const refKept = keep[`pinned|${sceneName}|${op}`];
      for (const r of opRows) {
        if (!r.digest) continue;
        const image = imageOf.get(`${r.engine}|${r.scene}|${r.op}|${r.block}|${r.i}`);
        r.equal = r.digest === reference(r.block) && image !== false;
      }
      for (const candidate of labels.filter((l) => !VENDORS.includes(l))) {
        const verdict = judgeOperation(opRows.filter((r) => [...VENDORS, candidate].includes(r.engine)), { vendors: VENDORS, candidate });
        const extra = {};
        const kept = keep[`${candidate}|${sceneName}|${op}`];
        if (kept && refKept && op !== 'list_windows') {
          const cmp = compareStates(refKept.output, kept.output, { exactIds: op === 'tree', labelA: refKept.label, labelB: kept.label });
          extra.first_comparison = cmp;
          if (sceneName === 'over-budget') extra.retained_ids_equal = JSON.stringify(retainedIds(refKept.output)) === JSON.stringify(retainedIds(kept.output));
        }
        const row = { kind: 'verdict', scene: sceneName, op, candidate, ...verdict, ...extra };
        verdicts.push(row);
        emit(row);
      }
      for (const vendor of ['newest']) {
        const kept = keep[`${vendor}|${sceneName}|${op}`];
        if (kept && refKept && op !== 'list_windows') {
          emit({ kind: 'vendor-agreement', scene: sceneName, op, engine: vendor, first_comparison: compareStates(refKept.output, kept.output, { exactIds: op === 'tree', labelA: refKept.label, labelB: kept.label }) });
        }
      }
    }
    // the equal flags are folded into the verdicts; record the per-sample equality summary too
    for (const label of labels) {
      for (const { scene: sceneName, op } of plan) {
        const mine = rows.filter((r) => r.engine === label && r.scene === sceneName && r.op === op && r.digest);
        if (mine.length) emit({ kind: 'equality', engine: label, scene: sceneName, op, equal: mine.filter((r) => r.equal).length, of: mine.length });
      }
    }
    outcome = runOutcome(verdicts, { valid });
    emit({ kind: 'end', valid: outcome.valid, pass: outcome.pass, failed: outcome.failed, finished: new Date().toISOString() });
  } finally {
    if (witness) await witness.stop();
    await desktop.closeAll();
  }
  writeSummary(args.out);
  process.stdout.write(
    `run ${outcome.valid ? 'valid' : 'INVALID (the negative check did not hold)'}; ${outcome.pass ? 'every verdict PASS' : `FAIL: ${outcome.failed.join(', ')}`}\nresults: ${results}\n`,
  );
  return outcome.code === 0;
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)) best = v;
  return best;
}
