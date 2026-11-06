// #304: the stale-point guard of main f20a25ee (native/engine/Sources/Engine/StalePoint.swift), emulated over a walk's
// raw reads (the probe build's `probeReads`, scripts/probe-304/instrument.py) and the tool's hit chains on a still page.
// `buildRecord` ports `screenshotNodes` (each framed node's shown part, `subtreeRecorded` with a frameless node's lack
// counting against its parent, `thinGap` and `gapsBelow`); `verdictAt` ports `stalePointVerdict` with nothing changed
// since the observation, the live reads answered by the hit chain (an element is matched by role and frame within 1 pt):
// no node at the point, `unrecorded`; the node incomplete and the hit inside it (or no hit), `unrecordedDescendant`;
// then `noHit`, `sameElement`, `nonInteractiveHit`, `hitAboveNode`; an interactive hit under one of the node's gap strips,
// `unrecordedDescendant` (#301's thin-gap rule); a recorded hit shown at the point (#305), `recordedHit`; else
// `interactiveHit`. Its share: `unrecorded`, container-only (`unrecordedDescendant`), checked (every other reason).
export const INTERACTIVE = new Set(['AXButton', 'AXCheckBox', 'AXRadioButton', 'AXLink', 'AXPopUpButton', 'AXMenuButton', 'AXMenuItem',
  'AXTextField', 'AXTextArea', 'AXComboBox', 'AXSearchField', 'AXSecureTextField', 'AXSlider', 'AXIncrementor', 'AXDisclosureTriangle',
  'AXTab', 'AXSwitch', 'AXColorWell', 'AXSegmentedControl']);
const BOUNDARY = new Set(['AXWindow', 'AXSheet', 'AXMenu', 'AXPopover']);
const AREA_ROLES = new Set(['AXWindow', 'AXWebArea', 'AXScrollArea', 'AXSplitGroup', 'AXApplication']);

export const R = f => f == null ? null : Array.isArray(f) ? {x: f[0], y: f[1], w: f[2], h: f[3]} : {x: f.x, y: f.y, w: f.width ?? f.w, h: f.height ?? f.h};
export function intersect(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), X = Math.min(a.x + a.w, b.x + b.w), Y = Math.min(a.y + a.h, b.y + b.h);
  return X < x || Y < y ? null : {x, y, w: X - x, h: Y - y};
}
export const thin = f => f.w <= 1 || f.h <= 1;
/// Walk.swift `showsBeyondStrip`.
export const showsBeyondStrip = (f, area) => { const s = intersect(f, area); return !!s && s.w > 1 && s.h > 1; };
const holds = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const near = (r, c) => r && c[1] != null && Math.abs(r.x - c[1]) <= 1 && Math.abs(r.y - c[2]) <= 1 && Math.abs(r.w - c[3]) <= 1 && Math.abs(r.h - c[4]) <= 1;
const matches = (node, c) => node.role === c[0] && near(node.frame, c);

/// The probe build's rows as objects: [number, parent, depth, role, frame, childCount, chosen, clips, bytes, order,
/// enters, expanded, recordOnly].
export const rows = probeReads => probeReads.map(([number, parent, depth, role, frame, childCount, chosen, clips, bytes, order, enters, expanded, recordOnly]) =>
  ({number, parent, depth, role, frame: R(frame), childCount, chosen, clips, bytes, order, enters, expanded, recordOnly}));

/// StalePoint.swift `screenshotNodes` over reads in emission order (each with `number`, `parent`, `role`, `frame`,
/// `childCount`, `clips`, `depth`).
export function buildRecord(reads) {
  const recorded = new Map();
  for (const r of reads) if (r.parent != null) recorded.set(r.parent, (recorded.get(r.parent) ?? 0) + 1);
  const incomplete = new Set(), gaps = new Map();
  for (let j = reads.length - 1; j >= 0; j--) {
    const r = reads[j];
    if ((recorded.get(r.number) ?? 0) < r.childCount) incomplete.add(r.number);
    if (!r.frame && incomplete.has(r.number) && r.parent != null) incomplete.add(r.parent);
    if (r.frame && thin(r.frame) && incomplete.has(r.number)) { if (!gaps.has(r.number)) gaps.set(r.number, []); gaps.get(r.number).push(r.number); }
    if (r.parent != null && gaps.has(r.number)) { if (!gaps.has(r.parent)) gaps.set(r.parent, []); gaps.get(r.parent).push(...gaps.get(r.number)); }
  }
  const bounds = new Map(), framed = new Map(), byNumber = new Map();
  const nodes = [];
  for (const r of reads) {
    const inherited = BOUNDARY.has(r.role) || r.parent == null ? undefined : bounds.get(r.parent);
    const cut = f => inherited === undefined ? f : inherited === null ? null : intersect(f, inherited);
    bounds.set(r.number, r.clips ? (r.frame ? cut(r.frame) : null) : inherited);
    const ancestor = r.parent != null ? framed.get(r.parent) : undefined;
    if (!r.frame) { framed.set(r.number, ancestor); continue; }
    framed.set(r.number, nodes.length);
    const s = cut(r.frame);
    const node = {index: nodes.length, number: r.number, role: r.role, frame: r.frame, shown: s && s.w > 0 && s.h > 0 ? s : null, depth: r.depth,
      complete: !incomplete.has(r.number), thinGap: thin(r.frame) && incomplete.has(r.number), gapsBelow: gaps.get(r.number) ?? [], ancestor, read: r};
    nodes.push(node);
    byNumber.set(r.number, node);
  }
  return {nodes, byNumber, window: nodes.find(n => n.depth === 0) ?? null};
}

/// The guard's reason at `p` (a grid point with its hit chain, [role, x, y, w, h] from the hit up to its window).
export function verdictAt(rec, p) {
  const {nodes, byNumber} = rec;
  const chain = p.chain ?? null;
  let best = null;
  for (const n of nodes) if (n.shown && holds(n.shown, p) && (!best || n.depth >= best.depth)) best = n;
  if (!best) return {v: 'unrecorded'};
  const inside = !chain || chain.some(c => matches(best, c));
  if (!best.complete && inside) return {v: 'unrecordedDescendant', via: 'incomplete', node: best};
  if (!chain) return {v: 'noHit', node: best};
  if (matches(best, chain[0])) return {v: 'sameElement', node: best};
  if (!INTERACTIVE.has(chain[0][0])) return {v: 'nonInteractiveHit', node: best};
  for (let a = best.ancestor; a != null; a = nodes[a].ancestor) if (matches(nodes[a], chain[0])) return {v: 'hitAboveNode', node: best};
  if (best.gapsBelow.length) {
    for (const number of best.gapsBelow) {
      const g = byNumber.get(number);
      if (chain.slice(1).some(c => matches(g, c))) return {v: 'unrecordedDescendant', via: 'gap', node: best, gap: g};
    }
  }
  // #305: the hit is a recorded node whose shown frame (widened 2 pt) holds the point, or its nearest recorded ancestor's
  // (not an area role, at most a quarter of the window).
  const windowArea = rec.window ? rec.window.frame.w * rec.window.frame.h : null;
  const widened = s => s && {x: s.x - 2, y: s.y - 2, w: s.w + 4, h: s.h + 4};
  for (const n of nodes) {
    if (!matches(n, chain[0])) continue;
    if (n.shown && holds(widened(n.shown), p)) return {v: 'recordedHit', node: best};
    const a = n.ancestor != null ? nodes[n.ancestor] : null;
    if (a && !AREA_ROLES.has(a.role) && windowArea && a.frame.w * a.frame.h <= 0.25 * windowArea && a.shown && holds(widened(a.shown), p)) return {v: 'recordedHit', node: best};
  }
  return {v: 'interactiveHit', node: best};
}
export const category = v => v === 'unrecorded' ? 'unrecorded' : v === 'unrecordedDescendant' ? 'containerOnly' : 'checked';

/// A point is clickable when its hit, or an ancestor below the first web area or window, has an interactive role (#299).
export const clickable = chain => {
  if (!chain) return false;
  for (const c of chain) { if (c[0] === 'AXWebArea' || c[0] === 'AXWindow') return false; if (INTERACTIVE.has(c[0])) return true; }
  return false;
};

/// Whether the hit chain passes through a recorded strip whose children the record lacks.
export function underStrip(rec, chain) {
  if (!chain) return null;
  for (const n of rec.nodes) if (n.thinGap && chain.slice(1).some(c => matches(n, c))) return n;
  return null;
}

/// Shares over clickable points: checked / container-only / unrecorded (%), counts and reasons.
export function shares(rec, points) {
  const t = {checked: 0, containerOnly: 0, unrecorded: 0}, reasons = {};
  const per = [];
  for (const p of points) {
    if (!clickable(p.chain)) continue;
    const r = verdictAt(rec, p);
    const c = category(r.v);
    t[c] += 1;
    const k = r.via ? `${r.v}:${r.via}` : r.v;
    reasons[k] = (reasons[k] ?? 0) + 1;
    per.push({p, r, c});
  }
  const n = t.checked + t.containerOnly + t.unrecorded;
  const pc = v => n ? Math.round(1000 * v / n) / 10 : null;
  return {n, checked: pc(t.checked), containerOnly: pc(t.containerOnly), unrecorded: pc(t.unrecorded), counts: t, reasons, per};
}

/// The engine's own record (`probeRecord`) against this port's, node by node.
export function checkPort(rec, probeRecord) {
  if (!probeRecord) return null;
  let differ = 0;
  const first = [];
  const n = Math.max(rec.nodes.length, probeRecord.length);
  for (let i = 0; i < n; i++) {
    const a = rec.nodes[i], b = probeRecord[i];
    const same = a && b && a.role === b[0] && a.depth === b[1] && a.complete === b[2] && a.thinGap === b[5] && a.gapsBelow.length === b[6]
      && ((a.shown == null) === (b[4] == null));
    if (!same) { differ += 1; if (first.length < 3) first.push([i, a && [a.role, a.depth, a.complete, a.thinGap, a.gapsBelow.length, !!a.shown], b && [b[0], b[1], b[2], b[5], b[6], !!b[4]]]); }
  }
  return {nodes: rec.nodes.length, engine: probeRecord.length, differ, first};
}
