import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { bindStep, firstDifference, interruptedStep, normalizeAnswer, normalizeEvent, scenarios, sentDrag, traced } from '../../scripts/linux-engine-diff/events.mjs';
import { parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';

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
// #171 M5, T4's arm64 round, item (f), and its fix wave 1: E1's judge for "an interrupted drag under a held key, then a
// move" (the design session's ruling 818). On the arm64 VM cua's drag finished in 0.8 ms, before the fragile recorder
// destroyed its child, and answered ok; on x64 the destruction cut it, an X Window error. Fix wave 1 binds both to what
// the run recorded: an ok passes only when the recorder shows every pointer event the engine's own trace (the audit
// proxy's, in the judged run) says it sent the child between its press and its release; an ok:false only when the
// error's bad value, read before masking, is the recorder's own child XID. Anything else fails.

const CHILD = 0x01800064;
const held = (x, y) => pointer('MotionNotify', 'child', { state: 260, x: x - 500, y: y - 400, root_x: x, root_y: y });
// root coordinates: the recorder at (100, 100), the path (450, 350) to (460, 360), the child at (400, 300)
const MOTIONS = [[550, 450], [551, 451], [553, 453], [556, 456], [559, 459], [560, 460]];
const WHOLE = [...MOTIONS.map(([x, y]) => held(x, y)), { ...held(560, 460), type: 'ButtonRelease', detail: 1 }];
const keyDown = { answer: ok, events: [{ type: 'KeyPress', send: true, detail: 37, state: 0, window: 'top', x: 0, y: 0, root_x: 0, root_y: 0 }] };

// the engine's trace, as xtrace writes it: its SendEvents to the child, on its connection `conn`
let seq = 0x100;
const sendTo = (event, x, y, { conn = 1, destination = CHILD } = {}) => `00${conn}:<:${(seq++).toString(16).padStart(4, '0')}: 44: Request(25): SendEvent propagate=false(0x00) destination=0x${destination.toString(16).padStart(8, '0')} event-mask=0 ${event} time=0x00000000 root=0x000003c5 event=0x${destination.toString(16).padStart(8, '0')} child=None(0x00000000) root-x=${x} root-y=${y} event-x=${x - 500} event-y=${y - 400} state=Button1,Control same-screen=true(0x01)`;
const press = (o) => sendTo('ButtonPress(4) button=left button(0x01)', 550, 450, o);
const motion = ([x, y], o) => sendTo('MotionNotify(6) detail=Normal(0x00)', x, y, o);
const release = (o) => sendTo('ButtonRelease(5) button=left button(0x01)', 560, 460, o);
const traceOf = (lines) => sentDrag(parseXtrace(lines.join('\n')), CHILD);
const SENT = () => traceOf([press(), ...MOTIONS.map((m) => motion(m)), release()]);

const dragLane = (response, events, { child = CHILD, sent = SENT() } = {}) => {
  const step = { command: 'drag', interrupted: true, ...interruptedStep(response, events, { child }), raw: normalizeAnswer(response) };
  return [keyDown, response.ok ? { ...step, sent } : step, after, keyDown];
};
const namedWindow = (bad = CHILD) => ({ ok: false, error: `X11 error X11Error { error_kind: Window, error_code: 3, sequence: 22, bad_value: ${bad}, minor_opcode: 0, major_opcode: 25, extension_name: None, request_name: Some("SendEvent") }` });
const REFERENCE = () => dragLane(namedWindow(), [...PRESSED, held(550, 450)]);

test("E1: the trace's drag is the press to this run's child on its connection, then every pointer event to it through the release", () => {
  const sent = SENT();
  assert.deepEqual([sent.traced, sent.conn, sent.released, sent.xtest, sent.after.length], [true, 1, true, false, 7]);
  assert.deepEqual(sent.after.at(-1), { type: 'ButtonRelease', detail: 1, root_x: 560, root_y: 460 });
  // another connection's motions in the span are not this drag's; nor is a press to another run's child
  assert.equal(traceOf([press(), motion([551, 451], { conn: 2 }), ...MOTIONS.map((m) => motion(m)), release()]).after.length, 7);
  assert.equal(traceOf([press({ destination: 0x02a00064 }), ...MOTIONS.map((m) => motion(m)), release()]).press, null);
  assert.equal(traceOf([]).traced, false);
});

test('E1: an ok drag passes only when the recorder shows every event the trace says was sent the child', () => {
  assert.equal(firstDifference(REFERENCE(), dragLane(ok, [...PRESSED, ...WHOLE])), null, 'the whole drag, then the release');
  for (const [what, tail, sent] of [
    // the review's control: an interior motion dropped, both endpoints and the release kept
    ['an interior motion dropped from the recorder', [...WHOLE.slice(0, 2), ...WHOLE.slice(3)]],
    ['the recorder reduced to the last motion and the release', WHOLE.slice(-2)],
    ['a trace motion the recorder lacks', WHOLE, traceOf([press(), ...MOTIONS.map((m) => motion(m)), motion([560, 460]), release()])],
    ['a missing trace', WHOLE, undefined],
    ['an empty trace', WHOLE, traceOf([])],
    ["a trace from another run's recorder", WHOLE, sentDrag(parseXtrace([press({ destination: 0x02a00064 }), ...MOTIONS.map((m) => motion(m, { destination: 0x02a00064 })), release({ destination: 0x02a00064 })].join('\n')), CHILD)],
    ['a trace whose motions came on another connection', WHOLE, traceOf([press(), ...MOTIONS.map((m) => motion(m, { conn: 2 })), release({ conn: 2 })])],
    ['a trace with no release', WHOLE.slice(0, -1), traceOf([press(), ...MOTIONS.map((m) => motion(m))])],
    ['a motion at another position', [...WHOLE.slice(0, 3), held(554, 454), ...WHOLE.slice(4)]],
    ['an event after the release', [...WHOLE, held(560, 460)]],
  ]) {
    const lane = dragLane(ok, [...PRESSED, ...tail], { sent });
    if (sent === undefined) delete lane[1].sent;
    const difference = firstDifference(REFERENCE(), lane);
    assert.equal(difference?.what, 'answer', what);
    assert.equal(difference.step, 1, what);
  }
  // XTEST pointer input names no window to pair: a sample that shows it fails closed
  const xtest = { ...SENT(), xtest: true };
  assert.equal(firstDifference(REFERENCE(), dragLane(ok, [...PRESSED, ...WHOLE], { sent: xtest }))?.what, 'answer');
  // the child never pressed: no drag reached it at all
  assert.equal(firstDifference(REFERENCE(), dragLane(ok, PRESSED.slice(0, 2)))?.what, 'answer');
  // the events up to the press are still compared exactly
  assert.equal(firstDifference(REFERENCE(), dragLane(ok, [...PRESSED.slice(1), ...WHOLE]))?.what, 'event');
});

test('E1: an interrupted drag answered ok:false passes only when its error names the destroyed child', () => {
  assert.equal(firstDifference(REFERENCE(), dragLane(namedWindow(), [...PRESSED, held(550, 450)])), null);
  for (const [what, response, child] of [
    // the review's control: a wrong XID in the error
    ['an error naming another window', namedWindow(1), CHILD],
    ["an error naming another run's child", namedWindow(0x02a00064), CHILD],
    ['a Window error with no bad value', { ok: false, error: 'X11 error X11Error { error_kind: Window, error_code: 3, request_name: Some("SendEvent") }' }, CHILD],
    ['an error of another kind', { ok: false, error: `X11 error X11Error { error_kind: Match, error_code: 8, sequence: 22, bad_value: ${CHILD} }` }, CHILD],
    ["an error that is not X's", { ok: false, error: 'drag failed: the window is gone' }, CHILD],
    ["no child recorded (a row from before the fix: the error's value masked)", namedWindow(), null],
  ]) {
    const difference = firstDifference(REFERENCE(), dragLane(response, [...PRESSED, held(550, 450)], { child }));
    assert.equal(difference?.what, 'answer', what);
  }
  // the reference must still have been interrupted as planned
  assert.equal(firstDifference(dragLane(ok, [...PRESSED, ...WHOLE]), dragLane(ok, [...PRESSED, ...WHOLE]))?.what, 'reference not interrupted');
  // the stored form, `<id>` masked and no `bad_value`, is not enough
  const stored = REFERENCE();
  const masked = { ...stored[1] };
  delete masked.bad_value;
  assert.equal(firstDifference(REFERENCE(), [stored[0], masked, ...stored.slice(2)])?.what, 'answer');
});

test("E1: the click scenario keeps the interruption rule: a click answered ok still fails", () => {
  const lane = (response, events) => [keyDown, { command: 'click', interrupted: true, ...interruptedStep(response, events, { child: CHILD }), raw: normalizeAnswer(response) }, after, keyDown, keyDown];
  const done = [{ ...held(550, 450), type: 'ButtonRelease', detail: 1 }];
  assert.equal(firstDifference(lane(namedWindow(), PRESSED), lane(ok, [...PRESSED, ...done]))?.what, 'answer');
});

test('E1: only the fragile scenarios run through the proxy, and their times are never counted', () => {
  const fragile = scenarios().filter((s) => traced(s)).map((s) => s.name);
  assert.deepEqual(fragile, ['an interrupted drag under a held key, then a move', 'an interrupted click under a held key, then a move']);
  assert.equal(traced(scenarios().find((s) => s.fragile), 'vendor-js'), false);
});

// the x64 cua engine's own trace of this scenario (a development probe on a private display, task 97 fix wave 1):
// its press to the child, four motions and two releases, in xtrace's own words
const REAL = [
  "000:<:004d: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00400001 event-mask=0 ButtonPress(4) button=left button(0x01) time=0x6c6ab986 root=0x000001ff event=0x00400001 child=None(0x00000000) root-x=550 root-y=450 event-x=50 event-y=50 state=Control same-screen=true(0x01)",
  "000:<:0050: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00400001 event-mask=0 MotionNotify(6) detail=Normal(0x00) time=0x6c6ab986 root=0x000001ff event=0x00400001 child=None(0x00000000) root-x=550 root-y=450 event-x=50 event-y=50 state=Control,Button1 same-screen=true(0x01)",
  "000:<:0053: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00400001 event-mask=0 MotionNotify(6) detail=Normal(0x00) time=0x6c6ab986 root=0x000001ff event=0x00400001 child=None(0x00000000) root-x=550 root-y=450 event-x=50 event-y=50 state=Control,Button1 same-screen=true(0x01)",
  "000:<:0056: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00400001 event-mask=0 MotionNotify(6) detail=Normal(0x00) time=0x6c6ab987 root=0x000001ff event=0x00400001 child=None(0x00000000) root-x=551 root-y=451 event-x=51 event-y=51 state=Control,Button1 same-screen=true(0x01)",
  "000:<:0059: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00400001 event-mask=0 MotionNotify(6) detail=Normal(0x00) time=0x6c6ab987 root=0x000001ff event=0x00400001 child=None(0x00000000) root-x=552 root-y=452 event-x=52 event-y=52 state=Control,Button1 same-screen=true(0x01)",
  "000:<:005b: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00400001 event-mask=0 ButtonRelease(5) button=left button(0x01) time=0x6c6ab987 root=0x000001ff event=0x00400001 child=None(0x00000000) root-x=551 root-y=451 event-x=51 event-y=51 state=Control,Button1 same-screen=true(0x01)",
  "000:<:0061: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00400001 event-mask=0 ButtonRelease(5) button=left button(0x01) time=0x6c6ab987 root=0x000001ff event=0x00400001 child=None(0x00000000) root-x=551 root-y=451 event-x=51 event-y=51 state=Control,Button1 same-screen=true(0x01)",
];
test("E1: the trace's real form: xtrace names the button, and the engine's drag reads as its press, motions and release", () => {
  const sent = sentDrag(parseXtrace(REAL.join('\n')), 0x00400001);
  assert.deepEqual([sent.traced, sent.conn, sent.press, sent.released, sent.after.length], [true, 0, { root_x: 550, root_y: 450 }, true, 5]);
  assert.deepEqual(sent.after.map((e) => `${e.type} ${e.root_x},${e.root_y}`), ['MotionNotify 550,450', 'MotionNotify 550,450', 'MotionNotify 551,451', 'MotionNotify 552,452', 'ButtonRelease 551,451']);
  assert.equal(sentDrag(parseXtrace(REAL.join('\n')), 0x00400002).press, null, "another window's trace holds no press to this child");
});
