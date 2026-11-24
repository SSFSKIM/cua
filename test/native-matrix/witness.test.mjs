// R3's witness in a matrix run (ruling 1225; scripts/native-matrix/witness.mjs): the key-route tap app, listen-only,
// tapping the user app's pid for the run's concurrent cells, hosted only; one positive control posted by the harness
// to that pid after the last cell; each cell's posts to the user app's pid told apart by their source pid (the probe's
// typing is the simulated person's). R3 passes only with the cell covered, the control seen and no post but the
// person's; a gap is NO VERDICT, a post by anyone else a failure. A row records events by target pid and kind alone.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finishWitness, noteProbe, rowPosts, startWitness} from '../../scripts/native-matrix/witness.mjs';

const USER = 41, PROBE = 77, HELPER = 90, ENGINE = 33;
const SPAN = [2_000, 3_000];
// A finished witness as finishWitness hands it to the rows: the tap over [1_000, 9_000], the probe's two keys in the cell.
const witnessOf = (over = {}) => ({listenAccess: true, probePids: [PROBE],
  tap: {logRead: true, startedAt: 1_000, stoppedAt: 9_000, taps: [{label: 'textedit', pid: USER, created: true}], disabled: [],
    events: [{tapPid: USER, kind: 'keyDown', target: USER, source: PROBE, at: 2_500}, {tapPid: USER, kind: 'keyUp', target: USER, source: PROBE, at: 2_510},
      {tapPid: USER, kind: 'flagsChanged', target: USER, source: HELPER, at: 8_000}]},
  controls: [{scene: 'textedit', pid: USER, posted: true, by: HELPER, at: 7_990, seen: true}], ...over});
const withEvents = (extra, w = witnessOf()) => ({...w, tap: {...w.tap, events: [...w.tap.events, ...extra]}});

test('a cell the tap covered, its control seen and only the person\'s posts in it: a clean witness, its posts counted', () => {
  assert.deepEqual(rowPosts(witnessOf(), {userPid: USER, at: SPAN}), {source: 'tap', gaps: [], others: [], prepare: [], probe: 2});
});

// Fix wave I1: the attempt's prepare (the driven scene's, the user field emptied and focused) runs through the engine
// under test, whose focus click posts to the user app: posts before the act are recorded apart and never judged; the
// judged window runs from the act's start to the check's end.
test('a post during the prepare is recorded apart and does not count; the same post during the act does', () => {
  const engine = at => ({tapPid: USER, kind: 'mouseDown', target: USER, source: ENGINE, at});
  const PREPARE = [1_500, 2_000];
  const before = rowPosts(withEvents([engine(1_700)]), {userPid: USER, at: SPAN, prepare: PREPARE});
  assert.deepEqual(before, {source: 'tap', gaps: [], others: [], prepare: [{target: USER, kind: 'mouseDown', source: ENGINE, at: 1_700}], probe: 2});
  const during = rowPosts(withEvents([engine(2_200)]), {userPid: USER, at: SPAN, prepare: PREPARE});
  assert.deepEqual([during.others, during.prepare], [[{target: USER, kind: 'mouseDown', source: ENGINE, at: 2_200}], []]);
  // Coverage is the judged window's: a tap that came up during the prepare covers the act.
  const late = witnessOf();
  assert.deepEqual(rowPosts({...late, tap: {...late.tap, startedAt: 1_800}}, {userPid: USER, at: SPAN, prepare: PREPARE}).gaps, []);
});

test('a post to the user app\'s pid by anyone but the probe or the control is the engine\'s: recorded by target and kind alone', () => {
  const posts = rowPosts(withEvents([{tapPid: USER, kind: 'keyDown', target: USER, source: ENGINE, at: 2_600, keycode: 12, characters: 'q'}]), {userPid: USER, at: SPAN});
  assert.deepEqual(posts, {source: 'tap', gaps: [], others: [{target: USER, kind: 'keyDown', source: ENGINE, at: 2_600}], prepare: [], probe: 2});
  // Outside the cell, or on another tapped pid, it is not this cell's.
  assert.deepEqual(rowPosts(withEvents([{tapPid: USER, kind: 'keyDown', target: USER, source: ENGINE, at: 3_500}]), {userPid: USER, at: SPAN}).others, []);
  assert.deepEqual(rowPosts(withEvents([{tapPid: 55, kind: 'keyDown', target: 55, source: ENGINE, at: 2_600}]), {userPid: USER, at: SPAN}).others, []);
});

test('the tap not covering the cell, or its control unseen, or the person\'s posts not seen under the probe\'s pid, is a gap', () => {
  const gapsOf = (w, at = SPAN, userPid = USER) => rowPosts(w, {userPid, at}).gaps;
  const base = witnessOf();
  assert.deepEqual(gapsOf({...base, tap: {...base.tap, startedAt: 2_100}}), ['the witness tap started after the cell began']);
  assert.deepEqual(gapsOf({...base, tap: {...base.tap, stoppedAt: null}}), ['the witness tap\'s stop was not recorded']);
  assert.deepEqual(gapsOf({...base, tap: {...base.tap, stoppedAt: 2_900}}), ['the witness tap stopped before the cell ended']);
  assert.deepEqual(gapsOf({...base, tap: {...base.tap, disabled: [{label: 'textedit', tapPid: USER, why: 'timeout', reenabled: true, at: 2_700}]}}), ['the witness tap was disabled in the cell (timeout)']);
  assert.deepEqual(gapsOf({...base, tap: {...base.tap, logRead: false}}), ['the witness tap\'s record was not read']);
  assert.deepEqual(gapsOf({...base, controls: [{...base.controls[0], seen: false}]}), ['the positive control was not seen on the user app\'s pid']);
  assert.deepEqual(gapsOf({...base, probePids: []}), ['the probe\'s own typing was not seen under its pid in the cell: the engine\'s posts cannot be told from the person\'s']);
  assert.deepEqual(gapsOf(base, null), ['the cell\'s span was not recorded']);
  // A relaunched user app (another pid) was never tapped, its control never posted.
  assert.deepEqual(gapsOf(base, SPAN, 42).slice(0, 2), ['no witness tap on the user app\'s pid (42)', 'the positive control was not seen on the user app\'s pid']);
  assert.deepEqual(gapsOf({...base, listenAccess: false}), ['the witness tap had no Input Monitoring access']);
});

// A run's context as the witness reads it, its device commands answered by `answer(argv)`.
function ctxOf({hosted = true, answer}) {
  const calls = [], windows = [], slept = [];
  const ctx = {run: '/r', meta: {hosted}, records: {textedit: {pid: USER}}, windows, problems: [], sleep: async ms => { slept.push(ms); },
    ops: {keyRoute: argv => { calls.push(argv); return {answer: answer(argv), at: [1, 2]}; }}};
  return {ctx, calls, slept};
}
const DEVICE = argv => (argv[0] === 'control' ? {posted: true, pid: HELPER, kind: 'flagsChanged', at: 7_990}
  : argv[1] === 'start' ? {launched: true, ready: true, pid: 300, listenAccess: true, startedAt: 1_000, taps: [{label: 'textedit', pid: USER, created: true}]}
    : {exited: true, killed: false, why: 'stop', logRead: true, ready: true, startedAt: 1_000, stoppedAt: 9_000, taps: [{label: 'textedit', pid: USER, created: true}], disabled: [],
      events: [{tapPid: USER, kind: 'keyDown', target: USER, source: PROBE, at: 2_500}, {tapPid: USER, kind: 'flagsChanged', target: USER, source: HELPER, at: 8_000}]});

test('the run taps the user app\'s pid in events mode, posts the control after its cells, then stops the tap; the control\'s result on the run', async () => {
  const {ctx, calls, slept} = ctxOf({answer: DEVICE});
  startWitness(ctx, ['textedit']);
  noteProbe(ctx, PROBE);
  const witness = await finishWitness(ctx);
  assert.deepEqual(calls, [['tap', 'start', '--mode', 'events', '--pid', `textedit:${USER}`, '--run', '/r'], ['control', '--pid', String(USER), '--run', '/r'], ['tap', 'stop', '--mode', 'events', '--run', '/r']]);
  assert.ok(slept.length === 1 && slept[0] > 0, 'the control is given time to reach the tap before it stops');
  assert.deepEqual(ctx.meta.witness.controls, [{scene: 'textedit', pid: USER, posted: true, by: HELPER, at: 7_990, seen: true}]);
  assert.deepEqual([ctx.meta.witness.ready, ctx.meta.witness.startedAt, ctx.meta.witness.stoppedAt, ctx.meta.witness.events, ctx.meta.witness.probes], [true, 1_000, 9_000, 2, 1]);
  assert.deepEqual(ctx.windows.map(w => [w.kind, w.key]), [['harness', 'witness:tap-start'], ['harness', 'witness:control'], ['harness', 'witness:tap-stop']]);
  assert.deepEqual(rowPosts(witness, {userPid: USER, at: SPAN}), {source: 'tap', gaps: [], others: [], prepare: [], probe: 1});
});

test('a control the tap did not see is recorded unseen; a tap that never came up gets no control and no rows witnessed', async () => {
  const unseen = ctxOf({answer: argv => (argv[1] === 'stop' ? {...DEVICE(argv), events: []} : DEVICE(argv))});
  startWitness(unseen.ctx, ['textedit']);
  await finishWitness(unseen.ctx);
  assert.equal(unseen.ctx.meta.witness.controls[0].seen, false);
  const down = ctxOf({answer: argv => (argv[1] === 'start' ? {launched: false, reason: 'the tap app is not built'} : DEVICE(argv))});
  startWitness(down.ctx, ['textedit']);
  assert.equal(await finishWitness(down.ctx), null);
  assert.deepEqual(down.calls.map(c => c.slice(0, 2)), [['tap', 'start']]);
  assert.deepEqual([down.ctx.meta.witness.ready, down.ctx.meta.witness.missing], [false, 'the witness tap did not come up: the tap app is not built']);
});

test('off a hosted runner, or with no concurrent cell, nothing is tapped; off hosted the missing witness is recorded', async () => {
  const off = ctxOf({hosted: false, answer: DEVICE});
  startWitness(off.ctx, ['textedit']);
  assert.equal(await finishWitness(off.ctx), null);
  assert.deepEqual([off.calls, off.ctx.meta.witness], [[], {missing: 'off a GitHub-hosted runner: no witness tap (ruling 1225)'}]);
  const none = ctxOf({answer: DEVICE});
  startWitness(none.ctx, []);
  assert.deepEqual([none.calls, none.ctx.meta.witness, await finishWitness(none.ctx)], [[], undefined, null]);
});

test('no recorded row field carries a keycode or a character, whatever the tap\'s lines held; source and time are kept', () => {
  const leak = at => ({tapPid: USER, kind: 'keyDown', target: USER, source: ENGINE, at, keycode: 12, characters: 'q', unicode: 'q', text: 'q'});
  const posts = rowPosts(withEvents([leak(1_700), leak(2_600)]), {userPid: USER, at: SPAN, prepare: [1_500, 2_000]});
  const keys = new Set();
  const walk = v => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
  walk(posts);
  for (const banned of ['keycode', 'keyCode', 'characters', 'unicode', 'text', 'string']) assert.ok(!keys.has(banned), banned);
  assert.deepEqual(posts.others, [{target: USER, kind: 'keyDown', source: ENGINE, at: 2_600}]);
  assert.deepEqual(posts.prepare, [{target: USER, kind: 'keyDown', source: ENGINE, at: 1_700}]);
});
