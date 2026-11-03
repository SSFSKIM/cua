// The session's accessibility switches, `org.a11y.Status` `IsEnabled` and `ScreenReaderEnabled` on the accessibility bus
// launcher (`org.a11y.Bus`), which Qt reads when an application starts to decide whether to put its tree on the bus
// (M0.4), and Firefox too (#171 M4, task 45; the design session's ruling, 2026-11-03). On a display a person uses the
// launcher is the person's and its switches are the person's settings: the launcher writes a change into their GSettings.
// So the harness only reads them there, and a Qt scene refuses with the reason when both are off; on a private display
// the launcher is the run's own, on the run's session bus (session-bus.mjs), and the harness may set them.

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
 * Why a Qt application started now would put no tree on the accessibility bus, or null when it would: both switches
 * off, and no `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1` in its environment. `where` names the bus that was read.
 */
export function qtBridgeRefusal(status, env, where) {
  if (status.IsEnabled || status.ScreenReaderEnabled || env?.[QT_ALWAYS_ON] === '1') return null;
  return `org.a11y.Status IsEnabled and ScreenReaderEnabled are both off on ${where}, so a Qt application would put no tree on the accessibility bus; the harness never sets a person's switches: turn accessibility on in that session, or run the scene on a private display`;
}
