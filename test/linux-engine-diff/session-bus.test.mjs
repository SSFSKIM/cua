// A private display's session bus (#171 M4, task 43; the design session's ruling, 2026-11-02): a run on a private
// display runs everything of its own under a dbus-daemon it starts, which can start only the accessibility bus
// launcher, so no GApplication or KDE single-instance handoff, and no session service, reaches the person's session.
// Display-free: the launcher is never started here. The one real dbus-daemon these tests start listens in a temporary
// directory, is offered a service file that is never activated, and is stopped by the test.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { Desktop, desktopEnding } from '../../scripts/linux-engine-diff/scenes.mjs';
import * as sessionBus from '../../scripts/linux-engine-diff/session-bus.mjs';

const { busEnvironment, enableAccessibility, sessionBusConfig, startPrivateSession, startSessionBus, wireAccessibility } = sessionBus;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const found = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const HAS_BUS = found('dbus-daemon') && found('busctl');

const SERVICE = '[D-BUS Service]\nName=org.a11y.Bus\nExec=/bin/false\n';

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-bus-'));
  const serviceFile = join(dir, 'org.a11y.Bus.service');
  writeFileSync(serviceFile, SERVICE);
  return { dir, serviceFile, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the bus's configuration: it listens in the run's directory and its one service directory is the run's", () => {
  const config = sessionBusConfig({ socketDir: '/tmp/run & co/bus', serviceDir: '/tmp/run/services' });
  assert.match(config, /<type>session<\/type>/);
  assert.match(config, /<listen>unix:dir=\/tmp\/run &amp; co\/bus<\/listen>/);
  assert.deepEqual([...config.matchAll(/<servicedir>([^<]*)<\/servicedir>/g)].map((m) => m[1]), ['/tmp/run/services']);
  for (const shared of ['standard_session_servicedirs', '<include', 'systemd', 'servicehelper']) assert.equal(config.includes(shared), false, shared);
});

test("the daemon's environment names the private display and no session or accessibility bus of the person's", () => {
  const env = busEnvironment({ HOME: '/home/p', DISPLAY: ':0', XAUTHORITY: '/x', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus', DBUS_STARTER_ADDRESS: 'a', DBUS_STARTER_BUS_TYPE: 'session', DBUS_SESSION_BUS_PID: '1', AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/501/at-spi/bus_0' }, ':88');
  assert.deepEqual(env, { HOME: '/home/p', DISPLAY: ':88', XAUTHORITY: '/x' });
});

/** A dbus-daemon stand-in: it prints `address` on fd 3 and exits when signalled. */
function fakeDaemon(address) {
  const calls = { spawn: [], run: [], kill: [] };
  const child = new EventEmitter();
  child.pid = 7771;
  child.stderr = new PassThrough();
  child.stdio = [null, null, child.stderr, new PassThrough()];
  const spawn = (cmd, args, options) => {
    calls.spawn.push({ cmd, args, options });
    setImmediate(() => child.stdio[3].write(`${address}\n`));
    return child;
  };
  const run = (cmd, args, options) => {
    calls.run.push({ cmd, args, options });
    return '';
  };
  const kill = (pid, signal) => {
    calls.kill.push([pid, signal]);
    if (signal === 'SIGTERM') setImmediate(() => child.emit('exit', null, 'SIGTERM'));
  };
  return { calls, spawn, run, kill };
}

test('the bus starts as its own process group, offers only the launcher, and names itself in its activation environment', async () => {
  const s = scratch();
  try {
    const daemon = fakeDaemon('unix:path=/tmp/run/bus/dbus-abc,guid=1234');
    const bus = await startSessionBus({ dir: s.dir, display: ':cua171-test-88', env: { PATH: '/usr/bin', DISPLAY: ':0', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus', AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/501/at-spi/bus_0' }, serviceFile: s.serviceFile, ...daemon });
    assert.equal(bus.address, 'unix:path=/tmp/run/bus/dbus-abc,guid=1234');
    const [{ cmd, args, options }] = daemon.calls.spawn;
    assert.equal(cmd, 'dbus-daemon');
    assert.deepEqual(args, [`--config-file=${join(s.dir, 'session.conf')}`, '--nofork', '--nopidfile', '--print-address=3']);
    assert.equal(options.detached, true, 'its own process group, which the services it starts inherit');
    assert.deepEqual(options.env, { PATH: '/usr/bin', DISPLAY: ':cua171-test-88' });
    assert.deepEqual(readdirSync(join(s.dir, 'services')), ['org.a11y.Bus.service'], 'the only service it can start');
    assert.equal(readFileSync(join(s.dir, 'services', 'org.a11y.Bus.service'), 'utf8'), SERVICE);
    assert.match(readFileSync(join(s.dir, 'session.conf'), 'utf8'), new RegExp(`<servicedir>${join(s.dir, 'services')}</servicedir>`));
    const [update] = daemon.calls.run;
    assert.equal(update.cmd, 'busctl');
    assert.deepEqual(update.args, [`--address=${bus.address}`, 'call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'UpdateActivationEnvironment', 'a{ss}', '2', 'DBUS_SESSION_BUS_ADDRESS', bus.address, 'DISPLAY', ':cua171-test-88']);
    assert.deepEqual(update.options.env, { PATH: '/usr/bin', DISPLAY: ':cua171-test-88' }, "busctl too reaches the run's bus only");
    assert.deepEqual(await bus.stop({ graceMs: 1000 }), { terminated: true, killed: false });
    assert.deepEqual(daemon.calls.kill, [[-7771, 'SIGTERM'], [-7771, 'SIGKILL']], 'the group, then whatever it left');
  } finally {
    s.done();
  }
});

test('a bus without the launcher service is refused before anything starts', async () => {
  const s = scratch();
  try {
    const daemon = fakeDaemon('unix:path=/x');
    await assert.rejects(startSessionBus({ dir: s.dir, display: ':cua171-test-88', serviceFile: join(s.dir, 'missing.service'), ...daemon }), /needs the accessibility bus launcher's service/);
    assert.deepEqual(daemon.calls.spawn, []);
  } finally {
    s.done();
  }
});

test('a real dbus-daemon on the configuration: only the launcher is activatable, any other service is unknown at once', { skip: !HAS_BUS && 'no dbus-daemon or busctl here' }, async () => {
  const s = scratch();
  let bus = null;
  try {
    bus = await startSessionBus({ dir: s.dir, display: process.env.DISPLAY, serviceFile: s.serviceFile });
    assert.match(bus.address, new RegExp(`^unix:path=${join(s.dir, 'bus')}/`), "it listens in the run's directory");
    const call = (...args) => spawnSync('busctl', [`--address=${bus.address}`, '--json=short', ...args], { encoding: 'utf8', timeout: 10000 });
    const names = JSON.parse(call('call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListActivatableNames').stdout).data[0].sort();
    assert.deepEqual(names, ['org.a11y.Bus', 'org.freedesktop.DBus']);
    // what a scene application might ask for: dconf's writer, a portal, a terminal server, the keyring
    for (const name of ['ca.desrt.dconf', 'org.freedesktop.portal.Desktop', 'org.gnome.Terminal', 'org.freedesktop.secrets']) {
      const answer = call('call', name, '/', 'org.freedesktop.DBus.Peer', 'Ping');
      assert.notEqual(answer.status, 0, name);
      assert.match(answer.stderr, /not provided by any \.service files|ServiceUnknown/, name);
    }
    const pid = bus.pid;
    await bus.stop();
    bus = null;
    assert.equal(spawnSync('kill', ['-0', String(pid)]).status === 0, false, 'the daemon is gone');
  } finally {
    await bus?.stop();
    s.done();
  }
});

// B2 (task 47): on a display a person uses the run's applications get a session bus of the run's too, which can start
// nothing at all; they find the person's accessibility bus through the display's AT_SPI_BUS, as the engines do
test("the bus of a person's display's run offers no service at all", async () => {
  const s = scratch();
  try {
    const daemon = fakeDaemon('unix:path=/tmp/run/bus/dbus-def,guid=5678');
    const bus = await startSessionBus({ dir: s.dir, display: ':cua171-test-person', env: { PATH: '/usr/bin' }, serviceFile: null, ...daemon });
    assert.equal(bus.address, 'unix:path=/tmp/run/bus/dbus-def,guid=5678');
    assert.deepEqual(readdirSync(join(s.dir, 'services')), [], 'nothing it can start');
    assert.match(readFileSync(join(s.dir, 'session.conf'), 'utf8'), new RegExp(`<servicedir>${join(s.dir, 'services')}</servicedir>`));
    await bus.stop({ graceMs: 1000 });
  } finally {
    s.done();
  }
});

test("a person's display's run: its applications' bus started, the display's own accessibility bus required, and the bus stopped when there is none", async () => {
  assert.equal(typeof sessionBus.startAppSession, 'function', 'startAppSession');
  const started = [];
  const start = async (options) => {
    started.push(options);
    return { address: 'unix:path=/tmp/app-bus', pid: 1, stop: async () => ({ terminated: true, killed: false, stopped: started.push('stopped') }) };
  };
  const stubs = [];
  const startStub = async (options) => {
    stubs.push(options);
    return { pid: 77, unique: ':1.1', stop: async () => ({ terminated: true, killed: false, stopped: started.push('stub stopped') }) };
  };
  const session = await sessionBus.startAppSession({ dir: '/tmp/d', display: ':cua171-test-person', env: { PATH: '/usr/bin' }, start, rootBus: () => 'unix:path=/run/user/501/at-spi/bus_0', startStub });
  assert.deepEqual(started, [{ dir: '/tmp/d', display: ':cua171-test-person', env: { PATH: '/usr/bin' }, serviceFile: null }], 'a bus that can start nothing');
  assert.equal(session.address, 'unix:path=/tmp/app-bus');
  assert.equal(session.a11y, 'unix:path=/run/user/501/at-spi/bus_0', "the display's accessibility bus, the person's launcher's");
  // the run's stand-in for org.a11y.Bus on that bus, answering the display's accessibility bus (task 48)
  assert.deepEqual(stubs, [{ address: 'unix:path=/tmp/app-bus', a11y: 'unix:path=/run/user/501/at-spi/bus_0' }]);
  assert.deepEqual(session.stub, { pid: 77, unique: ':1.1' });
  await session.stop();
  assert.deepEqual(started.slice(1), ['stub stopped', 'stopped'], 'the stand-in, then the bus');
  started.length = 0;
  stubs.length = 0;
  await assert.rejects(sessionBus.startAppSession({ dir: '/tmp/d', display: ':cua171-test-person', start, rootBus: () => null, startStub }), /names no accessibility bus/);
  assert.equal(started.at(-1), 'stopped', 'the bus is stopped before the error');
  assert.deepEqual(stubs, [], 'and no stand-in is started for a display that names none');
  // a stand-in that cannot start: the session stands, its refusal kept for the Qt scenes
  const without = await sessionBus.startAppSession({ dir: '/tmp/d', display: ':cua171-test-person', start, rootBus: () => 'unix:path=/a11y', startStub: async () => {
    throw new Error('the name is owned already');
  } });
  assert.equal(without.stub, null);
  assert.equal(without.stubRefusal, 'the name is owned already');
  assert.deepEqual((await without.stop()).stub, { refused: 'the name is owned already' });
});

test('a real dbus-daemon with no service: nothing is activatable, the accessibility bus launcher included', { skip: !HAS_BUS && 'no dbus-daemon or busctl here' }, async () => {
  const s = scratch();
  let bus = null;
  try {
    bus = await startSessionBus({ dir: s.dir, display: process.env.DISPLAY, serviceFile: null });
    const call = (...args) => spawnSync('busctl', [`--address=${bus.address}`, '--json=short', ...args], { encoding: 'utf8', timeout: 10000 });
    const names = JSON.parse(call('call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListActivatableNames').stdout).data[0].sort();
    assert.deepEqual(names, ['org.freedesktop.DBus']);
    for (const name of ['org.a11y.Bus', 'org.kde.ActivityManager', 'org.kde.kglobalaccel', 'ca.desrt.dconf', 'org.gtk.vfs.Daemon']) {
      const answer = call('call', name, '/', 'org.freedesktop.DBus.Peer', 'Ping');
      assert.notEqual(answer.status, 0, name);
      assert.match(answer.stderr, /not provided by any \.service files|ServiceUnknown/, name);
    }
  } finally {
    await bus?.stop();
    s.done();
  }
});

test("the accessibility wiring: the launcher's bus must be the display's AT_SPI_BUS", async () => {
  const answer = 'unix:path=/run/user/501/at-spi/bus_88,guid=feed';
  const run = (cmd, args) => {
    assert.equal(cmd, 'busctl');
    assert.deepEqual(args.slice(-4), ['org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress']);
    assert.equal(args[0], '--address=unix:path=/tmp/run/bus/dbus-1');
    return JSON.stringify({ type: 's', data: [answer] });
  };
  assert.equal(await wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':cua171-test-88', run, rootBus: () => answer }), answer);
  // the property is set a moment after the answer
  let reads = 0;
  assert.equal(await wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':cua171-test-88', run, rootBus: () => (++reads > 3 ? answer : null) }), answer);
  // a display that names another bus (the person's, or a stale one): applications and engines would split
  await assert.rejects(wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':cua171-test-88', run, rootBus: () => 'unix:path=/run/user/501/at-spi/bus_0', timeoutMs: 300 }), /is not the run's accessibility bus/);
  await assert.rejects(wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':cua171-test-88', run: () => JSON.stringify({ type: 's', data: [''] }), rootBus: () => '' }), /answered no bus address/);
  await assert.rejects(wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':cua171-test-88', run: () => {
    throw new Error('ServiceUnknown');
  } }), /started no accessibility bus: ServiceUnknown/);
  // with the real tools a test refuses before anything is asked
  await assert.rejects(wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':cua171-test-88' }), /a test never starts the accessibility bus launcher/);
});

test('a private session whose wiring fails stops its bus before the error', async () => {
  let stopped = 0;
  const start = async () => ({ address: 'unix:path=/tmp/b', pid: 1, stop: async () => ({ terminated: true, killed: false, n: ++stopped }) });
  const enabled = [];
  const enable = async (options) => enabled.push(options);
  await assert.rejects(startPrivateSession({ dir: '/tmp/x', display: ':cua171-test-88', start, wire: async () => {
    throw new Error('split buses');
  }, enable }), /split buses/);
  assert.equal(stopped, 1);
  assert.deepEqual(enabled, [], 'no switch is set on a bus that is not wired');
  const session = await startPrivateSession({ dir: '/tmp/x', display: ':cua171-test-88', start, wire: async () => 'unix:path=/a11y', enable });
  assert.equal(session.a11y, 'unix:path=/a11y');
  assert.equal(session.address, 'unix:path=/tmp/b');
  assert.deepEqual(enabled, [{ address: 'unix:path=/tmp/b' }], "the run's switch is turned on, on the run's own bus");
  // a switch that cannot be turned on stops the bus too
  await assert.rejects(startPrivateSession({ dir: '/tmp/x', display: ':cua171-test-88', start, wire: async () => 'unix:path=/a11y', enable: async () => {
    throw new Error('it reads back off');
  } }), /it reads back off/);
  assert.equal(stopped, 2);
});

test("the session's bus is started with the run's launch environment it is given", async () => {
  const seen = [];
  const start = async (options) => {
    seen.push(options);
    return { address: 'unix:path=/tmp/b', pid: 1, stop: async () => ({}) };
  };
  const env = { HOME: '/tmp/cua171-diff-r-x/home', GSETTINGS_BACKEND: 'memory' };
  await startPrivateSession({ dir: '/tmp/x', display: ':cua171-test-88', env, start, wire: async () => 'unix:path=/a11y', enable: async () => {} });
  assert.deepEqual(seen, [{ dir: '/tmp/x', display: ':cua171-test-88', env }]);
});

test("the run's accessibility switch: set on the run's own bus, read back, and a test never sets it with the real tools", async () => {
  const calls = [];
  let value = false;
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args.includes('set-property')) value = args.at(-1) === 'true';
    return JSON.stringify({ type: 'b', data: value });
  };
  enableAccessibility({ address: 'unix:path=/tmp/b', run });
  assert.deepEqual(calls, [
    ['busctl', '--address=unix:path=/tmp/b', 'set-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', 'IsEnabled', 'b', 'true'],
    ['busctl', '--address=unix:path=/tmp/b', '--json=short', 'get-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', 'IsEnabled'],
  ]);
  // a launcher that does not keep it: refused
  assert.throws(() => enableAccessibility({ address: 'unix:path=/tmp/b', run: (cmd, args) => JSON.stringify({ type: 'b', data: false }) }), /could not be turned on: it reads back off/);
  assert.throws(() => enableAccessibility({ address: 'unix:path=/tmp/b' }), /a test never sets the run's accessibility switch/);
});

/**
 * The X tools the Desktop reads the root and the active window with, and an `xterm` that writes the session bus and the
 * accessibility bus it was started with, one a line.
 */
function fakeTools() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-bus-tools-'));
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('xwininfo', 'echo "xwininfo: Window id: 0x293 (the root window) (has no name)"');
  tool('xprop', 'echo "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0"');
  tool('xdotool', 'exit 0');
  const written = JSON.stringify(join(dir, 'xterm-bus'));
  tool('xterm', `printf '%s\\n%s' "\${DBUS_SESSION_BUS_ADDRESS-unset}" "\${AT_SPI_BUS_ADDRESS-unset}" > ${written}.tmp; mv ${written}.tmp ${written}; exec sleep 30`);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  return { dir, done: () => {
    process.env.PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  } };
}

const fakeTrace = () => () => ({ env: { ...process.env, DISPLAY: ':cua171-test-trace' }, stop: async () => '' });
const fakeRecord = async () => ({ pid: 1, stop: async () => [JSON.stringify({ kind: 'ready', ms: 1 }), JSON.stringify({ kind: 'end', ms: 2 })].join('\n') });
const fakeWatchdog = async () => ({ guard: () => {}, stop: async () => ({ state: 'ended', clean: true, stalled: false, reason: null, round_trips: 1, lines: [] }) });

/** The person's accessibility bus, as a harness started from their session inherits it. */
const PERSON_A11Y = 'unix:path=/run/user/501/at-spi/bus_0,guid=person';

/** This process's two bus variables now: `{bus, a11y}`, `unset` for one that is not set. */
const busVars = () => ({ bus: process.env.DBUS_SESSION_BUS_ADDRESS ?? 'unset', a11y: process.env.AT_SPI_BUS_ADDRESS ?? 'unset' });

/** Runs `fn` with `AT_SPI_BUS_ADDRESS` as `value` (null: unset), then puts the variable back as it was. */
async function withA11yVar(value, fn) {
  const had = 'AT_SPI_BUS_ADDRESS' in process.env;
  const saved = process.env.AT_SPI_BUS_ADDRESS;
  if (value === null) delete process.env.AT_SPI_BUS_ADDRESS;
  else process.env.AT_SPI_BUS_ADDRESS = value;
  try {
    return await fn();
  } finally {
    if (had) process.env.AT_SPI_BUS_ADDRESS = saved;
    else delete process.env.AT_SPI_BUS_ADDRESS;
  }
}

/**
 * A run that begins, opens its front window (a scene application: the fake `xterm`) and ends. `inherited`: the
 * `AT_SPI_BUS_ADDRESS` the harness was started with (null: none); `a11y`: the accessibility bus the run's session
 * reports.
 */
function runOn({ privateDisplay, inherited = PERSON_A11Y, a11y = 'unix:path=/a11y-88' }) {
  return withA11yVar(inherited, async () => {
    const tools = fakeTools();
    const seen = { started: [], stopped: 0, during: null, app: null };
    const startSession = async (options) => {
      seen.started.push(options);
      return { address: 'unix:path=/tmp/run-bus', a11y, pid: 1, stop: async () => ({ terminated: true, killed: false, n: ++seen.stopped }) };
    };
    const desktop = new Desktop({ cua: 'unused', run: 'bus1', reader: { request: async () => ({ response: { ok: true, output: [{ id: 0x400001, title: desktop.label('front'), app: 'xterm' }] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
    const before = busVars();
    try {
      const startTrace = (options) => {
        seen.trace = options;
        return fakeTrace()();
      };
      await desktop.begin({ startTrace, startRecord: fakeRecord, existing: () => [], privateDisplay: () => privateDisplay, startWatchdog: fakeWatchdog, startSession });
      seen.during = busVars();
      desktop.arrangeFront = () => {};
      await desktop.openFront('visible');
      const file = join(tools.dir, 'xterm-bus');
      for (let i = 0; i < 100 && !existsSync(file); i++) await sleep(20);
      const [bus, appA11y] = readFileSync(file, 'utf8').split('\n');
      seen.app = { bus, a11y: appA11y };
      await desktop.closeAll();
      seen.after = busVars();
    } finally {
      desktop.unhookStop();
      tools.done();
    }
    return { desktop, seen, before };
  });
}

test("a private display's run: its session bus first, every process of the run's on it, and the harness's own variable put back", async () => {
  const { desktop, seen, before } = await runOn({ privateDisplay: true });
  assert.equal(seen.started.length, 1);
  assert.equal(seen.started[0].display, process.env.DISPLAY);
  assert.equal(seen.started[0].dir, join(desktop.dir, 'session'), "in the run's scratch directory");
  // the bus, and the launcher it starts, with the run's home and its settings in memory (task 45): the launcher reads
  // no setting or file of the person's, and the run's accessibility switch is the run's
  assert.equal(seen.started[0].env.HOME, join(desktop.dir, 'home'));
  assert.equal(seen.started[0].env.XDG_CONFIG_HOME, join(desktop.dir, 'home', '.config'));
  assert.equal(seen.started[0].env.GSETTINGS_BACKEND, 'memory');
  assert.equal(seen.during.bus, 'unix:path=/tmp/run-bus');
  assert.equal(seen.app.bus, 'unix:path=/tmp/run-bus', 'a scene application inherits the run\'s bus');
  assert.equal(seen.stopped, 1, 'stopped once, at the end');
  // the run's trace knows the display is the harness's own, so it reads no authority file (task 46's finding 3)
  assert.deepEqual(seen.trace, { privateDisplay: true });
  assert.deepEqual(seen.after, before, "the harness's own variables as they were found");
  assert.deepEqual(desktopEnding(desktop.ending).record.session, { address: 'unix:path=/tmp/run-bus', a11y: 'unix:path=/a11y-88', terminated: true, killed: false, n: 1 });
});

// libatspi (GTK's atk-bridge, Chromium) and Qt take AT_SPI_BUS_ADDRESS before the display's AT_SPI_BUS: an inherited
// one, the person's, would put the run's applications on the person's accessibility bus while the root check passed
test("a private display's run hands no AT_SPI_BUS_ADDRESS to its applications, whatever it inherited, and puts the harness's own back", async () => {
  const { seen, before } = await runOn({ privateDisplay: true });
  assert.equal(before.a11y, PERSON_A11Y);
  assert.equal(seen.during.a11y, 'unix:path=/a11y-88', "the harness's own processes (engines, tools): the run's");
  // an application finds the run's accessibility bus through the display's AT_SPI_BUS and the run's session bus; with
  // the variable set, Qt 6 registers no tree at all (task 46), and an inherited one would be the person's
  assert.equal(seen.app.a11y, 'unset', "a scene application is handed no accessibility bus, never the person's");
  assert.equal(seen.after.a11y, PERSON_A11Y, "the harness's own variable as it was found");
  // a harness started with none: none again after the run
  const unset = await runOn({ privateDisplay: true, inherited: null });
  assert.equal(unset.seen.app.a11y, 'unset');
  assert.equal(unset.seen.after.a11y, 'unset');
  // a session that names no accessibility bus of its own: the inherited one is still not handed on
  const none = await runOn({ privateDisplay: true, a11y: null });
  assert.equal(none.seen.app.a11y, 'unset', "the person's accessibility bus is never handed on");
  assert.equal(none.seen.after.a11y, PERSON_A11Y);
});

test("a person's display's run: its applications on a session bus of the run's, the harness's own processes on the person's", async () => {
  const { desktop, seen, before } = await runOn({ privateDisplay: false, a11y: 'unix:path=/run/user/501/at-spi/bus_0' });
  assert.equal(seen.started.length, 1, "the applications' bus is started");
  assert.equal(seen.started[0].privateDisplay, false, "a person's display's: one that can start nothing");
  assert.equal(seen.started[0].dir, join(desktop.dir, 'session'));
  assert.equal(seen.started[0].env.HOME, join(desktop.dir, 'home'));
  assert.deepEqual(seen.trace, { privateDisplay: false }, "the run's trace on a person's display");
  assert.deepEqual(seen.during, before, "the harness's own variables untouched: its tools and engines keep the person's");
  assert.deepEqual(seen.app, { bus: 'unix:path=/tmp/run-bus', a11y: 'unset' }, "a scene application on the run's bus, and no accessibility bus named: the display's AT_SPI_BUS names it");
  assert.equal(seen.stopped, 1, 'stopped once, at the end');
  assert.deepEqual(seen.after, before);
  assert.deepEqual(desktopEnding(desktop.ending).record.session, { address: 'unix:path=/tmp/run-bus', a11y: 'unix:path=/run/user/501/at-spi/bus_0', terminated: true, killed: false, n: 1 });
});

test("a private display whose session cannot start runs nothing, and its watchdog is stopped", async () => {
  const tools = fakeTools();
  let watchdogStopped = 0;
  const desktop = new Desktop({ cua: 'unused', run: 'bus2', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
  try {
    await assert.rejects(desktop.begin({ startTrace: () => assert.fail('no trace'), startRecord: () => assert.fail('no record'), existing: () => [], privateDisplay: () => true, startWatchdog: async () => ({ guard: () => {}, stop: async () => ({ n: ++watchdogStopped }) }), startSession: async () => {
      throw new Error("the display's AT_SPI_BUS is not the run's accessibility bus");
    } }), /AT_SPI_BUS/);
    assert.equal(watchdogStopped, 1);
    assert.equal(desktop.session, null);
  } finally {
    desktop.unhookStop();
    tools.done();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});

// A dbus-daemon that cannot be started at all emits its spawn failure as the child's 'error' event: without a listener
// that event ends the harness's process, past Desktop's cleanup and its watchdog's stop
test("a dbus-daemon that cannot be started (missing, or not executable) rejects the bus's start instead of ending the process", async () => {
  const s = scratch();
  const bin = mkdtempSync(join(tmpdir(), 'cua171-bus-bin-'));
  try {
    await assert.rejects(startSessionBus({ dir: s.dir, display: ':cua171-test-88', env: { PATH: bin }, serviceFile: s.serviceFile }), /the run's session bus did not start: dbus-daemon: .*ENOENT/);
    writeFileSync(join(bin, 'dbus-daemon'), '#!/bin/sh\nexit 0\n', { mode: 0o644 });
    await assert.rejects(startSessionBus({ dir: s.dir, display: ':cua171-test-88', env: { PATH: bin }, serviceFile: s.serviceFile }), /the run's session bus did not start: dbus-daemon: .*EACCES/);
  } finally {
    s.done();
    rmSync(bin, { recursive: true, force: true });
  }
});

test('a private display whose dbus-daemon cannot be started: the start fails, its watchdog is stopped, nothing else starts', async () => {
  const s = scratch();
  const bin = mkdtempSync(join(tmpdir(), 'cua171-bus-bin-'));
  const tools = fakeTools();
  let watchdogStopped = 0;
  const desktop = new Desktop({ cua: 'unused', run: 'bus4', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
  const before = busVars();
  try {
    await assert.rejects(desktop.begin({
      startTrace: () => assert.fail('no trace'),
      startRecord: () => assert.fail('no record'),
      existing: () => [],
      privateDisplay: () => true,
      startWatchdog: async () => ({ guard: () => {}, stop: async () => ({ n: ++watchdogStopped }) }),
      // the real session start, its daemon spawned from a PATH without dbus-daemon
      startSession: (options) => startPrivateSession({ ...options, start: (o) => startSessionBus({ ...o, env: { PATH: bin }, serviceFile: s.serviceFile }), wire: () => assert.fail('no wiring') }),
    }), /the run's session bus did not start: dbus-daemon/);
    assert.equal(watchdogStopped, 1, "Desktop's cleanup ran: its watchdog stopped");
    assert.equal(desktop.session, null);
    assert.deepEqual(busVars(), before);
  } finally {
    desktop.unhookStop();
    tools.done();
    s.done();
    rmSync(bin, { recursive: true, force: true });
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});

/** What a run's start acquires, in order: each a stand-in that logs its start and its stop. */
const STAGES = ['watchdog', 'session', 'record', 'trace'];

// A signal's stop (stop.mjs) that finishes while `begin` is still awaiting one of its stages finds nothing to end: the
// stage then resolves on a stopped Desktop, installs the run's session bus in the environment and goes on starting, and
// the process exits after the stop with the run's dbus-daemon (its own process group) still running
for (const stage of STAGES) {
  test(`a stop while the run's ${stage} is starting waits for it, ends everything the start acquired, and starts nothing after it`, () => withA11yVar(PERSON_A11Y, async () => {
    const tools = fakeTools();
    const log = [];
    let release = null;
    let reached;
    const atStage = new Promise((r) => (reached = r));
    const stopping = (name, value) => ({ ...value, stop: async () => (log.push(`${name} stopped`), { state: 'ended', clean: true }) });
    const parts = {
      watchdog: stopping('watchdog', { guard: () => {} }),
      session: stopping('session', { address: 'unix:path=/tmp/late-bus', a11y: 'unix:path=/late-a11y', pid: 1 }),
      record: stopping('record', { pid: 1 }),
      trace: stopping('trace', { env: { ...process.env, DISPLAY: ':cua171-test-trace' } }),
    };
    // each stage logs its start; the one under test answers only once the test releases it
    const start = (name) => () => {
      log.push(name);
      if (name !== stage) return Promise.resolve(parts[name]);
      reached();
      return new Promise((r) => (release = () => r(parts[name])));
    };
    const desktop = new Desktop({ cua: 'unused', run: `bus-stop-${stage}`, reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
    const before = busVars();
    try {
      const begun = desktop.begin({ startWatchdog: start('watchdog'), startSession: start('session'), startRecord: start('record'), startTrace: start('trace'), existing: () => [], privateDisplay: () => true });
      begun.catch(() => {});
      await atStage;
      let stopDone = false;
      const stopped = desktop.stop().then(() => (stopDone = true));
      // longer than a stop that waits for nothing takes (its windows' close, 1 s)
      await sleep(1500);
      assert.equal(stopDone, false, `the stop waits for the ${stage} it interrupted`);
      release();
      await stopped;
      await assert.rejects(begun, /stopped while the run was starting/);
      const upTo = STAGES.slice(0, STAGES.indexOf(stage) + 1);
      assert.deepEqual(log.filter((l) => !l.endsWith(' stopped')), upTo, `nothing starts after the ${stage}`);
      assert.deepEqual(log.filter((l) => l.endsWith(' stopped')), upTo.toReversed().map((n) => `${n} stopped`), 'everything the start acquired ends before the stop returns, the watchdog last');
      assert.deepEqual(busVars(), before, "the harness's own bus variables as they were");
      assert.equal(desktop.session, null);
    } finally {
      release?.();
      desktop.unhookStop();
      tools.done();
      rmSync(desktop.dir, { recursive: true, force: true });
    }
  }));
}

// Task 46's finding 2: a signal is handled only on a later turn of the event loop, and the session's start ends
// synchronously (its `busctl` calls), so a stop that lands there was seen only after the next stage had started (on a
// real private run, the RECORD client). A real signal here, its handler the stop, sent inside each stage's last
// synchronous step: SIGWINCH, whose default is to be ignored (SIGUSR2 makes the test runner's node write a diagnostic
// report).
for (const stage of ['watchdog', 'session', 'record']) {
  test(`a signal that lands in the synchronous end of the run's ${stage} start is seen before anything after it starts`, () => withA11yVar(PERSON_A11Y, async () => {
    const tools = fakeTools();
    const log = [];
    const stopping = (name, value) => ({ ...value, stop: async () => (log.push(`${name} stopped`), { state: 'ended', clean: true }) });
    const parts = {
      watchdog: stopping('watchdog', { guard: () => {} }),
      session: stopping('session', { address: 'unix:path=/tmp/late-bus', a11y: 'unix:path=/late-a11y', pid: 1 }),
      record: stopping('record', { pid: 1 }),
      trace: stopping('trace', { env: { ...process.env, DISPLAY: ':cua171-test-trace' } }),
    };
    const desktop = new Desktop({ cua: 'unused', run: `bus-signal-${stage}`, reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
    let stopped = null;
    // stop.mjs's handler does the same for SIGINT and SIGTERM: the Desktop's stop
    const onSignal = () => {
      stopped = desktop.stop();
    };
    process.on('SIGWINCH', onSignal);
    const start = (name) => async () => {
      log.push(name);
      if (name === stage) {
        process.kill(process.pid, 'SIGWINCH');
        // the rest of the stage's synchronous work: node reads the signal only after it
        execFileSync('sleep', ['0.05']);
      }
      return parts[name];
    };
    const before = busVars();
    try {
      await assert.rejects(desktop.begin({ startWatchdog: start('watchdog'), startSession: start('session'), startRecord: start('record'), startTrace: start('trace'), existing: () => [], privateDisplay: () => true }), /stopped while the run was starting/);
      await stopped;
      const upTo = STAGES.slice(0, STAGES.indexOf(stage) + 1);
      assert.deepEqual(log.filter((l) => !l.endsWith(' stopped')), upTo, `nothing starts after the ${stage}`);
      assert.deepEqual(log.filter((l) => l.endsWith(' stopped')), upTo.toReversed().map((n) => `${n} stopped`));
      assert.deepEqual(busVars(), before);
    } finally {
      process.off('SIGWINCH', onSignal);
      desktop.unhookStop();
      tools.done();
      rmSync(desktop.dir, { recursive: true, force: true });
    }
  }));
}

// Task 45's review: the start's synchronous preflight (the root, the windows already there, the window active, the
// private-display probe) ran straight into the session bus's start with no turn of the event loop between them, so a
// signal landing in the preflight was seen only once the session bus had started. Every resource of the start is
// acquired behind a barrier that lets a pending signal's stop be seen first: the watchdog too, for a signal that lands
// in the caller's synchronous code just before `begin`.
const PREFLIGHT = ['existing', 'privacy'];
for (const point of ['before begin', ...PREFLIGHT]) {
  test(`a signal that lands ${point === 'before begin' ? 'just before the run begins' : `in the synchronous preflight (${point})`} is seen before the next resource is acquired`, () => withA11yVar(PERSON_A11Y, async () => {
    const tools = fakeTools();
    const log = [];
    const stopping = (name, value) => ({ ...value, stop: async () => (log.push(`${name} stopped`), { state: 'ended', clean: true }) });
    const parts = {
      watchdog: stopping('watchdog', { guard: () => {} }),
      session: stopping('session', { address: 'unix:path=/tmp/late-bus', a11y: 'unix:path=/late-a11y', pid: 1 }),
      record: stopping('record', { pid: 1 }),
      trace: stopping('trace', { env: { ...process.env, DISPLAY: ':cua171-test-trace' } }),
    };
    const desktop = new Desktop({ cua: 'unused', run: `bus-preflight-${point.replace(/ /g, '')}`, reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
    let stopped = null;
    const onSignal = () => {
      stopped = desktop.stop();
    };
    process.on('SIGWINCH', onSignal);
    // the signal, then the rest of the step's synchronous work: node reads the signal only after it
    const signal = () => {
      process.kill(process.pid, 'SIGWINCH');
      execFileSync('sleep', ['0.05']);
    };
    const start = (name) => async () => {
      log.push(name);
      return parts[name];
    };
    const probe = (name, value) => () => {
      log.push(name);
      if (name === point) signal();
      return value;
    };
    const before = busVars();
    try {
      if (point === 'before begin') signal();
      await assert.rejects(desktop.begin({ startWatchdog: start('watchdog'), startSession: start('session'), startRecord: start('record'), startTrace: start('trace'), existing: probe('existing', []), privateDisplay: probe('privacy', true) }), /stopped (while|before) the run/);
      await stopped;
      const acquired = point === 'before begin' ? [] : ['watchdog'];
      // the preflight's reads run on to its end (they acquire nothing); the barrier after them sees the signal
      const probed = point === 'before begin' ? [] : PREFLIGHT;
      assert.deepEqual(log.filter((l) => !l.endsWith(' stopped') && !PREFLIGHT.includes(l)), acquired, 'no resource is acquired after the signal');
      assert.deepEqual(log.filter((l) => PREFLIGHT.includes(l)), probed);
      assert.deepEqual(log.filter((l) => l.endsWith(' stopped')), acquired.map((n) => `${n} stopped`), 'what was acquired is ended');
      assert.deepEqual(busVars(), before);
      assert.equal(desktop.session, null);
    } finally {
      process.off('SIGWINCH', onSignal);
      desktop.unhookStop();
      tools.done();
      rmSync(desktop.dir, { recursive: true, force: true });
    }
  }));
}

test('a run stopped before it begins starts nothing', async () => {
  const desktop = new Desktop({ cua: 'unused', run: 'bus-stopped', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
  try {
    await desktop.stop();
    await assert.rejects(desktop.begin({ startWatchdog: () => assert.fail('no watchdog'), startSession: () => assert.fail('no session'), startRecord: () => assert.fail('no record'), startTrace: () => assert.fail('no trace'), existing: () => assert.fail('no read'), privateDisplay: () => true }), /stopped/);
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});

test('the reader starts at its first use, not with the Desktop', () => {
  const desktop = new Desktop({ cua: '/nonexistent/cua-engine', run: 'bus3', startActive: 0, nonce: 'n0' });
  try {
    assert.equal(desktop.ownReader, null, 'no engine process before the run begins');
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});
