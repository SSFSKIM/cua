import assert from 'node:assert/strict';
import { test } from 'node:test';

import { foregroundStart } from '../../scripts/linux-engine-diff/foreground-start.mjs';

// a run's windows by client (the X server's resource range, id & ~0x1fffff): the run's Chrome (0x1a00000: the stub
// and a textarea window), gnome-text-editor (0x2400000), the front xterm (0x2a00000)
const CHROME_STUB = 0x1a00002;
const CHROME_TEXT = 0x1a0000c;
const EDITOR = 0x2400005;
const FRONT = 0x2a0000c;

/** A run's desktop and display as foregroundStart reads them; `popupsOpen(t)` the Chrome popups open at time `t`. */
function world({ active = FRONT, popupsOpen = () => [] } = {}) {
  let t = 0;
  const log = [];
  const desktop = {
    windows: [{ id: CHROME_STUB }, { id: CHROME_TEXT }, { id: EDITOR }, { id: FRONT }, { id: null }],
    front: { id: FRONT },
    focusFront: () => {
      log.push('focusFront');
      active = FRONT;
    },
  };
  const deps = {
    active: () => active,
    popups: (ids) => (log.push(`popups ${ids.map((i) => i.toString(16)).join(',')}`), popupsOpen(t)),
    sleep: async (ms) => {
      t += ms;
    },
    now: () => t,
  };
  return { desktop, deps, log };
}

test("a foreground sample after a Chrome sample starts with the front window active and the run's Chrome popups closed, outside the span", async () => {
  // Chrome left active by a vendor's sample, its popup open until the focus leaves it and gone 40 ms after
  let left = null;
  const w = world({ active: CHROME_TEXT, popupsOpen: (t) => (left === null || t < left + 40 ? [0x1a00049] : []) });
  const focusFront = w.desktop.focusFront;
  w.desktop.focusFront = () => {
    focusFront();
    left = 0;
  };
  const start = await foregroundStart(w.desktop, EDITOR, w.deps);
  assert.deepEqual(start, { activated_front: true, popups_at_start: 1, quiet: true, waited_ms: 40 });
  assert.equal(w.log[0], 'focusFront', 'the focus moved before the quiet check');
  // the popups looked for are those of the run's other clients only: Chrome's, not the target's or the front's
  assert.ok(w.log.slice(1).every((l) => l === 'popups 1a00002'));
});

test("the differential run and the dedicated safety case start a foreground sample this way, outside the witness's span", async () => {
  const { harnessModules } = await import('./source-scan.mjs');
  const modules = Object.fromEntries(harnessModules().map((m) => [m.file, m.text]));
  const sample = modules['run.mjs'].slice(modules['run.mjs'].indexOf('async function measureSample'));
  const at = (text, s) => text.indexOf(s);
  assert.ok(at(sample, 'def.request(ctx)') < at(sample, 'foregroundStart(') && at(sample, 'foregroundStart(') < at(sample, 'routeWitness('), 'after the preparation, before the span');
  assert.match(sample.slice(at(sample, 'const started'), at(sample, 'foregroundStart(')), /routeOf\(op, s\.sceneName\) === 'foreground'/, 'every lane of a foreground scene, its route known beforehand');
  assert.match(sample, /row\.foreground_start = started/);
  const caret = modules['safety.mjs'].slice(modules['safety.mjs'].indexOf('async caretPlaced'));
  assert.ok(at(caret, 'foregroundStart(') > 0 && at(caret, 'foregroundStart(') < at(caret, 'routeWitness('));
});

test('a foreground sample with the front window already active only waits for the popups to close', async () => {
  const w = world({ popupsOpen: (t) => (t < 60 ? [0x1a00049] : []) });
  assert.deepEqual(await foregroundStart(w.desktop, EDITOR, w.deps), { activated_front: false, popups_at_start: 1, quiet: true, waited_ms: 60 });
  assert.ok(!w.log.includes('focusFront'));
  const quiet = world();
  assert.deepEqual(await foregroundStart(quiet.desktop, EDITOR, quiet.deps), { activated_front: false, popups_at_start: 0, quiet: true, waited_ms: 0 });
});

test('the target active already (a case that activated it before the span) stays active', async () => {
  const w = world({ active: EDITOR });
  assert.deepEqual(await foregroundStart(w.desktop, EDITOR, w.deps), { activated_front: false, popups_at_start: 0, quiet: true, waited_ms: 0 });
  assert.ok(!w.log.includes('focusFront'));
});

test("a popup that never closes is recorded and the sample goes on: one that unmaps inside the span still fails it", async () => {
  const w = world({ popupsOpen: () => [0x1a00049] });
  assert.deepEqual(await foregroundStart(w.desktop, EDITOR, { ...w.deps, boundMs: 1000, pollMs: 20 }), { activated_front: false, popups_at_start: 1, quiet: false, waited_ms: 1000, open: [0x1a00049] });
});

test("a Chrome target's popups are its own, so a Chrome foreground sample is left as its condition made it", async () => {
  // Chrome in front on purpose (device.mjs `alreadyInFront`): not moved, and its own popup is not waited for
  const w = world({ active: CHROME_STUB, popupsOpen: (t) => (t < 500 ? [0x1a00049] : []) });
  assert.deepEqual(await foregroundStart(w.desktop, CHROME_TEXT, { ...w.deps, popups: (ids) => (w.log.push(ids), []) }), { activated_front: false, popups_at_start: 0, quiet: true, waited_ms: 0 });
  assert.deepEqual(w.log, [[EDITOR]], "only the other clients' popups are looked for");
  // a run with no window of another client has nothing to wait for
  const alone = world();
  alone.desktop.windows = [{ id: EDITOR }, { id: FRONT }];
  assert.equal(await foregroundStart(alone.desktop, EDITOR, alone.deps), null);
});
