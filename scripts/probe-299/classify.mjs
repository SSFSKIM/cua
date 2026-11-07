// #299: the stale-point guard's reading at each grid point, emulated offline over the engine's own observation.
// `record` rebuilds StalePoint.swift's `screenshotNodes` from the Skyshot's window nodes (preorder; the parent is the
// nearest earlier node one level up): each framed node's shown part (its frame cut by every clipping ancestor, the cut
// restarted at a window, sheet, menu or popover), and whether its children were all recorded (`subtreeRecorded`: the
// wire's `shown.of`, else its `children`, against the children the walk emitted under it; a frameless incomplete node
// counts against its parent). `classify` takes, per point, the deepest node whose shown part holds it (the later of two
// at one depth) and reads it as the guard would with nothing changed since: no node, `unrecorded`; an incomplete node
// whose interior the hit is in (or no hit), `unrecordedDescendant` (container-only); otherwise checked.
export const CLIP = new Set(['AXScrollArea', 'AXWebArea', 'AXWindow', 'AXSheet', 'AXMenu', 'AXPopover']);
export const BOUNDARY = new Set(['AXWindow', 'AXSheet', 'AXMenu', 'AXPopover']);
const PAGE = new Set(['AXScrollUpByPage', 'AXScrollDownByPage', 'AXScrollLeftByPage', 'AXScrollRightByPage']);
export const INTERACTIVE = new Set(['AXButton', 'AXCheckBox', 'AXRadioButton', 'AXLink', 'AXPopUpButton', 'AXMenuButton', 'AXMenuItem',
  'AXTextField', 'AXTextArea', 'AXComboBox', 'AXSearchField', 'AXSecureTextField', 'AXSlider', 'AXIncrementor', 'AXDisclosureTriangle',
  'AXTab', 'AXSwitch', 'AXColorWell', 'AXSegmentedControl']);
const clips = n => CLIP.has(n.role) || (n.role === 'AXGroup' && (n.actions ?? []).some(a => PAGE.has(a)));
const rect = f => f ? {x: f.x, y: f.y, w: f.width, h: f.height} : null;
const NULLRECT = {null: true};
function intersect(a, b) {
  if (a.null || b.null) return NULLRECT;
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), X = Math.min(a.x + a.w, b.x + b.w), Y = Math.min(a.y + a.h, b.y + b.h);
  return X < x || Y < y ? NULLRECT : {x, y, w: X - x, h: Y - y};
}
const holds = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const near = (r, c) => c[1] != null && Math.abs(r.x - c[1]) <= 1 && Math.abs(r.y - c[2]) <= 1 && Math.abs(r.w - c[3]) <= 1 && Math.abs(r.h - c[4]) <= 1;

/// `stops`: the walk's global cuts that fired (nodeCap, bytes, deadline), from the Skyshot's timings.
export function record(nodes, stops = []) {
  const recs = [];
  const stack = [];
  let anomalies = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    while (stack.length && recs[stack[stack.length - 1]].depth >= n.depth) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : null;
    if (parent !== null && recs[parent].depth !== n.depth - 1) anomalies += 1;
    const total = n.shown ? n.shown.of : n.children;
    recs.push({i, parent, depth: n.depth, role: n.role, frame: rect(n.frame), actions: n.actions, total, chosen: n.children,
      width: n.shown ? n.shown.subset : null, recorded: 0, title: n.title, description: n.description});
    if (parent !== null) recs[parent].recorded += 1;
    stack.push(i);
  }
  // The walk's last emitted node and its ancestors are where a global cut left children pending.
  const onCut = new Set();
  if (stops.length && recs.length) for (let j = recs.length - 1; j !== null; j = recs[j].parent) onCut.add(j);
  for (const r of recs) {
    const reasons = [];
    if (r.width) reasons.push(`width-${r.width}`);
    if (r.recorded < r.chosen) reasons.push(onCut.has(r.i) ? stops.join('+') : 'unread');
    if (r.depth >= 200 && r.chosen === 0) reasons.push('depth?');
    r.own = r.recorded < r.total ? (reasons.length ? reasons.join(',') : 'unread') : null;
    r.reason = r.own;
  }
  for (let j = recs.length - 1; j >= 0; j--) {
    const r = recs[j];
    if (!r.frame && r.reason && r.parent !== null && !recs[r.parent].reason) recs[r.parent].reason = `via-frameless:${r.reason}`;
  }
  const bounds = new Map();
  for (const r of recs) {
    const inherited = BOUNDARY.has(r.role) || r.parent === null ? null : bounds.get(r.parent) ?? null;
    const cut = x => inherited ? intersect(x, inherited) : x;
    bounds.set(r.i, clips(r) ? (r.frame ? cut(r.frame) : NULLRECT) : inherited);
    if (!r.frame) continue;
    const s = cut(r.frame);
    r.shownRect = s.null || s.w <= 0 || s.h <= 0 ? null : s;
  }
  return {recs, anomalies};
}

export function treeStats(nodes, recs) {
  let maxDepth = 0, widthVisible = 0, widthOmitted = 0, widthHidden = 0, incomplete = 0;
  for (const n of nodes) {
    maxDepth = Math.max(maxDepth, n.depth);
    if (n.shown) { if (n.shown.subset === 'omitted') widthOmitted += 1; else widthVisible += 1; widthHidden += n.shown.of - n.shown.count; }
  }
  const reasons = {};
  for (const r of recs) if (r.reason) { incomplete += 1; reasons[r.reason] = (reasons[r.reason] ?? 0) + 1; }
  return {nodes: nodes.length, maxDepth, widthVisible, widthOmitted, widthHidden, incomplete, incompleteReasons: reasons};
}

/// A point is clickable when its hit, or an ancestor below the first web area or window, has an interactive role.
export const clickable = chain => {
  if (!chain) return false;
  for (const c of chain) { if (c[0] === 'AXWebArea' || c[0] === 'AXWindow') return false; if (INTERACTIVE.has(c[0])) return true; }
  return false;
};

export function classify(recs, points) {
  const framed = recs.filter(r => r.shownRect);
  const byRole = new Map();
  for (const r of recs) if (r.frame) { if (!byRole.has(r.role)) byRole.set(r.role, []); byRole.get(r.role).push(r.frame); }
  const tally = () => ({checked: 0, checkedLeaf: 0, checkedComplete: 0, checkedHitOutside: 0, containerOnly: 0, unrecorded: 0});
  const all = tally(), click = tally();
  const reasons = {}, roles = {};
  let missedClickable = 0, noHit = 0, otherWindow = 0;
  const containerOnlyClickablePoints = [];
  for (const p of points) {
    if (p.otherWindow) otherWindow += 1;
    const chain = p.chain ?? null;
    if (!chain) noHit += 1;
    let best = null;
    for (const r of framed) if (holds(r.shownRect, p) && (!best || r.depth >= best.depth)) best = r;
    let cat, sub = null;
    if (!best) cat = 'unrecorded';
    else if (best.reason && (!chain || chain.some(c => c[0] === best.role && near(best.frame, c)))) cat = 'containerOnly';
    else { cat = 'checked'; sub = best.reason ? 'checkedHitOutside' : best.total === 0 ? 'checkedLeaf' : 'checkedComplete'; }
    const isClick = clickable(chain);
    for (const t of isClick ? [all, click] : [all]) { t[cat] += 1; if (sub) t[sub] += 1; }
    if (cat === 'containerOnly' && isClick) {
      reasons[best.reason] = (reasons[best.reason] ?? 0) + 1;
      roles[best.role] = (roles[best.role] ?? 0) + 1;
      const h = chain[0];
      const recorded = (byRole.get(h[0]) ?? []).some(f => near(f, h));
      if (!recorded) missedClickable += 1;
      containerOnlyClickablePoints.push([p.x, p.y]);
    }
  }
  const share = t => {
    const n = t.checked + t.containerOnly + t.unrecorded;
    const pc = v => n ? Math.round(1000 * v / n) / 10 : null;
    return {n, checked: pc(t.checked), containerOnly: pc(t.containerOnly), unrecorded: pc(t.unrecorded),
      leaf: pc(t.checkedLeaf), complete: pc(t.checkedComplete), hitOutside: pc(t.checkedHitOutside)};
  };
  return {all: share(all), clickable: share(click), containerOnlyReasons: reasons, containerOnlyRoles: roles, missedClickable, noHit, otherWindow,
    containerOnlyClickablePoints};
}

/// `stalePointVerdict`'s reason at each point over the engine's own record, nothing changed since the observation (the
/// node's handle and frame as recorded, the hit as the grid read it): `unrecorded`; `unrecordedDescendant` (the node
/// incomplete and the hit inside it, or no hit); `noHit`; `sameElement`; `nonInteractiveHit`; `hitAboveNode` (the hit
/// matches an ancestor of the node in the record); else `interactiveHit`, a refusal, which on a still page is false.
/// `strip` counts the points whose node has a child framed as a strip (1 pt or less), the guard change's case.
export function verdicts(probeRecord, points) {
  const r = f => f && {x: f.x, y: f.y, w: f.width, h: f.height};
  const nodes = probeRecord.map(([role, depth, complete, frame, shown]) => ({role, depth, complete, frame: r(frame), shownRect: r(shown), parent: null, stripChild: false}));
  const stack = [];
  nodes.forEach((n, i) => {
    while (stack.length && nodes[stack[stack.length - 1]].depth >= n.depth) stack.pop();
    if (stack.length) { n.parent = stack[stack.length - 1]; if (n.frame && (n.frame.w <= 1 || n.frame.h <= 1)) nodes[n.parent].stripChild = true; }
    stack.push(i);
  });
  const framed = nodes.map((n, i) => [n, i]).filter(([n]) => n.shownRect);
  const all = {}, click = {}, strip = {};
  const add = (t, k) => { t[k] = (t[k] ?? 0) + 1; };
  for (const p of points) {
    const chain = p.chain ?? null;
    let best = null, bi = -1;
    for (const [n, i] of framed) if (holds(n.shownRect, p) && (!best || n.depth >= best.depth)) { best = n; bi = i; }
    let v;
    if (!best) v = 'unrecorded';
    else if (!best.complete && (!chain || chain.some(x => x[0] === best.role && near(best.frame, x)))) v = 'unrecordedDescendant';
    else if (!chain) v = 'noHit';
    else if (chain[0][0] === best.role && near(best.frame, chain[0])) v = 'sameElement';
    else if (!INTERACTIVE.has(chain[0][0])) v = 'nonInteractiveHit';
    else {
      v = 'interactiveHit';
      for (let a = best.parent; a !== null; a = nodes[a].parent) if (nodes[a].frame && nodes[a].role === chain[0][0] && near(nodes[a].frame, chain[0])) { v = 'hitAboveNode'; break; }
    }
    add(all, v);
    if (clickable(chain)) add(click, v);
    if (best?.stripChild) add(strip, v);
  }
  return {all, clickable: click, underStripParent: strip};
}

/// `verdicts`' reading point by point (#305 picks its clicks from it): the reason, whether the point is clickable, the
/// recorded node chosen (role, frame, depth) and the hit's role and frame.
export function pointVerdicts(probeRecord, points) {
  const r = f => f && {x: f.x, y: f.y, w: f.width, h: f.height};
  const nodes = probeRecord.map(([role, depth, complete, frame, shown]) => ({role, depth, complete, frame: r(frame), shownRect: r(shown), parent: null}));
  const stack = [];
  nodes.forEach((n, i) => {
    while (stack.length && nodes[stack[stack.length - 1]].depth >= n.depth) stack.pop();
    if (stack.length) n.parent = stack[stack.length - 1];
    stack.push(i);
  });
  const framed = nodes.filter(n => n.shownRect);
  return points.map(p => {
    const chain = p.chain ?? null;
    let best = null;
    for (const n of framed) if (holds(n.shownRect, p) && (!best || n.depth >= best.depth)) best = n;
    let v;
    if (!best) v = 'unrecorded';
    else if (!best.complete && (!chain || chain.some(x => x[0] === best.role && near(best.frame, x)))) v = 'unrecordedDescendant';
    else if (!chain) v = 'noHit';
    else if (chain[0][0] === best.role && near(best.frame, chain[0])) v = 'sameElement';
    else if (!INTERACTIVE.has(chain[0][0])) v = 'nonInteractiveHit';
    else {
      v = 'interactiveHit';
      for (let a = best.parent; a !== null; a = nodes[a].parent) if (nodes[a].frame && nodes[a].role === chain[0][0] && near(nodes[a].frame, chain[0])) { v = 'hitAboveNode'; break; }
    }
    return {x: p.x, y: p.y, v, clickable: clickable(chain), node: best && {role: best.role, depth: best.depth, frame: best.frame},
      hit: chain && {role: chain[0][0], frame: {x: chain[0][1], y: chain[0][2], w: chain[0][3], h: chain[0][4]}}};
  });
}

/// The same reading over the engine's own record (`probeRecord`, the probe build's instrumentation of
/// `lineage.screenshot.nodes`: [role, depth, subtreeRecorded, frame, shown] per node in the record's order), so nodes the
/// record holds beyond the printed tree (#301's record-only rows) count.
export function classifyRecord(probeRecord, points) {
  const r = f => f && {x: f.x, y: f.y, w: f.width, h: f.height};
  const framed = probeRecord.map(([role, depth, complete, frame, shown]) => ({role, depth, complete, frame: r(frame), shownRect: r(shown)})).filter(n => n.shownRect);
  const t = {checked: 0, containerOnly: 0, unrecorded: 0}, c = {checked: 0, containerOnly: 0, unrecorded: 0};
  for (const p of points) {
    const chain = p.chain ?? null;
    let best = null;
    for (const n of framed) if (holds(n.shownRect, p) && (!best || n.depth >= best.depth)) best = n;
    const cat = !best ? 'unrecorded' : !best.complete && (!chain || chain.some(x => x[0] === best.role && near(best.frame, x))) ? 'containerOnly' : 'checked';
    t[cat] += 1;
    if (clickable(chain)) c[cat] += 1;
  }
  const share = s => { const n = s.checked + s.containerOnly + s.unrecorded; const pc = v => n ? Math.round(1000 * v / n) / 10 : null; return {n, checked: pc(s.checked), containerOnly: pc(s.containerOnly), unrecorded: pc(s.unrecorded)}; };
  return {all: share(t), clickable: share(c), recordNodes: probeRecord.length};
}
