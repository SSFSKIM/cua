// The drag-source probe (#171 M5, task 113; development only, sends no input): whether the accessibility tree at a
// Chromium drag's press point tells a drag-and-drop source (`draggable`, a link, an image, a selection being dragged)
// from a drag that never starts one (a text selection, a range, a scroller, a canvas), as a narrower trigger for 0.4.2's
// final hold would read it before the press. For each of drag.html's kinds (D1's and D2's cells, and V5's device
// drag-and-drop source, which is drag.html's `dnd` source) at both path parities, the press point is hit-tested from the
// window's frame down (role-probe.mjs `probeAt`: each step's role, states, interfaces and object attributes), and the
// same hit test is timed on an in-process connection to the accessibility bus (bus-client.mjs, as an engine's own client
// would make it): `GetAccessibleAtPoint` from the frame to the deepest, then the deepest's `GetState` and
// `GetAttributes`. Reads only the window it opened, on its own display.

import { connectBus } from './bus-client.mjs';
import { verifiedScene } from './app-identity.mjs';
import { PAGE, locate, runPath } from './drag.mjs';
import { openFamily } from './families.mjs';
import { Oracle } from './oracle.mjs';
import { NULL_PATH, probeAt } from './role-probe.mjs';
import { a11yBusAddress } from './scenes.mjs';
import { preorder } from './normalize.mjs';
import { performance } from 'node:perf_hooks';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The kinds probed: drag.html's, each a drag source or not as the page's markup makes it. */
export const PROBED = {
  select: false,
  range: false,
  scroller: false,
  canvas: false,
  dnd: true,
  'dnd-short': true,
};

const pct = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null;
};

/** One hit test as an engine's client would make it: the frame down to the deepest, then its states and attributes. */
async function timedHitTest(bus, frame, x, y) {
  const started = performance.now();
  let [dest, path] = frame.split(/:(?=\/)/);
  let steps = 0;
  for (let d = 0; d < 24; d++) {
    const [[nextDest, nextPath]] = await bus.call(dest, path, 'org.a11y.atspi.Component', 'GetAccessibleAtPoint', 'iiu', [x, y, 0]);
    if (nextPath === NULL_PATH || (nextDest === dest && nextPath === path)) break;
    [dest, path] = [nextDest, nextPath];
    steps++;
  }
  await bus.call(dest, path, 'org.a11y.atspi.Accessible', 'GetState');
  await bus.call(dest, path, 'org.a11y.atspi.Accessible', 'GetAttributes');
  return { ms: performance.now() - started, steps };
}

export async function runDragSourceProbe(args, { desktop, emit }) {
  const oracle = new Oracle();
  const trials = args.samplesTrials ?? 30;
  await desktop.openFront('visible');
  const md = ['| family | kind | source? | parity | point | deepest role | states | attributes | hit-test steps | in-process ms p50 / p95 | busctl ms |', '|---|---|---|---:|---|---|---|---|---:|---:|---:|'];
  const bus = await connectBus(a11yBusAddress());
  try {
    for (const family of args.families?.length ? args.families : ['chrome']) {
      const scene = await verifiedScene(desktop, oracle, await openFamily(desktop, oracle, family, 'srcprobe', { page: PAGE }), family);
      scene.kindOf = 'page';
      desktop.arrangeFront('visible');
      await sleep(1000);
      const at = await locate({ desktop, oracle }, scene, Object.keys(PROBED));
      const tree = (await desktop.state(scene)).ax_tree;
      const frame = tree?.id ?? preorder(tree)[0]?.id;
      for (const [kind, source] of Object.entries(PROBED)) {
        for (const i of [0, 1]) {
          const start = runPath(at, kind, i)[0];
          const x = scene.window.x + start.x;
          const y = scene.window.y + start.y;
          const probe = probeAt(oracle, frame, x, y);
          const times = [];
          let steps = null;
          for (let k = 0; k < trials; k++) {
            const t = await timedHitTest(bus, frame, x, y);
            times.push(t.ms);
            steps = t.steps;
          }
          const d = probe.deepest ?? {};
          const row = { kind: 'drag-source-probe', family, drag: kind, source, parity: i, point: { x, y }, probe, in_process: { n: times.length, steps, p50_ms: pct(times, 0.5), p95_ms: pct(times, 0.95), max_ms: Math.max(...times) } };
          emit(row);
          md.push(`| ${family} | ${kind} | ${source ? 'yes' : 'no'} | ${i} | ${x},${y} | ${d.role ?? '–'} | ${(d.states ?? []).join(' ')} | ${Object.entries(d.attributes ?? {}).filter(([k]) => !['id', 'class', 'src'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ')} | ${steps} | ${row.in_process.p50_ms.toFixed(2)} / ${row.in_process.p95_ms.toFixed(2)} | ${probe.ms} |`);
        }
      }
    }
  } finally {
    bus.close();
  }
  return { md, complete: true, failed: [] };
}
