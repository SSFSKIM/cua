import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { bindStep, firstDifference, interruptedStep, normalizeAnswer, normalizeEvent, scenarios } from '../../scripts/linux-engine-diff/events.mjs';

const key = (type, detail, state) => ({ type, send: true, detail, state, window: 'top', x: 0, y: 0, root_x: 0, root_y: 0 });

test('events compare without their timestamps', () => {
  assert.deepEqual(normalizeEvent({ ...key('KeyPress', 37, 0), time: 51439196 }), key('KeyPress', 37, 0));
});

test('the recorder placeholder becomes the window target, other values stay', () => {
  assert.deepEqual(bindStep({ command: 'press_key', input: { window: '$W', key: 'ctrl+z' } }, 2097152), {
    command: 'press_key',
    input: { window: { id: 2097152 }, key: 'ctrl+z' },
  });
});

test('answers compare with X sequence numbers and window ids masked', () => {
  assert.deepEqual(normalizeAnswer({ ok: true, output: null }), { ok: true, output: null });
  assert.deepEqual(normalizeAnswer({ ok: false, error: 'X11 window 2097152 is not mapped (sequence: 41)' }), {
    ok: false,
    error: 'X11 window <id> is not mapped (sequence: N)',
  });
});

// ---------------------------------------------------------------------------------------------------------------
// interrupted steps: a fragile recorder's child destroys itself on its button-1 press

const pointer = (type, window, extra = {}) => ({ type, send: true, detail: 0, state: 4, window, x: 50, y: 50, root_x: 550, root_y: 450, ...extra });
const PRESSED = [pointer('EnterNotify', 'child', { mode: 0, detail: 3 }), pointer('MotionNotify', 'child'), pointer('ButtonPress', 'child', { detail: 1 })];
const badWindow = (request) => ({ ok: false, error: `X11 error X11Error { error_kind: Window, error_code: 3, request_name: Some("${request}") }` });
const ok = { ok: true, output: null };
const interrupted = (response, events) => ({ interrupted: true, ...interruptedStep(response, events) });
const after = { answer: ok, events: [pointer('MotionNotify', 'top', { x: 10, y: 10 })] };

test('an interruption may differ only in its racy suffix and the failing request', () => {
  const reference = [interrupted(badWindow('SendEvent'), PRESSED), after];
  const candidate = [interrupted(badWindow('TranslateCoordinates'), [...PRESSED, pointer('MotionNotify', 'child', { state: 260 })]), after];
  assert.equal(firstDifference(reference, candidate), null);
  assert.equal(candidate[0].suffix.length, 1, 'the race after the press is kept apart');
});

test('the steps after an interruption are compared exactly', () => {
  const reference = [interrupted(badWindow('SendEvent'), PRESSED), after];
  const candidate = [interrupted(badWindow('SendEvent'), PRESSED), { answer: badWindow('TranslateCoordinates'), events: [] }];
  assert.equal(firstDifference(reference, candidate).step, 1);
});

test('an interruption with no press of the child is not one', () => {
  // an unrelated early BadWindow, in both lanes
  const early = [pointer('EnterNotify', 'child', { mode: 0, detail: 3 })];
  const lane = () => [interrupted(badWindow('TranslateCoordinates'), early), after];
  assert.deepEqual(lane()[0].answer, { ok: false, x_window_error: true, child_pressed: false });
  assert.equal(firstDifference(lane(), lane()).what, 'reference not interrupted');
  // the reference pressed, the candidate failed before its press
  assert.equal(firstDifference([interrupted(badWindow('SendEvent'), PRESSED), after], lane()).what, 'answer');
});

test('a reference that was not interrupted fails the scenario, whatever the candidate did', () => {
  const lane = () => [interrupted(ok, PRESSED), after];
  assert.equal(firstDifference(lane(), lane()).what, 'reference not interrupted', 'both succeeding proves nothing');
  const other = () => [interrupted({ ok: false, error: 'unsupported key=bogus' }, PRESSED), after];
  assert.equal(firstDifference(other(), other()).what, 'reference not interrupted', 'a failure of another class');
  assert.equal(firstDifference([interrupted(badWindow('SendEvent'), PRESSED), after], lane()).what, 'answer', 'a candidate that succeeded');
});

test('the first difference names the step, then the answer or the event', () => {
  const step = (answer, events) => ({ answer, events });
  const ok = { ok: true, output: null };
  const reference = [step(ok, [key('KeyPress', 37, 0), key('KeyRelease', 37, 4)])];
  assert.equal(firstDifference(reference, [step(ok, [key('KeyPress', 37, 0), key('KeyRelease', 37, 4)])]), null);
  assert.deepEqual(firstDifference(reference, [step(ok, [key('KeyPress', 37, 0), key('KeyRelease', 37, 0)])]), {
    step: 0,
    what: 'event',
    index: 1,
    reference: key('KeyRelease', 37, 4),
    candidate: key('KeyRelease', 37, 0),
  });
  assert.equal(firstDifference(reference, [step(ok, [key('KeyPress', 37, 0)])]).candidate, null, 'a missing event differs');
  assert.equal(firstDifference(reference, [step({ ok: false, error: 'x' }, [])]).what, 'answer');
  assert.equal(firstDifference(reference, []).what, 'missing step');
});

test('the scenarios cover the mixed-case shortcuts, held chords and both routes', () => {
  const names = scenarios().map((s) => s.name);
  for (const name of ['press_key Z', 'press_key Ctrl+Z', 'press_key Ctrl+Shift+Z', 'two holds sharing ctrl', 'holds left at exit are released with their state', 'desktop held ctrl around press_key a', 'drag_handle', 'an interrupted drag under a held key, then a move']) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(new Set(names).size, names.length, 'names are unique');
  for (const scenario of scenarios()) {
    // a desktop scenario's recorder has the focus, for XTEST input; one step may still name the window on purpose
    const windowless = scenario.steps.some((s) => s.input.window === undefined);
    if (scenario.route === 'desktop') assert.ok(windowless, `${scenario.name} uses the desktop route`);
  }
});

test('the events experiment needs both vendor builds', () => {
  assert.throws(() => parseArgs(['--experiment', 'events', '--cua', 'c', '--out', 'o']), /--vendor is required/);
  assert.equal(parseArgs(['--experiment', 'events', '--cua', 'c', '--out', 'o', '--vendor', 'v', '--newest', 'n']).experiment, 'events');
});
