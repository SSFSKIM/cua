// #304's offline analysis of the hosted run's artifacts (scripts/probe-304/run.mjs). Per observation: the guard's
// checked / container-only / unrecorded share of clickable grid points over main's own record, each container-only point
// attributed to what left it so, and main's walk time; then main's selection replayed over the wide tree (validated
// against main's own record) with each candidate fix, its coverage and its added walk time.
//   node scripts/probe-304/offline/analyze.mjs <artifact dir>... [--json out.json]
import {readFileSync, readdirSync, existsSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {rows, buildRecord, shares, clickable, thin, underStrip, verdictAt, mapChain} from '../guard.mjs';
import {tree, select, recordOf, chainNodes} from './sim.mjs';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const dirs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');
const load = f => JSON.parse(gunzipSync(readFileSync(f)));
const fileName = s => s.replace(/[^a-z0-9+-]+/gi, '_');
const key = (role, x, y, w, h) => `${role}|${Math.round(x)}|${Math.round(y)}|${Math.round(w)}|${Math.round(h)}`;
const CLIPS = new Set(['AXScrollArea', 'AXWebArea', 'AXWindow', 'AXSheet', 'AXMenu', 'AXPopover']);
/// A hole-1 strip at the edge of what its nearest clipping ancestor shows (`hole1e`: where Chromium also clamps an
/// offscreen box, so the strip alone cannot tell the two apart) or inside it (`hole1v`: a collapsed container in view).
function stripPlace(rec, strip) {
  let a = strip.ancestor != null ? rec.nodes[strip.ancestor] : null;
  while (a && !CLIPS.has(a.role)) a = a.ancestor != null ? rec.nodes[a.ancestor] : null;
  const c = a?.shown, f = strip.frame;
  if (!c) return 'hole1e';
  const edge = f.y <= c.y + 1 || f.y + f.h >= c.y + c.h - 1 || f.x <= c.x - 1 && f.w <= 1 || f.x + f.w >= c.x + c.w + 1 && f.w <= 1;
  return edge ? 'hole1e' : 'hole1v';
}

/// What left a container-only point so, read over main's own record and reads: `hole1` (the hit passes through a
/// recorded strip whose children the record lacks, or the deepest recorded node on its chain is such a strip), `hole1b`
/// (that node was set aside with a frame showing nothing beyond a strip, its child showing), `hole2` (that node was
/// entered and the node budget cut its children, a quarter or more of the walk's charged reads having gone to elements
/// that showed nothing), `budget` (cut otherwise), `width` (the width rule left the child out), `other`.
function attribute(rec, reads, verdict, chain, ctx) {
  if (verdict.via === 'gap') return stripPlace(rec, verdict.gap);
  const N = verdict.node;
  let D = N;
  for (const c of chain ?? []) {
    if (c[1] == null) continue;
    for (const m of ctx.index.get(key(c[0], c[1], c[2], c[3], c[4])) ?? []) {
      if (m.depth <= D.depth) continue;
      let a = m; while (a && a !== N) a = a.ancestor != null ? rec.nodes[a.ancestor] : null;
      if (a === N) D = m;
    }
  }
  const r = D.read;
  if (thin(D.frame)) return stripPlace(rec, D);
  if (!r.expanded && r.chosen > 0) return 'hole1b';
  const kidsRecorded = ctx.recorded.get(r.number) ?? 0;
  let budget = kidsRecorded < r.chosen;
  if (!budget) for (const k of ctx.frameless.get(r.number) ?? []) if ((ctx.recorded.get(k.number) ?? 0) < k.chosen) budget = true;
  if (budget && ctx.cut) return ctx.offscreenShare >= 0.25 ? 'hole2' : 'budget';
  if (r.chosen < r.childCount) return 'width';
  return 'other';
}

function mainReading(sky, points) {
  const reads = rows(sky.probeReads ?? []);
  const rec = buildRecord(reads);
  const g = shares(rec, points);
  const charged = reads.filter(r => r.order >= 0);
  const t = sky.timings ?? {};
  const cut = Boolean(t.nodeCapHit || t.budgetHit || t.deadlineHit);
  const index = new Map();
  for (const n of rec.nodes) { const k = key(n.role, n.frame.x, n.frame.y, n.frame.w, n.frame.h); if (!index.has(k)) index.set(k, []); index.get(k).push(n); }
  const recorded = new Map(), frameless = new Map();
  for (const r of reads) if (r.parent != null) {
    recorded.set(r.parent, (recorded.get(r.parent) ?? 0) + 1);
    if (!r.frame) { if (!frameless.has(r.parent)) frameless.set(r.parent, []); frameless.get(r.parent).push(r); }
  }
  // The reads the walk spent before it took up anything set aside, on elements that showed nothing: a node is read in
  // that first pass when every ancestor's children were taken up at once.
  const first = new Map(), rowOf = new Map(reads.map(r => [r.number, r]));
  for (const r of reads) { const p = r.parent != null ? rowOf.get(r.parent) : null; first.set(r.number, !p || (first.get(p.number) && p.enters)); }
  const offscreen = charged.filter(r => !r.enters && first.get(r.number)).length;
  const ctx = {index, recorded, frameless, cut, offscreenShare: charged.length ? offscreen / charged.length : 0};
  const holes = {};
  const coPoints = [];
  for (const x of g.per) if (x.c === 'containerOnly') {
    const h = attribute(rec, reads, x.r, x.p.chain, ctx);
    holes[h] = (holes[h] ?? 0) + 1;
    coPoints.push({x: x.p.x, y: x.p.y, hole: h, hit: x.p.chain?.[0]?.[0], node: x.r.node?.role});
  }
  const strip = points.filter(p => clickable(p.chain) && underStrip(rec, p.chain));
  const loose = points.filter(p => clickable(p.chain) && mapChain(rec, p.chain).loose.some(Boolean)).length;
  const stripVerdicts = {};
  for (const p of strip) { const v = verdictAt(rec, p); const k = v.via ? `${v.v}:${v.via}` : v.v; stripVerdicts[k] = (stripVerdicts[k] ?? 0) + 1; }
  return {rec, reads, g, holes, coPoints, cut, stops: ['nodeCapHit', 'budgetHit', 'deadlineHit'].filter(k => t[k]), walkMs: t.walkMs, totalMs: t.totalMs,
    reads: reads.length, charged: charged.length, offscreen, offscreenShare: +ctx.offscreenShare.toFixed(3), underStrip: strip.length, loose, stripVerdicts, msPerRead: t.walkMs / Math.max(1, reads.length)};
}

const VARIANTS = [
  {name: 'base', opts: {}},
  {name: 'F1 frame-first (every child)', opts: {frameFirst: 'all'}},
  {name: 'F1w frame-first (lists > 100, bisected)', opts: {frameFirst: {wide: 100}}},
  {name: 'F1w20 frame-first (lists > 20, bisected)', opts: {frameFirst: {wide: 20}}},
  {name: 'F2 non-web chrome first', opts: {webLast: true}},
  {name: 'F7 columns not taken up', opts: {skipColumns: true}},
  {name: 'F7+F1w', opts: {skipColumns: true, frameFirst: {wide: 100}}},
  {name: 'F7+F2', opts: {skipColumns: true, webLast: true}},
  {name: 'F4d strips in view peeked (3 levels)', opts: {stripPeek: {depth: 3}}},
  {name: 'F4e every strip peeked (3 levels)', opts: {stripPeek: {edge: true, depth: 3}}},
  {name: 'F4o every strip, oracle', opts: {stripPeek: 'oracle'}},
  {name: 'F6 strips in view first', opts: {stripsFirst: true}},
  {name: 'F6e every strip first', opts: {stripsFirst: {edge: true}}},
  {name: 'F1w+F4e', opts: {frameFirst: {wide: 100}, stripPeek: {edge: true, depth: 3}}},
  {name: 'F2+F4e', opts: {webLast: true, stripPeek: {edge: true, depth: 3}}},
  {name: 'F1w+F2+F4e', opts: {frameFirst: {wide: 100}, webLast: true, stripPeek: {edge: true, depth: 3}}},
  {name: 'F3e seed container-only pts, 20 pt', opts: {}, seed: {step: 1, where: 'co'}},
  {name: 'F3a seed container-only pts, 40 pt', opts: {}, seed: {step: 2, where: 'co'}},
  {name: 'F3b seed container-only pts, 80 pt', opts: {}, seed: {step: 4, where: 'co'}},
  {name: 'F3c seed non-web area, 40 pt', opts: {}, seed: {step: 2, where: 'nonweb'}},
  {name: 'F3d seed non-web area, 20 pt', opts: {}, seed: {step: 1, where: 'nonweb'}},
  {name: 'F5 budget 8,000', opts: {budget: 8000}},
];

/// The seed points a fix hit-tests: every `step`-th grid point each way, where the base record's deepest node at the
/// point is incomplete or has a gap strip below it (`co`, what the engine can tell without a hit), or outside every web
/// area the record shows (`nonweb`).
function seedPoints(points, rec, seed) {
  const xs = [...new Set(points.map(p => p.x))].sort((a, b) => a - b), ys = [...new Set(points.map(p => p.y))].sort((a, b) => a - b);
  const webs = rec.nodes.filter(n => n.role === 'AXWebArea' && n.shown).map(n => n.shown);
  const holds = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  return points.filter(p => {
    if (xs.indexOf(p.x) % seed.step || ys.indexOf(p.y) % seed.step) return false;
    if (seed.where === 'nonweb') return !webs.some(w => holds(w, p));
    let best = null;
    for (const n of rec.nodes) if (n.shown && holds(n.shown, p) && (!best || n.depth >= best.depth)) best = n;
    return best && (!best.complete || best.gapsBelow.length);
  });
}

function simulate(wideSky, points, m, price) {
  const T = tree(wideSky.probeReads ?? [], wideSky.probeMenu ?? 0);
  const wt = wideSky.timings ?? {};
  const wideCut = Boolean(wt.nodeCapHit || wt.budgetHit || wt.deadlineHit);
  const frameMs = price?.frameMean ?? 0.1, childMs = price?.childrenMean ?? 0.1;
  const out = {wideNodes: T.rs.length, wideCut, wideWalkMs: wt.walkMs, variants: {}};
  let baseWalk = null, baseRec = null, baseCo = null;
  // The base replay's container-only points that each fix turns checked, by main's attribution of the same point.
  out.fixedByHole = {};
  const holeAt = new Map(m.coPoints.map(c => [`${c.x},${c.y}`, c.hole]));
  for (const v of VARIANTS) {
    const walk = select(T, v.opts);
    let extra = [], seedMs = 0, seeds = 0;
    if (v.seed) {
      const pts = seedPoints(points, baseRec, v.seed);
      seeds = pts.length;
      for (const p of pts) { seedMs += p.ms ?? 0; const found = chainNodes(T, p.chain); if (found.length) extra.push(found[found.length - 1]); }
    }
    const {rec, added} = recordOf(T, walk, extra);
    const g = shares(rec, points);
    if (v.name === 'base') { baseWalk = walk; baseRec = rec; baseCo = new Set(g.per.filter(x => x.c === 'containerOnly').map(x => `${x.p.x},${x.p.y}`)); }
    const fixed = {};
    for (const x of g.per) {
      const k = `${x.p.x},${x.p.y}`;
      if (baseCo.has(k) && x.c === 'checked') { const h = holeAt.get(k) ?? 'sim-only'; fixed[h] = (fixed[h] ?? 0) + 1; }
    }
    out.fixedByHole[v.name] = fixed;
    const dReads = walk.kept - baseWalk.kept;
    const ms = dReads * m.msPerRead + walk.frames * frameMs + seedMs + added * childMs;
    const msBisect = dReads * m.msPerRead + walk.framesBisect * frameMs + seedMs + added * childMs;
    out.variants[v.name] = {checked: g.checked, containerOnly: g.containerOnly, unrecorded: g.unrecorded, n: g.n, coCount: g.counts.containerOnly,
      kept: walk.kept, cut: walk.cut, frames: walk.frames, framesBisect: walk.framesBisect, seeds, added, ms: Math.round(ms), msBisect: Math.round(msBisect)};
  }
  return out;
}

const all = [];
for (const dir of dirs) {
  if (!existsSync(join(dir, 'results.json'))) continue;
  const {config, results} = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
  const prices = {};
  for (const r of results) if (r.price && !r.price.error) prices[r.target] = r.price;
  for (const r of results) {
    const row = {group: r.group, target: r.target, hole: r.hole, pos: r.pos, rep: config.rep, pageInfo: r.pageInfo, gridP50: r.grid?.p50, problem: r.exception || r.mainError ? (r.mainError?.name ?? String(r.exception).slice(0, 200)) : null};
    all.push(row);
    if (row.problem) continue;
    const base = join(dir, fileName(`${r.group}/${r.target}/${r.pos}`));
    const lbl = fileName(r.label);
    const gridF = join(dir, `grid-${lbl}.json.gz`), mainF = join(dir, `obs-${lbl}-main.json.gz`), wideF = join(dir, `obs-${lbl}-wide.json.gz`);
    if (!existsSync(gridF) || !existsSync(mainF)) { row.problem = 'missing files'; continue; }
    const points = load(gridF).points;
    const main = load(mainF);
    const m = mainReading(main, points);
    Object.assign(row, {stops: m.stops, walkMs: m.walkMs, totalMs: m.totalMs, reads: m.reads, charged: m.charged, offscreenShare: m.offscreenShare,
      guard: {n: m.g.n, checked: m.g.checked, containerOnly: m.g.containerOnly, unrecorded: m.g.unrecorded}, reasons: m.g.reasons, holes: m.holes,
      underStrip: m.underStrip, loose: m.loose, stripVerdicts: m.stripVerdicts, msPerRead: +m.msPerRead.toFixed(3), coPoints: m.coPoints, price: prices[r.target] ?? null});
    if (existsSync(wideF)) {
      const wide = load(wideF);
      const s = simulate(wide, points, m, prices[r.target]);
      row.sim = s;
      const b = s.variants.base;
      row.simValid = {mainCharged: m.charged, simKept: b.kept, mainChecked: m.g.checked, simChecked: b.checked};
    }
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all.map(r => ({...r, coPoints: undefined})), null, 1));

// ---- the tables --------------------------------------------------------------------------------------------------
const fmt = g => g ? `${g.checked}/${g.containerOnly}/${g.unrecorded}` : '-';
const ok = all.filter(r => !r.problem);
console.log(`observations ${all.length}, problems ${all.length - ok.length}: ${JSON.stringify(all.filter(r => r.problem).map(r => `${r.group}/${r.target}/${r.pos}/rep${r.rep}: ${r.problem}`))}`);
console.log('\n| browser | page | pos | rep | cut | guard checked/container-only/unrecorded % (n) | container-only pts: hole1 edge / hole1 in view / hole1b / hole2 / budget / width / other | under-strip pts (verdicts) | walk ms | reads (offscreen share) | sim base checked (main) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
const order = ['top', 'f25', 'f50', 'f90'];
ok.sort((a, b) => a.group.localeCompare(b.group) || a.target.localeCompare(b.target) || order.indexOf(a.pos) - order.indexOf(b.pos) || a.rep - b.rep);
for (const r of ok) {
  const h = r.holes ?? {};
  const hs = ['hole1e', 'hole1v', 'hole1b', 'hole2', 'budget', 'width', 'other'].map(k => h[k] ?? 0).join(' / ');
  const sv = Object.entries(r.stripVerdicts ?? {}).map(([k, v]) => `${k.replace('unrecordedDescendant', 'uD')} ${v}`).join(', ');
  console.log(`| ${r.group === 'safari' ? 'Safari' : 'Chrome'} | ${r.target} | ${r.pos} | ${r.rep} | ${r.stops.map(s => s.replace('Hit', '')).join('+') || '-'} | ${fmt(r.guard)} (${r.guard.n}) | ${hs} | ${r.underStrip}${sv ? ` (${sv})` : ''} | ${r.walkMs} | ${r.reads} (${r.offscreenShare}) | ${r.sim ? `${r.sim.variants.base.checked} (${r.guard.checked})${r.sim.wideCut ? ' wide cut' : ''}` : '-'} |`);
}

// Occurrence: observations (and pages) with at least one clickable container-only point of each hole.
console.log('\nHole occurrence (observations with >= 1 clickable container-only point so attributed; pages with any):');
for (const k of ['hole1e', 'hole1v', 'hole1b', 'hole2', 'budget', 'width', 'other']) {
  const obs = ok.filter(r => (r.holes?.[k] ?? 0) > 0);
  const pages = new Set(obs.map(r => `${r.group === 'safari' ? 'S' : 'C'}:${r.target}`));
  const pts = ok.reduce((s, r) => s + (r.holes?.[k] ?? 0), 0);
  const ptsAll = ok.reduce((s, r) => s + r.guard.n, 0);
  console.log(`  ${k}: ${obs.length}/${ok.length} observations, ${pages.size} pages [${[...pages].join(', ')}], ${pts} of ${ptsAll} clickable points (${(100 * pts / ptsAll).toFixed(2)}%)`);
}
const cutObs = ok.filter(r => r.stops.length);
console.log(`  cut observations: ${cutObs.length}/${ok.length}; under-strip clickable points anywhere: ${ok.reduce((s, r) => s + r.underStrip, 0)}`);

// The simulation's validity and the fixes.
const simmed = ok.filter(r => r.sim && !r.sim.wideCut);
const dv = simmed.map(r => Math.abs(r.sim.variants.base.checked - r.guard.checked));
console.log(`\nSimulation: ${simmed.length} observations with an uncut wide tree (${ok.filter(r => r.sim?.wideCut).length} wide cut, left out); |sim base - main| checked share: mean ${(dv.reduce((a, b) => a + b, 0) / Math.max(1, dv.length)).toFixed(2)} pts, max ${Math.max(0, ...dv).toFixed(1)}; within 1 pt: ${dv.filter(d => d <= 1).length}`);
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.round((s.length - 1) * p))]; };
const mean = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null;
for (const subset of [['all', simmed], ['cut by main', simmed.filter(r => r.stops.length)]]) {
  const [name, rs] = subset;
  console.log(`\n${name} (${rs.length} observations): fix | mean checked % | min checked % | container-only pts left (sum) | added walk ms p50 / p95 / max (bisected p50 / p95) | fixed points by main's attribution`);
  for (const v of VARIANTS) {
    const xs = rs.map(r => r.sim.variants[v.name]);
    const fixed = {};
    for (const r of rs) for (const [k, n] of Object.entries(r.sim.fixedByHole[v.name] ?? {})) fixed[k] = (fixed[k] ?? 0) + n;
    console.log(`  ${v.name.padEnd(40)} | ${mean(xs.map(x => x.checked))} | ${Math.min(...xs.map(x => x.checked))} | ${xs.reduce((s, x) => s + x.coCount, 0)} | ${q(xs.map(x => x.ms), 0.5)} / ${q(xs.map(x => x.ms), 0.95)} / ${Math.max(...xs.map(x => x.ms))} (${q(xs.map(x => x.msBisect), 0.5)} / ${q(xs.map(x => x.msBisect), 0.95)}) | ${JSON.stringify(fixed)}`);
  }
}
const walk = ok.map(r => r.walkMs).filter(x => x != null);
console.log(`\nmain walk ms over every observation: p50 ${q(walk, 0.5)}, p95 ${q(walk, 0.95)}, max ${Math.max(...walk)}; ms per read p50 ${q(ok.map(r => r.msPerRead), 0.5)}`);
const pr = Object.values(Object.fromEntries(ok.filter(r => r.price).map(r => [`${r.group}/${r.target}/${r.rep}`, r.price])));
console.log(`price: frame read mean p50 ${q(pr.map(p => p.frameMean), 0.5)} ms (max ${Math.max(...pr.map(p => p.frameMean))}), children read p50 ${q(pr.map(p => p.childrenMean), 0.5)} ms, bare hit-test p50 ${q(pr.map(p => p.hitP50), 0.5)} ms; grid point (hit + chain) p50 ${q(ok.map(r => r.gridP50).filter(Boolean), 0.5)} ms`);
