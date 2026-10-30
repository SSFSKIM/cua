// Regression tests for the M2.3 review's second round (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Acceptance 5 and 6): the foreground allowance judged on the restack events, which are never coalesced, and a safety
// case whose cleanup fails.

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Cases } from '../../scripts/linux-engine-diff/safety.mjs';
import { judgeForegroundSpan, judgeRestacks } from '../../scripts/linux-engine-diff/witness.mjs';

// the root's children, bottom first: a desktop, two frames, the target's frame on neither top, an override-redirect
// window above them all (Openbox's, on the VM)
const [DESK, OTHER, TOP, TARGET, OR] = [0x400001, 0x47a7f2, 0x47a85e, 0x47a900, 0x40011f];
const CLIENT = 0x1200005;
const tree = [
  [DESK, 1, 0],
  [TARGET, 1, 0],
  [OTHER, 1, 0],
  [TOP, 1, 0],
  [OR, 1, 1],
];
const facts = { target: CLIENT, frame: TARGET, focusWithin: (w) => w === CLIENT };
const configure = (window, above) => ({ kind: 'configure', window, above, or: 0 });

test("the target's frame raised to the top, with the window manager's property rewrites, is allowed", () => {
  const raised = { tree, restacks: [configure(TARGET, TOP)] };
  assert.deepEqual(judgeRestacks(raised, TARGET), { clean: true, raised: true, violations: [] });
  const report = {
    ...raised,
    changes: [
      { field: 'stacking', notify: true },
      { field: 'stacking', notify: true },
      { field: 'active', from: [0x400002], to: [CLIENT] },
    ],
  };
  assert.deepEqual(judgeForegroundSpan(report, facts), { clean: true, fields: [], allowed: ['stacking', 'active'] });
  // a geometry change that leaves the order alone, and nothing at all, are no restacks
  assert.equal(judgeRestacks({ tree, restacks: [configure(OTHER, TARGET)] }, TARGET).clean, true);
  assert.deepEqual(judgeRestacks({ tree, restacks: [] }, TARGET), { clean: true, raised: false, violations: [] });
});

test('another window raised and restored under one server grab fails, though the property shows no change', () => {
  // the coalesced form: two notifies, the property read only after both restacks, so no transition is recorded
  const report = {
    tree,
    restacks: [configure(OTHER, TOP), configure(TOP, OTHER)],
    changes: [
      { field: 'stacking', notify: true },
      { field: 'stacking', notify: true },
    ],
  };
  const restacks = judgeRestacks(report, TARGET);
  assert.equal(restacks.clean, false);
  assert.equal(restacks.violations.length, 2, 'both restacks: each moves a window that is not the target');
  assert.deepEqual(judgeForegroundSpan(report, facts).fields, ['stacking']);
});

test("only the target's frame may move, and only to the top", () => {
  // the target lowered, or raised only part way (above OTHER, below TOP)
  assert.equal(judgeRestacks({ tree, restacks: [configure(TARGET, 0)] }, TARGET).clean, false);
  assert.equal(judgeRestacks({ tree, restacks: [configure(TARGET, OTHER)] }, TARGET).clean, false);
  // the target raised, then another window over it
  assert.equal(judgeRestacks({ tree, restacks: [configure(TARGET, TOP), configure(OTHER, TARGET)] }, TARGET).clean, false);
  // circulated to the top is a raise; another window circulated is not
  assert.equal(judgeRestacks({ tree, restacks: [{ kind: 'circulate', window: TARGET, place: 'top' }] }, TARGET).clean, true);
  assert.equal(judgeRestacks({ tree, restacks: [{ kind: 'circulate', window: OTHER, place: 'bottom' }] }, TARGET).clean, false);
  // a window mapped or unmapped changes what is stacked
  assert.equal(judgeRestacks({ tree, restacks: [{ kind: 'unmap', window: OTHER }] }, TARGET).clean, false);
  assert.equal(judgeRestacks({ tree, restacks: [{ kind: 'create', window: 0x500001, or: 0 }, { kind: 'map', window: 0x500001, or: 0 }] }, TARGET).clean, false);
  // an unmapped window's restack changes nothing stacked
  assert.equal(judgeRestacks({ tree: [...tree, [0x500002, 0, 0]], restacks: [configure(0x500002, DESK)] }, TARGET).clean, true);
});

test('a foreground span without the restack record, or without the frame, cannot be judged clean', () => {
  assert.deepEqual(judgeForegroundSpan({ changes: [] }, facts).fields, ['stacking']);
  assert.deepEqual(judgeForegroundSpan({ tree, restacks: [], changes: [] }, { ...facts, frame: null }).fields, ['stacking']);
});

// ---------------------------------------------------------------------------------------------------------------
// cleanup failures

const engineScript = () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-cases-'));
  const bin = join(dir, 'engine');
  writeFileSync(bin, '#!/bin/sh\ncat >/dev/null\n');
  chmodSync(bin, 0o755);
  return { dir, bin };
};

test('a passing case whose cleanup fails fails, every disposal still run', async () => {
  const { dir, bin } = engineScript();
  try {
    const cases = new Cases({ desktop: { oracle: {} }, witness: null, cua: bin, emit: () => {} });
    const ran = [];
    const engine = await (async () => {
      let e;
      await assert.rejects(
        cases.guarded(async () => {
          e = cases.engine();
          cases.defer(() => {
            throw new Error('the owner would not stop');
          }, 'clipboard owner');
          cases.defer(() => ran.push('target'), 'target window');
          return true;
        }),
        (error) => {
          assert.match(error.message, /cleanup failed: clipboard owner: the owner would not stop/);
          return true;
        },
      );
      return e;
    })();
    assert.deepEqual(ran, ['target'], 'the disposals after the failing one still ran');
    assert.notEqual(engine.child.exitCode ?? engine.child.signalCode, null, 'the engine exited');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a case that threw keeps its own error, the cleanup failures attached", async () => {
  const cases = new Cases({ desktop: { oracle: {} }, witness: null, cua: '/nonexistent', emit: () => {} });
  await assert.rejects(
    cases.guarded(async () => {
      cases.defer(() => {
        throw new Error('still running');
      }, 'engine');
      throw new Error('setup failed half-way');
    }),
    (error) => {
      assert.equal(error.message, 'setup failed half-way');
      assert.deepEqual(error.cleanupFailures, ['engine: still running']);
      return true;
    },
  );
});

test('an engine that already exited is gone, so its disposal is not a failure', async () => {
  const { dir, bin } = engineScript();
  try {
    const cases = new Cases({ desktop: { oracle: {} }, witness: null, cua: bin, emit: () => {} });
    const verdict = await cases.guarded(async () => {
      const e = cases.engine();
      await e.close();
      return true;
    });
    assert.equal(verdict, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
