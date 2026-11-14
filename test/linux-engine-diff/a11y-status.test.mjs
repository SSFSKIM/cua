// The session's accessibility switches (#171 M4, task 45; a11y-status.mjs): on a display a person uses the harness only
// reads `org.a11y.Status`, and a Qt scene refuses with the reason when both switches are off; on a private display, on
// the run's own session bus, it may set them (qt-bridge.mjs). Display-free: `busctl` is a stand-in that answers from a
// state file and logs every call, and no Qt application starts.

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';

import { QT_ALWAYS_ON, qtBridgeRefusal, readStatus, setSwitch } from '../../scripts/linux-engine-diff/a11y-status.mjs';
import { openFamily } from '../../scripts/linux-engine-diff/families.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';

import { fakeBus } from './fake-busctl.mjs';

const desktopOn = (isPrivate, address = null) => {
  const desktop = new Desktop({ cua: 'unused', run: 'a11y', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
  desktop.isPrivate = isPrivate;
  if (address) desktop.session = { address };
  return desktop;
};
const ended = (desktop) => {
  desktop.unhookStop();
  rmSync(desktop.dir, { recursive: true, force: true });
};

test("a Qt application would put no tree on the bus only with both switches off and Qt's own switch unset", () => {
  const off = { IsEnabled: false, ScreenReaderEnabled: false };
  assert.match(qtBridgeRefusal(off, {}, "the person's session bus"), /IsEnabled and ScreenReaderEnabled are both off on the person's session bus/);
  assert.match(qtBridgeRefusal(off, {}, 'x'), /the harness never sets a person's switches/);
  assert.equal(qtBridgeRefusal({ IsEnabled: true, ScreenReaderEnabled: false }, {}, 'x'), null);
  assert.equal(qtBridgeRefusal({ IsEnabled: false, ScreenReaderEnabled: true }, {}, 'x'), null);
  assert.equal(qtBridgeRefusal(off, { [QT_ALWAYS_ON]: '1' }, 'x'), null);
});

test("the switches are read from the harness's own session bus, or the run's by its address, and set only on a private display's", () => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    return JSON.stringify({ type: 'b', data: true });
  };
  assert.deepEqual(readStatus({ run }), { IsEnabled: true, ScreenReaderEnabled: true });
  assert.deepEqual(calls[0], ['busctl', '--user', '--json=short', 'get-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', 'IsEnabled']);
  readStatus({ address: 'unix:path=/tmp/run-bus', run });
  assert.equal(calls[2][1], '--address=unix:path=/tmp/run-bus');
  calls.length = 0;
  // never on a person's display, and never without the run's own bus: refused before anything is sent
  assert.throws(() => setSwitch('IsEnabled', false, { privateDisplay: false, address: 'unix:path=/tmp/run-bus', run }), /never writes/);
  assert.throws(() => setSwitch('IsEnabled', false, { privateDisplay: true, address: null, run }), /never writes/);
  assert.deepEqual(calls, []);
  setSwitch('ScreenReaderEnabled', true, { privateDisplay: true, address: 'unix:path=/tmp/run-bus', run });
  assert.deepEqual(calls, [['busctl', '--address=unix:path=/tmp/run-bus', 'set-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', 'ScreenReaderEnabled', 'b', 'true']]);
  assert.throws(() => readStatus({ run: () => JSON.stringify({ type: 's', data: 'x' }) }), /not a boolean/);
});

// B2 (task 47): on a person's display the run's applications are on a session bus of the run's, which can start nothing,
// so no org.a11y.Bus answers there unless the run's stand-in does (task 48, a11y-stub.mjs). Qt 5.15 and 6.4 turn their
// bridge on only through that service (DBusConnection's `serviceRegistered`, which alone reads
// QT_LINUX_ACCESSIBILITY_ALWAYS_ON); their other route, the display's AT_SPI_BUS property, announces "enabled" from
// DBusConnection's constructor, before the bridge has connected to the signal, so it is lost. Without the stand-in a Qt
// scene there would put no tree on the bus, whatever the person's switches say: it is refused before it starts, by its
// family, and nothing is read or written.
test("on a person's display without the run's stand-in every Qt scene refuses before it starts, whatever the person's switches, and nothing is read or written", async () => {
  for (const [state, session] of [[{ IsEnabled: false, ScreenReaderEnabled: false }, null], [{ IsEnabled: true, ScreenReaderEnabled: true }, { address: 'unix:path=/tmp/run-bus', stub: null, stubRefusal: "the run's stand-in for org.a11y.Bus did not start: org.a11y.Bus is owned already on the run's session bus (RequestName answered 3)" }]]) {
    const bus = fakeBus(state);
    const desktop = desktopOn(false);
    if (session) desktop.session = session;
    desktop.waitForWindow = async () => {
      throw new Error('the test opens no window');
    };
    try {
      for (const family of ['kate', 'qtcreator', 'qt5-input', 'qt6-input', 'qt5-breeze', 'qt5-fusion']) {
        await assert.rejects(openFamily(desktop, null, family, 'r'), (error) => {
          assert.match(error.message, /^refusing to start cua171-diff-a11y-n0-.*: a Qt application on a display a person uses would put no tree on the accessibility bus/);
          assert.match(error.message, /run Qt scenes on a private display/);
          return true;
        }, family);
      }
      assert.throws(() => desktop.assertQtBridge('kate', { [QT_ALWAYS_ON]: '1' }), /would put no tree/, "Qt's own switch does not help: only that service reads it");
      if (session) assert.throws(() => desktop.assertQtBridge('kate'), (error) => error.message.endsWith(`run Qt scenes on a private display (${session.stubRefusal})`), 'the reason the stand-in is missing');
      assert.equal(bus.started('kate') || bus.started('qtcreator') || bus.started('python3'), false, 'no Qt application started');
      assert.deepEqual(bus.calls(), [], "the person's switches are not even read");
    } finally {
      ended(desktop);
      bus.done();
    }
  }
});

// Task 48 (the design session's ruling, sminos 334): with the run's stand-in owning org.a11y.Bus on the applications'
// bus, Qt finds the service, reads its switches (both true, read-only) and asks it for the display's accessibility bus,
// so Qt scenes run on a person's display again. Before a Qt application starts, its switches are read where Qt will read
// them, on the run's bus, never the person's, and a stand-in that does not answer refuses the scene.
test("on a person's display with the run's stand-in a Qt scene starts, its switches read on the run's bus, never the person's", async () => {
  const bus = fakeBus({ IsEnabled: true, ScreenReaderEnabled: true });
  const desktop = desktopOn(false);
  desktop.session = { address: 'unix:path=/tmp/run-app-bus', stub: { pid: 4242, unique: ':1.1' }, stubRefusal: null };
  desktop.waitForWindow = async () => {
    throw new Error('the test opens no window');
  };
  try {
    desktop.assertQtBridge('kate');
    const reads = bus.calls();
    assert.ok(reads.length > 0 && reads.every((c) => c.includes('--address=unix:path=/tmp/run-app-bus') && !c.includes('--user')), JSON.stringify(reads));
    await assert.rejects(openFamily(desktop, null, 'kate', 'r'), /the test opens no window/);
    for (let i = 0; i < 100 && !bus.started('kate'); i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(bus.started('kate'), true, 'kate was started');
    // the stand-in's answer is what decides: one that reads off, or does not answer, refuses
    assert.throws(() => desktop.assertQtBridge('kate', {}, () => ({ IsEnabled: false, ScreenReaderEnabled: false })), /both off on the run's stand-in for org\.a11y\.Bus/);
    assert.throws(() => desktop.assertQtBridge('kate', {}, () => {
      throw new Error('NoReply');
    }), /org\.a11y\.Status could not be read on the run's stand-in for org\.a11y\.Bus \(NoReply\)/);
    assert.equal(bus.calls().some((c) => c.includes('set-property')), false, 'nothing is written');
  } finally {
    await desktop.close(desktop.windows).catch(() => {});
    ended(desktop);
    bus.done();
  }
});

test("on a private display a Qt scene starts when a switch of the run's own bus is on, or Qt's own switch is set, and refuses otherwise", async () => {
  const bus = fakeBus({ IsEnabled: true, ScreenReaderEnabled: false });
  const privateRun = desktopOn(true, 'unix:path=/tmp/run-bus');
  try {
    privateRun.assertQtBridge('kate');
    const [first] = bus.calls().filter((c) => c.includes('IsEnabled'));
    assert.ok(first.includes('--address=unix:path=/tmp/run-bus'), "the run's own bus on a private display");
    privateRun.assertQtBridge('kate', { [QT_ALWAYS_ON]: '1' }, () => ({ IsEnabled: false, ScreenReaderEnabled: false }));
    assert.throws(() => privateRun.assertQtBridge('kate', {}, () => ({ IsEnabled: false, ScreenReaderEnabled: false })), /both off on the run's own session bus/);
    // a switch the harness cannot read refuses too: whether the tree would come is unknown
    assert.throws(() => privateRun.assertQtBridge('kate', {}, () => {
      throw new Error('ServiceUnknown');
    }), /could not be read on the run's own session bus \(ServiceUnknown\)/);
    assert.equal(bus.calls().some((c) => c.includes('set-property')), false);
  } finally {
    ended(privateRun);
    bus.done();
  }
});
