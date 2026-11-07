// uncutpages.mjs <run-dir>: the uncut pages (no slot cut at any position) and, for each, how many A-vs-B pairs differ
// in the printed tree, record and raw nodes, using the report's own comparisons (scripts/probe-304/treediff.mjs).
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
const kit = process.argv[3];
const {diffPrinted, diffRecord, diffNodes} = await import(`${kit}/scripts/probe-304/treediff.mjs`);
const dir = process.argv[2];
const fileName = s => s.replace(/[^a-z0-9+-]+/gi, '_');
const acc = new Map();
for (const d of readdirSync(dir).sort()) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  if (!('aCommit' in j.config)) continue;
  const app = j.config.group === 'safari' ? 'safari' : 'chrome';
  for (const r of j.results ?? []) {
    const k = `${app}/${r.target}`;
    if (!acc.has(k)) acc.set(k, {cut: false, cross: 0, printed: 0, record: 0, nodes: 0});
    const a = acc.get(k);
    if ((r.slots ?? []).some(s => s.obs?.cut)) { a.cut = true; continue; }
    const obs = (r.slots ?? []).map((s, i) => { const p = join(dir, d, `obs-${fileName(r.label)}-${i + 1}-${s.head}.json.gz`); return existsSync(p) ? JSON.parse(gunzipSync(readFileSync(p))) : null; });
    for (let i = 0; i + 1 < obs.length; i++) {
      if (!obs[i] || !obs[i + 1] || r.slots[i].head === r.slots[i + 1].head) continue;
      a.cross += 1;
      if (diffPrinted(obs[i].printed, obs[i + 1].printed)) a.printed += 1;
      if (diffRecord(obs[i].probeRecord, obs[i + 1].probeRecord)) a.record += 1;
      if (diffNodes(obs[i].nodes, obs[i + 1].nodes)) a.nodes += 1;
    }
  }
}
console.log('uncut page | A-vs-B pairs | printed differs | record differs | raw nodes differ');
for (const [k, a] of acc) if (!a.cut) console.log(`${k} | ${a.cross} | ${a.printed} | ${a.record} | ${a.nodes}`);
