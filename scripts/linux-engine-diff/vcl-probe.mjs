// T16's LibreOffice point probes (#171 M4; measured, never judged; run as `--experiment writer-drag --plan element` or
// `--plan hierarchy`, writer-drag.mjs). LibreOffice on its gtk3 VCL plugin reports what VCL draws too high by its native
// menu bar's height after a ConfigureNotify and until the next pointer event (engine `vcl.rs`, vcl-aim.mjs):
// - `hierarchy`: each LibreOffice window's AT-SPI levels from its frame down, after the harness's arrangement, after a
//   background move and after the arrangement again, so the host panel and VCL's root pane show the offset;
// - `element`: an engine's element right click, located by the context menu VCL opens at the press (and, for a plain
//   GTK 3 window the window manager frames, by the press its button records), against the element's true centre as the
//   harness itself reads it from the host panel (`vclShift`), on a fresh window and after that first pointer event.

import { join } from 'node:path';

import { DRAG_DOC } from './drag.mjs';
import { Engine } from './engine.mjs';
import { openFamily } from './families.mjs';
import { Oracle } from './oracle.mjs';
import { PAGES, XPROBE, placeOnScreen, xdotool } from './scenes.mjs';
import { LIBREOFFICE_FAMILIES, vclShift } from './vcl-aim.mjs';
import { startWitness } from './witness.mjs';
import { xExecFileSync } from './xspawn.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every name and text in a tree, preorder. */
function preorderNames(node, out = []) {
  for (const t of [node.name, node.value, node.text]) if (typeof t === 'string') out.push(t);
  for (const c of node.children ?? []) preorderNames(c, out);
  return out;
}

/** The override-redirect windows mapped on the screen now, by id: `{x, y, w, h}` (a context menu among them). */
function popups() {
  const ids = [...xExecFileSync('xwininfo', ['-root', '-children'], { encoding: 'utf8', timeout: 5000 }).matchAll(/^\s+(0x[0-9a-f]+)/gm)].map((m) => m[1]);
  const out = {};
  for (const id of ids) {
    let info;
    try {
      info = xExecFileSync('xwininfo', ['-id', id], { encoding: 'utf8', timeout: 5000 });
    } catch {
      continue;
    }
    if (!/Map State: IsViewable/.test(info) || !/Override Redirect State: yes/.test(info)) continue;
    const n = (label) => Number(info.match(new RegExp(`${label}:\\s+(-?\\d+)`))?.[1]);
    out[id] = { x: n('Absolute upper-left X'), y: n('Absolute upper-left Y'), w: n('Width'), h: n('Height') };
  }
  return out;
}

/** The context menu a right click opened: the override-redirect window that was not there before, or null. */
async function menuAfter(before) {
  for (let tries = 0; tries < 20; tries++) {
    await sleep(100);
    const now = popups();
    const fresh = Object.entries(now).filter(([id]) => !before[id]);
    if (fresh.length) return { id: fresh[0][0], ...fresh[0][1] };
  }
  return null;
}

/** A plain GTK 3 window the window manager frames (pages/point-gtk3.py), whose button records where a press lands. */
async function openPointScene(desktop, label) {
  desktop.assertOpen();
  const title = desktop.label('pointgtk3', label);
  const child = desktop.spawnApp(title, 'python3', ['-I', join(PAGES, 'point-gtk3.py'), title], { app: 'gtk3-frame' });
  const scene = { kind: 'family', family: 'gtk3-frame', kindOf: 'point', role: label, label: title, pid: child.pid, group: true };
  desktop.windows.push(scene);
  scene.id = (await desktop.waitForWindow((w) => w.title === title, title, 30000)).id;
  placeOnScreen(scene.id, 600, 400);
  await sleep(800);
  const state = await desktop.state(scene);
  scene.window = state.window;
  scene.frame = state.ax_tree.id;
  return scene;
}

/**
 * The element each family's right click aims at: VCL content in LibreOffice (Calc's sheet as a whole, since its cells'
 * objects are made on demand and an engine cannot resolve them again), the point scene's button.
 */
const TARGET_ROLES = { writer: ['paragraph'], calc: ['table'], impress: ['paragraph', 'text', 'shape'], 'gtk3-frame': ['push button'] };

/** The centre of a rectangle `{x, y, w, h}` clipped to the window, floored, as the engine takes it (`visible_point`). */
export function clippedCentre(e, win) {
  const x0 = Math.max(e.x, win.x);
  const y0 = Math.max(e.y, win.y);
  const x1 = Math.min(e.x + e.w, win.x + win.width);
  const y1 = Math.min(e.y + e.h, win.y + win.height);
  return { x: Math.floor(x0 + (x1 - x0) / 2), y: Math.floor(y0 + (y1 - y0) / 2) };
}

/** A right click landed on its element when where it landed is within 2 px of the element's true centre. */
export const onElement = (landed, truth) => Boolean(landed && truth) && Math.abs(landed.x - truth.x) <= 2 && Math.abs(landed.y - truth.y) <= 2;

/**
 * One engine's element right click (`click {element_id, mouse_button: right}`) on `n` fresh windows of a family, then
 * again on each after that first pointer event. Where it landed: the corner of the context menu VCL opens at the press
 * (one pixel below it), or the press the point scene's button records. The truth: the element's centre as the harness
 * reads it, its VCL extents moved by the host panel's offset (`vclShift`, never the engine's correction).
 */
async function elementProbe(ctx, family, n, spec) {
  const { desktop, oracle, emit, witness } = ctx;
  const rows = [];
  const engine = new Engine({ ...spec, args: [] }).start();
  try {
    for (let i = 0; i < n; i++) {
      const role = `el${spec.label.replace(/[^a-z0-9]+/gi, '')}${family.replace(/[^a-z0-9]+/gi, '')}${i}`;
      const scene = family === 'gtk3-frame' ? await openPointScene(desktop, role) : await openFamily(desktop, oracle, family, role, family === 'writer' ? { doc: DRAG_DOC } : {});
      try {
        desktop.arrangeFront('visible');
        await sleep(800);
        desktop.raise(scene);
        await sleep(300);
        const nodes = [];
        const walk = (node) => {
          nodes.push(node);
          for (const c of node.children ?? []) walk(c);
        };
        walk((await desktop.state(scene)).ax_tree);
        const win = scene.window;
        const inWindow = (id) => {
          try {
            const e = oracle.extents(id);
            // on the window at all (the sheet runs past it), VCL's extents being up to the menu bar's height high
            return e.w > 0 && e.h > 0 && e.x < win.x + win.width && e.x + e.w > win.x && e.y < win.y + win.height && e.y + e.h > win.y - 40;
          } catch {
            return false;
          }
        };
        const target = TARGET_ROLES[family].map((r) => nodes.find((x) => x.role === r && inWindow(x.id))).find(Boolean);
        if (!target) throw new Error(`${scene.label}: no ${TARGET_ROLES[family].join(' or ')} to right-click`);
        for (const pass of ['fresh', 'after a pointer event']) {
          const extents = oracle.extents(target.id);
          const shift = LIBREOFFICE_FAMILIES.includes(family) ? vclShift(oracle, scene.frame) : { dx: 0, dy: 0 };
          const truth = clippedCentre({ ...extents, x: extents.x + shift.dx, y: extents.y + shift.dy }, win);
          const reported = clippedCentre(extents, win);
          const before = popups();
          const { value, witness: w } = await witness.span(`${spec.label}:${family}:element-right-click`, () => engine.request('click', { window: { id: scene.id }, element_id: target.id, mouse_button: 'right' }));
          const ok = value.response.ok === true;
          let landed = null;
          if (ok && family === 'gtk3-frame') {
            await sleep(300);
            const label = preorderNames((await desktop.state(scene)).ax_tree).find((t) => /^press \d+ at /.test(t));
            const m = label?.match(/^press (\d+) at (-?\d+) (-?\d+)$/);
            if (m) landed = { x: extents.x + Number(m[2]), y: extents.y + Number(m[3]) };
          } else if (ok) {
            const menu = await menuAfter(before);
            // the menu closed, by the real Escape it holds the grab for (this private display only)
            if (menu) {
              xdotool('key', 'Escape');
              landed = { x: menu.x, y: menu.y - 1 };
            }
          }
          await sleep(500);
          const row = { kind: 'element-probe', engine: spec.label, family, i, pass, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), witness: w.clean, window: { x: win.x, y: win.y, w: win.width, h: win.height }, extents, host_shift: shift, reported, truth, landed, on_element: onElement(landed, truth) };
          emit(row);
          rows.push(row);
        }
      } finally {
        await desktop.close([scene]);
      }
    }
  } finally {
    await engine.close();
  }
  return rows;
}

/**
 * The AT-SPI path from a window's frame down to its first node of `role`: each level's role and extents (depth-first,
 * the bars and menus pruned), so where an offset enters the coordinates shows level by level.
 */
export function pathTo(oracle, frame, role, { prune = ['tool bar', 'menu bar', 'menu', 'status bar', 'popup menu'], depth = 14 } = {}) {
  const level = (id) => {
    let extents = null;
    try {
      extents = oracle.extents(id);
    } catch {
      // no Component
    }
    return { role: oracle.role(id), extents };
  };
  const down = (id, d) => {
    const here = level(id);
    if (here.role === role) return [here];
    if (d >= depth || prune.includes(here.role)) return null;
    for (const child of oracle.children(id)) {
      const rest = down(child, d + 1);
      if (rest) return [here, ...rest];
    }
    return null;
  };
  return down(frame, 0);
}

/** AT-SPI's sentinel for no position (a hidden VCL panel answers it). */
const NOWHERE = -2147483648;

/**
 * A frame's nodes to `depth` levels with their extents, preorder, the bars and menus pruned and nodes with no position
 * left out (at most `limit`): `{depth, role, x, y, w, h}`.
 */
export function levels(oracle, frame, { depth = 5, limit = 120, prune = ['tool bar', 'menu bar', 'menu', 'status bar', 'popup menu'] } = {}) {
  const out = [];
  const visit = (id, d) => {
    if (out.length >= limit) return;
    const role = oracle.role(id);
    let e = null;
    try {
      e = oracle.extents(id);
    } catch {
      // no Component
    }
    if (e && e.x !== NOWHERE) out.push({ depth: d, role, ...e });
    if (d >= depth || prune.includes(role)) return;
    for (const child of oracle.children(id)) visit(child, d + 1);
  };
  visit(frame, 0);
  return out;
}

/**
 * LibreOffice's coordinates across the states the element probe found (`--plan hierarchy`): each fresh Writer, Calc and
 * Impress window's AT-SPI levels (and Writer's path to its first paragraph) read after the harness's arrangement (a
 * raise: the window manager's configure), after one background move to the window's middle (a pointer event), and after
 * the arrangement again.
 */
export async function runHierarchyPlan(args, { desktop, emit }) {
  const n = args.samplesTrials ?? 2;
  const oracle = new Oracle();
  await desktop.openFront('visible');
  const witness = await startWitness(XPROBE);
  const engine = new Engine({ label: 'cua', bin: args.cua, args: [] }).start();
  const md = ["LibreOffice's AT-SPI levels by state (vcl-probe.mjs `runHierarchyPlan`): Writer's path from frame to first paragraph, Calc's and Impress's levels in results.jsonl.", ''];
  const failed = [];
  try {
    for (let i = 0; i < n; i++) {
      for (const app of LIBREOFFICE_FAMILIES) {
        const scene = await openFamily(desktop, oracle, app, `hier${i}`, app === 'writer' ? { doc: DRAG_DOC } : {});
        try {
          const read = (state) => {
            const path = app === 'writer' ? pathTo(oracle, scene.frame, 'paragraph') : null;
            emit({ kind: 'writer-hierarchy', app, i, state, window: scene.window, path, levels: levels(oracle, scene.frame) });
            if (path) md.push(`- ${app} run ${i}, ${state}: ${path.map((l) => `${l.role} ${l.extents ? `${l.extents.x},${l.extents.y} ${l.extents.w}x${l.extents.h}` : '–'}`).join(' > ')}`);
            else md.push(`- ${app} run ${i}, ${state}: (levels in results.jsonl)`);
          };
          desktop.arrangeFront('visible');
          await sleep(800);
          desktop.raise(scene);
          await sleep(500);
          read('after the arrangement');
          const { value, witness: w } = await witness.span('cua:writer:move', () => engine.request('move', { window: { id: scene.id }, x: Math.round(scene.window.width / 2), y: Math.round(scene.window.height / 2) }));
          emit({ kind: 'writer-hierarchy-move', app, i, ok: value.response.ok === true, witness: w.clean });
          await sleep(500);
          read('after a background move');
          desktop.arrange(scene, 'visible');
          await sleep(500);
          read('after the arrangement again');
        } finally {
          await desktop.close([scene]);
        }
      }
    }
  } catch (error) {
    failed.push(String(error.message).split('\n')[0].slice(0, 200));
  } finally {
    await engine.close();
    await witness.stop();
  }
  return { md, complete: failed.length === 0, failed };
}

export async function runElementPlan(args, { desktop, emit }) {
  const n = args.samplesTrials ?? 3;
  const oracle = new Oracle();
  await desktop.openFront('visible');
  const witness = await startWitness(XPROBE);
  const ctx = { desktop, oracle, witness, emit, cua: args.cua };
  const lanes = [{ label: 'cua', bin: args.cua }, { label: 'pinned', bin: args.vendor }];
  const md = [
    "An engine's element right click on fresh windows and after that first pointer event (vcl-probe.mjs `elementProbe`): where it landed (VCL's context menu's corner, or the press the GTK 3 point scene records) against the element's true centre as the harness reads it from LibreOffice's host panel.",
    '',
    '| engine | family | pass | on the element | reported centre | host shift | true centre | landed |',
    '|---|---|---|---:|---|---|---|---|',
  ];
  const failed = [];
  try {
    for (const spec of lanes) {
      for (const family of args.families?.length ? args.families : ['writer', 'calc', 'impress', 'gtk3-frame']) {
        try {
          const rows = await elementProbe(ctx, family, n, spec);
          for (const pass of ['fresh', 'after a pointer event']) {
            const mine = rows.filter((r) => r.pass === pass);
            const one = mine[0];
            const xy = (p) => (p ? `${p.x}, ${p.y}` : '–');
            md.push(`| ${spec.label} | ${family} | ${pass} | ${mine.filter((r) => r.on_element).length}/${mine.length} | ${xy(one?.reported)} | ${one ? `${one.host_shift.dx}, ${one.host_shift.dy}` : '–'} | ${xy(one?.truth)} | ${one?.ok === false ? `**${one.error}**` : xy(one?.landed)} |`);
          }
        } catch (error) {
          failed.push(`${spec.label} ${family}: ${String(error.message).split('\n')[0].slice(0, 200)}`);
          md.push(`| ${spec.label} | ${family} | **failed: ${String(error.message).slice(0, 160)}** |`);
        }
      }
    }
  } finally {
    await witness.stop();
  }
  return { md, complete: failed.length === 0, failed };
}
