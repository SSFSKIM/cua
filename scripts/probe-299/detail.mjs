// #299: one observation's guard reading broken down by the recorded node, its reason and the hit (offline).
//   node scripts/probe-299/detail.mjs <artifact dir> <label like chrome-a_wiki-article_pos10> <main|wide>
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {record, clickable} from './classify.mjs';
const [dir, label, eng] = process.argv.slice(2);
const obs = JSON.parse(gunzipSync(readFileSync(join(dir, `obs-${label}-${eng}.json.gz`))));
const grid = JSON.parse(gunzipSync(readFileSync(join(dir, `grid-${label}.json.gz`))));
const nodes = obs.nodes.map(([depth, role, f, children, shown, acts, title]) => ({depth, role, frame: f && {x: f[0], y: f[1], width: f[2], height: f[3]}, children,
  shown: shown && {count: shown[0], of: shown[1], subset: shown[2]}, actions: acts, title}));
const t = obs.timings;
const stops = [['nodeCapHit', 'nodeCap'], ['budgetHit', 'bytes'], ['deadlineHit', 'deadline']].filter(([k]) => t[k]).map(([, v]) => v);
const {recs} = record(nodes, stops);
const web = recs.find(r => r.role === 'AXWebArea');
console.log('window', JSON.stringify(obs.window.frame), 'web', JSON.stringify(web?.frame), web?.shownRect && JSON.stringify(web.shownRect));
console.log('incomplete', recs.filter(r => r.reason).map(r => `${r.role}@${r.depth}[${r.recorded}/${r.chosen}/${r.total}] ${r.reason} f=${JSON.stringify(r.frame)} shown=${JSON.stringify(r.shownRect)}`).join('\n  '));
const near = (r, c) => c[1] != null && Math.abs(r.x - c[1]) <= 1 && Math.abs(r.y - c[2]) <= 1 && Math.abs(r.w - c[3]) <= 1 && Math.abs(r.h - c[4]) <= 1;
const framed = recs.filter(r => r.shownRect);
const holds = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const tally = {};
let inWeb = 0;
for (const p of grid.points) {
  const chain = p.chain;
  if (!clickable(chain)) continue;
  const content = web?.shownRect && holds(web.shownRect, p);
  if (content) inWeb += 1;
  let best = null;
  for (const r of framed) if (holds(r.shownRect, p) && (!best || r.depth >= best.depth)) best = r;
  const inChain = best && chain.some(c => c[0] === best.role && near(best.frame, c));
  const hitRec = recs.some(r => r.frame && r.role === chain[0][0] && near(r.frame, chain[0]));
  const k = `${content ? 'content' : 'chrome '} N=${best?.role}@${best?.depth} reason=${best?.reason ?? '-'} inChain=${inChain} hit=${chain[0][0]} hitRecorded=${hitRec}`;
  tally[k] = (tally[k] ?? 0) + 1;
}
console.log('clickable in web', inWeb);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(v).padStart(5), k);
