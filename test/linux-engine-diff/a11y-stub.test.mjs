// The run's stand-in for the accessibility bus launcher on a display a person uses (#171 M4, task 48; the design
// session's ruling, sminos 334; a11y-stub.mjs). On `:0` the run's applications are on a session bus of the run's that
// can activate nothing (task 47), where Qt 5.15 and 6.4 find no `org.a11y.Bus` and so never turn their bridge on. The
// stand-in owns that one name on that bus: `GetAddress` answers exactly the display's root `AT_SPI_BUS`, `org.a11y.Status`
// reads `IsEnabled` and `ScreenReaderEnabled` true and refuses every write, and it forwards nothing, owns nothing else
// and activates nothing; it lives and ends with the run's bus.
//
// Two halves. Display-free everywhere: the D-Bus codec (dbus-wire.mjs) and what the stand-in answers to each call. On a
// dbus-daemon each test starts itself (no service file, so nothing can be activated, and no display, ever): the
// stand-in as Qt and the tools meet it, read through busctl, dbus-send and dbus-monitor, which are none of this code.
// Those need dbus-daemon, busctl, dbus-send and dbus-monitor; where they are missing they are skipped saying so, except
// where CUA171_DBUS_TESTS=required (ci-kit's `harness-dbus` gate, on Ubuntu with dbus installed), where missing tools
// fail them, so CI never skips them.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { A11Y_PATH, A11Y_STUB, addressRefusal, answer, startA11yStub } from '../../scripts/linux-engine-diff/a11y-stub.mjs';
import { MESSAGE, NO_REPLY_EXPECTED, decodeMessage, encodeMessage, frameLength, marshal, socketPath, unmarshal } from '../../scripts/linux-engine-diff/dbus-wire.mjs';
import { startAppSession, startSessionBus } from '../../scripts/linux-engine-diff/session-bus.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const found = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const TOOLS = ['dbus-daemon', 'busctl', 'dbus-send', 'dbus-monitor'];
const MISSING = TOOLS.filter((tool) => !found(tool));
/** Set by the CI gate that runs these on a machine with dbus: there a missing tool fails the tests instead of skipping them. */
const REQUIRED = process.env.CUA171_DBUS_TESTS === 'required';
const onBus = { skip: MISSING.length > 0 && !REQUIRED && `no ${MISSING.join(', ')} here (ci-kit's harness-dbus gate runs these on Linux, where they are required)` };
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------------------------------------------
// the codec, display-free

test('values marshal at their alignments, and read back the same, in both byte orders', () => {
  const dict = [['IsEnabled', ['b', true]], ['ScreenReaderEnabled', ['b', true]]];
  const le = marshal('a{sv}', [dict]);
  // length 4 bytes, padding to the first dict entry at 8, "IsEnabled" (len 9 + nul), variant signature "b", the boolean at 4
  assert.equal(le.readUInt32LE(0), le.length - 8);
  assert.deepEqual(le.subarray(8, 12), Buffer.from([9, 0, 0, 0]));
  assert.equal(le.subarray(12, 21).toString(), 'IsEnabled');
  assert.deepEqual(le.subarray(22, 25), Buffer.from([1, 0x62, 0]));
  assert.deepEqual(le.subarray(28, 32), Buffer.from([1, 0, 0, 0]));
  for (const littleEndian of [true, false]) {
    const values = [7, 'héllo', '/org/a11y/bus', 'a{sv}', ['u', 3], dict, [[1, ['s', 'x']], [5, ['u', 9]]], -2, 2n ** 40n, 1.5, 65535];
    const sig = 'ysogva{sv}a(yv)itdq';
    assert.deepEqual(unmarshal(sig, marshal(sig, values, { littleEndian }), { littleEndian }), values);
  }
});

test('a message encodes with its header fields and body, frames by its own lengths, and decodes back', () => {
  const call = { type: MESSAGE.CALL, flags: 0, serial: 42, path: A11Y_PATH, interface: 'org.freedesktop.DBus.Properties', member: 'Get', destination: 'org.a11y.Bus', sender: ':1.7', signature: 'ss', body: ['org.a11y.Status', 'IsEnabled'] };
  for (const littleEndian of [true, false]) {
    const bytes = encodeMessage(call, { littleEndian });
    assert.equal(bytes[0], littleEndian ? 0x6c : 0x42);
    assert.equal(frameLength(bytes.subarray(0, 15)), null, 'not yet a frame');
    assert.equal(frameLength(bytes), bytes.length);
    assert.equal(frameLength(Buffer.concat([bytes, Buffer.from([1, 2, 3])])), bytes.length, 'the next frame is not this one');
    const back = decodeMessage(bytes);
    for (const key of Object.keys(call)) assert.deepEqual(back[key], call[key], key);
  }
  assert.throws(() => frameLength(Buffer.alloc(16, 0x41)), /byte order/);
  // a body of a type the codec does not read is no reason to fail the header: the stand-in still answers the caller
  const odd = Buffer.from(encodeMessage({ ...call, signature: 'ss' }));
  const at = odd.indexOf(Buffer.from([1, 0x67, 0, 2, 0x73, 0x73, 0]));
  odd[at + 4] = 0x58;
  const decoded = decodeMessage(odd);
  assert.equal(decoded.serial, 42);
  assert.equal(decoded.body, null);
});

test('only a unix path address is dialled, its escapes undone', () => {
  assert.equal(socketPath('unix:path=/tmp/cua171-x/bus/dbus-abc,guid=0123'), '/tmp/cua171-x/bus/dbus-abc');
  assert.equal(socketPath('tcp:host=a;unix:path=/tmp/a%20b,guid=1'), '/tmp/a b');
  assert.throws(() => socketPath('unix:abstract=/tmp/dbus-x'), /a unix:path= address/);
  assert.throws(() => socketPath('tcp:host=localhost,port=1'), /a unix:path= address/);
});

// ---------------------------------------------------------------------------------------------------------------
// what the stand-in answers, display-free

const A11Y = 'unix:path=/run/user/501/at-spi/bus_0,guid=0123456789abcdef0123456789abcdef';
const callOf = (over) => ({ type: MESSAGE.CALL, flags: 0, serial: 9, path: A11Y_PATH, sender: ':1.4', signature: '', body: [], ...over });
const STATUS_GET = (prop) => callOf({ interface: 'org.freedesktop.DBus.Properties', member: 'Get', signature: 'ss', body: ['org.a11y.Status', prop] });

test("GetAddress answers the display's accessibility bus, and the switches read true, through Get and GetAll alone", () => {
  assert.deepEqual(answer(callOf({ interface: 'org.a11y.Bus', member: 'GetAddress' }), A11Y), { type: MESSAGE.RETURN, signature: 's', body: [A11Y] });
  assert.deepEqual(answer(callOf({ member: 'GetAddress' }), A11Y), { type: MESSAGE.RETURN, signature: 's', body: [A11Y] }, 'a call that names no interface');
  for (const prop of ['IsEnabled', 'ScreenReaderEnabled']) assert.deepEqual(answer(STATUS_GET(prop), A11Y), { type: MESSAGE.RETURN, signature: 'v', body: [['b', true]] }, prop);
  assert.deepEqual(answer(callOf({ interface: 'org.freedesktop.DBus.Properties', member: 'GetAll', signature: 's', body: ['org.a11y.Status'] }), A11Y), { type: MESSAGE.RETURN, signature: 'a{sv}', body: [[['IsEnabled', ['b', true]], ['ScreenReaderEnabled', ['b', true]]]] });
});

test('every write is refused with a D-Bus error, and so is anything else; a call that wants no reply, or a signal, gets none', () => {
  const refusal = (m) => {
    const r = answer(m, A11Y);
    assert.equal(r?.type, MESSAGE.ERROR, JSON.stringify(m));
    return r.errorName;
  };
  for (const value of [false, true]) {
    assert.equal(refusal(callOf({ interface: 'org.freedesktop.DBus.Properties', member: 'Set', signature: 'ssv', body: ['org.a11y.Status', 'IsEnabled', ['b', value]] })), 'org.freedesktop.DBus.Error.PropertyReadOnly');
  }
  assert.equal(refusal(callOf({ interface: 'org.freedesktop.DBus.Properties', member: 'Set', signature: 'ssv', body: ['org.a11y.Status', 'Other', ['s', 'x']] })), 'org.freedesktop.DBus.Error.PropertyReadOnly');
  assert.equal(refusal(callOf({ interface: 'org.freedesktop.DBus.Properties', member: 'Set', signature: 's', body: ['x'] })), 'org.freedesktop.DBus.Error.PropertyReadOnly', 'whatever it carries');
  assert.equal(refusal(STATUS_GET('Other')), 'org.freedesktop.DBus.Error.UnknownProperty');
  assert.equal(refusal(callOf({ interface: 'org.freedesktop.DBus.Properties', member: 'Get', signature: 'ss', body: ['org.gtk.Other', 'IsEnabled'] })), 'org.freedesktop.DBus.Error.UnknownInterface');
  assert.equal(refusal(callOf({ interface: 'org.freedesktop.DBus.Properties', member: 'Get', signature: 's', body: ['org.a11y.Status'] })), 'org.freedesktop.DBus.Error.InvalidArgs');
  assert.equal(refusal(callOf({ interface: 'org.a11y.Bus', member: 'GetAddress', signature: 's', body: ['x'] })), 'org.freedesktop.DBus.Error.InvalidArgs');
  for (const [iface, member] of [['org.a11y.Status', 'SetIsEnabled'], ['org.a11y.Bus', 'SetAddress'], ['org.freedesktop.DBus.Introspectable', 'Introspect'], ['org.freedesktop.DBus.Peer', 'Ping'], ['org.freedesktop.DBus.Properties', 'Remove']]) {
    assert.equal(refusal(callOf({ interface: iface, member })), 'org.freedesktop.DBus.Error.UnknownMethod', `${iface}.${member}`);
  }
  assert.equal(refusal(callOf({ path: '/', interface: 'org.a11y.Bus', member: 'GetAddress' })), 'org.freedesktop.DBus.Error.UnknownObject');
  assert.equal(answer({ ...STATUS_GET('IsEnabled'), flags: NO_REPLY_EXPECTED }, A11Y), null);
  assert.equal(answer({ ...callOf({ interface: 'org.freedesktop.DBus.Properties', member: 'Set', signature: 'ssv', body: ['org.a11y.Status', 'IsEnabled', ['b', false]] }), flags: NO_REPLY_EXPECTED }, A11Y), null);
  assert.equal(answer({ ...callOf({ interface: 'org.a11y.Bus', member: 'GetAddress' }), type: MESSAGE.SIGNAL }, A11Y), null);
});

test("only a plain address is served: what a root property read could have escaped or cut is refused before anything starts", async () => {
  assert.equal(addressRefusal(A11Y), null);
  assert.equal(addressRefusal('unix:path=/run/user/501/at-spi/bus_0,guid=ab;unix:abstract=/tmp/x%20y'), null);
  for (const bad of ['', 'unix:path=/a b', 'unix:path=/a\\"b', 'unix:path="/a"', 'unix:path=/ä', 'unix:path=/a\n', 'no-transport', null, undefined, 7]) {
    assert.ok(addressRefusal(bad), JSON.stringify(bad));
  }
  let spawned = false;
  await assert.rejects(startA11yStub({ address: 'unix:path=/tmp/x', a11y: 'unix:path=/a b', spawn: () => (spawned = true) }), /stand-in for org\.a11y\.Bus was not started: .*not a plain D-Bus address/);
  assert.equal(spawned, false);
});

// ---------------------------------------------------------------------------------------------------------------
// on a dbus-daemon of the test's own

/** A session bus of the test's own that can activate nothing, as the run's on a person's display: `{bus, dir, done()}`. */
async function ownBus() {
  if (MISSING.length) assert.fail(`${MISSING.join(', ')} missing, which this run requires (CUA171_DBUS_TESTS=required)`);
  const dir = mkdtempSync(join(tmpdir(), 'cua171-a11y-stub-'));
  const bus = await startSessionBus({ dir, display: ':cua171-test-a11y-stub', serviceFile: null });
  return {
    bus,
    dir,
    async done() {
      await bus.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const busctl = (address, ...args) => spawnSync('busctl', [`--address=${address}`, '--json=short', ...args], { encoding: 'utf8', timeout: 10000 });
const dbusSend = (address, ...args) => spawnSync('dbus-send', [`--bus=${address}`, '--print-reply', '--dest=org.a11y.Bus', A11Y_PATH, ...args], { encoding: 'utf8', timeout: 10000 });
const daemonCall = (address, member, ...args) => JSON.parse(busctl(address, 'call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', member, ...args).stdout).data[0];

test("on the bus: GetAddress answers the injected value byte for byte, and both switches read true", onBus, async () => {
  const own = await ownBus();
  // a value with every separator an address may carry, and an escape, which must come back as it went
  const value = 'unix:path=/run/user/501/at-spi/bus_0,guid=0123456789abcdef0123456789abcdef;unix:abstract=/tmp/cua171-x%2cy';
  const stub = await startA11yStub({ address: own.bus.address, a11y: value });
  try {
    const got = busctl(own.bus.address, 'call', 'org.a11y.Bus', A11Y_PATH, 'org.a11y.Bus', 'GetAddress');
    assert.equal(got.status, 0, got.stderr);
    assert.deepEqual(JSON.parse(got.stdout), { type: 's', data: [value] });
    const raw = dbusSend(own.bus.address, 'org.a11y.Bus.GetAddress');
    assert.equal(raw.status, 0, raw.stderr);
    assert.equal(raw.stdout.match(/^ {3}string "(.*)"$/m)?.[1], value, 'a second client of its own reads the same bytes');
    for (const prop of ['IsEnabled', 'ScreenReaderEnabled']) {
      const read = busctl(own.bus.address, 'get-property', 'org.a11y.Bus', A11Y_PATH, 'org.a11y.Status', prop);
      assert.equal(read.status, 0, read.stderr);
      assert.deepEqual(JSON.parse(read.stdout), { type: 'b', data: true }, prop);
    }
    const all = busctl(own.bus.address, 'call', 'org.a11y.Bus', A11Y_PATH, 'org.freedesktop.DBus.Properties', 'GetAll', 's', 'org.a11y.Status');
    assert.equal(all.status, 0, all.stderr);
    assert.deepEqual(JSON.parse(all.stdout).data, [{ IsEnabled: { type: 'b', data: true }, ScreenReaderEnabled: { type: 'b', data: true } }]);
  } finally {
    await stub.stop();
    await own.done();
  }
});

test('on the bus: every Set and any other write is refused with a D-Bus error, and the switches still read true', onBus, async () => {
  const own = await ownBus();
  const stub = await startA11yStub({ address: own.bus.address, a11y: A11Y });
  try {
    const refused = (args, name) => {
      const r = dbusSend(own.bus.address, ...args);
      assert.notEqual(r.status, 0, args.join(' '));
      assert.match(r.stderr, new RegExp(`^Error ${name.replace(/\./g, '\\.')}: `), args.join(' '));
    };
    for (const prop of ['IsEnabled', 'ScreenReaderEnabled']) {
      for (const value of ['false', 'true']) refused(['org.freedesktop.DBus.Properties.Set', 'string:org.a11y.Status', `string:${prop}`, `variant:boolean:${value}`], 'org.freedesktop.DBus.Error.PropertyReadOnly');
    }
    refused(['org.freedesktop.DBus.Properties.Set', 'string:org.a11y.Bus', 'string:Address', 'variant:string:unix:path=/tmp/x'], 'org.freedesktop.DBus.Error.PropertyReadOnly');
    refused(['org.a11y.Status.SetEnabled', 'boolean:false'], 'org.freedesktop.DBus.Error.UnknownMethod');
    refused(['org.a11y.Bus.SetAddress', 'string:unix:path=/tmp/x'], 'org.freedesktop.DBus.Error.UnknownMethod');
    refused(['org.freedesktop.DBus.Introspectable.Introspect'], 'org.freedesktop.DBus.Error.UnknownMethod');
    const busctlSet = busctl(own.bus.address, 'set-property', 'org.a11y.Bus', A11Y_PATH, 'org.a11y.Status', 'IsEnabled', 'b', 'false');
    assert.notEqual(busctlSet.status, 0, 'busctl is refused too');
    for (const prop of ['IsEnabled', 'ScreenReaderEnabled']) assert.deepEqual(JSON.parse(busctl(own.bus.address, 'get-property', 'org.a11y.Bus', A11Y_PATH, 'org.a11y.Status', prop).stdout), { type: 'b', data: true });
    assert.equal(alive(stub.pid), true, 'and it still serves');
  } finally {
    await stub.stop();
    await own.done();
  }
});

test('on the bus: the stand-in owns org.a11y.Bus and nothing else, and nothing on the bus is activatable', onBus, async () => {
  const own = await ownBus();
  const stub = await startA11yStub({ address: own.bus.address, a11y: A11Y });
  try {
    const names = daemonCall(own.bus.address, 'ListNames');
    assert.deepEqual(names.filter((n) => !n.startsWith(':')).sort(), ['org.a11y.Bus', 'org.freedesktop.DBus']);
    assert.equal(daemonCall(own.bus.address, 'GetNameOwner', 's', 'org.a11y.Bus'), stub.unique);
    assert.equal(daemonCall(own.bus.address, 'GetConnectionUnixProcessID', 's', stub.unique), stub.pid);
    assert.deepEqual(daemonCall(own.bus.address, 'ListActivatableNames'), ['org.freedesktop.DBus']);
    // a second stand-in on the same bus cannot take the name, and is not left running
    await assert.rejects(startA11yStub({ address: own.bus.address, a11y: A11Y }), /stand-in for org\.a11y\.Bus did not start: org\.a11y\.Bus is owned already/);
    assert.equal(daemonCall(own.bus.address, 'GetNameOwner', 's', 'org.a11y.Bus'), stub.unique);
  } finally {
    await stub.stop();
    await own.done();
  }
});

test('on the bus: the stand-in sends nothing but its own Hello and RequestName and the replies to what it is asked: it forwards and activates nothing', onBus, async () => {
  const own = await ownBus();
  const monitor = spawn('dbus-monitor', ['--address', own.bus.address], { stdio: ['ignore', 'pipe', 'pipe'] });
  let seen = '';
  monitor.stdout.on('data', (d) => {
    seen += d;
  });
  let stub = null;
  try {
    for (let i = 0; i < 100 && !seen.includes('member=NameLost'); i++) await sleep(20);
    assert.match(seen, /member=NameLost/, 'the monitor is in place first');
    stub = await startA11yStub({ address: own.bus.address, a11y: A11Y });
    busctl(own.bus.address, 'call', 'org.a11y.Bus', A11Y_PATH, 'org.a11y.Bus', 'GetAddress');
    busctl(own.bus.address, 'get-property', 'org.a11y.Bus', A11Y_PATH, 'org.a11y.Status', 'IsEnabled');
    dbusSend(own.bus.address, 'org.freedesktop.DBus.Properties.Set', 'string:org.a11y.Status', 'string:IsEnabled', 'variant:boolean:false');
    await sleep(300);
  } finally {
    monitor.kill('SIGTERM');
    await stub?.stop();
    await own.done();
  }
  const lines = seen.split('\n').filter((line) => /^(method call|method return|error|signal) /.test(line));
  const mine = lines.filter((line) => line.includes(` sender=${stub.unique} `));
  const calls = mine.filter((line) => line.startsWith('method call'));
  assert.deepEqual(calls.map((line) => [line.match(/destination=(\S+)/)[1], line.match(/member=(\w+)/)[1]]), [['org.freedesktop.DBus', 'Hello'], ['org.freedesktop.DBus', 'RequestName']]);
  assert.equal(mine.filter((line) => line.startsWith('signal')).length, 0, 'no signal');
  const replies = mine.filter((line) => /^(method return|error) /.test(line));
  assert.equal(replies.length, 3, `one reply to each of the three calls:\n${mine.join('\n')}`);
  assert.equal(replies.filter((line) => line.includes('error_name=org.freedesktop.DBus.Error.PropertyReadOnly')).length, 1);
});

test('on the bus: the stand-in ends with the bus, on its own, and its stop ends it', onBus, async () => {
  const own = await ownBus();
  const stub = await startA11yStub({ address: own.bus.address, a11y: A11Y });
  assert.equal(alive(stub.pid), true);
  await own.bus.stop();
  for (let i = 0; i < 100 && alive(stub.pid); i++) await sleep(20);
  assert.equal(alive(stub.pid), false, 'gone once its bus is, with no signal of ours');
  assert.deepEqual(await stub.stop(), { terminated: false, killed: false }, 'nothing left to stop');
  await own.done();
  const again = await ownBus();
  const second = await startA11yStub({ address: again.bus.address, a11y: A11Y });
  try {
    assert.deepEqual(await second.stop({ graceMs: 2000 }), { terminated: true, killed: false });
    assert.equal(alive(second.pid), false);
    assert.equal(daemonCall(again.bus.address, 'NameHasOwner', 's', 'org.a11y.Bus'), false, 'the name is free again');
  } finally {
    await again.done();
  }
});

test("on the bus: a person's display's session starts the stand-in with its bus and stops it with it; one that cannot start leaves Qt's refusal, and the bus", onBus, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-a11y-session-'));
  try {
    const session = await startAppSession({ dir, display: ':cua171-test-a11y-stub', env: { PATH: process.env.PATH }, rootBus: () => A11Y });
    assert.equal(session.a11y, A11Y);
    assert.ok(session.stub?.pid > 0 && /^:1\.\d+$/.test(session.stub.unique), JSON.stringify(session.stub));
    assert.equal(daemonCall(session.address, 'GetNameOwner', 's', 'org.a11y.Bus'), session.stub.unique);
    const pids = [session.pid, session.stub.pid];
    const ended = await session.stop();
    assert.deepEqual(ended.stub, { terminated: true, killed: false });
    for (const pid of pids) assert.equal(alive(pid), false, String(pid));
    // a root value the stand-in will not serve: the run goes on, its applications on the bus, and Qt is refused
    const without = await startAppSession({ dir, display: ':cua171-test-a11y-stub', env: { PATH: process.env.PATH }, rootBus: () => 'unix:path=/a b' });
    assert.equal(without.stub, null);
    assert.match(without.stubRefusal, /not a plain D-Bus address/);
    assert.equal(daemonCall(without.address, 'NameHasOwner', 's', 'org.a11y.Bus'), false);
    assert.deepEqual((await without.stop()).stub, { refused: without.stubRefusal });
    assert.equal(alive(without.pid), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the stand-in is a node process of its own on the bus address, so the suite\'s cleanup check sees one left behind', () => {
  assert.equal(A11Y_STUB, join(REPO, 'scripts', 'linux-engine-diff', 'a11y-stub.mjs'));
  const calls = [];
  const fake = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    throw new Error('the test starts nothing');
  };
  return assert.rejects(startA11yStub({ address: 'unix:path=/tmp/cua171-suite-x/session/bus/dbus-1,guid=1', a11y: A11Y, spawn: fake }), /the test starts nothing/).then(() => {
    const [{ cmd, args, options }] = calls;
    assert.equal(cmd, process.execPath);
    assert.deepEqual(args, [A11Y_STUB, '--bus', 'unix:path=/tmp/cua171-suite-x/session/bus/dbus-1,guid=1', '--a11y', A11Y]);
    assert.equal(options.detached, true, 'a process group of its own, as the bus daemon is');
    assert.deepEqual(options.env, {}, 'it inherits nothing: no display, no session bus, no accessibility bus of anyone');
  });
});

// The design session's preference (task 48): the stand-in answers on a bus beside the person's, so its tests run in CI.
// ci-kit's `test` gate runs on hosted macOS, where there is no dbus-daemon; the `harness-dbus` gate runs them on Ubuntu
// with dbus installed and CUA171_DBUS_TESTS=required, where a missing tool fails them.
test("ci-kit's harness-dbus gate installs dbus and runs the stand-in's tests through the cleanup check, requiring the bus", () => {
  const config = readFileSync(join(REPO, '.github', 'ci-kit.yml'), 'utf8');
  const gate = config.match(/^ {2}- name: harness-dbus\n((?: {4}.*\n)+)/m)?.[1];
  assert.ok(gate, 'the harness-dbus gate');
  assert.match(gate, /^ {4}lane: hosted$/m, "GitHub's Ubuntu runner");
  assert.match(gate, /apt-get install -y --no-install-recommends dbus\b/);
  assert.match(gate, /CUA171_DBUS_TESTS=required node test\/linux-engine-diff\/suite-check\.mjs [^\n]*test\/linux-engine-diff\/a11y-stub\.test\.mjs/);
  assert.match(gate, /test\/linux-engine-diff\/leak-check\.test\.mjs/, 'the cleanup check catching a stand-in left behind runs there too');
});
