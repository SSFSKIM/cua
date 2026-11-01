import assert from 'node:assert/strict';
import { test } from 'node:test';

import { judgeInFrontSpan, judgeRouteSpan } from '../../scripts/linux-engine-diff/witness.mjs';

// Chrome already in front: its client's windows share the resource-id base 0x600000, its frame is Openbox's, on top of
// the managed windows, with Openbox's own override-redirect window above the frames
const ROOT = 0x21d;
const TARGET = 0x600007;
const FRAME = 0x400010;
const DRAG = 0x600100; // an override-redirect drag window of Chrome's
const OTHER = 0x800001;
const OTHER_FRAME = 0x400020;
const BELOW = 0x400030;
const OPENBOX = 0x400001;
const facts = { target: TARGET, frame: FRAME, root: ROOT };

/** Chrome's drop as measured (m31-dnd-candidate-stats): its own activation, drag windows, a keyboard grab, a rewrite. */
const drop = () => ({
  root: ROOT,
  tree: [
    [BELOW, 1, 0],
    [OTHER_FRAME, 1, 0],
    [FRAME, 1, 0],
    [OPENBOX, 1, 1],
  ],
  restacks: [
    { kind: 'create', window: DRAG, or: 1 },
    { kind: 'map', window: DRAG, or: 1 },
    { kind: 'configure', window: DRAG, above: OPENBOX, or: 1 },
    { kind: 'create', window: DRAG + 1, or: 0 },
    { kind: 'configure', window: DRAG + 1, above: DRAG, or: 0 },
    { kind: 'destroy', window: DRAG + 1 },
    // the window manager's no-op raise of the frame already on top
    { kind: 'configure', window: FRAME, above: OTHER_FRAME, or: 0 },
    { kind: 'unmap', window: DRAG, or: 1 },
    { kind: 'destroy', window: DRAG },
  ],
  focus: [
    { kind: 'focus_out', window: TARGET, detail: 0, mode: 1 },
    { kind: 'focus_out', window: FRAME, detail: 1, mode: 1 },
    { kind: 'focus_in', window: ROOT, detail: 2, mode: 1 },
    { kind: 'focus_in', window: DRAG, detail: 5, mode: 1 },
    { kind: 'focus_out', window: DRAG, detail: 5, mode: 2 },
    { kind: 'focus_out', window: ROOT, detail: 2, mode: 2 },
    { kind: 'focus_in', window: FRAME, detail: 1, mode: 2 },
    { kind: 'focus_in', window: TARGET, detail: 0, mode: 2 },
    { kind: 'activate', window: TARGET, source: 1 },
  ],
  changes: [{ field: 'stacking', notify: true }],
});

test("Chrome's drop into a window already in front passes the in-front allowance: its own activation, its own windows, a rewrite", () => {
  assert.deepEqual(judgeInFrontSpan(drop(), facts), { clean: true, fields: [], allowed: ['stacking'], violations: [] });
  assert.deepEqual(judgeInFrontSpan({ ...drop(), restacks: [], focus: [], changes: [] }, facts), { clean: true, fields: [], allowed: [], violations: [] });
});

test("the in-front allowance fails another window's activation, a restack below the target, and any change read back", () => {
  const fails = (report, field) => {
    const judged = judgeInFrontSpan(report, facts);
    assert.equal(judged.clean, false, JSON.stringify(judged));
    assert.ok(judged.fields.includes(field), `${field} in ${judged.fields}`);
  };
  const r = drop();
  fails({ ...r, focus: [...r.focus, { kind: 'activate', window: OTHER, source: 2 }] }, 'active');
  // a restack below the target, the target still on top, and the same coalesced under a property rewrite
  fails({ ...r, restacks: [...r.restacks, { kind: 'configure', window: BELOW, above: OTHER_FRAME, or: 0 }] }, 'stacking');
  // another window raised above the frame, then the frame raised back: no net change, the events tell
  fails({ ...r, restacks: [...r.restacks, { kind: 'configure', window: OTHER_FRAME, above: FRAME, or: 0 }, { kind: 'configure', window: FRAME, above: OTHER_FRAME, or: 0 }] }, 'stacking');
  // another client's override-redirect window mapped over the desktop
  fails({ ...r, restacks: [...r.restacks, { kind: 'map', window: OTHER + 5, or: 1 }] }, 'stacking');
  fails({ ...r, focus: [...r.focus, { kind: 'focus_in', window: OTHER_FRAME, detail: 3, mode: 0 }] }, 'focus');
  fails({ ...r, focus: [...r.focus, { kind: 'focus_in', window: ROOT, detail: 6, mode: 0 }] }, 'focus');
  fails({ ...r, changes: [{ field: 'active', from: [TARGET], to: [OTHER] }] }, 'active');
  fails({ ...r, changes: [{ field: 'pointer', from: [1, 1], to: [2, 2] }] }, 'pointer');
  // the target not on top of the managed windows when the span began
  fails({ ...r, tree: [[FRAME, 1, 0], [OTHER_FRAME, 1, 0], [OPENBOX, 1, 1]] }, 'stacking');
  // a notify beside a forbidden event record is no longer excused
  fails({ ...r, focus: [...r.focus, { kind: 'activate', window: OTHER, source: 2 }] }, 'stacking');
  assert.equal(judgeInFrontSpan({ error: 'gone' }, facts).clean, false);
  assert.equal(judgeInFrontSpan({ ...r, restacks: undefined }, facts).clean, false, 'no restack record');
});

test('only a background request the engine recorded as already in front is judged by the allowance', () => {
  const base = { expected: 'background', reported: 'background', target: TARGET, frame: FRAME, root: ROOT };
  assert.equal(judgeRouteSpan(drop(), { ...base, inFront: true }).clean, true);
  assert.deepEqual(judgeRouteSpan(drop(), { ...base, inFront: false }).fields, ['stacking'], 'judged strictly otherwise');
  assert.equal(judgeRouteSpan(drop(), { ...base, inFront: true, reported: 'foreground' }).clean, false);
});

// task 23 (the whole-branch review of M3): the allowance excuses Chrome's temporary keyboard grab and drag windows only
// when they are gone by the span's end; the reviewer's display-free reproductions passed before
test('the in-front allowance fails a keyboard grab whose focus events never see its release by the span\'s end', () => {
  const r = drop();
  // Chrome's drop, then the root's FocusIn in mode Grab with no Ungrab after it
  const unmatched = { ...r, focus: [...r.focus, { kind: 'focus_in', window: ROOT, detail: 2, mode: 1 }] };
  const judged = judgeInFrontSpan(unmatched, facts);
  assert.equal(judged.clean, false, JSON.stringify(judged));
  // the drop's stacking notify is no longer excused beside a violation
  assert.deepEqual(judged.fields, ['focus', 'stacking']);
  // the grab's own events alone, its release cut off
  const cut = { ...r, focus: r.focus.slice(0, 4) };
  assert.deepEqual(judgeInFrontSpan(cut, facts).fields, ['focus', 'stacking']);
  // matched, the same events pass (the measured drop)
  assert.equal(judgeInFrontSpan(r, facts).clean, true);
});

test('the in-front allowance fails a drag window of the target\'s client still mapped at the span\'s end', () => {
  const r = drop();
  const left = { ...r, restacks: r.restacks.filter((e) => !(e.window === DRAG && (e.kind === 'unmap' || e.kind === 'destroy'))) };
  const judged = judgeInFrontSpan(left, facts);
  assert.equal(judged.clean, false, JSON.stringify(judged));
  assert.deepEqual(judged.fields, ['stacking']);
  assert.ok(judged.violations.some((v) => v.kind === 'left open' && v.window === DRAG), JSON.stringify(judged.violations));
  // one of the client's windows already mapped when the span began is not the drag's, and may stay
  const tooltip = DRAG + 9;
  const before = { ...r, tree: [...r.tree, [tooltip, 1, 1]] };
  assert.equal(judgeInFrontSpan(before, facts).clean, true);
});
