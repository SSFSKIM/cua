// The sitting's target guard (scripts/cursor-sitting/target-guard.mjs and its use in session.mjs): a cell that acts on a
// scene goes only while the scene is still the run's launch and its run window is the app's front window, checked from
// readings outside the engine.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scenesOf, SCENE_MARKER, targetProblem} from '../../scripts/cursor-sitting/target-guard.mjs';
import {ALIGN_TOGGLE, BIND, CLICK_AT, KEY_AFTER_INPUT, PRESSED, TYPING_SAMPLE} from '../../scripts/cursor-sitting/cells.mjs';
import {FIRST} from '../../scripts/native-baseline/cells.mjs';
import {PLANS} from '../../scripts/cursor-sitting/plans.mjs';
import {timingSteps} from '../../scripts/cursor-sitting/timing.mjs';
import {gate} from '../../scripts/cursor-sitting/session.mjs';

const RECORD = {id: 'textedit', pid: 500, at: 1_790_000_000_000, window: {number: 77}};
const win = (number, extra = {}) => ({ownerPid: 500, number, bounds: {x: 0, y: 0, width: 600, height: 400}, onScreen: true, ...extra});

test('a scene cell names the scenes it acts on; the first cell names none', () => {
  assert.deepEqual(scenesOf(ALIGN_TOGGLE), ['textedit']);
  assert.deepEqual(scenesOf(PRESSED), ['electron']);
  assert.deepEqual(scenesOf(BIND('chrome', '/x.app')), ['chrome']);
  assert.deepEqual(scenesOf(TYPING_SAMPLE('textedit', [0.1, 0.1], [0.9, 0.9])), ['textedit']);
  assert.deepEqual(scenesOf(FIRST), []);
  assert.equal(SCENE_MARKER('textedit'), '/* cursor-sitting:scene textedit */');
});

test('every cell of every plan that drives an app carries its scene, so none escapes the guard', () => {
  const plans = [...Object.keys(PLANS).flatMap(k => PLANS[k]({engine: 'cua'})), ...timingSteps('typing', 2), ...timingSteps('clicks', 2)];
  for (const step of plans.flatMap(s => (s.together ? s.together : [s])).filter(s => s.run)) {
    const code = typeof step.cell === 'function' ? step.cell({}) : step.cell;
    assert.ok(scenesOf(code).length >= 1, step.label);
  }
});

test('the run\'s own target passes; a new launch, another front window, a minimised or no window refuses', () => {
  assert.equal(targetProblem(RECORD, {launchAt: RECORD.at, windows: [win(77), win(78)]}), null);
  assert.match(targetProblem(RECORD, {launchAt: RECORD.at + 1000, windows: [win(77)]}), /no longer the launch the scene recorded/);
  assert.match(targetProblem(RECORD, {launchAt: null, windows: [win(77)]}), /no longer the launch/);
  assert.match(targetProblem(RECORD, {launchAt: RECORD.at, windows: [win(78), win(77)]}), /front window is window 78, not the run's window 77/);
  assert.match(targetProblem(RECORD, {launchAt: RECORD.at, windows: [win(77, {onScreen: false})]}), /front window is none/);
  assert.equal(targetProblem(RECORD, {launchAt: RECORD.at, windows: [win(90, {bounds: {x: 0, y: 0, width: 40, height: 40}}), win(77)]}), null,
    'a small window (a popover, a tooltip) is not a document window');
  assert.match(targetProblem({id: 'electron', pid: 1}, {launchAt: 1, windows: []}), /names no launch and window/);
});

test('a key cell names its scene as well, so the window-aware key guard has its window', () => {
  assert.deepEqual(scenesOf(KEY_AFTER_INPUT('textedit', 'Right')), ['textedit']);
  assert.deepEqual(scenesOf(CLICK_AT('electron', [0.5, 0.5])), ['electron']);
});

const reply = engine => ({result: {content: [{type: 'text', text: 'CUA_NATIVE_BASELINE {"ok":true,"value":{}}'}], _meta: {'cua/nativeEngine': {engine}}}});

test('the session\'s gate sends a scene cell only while its target holds, and stops for good at the first refusal', async () => {
  const sent = [];
  let problem = null;
  const run = gate({name: 'a', engine: 'cua', scenes: [RECORD], guard: {problem: () => problem, frontmost: () => null}, send: async code => { sent.push(code); return reply('cua'); }});
  assert.equal((await run(ALIGN_TOGGLE)).ok, true);
  assert.equal((await run(FIRST)).ok, true, 'a cell that acts on no scene needs no check');
  problem = 'the textedit app\'s front window is window 78, not the run\'s window 77';
  await assert.rejects(run(ALIGN_TOGGLE), /refused, nothing sent: the textedit app's front window is window 78/);
  problem = null;
  await assert.rejects(run(FIRST), /nothing more is sent on this session/);
  assert.equal(sent.length, 2);
});

test('the gate refuses a scene the session did not bind, keys whose window is not on top, and another engine\'s answer', async () => {
  const send = async () => reply('cua');
  const ok = {problem: () => null};
  await assert.rejects(gate({name: 'a', engine: 'cua', scenes: [RECORD], guard: ok, send})(PRESSED), /electron scene, which this session did not bind/);
  const front = topWindow => ({pid: 500, bundleId: 'com.apple.TextEdit', topWindow});
  const keyed = topWindow => gate({name: 'a', engine: 'cua', scenes: [RECORD], guard: {...ok, frontmost: () => front(topWindow)}, send});
  assert.equal((await keyed({ownerPid: 500, number: 77})(KEY_AFTER_INPUT('textedit', 'Right'), {keys: 'textedit'})).ok, true);
  await assert.rejects(keyed({ownerPid: 500, number: 78})(KEY_AFTER_INPUT('textedit', 'Right'), {keys: 'textedit'}), /key guard/);
  await assert.rejects(gate({name: 'a', engine: 'cua', scenes: [RECORD], guard: ok, send: async () => reply('vendor')})(ALIGN_TOGGLE), /the vendor engine answered/);
});
