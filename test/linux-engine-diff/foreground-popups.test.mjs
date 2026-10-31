import assert from 'node:assert/strict';
import { test } from 'node:test';

import { judgeForegroundSpan, judgeRouteSpan, judgeSpan } from '../../scripts/linux-engine-diff/witness.mjs';

// Chrome activated and raised by the foreground route, then its drop: its client's windows share the resource-id base
// 0x600000; its frame is Openbox's; another client's frame sits on top before the raise
const TARGET = 0x600007;
const FRAME = 0x400010;
const OTHER_FRAME = 0x400020;
const DRAG = 0x600100; // an override-redirect drag window of Chrome's own
const FOREIGN = 0x800100; // another client's override-redirect window
const facts = { target: TARGET, frame: FRAME, focusWithin: (w) => w === TARGET };
const tree = [
  [FRAME, 1, 0],
  [OTHER_FRAME, 1, 0],
];
const raise = { kind: 'configure', window: FRAME, above: OTHER_FRAME, or: 0 };
const dragWindows = [
  { kind: 'create', window: DRAG, or: 1 },
  { kind: 'map', window: DRAG, or: 1 },
  { kind: 'configure', window: DRAG, above: FRAME, or: 1 },
  { kind: 'unmap', window: DRAG, or: 1 },
  { kind: 'destroy', window: DRAG },
];
const span = (restacks) => ({ tree, restacks, focus: [], changes: [] });

test("the foreground route's witness lets the target client's own override-redirect windows map, restack and unmap", () => {
  assert.equal(judgeForegroundSpan(span([raise, ...dragWindows]), facts).clean, true);
  assert.deepEqual(judgeForegroundSpan(span([raise, ...dragWindows]), facts).allowed, ['stacking']);
});

test("another client's override-redirect window, or one of the target's left mapped by a drag, still fails", () => {
  const foreign = [
    { kind: 'map', window: FOREIGN, or: 1 },
    { kind: 'unmap', window: FOREIGN, or: 1 },
  ];
  assert.deepEqual(judgeForegroundSpan(span([raise, ...foreign]), facts).fields, ['stacking'], "another client's popup");
  // the target's own managed window (not override-redirect) is no popup
  assert.deepEqual(judgeForegroundSpan(span([raise, { kind: 'map', window: DRAG + 1, or: 0 }]), facts).fields, ['stacking']);
  // the frame may only rise to the top: another window raised over it after its raise fails
  assert.deepEqual(judgeForegroundSpan(span([raise, { kind: 'configure', window: OTHER_FRAME, above: FRAME, or: 0 }]), facts).fields, ['stacking']);
  // a drag's window still mapped at the end
  const leftOpen = span([raise, ...dragWindows.slice(0, 3)]);
  assert.deepEqual(judgeForegroundSpan(leftOpen, facts).fields, ['stacking'], 'a drag leaves no window open');
  // where the input opens one (a foreground right click's menu), it may stay
  assert.equal(judgeForegroundSpan(leftOpen, { ...facts, opensWindows: true }).clean, true);
  // with no target, nothing is the target's
  assert.equal(judgeForegroundSpan(span([raise, ...dragWindows]), { ...facts, target: undefined }).clean, false);
});

test("the strict witness of shared mode counts every map and restack, the target's own included", () => {
  const strict = judgeRouteSpan({ ...span([...dragWindows]), changes: [{ field: 'stacking', notify: true }] }, { expected: 'background', reported: 'background', target: TARGET, frame: FRAME });
  assert.equal(strict.clean, false);
  assert.equal(judgeSpan({ ...span([]), changes: [{ field: 'stacking', notify: true }] }).clean, false);
});
