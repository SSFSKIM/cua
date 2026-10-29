// Regression tests for the M1a.3 task review's harness findings: engine-issued companions inside witness spans, an
// audit for every window-targeted operation on its measured target, the over-budget bus-call bound enforced, and the
// readiness experiment's vendor reference part of its pass. (The partial-baseline effect gate is in harness.test.mjs.)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { judgeReadinessRun } from '../../scripts/linux-engine-diff/readiness-check.mjs';
import { auditPlan, measuredTarget, runSample } from '../../scripts/linux-engine-diff/run.mjs';
import { CALL_SLACK, judgeCalls } from '../../scripts/linux-engine-diff/stats.mjs';

/** A witness whose spans the fakes below can see open. */
function fakeWitness() {
  const w = {
    open: 0,
    tags: [],
    async span(tag, fn) {
      w.tags.push(tag);
      w.open += 1;
      try {
        return { value: await fn(), witness: { clean: true, fields: [] } };
      } finally {
        w.open -= 1;
      }
    },
  };
  return w;
}

/** An engine that records whether each of its requests ran inside a witness span. */
function fakeEngine(witness, log) {
  return {
    started: true,
    async request(command, input) {
      log.push({ who: 'engine', what: command, inSpan: witness.open > 0 });
      const output = command === 'get_window_state' ? { ax_tree: { id: ':1.1/r', role: 'frame', children: [] }, screenshots: [{ filepath: '/nonexistent.jpg' }] } : null;
      return { response: { ok: true, output }, ms: 1, sinceSpawnMs: null, stats: null };
    },
  };
}

/**
 * The harness's desktop: its own changes to a window recorded the same way. Its counters rise by one per read, so
 * every effect reads as arrived at once (`last` is the key the operation sends).
 */
function fakeDesktop(witness, log, last) {
  const harness = (what) => () => log.push({ who: 'harness', what, inSpan: witness.open > 0 });
  let n = 0;
  return {
    inputStatus: async () => ({ moves: 0, downs: 0, ups: 0, drags: 0, key_downs: ++n, key_ups: n, last_key: last, scroll: 0, context: 0, context_on: null, clicks: 0 }),
    chromeCounters: async () => ({ clicks: 0, keys: ++n, last, seq: '' }),
    resize: harness('resize'),
    remap: harness('remap'),
    focusFront: harness('focusFront'),
  };
}

test('every request an engine sends for a sample runs inside a witness span; the harness changes the window outside them', async () => {
  for (const [op, last] of [['key_down', 'a'], ['key_up', 'b'], ['after_covered_change', 'x'], ['after_resize', 'x'], ['after_remap', 'x']]) {
    const witness = fakeWitness();
    const log = [];
    const engine = fakeEngine(witness, log);
    const target = { id: 7, label: 'scene', elements: {} };
    const s = { desktop: fakeDesktop(witness, log, last), witness, engine, target, op, i: 1, block: 0, label: 'cua', sceneName: 'chrome-input' };
    const { row } = await runSample(s);
    assert.equal(row.effect, true, `${op}: the fake's effect`);
    assert.equal(row.witness, true);
    const fromEngine = log.filter((e) => e.who === 'engine');
    assert.ok(fromEngine.length >= 2, `${op}: the request and its companion`);
    for (const e of fromEngine) assert.equal(e.inSpan, true, `${op}: the engine's ${e.what} outside a witness span`);
    for (const e of log.filter((x) => x.who === 'harness')) assert.equal(e.inSpan, false, `${op}: the harness's ${e.what} inside a witness span`);
  }
});

test('the audit covers every window-targeted operation, each on the window it is measured on', () => {
  const plan = [
    { scene: 'desktop', op: 'list_windows' },
    { scene: 'gedit', op: 'tree' },
    { scene: 'gedit', op: 'tree_shot' },
    { scene: 'gedit', op: 'press_key' },
    { scene: 'retention', op: 'after_resize' },
  ];
  assert.deepEqual(auditPlan(plan).map((p) => p.op), ['tree', 'tree_shot', 'press_key', 'after_resize']);
  const windows = { gedit: { shared: { id: 1 }, own: { cua: { id: 2 }, pinned: { id: 3 } } }, retention: { shared: null, own: { cua: { id: 4 } } } };
  assert.equal(measuredTarget(windows, 'gedit', 'tree', 'cua').id, 1);
  assert.equal(measuredTarget(windows, 'gedit', 'tree_shot', 'cua').id, 2);
  assert.equal(measuredTarget(windows, 'gedit', 'press_key', 'pinned').id, 3);
  assert.equal(measuredTarget(windows, 'retention', 'after_resize', 'cua').id, 4);
  assert.equal(measuredTarget(windows, 'desktop', 'list_windows', 'cua'), null);
});

test("the bus-call bound: cua's calls at most the vendor's plus M0's constant, in the cold and the warm pass, both measured", () => {
  assert.equal(CALL_SLACK, 256);
  const count = (engine, pass, calls, ok = true) => ({ kind: 'counts', engine, pass, calls, ok });
  const vendors = [count('pinned', 'cold', 45069), count('pinned', 'warm', 45069), count('newest', 'cold', 45069), count('newest', 'warm', 45069)];
  const opts = { vendors: ['pinned', 'newest'], candidate: 'cua' };
  assert.deepEqual(judgeCalls([...vendors, count('cua', 'cold', 45240), count('cua', 'warm', 45325)], opts), { pass: true, reasons: [] });
  const over = judgeCalls([...vendors, count('cua', 'cold', 45240), count('cua', 'warm', 45326)], opts);
  assert.equal(over.pass, false);
  assert.match(over.reasons.join(), /warm.*45326.*45325/);
  // a pass not measured, or measured with a failed read, fails the check
  assert.equal(judgeCalls([...vendors, count('cua', 'cold', 45240)], opts).pass, false);
  assert.equal(judgeCalls([...vendors, count('cua', 'cold', 45240), count('cua', 'warm', 100, false)], opts).pass, false);
  assert.equal(judgeCalls([count('cua', 'cold', 1), count('cua', 'warm', 1)], opts).pass, false, 'no vendor count to bound by');
  assert.equal(judgeCalls([], opts).pass, false);
});

test("the readiness experiment passes only when the pinned build's captures agree with every condition's truth", () => {
  const right = Array.from({ length: 6 }, (_, i) => ({ ok: true, capture: { unobscured: i % 2 === 0 } }));
  const vendorRight = [{ ok: true }, { ok: true }];
  assert.equal(judgeReadinessRun(right, vendorRight).pass, true);
  const wrongReference = judgeReadinessRun(right, [{ ok: true }, { ok: false }]);
  assert.equal(wrongReference.pass, false);
  assert.equal(wrongReference.vendor_wrong, 1);
  const unjudgedReference = judgeReadinessRun(right, [{ ok: true }, { ok: null }]);
  assert.equal(unjudgedReference.pass, false);
  assert.equal(unjudgedReference.vendor_unjudged, 1);
  assert.equal(judgeReadinessRun(right, []).pass, false, 'no reference at all');
  assert.equal(judgeReadinessRun([...right, { ok: false, capture: {} }], vendorRight).pass, false);
});
