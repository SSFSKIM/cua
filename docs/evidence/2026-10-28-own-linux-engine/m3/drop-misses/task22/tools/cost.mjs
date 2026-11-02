// cost.mjs <engine> <out.jsonl> [n]: the hold's cost on Chromium drags that never take (task 22): Chrome's drag page in
// front (activated, the real pointer parked inside), text selections and range drags of 40 px and of the page's own
// length, each sent by the engine with the hold (its default) and with `--drag-dnd-hold-ms 0`, the lanes interleaved,
// a fresh engine per lane kept for the run. Rows: the request's time and the engine's `hold` record.
import { appendFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { PAGE, locate, runPath } from './linux-engine-diff/drag.mjs';
import { Engine } from './linux-engine-diff/engine.mjs';
import { FAMILIES, openFamily } from './linux-engine-diff/families.mjs';
import { Oracle } from './linux-engine-diff/oracle.mjs';
import { Desktop } from './linux-engine-diff/scenes.mjs';

const [bin, out, n = '10'] = process.argv.slice(2);
writeFileSync(out, '');
/** The first 40 px of a horizontal path, in its own direction. */
const short40 = ([a, b]) => [a, { x: a.x + Math.sign(b.x - a.x) * 40, y: a.y }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const desktop = new Desktop({ cua: bin, run: 't22-cost' });
const oracle = new Oracle();
desktop.oracle = oracle;
const lanes = [
  { label: 'hold', engine: new Engine({ label: 'hold', bin, args: [], stats: true }).start() },
  { label: 'off', engine: new Engine({ label: 'off', bin, args: ['--drag-dnd-hold-ms', '0'], stats: true }).start() },
];
try {
  await desktop.openFront('visible');
  const scene = await openFamily(desktop, oracle, 'chrome', 'cost', { page: PAGE, geometry: FAMILIES.chrome.geometry });
  scene.kindOf = 'page';
  const at = await locate({ desktop, oracle }, scene, ['select', 'range']);
  const paths = {
    'select-40': (i) => short40(runPath(at, 'select', i)),
    'range-40': (i) => short40(runPath(at, 'range', i)),
    select: (i) => runPath(at, 'select', i),
    range: (i) => runPath(at, 'range', i),
  };
  const park = { x: scene.window.x + 600, y: scene.window.y + 600 };
  for (let i = 0; i < Number(n); i++) {
    for (const [kind, path] of Object.entries(paths)) {
      for (const lane of i % 2 === 0 ? lanes : [...lanes].reverse()) {
        execFileSync('xdotool', ['windowactivate', '--sync', String(scene.id)]);
        execFileSync('xdotool', ['mousemove', '--sync', String(park.x), String(park.y)]);
        await sleep(300);
        const p = path(i);
        const { response, ms, stats } = await lane.engine.request('drag', { window: { id: scene.id }, path: p });
        appendFileSync(out, `${JSON.stringify({ lane: lane.label, kind, i, ok: response.ok === true, error: response.ok ? undefined : String(response.error).slice(0, 120), ms, hold: stats?.hold, path: p })}\n`);
        await sleep(300);
      }
    }
  }
} finally {
  for (const lane of lanes) await lane.engine.close();
  await desktop.closeAll();
}
