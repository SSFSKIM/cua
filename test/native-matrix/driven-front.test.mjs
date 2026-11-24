// Intervention fires and the pre-action refusal with TextEdit in front (scripts/native-matrix/probe-run.mjs
// drivenInFront; pilot C-2's vendor rows "textedit's window was not in front"): TextEdit activated and its document
// prepared, the window the probe is gated on read until TextEdit's own window is the top one, a few reads apart; one that
// never is leaves the row invalid naming what stood in front (the front app, the top window's owner by bundle id).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {runWith} from './run-doubles.mjs';

const FOREIGN = 'com.apple.TextInputUI.xpc.CursorUIViewService';
// The oracle's reads (no --with, or one with window-order) after the fires cell's preparation: the top window someone
// else's for the first `covered` of them (Infinity: always).
function coveredTop(covered) {
  let prepared = false, n = 0;
  return {
    lane: code => { if (code.includes('cua-matrix-cell: field.empty')) prepared = true; },
    ops: {matrix: (base, a) => {
      const r = base(a);
      if (a[0] !== 'read' || !prepared || a.includes('--focus')) return r;
      if (n++ >= covered) return r;
      return {...r, reading: {...r.reading, topWindow: {ownerPid: null, number: null, bounds: null, owned: false}},
        ...(r.windowOrder ? {windowOrder: [{owned: false, bundleId: FOREIGN, layer: 0}, ...r.windowOrder]} : {})};
    }},
  };
}

test('a window that covers TextEdit\'s for a moment: the read is taken again and the attempt goes on', async () => {
  const {lane, ops} = coveredTop(2);
  const {result} = await runWith({plan: planOf('intervention-fires'), cellName: 'intervention-fires', lane, ops, slept: []});
  const row = result.rows.find(r => r.id === 'textedit/intervention.fires');
  assert.doesNotMatch(row.invalid ?? '', /window was not in front/);
});

test('a window that never leaves: invalid, naming the front app and the top window\'s owner, with the reads it took', async () => {
  for (const [kind, id] of [['intervention-fires', 'textedit/intervention.fires'], ['pre-action-refusal', 'textedit/intervention.preAction']]) {
    const {lane, ops} = coveredTop(Infinity);
    const {result} = await runWith({plan: planOf(kind), cellName: kind, lane, ops, slept: []});
    const row = result.rows.find(r => r.id === id);
    assert.match(row.invalid, new RegExp(`^textedit's window was not in front after 4 reads: the front app com\\.apple\\.TextEdit, the top window ${FOREIGN.replaceAll('.', '\\.')}'s`), kind);
  }
});
