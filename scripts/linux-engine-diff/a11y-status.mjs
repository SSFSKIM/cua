// The session's accessibility switches, `org.a11y.Status` `IsEnabled` and `ScreenReaderEnabled` on the accessibility bus
// launcher (`org.a11y.Bus`), which Qt reads when an application starts to decide whether to put its tree on the bus
// (M0.4), and Firefox too (#171 M4, task 45; the design session's ruling, 2026-11-03). On a display a person uses the
// launcher is the person's and its switches are the person's settings: the launcher writes a change into their GSettings.
// So the harness only reads them there; on a private display the launcher is the run's own, on the run's session bus
// (session-bus.mjs), and the harness may set them, and a Qt scene refuses with the reason when both are off. On a
// display a person uses the run's applications are on a session bus of the run's that can activate nothing (B2, task
// 47), where Qt turns no bridge on whatever the switches say (`QT_ON_PERSONS_DISPLAY`) unless the run's stand-in for
// org.a11y.Bus answers there (a11y-stub.mjs, task 48), its switches both on and read-only: a Qt scene refuses there
// without it.

import { execFileSync } from 'node:child_process';

/** Qt's own switch: the bridge on whatever the session says. */
export const QT_ALWAYS_ON = 'QT_LINUX_ACCESSIBILITY_ALWAYS_ON';

const busArgs = (address) => (address ? [`--address=${address}`] : ['--user']);

/**
 * Where a run's switches are: its own session bus on a private display (`desktop.session`), or null for the harness's
 * own session bus, the person's, on any other display.
 */
export const a11yAddress = (desktop) => (desktop.isPrivate === true ? desktop.session?.address ?? null : null);

/** One switch's value, read through `busctl` from the session bus at `address`, or the harness's own (`--user`). */
export function readSwitch(name, { address = null, run = execFileSync } = {}) {
  const text = run('busctl', [...busArgs(address), '--json=short', 'get-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', name], { encoding: 'utf8', timeout: 10000 });
  const value = JSON.parse(text).data;
  if (typeof value !== 'boolean') throw new Error(`org.a11y.Status ${name} read as ${JSON.stringify(value)}, not a boolean`);
  return value;
}

/** Both switches: `{IsEnabled, ScreenReaderEnabled}`. */
export function readStatus(options = {}) {
  return { IsEnabled: readSwitch('IsEnabled', options), ScreenReaderEnabled: readSwitch('ScreenReaderEnabled', options) };
}

/**
 * Sets one switch on the run's own launcher: only on a private display, through the run's session bus at `address`.
 * Anywhere else it throws before anything is sent, since there the launcher would write the person's settings.
 */
export function setSwitch(name, value, { address, privateDisplay, run = execFileSync }) {
  if (!privateDisplay || !address) throw new Error(`refusing to set org.a11y.Status ${name}: on a display a person uses it is the person's setting, which the harness never writes; it may set it only on a private display, on the run's own session bus`);
  run('busctl', [`--address=${address}`, 'set-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', name, 'b', String(Boolean(value))], { encoding: 'utf8', timeout: 10000 });
}

/**
 * Why a Qt scene cannot run on a display a person uses. Qt 5.15 and 6.4 turn their AT-SPI bridge on through the session
 * bus's `org.a11y.Bus` (DBusConnection `serviceRegistered`, the only place QT_LINUX_ACCESSIBILITY_ALWAYS_ON is read);
 * their other routes, the display's `AT_SPI_BUS` property and AT_SPI_BUS_ADDRESS, set "enabled" inside DBusConnection's
 * constructor and announce it before the bridge has connected to the signal (qspiaccessiblebridge.cpp, bridge.cpp at
 * those versions), so the announcement is lost (task 46 saw Qt 6 register nothing with the variable set). The run's
 * applications' bus there has no `org.a11y.Bus` but the run's stand-in (a11y-stub.mjs, task 48), so without it a Qt
 * application would put no tree on the accessibility bus: the reason a Qt scene refuses there when the stand-in did
 * not start.
 */
export const QT_ON_PERSONS_DISPLAY = "a Qt application on a display a person uses would put no tree on the accessibility bus: the run's applications are on a session bus of the run's, which can activate nothing, and Qt 5.15 and 6.4 turn their accessibility on only through that bus's org.a11y.Bus, whatever the person's switches or QT_LINUX_ACCESSIBILITY_ALWAYS_ON say; run Qt scenes on a private display";

/**
 * Why a Qt application started now would put no tree on the accessibility bus, or null when it would: both switches
 * off, and no `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1` in its environment. `where` names the bus that was read.
 */
export function qtBridgeRefusal(status, env, where) {
  if (status.IsEnabled || status.ScreenReaderEnabled || env?.[QT_ALWAYS_ON] === '1') return null;
  return `org.a11y.Status IsEnabled and ScreenReaderEnabled are both off on ${where}, so a Qt application would put no tree on the accessibility bus; the harness never sets a person's switches: turn accessibility on in that session, or run the scene on a private display`;
}
