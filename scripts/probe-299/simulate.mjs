// #299: other node budgets and walk orders, simulated offline over the wide engine's whole tree (its observation when no
// budget cut it), each judged at the same grid as the engines. `preorder` is the engine's order (a node's children in
// order, depth first), so preorder at 4,000 should reproduce main's own reading; `visible` walks first every subtree
// whose frame shows in the window by more than a 1 pt strip (Chrome reports an offscreen element as a 1 pt strip at the
// viewport's edge) and spends what is left of the budget on the rest in preorder.
//   node scripts/probe-299/simulate.mjs <artifact dir>...
import {readFileSync, readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {record, classify} from './classify.mjs';

const load = f => JSON.parse(gunzipSync(readFileSync(f)));
const wire = ([depth, role, f, children, shown, acts, title]) => ({depth, role, frame: f && {x: f[0], y: f[1], width: f[2], height: f[3]}, children,
  shown: shown && {count: shown[0], of: shown[1], subset: shown[2]}, actions: acts, title});

function parents(nodes) {
  const parent = [], kids = nodes.map(() => []), stack = [];
  nodes.forEach((n, i) => {
    while (stack.length && nodes[stack[stack.length - 1]].depth >= n.depth) stack.pop();
    parent.push(stack.length ? stack[stack.length - 1] : null);
    if (stack.length) kids[stack[stack.length - 1]].push(i);
    stack.push(i);
  });
  return {parent, kids};
}
const shows = (f, w) => {
  if (!f) return true;
  const x = Math.max(f.x, w.x), y = Math.max(f.y, w.y), X = Math.min(f.x + f.width, w.x + w.width), Y = Math.min(f.y + f.height, w.y + w.height);
  return X - x > 1 && Y - y > 1;
};
// A 1 pt strip is no evidence either way (Chrome reports an offscreen box as one, and a collapsed container, a float's
// parent, as one while its children fill the viewport): entered like a frameless node.
const showsLoose = (f, w) => !f || f.width <= 1 || f.height <= 1 || shows(f, w);
/// The first `budget` nodes in the order's walk, as a set of indices (closed under ancestors: a node is reached through its parent).
function walk(nodes, kids, budget, order, window, seeds = new Set()) {
  const kept = new Set();
  const deferred = [];
  const stack = [0];
  const run = () => {
    while (stack.length && kept.size < budget) {
      const i = stack.pop();
      const enter = order === 'visibleLoose' ? showsLoose(nodes[i].frame, window) : order === 'seeded' ? seeds.has(i) || shows(nodes[i].frame, window) : shows(nodes[i].frame, window);
      if (order !== 'preorder' && i !== 0 && !enter) { deferred.push(i); continue; }
      kept.add(i);
      for (const c of [...kids[i]].reverse()) stack.push(c);
    }
  };
  run();
  if (order !== 'preorder') {
    // The rest in preorder: the deferred subtrees, earliest first.
    deferred.sort((a, b) => a - b);
    for (const d of deferred) {
      if (kept.size >= budget) break;
      const sub = [d];
      while (sub.length && kept.size < budget) { const i = sub.pop(); kept.add(i); for (const c of [...kids[i]].reverse()) sub.push(c); }
    }
  }
  return kept;
}

const out = [];
for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter(f => f.endsWith('-wide.json.gz'))) {
    const label = f.replace(/^obs-/, '').replace(/-wide\.json\.gz$/, '');
    const wide = load(join(dir, f));
    const t = wide.timings ?? {};
    // A wide walk cut too is exact for preorder below its own count, approximate for the visible order (marked).
    const wideCut = Boolean(t.nodeCapHit || t.budgetHit || t.deadlineHit);
    const grid = load(join(dir, `grid-${label}.json.gz`)).points;
    const nodes = wide.nodes.map(wire);
    const {kids} = parents(nodes);
    const w = wide.window.frame;
    const row = {run: dir.split('/').pop().replace(/^probe-299-/, ''), label: label.replace(/^[a-z-]+_/, ''), nodes: nodes.length + (wideCut ? '+' : ''), bytesPerNode: Math.round((t.estimatedBytes ?? 0) / nodes.length), walkMsPerNode: +(((t.walkMs ?? 0) / nodes.length).toFixed(3))};
    // The nodes a walk that enters only subtrees showing in the window reaches: what a visible-only record would read.
    row.visibleReach = (() => { let n = 0; const st = [0]; while (st.length) { const i = st.pop(); if (i !== 0 && !showsLoose(nodes[i].frame, w)) continue; n += 1; st.push(...kids[i]); } return n; })();
    // Seeds: the nodes on the hit chains of a coarse grid (every 4th grid point each way, 80 pt), matched by role and
    // frame: what a few hit-tests at observation time would name as the path to what the window shows.
    const seeds = new Set();
    const byKey = new Map();
    nodes.forEach((n, i) => { if (n.frame) { const k = `${n.role}|${Math.round(n.frame.x)}|${Math.round(n.frame.y)}|${Math.round(n.frame.width)}|${Math.round(n.frame.height)}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); } });
    const xs = [...new Set(grid.map(p => p.x))].sort((a, b) => a - b), ys = [...new Set(grid.map(p => p.y))].sort((a, b) => a - b);
    const coarse = grid.filter(p => xs.indexOf(p.x) % 4 === 2 && ys.indexOf(p.y) % 4 === 2);
    row.seedPoints = coarse.length;
    for (const p of coarse) for (const c of p.chain ?? []) for (const i of byKey.get(`${c[0]}|${Math.round(c[1])}|${Math.round(c[2])}|${Math.round(c[3])}|${Math.round(c[4])}`) ?? []) seeds.add(i);
    for (const [order, budget] of [['preorder', 4000], ['preorder', 8000], ['preorder', 16000], ['visible', 4000], ['visibleLoose', 4000], ['seeded', 4000], ['seeded', 2000]]) {
      const kept = walk(nodes, kids, budget, order, w, seeds);
      const sub = nodes.filter((_, i) => kept.has(i));
      const {recs} = record(sub, kept.size < nodes.length ? ['cut'] : []);
      const c = classify(recs, grid).clickable;
      row[`${order}${budget / 1000}k`] = `${c.checked}/${c.containerOnly}/${c.unrecorded}`;
    }
    out.push(row);
  }
}
console.log('checked / container-only / unrecorded, % of clickable grid points');
console.table(out);
