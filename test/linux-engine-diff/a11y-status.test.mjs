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

test("on a person's display a Qt scene with the person's switches off refuses before it starts, and nothing is written", async () => {
  const bus = fakeBus({ IsEnabled: false, ScreenReaderEnabled: false });
  const desktop = desktopOn(false);
  // a scene that started anyway ends here, without waiting for a window
  desktop.waitForWindow = async () => {
    throw new Error('the test opens no window');
  };
  try {
    for (const family of ['kate', 'qtcreator', 'qt5-input', 'qt6-input', 'qt5-breeze', 'qt5-fusion']) {
      await assert.rejects(openFamily(desktop, null, family, 'r'), (error) => {
        assert.match(error.message, /^refusing to start cua171-diff-a11y-n0-.*: org\.a11y\.Status IsEnabled and ScreenReaderEnabled are both off on the person's session bus/);
        return true;
      }, family);
    }
    assert.equal(bus.started('kate') || bus.started('qtcreator') || bus.started('python3'), false, 'no Qt application started');
    assert.ok(bus.calls().length > 0 && bus.calls().every((c) => c.includes('get-property') && c.includes('--user')), "only reads, from the person's bus");
    assert.deepEqual(bus.state(), { IsEnabled: false, ScreenReaderEnabled: false });
    // a non-Qt family is never asked
    const before = bus.calls().length;
    desktop.spawnApp = () => {
      throw new Error('the test ends the open here');
    };
    await assert.rejects(openFamily(desktop, null, 'gedit', 'r'), /the test ends the open here/);
    assert.equal(bus.calls().length, before);
    // a switch the harness cannot read refuses too: whether the tree would come is unknown
    assert.throws(() => desktop.assertQtBridge('kate', {}, () => {
      throw new Error('ServiceUnknown');
    }), /could not be read on the person's session bus \(ServiceUnknown\)/);
  } finally {
    ended(desktop);
    bus.done();
  }
});

test("a Qt scene starts when a switch is on, or Qt's own switch is set, on the person's bus or the run's", async () => {
  const bus = fakeBus({ IsEnabled: true, ScreenReaderEnabled: false });
  const persons = desktopOn(false);
  const privateRun = desktopOn(true, 'unix:path=/tmp/run-bus');
  try {
    persons.assertQtBridge('kate');
    privateRun.assertQtBridge('kate');
    const [first, second] = bus.calls().filter((c) => c.includes('IsEnabled'));
    assert.ok(first.includes('--user'), "the person's bus on a person's display");
    assert.ok(second.includes('--address=unix:path=/tmp/run-bus'), "the run's own bus on a private display");
    persons.assertQtBridge('kate', { [QT_ALWAYS_ON]: '1' }, () => ({ IsEnabled: false, ScreenReaderEnabled: false }));
    assert.throws(() => privateRun.assertQtBridge('kate', {}, () => ({ IsEnabled: false, ScreenReaderEnabled: false })), /both off on the run's own session bus/);
    assert.equal(bus.calls().some((c) => c.includes('set-property')), false);
  } finally {
    ended(persons);
    ended(privateRun);
    bus.done();
  }
});
