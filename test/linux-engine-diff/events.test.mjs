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

test("each scenario's pointer is parked at its start on the experiment's own display, verified there on the bare root", async () => {
  const { POINTER_START, parkAtStart } = await import('../../scripts/linux-engine-diff/events.mjs');
  const { ParkRefused } = await import('../../scripts/linux-engine-diff/park.mjs');
  const [x, y] = POINTER_START;
  const moves = [];
  assert.deepEqual(parkAtStart({ DISPLAY: ':93' }, { move: (p) => moves.push(p), read: () => ({ x, y, same_screen: true, chain: [] }) }).chain, []);
  assert.deepEqual(moves, [{ x, y }]);
  // a window left under the start (an earlier scenario's recorder not yet gone) would take the motions: refused
  assert.throws(() => parkAtStart({ DISPLAY: ':93' }, { move: () => {}, read: () => ({ x, y, same_screen: true, chain: [0x600003] }) }), ParkRefused);
  assert.throws(() => parkAtStart({ DISPLAY: ':93' }, { move: () => {}, read: () => ({ x: x + 1, y, chain: [] }), pause: () => {} }), /not at \(300, 300\)/);
});

// ---------------------------------------------------------------------------------------------------------------
// #171 M5, T4's arm64 round, item (f): E1's judge for "an interrupted drag under a held key, then a move" (the design
// session's ruling 818, applied to what E1 records). On the arm64 VM cua's drag finished in 0.8 ms, before the fragile
// recorder destroyed its child, and answered ok. That passes only when the recorder shows the whole drag on the child
// (the press, every motion along the path, the release), all of it delivered before the child was destroyed, since no
// event reaches a destroyed window; an ok:false passes only when the error names the destroyed window (an X Window
// error with its bad value). Anything else fails.

const DRAG = 'an interrupted drag under a held key, then a move';
const dragSteps = scenarios().find((s) => s.name === DRAG).steps;
const held = (x, y) => pointer('MotionNotify', 'child', { state: 260, x: x - 500, y: y - 400, root_x: x, root_y: y });
// root coordinates: the recorder at (100, 100), the path (450, 350) to (460, 360), the child at (400, 300)
const WHOLE = [held(550, 450), held(551, 451), held(553, 453), held(556, 456), held(559, 459), held(560, 460), { ...held(560, 460), type: 'ButtonRelease', detail: 1 }];
const keyDown = { answer: ok, events: [{ type: 'KeyPress', send: true, detail: 37, state: 0, window: 'top', x: 0, y: 0, root_x: 0, root_y: 0 }] };
const dragLane = (response, events) => [keyDown, { command: 'drag', ...interrupted(response, events), raw: normalizeAnswer(response) }, after, keyDown];
const namedWindow = { ok: false, error: 'X11 error X11Error { error_kind: Window, error_code: 3, sequence: 22, bad_value: 25165924, minor_opcode: 0, major_opcode: 25, extension_name: None, request_name: Some("SendEvent") }' };
const REFERENCE = () => dragLane(namedWindow, [...PRESSED, held(550, 450)]);

test('E1: an ok drag passes only with the whole drag on the child before its destruction', () => {
  assert.equal(firstDifference(REFERENCE(), dragLane(ok, [...PRESSED, ...WHOLE]), dragSteps), null, 'the whole drag, then the release');
  // the controls: a partial drag answered ok fails
  for (const [what, tail] of [
    ['no release', WHOLE.slice(0, -1)],
    ["the tail cut before the path's end", [...WHOLE.slice(0, 4), { ...WHOLE.at(-1), root_x: 556, root_y: 456, x: 56, y: 56 }]],
    ['nothing after the press', []],
    ['motions without the button held', [...WHOLE.slice(0, -1).map((e) => ({ ...e, state: 4 })), WHOLE.at(-1)]],
    ['a motion on the top-level in the drag', [...WHOLE.slice(0, 3), { ...WHOLE[3], window: 'top' }, ...WHOLE.slice(4)]],
    ['an event after the release', [...WHOLE, held(560, 460)]],
    ['the release by another button', [...WHOLE.slice(0, -1), { ...WHOLE.at(-1), detail: 3 }]],
  ]) {
    const difference = firstDifference(REFERENCE(), dragLane(ok, [...PRESSED, ...tail]), dragSteps);
    assert.equal(difference?.what, 'answer', what);
    assert.equal(difference.step, 1, what);
  }
  // the child never pressed: no drag reached it at all
  assert.equal(firstDifference(REFERENCE(), dragLane(ok, PRESSED.slice(0, 2)), dragSteps)?.what, 'answer');
  // the events up to the press are still compared exactly
  assert.equal(firstDifference(REFERENCE(), dragLane(ok, [...PRESSED.slice(1), ...WHOLE]), dragSteps)?.what, 'event');
  // without the scenario's path an ok cannot be judged whole, so it fails as before
  assert.equal(firstDifference(REFERENCE(), dragLane(ok, [...PRESSED, ...WHOLE]))?.what, 'answer');
});

test('E1: an interrupted drag answered ok:false passes only when its error names the destroyed window', () => {
  assert.equal(firstDifference(REFERENCE(), dragLane(namedWindow, [...PRESSED, held(550, 450)]), dragSteps), null);
  for (const [what, error] of [
    ['a Window error with no bad value', 'X11 error X11Error { error_kind: Window, error_code: 3, request_name: Some("SendEvent") }'],
    ['an error of another kind', 'X11 error X11Error { error_kind: Match, error_code: 8, sequence: 22, bad_value: 25165924 }'],
    ["an error that is not X's", 'drag failed: the window is gone'],
  ]) {
    const difference = firstDifference(REFERENCE(), dragLane({ ok: false, error }, [...PRESSED, held(550, 450)]), dragSteps);
    assert.equal(difference?.what, 'answer', what);
  }
  // the reference must still have been interrupted as planned
  assert.equal(firstDifference(dragLane(ok, [...PRESSED, ...WHOLE]), dragLane(ok, [...PRESSED, ...WHOLE]), dragSteps)?.what, 'reference not interrupted');
});

test("E1: the click scenario keeps the interruption rule: a click answered ok still fails", () => {
  const click = scenarios().find((s) => s.name === 'an interrupted click under a held key, then a move').steps;
  const lane = (response, events) => [keyDown, { command: 'click', ...interrupted(response, events), raw: normalizeAnswer(response) }, after, keyDown, keyDown];
  const done = [{ ...held(550, 450), type: 'ButtonRelease', detail: 1 }];
  assert.equal(firstDifference(lane(namedWindow, PRESSED), lane(ok, [...PRESSED, ...done]), click)?.what, 'answer');
});
