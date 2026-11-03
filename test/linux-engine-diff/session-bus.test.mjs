// A private display's session bus (#171 M4, task 43; the design session's ruling, 2026-11-02): a run on a private
// display runs everything of its own under a dbus-daemon it starts, which can start only the accessibility bus
// launcher, so no GApplication or KDE single-instance handoff, and no session service, reaches the person's session.
// Display-free: the launcher is never started here. The one real dbus-daemon these tests start listens in a temporary
// directory, is offered a service file that is never activated, and is stopped by the test.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { Desktop, desktopEnding } from '../../scripts/linux-engine-diff/scenes.mjs';
import { busEnvironment, sessionBusConfig, startPrivateSession, startSessionBus, wireAccessibility } from '../../scripts/linux-engine-diff/session-bus.mjs';

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

test("the daemon's environment names the private display and no session bus of the person's", () => {
  const env = busEnvironment({ HOME: '/home/p', DISPLAY: ':0', XAUTHORITY: '/x', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus', DBUS_STARTER_ADDRESS: 'a', DBUS_STARTER_BUS_TYPE: 'session', DBUS_SESSION_BUS_PID: '1' }, ':88');
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
    const bus = await startSessionBus({ dir: s.dir, display: ':88', env: { PATH: '/usr/bin', DISPLAY: ':0', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus' }, serviceFile: s.serviceFile, ...daemon });
    assert.equal(bus.address, 'unix:path=/tmp/run/bus/dbus-abc,guid=1234');
    const [{ cmd, args, options }] = daemon.calls.spawn;
    assert.equal(cmd, 'dbus-daemon');
    assert.deepEqual(args, [`--config-file=${join(s.dir, 'session.conf')}`, '--nofork', '--nopidfile', '--print-address=3']);
    assert.equal(options.detached, true, 'its own process group, which the services it starts inherit');
    assert.deepEqual(options.env, { PATH: '/usr/bin', DISPLAY: ':88' });
    assert.deepEqual(readdirSync(join(s.dir, 'services')), ['org.a11y.Bus.service'], 'the only service it can start');
    assert.equal(readFileSync(join(s.dir, 'services', 'org.a11y.Bus.service'), 'utf8'), SERVICE);
    assert.match(readFileSync(join(s.dir, 'session.conf'), 'utf8'), new RegExp(`<servicedir>${join(s.dir, 'services')}</servicedir>`));
    const [update] = daemon.calls.run;
    assert.equal(update.cmd, 'busctl');
    assert.deepEqual(update.args, [`--address=${bus.address}`, 'call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'UpdateActivationEnvironment', 'a{ss}', '2', 'DBUS_SESSION_BUS_ADDRESS', bus.address, 'DISPLAY', ':88']);
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
    await assert.rejects(startSessionBus({ dir: s.dir, display: ':88', serviceFile: join(s.dir, 'missing.service'), ...daemon }), /needs the accessibility bus launcher's service/);
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

test("the accessibility wiring: the launcher's bus must be the display's AT_SPI_BUS", async () => {
  const answer = 'unix:path=/run/user/501/at-spi/bus_88,guid=feed';
  const run = (cmd, args) => {
    assert.equal(cmd, 'busctl');
    assert.deepEqual(args.slice(-4), ['org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress']);
    assert.equal(args[0], '--address=unix:path=/tmp/run/bus/dbus-1');
    return JSON.stringify({ type: 's', data: [answer] });
  };
  assert.equal(await wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':88', run, rootBus: () => answer }), answer);
  // the property is set a moment after the answer
  let reads = 0;
  assert.equal(await wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':88', run, rootBus: () => (++reads > 3 ? answer : null) }), answer);
  // a display that names another bus (the person's, or a stale one): applications and engines would split
  await assert.rejects(wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':88', run, rootBus: () => 'unix:path=/run/user/501/at-spi/bus_0', timeoutMs: 300 }), /is not the run's accessibility bus/);
  await assert.rejects(wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':88', run: () => JSON.stringify({ type: 's', data: [''] }), rootBus: () => '' }), /answered no bus address/);
  await assert.rejects(wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':88', run: () => {
    throw new Error('ServiceUnknown');
  } }), /started no accessibility bus: ServiceUnknown/);
  // with the real tools a test refuses before anything is asked
  await assert.rejects(wireAccessibility({ address: 'unix:path=/tmp/run/bus/dbus-1', display: ':88' }), /a test never starts the accessibility bus launcher/);
});

test('a private session whose wiring fails stops its bus before the error', async () => {
  let stopped = 0;
  const start = async () => ({ address: 'unix:path=/tmp/b', pid: 1, stop: async () => ({ terminated: true, killed: false, n: ++stopped }) });
  await assert.rejects(startPrivateSession({ dir: '/tmp/x', display: ':88', start, wire: async () => {
    throw new Error('split buses');
  } }), /split buses/);
  assert.equal(stopped, 1);
  const session = await startPrivateSession({ dir: '/tmp/x', display: ':88', start, wire: async () => 'unix:path=/a11y' });
  assert.equal(session.a11y, 'unix:path=/a11y');
  assert.equal(session.address, 'unix:path=/tmp/b');
});

/** The X tools the Desktop reads the root and the active window with, and an `xterm` that writes its session bus. */
function fakeTools() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-bus-tools-'));
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('xwininfo', 'echo "xwininfo: Window id: 0x293 (the root window) (has no name)"');
  tool('xprop', 'echo "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0"');
  tool('xdotool', 'exit 0');
  tool('xterm', `printf '%s' "\${DBUS_SESSION_BUS_ADDRESS-unset}" > ${JSON.stringify(join(dir, 'xterm-bus'))}; exec sleep 30`);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  return { dir, done: () => {
    process.env.PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  } };
}

const fakeTrace = () => () => ({ env: { ...process.env, DISPLAY: ':77' }, stop: async () => '' });
const fakeRecord = async () => ({ pid: 1, stop: async () => [JSON.stringify({ kind: 'ready', ms: 1 }), JSON.stringify({ kind: 'end', ms: 2 })].join('\n') });
const fakeWatchdog = async () => ({ guard: () => {}, stop: async () => ({ stalled: false, lines: [] }) });

async function runOn({ privateDisplay }) {
  const tools = fakeTools();
  const seen = { started: [], stopped: 0, during: null, app: null };
  const startSession = async (options) => {
    seen.started.push(options);
    return { address: 'unix:path=/tmp/run-bus', a11y: 'unix:path=/a11y-88', pid: 1, stop: async () => ({ terminated: true, killed: false, n: ++seen.stopped }) };
  };
  const desktop = new Desktop({ cua: 'unused', run: 'bus1', reader: { request: async () => ({ response: { ok: true, output: [{ id: 0x400001, title: desktop.label('front'), app: 'xterm' }] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
  const before = { had: 'DBUS_SESSION_BUS_ADDRESS' in process.env, value: process.env.DBUS_SESSION_BUS_ADDRESS };
  try {
    await desktop.begin({ startTrace: fakeTrace(), startRecord: fakeRecord, existing: () => [], privateDisplay: () => privateDisplay, startWatchdog: fakeWatchdog, startSession });
    seen.during = process.env.DBUS_SESSION_BUS_ADDRESS;
    desktop.arrangeFront = () => {};
    await desktop.openFront('visible');
    const file = join(tools.dir, 'xterm-bus');
    for (let i = 0; i < 100 && !existsSync(file); i++) await sleep(20);
    seen.app = readFileSync(file, 'utf8');
    await desktop.closeAll();
    seen.after = { had: 'DBUS_SESSION_BUS_ADDRESS' in process.env, value: process.env.DBUS_SESSION_BUS_ADDRESS };
  } finally {
    desktop.unhookStop();
    tools.done();
  }
  return { desktop, seen, before };
}

test("a private display's run: its session bus first, every process of the run's on it, and the harness's own variable put back", async () => {
  const { desktop, seen, before } = await runOn({ privateDisplay: true });
  assert.equal(seen.started.length, 1);
  assert.equal(seen.started[0].display, process.env.DISPLAY);
  assert.equal(seen.started[0].dir, join(desktop.dir, 'session'), "in the run's scratch directory");
  assert.equal(seen.during, 'unix:path=/tmp/run-bus');
  assert.equal(seen.app, 'unix:path=/tmp/run-bus', 'a scene application inherits the run\'s bus');
  assert.equal(seen.stopped, 1, 'stopped once, at the end');
  assert.deepEqual(seen.after, before, "the harness's own variable as it was found");
  assert.deepEqual(desktopEnding(desktop.ending).record.session, { address: 'unix:path=/tmp/run-bus', a11y: 'unix:path=/a11y-88', terminated: true, killed: false, n: 1 });
});

test("the person's display keeps the person's session bus: no bus is started", async () => {
  const { desktop, seen, before } = await runOn({ privateDisplay: false });
  assert.equal(seen.started.length, 0);
  assert.equal(seen.during, before.value);
  assert.equal(seen.app, before.had ? before.value : 'unset');
  assert.equal(desktopEnding(desktop.ending).record.session, undefined);
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

test('the reader starts at its first use, not with the Desktop', () => {
  const desktop = new Desktop({ cua: '/nonexistent/cua-engine', run: 'bus3', startActive: 0, nonce: 'n0' });
  try {
    assert.equal(desktop.ownReader, null, 'no engine process before the run begins');
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});
