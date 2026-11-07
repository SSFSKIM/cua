// wides.mjs <kit> <job-dir> <label>: in each head's first timed observation, the read elements with more than 100
// children (the width rule's and the wide-list rule's subjects), with role, child count, chosen count, frame, read order
// and whether its children were taken up; and the walk's widthMs and wide-list keys.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
const [kit, dir, label] = process.argv.slice(2);
const {rows} = await import(`${kit}/scripts/probe-304/guard.mjs`);
const fileName = s => s.replace(/[^a-z0-9+-]+/gi, '_');
const res = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')).results.find(r => r.label === label);
for (const head of ['a', 'b']) {
  const k = res.slots.findIndex(s => s.head === head);
  const o = JSON.parse(gunzipSync(readFileSync(join(dir, `obs-${fileName(label)}-${k + 1}-${head}.json.gz`))));
  const t = o.timings ?? {};
  console.log(`== ${head}: walkMs ${Math.round(t.walkMs)} widthMs ${t.widthMs} wideLists ${t.wideLists} wideListFrames ${t.wideListFrames} wideListMs ${t.wideListMs} frameReads ${t.frameReads}`);
  const reads = rows(o.probeReads);
  const kids = new Map();
  for (const r of reads) if (r.parent != null) kids.set(r.parent, (kids.get(r.parent) ?? 0) + 1);
  for (const r of reads.filter(r => r.childCount > 100)) console.log(`  #${r.number} ${r.role} children ${r.childCount} chosen ${r.chosen} read-under ${kids.get(r.number) ?? 0} order ${r.order} expanded ${r.expanded} frame ${JSON.stringify(r.frame)}`);
}
