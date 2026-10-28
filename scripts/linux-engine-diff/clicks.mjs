// M0.4's two follow-ups on clicks (the spec's Decision Log, M0.4, last bullet), before families.rs's first entries:
//
// - `--experiment element-click`: does an element click through AT-SPI (`click {window, element_id}`, a left click,
//   which every engine answers with `DoAction` 0, behaviour §7) take effect where the synthetic-event click does
//   not: on a GTK 4 button (the harness's pages/gtk4-button.py) in the background, covered and visible, and on the
//   matrix page's button in a fully covered Firefox? Each window gets element clicks then coordinate clicks (the
//   control), from the pinned and newest builds and cua-engine, each in a witness span. It first records the GTK 4
//   probe: the window focused and on top, an XTEST key and click (the real input path) against the background
//   route's synthetic ones.
// - `--experiment partial-cover`: Firefox's ignored clicks, with the front window over the click point but not the
//   whole window, and over the window but not the click point, so the condition is exact.

import { Engine } from './engine.mjs';
import { openFamily, readCounter, readText } from './families.mjs';
import { counterArrived } from './matrix-judge.mjs';
import { CUA_CHOICE } from './matrix.mjs';
import { Oracle } from './oracle.mjs';
import { preorder } from './normalize.mjs';
import { negativeCheck } from './run.mjs';
import { XPROBE, configure, xdotool } from './scenes.mjs';
import { startWitness } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function engines(args) {
  return [
    { label: 'pinned', bin: args.vendor, args: [] },
    { label: 'newest', bin: args.newest, args: [] },
    { label: 'cua', bin: args.cua, args: CUA_CHOICE },
  ];
}

/** The button's native id, read fresh (a label change may give it a new object). */
async function buttonId(desktop, scene) {
  const nodes = preorder((await desktop.state(scene)).ax_tree);
  return nodes.find((n) => /^presses \d+$/.test(n.name ?? ''))?.id ?? null;
}

/** The button's centre, window-relative: the GTK 4 scene's is the window's, the matrix page's under the toolbar. */
function buttonPoint(scene) {
  if (scene.kindOf === 'page') return { x: Math.round(scene.window.width / 2), y: 220 };
  return { x: Math.round(scene.window.width / 2), y: Math.round(scene.window.height / 2) };
}

async function clickSeries(ctx, engine, scene, how, n, tags) {
  const { desktop, oracle, witness, emit } = ctx;
  let arrived = 0;
  let clean = 0;
  for (let i = 0; i < n; i++) {
    const before = await readCounter(desktop, oracle, scene);
    const input = how === 'element' ? { window: { id: scene.id }, element_id: await buttonId(desktop, scene) } : { window: { id: scene.id }, ...buttonPoint(scene) };
    const { value, witness: w } = await witness.span(`${engine.label}:${scene.family}:${how}`, () => engine.request('click', input));
    const ok = value.response.ok === true;
    let effect = null;
    if (ok) {
      const deadline = Date.now() + 1500;
      for (;;) {
        effect = counterArrived(before, await readCounter(desktop, oracle, scene));
        if (effect === true || Date.now() > deadline) break;
        await sleep(50);
      }
    }
    if (effect) arrived += 1;
    if (w.clean) clean += 1;
    emit({ kind: 'click-sample', ...tags, family: scene.family, engine: engine.label, how, i, ok, error: ok ? undefined : String(value.response.error).slice(0, 300), ms: Math.round(value.ms * 10) / 10, witness: w.clean, witness_fields: w.clean ? undefined : w.fields, effect });
    await sleep(600);
  }
  return { arrived, clean };
}

/** The GTK 4 probe: focused and on top, does the real (XTEST) input arrive where the synthetic one does not? */
async function gtk4Probe(desktop, oracle, emit, args) {
  const md = ['| window | input | route | arrived |', '|---|---|---|---|'];
  const restore = xdotool('getmouselocation', '--shell');
  const pointer = Object.fromEntries(restore.split('\n').map((l) => l.split('=')));
  const editor = await openFamily(desktop, oracle, 'gnome-text-editor', 'probe');
  const button = await openFamily(desktop, oracle, 'gtk4-button', 'probe');
  const spike = new Engine({ label: 'cua', bin: args.cua, args: CUA_CHOICE }).start();
  const record = (window, input, route, before, after, arrived) => {
    emit({ kind: 'gtk4-probe', window, input, route, before, after, arrived });
    md.push(`| ${window} | ${input} | ${route} | ${arrived} |`);
  };
  try {
    // the editor: focused, on top; a key through XTEST, then the same key through the background route
    xdotool('windowactivate', '--sync', editor.id);
    await sleep(500);
    let before = await readText(desktop, oracle, editor);
    xdotool('key', 'q');
    await sleep(500);
    let after = await readText(desktop, oracle, editor);
    record('gnome-text-editor (focused, on top)', 'key q', 'XTEST', before, after, after === `q${before}`);
    before = after;
    await spike.request('press_key', { window: { id: editor.id }, key: 'x' });
    await sleep(500);
    after = await readText(desktop, oracle, editor);
    record('gnome-text-editor (focused, on top)', 'key x', 'SendEvent (background route)', before, after, after !== before);
    // the button: focused, on top; a click through XTEST, then the background route's coordinate and element clicks
    xdotool('windowactivate', '--sync', button.id);
    await sleep(500);
    const point = buttonPoint(button);
    let count = await readCounter(desktop, oracle, button);
    xdotool('mousemove', '--window', button.id, point.x, point.y, 'click', '1');
    await sleep(700);
    let now = await readCounter(desktop, oracle, button);
    record('GTK 4 button (focused, on top)', 'left click', 'XTEST', count, now, counterArrived(count, now));
    count = now;
    await sleep(600);
    await spike.request('click', { window: { id: button.id }, ...point });
    await sleep(700);
    now = await readCounter(desktop, oracle, button);
    record('GTK 4 button (focused, on top)', 'left click', 'SendEvent (background route)', count, now, counterArrived(count, now));
    count = now;
    await spike.request('click', { window: { id: button.id }, element_id: await buttonId(desktop, button) });
    await sleep(700);
    now = await readCounter(desktop, oracle, button);
    record('GTK 4 button (focused, on top)', 'element click', 'DoAction 0 (AT-SPI)', count, now, counterArrived(count, now));
  } finally {
    await spike.close();
    xdotool('mousemove', pointer.X, pointer.Y);
    desktop.focusFront();
    await desktop.close([editor, button]);
  }
  return md;
}

export async function elementClick(desktop, emit, args) {
  const oracle = new Oracle();
  const n = args.samplesInput;
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront('covered');
  const witness = await startWitness(XPROBE);
  const md = [];
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    md.push('The GTK 4 probe (the window focused and on top; the real input path against the synthetic one):', '', ...(await gtk4Probe(desktop, oracle, emit, args)), '');
    desktop.arrangeFront('covered');
    md.push('Element clicks (`DoAction` 0) against coordinate clicks (synthetic events), per engine, effects seen / clicks:', '');
    md.push('| window | condition | engine | element click | coordinate click | witness clean |', '|---|---|---|---|---|---|');
    const ctx = { desktop, oracle, witness, emit };
    for (const [family, conditions] of [['gtk4-button', ['covered', 'visible']], ['firefox', ['covered', 'visible']]]) {
      for (const condition of conditions) {
        const scenes = {};
        try {
          for (const e of engines(args)) scenes[e.label] = await openFamily(desktop, oracle, family, `${e.label}${condition}`);
          desktop.arrangeFront(condition);
          await sleep(1000);
          for (const spec of engines(args)) {
            const scene = scenes[spec.label];
            if (condition === 'visible') desktop.raise(scene);
            await sleep(500);
            const engine = new Engine(spec).start();
            const tags = { experiment: 'element-click', condition };
            let element;
            let coordinate;
            try {
              element = await clickSeries(ctx, engine, scene, 'element', n, tags);
              coordinate = await clickSeries(ctx, engine, scene, 'coordinate', n, tags);
            } finally {
              await engine.close();
            }
            desktop.focusFront();
            md.push(`| ${family} | ${condition} | ${spec.label} | ${element.arrived}/${n} | ${coordinate.arrived}/${n} | ${element.clean + coordinate.clean}/${2 * n} |`);
          }
        } finally {
          await desktop.close(Object.values(scenes));
        }
      }
    }
  } finally {
    await witness.stop();
  }
  return md;
}

/**
 * Where the front window is asked to stand for each partial-cover condition, in root coordinates `[x, y, w, h]`. The
 * window manager places its frame there, so the client lands lower and to the right; what it covered is computed
 * from its real geometry (`coverage`), not from these numbers.
 */
export const COVERS = [
  { name: 'over everything', front: [0, 0, 1280, 800] },
  { name: 'over the top half', front: [0, 0, 1280, 420] },
  { name: 'over the top third', front: [0, 0, 1280, 260] },
  { name: 'small, over the click point', front: [540, 180, 200, 120] },
  { name: 'medium, over the click point', front: [340, 120, 600, 260] },
  { name: 'large, over the click point', front: [140, 60, 1000, 500] },
  { name: 'over the bottom fifth', front: [0, 600, 1280, 200] },
  { name: 'over the bottom 45%', front: [0, 450, 1280, 350] },
  { name: 'over the bottom 52%', front: [0, 380, 1280, 420] },
  { name: 'over the bottom 57%', front: [0, 340, 1280, 460] },
  { name: 'over the bottom 62%', front: [0, 300, 1280, 500] },
  { name: 'over the bottom 67%', front: [0, 260, 1280, 540] },
  { name: 'over the left 47%', front: [0, 0, 600, 800] },
  { name: 'over the left 78%', front: [0, 0, 1000, 800] },
  { name: 'in a corner', front: [1070, 640, 200, 150] },
];

/**
 * What a front window `[x, y, w, h]` covers of a scene window `{x, y, width, height}`: whether the click point
 * (window-relative) is under it, and the fraction of the window's area it leaves visible.
 */
export function coverage(front, window, point) {
  const [fx, fy, fw, fh] = front;
  const px = window.x + point.x;
  const py = window.y + point.y;
  const ix = Math.max(0, Math.min(fx + fw, window.x + window.width) - Math.max(fx, window.x));
  const iy = Math.max(0, Math.min(fy + fh, window.y + window.height) - Math.max(fy, window.y));
  return {
    point_covered: px >= fx && px < fx + fw && py >= fy && py < fy + fh,
    visible_fraction: Math.round((1 - (ix * iy) / (window.width * window.height)) * 1000) / 1000,
  };
}

export async function partialCover(desktop, emit, args) {
  const oracle = new Oracle();
  const n = args.samplesInput;
  const stubScene = await desktop.openChrome('stub', 'scene.html');
  await desktop.openFront('covered');
  const witness = await startWitness(XPROBE);
  const md = ['Firefox on the matrix page, one window per engine at the same place; the click point is the button\'s centre (window-relative 640, 220). Effects seen / coordinate clicks:', ''];
  md.push(`| front window | its real geometry | click point | window visible | ${engines(args).map((e) => e.label).join(' | ')} |`, `|---|---|---|---:|${engines(args).map(() => '---').join('|')}|`);
  const scenes = {};
  try {
    if (!(await negativeCheck(desktop, witness, stubScene, emit))) throw new Error('the witness did not fail the activating stub; the run is invalid');
    for (const e of engines(args)) scenes[e.label] = await openFamily(desktop, oracle, 'firefox', `${e.label}cover`);
    const ctx = { desktop, oracle, witness, emit };
    for (const cover of COVERS) {
      const cells = [];
      let where = null;
      for (const spec of engines(args)) {
        const scene = scenes[spec.label];
        // this engine's window above the others, the front window placed over it and holding the focus
        xdotool('windowraise', scene.id);
        configure(desktop.front.id, ...cover.front);
        desktop.focusFront();
        await sleep(1000);
        // xterm sizes in character cells, so the front window's real geometry is recorded beside the asked one
        const g = Object.fromEntries(xdotool('getwindowgeometry', '--shell', desktop.front.id).split('\n').map((l) => l.split('=')));
        const actual = [g.X, g.Y, g.WIDTH, g.HEIGHT].map(Number);
        where = { actual, ...coverage(actual, scene.window, buttonPoint(scene)) };
        const engine = new Engine(spec).start();
        try {
          const { arrived, clean } = await clickSeries(ctx, engine, scene, 'coordinate', n, { experiment: 'partial-cover', condition: cover.name, front: cover.front, front_actual: actual, ...coverage(actual, scene.window, buttonPoint(scene)) });
          cells.push(`${arrived}/${n}${clean === n ? '' : ` (witness ${clean}/${n})`}`);
        } finally {
          await engine.close();
        }
      }
      md.push(`| ${cover.name} | ${where.actual.join(',')} | ${where.point_covered ? 'covered' : 'visible'} | ${Math.round(where.visible_fraction * 100)}% | ${cells.join(' | ')} |`);
    }
  } finally {
    await desktop.close(Object.values(scenes));
    await witness.stop();
  }
  return md;
}

