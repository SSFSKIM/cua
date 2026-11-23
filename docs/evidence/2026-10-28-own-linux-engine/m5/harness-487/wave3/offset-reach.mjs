// Task 142 fix wave 3, ruling 1143 (a): the counted cells whose target came from `xdotool getwindowgeometry` (the
// off-window ends of t17-fix3: the front xterm's middle, `frontPoint`; the other browser window's page (150, 150) and
// the sink's middle, `clientOrigin`), in every stored t17-fix3 run under the given directories. Per run and cell: the
// end asked, the window it was for, how many ends were verified under that window (`end_park`), and the margin from the
// end to the window's client edges if the client's real origin is xdotool's less (1, 22), Openbox's double count (the
// client sizes as placed: the xterm 200x150 asked (xterm rounds to cells), the other window 340x360, the sink 160x150).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const SIZES = { xterm: [200, 150], other: [340, 360], slow: [160, 150] };
// the end's offset into its window as asked, from the window's xdotool origin (drop-signals.mjs `offWindowEnds`)
const INTO = { xterm: ([w, h]) => [Math.floor(w / 2), Math.floor(h / 2)], other: () => [150, 150], slow: ([w, h]) => [Math.floor(w / 2), Math.floor(h / 2)] };
const OFFSET = [1, 22];

const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : /^results\.jsonl(\.gz)?$/.test(n) ? [p] : [];
});
for (const f of process.argv.slice(2).flatMap(files).sort()) {
  const b = readFileSync(f);
  const rows = (f.endsWith('.gz') ? gunzipSync(b) : b).toString().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const meta of rows.filter((r) => r.kind === 'meta' && r.experiment === 'drop-signals' && r.plan === 't17-fix3')) {
    const own = rows.filter((r) => r.run === meta.run);
    const scene = own.find((r) => r.kind === 'drop-signal-scene');
    const drops = own.filter((r) => r.kind === 'drop-signal' && ['xterm', 'other', 'slow'].includes(r.cell));
    const cells = {};
    for (const r of drops) {
      const k = `${r.lane} ${r.cell}`;
      cells[k] ??= { n: 0, verified: 0, unverified: 0, landed: 0, ok: 0 };
      cells[k].n += 1;
      if (r.end_park?.verified === true) cells[k].verified += 1;
      if (r.end_park?.verified === false) cells[k].unverified += 1;
      if (r.outcome?.landed) cells[k].landed += 1;
      if (r.ok) cells[k].ok += 1;
    }
    // the margin from the shifted end to the client's edges: the end lies `INTO + OFFSET` into the real client
    const margins = Object.fromEntries(Object.keys(SIZES).map((c) => {
      const [w, h] = SIZES[c];
      const [ix, iy] = INTO[c](SIZES[c]).map((v, k) => v + OFFSET[k]);
      return [c, { into: [ix, iy], to_right: w - ix, to_bottom: h - iy, inside: ix >= 0 && iy >= 0 && ix < w && iy < h }];
    }));
    console.log(JSON.stringify({ file: f.replace(/^.*own-linux-engine\//, ''), plan: meta.plan, gate: meta.gate, version: meta.cua_version, ends: scene?.ends ?? null, cells, margins }));
  }
}
