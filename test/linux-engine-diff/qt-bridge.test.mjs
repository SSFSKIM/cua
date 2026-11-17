// qt-bridge (M0.4's experiment; #171 M4, task 45): on a display a person uses it never writes the person's
// `org.a11y.Status`, so only its condition that sets nothing runs there; on a private display it sets each condition on
// the run's own session bus and puts the switches back as found. Display-free: `busctl` is a stand-in (fake-busctl.mjs),
// and the scenes and engines are stood in for.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CONDITIONS, NOT_ON_PERSONS_DISPLAY, PERSONS_CONDITIONS, qtBridge } from '../../scripts/linux-engine-diff/qt-bridge.mjs';
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

/** A person's display's session as startAppSession makes it: the run's stand-in running, and its stop recorded. */
function personsSession({ stub = true } = {}) {
  const stops = [];
  const session = {
    address: 'unix:path=/tmp/run-app-bus',
    stub: stub ? { pid: 5, unique: ':1.1' } : null,
    stubRefusal: stub ? null : "the run's stand-in for org.a11y.Bus did not start: it exited (1)",
    async stopStub(why) {
      stops.push(why);
      session.stub = null;
      session.stubRefusal = why;
      return { terminated: true, killed: false };
    },
  };
  return { session, stops };
}

// B2 (task 47) and task 48: on a person's display the run's Qt applications are on a session bus of the run's, whose
// org.a11y.Status is the run's stand-in (both on, read-only), so none of the private display's conditions can be set
// there (a11y-status.test.mjs). What runs there instead is the live check's pair: Qt with the run's stand-in, then the
// control with the stand-in stopped, where a Qt 5.15 or 6.4 built as upstream registers no tree.
test("qt-bridge on a person's display runs the stand-in and its control, and reads or writes no switch of the person's", async () => {
  const bus = fakeBus({ IsEnabled: true, ScreenReaderEnabled: false });
  const s = bridgeStandIns();
  const { session, stops } = personsSession();
  const desktop = { ...s.desktop(false, null), session };
  const order = [];
  const open = async (d, oracle, family, role, options) => {
    order.push(`${family} ${role} stub ${d.session.stub ? 'on' : 'off'}`);
    return s.open(d, oracle, family, role, options);
  };
  const rows = [];
  try {
    const md = await qtBridge(desktop, (r) => rows.push(r), { vendor: 'unused', open, oracle: s.oracle, pinned: s.pinned, wait: async () => {} });
    assert.deepEqual(bus.calls(), [], "the person's switches are neither read nor written");
    assert.deepEqual(order, ['kate qtstub stub on', 'qtcreator qtstub stub on', 'kate qtcontrol stub off', 'qtcreator qtcontrol stub off']);
    assert.deepEqual(s.opened.map((o) => o.options.bridge), [true, true, false, false], "the control alone skips the refusal: it opens Qt with no stand-in on purpose");
    assert.equal(stops.length, 1, 'the stand-in is stopped once, for the control');
    const measured = rows.filter((r) => r.family);
    assert.deepEqual(measured.map((r) => [r.family, r.condition]), PERSONS_CONDITIONS.flatMap((c) => [['kate', c.name], ['qtcreator', c.name]]));
    assert.ok(measured.every((r) => 'cua_nodes' in r && 'registered' in r));
    assert.ok(rows.filter((r) => r.skipped).every((r) => r.skipped === NOT_ON_PERSONS_DISPLAY));
    assert.deepEqual(rows.filter((r) => r.skipped).map((r) => r.condition), CONDITIONS.map((c) => c.name), "the private display's conditions, not run");
    assert.match(NOT_ON_PERSONS_DISPLAY, /private display/);
    assert.ok(md.some((line) => line.includes('not run')));
  } finally {
    bus.done();
  }
});

test("qt-bridge on a person's display whose stand-in did not start records why, and still runs the control", async () => {
  const s = bridgeStandIns();
  const { session, stops } = personsSession({ stub: false });
  const rows = [];
  await qtBridge({ ...s.desktop(false, null), session }, (r) => rows.push(r), { vendor: 'unused', open: s.open, oracle: s.oracle, pinned: s.pinned, wait: async () => {} });
  const [first] = PERSONS_CONDITIONS;
  assert.deepEqual(rows.find((r) => r.condition === first.name && r.skipped), { kind: 'qt-bridge', condition: first.name, skipped: session.stubRefusal });
  assert.deepEqual(s.opened.map((o) => o.role), ['qtcontrol', 'qtcontrol']);
  assert.deepEqual(stops, [], 'nothing to stop');
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
