import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { bindStep, firstDifference, normalizeAnswer, normalizeEvent, scenarios } from '../../scripts/linux-engine-diff/events.mjs';

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
  for (const name of ['press_key Z', 'press_key Ctrl+Z', 'press_key Ctrl+Shift+Z', 'two holds sharing ctrl', 'holds left at exit are released with their state', 'desktop held ctrl around press_key a', 'drag_handle']) {
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
