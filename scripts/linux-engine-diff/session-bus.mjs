// A session bus of the run's own for a private display (#171 M4, task 43; the design session's ruling, 2026-11-02). On
// the person's session bus a scene application can hand its window to the person's running instance (a GApplication,
// KDE's unique-instance service) or start services that stay in the person's session (kate started kactivitymanagerd
// there). On a private display the harness starts a dbus-daemon of its own and runs everything of the run's under it,
// so no such handoff can reach the person's session:
// - the daemon listens in the run's scratch directory and can start exactly one service, the accessibility bus
//   launcher (`org.a11y.Bus`): a scene application that asks for anything else (dconf's writer, a portal, gvfs, the
//   keyring, a terminal server) is told at once that no such service exists, so nothing of the person's is started or
//   written through it, and none of those services' runtime sockets are taken a second time;
// - its activation environment names the private display and the private bus itself, so the launcher it starts serves
//   that display: the launcher binds `$XDG_RUNTIME_DIR/at-spi/bus_<display number>` (the person's is `bus_0`) and sets
//   the display's root property `AT_SPI_BUS`, which is where the engines and the harness's oracle look first for the
//   accessibility bus;
// - `wireAccessibility` starts the launcher at the run's start (`org.a11y.Bus.GetAddress`) and refuses the run unless
//   the display's `AT_SPI_BUS` then names the bus the launcher answered: applications, engines and oracle on one
//   accessibility bus, the private session's, or no run. The applications' AT-SPI bridges (libatspi, Qt) would take
//   `AT_SPI_BUS_ADDRESS` before that property, so no application is handed one (app-env.mjs; with it set, Qt 6
//   registers no tree, task 46): they find the run's bus through the display's property and the launcher on the run's
//   session bus; the harness's own processes get the run's (scenes.mjs `useSession`), and the daemon inherits no such
//   variable of the person's (`busEnvironment`);
// - the daemon, and so the launcher, runs with the run's own home and its settings in memory (task 45, app-env.mjs):
//   the launcher reads no setting of the person's, and the run's accessibility switch, which Qt and Firefox read when
//   they start, is the run's to turn on (`enableAccessibility`, at the run's start);
// - its stop ends its process group (the daemon was started as its own group, and the services it starts inherit it).
// The person's display keeps the person's session bus: there the per-application isolation (families.mjs) carries it.

import { execFileSync, spawn as spawnProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readSwitch, setSwitch } from './a11y-status.mjs';
import { inTest } from './hermetic.mjs';
import { guard } from './xspawn.mjs';

/** The accessibility bus launcher's service file: the one service the run's bus can start. */
export const A11Y_SERVICE_FILE = '/usr/share/dbus-1/services/org.a11y.Bus.service';

/**
 * The variables of a session bus and of an accessibility bus that the run's daemon and its services must not inherit
 * from the person's session. `AT_SPI_BUS_ADDRESS` is one: libatspi and Qt take it before the display's `AT_SPI_BUS`.
 */
const PERSON_BUS_VARS = ['DBUS_SESSION_BUS_ADDRESS', 'DBUS_SESSION_BUS_PID', 'DBUS_SESSION_BUS_WINDOWID', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'AT_SPI_BUS_ADDRESS'];

const xml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The daemon's configuration: a session bus listening in `socketDir`, whose only service directory is `serviceDir`
 * (no standard session service directories, nothing included from the system's), open to every client of the user.
 */
export function sessionBusConfig({ socketDir, serviceDir }) {
  return `<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <listen>unix:dir=${xml(socketDir)}</listen>
  <auth>EXTERNAL</auth>
  <servicedir>${xml(serviceDir)}</servicedir>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
`;
}

/** The daemon's environment: the harness's, on `display`, with no session or accessibility bus of the person's in it. */
export function busEnvironment(env, display) {
  const out = { ...env, DISPLAY: display };
  for (const name of PERSON_BUS_VARS) delete out[name];
  return out;
}

/**
 * Starts the run's session bus in `dir` for `display`: its configuration, its one service file (copied from
 * `serviceFile`), and `dbus-daemon` as a process group of its own, whose activation environment then names the bus
 * itself. Resolves with `{address, pid, stop()}`; `stop` ends the daemon's group (SIGTERM, then SIGKILL after
 * `graceMs`) and answers `{terminated, killed}`. `spawn`, `run` and `kill` are the display-free tests' own.
 */
export async function startSessionBus({ dir, display, env = process.env, serviceFile = A11Y_SERVICE_FILE, spawn = spawnProcess, run = execFileSync, kill = (pid, signal) => process.kill(pid, signal), readyMs = 10000 }) {
  const socketDir = join(dir, 'bus');
  const serviceDir = join(dir, 'services');
  mkdirSync(socketDir, { recursive: true, mode: 0o700 });
  mkdirSync(serviceDir, { recursive: true, mode: 0o700 });
  let service;
  try {
    service = readFileSync(serviceFile, 'utf8');
  } catch {
    throw new Error(`the run's session bus needs the accessibility bus launcher's service (${serviceFile}), which is missing`);
  }
  writeFileSync(join(serviceDir, 'org.a11y.Bus.service'), service);
  const config = join(dir, 'session.conf');
  writeFileSync(config, sessionBusConfig({ socketDir, serviceDir }));
  // the daemon reaches the display through the launcher it activates, which marks the display's root: a display the run
  // may reach only (xspawn.mjs), whatever `spawn` is
  const child = guard(spawn)('dbus-daemon', [`--config-file=${config}`, '--nofork', '--nopidfile', '--print-address=3'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe'], env: busEnvironment(env, display), detached: true });
  child.unref?.();
  let stderr = '';
  child.stderr?.on('data', (d) => {
    stderr += d;
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const address = await new Promise((resolve, reject) => {
    let text = '';
    let settled = false;
    const timer = setTimeout(() => done(new Error(`the run's session bus gave no address in ${readyMs} ms`)), readyMs);
    // the first outcome only: the daemon's exit at its stop, long after it listened, is not a failed start
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        try {
          // a daemon that never started has no pid, and no group to end
          if (child.pid) kill(-child.pid, 'SIGKILL');
        } catch {
          // already gone
        }
        reject(error);
      } else resolve(value);
    };
    // a dbus-daemon that cannot be started (missing, not executable) fails the start: without a listener its 'error'
    // event would end the harness's process, past its cleanup and its watchdog's stop
    child.on('error', (error) => done(new Error(`the run's session bus did not start: dbus-daemon: ${error.message}`)));
    child.stdio[3].on('data', (d) => {
      text += d;
      const line = text.split('\n')[0];
      if (text.includes('\n') && line) done(null, line.trim());
    });
    exited.then(({ code, signal }) => done(new Error(`the run's session bus exited before it listened (${signal ?? code})${stderr.trim() ? `: ${stderr.trim()}` : ''}`)));
  });
  child.stdio[3].destroy?.();
  try {
    // the services it starts reach this bus, not the person's (a GDBus client without the variable would take
    // `$XDG_RUNTIME_DIR/bus`, the person's)
    run('busctl', [`--address=${address}`, 'call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'UpdateActivationEnvironment', 'a{ss}', '2', 'DBUS_SESSION_BUS_ADDRESS', address, 'DISPLAY', display], { encoding: 'utf8', timeout: 10000, env: busEnvironment(env, display) });
  } catch (error) {
    try {
      kill(-child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
    throw new Error(`the run's session bus took no activation environment: ${error.message}`);
  }
  let stopped = null;
  return {
    address,
    pid: child.pid,
    stop({ graceMs = 5000 } = {}) {
      stopped ??= (async () => {
        const signal = (name) => {
          try {
            kill(-child.pid, name);
            return true;
          } catch {
            return false;
          }
        };
        const terminated = signal('SIGTERM');
        const gone = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), graceMs))]);
        // what the daemon started stays in its group: ended with it either way
        const killed = signal('SIGKILL') && !gone;
        return { terminated, killed };
      })();
      return stopped;
    },
  };
}

/** The display's root property `AT_SPI_BUS` (an `xprop` read), or null when it has none. */
export function rootAccessibilityBus(display, run = execFileSync) {
  try {
    const text = guard(run)('xprop', ['-root', 'AT_SPI_BUS'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, DISPLAY: display } });
    return text.match(/"(.*)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The run's accessibility bus: the launcher started on the run's session bus (`org.a11y.Bus.GetAddress`), then the
 * display's `AT_SPI_BUS` read until it names the address the launcher answered, at most `timeoutMs`. Throws when the
 * launcher answers no bus or the display names another, since then the applications and the engines would read
 * different buses. Never in a test unless its tools are the test's own: the launcher is an application.
 */
export async function wireAccessibility({ address, display, run = execFileSync, rootBus = (d) => rootAccessibilityBus(d, run), timeoutMs = 5000 }) {
  if (inTest() && run === execFileSync) throw new Error("a test never starts the accessibility bus launcher: it passes its own tools");
  let answered;
  try {
    const text = run('busctl', [`--address=${address}`, '--json=short', '--timeout=30', 'call', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress'], { encoding: 'utf8', timeout: 40000, env: busEnvironment(process.env, display) });
    answered = JSON.parse(text).data?.[0];
  } catch (error) {
    throw new Error(`the run's session bus started no accessibility bus: ${error.message}`);
  }
  if (typeof answered !== 'string' || !answered) throw new Error("the run's accessibility bus launcher answered no bus address");
  const deadline = Date.now() + timeoutMs;
  let root = rootBus(display);
  while (root !== answered && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    root = rootBus(display);
  }
  if (root !== answered) throw new Error(`the display's AT_SPI_BUS (${root ?? 'none'}) is not the run's accessibility bus (${answered}): the applications and the engines would read different buses`);
  return answered;
}

/**
 * The run's accessibility switch on: `org.a11y.Status` `IsEnabled` set true on the run's own launcher (a11y-status.mjs),
 * then read back. The run's launcher keeps its settings in memory (`env` of `startPrivateSession`), so it starts with
 * the switch off, whatever the person's is, and a Qt application, or Firefox, started on the run's display would put no
 * tree on the bus. Throws when the switch does not read back on. Never in a test unless its tools are the test's own.
 */
export function enableAccessibility({ address, run = execFileSync }) {
  if (inTest() && run === execFileSync) throw new Error("a test never sets the run's accessibility switch: it passes its own tools");
  try {
    setSwitch('IsEnabled', true, { address, privateDisplay: true, run });
    if (readSwitch('IsEnabled', { address, run }) !== true) throw new Error('it reads back off');
  } catch (error) {
    throw new Error(`the run's accessibility switch (org.a11y.Status IsEnabled) could not be turned on: ${error.message}`);
  }
}

/**
 * The run's session on a private display: its bus started (with `env`, the run's own launch environment, so the
 * launcher it starts reads and writes no setting or file of the person's), its accessibility bus wired, and the run's
 * accessibility switch turned on. Resolves with `{address, a11y, pid, stop()}`; a failed wiring or switch stops the bus
 * before it throws.
 */
export async function startPrivateSession({ dir, display, env = process.env, start = startSessionBus, wire = wireAccessibility, enable = enableAccessibility }) {
  const bus = await start({ dir, display, env });
  try {
    const a11y = await wire({ address: bus.address, display });
    await enable({ address: bus.address });
    return { ...bus, a11y };
  } catch (error) {
    await bus.stop();
    throw error;
  }
}
