// #304: one observation's walk printed as its reads (role, frame, AXChildren / chosen / recorded children, entered at
// once, expanded, selection order), indented, to read where a walk stopped or what the width rule kept.
//   node scripts/probe-304/offline/tree.mjs <artifact dir> <label> [main|wide] [max lines] [min depth]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {rows} from '../guard.mjs';

const [dir, label, which = 'main', max = '200', minChildren = '0'] = process.argv.slice(2);
const lbl = label.replace(/[^a-z0-9+-]+/gi, '_');
const sky = JSON.parse(gunzipSync(readFileSync(join(dir, `obs-${lbl}-${which}.json.gz`))));
const rs = rows(sky.probeReads);
const recorded = new Map();
for (const r of rs) if (r.parent != null) recorded.set(r.parent, (recorded.get(r.parent) ?? 0) + 1);
const f = r => r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}` : '-';
let shown = 0;
rs.forEach((r, i) => {
  if (shown >= Number(max) || r.childCount < Number(minChildren)) return;
  shown += 1;
  console.log(`${'  '.repeat(Math.min(r.depth, 30))}${r.role} [${f(r.frame)}] kids ${r.childCount}/${r.chosen}/${recorded.get(r.number) ?? 0} ${r.enters ? 'in' : 'aside'}${r.expanded ? '' : ' unexpanded'} #${r.order}${r.recordOnly ? ' record-only' : ''} ${(sky.titles?.[i] ?? '').slice(0, 24)}`);
});
console.log(`reads ${rs.length}, window ${JSON.stringify(sky.window)}, truncated ${JSON.stringify(sky.truncated)}`);
