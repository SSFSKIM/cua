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
function coveredTop(covered, named = null) {
  let prepared = false, n = 0;
  return {
    lane: code => { if (code.includes('cua-matrix-cell: field.empty')) prepared = true; },
    ops: {matrix: (base, a) => {
      const r = base(a);
      if (a[0] !== 'read' || !prepared || a.includes('--focus')) return r;
      if (n++ >= covered) return r;
      return {...r, reading: {...r.reading, topWindow: {ownerPid: null, number: null, bounds: null, owned: false}},
        ...(r.windowOrder ? {windowOrder: [{owned: false, bundleId: FOREIGN, layer: 0}, ...r.windowOrder]} : {}), ...(named ? {frontWindow: named} : {})};
    }},
  };
}

test('a window that covers TextEdit\'s for a moment: the read is taken again and the attempt goes on', async () => {
  const {lane, ops} = coveredTop(2);
  const {result} = await runWith({plan: planOf('intervention-fires'), cellName: 'intervention-fires', lane, ops, slept: []});
  const row = result.rows.find(r => r.id === 'textedit/intervention.fires');
  assert.doesNotMatch(row.invalid ?? '', /window was not in front/);
});

test('the window named is the oracle\'s own top window (layer 0), never an overlay above that layer', async () => {
  const {lane, ops} = coveredTop(Infinity);
  const overlaid = {matrix: (base, a) => {
    const r = ops.matrix(base, a);
    return r.windowOrder ? {...r, windowOrder: [{owned: false, bundleId: 'com.apple.controlcenter', layer: 25}, ...r.windowOrder]} : r;
  }};
  const {result} = await runWith({plan: planOf('intervention-fires'), cellName: 'intervention-fires', lane, ops: overlaid, slept: []});
  const row = result.rows.find(r => r.id === 'textedit/intervention.fires');
  assert.match(row.invalid, new RegExp(`the top window ${FOREIGN.replaceAll('.', '\\.')}'s \\(layer 0\\)$`));
});

test('a window that never leaves: invalid, naming the front app and the top window\'s owner, with the reads it took', async () => {
  for (const [kind, id] of [['intervention-fires', 'textedit/intervention.fires'], ['pre-action-refusal', 'textedit/intervention.preAction']]) {
    const {lane, ops} = coveredTop(Infinity);
    const {result} = await runWith({plan: planOf(kind), cellName: kind, lane, ops, slept: []});
    const row = result.rows.find(r => r.id === id);
    assert.match(row.invalid, new RegExp(`^textedit's window was not in front after 4 reads: the front app com\\.apple\\.TextEdit, the top window ${FOREIGN.replaceAll('.', '\\.')}'s`), kind);
  }
});

// Ruling 1219 (h3): the refusal names the top window the front-window probe itself chose (its `frontWindow.top`), not the
// first other app's layer-0 window in the window order, and the row records it: the pid expected, the reads, the front
// app, the top window's bundle, number and owner's pid, and any engine window the read passed over.
test('the in-front refusal names the probe\'s own top window and records it on the row', async () => {
  const top = {owned: false, bundleId: 'com.example.real-top', number: 812, ownerPid: 66, layer: 0};
  const skipped = [{bundleId: 'com.openai.sky.CUAService', number: 77, layer: 0}];
  const {lane, ops} = coveredTop(Infinity, {top, skipped});
  const {result} = await runWith({plan: planOf('intervention-fires'), cellName: 'intervention-fires', lane, ops, slept: []});
  const row = result.rows.find(r => r.id === 'textedit/intervention.fires');
  assert.match(row.invalid, /^textedit's window was not in front after 4 reads: the front app com\.apple\.TextEdit, the top window com\.example\.real-top's \(layer 0, window 812\)$/);
  const pid = row.notInFront?.expectedPid;
  assert.ok(Number.isSafeInteger(pid), 'TextEdit\'s own pid, from the run\'s record');
  assert.deepEqual(row.notInFront, {expectedPid: pid, reads: 4, front: {bundleId: 'com.apple.TextEdit', pid}, top, skipped});
});

// h2: a background cell whose user window did not come to the front keeps what the activate step and the read after it
// saw (the activation's answer, the pid expected, the front app, the top window named, the windows passed over).
test('a user window not in front: the background cells keep what the activation and the read saw', async () => {
  const top = {owned: true, bundleId: 'com.apple.finder', number: 70, ownerPid: 7, layer: 0};
  const ops = {matrix: (base, a) => {
    const r = base(a);
    if (a[0] !== 'read' || a.includes('--focus') || !r.frontKey || r.frontKey.front !== 'com.apple.TextEdit') return r;
    return {...r, reading: {...r.reading, topWindow: {ownerPid: 7, number: 70, bounds: {x: 0, y: 0, width: 10, height: 10}, owned: true}}, frontWindow: {top, skipped: []}};
  }};
  const {result} = await runWith({plan: planOf('background', {scene: 'finder', user: 'textedit'}), ops, slept: []});
  const rows = result.rows.filter(r => r.id.startsWith('finder/background/') && r.id.endsWith('@textedit'));
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.invalid, 'the user window (textedit) did not come to the front', row.id);
    const pid = row.userWindowSeen?.expectedPid;
    assert.ok(Number.isSafeInteger(pid), row.id);
    assert.deepEqual(row.userWindowSeen, {activate: {ok: true, reason: null, frontmost: null, reads: null},
      expectedPid: pid, reads: 1, front: {bundleId: 'com.apple.TextEdit', pid}, top, skipped: []}, row.id);
  }
});

// Ruling 1221 (H2): a background row's user window is activated waiting for the run's window on top (raised only on a
// hosted runner when the wait misses); every background row keeps the path taken, its time and the top window before.
test('background rows keep their user window\'s path to the top: the activation asked to wait for it, its answer on each row', async () => {
  const asked = [];
  const ops = {matrix: (base, a) => { if (a[0] === 'step' && a[1] === 'activate') asked.push(a.slice(2, a.indexOf('--run'))); return base(a); }};
  const {result} = await runWith({plan: planOf('background', {scene: 'finder', user: 'textedit'}), ops, slept: []});
  const rows = result.rows.filter(r => r.id.startsWith('finder/background/') && r.id.endsWith('@textedit'));
  assert.ok(rows.length > 0);
  for (const row of rows) assert.deepEqual(row.toTop, {scene: 'textedit', path: 'waited', ms: 0, topBefore: null}, row.id);
  assert.ok(asked.some(a => a[0] === 'textedit' && a[1] === '--top-window' && a[2] === 'yes'), JSON.stringify(asked));
  assert.ok(!result.rows.some(r => !r.id.includes('/background/') && r.toTop), 'only background rows');
});
// The run's side of a missed wait (the activation's own side, the wait and the raise, is test/repl-parity/scenes-mac's):
// an activation that answered not ok with its path leaves its rows NO VERDICT, the path kept on each.
test('a background user window whose activation answered not ok, its wait missed: its rows NO VERDICT, the answer\'s path kept on each', async () => {
  const missed = {scene: 'textedit', ok: false, frontmost: {pid: 1, bundleId: 'com.apple.TextEdit'}, reads: 21,
    reason: 'the run\'s window is not the top window within 5000 ms: com.example.other\'s window 31 is; not raised off a GitHub-hosted runner',
    toTop: {path: 'waited', ms: 5000, topBefore: {bundleId: 'com.example.other', number: 31, layer: 0, owned: false}}};
  const ops = {matrix: (base, a) => (a[0] === 'step' && a[1] === 'activate' && a[2] === 'textedit' && a.includes('--top-window') ? {...base(a), answer: missed} : base(a))};
  const {result} = await runWith({plan: planOf('background', {scene: 'finder', user: 'textedit'}), ops, slept: []});
  const rows = result.rows.filter(r => r.id.startsWith('finder/background/') && r.id.endsWith('@textedit'));
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.invalid, 'the user window (textedit) did not come to the front', row.id);
    assert.deepEqual(row.toTop, {scene: 'textedit', ...missed.toTop}, row.id);
  }
});

// Fix wave I6: an Open panel pairing's close activates TextEdit after its rows; the user window's path is kept from its
// own activation, not from that one.
test('openPanel/background@finder rows keep the user window\'s path though the panel\'s close activates TextEdit after them', async () => {
  const asked = [];
  const ops = {matrix: (base, a) => { if (a[0] === 'step' && a[1] === 'activate') asked.push(a[2]); return base(a); }};
  const {result} = await runWith({plan: planOf('background', {scene: 'openPanel'}), ops, slept: []});
  const rows = result.rows.filter(r => r.id.startsWith('openPanel/background/'));
  assert.ok(rows.length > 0);
  assert.ok(asked.lastIndexOf('textedit') > asked.lastIndexOf('finder'), `the close activated TextEdit last: ${asked.join(', ')}`);
  for (const row of rows) assert.deepEqual(row.toTop, {scene: 'finder', path: 'waited', ms: 0, topBefore: null}, row.id);
});
