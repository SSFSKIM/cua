// R3's witness through a whole matrix run on its doubles (ruling 1225; scripts/native-matrix/witness.mjs, run.mjs
// finishWatch): a concurrent row after whose act another window of the user TextEdit's own pid is on top (C-6's 52×22
// window) passes only on a clean witness; a gap in it leaves the row NO VERDICT, a post by the engine fails it; off a
// hosted runner nothing is tapped and the row is NO VERDICT with the missing witness named.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {args, runWith} from './run-doubles.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
const POPUP = 9_999;
const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const atOf = code => Number(/const __at = (\d+)/.exec(code)?.[1]);
const acted = code => {
  const at = atOf(code);
  return {actMs: 2_000, callAt: at, endAt: at + 3_000, late: 0, threw: false, errorName: null, message: null,
    _meta: {'cua/inputRoute': "2'", 'cua/actionInterval': {startedAt: at + 50, endedAt: at + 2_500}}};
};

// A concurrent run on Chrome whose read after the act finds a popup of TextEdit's own pid on top; the tap's record is
// made by `events({textedit, probe, control, cells})` from what the run did (TextEdit's pid, the probe's pid and the time
// it started, the control's answer, each cell's device-clock window by its tag).
async function r3Run({env = HOSTED, events = () => []} = {}) {
  let acting = false, textedit = null, probe = null, control = null;
  const calls = [];
  const cells = () => Object.fromEntries(calls.map(c => [tagOf(c.code), c.at]));
  const ops = {
    scenes: (base, a) => { const out = base(a); if (a[0] === 'up' && a[1] === 'textedit') textedit = out.pid; return out; },
    matrix: (base, a) => {
      const out = base(a);
      if (a[0] === 'probe' && a[1] === 'keystroke') probe = {pid: out.answer.pid, at: out.at[0]};
      if (a[0] !== 'read' || !acting || !a.includes('--focus')) return out;
      acting = false;
      const user = out.reading.topWindow;
      const popup = {...user, number: POPUP, bounds: {x: 140, y: 160, width: 52, height: 22}};
      return {...out, reading: {...out.reading, topWindow: popup},
        ...(out.windowOrder ? {windowOrder: [{owned: true, pid: user.ownerPid, number: POPUP, bundleId: 'com.apple.TextEdit', layer: 0}, ...out.windowOrder]} : {})};
    },
    keyRoute: (base, a) => {
      const out = base(a);
      if (a[0] === 'control') control = out.answer;
      if (a[0] === 'tap' && a[1] === 'stop') out.answer.events = events({textedit, probe, control, cells: cells()});
      return out;
    },
  };
  const run = await runWith({plan: planOf('concurrent-use', {scene: 'chrome'}), cellName: 'concurrent-use', env, ops, calls,
    cell: c => { if (tagOf(c) !== 'concurrent.act') return null; acting = true; return acted(c); }});
  return {...run, row: run.result.rows.find(r => r.id === 'chrome/concurrent@textedit'), textedit};
}
// The probe types at its scheduled time, inside the act.
const personTyped = ({textedit, probe, cells}) => [{tapPid: textedit, kind: 'keyDown', target: textedit, source: probe.pid, at: cells['concurrent.act'][0] + 1}];
const controlSeen = ({textedit, control}) => [{tapPid: textedit, kind: 'flagsChanged', target: textedit, source: control.pid, at: control.at}];
// The engine's own click on TextEdit at the cell `tag`'s start (the field's focus click in the prepare, say).
const engineClick = tag => w => [...personTyped(w), ...controlSeen(w), {tapPid: w.textedit, kind: 'mouseDown', target: w.textedit, source: 4_242, at: w.cells[tag][0]}];

test('R3 through the run: a clean witness passes the row as the user app\'s own window, its witness and the control on the record', async () => {
  const {row, result, steps, textedit} = await r3Run({events: w => [...personTyped(w), ...controlSeen(w)]});
  assert.equal(row.invalid, undefined, JSON.stringify(row.witness));
  assert.deepEqual([row.ok, row.interference.ok, row.interference.topWindowBy], [true, true, 'user app\'s own window']);
  assert.deepEqual(row.witness, {gaps: [], others: [], prepare: [], probe: 1});
  assert.deepEqual(validateCellResult(result), []);
  const keyRoute = steps.filter(s => s.startsWith('key-route ')).map(s => args(s).slice(0, 2).join(' '));
  assert.deepEqual(keyRoute, ['tap start', 'control --pid', 'tap stop']);
  assert.deepEqual(result.meta.witness.controls.map(c => [c.scene, c.pid, c.seen]), [['textedit', textedit, true]]);
});

test('R3 through the run: a post to TextEdit\'s pid by another source fails the row, recorded by target and kind alone', async () => {
  const {row, textedit} = await r3Run({events: w => [...personTyped(w), ...controlSeen(w), {tapPid: w.textedit, kind: 'keyDown', target: w.textedit, source: 4_242, at: w.cells['concurrent.act'][0] + 2, keycode: 12}]});
  assert.deepEqual([row.invalid, row.interference.ok], [undefined, false]);
  assert.deepEqual(row.interference.userAppWindow.failed, ['the engine posted to the user app\'s pid in the cell (tap: 1 event)']);
  assert.deepEqual(row.witness.others.map(({target, kind, source}) => ({target, kind, source})), [{target: textedit, kind: 'keyDown', source: 4_242}]);
});

// Fix wave I1: the prepare's cells run through the engine under test, whose clicks on the user field post to TextEdit.
test('R3 through the run: the engine\'s post during the prepare is recorded apart and passes; the same post during the act fails', async () => {
  // Chrome's prepare and the user field's are both `field.empty`: the user's, the later one, the focus click on TextEdit.
  const {row: prepared} = await r3Run({events: engineClick('field.empty')});
  assert.deepEqual([prepared.invalid, prepared.interference.ok, prepared.witness.others], [undefined, true, []]);
  assert.deepEqual(prepared.witness.prepare.map(p => [p.kind, p.source]), [['mouseDown', 4_242]]);
  const {row} = await r3Run({events: engineClick('concurrent.act')});
  assert.deepEqual([row.interference.ok, row.witness.others.map(o => o.kind), row.witness.prepare], [false, ['mouseDown'], []]);
});

test('R3 through the run: the control unseen leaves the row NO VERDICT; off a hosted runner nothing is tapped and it is NO VERDICT too', async () => {
  const {row} = await r3Run({events: personTyped});
  assert.equal(row.invalid, 'R3\'s witness: the positive control was not seen on the user app\'s pid');
  assert.equal(sampleCause(row).category, 'invalid');
  const off = await r3Run({env: {}});
  assert.equal(off.row.invalid, 'R3\'s witness: no witness tap covered the cell: where the engine posted is unrecorded');
  assert.equal(off.row.witness, undefined);
  assert.equal(off.steps.some(s => s.startsWith('key-route ')), false);
  assert.deepEqual(off.result.meta.witness, {missing: 'off a GitHub-hosted runner: no witness tap (ruling 1225)'});
});
