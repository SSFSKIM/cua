// The run's stand-in for the accessibility bus launcher on a display a person uses (#171 M4, task 48; the design
// session's ruling, sminos 334). On such a display the run's applications are on a session bus of the run's that can
// activate nothing (task 47, session-bus.mjs `startAppSession`), and Qt 5.15 and 6.4 turn their AT-SPI bridge on only
// through that bus's `org.a11y.Bus` (a11y-status.mjs `QT_ON_PERSONS_DISPLAY`): with no such service, a Qt application
// puts no tree on the accessibility bus. This stand-in is that service and nothing more:
// - it owns `org.a11y.Bus` on the run's bus, and no other name;
// - `org.a11y.Bus.GetAddress` answers exactly the display's root `AT_SPI_BUS` property, the person's launcher's bus,
//   which the applications' toolkits and the engines already read from the display;
// - `org.a11y.Status` `IsEnabled` and `ScreenReaderEnabled` read true through `Properties.Get` and `GetAll`, and are
//   read-only: every `Set`, and any other call, is refused with a D-Bus error, so no switch of anyone's is changed;
// - it forwards nothing and activates nothing: the only calls it makes are its own `Hello` and `RequestName` to the bus
//   daemon; everything else it sends is the reply to a call it was sent;
// - it reaches no X display: it is given the root's value, and starts with an empty environment.
// Its lifetime is the run bus's: started with it (`startAppSession`), stopped with it, and ending by itself when the bus
// does (its connection closes). A process of its own, a group of its own as the bus daemon is, so the harness's own
// synchronous calls never stall the answers a starting Qt application waits for; its command line names the bus's
// address, under the run's scratch directory, which is how the suite's cleanup check sees one left behind.
//
// Run as `node a11y-stub.mjs --bus <run's session bus address> --a11y <the display's AT_SPI_BUS>`: it prints one line,
// `{"ready": true, "unique": …}` once it owns the name, or `{"error": …}` and exits nonzero.

import { spawn as spawnProcess } from 'node:child_process';
import { writeSync } from 'node:fs';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { MESSAGE, NO_REPLY_EXPECTED, authExternal, decodeMessage, encodeMessage, frameLength, socketPath } from './dbus-wire.mjs';

/** This file: the stand-in's program. */
export const A11Y_STUB = fileURLToPath(import.meta.url);

/** The launcher's object, as at-spi-bus-launcher serves it. */
export const A11Y_PATH = '/org/a11y/bus';

const NAME = 'org.a11y.Bus';
const BUS_IFACE = 'org.a11y.Bus';
const STATUS = 'org.a11y.Status';
const PROPERTIES = 'org.freedesktop.DBus.Properties';
const SWITCHES = ['IsEnabled', 'ScreenReaderEnabled'];
const DBUS = { destination: 'org.freedesktop.DBus', path: '/org/freedesktop/DBus', interface: 'org.freedesktop.DBus' };
/** RequestName's flag: fail rather than queue for a name another owns. */
const DO_NOT_QUEUE = 4;

/**
 * Why `value` is not served as the accessibility bus's address, or null when it is: it must be a plain D-Bus address,
 * printable ASCII with no space, quote or backslash (a real address escapes every other byte as `%xx`), so a value the
 * root property's reading could have escaped or cut is never handed to Qt as if it were the person's bus.
 */
export function addressRefusal(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]*:[\x21-\x7e]*$/.test(value) || /["\\]/.test(value)) {
    return `${JSON.stringify(value)} is not a plain D-Bus address (printable ASCII, no space, quote or backslash, a transport first)`;
  }
  return null;
}

const error = (name, text) => ({ type: MESSAGE.ERROR, errorName: `org.freedesktop.DBus.Error.${name}`, signature: 's', body: [text] });
const reply = (signature, body) => ({ type: MESSAGE.RETURN, signature, body });

/**
 * What the stand-in answers a message with: a reply or an error (`{type, signature, body, errorName?}`), or null for
 * a message that gets none (a signal, a reply, a call that wants no reply). `a11y`: the address GetAddress answers.
 */
export function answer(m, a11y) {
  if (m.type !== MESSAGE.CALL || m.flags & NO_REPLY_EXPECTED) return null;
  const is = (iface, member) => (m.interface === iface || m.interface === undefined) && m.member === member;
  const named = `${m.interface ?? '(no interface)'}.${m.member}`;
  if (m.path !== A11Y_PATH) return error('UnknownObject', `no object ${m.path} here: the run's stand-in for org.a11y.Bus serves ${A11Y_PATH} alone`);
  if (is(BUS_IFACE, 'GetAddress')) {
    if (m.signature !== '') return error('InvalidArgs', `GetAddress takes no arguments, not ${m.signature}`);
    return reply('s', [a11y]);
  }
  if (is(PROPERTIES, 'Set')) return error('PropertyReadOnly', `the run's stand-in for org.a11y.Bus changes no property: org.a11y.Status reads IsEnabled and ScreenReaderEnabled true, read-only`);
  if (is(PROPERTIES, 'Get')) {
    if (m.signature !== 'ss' || !m.body) return error('InvalidArgs', `Get takes (ss), not ${m.signature}`);
    const [iface, prop] = m.body;
    if (iface === STATUS && SWITCHES.includes(prop)) return reply('v', [['b', true]]);
    if (iface === STATUS || iface === BUS_IFACE) return error('UnknownProperty', `${iface} has no property ${prop} here`);
    return error('UnknownInterface', `no interface ${iface} here`);
  }
  if (is(PROPERTIES, 'GetAll')) {
    if (m.signature !== 's' || !m.body) return error('InvalidArgs', `GetAll takes (s), not ${m.signature}`);
    const [iface] = m.body;
    if (iface === STATUS) return reply('a{sv}', [SWITCHES.map((prop) => [prop, ['b', true]])]);
    if (iface === BUS_IFACE) return reply('a{sv}', [[]]);
    return error('UnknownInterface', `no interface ${iface} here`);
  }
  return error('UnknownMethod', `the run's stand-in for org.a11y.Bus answers GetAddress and reads of org.a11y.Status alone; ${named} is refused`);
}

/**
 * Starts the stand-in on the run's session bus at `address`, answering `a11y` (the display's root `AT_SPI_BUS`), as a
 * process group of its own with an empty environment. Resolves with `{pid, unique, stop()}` once it owns the name;
 * rejects, the process ended, when it cannot (`a11y` not plain, the name owned already, the bus unreachable) or does not
 * say so within `readyMs`. `stop` ends its group (SIGTERM, then SIGKILL after `graceMs`) and answers `{terminated,
 * killed}`. `spawn` and `kill` are the display-free tests' own.
 */
export async function startA11yStub({ address, a11y, spawn = spawnProcess, kill = (pid, signal) => process.kill(pid, signal), readyMs = 5000 }) {
  const why = addressRefusal(a11y);
  if (why) throw new Error(`the run's stand-in for org.a11y.Bus was not started: ${why}`);
  // not X-facing: it is given the root's value, and inherits nothing, no display or bus of anyone's (xspawn.mjs)
  const child = spawn(process.execPath, [A11Y_STUB, '--bus', address, '--a11y', a11y], { stdio: ['ignore', 'pipe', 'ignore'], env: {}, detached: true });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const group = (signal) => {
    try {
      kill(-child.pid, signal);
      return true;
    } catch {
      return false;
    }
  };
  const ready = await new Promise((resolve, reject) => {
    let text = '';
    let settled = false;
    const done = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        if (child.pid) group('SIGKILL');
        reject(err);
      } else resolve(value);
    };
    const timer = setTimeout(() => done(new Error(`the run's stand-in for org.a11y.Bus did not start: it did not own the name in ${readyMs} ms`)), readyMs);
    child.on('error', (e) => done(new Error(`the run's stand-in for org.a11y.Bus did not start: ${e.message}`)));
    child.stdout.on('data', (d) => {
      text += d;
      const line = text.split('\n')[0];
      if (!text.includes('\n')) return;
      let said;
      try {
        said = JSON.parse(line);
      } catch {
        said = { error: `it said ${JSON.stringify(line)}` };
      }
      if (said.ready === true && typeof said.unique === 'string') done(null, said);
      else done(new Error(`the run's stand-in for org.a11y.Bus did not start: ${said.error ?? JSON.stringify(said)}`));
    });
    exited.then(({ code, signal }) => done(new Error(`the run's stand-in for org.a11y.Bus did not start: it exited (${signal ?? code})${text.trim() ? `: ${text.trim()}` : ''}`)));
  });
  // it says nothing more; the harness is never held open by it
  child.stdout.destroy();
  child.unref?.();
  let stopped = null;
  return {
    pid: child.pid,
    unique: ready.unique,
    stop({ graceMs = 5000 } = {}) {
      stopped ??= (async () => {
        const terminated = group('SIGTERM');
        if (!terminated) return { terminated, killed: false };
        const gone = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), graceMs))]);
        return { terminated, killed: !gone && group('SIGKILL') };
      })();
      return stopped;
    },
  };
}

/** The stand-in itself: on the bus, owning the name, answering until the bus is gone. */
async function serve({ bus, a11y }) {
  // written at once, so a line said just before an exit is never lost (a pipe's stream write may still be queued)
  const say = (line) => writeSync(1, `${JSON.stringify(line)}\n`);
  const fail = (text) => {
    say({ error: text });
    process.exit(1);
  };
  const why = addressRefusal(a11y);
  if (why) fail(why);
  let path;
  try {
    path = socketPath(bus);
  } catch (e) {
    fail(e.message);
  }
  let serial = 0;
  let unique = null;
  let owned = false;
  const socket = createConnection(path);
  const send = (m) => socket.write(encodeMessage({ ...m, serial: ++serial }));
  let authenticated = false;
  let pending = Buffer.alloc(0);
  const onMessage = (m) => {
    if (m.type === MESSAGE.RETURN || m.type === MESSAGE.ERROR) {
      if (m.replySerial === 1) {
        if (m.type === MESSAGE.ERROR) fail(`the bus refused Hello: ${m.errorName}`);
        unique = m.body?.[0];
      } else if (m.replySerial === 2) {
        if (m.type === MESSAGE.ERROR) fail(`the bus refused RequestName: ${m.errorName}: ${m.body?.[0] ?? ''}`);
        if (m.body?.[0] !== 1) fail(`org.a11y.Bus is owned already on the run's session bus (RequestName answered ${m.body?.[0]})`);
        owned = true;
        say({ ready: true, unique, name: NAME });
      }
      return;
    }
    if (m.type === MESSAGE.SIGNAL) {
      // the bus daemon's word that the name was taken from it, which DO_NOT_QUEUE and no replacement make impossible
      if (owned && m.sender === DBUS.destination && m.member === 'NameLost' && m.body?.[0] === NAME) process.exit(1);
      return;
    }
    const r = answer(m, a11y);
    if (r) send({ ...r, replySerial: m.serial, destination: m.sender });
  };
  socket.on('connect', () => socket.write(authExternal()));
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (!authenticated) {
      const end = pending.indexOf('\r\n');
      if (end < 0) return;
      const line = pending.subarray(0, end).toString('latin1');
      pending = pending.subarray(end + 2);
      if (!/^OK [0-9a-f]+$/.test(line)) fail(`the bus refused EXTERNAL authentication: ${line}`);
      authenticated = true;
      socket.write('BEGIN\r\n');
      send({ type: MESSAGE.CALL, ...DBUS, member: 'Hello' });
      send({ type: MESSAGE.CALL, ...DBUS, member: 'RequestName', signature: 'su', body: [NAME, DO_NOT_QUEUE] });
    }
    for (;;) {
      let length;
      try {
        length = frameLength(pending);
      } catch (e) {
        fail(`the bus sent what is not D-Bus: ${e.message}`);
      }
      if (length === null || pending.length < length) return;
      const frame = pending.subarray(0, length);
      pending = pending.subarray(length);
      let m;
      try {
        m = decodeMessage(frame);
      } catch {
        // a header this codec cannot read: nobody to answer
        continue;
      }
      onMessage(m);
    }
  });
  socket.on('error', (e) => {
    if (!owned) fail(`the run's session bus could not be reached: ${e.message}`);
  });
  // the bus is gone: so is the stand-in
  socket.on('close', () => process.exit(owned ? 0 : 1));
}

if (process.argv[1] === A11Y_STUB) {
  const { values } = parseArgs({ options: { bus: { type: 'string' }, a11y: { type: 'string' } } });
  if (!values.bus || values.a11y === undefined) {
    writeSync(1, `${JSON.stringify({ error: 'usage: a11y-stub.mjs --bus <session bus address> --a11y <accessibility bus address>' })}\n`);
    process.exit(2);
  }
  await serve(values);
}
