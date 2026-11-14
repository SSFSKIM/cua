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
import { identityVerdict, readIdentity, verifyIdentity } from './app-identity.mjs';
import { parkOnFront } from './park.mjs';
import { LIBREOFFICE_FAMILIES, vclDrawn, vclLevels, vclShift } from './vcl-aim.mjs';
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
 * The element each probe family's right click aims at: VCL content in LibreOffice (Calc's sheet as a whole, since its
 * cells' objects are made on demand and an engine cannot resolve them again; `writer-root`, Writer's root pane itself,
 * whose own ancestors hold no root pane: task 72's review, finding 1), the point scene's button.
 */
const TARGET_ROLES = { writer: ['paragraph'], 'writer-root': ['root pane'], calc: ['table'], impress: ['paragraph', 'text', 'shape'], 'gtk3-frame': ['push button'] };

/** The application a probe family opens: `writer-root` is Writer's. */
export const appOf = (family) => (family === 'writer-root' ? 'writer' : family);

/**
 * A probe family's fresh window, its application verified as the family's before anything of it counts
 * (app-identity.mjs; `verify` false only for the identity plan, which reads what each shows): the point scene, or the
 * family's application (Writer on the drag document).
 */
async function openProbeScene(desktop, oracle, family, role, { verify = true } = {}) {
  const app = appOf(family);
  const scene = app === 'gtk3-frame' ? await openPointScene(desktop, role) : await openFamily(desktop, oracle, app, role, app === 'writer' ? { doc: DRAG_DOC } : {});
  if (!verify) return scene;
  try {
    scene.identity = verifyIdentity(oracle, scene, app);
  } catch (error) {
    await desktop.close([scene]);
    throw error;
  }
  return scene;
}

/**
 * The Calc cell at a screen point, asked of the sheet in VCL's own coordinates (the point less the host's offset, since
 * VCL answers in the coordinates it reports): `{id, name}`, or null where it does not read.
 */
export function calcCellAt(oracle, table, point, shift) {
  try {
    const [[bus, path]] = oracle.on(table, 'org.a11y.atspi.Component', 'GetAccessibleAtPoint', 'iiu', point.x - shift.dx, point.y - shift.dy, 0);
    if (!bus || !path || path === '/org/a11y/atspi/null') return null;
    const id = `${bus}:${path}`;
    return { id, name: oracle.name(id) };
  } catch {
    return null;
  }
}

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
 * Whether a right click landed on its element: within 2 px of the element's true centre. Calc's is not judged (null):
 * its menu opens above a press near the bottom, so the menu's corner is no reading of the press, and no direct reading
 * of the cell a background right click made active was found (task 72's fix-wave pilots: the sheet's Selection names
 * no child, no Name Box is on the bus, and no cell is focused or selected while the window is in the background), so
 * Calc's landing stays inferred from where the menu opens, beside the cells at the true and the stale centre.
 */
export function landedOnElement(row) {
  if (row.family === 'calc') return null;
  return onElement(row.landed, row.truth);
}

/**
 * One engine's element right click (`click {element_id, mouse_button: right}`) on `n` fresh windows of a family, then
 * again on each after that first pointer event. Where it landed: the corner of the context menu VCL opens at the press
 * (one pixel below it), or the press the point scene's button records (Calc's only inferred, `landedOnElement`). The
 * truth: the element's centre as the harness reads it, its VCL extents moved by the host panel's offset (`vclDrawn`,
 * never the engine's correction).
 */
async function elementProbe(ctx, family, n, spec) {
  const { desktop, oracle, emit, witness } = ctx;
  const rows = [];
  const app = appOf(family);
  const engine = new Engine({ ...spec, args: [] }).start();
  try {
    for (let i = 0; i < n; i++) {
      const role = `el${spec.label.replace(/[^a-z0-9]+/gi, '')}${family.replace(/[^a-z0-9]+/gi, '')}${i}`;
      // the real pointer on the front window, off the application, while the fresh window opens (park.mjs): a window
      // mapped under a still pointer gets a crossing event only, never the motion that moves VCL's coordinates
      parkOnFront(desktop);
      const scene = await openProbeScene(desktop, oracle, family, role);
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
        // Writer's root pane from the frame by the harness's own walk (vcl-aim.mjs `vclLevels`); the rest from the tree
        const target = family === 'writer-root'
          ? { id: vclLevels(oracle, scene.frame).root, role: 'root pane' }
          : TARGET_ROLES[family].map((r) => nodes.find((x) => x.role === r && inWindow(x.id))).find(Boolean);
        if (!target) throw new Error(`${scene.label}: no ${TARGET_ROLES[family].join(' or ')} to right-click`);
        for (const pass of ['fresh', 'after a pointer event']) {
          const libreoffice = LIBREOFFICE_FAMILIES.includes(app);
          const extents = oracle.extents(target.id);
          const shift = libreoffice ? vclShift(oracle, scene.frame) : { dx: 0, dy: 0 };
          const truth = clippedCentre(libreoffice ? vclDrawn(oracle, scene.frame, () => oracle.extents(target.id)) : extents, win);
          const reported = clippedCentre(extents, win);
          // Calc: the cells at the true and the stale centre, asked before the press (whose pointer event moves VCL's
          // coordinates), for the record
          const cells = app === 'calc' ? { at: calcCellAt(oracle, target.id, truth, shift)?.name ?? null, stale: calcCellAt(oracle, target.id, reported, shift)?.name ?? null } : null;
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
          const row = { kind: 'element-probe', engine: spec.label, family, i, pass, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), witness: w.clean, window: { x: win.x, y: win.y, w: win.width, h: win.height }, identity: scene.identity, extents, host_shift: shift, reported, truth, landed };
          if (cells) Object.assign(row, { cell_true: cells.at, cell_stale: cells.stale });
          row.on_element = landedOnElement(row);
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
      for (const app of args.families?.length ? args.families : LIBREOFFICE_FAMILIES) {
        const scene = await openProbeScene(desktop, oracle, app, `hier${i}`);
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

/**
 * What each family's application shows through AT-SPI (`--plan identity`, app-identity.mjs `readIdentity`): its
 * application's name and toolkit, the role of its document and its frame's name, read on one fresh window each, with
 * the verdict against `APP_IDENTITY`. The table's values come from this plan's sitting.
 */
export async function runIdentityPlan(args, { desktop, emit }) {
  const oracle = new Oracle();
  await desktop.openFront('visible');
  const md = ["Each family's application as AT-SPI shows it (vcl-probe.mjs `runIdentityPlan`), against app-identity.mjs `APP_IDENTITY`.", '', '| family | application | toolkit | document | frame | verdict |', '|---|---|---|---|---|---|'];
  const failed = [];
  for (const family of args.families?.length ? args.families : ['writer', 'calc', 'impress', 'gtk3-frame']) {
    let scene = null;
    try {
      scene = await openProbeScene(desktop, oracle, family, `id${family.replace(/[^a-z0-9]+/gi, '')}`, { verify: false });
      const identity = readIdentity(oracle, scene.frame);
      const frame = oracle.name(scene.frame);
      const verdict = identityVerdict(identity, family);
      emit({ kind: 'app-identity', family, ...identity, frame, ok: verdict.ok, why: verdict.why });
      md.push(`| ${family} | ${identity.application} | ${identity.toolkit} | ${identity.document ?? '–'} | ${frame} | ${verdict.ok ? 'ok' : `**${verdict.why.join('; ')}**`} |`);
      if (!verdict.ok) failed.push(`${family}: ${verdict.why.join('; ')}`);
    } catch (error) {
      failed.push(`${family}: ${String(error.message).split('\n')[0].slice(0, 200)}`);
      md.push(`| ${family} | **failed: ${String(error.message).slice(0, 160)}** |`);
    } finally {
      if (scene) await desktop.close([scene]);
    }
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
    "An engine's element right click on fresh windows and after that first pointer event (vcl-probe.mjs `elementProbe`): where it landed (VCL's context menu's corner, the press the GTK 3 point scene records, or for Calc the cell the click made active, against the cell at the true centre) against the element's true centre as the harness reads it from LibreOffice's host panel. Every scene's application was verified first (app-identity.mjs).",
    '',
    '| engine | family | pass | on the element | reported centre | host shift | true centre | landed |',
    '|---|---|---|---:|---|---|---|---|',
  ];
  const failed = [];
  try {
    for (const spec of lanes) {
      for (const family of args.families?.length ? args.families : ['writer', 'writer-root', 'calc', 'impress', 'gtk3-frame']) {
        try {
          const rows = await elementProbe(ctx, family, n, spec);
          for (const pass of ['fresh', 'after a pointer event']) {
            const mine = rows.filter((r) => r.pass === pass);
            const one = mine[0];
            const xy = (p) => (p ? `${p.x}, ${p.y}` : '–');
            md.push(`| ${spec.label} | ${family} | ${pass} | ${mine.some((r) => r.on_element === null) ? 'inferred' : `${mine.filter((r) => r.on_element).length}/${mine.length}`} | ${xy(one?.reported)} | ${one ? `${one.host_shift.dx}, ${one.host_shift.dy}` : '–'} | ${xy(one?.truth)} | ${one?.ok === false ? `**${one.error}**` : one?.cell_true !== undefined ? `menu corner ${xy(one.landed)} (the true centre's cell ${one.cell_true ?? '–'}, the stale centre's ${one.cell_stale ?? '–'})` : xy(one?.landed)} |`);
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
