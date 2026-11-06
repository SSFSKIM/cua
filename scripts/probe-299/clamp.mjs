// #301's unverified assumption, read from whole trees (the wide engine's): where Chromium (and WebKit) report the
// frames of a web area's descendants against the web area's frame. Each framed descendant is wholly inside, partly
// inside (cut by an edge), a 1 pt strip on the top or bottom edge, a strip elsewhere, or wholly above or below.
//   node scripts/probe-299/clamp.mjs <artifact dir>...
import {readFileSync, readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';

const rows = [];
for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter(f => /-(wide|branch|main)\.json\.gz$/.test(f) && f.startsWith('obs-'))) {
    if (!/-wide\.json\.gz$/.test(f) && readdirSync(dir).some(g => g.endsWith('-wide.json.gz'))) continue;
    const obs = JSON.parse(gunzipSync(readFileSync(join(dir, f))));
    const nodes = obs.nodes;
    const web = nodes.findIndex(n => n[1] === 'AXWebArea');
    if (web < 0 || !nodes[web][2]) continue;
    const [, wy, , wh] = nodes[web][2];
    const top = wy, bottom = wy + wh;
    const c = {inside: 0, partial: 0, stripTop: 0, stripBottom: 0, stripElsewhere: 0, above: 0, below: 0, frameless: 0};
    for (let j = web + 1; j < nodes.length && nodes[j][0] > nodes[web][0]; j++) {
      const fr = nodes[j][2];
      if (!fr) { c.frameless += 1; continue; }
      const [, y, w, h] = fr;
      if (h <= 1 || w <= 1) {
        if (Math.abs(y - top) <= 1) c.stripTop += 1; else if (Math.abs(y + h - bottom) <= 1 || Math.abs(y - (bottom - 1)) <= 1) c.stripBottom += 1; else c.stripElsewhere += 1;
      } else if (y + h <= top) c.above += 1;
      else if (y >= bottom) c.below += 1;
      else if (y >= top && y + h <= bottom) c.inside += 1;
      else c.partial += 1;
    }
    rows.push({run: dir.split('/').pop().replace(/^probe-299-/, ''), obs: f.replace(/^obs-[a-z-]+_/, '').replace(/\.json\.gz$/, ''), webTop: top, webBottom: bottom, ...c});
  }
}
console.table(rows);
