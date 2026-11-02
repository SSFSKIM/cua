import assert from 'node:assert/strict';
import { test } from 'node:test';

import { judgeTruncation } from '../../scripts/linux-engine-diff/services-judge.mjs';

// A state of `count` nodes, the deepest at depth `deepest` (a chain from the root), with `truncated` where given.
const tree = (count, deepest, truncated) => {
  let n = 0;
  const node = () => ({ id: `n${n++}`, children: [] });
  const root = node();
  let tip = root;
  for (let d = 1; d <= deepest; d++) tip = tip.children[tip.children.push(node()) - 1];
  while (n < count) root.children.push(node());
  return { ax_tree_source: 'at_spi', ax_tree: root, ...(truncated ? { truncated } : {}) };
};
const CUT = { nodes: 1263, depth: 2, failed: 0 };
const overBudget = tree(5000, 63, CUT);
const read = (state, filtered = false) => ({ state, filtered });

test('a query step that renders nothing is still judged: an over-budget query read missing its field fails', () => {
  const missing = judgeTruncation({ scene: 'over-budget', lane: 'cua', reads: [read(tree(3, 1), true)], whole: overBudget });
  assert.equal(missing.holds, false);
  const kept = judgeTruncation({ scene: 'over-budget', lane: 'cua', reads: [read(tree(3, 1, CUT), true)], whole: overBudget });
  assert.equal(kept.holds, true);
  // with no whole read of the window before it, a filtered read cannot be judged, and fails
  assert.equal(judgeTruncation({ scene: 'over-budget', lane: 'cua', reads: [read(tree(3, 1, CUT), true)], whole: null }).holds, false);
});

test("every read a step made is judged, rendered or not, and a whole read becomes the next steps' reference", () => {
  const first = judgeTruncation({ scene: 'over-budget', lane: 'cua', reads: [read(overBudget)], whole: null });
  assert.deepEqual(first, { holds: true, whole: overBudget });
  // the released 0.3.0 engine: a whole over-budget read without the field fails with no line in sight
  assert.equal(judgeTruncation({ scene: 'over-budget', lane: 'cua', reads: [read(tree(5000, 63))], whole: null }).holds, false);
  // each read of a step, not only its last
  assert.equal(judgeTruncation({ scene: 'over-budget', lane: 'cua', reads: [read(tree(5000, 63)), read(overBudget)], whole: null }).holds, false);
  // gedit reads whole, with no field and no line
  const gedit = tree(498, 12);
  assert.deepEqual(judgeTruncation({ scene: 'gedit', lane: 'cua', reads: [read(gedit)], whole: null, shown: null }), { holds: true, whole: gedit });
  // a step that read nothing and renders nothing has nothing to judge
  assert.deepEqual(judgeTruncation({ scene: 'gedit', lane: 'cua', reads: [], whole: gedit }), { holds: true, whole: gedit });
});

test("the vendor service's lane is not held to cua's declaration, but its line and hydration are judged", () => {
  assert.equal(judgeTruncation({ scene: 'over-budget', lane: 'vendor', reads: [read(tree(5000, 63))], whole: null }).holds, true);
  assert.equal(judgeTruncation({ scene: 'over-budget', lane: 'vendor', reads: [read(overBudget)], whole: null, shown: 1264 }).holds, false, 'a line short of the sum');
});

test("a rendered state's line shows its read's sum, and the tree step's state keeps the read's field", () => {
  const judge = (extra) => judgeTruncation({ scene: 'over-budget', lane: 'cua', reads: [read(overBudget)], whole: overBudget, ...extra }).holds;
  assert.equal(judge({ shown: 1265 }), true);
  assert.equal(judge({ shown: null }), false, 'a cut read with no line');
  assert.equal(judge({ shown: 12 }), false);
  assert.equal(judgeTruncation({ scene: 'gedit', lane: 'cua', reads: [], whole: null, shown: 3 }).holds, false, 'a line with no read');
  assert.equal(judge({ hydrated: CUT }), true);
  assert.equal(judge({ hydrated: null }), false, "sky.mjs's hydration dropped the field");
  assert.equal(judgeTruncation({ scene: 'gedit', lane: 'cua', reads: [read(tree(498, 12))], whole: null, hydrated: null }).holds, true);
});
