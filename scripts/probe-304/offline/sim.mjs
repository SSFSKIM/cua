// #304: main's selection (native/engine/Sources/Engine/Walk.swift `TreeWalk.select` at f20a25ee) replayed over the
// wide engine's whole tree, with the candidate fixes as options, so each is priced by the reads it adds and judged by
// the guard's reading of its record (scripts/probe-304/guard.mjs) at the same grid. The tree is the wide walk's raw reads
// (`probeReads`, emission order = the document's order): each node's chosen children (the width rule ran there as it
// does on main, at the same position), its AXChildren count, frame, clipping and the bytes the selection charges.
import {rows, R, buildRecord} from '../guard.mjs';

const EMPTY = {empty: true};
const inter = (a, b) => {
  if (!a || !b || a.empty || b.empty) return EMPTY;
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), X = Math.min(a.x + a.w, b.x + b.w), Y = Math.min(a.y + a.h, b.y + b.h);
  return X < x || Y < y ? EMPTY : {x, y, w: X - x, h: Y - y};
};
const beyondStrip = (f, area) => { const s = inter(f, area); return !s.empty && s.w > 1 && s.h > 1; };
const isThin = f => f.w <= 1 || f.h <= 1;

/// The wide tree: per node (by emission index) its row, its tree children and record-only children, its parent.
export function tree(probeReads, probeMenu = 0) {
  const rs = rows(probeReads);
  const byNumber = new Map(rs.map((r, i) => [r.number, i]));
  const kids = rs.map(() => []), recKids = rs.map(() => []), parent = rs.map(() => null);
  rs.forEach((r, i) => {
    const p = r.parent == null ? null : byNumber.get(r.parent);
    parent[i] = p ?? null;
    if (p != null) (r.recordOnly ? recKids : kids)[p].push(i);
  });
  return {rs, kids, recKids, parent, menu: probeMenu, window: rs[0]?.frame};
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p] <= a[i]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l] < a[m]) m = l; if (r < a.length && a[r] < a[m]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

/// One walk. Options:
///   budget          the node budget (4,000; the selection's limit is it less the menu bar's nodes)
///   frameFirst      'all' | {wide: K}: a child's frame is read before it is charged, and a child that does not show
///                   beyond a strip waits unread (every expanded node's children, or only a node's with more than K)
///   webLast         the window's non-web part first: a web area's children wait until nothing else showing is left
///   stripPeek       a strip set aside inside its clip (not at its edge) has its children's frames read, and is entered
///                   when one shows (or has no frame); 'oracle' enters a strip whenever anything below it shows
///   stripsFirst     the deferred strips inside their clip are taken up before the other deferred elements
export function select(T, opts = {}) {
  const {rs, kids} = T;
  const n = rs.length;
  const nodeLimit = (opts.budget ?? 4000) - T.menu, byteLimit = 6 * 1024 * 1024;
  const sel = new Uint8Array(n), expanded = new Uint8Array(n);
  const clipOf = new Array(n);
  let kept = 0, bytes = 0, cut = false, frames = 0, framesBisect = 0, peeks = 0;
  const order = [];
  const stack = [0];
  clipOf[0] = T.window;
  const deferred = new MinHeap(), unread = new MinHeap(), strips = new MinHeap();
  const webQ = [];
  let oracle = null;
  if (opts.stripPeek === 'oracle') {
    // Whether anything in a node's subtree shows beyond a strip in its own clip (computed with the clips as walked).
    oracle = new Uint8Array(n);
  }
  const childClip = i => {
    const clip = clipOf[i];
    if (!clip) return clip;
    return rs[i].clips && rs[i].frame ? inter(clip, rs[i].frame) : clip;
  };
  const enters = i => {
    if (rs[i].depth === 0 || !clipOf[i] || !rs[i].frame) return true;
    return beyondStrip(rs[i].frame, clipOf[i]);
  };
  const ffApplies = i => opts.frameFirst === 'all' || (opts.frameFirst?.wide != null && kids[i].length > opts.frameFirst.wide);
  const expand = i => {
    expanded[i] = 1;
    const cc = childClip(i);
    const ks = kids[i];
    const ff = ffApplies(i);
    let shown = 0;
    for (let k = ks.length - 1; k >= 0; k--) {
      const c = ks[k];
      clipOf[c] = cc;
      if (ff) {
        frames += 1;
        if (rs[c].frame && cc && !beyondStrip(rs[c].frame, cc)) { unread.push(c); continue; }
        shown += 1;
      }
      stack.push(c);
    }
    if (ff) framesBisect += opts.frameFirst === 'all' ? ks.length : 2 * Math.ceil(Math.log2(ks.length + 1)) + shown + 2;
  };
  const inView = i => {
    const f = rs[i].frame, c = clipOf[i];
    if (!f || !c || c.empty) return false;
    return f.y > c.y + 1 && f.y + f.h < c.y + c.h - 1 && f.x >= c.x - 1 && f.x + f.w <= c.x + c.w + 1;
  };
  const subtreeShows = i => {
    // The oracle: a descendant whose frame shows beyond a strip in the clip it would be walked with.
    const st = [[i, childClip(i)]];
    while (st.length) {
      const [j, clip] = st.pop();
      for (const c of kids[j]) {
        if (rs[c].frame && clip && beyondStrip(rs[c].frame, clip)) return true;
        const cc = clip && rs[c].clips && rs[c].frame ? inter(clip, rs[c].frame) : clip;
        st.push([c, cc]);
      }
    }
    return false;
  };
  // A peek: the strip's children's frames, and through children that are strips themselves (a children read and their
  // frames), `depth` levels at most, 100 elements a level: whether one shows (or has no frame).
  const peek = (i, depth) => {
    let level = [[i, childClip(i)]];
    for (let d = 0; d < depth && level.length; d++) {
      const next = [];
      let budget = 100;
      for (const [j, cc] of level) {
        if (d > 0) frames += 1;  // the strip child's children read
        for (const c of kids[j]) {
          if (budget-- <= 0) break;
          frames += 1;
          const fc = rs[c].frame;
          if (!fc || beyondStrip(fc, cc)) return true;
          if (isThin(fc) && kids[c].length) next.push([c, rs[c].clips ? inter(cc, fc) : cc]);
        }
      }
      level = next;
    }
    return false;
  };
  const setAside = i => {
    const f = rs[i].frame;
    if (f && isThin(f)) {
      const where = inView(i) || (opts.stripPeek?.edge ?? false);
      if (opts.stripPeek === 'oracle') { if (subtreeShows(i)) { expand(i); return; } }
      else if (opts.stripPeek && where) {
        peeks += 1;
        const before = frames;
        const shows = peek(i, opts.stripPeek.depth ?? 1);
        framesBisect += frames - before;
        if (shows) { expand(i); return; }
      }
      if (opts.stripsFirst && (inView(i) || opts.stripsFirst.edge)) { strips.push(i); return; }
    }
    deferred.push(i);
  };
  let webDone = !opts.webLast;
  for (;;) {
    if (!stack.length) {
      if (cut) break;
      if (!webDone) { if (webQ.length) { expand(webQ.shift()); continue; } webDone = true; }
      if (strips.size) { const i = strips.pop(); if (!expanded[i]) expand(i); continue; }
      const d = deferred.size ? deferred.peek() : Infinity, u = unread.size ? unread.peek() : Infinity;
      if (d === Infinity && u === Infinity) break;
      if (d <= u) { deferred.pop(); if (!expanded[d]) expand(d); } else { unread.pop(); stack.push(u); }
      continue;
    }
    const i = stack.pop();
    if (sel[i] || cut) continue;
    if (bytes >= byteLimit || kept >= nodeLimit) { cut = true; continue; }
    sel[i] = 1; kept += 1; bytes += rs[i].bytes || 1; order.push(i);
    if (!kids[i].length) { expanded[i] = 1; continue; }
    if (enters(i)) {
      if (!webDone && rs[i].role === 'AXWebArea') webQ.push(i); else expand(i);
    } else setAside(i);
  }
  return {sel, order, kept, cut, frames, framesBisect, peeks, clipOf};
}

/// The guard's record of a walk: its selected nodes, their record-only children as the wide walk read them (#301 item 4),
/// and `extra` nodes (seeds) with their ancestors, each with its real AXChildren count.
export function recordOf(T, walk, extra = []) {
  const {rs, recKids, parent} = T;
  const inRec = new Uint8Array(rs.length);
  for (let i = 0; i < rs.length; i++) if (walk.sel[i]) inRec[i] = 1;
  let recordOnly = 0;
  for (let i = 0; i < rs.length; i++) {
    if (!walk.sel[i] || !recKids[i].length) continue;
    const st = [...recKids[i]];
    while (st.length && recordOnly < 1000) { const j = st.pop(); if (inRec[j]) continue; inRec[j] = 1; recordOnly += 1; st.push(...T.kids[j], ...recKids[j]); }
  }
  let added = 0;
  for (const j of extra) for (let a = j; a != null && !inRec[a]; a = parent[a]) { inRec[a] = 1; added += 1; }
  const reads = [];
  for (let i = 0; i < rs.length; i++) if (inRec[i]) reads.push({...rs[i], number: i, parent: parent[i]});
  return {rec: buildRecord(reads), added, recordOnly};
}

/// A hit chain ([role, x, y, w, h] from the hit up to the window) as wide nodes: from the window down, each entry the
/// child (or a frameless child's child, three levels at most) of the role and frame; the deepest found.
export function chainNodes(T, chain) {
  if (!chain?.length) return [];
  const {rs, kids} = T;
  const near = (f, c) => f && c[1] != null && Math.abs(f.x - c[1]) <= 1 && Math.abs(f.y - c[2]) <= 1 && Math.abs(f.w - c[3]) <= 1 && Math.abs(f.h - c[4]) <= 1;
  const fits = (i, c) => rs[i].role === c[0] && (c[1] == null ? !rs[i].frame : near(rs[i].frame, c));
  const down = [...chain].reverse();
  if (!fits(0, down[0])) return [];
  const found = [0];
  let cur = 0;
  for (let k = 1; k < down.length; k++) {
    let level = [cur], hit = null;
    for (let d = 0; d < 3 && !hit; d++) {
      const next = [];
      for (const j of level) for (const c of kids[j]) { if (fits(c, down[k])) { hit = c; break; } if (!rs[c].frame) next.push(c); }
      level = next;
    }
    if (hit == null) break;
    found.push(hit); cur = hit;
  }
  return found;
}
