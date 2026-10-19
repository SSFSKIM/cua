// The diff of cua's own macOS engine service (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, "The
// service", Diff; Interfaces, TreeDiff): an observation in the default mode answers what changed since the previous
// observation of the same app on the connection, in the vendor's form (docs/doperpowers/research/2026-10-18-own-native-engine/
// sky-behaviour.md §9, from F-helper-logic.md §4):
//
//   The following is a diff from the previous accessibility tree for Window: "<title>" with ~ and + representing
//   changed and added elements, respectively. Removed elements are summarized by ID range.
//   Removed element IDs: 3-7, 12
//   ~<tabs><index> <line>            a changed element (its new line)
//   +<tabs><index> <line>            an added element, and every element under it
//   <the trailer: selected text, selected elements or the focused element>
//
// Changes come in depth-first order of the current tree, with no context lines. With no change the answer is
// `There has been no change in the accessibility tree for Window: "<title>".` and the trailer. The diff may have at
// most as many lines as the current tree has elements; when the changes, plus one line for the removed summary, do not
// fit, the answer is the full tree. A previous observation of another lineage (or none) answers the full tree.
//
// `diff(previous, current)` takes the two observations as the service keeps them, `{skyshot, numbering}` each (the
// numbering shape is at the top of ./render.mjs). Pure. Elements are compared by index under matched parents, the
// vendor's sibling algorithm keyed on element ID; an element changes when its line text changes (the width rule's
// `(showing …)` text is never compared). cua never reuses an index, so an element whose index the current tree still
// holds is never listed as removed, even when it moved under another parent (where it is added).
import {elementLine, layout, render} from './render.mjs';

const LEGEND = 'with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.';

export function diff(previous, current) {
  if (!previous || previous.skyshot.lineage !== current.skyshot.lineage) return render(current.skyshot, current.numbering);
  const before = layout(previous.skyshot, previous.numbering);
  const now = layout(current.skyshot, current.numbering);
  const changes = [], removed = [];
  compareSiblings(before.roots, now.roots, changes, removed);

  const present = new Set();
  (function visit(nodes) { for (const node of nodes) { present.add(node.index); visit(node.children); } })(now.roots);
  const removedIds = [...new Set(removed)].filter(index => !present.has(index)).sort((a, b) => a - b);

  const window = `Window: "${now.title}"`;
  if (!changes.length && !removedIds.length) return `There has been no change in the accessibility tree for ${window}.${now.trailer}`;

  let remaining = now.nodeCount;
  const lines = [];
  for (const change of changes) {
    const changeLines = change.kind === 'update' ? [`~${elementLine(change.node)}`] : subtree(change.node).map(node => `+${elementLine(node)}`);
    if (changeLines.length > remaining) return render(current.skyshot, current.numbering);
    remaining -= changeLines.length;
    lines.push(...changeLines);
  }
  if (removedIds.length) {
    if (remaining < 1) return render(current.skyshot, current.numbering);
    lines.unshift(`Removed element IDs: ${ranges(removedIds)}`);
  }
  return `The following is a diff from the previous accessibility tree for ${window} ${LEGEND}\n${[...lines, ...now.markers].join('\n')}${now.trailer}`;
}

// One sibling list against the previous one under a matched parent [F §3.2, §4.4]: an element of the previous list
// is matched when it keeps its place in the longest run of elements whose order is unchanged; a matched pair is an
// update when its text changed and its children are compared in turn; every other current element is an insertion,
// every other previous one a removal (with everything under it).
function compareSiblings(oldList, newList, changes, removed) {
  const oldPosition = new Map(oldList.map((node, position) => [node.index, position]));
  const matchedOld = newList.map(node => oldPosition.get(node.index) ?? -1);
  const stable = increasingRun(matchedOld);
  const kept = new Set();
  newList.forEach((node, position) => {
    if (!stable.has(position)) { changes.push({kind: 'insert', node}); return; }
    const old = oldList[matchedOld[position]];
    kept.add(matchedOld[position]);
    if (old.text !== node.text) changes.push({kind: 'update', node});
    compareSiblings(old.children, node.children, changes, removed);
  });
  oldList.forEach((node, position) => { if (!kept.has(position)) removed.push(...subtree(node).map(each => each.index)); });
}

// The positions (in `sequence`) of a longest strictly increasing subsequence of its non-negative values.
function increasingRun(sequence) {
  const tails = [], previous = new Array(sequence.length).fill(-1);
  sequence.forEach((value, position) => {
    if (value < 0) return;
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sequence[tails[mid]] < value) lo = mid + 1; else hi = mid; }
    if (lo > 0) previous[position] = tails[lo - 1];
    tails[lo] = position;
  });
  const run = new Set();
  for (let position = tails.at(-1) ?? -1; position >= 0; position = previous[position]) run.add(position);
  return run;
}

const subtree = node => [node, ...node.children.flatMap(subtree)];

// `3-7, 12`: consecutive indexes as a range, single ones alone [F §4.6].
function ranges(sorted) {
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let end = i;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
    out.push(end > i ? `${sorted[i]}-${sorted[end]}` : `${sorted[i]}`);
    i = end + 1;
  }
  return out.join(', ');
}
