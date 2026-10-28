// The application-family matrix (M0.4; Plan of Work, M0, Matrix; Design, Device mode and the foreground route):
// per family, whether the background route's click, key and type_text take effect, with the witness watching
// every request, and the family's `Application.ToolkitName` and X11 class. The same well-formed requests go to the
// pinned and newest vendor builds and to cua-engine with M0.3's choice; type_text goes to the vendor builds only
// (the spike has none; M2 owns cua's). `cua:none` (no RedirectWindow) shows whether a family needs the redirect
// for background input. Each engine gets its own window of the family, fully covered by the harness's front
// window (`--occlusion covered`, the default) or raised above the other scene windows with the front window in a
// corner (`--occlusion visible`), and its own fresh process; effects are read back through the application's objects
// (oracle.mjs), for a terminal through what its program received, and for Writer without AT-SPI as pixels.

import { Engine } from './engine.mjs';
import { FAMILIES, familyNames, openFamily, readCaret, readCounter, readText, textArea, wmClass } from './families.mjs';
import { caretArrived, clickPoints, counterArrived, keyArrived, terminalClickArrived, typedArrived } from './matrix-judge.mjs';
import { Oracle } from './oracle.mjs';
import { captureWindow, pixelsChanged } from './pixels.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE } from './scenes.mjs';
import { startWitness } from './witness.mjs';

/**
 * cua-engine as it ships: its defaults are M0's choices (W 32, no input settle, no key pacing, the readiness rule
 * before a capture; Decision Log, M0.3, M0.4, M1a.2), so the matrix measures them without flags.
 */
export const CUA_CHOICE = [];
const CUA_NONE = ['--retention', 'none'];
const VENDORS = ['pinned', 'newest'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chars = (s) => [...(s ?? '')];

async function poll(read, judge, ms) {
  const deadline = Date.now() + ms;
  let verdict = null;
  for (;;) {
    const after = await read();
    verdict = judge(after);
    if (verdict === true || Date.now() > deadline) return { verdict, after };
    await sleep(50);
  }
}

function engines(args) {
  return [
    { label: 'pinned', bin: args.vendor, args: [] },
    { label: 'newest', bin: args.newest, args: [] },
    { label: 'cua', bin: args.cua, args: CUA_CHOICE },
    { label: 'cua:none', bin: args.cua, args: CUA_NONE },
  ];
}

/**
 * The effect read as pixels (pixels.mjs): a change below the title rows is the effect; no change is `unchanged`
 * (false for a key, which must draw; unknown for a click, which may draw nothing in a window without the focus).
 */
async function pixelEffect(ctx, scene, before, { unchanged }) {
  await sleep(300);
  const after = await captureWindow(ctx.cua, scene, ctx.dir);
  const changed = pixelsChanged(before, after);
  return changed === null ? null : changed ? true : unchanged;
}

async function keySeries(ctx, engine, scene, n) {
  const { desktop, oracle, witness, emit, family } = ctx;
  const append = scene.kindOf === 'terminal';
  const start = await readText(desktop, oracle, scene);
  for (let i = 0; i < n; i++) {
    const before = await readText(desktop, oracle, scene);
    const key = !append && before !== null && chars(before).length > chars(start).length ? 'BackSpace' : 'x';
    const shotBefore = scene.pixels ? await captureWindow(ctx.cua, scene, ctx.dir) : null;
    const { value, witness: w } = await witness.span(`${engine.label}:${family}:key`, () => engine.request('press_key', { window: { id: scene.id }, key }));
    const ok = value.response.ok === true;
    let verdict = null;
    if (ok && scene.pixels) verdict = await pixelEffect(ctx, scene, shotBefore, { unchanged: false });
    else if (ok) ({ verdict } = await poll(() => readText(desktop, oracle, scene), (after) => keyArrived(key, before, after, { append }), 1500));
    emit({ kind: 'matrix-sample', family, engine: engine.label, op: 'key', i, key, oracle: scene.pixels ? 'pixels' : undefined, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), ms: Math.round(value.ms * 10) / 10, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, effect: verdict });
  }
}

async function textSeries(ctx, engine, scene, n) {
  const { desktop, oracle, witness, emit, family } = ctx;
  for (let i = 0; i < n; i++) {
    const marker = `cua171 Ωé🙂 ${engine.label}${i}`;
    // a terminal receives the paste as UTF-8 bytes
    const read = () => readText(desktop, oracle, scene, { utf8: scene.kindOf === 'terminal' });
    const before = await read();
    const { value, witness: w } = await witness.span(`${engine.label}:${family}:type_text`, () => engine.request('type_text', { window: { id: scene.id }, text: marker }));
    const ok = value.response.ok === true;
    // judged whatever the answer: a failed answer after an applied paste is the newest build's false error
    const { verdict } = await poll(read, (after) => typedArrived(marker, before, after), ok ? 3000 : 1000);
    emit({ kind: 'matrix-sample', family, engine: engine.label, op: 'type_text', i, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), ms: Math.round(value.ms * 10) / 10, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, effect: verdict });
  }
}

function clickTarget(oracle, scene, i) {
  const origin = { x: scene.window.x, y: scene.window.y };
  if (scene.kindOf === 'terminal') return { point: { x: Math.round(scene.window.width / 2), y: Math.round(scene.window.height / 2) } };
  // the matrix page's button spans the top 40% of the page, below the browser's own ~90 px of tabs and toolbar; a
  // covered Firefox reports no extents for content it has not painted, so the point is the layout's, not the tree's
  if (scene.kindOf === 'page') return { point: { x: Math.round(scene.window.width / 2), y: 220 } };
  if (scene.kindOf === 'electron') {
    if (!scene.button) return { point: { x: Math.round(scene.window.width / 2), y: Math.round(scene.window.height * 0.25) } };
    const e = oracle.extents(scene.button);
    return { point: { x: Math.round(e.x + e.w / 2 - origin.x), y: Math.round(e.y + e.h / 2 - origin.y) } };
  }
  // an editor: alternately low in the text area (the caret goes to the last line) and at its first character, far
  // apart, so no two clicks make a double click
  const target = i % 2 === 0 ? 'end' : 'start';
  const area = textArea(oracle, scene);
  if (!area) return { target, point: { x: Math.round(scene.window.width / 2), y: Math.round(scene.window.height * 0.6) } };
  return { target, point: clickPoints(area, origin)[target] };
}

async function clickSeries(ctx, engine, scene, n) {
  const { desktop, oracle, witness, emit, family } = ctx;
  for (let i = 0; i < n; i++) {
    const { target, point } = clickTarget(oracle, scene, i);
    let read;
    let judge;
    const shotBefore = scene.pixels ? await captureWindow(ctx.cua, scene, ctx.dir) : null;
    if (scene.pixels) {
      read = null;
    } else if (scene.kindOf === 'terminal') {
      const before = await readText(desktop, oracle, scene);
      read = () => readText(desktop, oracle, scene);
      judge = (after) => terminalClickArrived(before, after);
    } else if (scene.kindOf === 'page' || scene.kindOf === 'electron') {
      const before = await readCounter(desktop, oracle, scene);
      read = () => readCounter(desktop, oracle, scene);
      judge = (after) => counterArrived(before, after);
    } else {
      const before = await readCaret(desktop, oracle, scene);
      read = () => readCaret(desktop, oracle, scene);
      judge = (after) => caretArrived(target, before, after);
    }
    const { value, witness: w } = await witness.span(`${engine.label}:${family}:click`, () => engine.request('click', { window: { id: scene.id }, ...point }));
    const ok = value.response.ok === true;
    let verdict = null;
    if (ok && scene.pixels) verdict = await pixelEffect(ctx, scene, shotBefore, { unchanged: null });
    else if (ok) ({ verdict } = await poll(read, judge, 1500));
    emit({ kind: 'matrix-sample', family, engine: engine.label, op: 'click', i, target, point, oracle: scene.pixels ? 'pixels' : undefined, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), ms: Math.round(value.ms * 10) / 10, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, effect: verdict });
    // past the double-click time, so the next click is a click of its own
    await sleep(600);
  }
}

const targetsOf = (scene) => ({ field: Boolean(scene.field), button: Boolean(scene.button), document: Boolean(scene.document) });

async function identify(desktop, oracle, scene, args) {
  const identity = { wm_class: wmClass(scene.id), source: scene.source, oracle_walk: scene.oracleWalk ?? null, tree_unsettled: Boolean(scene.unsettled) };
  if (scene.frame) Object.assign(identity, oracle.toolkit(scene.frame));
  const { response } = await desktop.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
  if (response.ok && response.output.ax_tree_source === 'at_spi') {
    let n = 0;
    const count = (node) => {
      n += 1;
      for (const c of node.children ?? []) count(c);
    };
    count(response.output.ax_tree);
    identity.nodes = n;
  }
  // the pinned build's own association of the same window
  const pinned = new Engine({ label: 'pinned', bin: args.vendor }).start();
  const { response: p } = await pinned.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
  await pinned.close();
  identity.source_pinned = p.ok ? p.output.ax_tree_source : `error: ${String(p.error).slice(0, 200)}`;
  identity.targets = targetsOf(scene);
  identity.kindOf = scene.pixels ? 'pixels' : scene.kindOf;
  return identity;
}

export async function runMatrix(args, { desktop, emit, run }) {
  if (!args.vendor || !args.newest) throw new Error('the matrix needs --vendor and --newest');
  const names = familyNames(args.families?.length ? args.families : Object.keys(FAMILIES));
  const n = args.samplesInput;
  const nText = args.samplesText;
  const list = engines(args);
  const oracle = new Oracle();
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront(args.occlusion);
  const witness = await startWitness(XPROBE);
  const results = [];
  try {
    const valid = await negativeCheck(desktop, witness, stubScene, emit);
    if (!valid) throw new Error('the witness did not fail the activating stub; the run is invalid');
    for (const family of names) {
      process.stdout.write(`family ${family}\n`);
      const scenes = {};
      try {
        for (const e of list) scenes[e.label] = await openFamily(desktop, oracle, family, e.label.replace(/[^a-z0-9]+/gi, ''));
        desktop.arrangeFront(args.occlusion);
        await sleep(1000);
        const identity = await identify(desktop, oracle, scenes.cua, args);
        // each engine has its own window: what its effects are read from is checked in every one
        identity.targets_by_engine = Object.fromEntries(Object.entries(scenes).map(([label, s]) => [label, targetsOf(s)]));
        emit({ kind: 'matrix-identity', family, title: FAMILIES[family].title, occlusion: args.occlusion, ...identity });
        const ctx = { desktop, oracle, witness, emit, family, cua: args.cua, dir: desktop.dir };
        for (const spec of list) {
          const scene = scenes[spec.label];
          if (args.occlusion === 'visible') desktop.raise(scene);
          const engine = new Engine(spec).start();
          try {
            await keySeries(ctx, engine, scene, n);
            if (VENDORS.includes(spec.label)) await textSeries(ctx, engine, scene, nText);
            await clickSeries(ctx, engine, scene, n);
          } finally {
            await engine.close();
          }
          desktop.focusFront();
        }
        results.push({ family, identity });
      } catch (error) {
        emit({ kind: 'matrix-error', family, error: String(error.stack ?? error).slice(0, 1000) });
        process.stdout.write(`family ${family} failed: ${error.message}\n`);
      } finally {
        await desktop.close(Object.values(scenes));
      }
    }
  } finally {
    await witness.stop();
  }
  return { run, results, names };
}

export { matrixMarkdown } from './matrix-judge.mjs';
