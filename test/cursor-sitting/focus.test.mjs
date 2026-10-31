// Acceptance 5's focus readings (scripts/cursor-sitting/focus.mjs): each reading names the scene's run window by its
// bounds read now, not by the scene's record (the first sitting's run 2 named a window that had moved), and a reading of
// the Electron fixture waits, bounded, until the fixture's own record says Chromium's accessibility is on (the first
// sitting's first readings ran before it was, and found no focused app).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awaitAccessibility, fixtureAccessibility, readFocus, runWindowBounds} from '../../scripts/cursor-sitting/focus.mjs';

const line = (at, enabled, source = 'event') => JSON.stringify({at, enabled, source});
const GOOD = {accessibility: true, focusedApp: {pid: 7, bundleId: 'f'}, focusedWindow: {pid: 7, bounds: {x: 424, y: 258, width: 720, height: 560}}, named: true, valueHash: 'a'.repeat(64)};

// A clock that advances only when slept on.
function clock() {
  let t = 1000;
  return {now: () => t, sleep: async ms => { t += ms; }};
}

test('the fixture\'s accessibility is its record\'s last line', () => {
  assert.equal(fixtureAccessibility(null), null);
  assert.equal(fixtureAccessibility(''), null);
  assert.deepEqual(fixtureAccessibility([line(1, false, 'start'), line(2, true, 'poll'), line(3, false)].join('\n') + '\n'), {at: 3, enabled: false, source: 'event'});
  assert.deepEqual(fixtureAccessibility(`${line(1, false)}\n${line(2, true, 'poll')}\n{"at": 3, "enab`), {at: 2, enabled: true, source: 'poll'}, 'a line still being written is passed over');
});

test('already on: no wait and no priming', async () => {
  const c = clock(); let primed = 0;
  const waited = await awaitAccessibility({read: () => line(5, true, 'poll'), prime: () => { primed++; }, ...c});
  assert.deepEqual(waited, {enabled: true, waitedMs: 0, primed: false, since: 5});
  assert.equal(primed, 0);
});

test('off: primed once (the probe sets AXManualAccessibility), then polled until the record turns on', async () => {
  const c = clock(); let primed = 0;
  const text = () => [line(1, false), ...(c.now() >= 3100 ? [line(3100, true, 'poll')] : [])].join('\n');
  const waited = await awaitAccessibility({read: text, prime: () => { primed++; }, pollMs: 100, ...c});
  assert.equal(primed, 1);
  assert.equal(waited.enabled, true);
  assert.equal(waited.primed, true);
  assert.equal(waited.waitedMs, 2100);
  assert.equal(waited.since, 3100);
});

test('the wait is bounded: a record that never turns on ends it, and says so', async () => {
  const c = clock();
  const waited = await awaitAccessibility({read: () => line(1, false), prime: () => {}, timeoutMs: 1000, pollMs: 100, ...c});
  assert.equal(waited.enabled, false);
  assert.equal(waited.waitedMs, 1000);
  const missing = await awaitAccessibility({read: () => null, prime: () => {}, timeoutMs: 300, pollMs: 100, ...clock()});
  assert.equal(missing.enabled, false, 'no record at all is not "on"');
});

test('the run window\'s bounds are read from the window list now, on screen only', () => {
  const windows = [{number: 5, bounds: {x: 0, y: 0, width: 300, height: 300}, onScreen: true}, {number: 9, bounds: {x: 424, y: 258, width: 720, height: 560}, onScreen: true}];
  assert.deepEqual(runWindowBounds(windows, 9), {x: 424, y: 258, width: 720, height: 560});
  assert.equal(runWindowBounds([{...windows[1], onScreen: false}], 9), null);
  assert.equal(runWindowBounds(windows, 4), null);
});

test('a reading names the window where it is now, after the wait, and records both', async () => {
  const asked = [], c = clock(), store = {};
  let on = false;
  const record = {id: 'electron', pid: 7, window: {number: 9, bounds: {x: 140, y: 100, width: 720, height: 560}}};
  const result = await readFocus({label: 'before the cursor', record, store,
    windows: () => [{number: 9, bounds: {x: 424, y: 258, width: 720, height: 560}, onScreen: true}],
    probe: args => { asked.push(args.join(' ')); on = true; return GOOD; },
    accessibilityText: () => line(c.now(), on), ...c});
  assert.deepEqual(asked, ['focus --window 7,424,258,720,560', 'focus --window 7,424,258,720,560'], 'primed, then read, both naming the window where it is now');
  assert.equal(result.ok, true);
  assert.deepEqual(result.bounds, {x: 424, y: 258, width: 720, height: 560});
  assert.equal(result.accessibility.enabled, true);
  assert.equal(store['before the cursor'].problem, null);
});

test('a reading whose wait ran out, or whose window is gone, does not serve the proof, nor does the one compared with it', async () => {
  const record = {id: 'electron', pid: 7, window: {number: 9}};
  const windows = () => [{number: 9, bounds: GOOD.focusedWindow.bounds, onScreen: true}];
  const timedOut = await readFocus({label: 'before', record, store: {}, windows, probe: () => GOOD, accessibilityText: () => line(1, false), timeoutMs: 200, pollMs: 100, ...clock()});
  assert.equal(timedOut.ok, false);
  assert.match(timedOut.accessibilityProblem, /did not come on within 200 ms/);
  const store = {};
  const gone = await readFocus({label: 'before', record, store, windows: () => [], probe: () => assert.fail('no probe without a window'), accessibilityText: null, ...clock()});
  assert.equal(gone.ok, false);
  assert.match(gone.problem, /run window 9 is not on screen/);
  const after = await readFocus({label: 'after', record, equalTo: 'before', store, windows, probe: () => GOOD, accessibilityText: null, ...clock()});
  assert.equal(after.ok, false, 'compared with a reading that had no window');
  assert.equal(after.accessibility, undefined, 'a scene with no accessibility record is read at once');
});
