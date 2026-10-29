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

test('request times are grouped by route, command and first or later step, and judged against the faster vendor', async () => {
  const { eventSpeeds } = await import('../../scripts/linux-engine-diff/events.mjs');
  const step = (command, ms, first) => ({ command, ms, first, answer: { ok: true }, events: [] });
  const rows = [
    { route: 'desktop', records: { pinned: [step('move', 40, true), step('move', 30, false)], newest: [step('move', 35, true), step('move', 20, false)], cua: [step('move', 30, true), step('move', 25, false)] } },
  ];
  const speeds = eventSpeeds(rows, { minSamples: 1, gaps: [] });
  const first = speeds.find((r) => r.series === 'first');
  const later = speeds.find((r) => r.series === 'later');
  assert.equal(first.bar, 35);
  assert.equal(first.pass, true);
  assert.equal(later.bar, 20);
  assert.equal(later.pass, false);
});

// ---------------------------------------------------------------------------------------------------------------
// the desktop-only commands through OpenAI's JavaScript client, on the private X server (M1a.3 review)

test("drag_handle goes through the vendor client's own handle: start, move_to, end; a move before a start is the client's refusal", async () => {
  const { VendorJsEngine } = await import('../../scripts/linux-engine-diff/vendor-js.mjs');
  const calls = [];
  const handle = () => {
    let state = 'idle';
    return {
      async start(point) {
        if (state !== 'idle') throw new Error('drag handle can only be started once');
        calls.push(['start', point]);
        state = 'dragging';
      },
      async move_to(point) {
        if (state !== 'dragging') throw new Error('drag handle must be started before moving');
        calls.push(['move_to', point]);
      },
      async end() {
        if (state !== 'dragging') throw new Error('drag handle must be started before ending');
        calls.push(['end']);
        state = 'ended';
      },
    };
  };
  const engine = new VendorJsEngine({ label: 'cua', bin: '/bin/true', skyDir: '/nonexistent' }).start();
  engine.instance = { drag_handle: handle, move_relative: async (input) => calls.push(['move_relative', input]) };
  try {
    const answers = [];
    for (const input of [{ action: 'start', x: 200, y: 200 }, { action: 'move_to', x: 300, y: 260 }, { action: 'end' }]) answers.push((await engine.request('drag_handle', input)).response);
    assert.deepEqual(answers.map((a) => a.ok), [true, true, true]);
    assert.deepEqual(calls, [['start', { x: 200, y: 200 }], ['move_to', { x: 300, y: 260 }], ['end']]);
    const stray = await engine.request('drag_handle', { action: 'move_to', x: 1, y: 1 });
    assert.deepEqual(stray.response, { id: null, ok: false, error: 'drag handle must be started before moving' });
    assert.equal((await engine.request('move_relative', { dx: 1, dy: 2 })).response.ok, true);
    assert.deepEqual(calls.at(-1), ['move_relative', { dx: 1, dy: 2 }]);
  } finally {
    await engine.close();
  }
});

test('the vendor-js desktop scenarios are well formed and judge their effects from the pointer and the recorder', async () => {
  const { VENDOR_JS_SCENARIOS } = await import('../../scripts/linux-engine-diff/events.mjs');
  const byName = Object.fromEntries(VENDOR_JS_SCENARIOS.map((s) => [s.name, s]));
  const moves = byName['desktop move_relative'];
  const drag = byName['drag_handle'];
  assert.ok(moves && drag);
  for (const s of VENDOR_JS_SCENARIOS) {
    assert.equal(s.route, 'desktop');
    for (const step of s.steps) {
      assert.equal(typeof step.effect, 'function', `${s.name} ${step.command} has an effect`);
      assert.equal(step.input.window, undefined, 'desktop only');
    }
  }
  const motion = (x, y, state = 0) => ({ type: 'MotionNotify', send: false, detail: 0, state, window: 'top', root_x: x, root_y: y });
  assert.equal(moves.steps[0].effect({ before: [300, 300], after: [310, 295], events: [motion(310, 295)] }), true);
  assert.equal(moves.steps[0].effect({ before: [300, 300], after: [300, 300], events: [] }), false);
  const [start, move, end] = drag.steps;
  assert.equal(start.effect({ after: [200, 200], events: [motion(200, 200), { type: 'ButtonPress', send: false, detail: 1, root_x: 200, root_y: 200 }] }), true);
  assert.equal(start.effect({ after: [200, 200], events: [motion(200, 200)] }), false, 'no press');
  assert.equal(move.effect({ after: [300, 260], events: [motion(250, 230, 256), motion(300, 260, 256)] }), true);
  assert.equal(move.effect({ after: [300, 260], events: [motion(300, 260, 0)] }), false, 'moved without the button held');
  assert.equal(end.effect({ after: [300, 260], events: [{ type: 'ButtonRelease', send: false, detail: 1, root_x: 300, root_y: 260 }] }), true);
  assert.equal(end.effect({ after: [300, 260], events: [] }), false);
});

test('every effect-bearing step must take effect in cua, whatever the vendor builds did on it (Decision Log, M1a.4)', async () => {
  const { effectMisses } = await import('../../scripts/linux-engine-diff/events.mjs');
  const steps = [{ effect: () => true }, { effect: () => true }, {}, { effect: () => true }];
  const lane = (...effects) => effects.map((effect) => ({ command: 'drag_handle', ...(effect === undefined ? {} : { effect }) }));
  assert.deepEqual(effectMisses(steps, { cua: lane(true, true, undefined, true) }, 'cua'), []);
  assert.deepEqual(effectMisses(steps, { cua: lane(true, false, undefined, true) }, 'cua'), [1], 'a miss on a step both vendor builds missed too');
  assert.deepEqual(effectMisses(steps, { cua: lane(true, true) }, 'cua'), [3], 'a missing effect-bearing step is a miss; a step without an effect read is not');
});

test('a vendor-js desktop scenario whose step every engine missed fails the run', async () => {
  const { judgeScenarioEffects } = await import('../../scripts/linux-engine-diff/events.mjs');
  const steps = [{ effect: () => true }, { effect: () => true }];
  const lane = (...effects) => effects.map((effect) => ({ command: 'drag_handle', effect }));
  const all = (...effects) => ({ pinned: lane(...effects), newest: lane(...effects), cua: lane(...effects) });
  assert.deepEqual(judgeScenarioEffects(steps, all(true, true), ['cua']), { pass: true, misses: { cua: [] } });
  assert.deepEqual(judgeScenarioEffects(steps, all(true, false), ['cua']), { pass: false, misses: { cua: [1] } }, "the reviewer's case: [true, false] in all three engines");
  assert.equal(judgeScenarioEffects(steps, all(false, false), ['cua']).pass, false);
});

test('the events experiment can go through the vendor JavaScript, which needs its directory', () => {
  assert.throws(() => parseArgs(['--experiment', 'events', '--cua', 'c', '--out', 'o', '--vendor', 'v', '--newest', 'n', '--via', 'vendor-js']), /--vendor-js/);
  assert.equal(parseArgs(['--experiment', 'events', '--cua', 'c', '--out', 'o', '--vendor', 'v', '--newest', 'n', '--via', 'vendor-js', '--vendor-js', 's']).via, 'vendor-js');
});
