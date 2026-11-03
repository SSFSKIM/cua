// qt-bridge (M0.4's experiment; #171 M4, task 45): on a display a person uses it never writes the person's
// `org.a11y.Status`, so only its condition that sets nothing runs there; on a private display it sets each condition on
// the run's own session bus and puts the switches back as found. Display-free: `busctl` is a stand-in (fake-busctl.mjs),
// and the scenes and engines are stood in for.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CONDITIONS, NOT_ON_PERSONS_DISPLAY, qtBridge } from '../../scripts/linux-engine-diff/qt-bridge.mjs';
import { fakeBus } from './fake-busctl.mjs';

/** qt-bridge's scenes and engines, stood in for: each open recorded, each read answering an X11 tree. */
function bridgeStandIns() {
  const opened = [];
  const desktop = (isPrivate, address) => ({
    isPrivate,
    session: address ? { address } : null,
    openFront: async () => {},
    close: async () => {},
    reader: { request: async () => ({ response: { ok: true, output: { ax_tree_source: 'x11' } } }) },
  });
  const open = async (d, oracle, family, role, options) => {
    opened.push({ family, role, options });
    return { pid: 1, id: 2, label: `l-${family}` };
  };
  const oracle = { appsOf: () => [], children: () => [], name: () => '' };
  const pinned = () => ({ request: async () => ({ response: { ok: true, output: { ax_tree_source: 'x11' } } }), close: async () => {} });
  return { desktop, open, oracle, pinned, opened };
}

test("qt-bridge on a person's display: only the condition that sets nothing runs, the others are recorded as not run, and nothing is written", async () => {
  const bus = fakeBus({ IsEnabled: true, ScreenReaderEnabled: false });
  const s = bridgeStandIns();
  const rows = [];
  try {
    const md = await qtBridge(s.desktop(false, null), (r) => rows.push(r), { vendor: 'unused', open: s.open, oracle: s.oracle, pinned: s.pinned, wait: async () => {} });
    assert.equal(bus.calls().some((c) => c.includes('set-property')), false, "the person's switches are never written");
    assert.deepEqual(bus.state(), { IsEnabled: true, ScreenReaderEnabled: false });
    assert.deepEqual(s.opened.map((o) => [o.family, o.role]), [['kate', 'qt0'], ['qtcreator', 'qt0']], "only 'as found'");
    assert.equal(s.opened.every((o) => o.options.bridge === false), true);
    const skipped = rows.filter((r) => r.skipped);
    assert.deepEqual(skipped.map((r) => r.condition), CONDITIONS.filter((c) => c.status).map((c) => c.name));
    assert.ok(skipped.every((r) => r.skipped === NOT_ON_PERSONS_DISPLAY));
    assert.equal(rows.some((r) => r.restored), false, 'nothing to put back');
    assert.ok(md.some((line) => line.includes('not run')));
  } finally {
    bus.done();
  }
});

test("qt-bridge on a private display sets each condition on the run's own bus and puts the switches back as found", async () => {
  const bus = fakeBus({ IsEnabled: true, ScreenReaderEnabled: false });
  const s = bridgeStandIns();
  const rows = [];
  try {
    await qtBridge(s.desktop(true, 'unix:path=/tmp/run-bus'), (r) => rows.push(r), { vendor: 'unused', open: s.open, oracle: s.oracle, pinned: s.pinned, wait: async () => {} });
    const sets = bus.calls().filter((c) => c.includes('set-property'));
    assert.ok(sets.length >= 6);
    assert.ok(bus.calls().every((c) => c.includes('--address=unix:path=/tmp/run-bus')), "every call on the run's own bus");
    assert.deepEqual(s.opened.map((o) => o.role), ['qt0', 'qt0', 'qt1', 'qt1', 'qt2', 'qt2', 'qt3', 'qt3']);
    assert.deepEqual(s.opened[4].options.env, { QT_LINUX_ACCESSIBILITY_ALWAYS_ON: '1' });
    assert.deepEqual(bus.state(), { IsEnabled: true, ScreenReaderEnabled: false }, 'put back as found');
    assert.deepEqual(rows.at(-1), { kind: 'qt-bridge', restored: { IsEnabled: true, ScreenReaderEnabled: false } });
  } finally {
    bus.done();
  }
});
