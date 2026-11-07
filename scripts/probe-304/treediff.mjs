// #304's A/B: the printed tree (src/services/engine/render.mjs over a fresh numbering) and the stale-point guard's record
// (the probe build's `probeRecord`) of two observations, compared; a difference is reported with its node path (the
// printed line's ancestors, or the record entry's ancestors by depth). Shared by scripts/probe-304/ab.mjs (on the runner)
// and the offline report.
import {render, advanceNumbering} from '../../src/services/engine/render.mjs';
import {createHash} from 'node:crypto';

export const printed = sky => { try { return render(sky, advanceNumbering(null, sky)); } catch (e) { return `RENDER ERROR ${String(e?.message ?? e)}`; } };
/// JSON with every object's keys sorted: the engine's dictionaries serialize in a per-process order (Swift's hash seed),
/// so two engines' identical values differ as plain JSON.
export const canon = v => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
export const digest = v => createHash('sha256').update(typeof v === 'string' ? v : canon(v)).digest('hex').slice(0, 16);

// An element line without its index (`<tabs><index> <text>`), so a path reads by role and label.
const bare = line => line.replace(/^(\t*)\d+ /, '$1');
const depthOf = line => line.match(/^\t*/)[0].length;
function linePath(lines, i) {
  const path = [bare(lines[i]).trim().slice(0, 80)];
  let d = depthOf(lines[i]);
  for (let j = i - 1; j >= 0 && d > 0; j--) if (depthOf(lines[j]) < d) { d = depthOf(lines[j]); path.unshift(bare(lines[j]).trim().slice(0, 50)); }
  return path;
}

/// The printed trees `a` and `b` (strings): null when identical, else the line count of each, the number of differing
/// lines (position by position), and the first difference with its path in each.
export function diffPrinted(a, b) {
  if (a === b) return null;
  const la = a.split('\n'), lb = b.split('\n');
  let first = -1, count = 0;
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) { count += 1; if (first < 0) first = i; }
  return {lines: [la.length, lb.length], differing: count, first,
    a: la[first] != null ? {line: la[first].slice(0, 200), path: linePath(la, first)} : null,
    b: lb[first] != null ? {line: lb[first].slice(0, 200), path: linePath(lb, first)} : null};
}

function recordPath(rec, i) {
  const path = [`${rec[i][0]}@${canon(rec[i][3])}`];
  let d = rec[i][1];
  for (let j = i - 1; j >= 0 && d > 0; j--) if (rec[j][1] < d) { d = rec[j][1]; path.unshift(rec[j][0]); }
  return path;
}

/// The guard's records `a` and `b` ([role, depth, subtreeRecorded, frame, shown, thinGap, gapsBelow] per node): null when
/// identical, else the entry counts, the number of differing entries and the first difference with its path.
export function diffRecord(a, b) {
  a ??= []; b ??= [];
  const sa = a.map(canon), sb = b.map(canon);
  let first = -1, count = 0;
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) if (sa[i] !== sb[i]) { count += 1; if (first < 0) first = i; }
  if (first < 0) return null;
  return {entries: [a.length, b.length], differing: count, first,
    a: a[first] ? {entry: sa[first].slice(0, 200), path: recordPath(a, first)} : null,
    b: b[first] ? {entry: sb[first].slice(0, 200), path: recordPath(b, first)} : null};
}

/// The raw nodes without their per-lineage tokens (a stricter check than the printed tree): null when identical.
export const strip = nodes => (nodes ?? []).map(({token, ...rest}) => rest);
export function diffNodes(a, b) {
  const sa = strip(a).map(canon), sb = strip(b).map(canon);
  let first = -1, count = 0;
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) if (sa[i] !== sb[i]) { count += 1; if (first < 0) first = i; }
  return first < 0 ? null : {nodes: [sa.length, sb.length], differing: count, first, a: sa[first]?.slice(0, 200) ?? null, b: sb[first]?.slice(0, 200) ?? null};
}
