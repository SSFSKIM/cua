// A D-Bus client of the harness's own, one connection kept open (#171 M4, T8): the settle experiment reads an effect the
// tree hides (a caret, a selection, a field's text where the tree carries none) the moment the next request would
// reach the engine, and `busctl`, which the Oracle (oracle.mjs) spawns for every call, starts its call about 5 ms
// later idle and more under load, which would give the application that long again. The wire is dbus-wire.mjs's:
// EXTERNAL authentication, Hello, then method calls, any number in flight, each reply matched by its serial. It is only
// ever pointed at the run's accessibility bus and at windows the harness opened.

import { createConnection } from 'node:net';

import { MESSAGE, authExternal, decodeMessage, encodeMessage, frameLength, socketPath } from './dbus-wire.mjs';
import { splitNodeId } from './matrix-judge.mjs';

const DBUS = { destination: 'org.freedesktop.DBus', path: '/org/freedesktop/DBus', interface: 'org.freedesktop.DBus' };

/**
 * One connection to the bus at `address` (a `unix:path=` address), authenticated and said Hello to; `call` sends a
 * method call and resolves with the reply's body, or rejects with the error's name and message. `timeoutMs` bounds
 * each call. `close` ends the connection and fails what is pending.
 */
export async function connectBus(address, { timeoutMs = 5000 } = {}) {
  const socket = createConnection(socketPath(address));
  let serial = 0;
  let pending = Buffer.alloc(0);
  let authenticated = false;
  let closed = null;
  const waiting = new Map();
  const fail = (error) => {
    if (closed) return;
    closed = error;
    for (const { reject, timer } of waiting.values()) {
      clearTimeout(timer);
      reject(error);
    }
    waiting.clear();
  };
  const send = (m) => {
    if (closed) return Promise.reject(closed);
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`${m.interface}.${m.member} on ${m.destination}${m.path} took more than ${timeoutMs} ms`));
      }, timeoutMs);
      waiting.set(id, { resolve, reject, timer });
      socket.write(encodeMessage({ type: MESSAGE.CALL, ...m, serial: id }));
    });
  };
  const onFrame = (m) => {
    if (m.type !== MESSAGE.RETURN && m.type !== MESSAGE.ERROR) return;
    const waiter = waiting.get(m.replySerial);
    if (!waiter) return;
    waiting.delete(m.replySerial);
    clearTimeout(waiter.timer);
    if (m.type === MESSAGE.ERROR) waiter.reject(new Error(`${m.errorName}${typeof m.body?.[0] === 'string' ? `: ${m.body[0]}` : ''}`));
    else if (m.body === null) waiter.reject(new Error('a reply whose body this client cannot read'));
    else waiter.resolve(m.body);
  };
  const ready = new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.on('connect', () => socket.write(authExternal()));
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (!authenticated) {
        const end = pending.indexOf('\r\n');
        if (end < 0) return;
        const line = pending.subarray(0, end).toString('latin1');
        pending = pending.subarray(end + 2);
        if (!/^OK [0-9a-f]+$/.test(line)) {
          reject(new Error(`the bus refused EXTERNAL authentication: ${line}`));
          socket.destroy();
          return;
        }
        authenticated = true;
        socket.write('BEGIN\r\n');
        send({ ...DBUS, member: 'Hello' }).then(resolve, reject);
      }
      for (;;) {
        const length = frameLength(pending);
        if (length === null || pending.length < length) return;
        const frame = pending.subarray(0, length);
        pending = pending.subarray(length);
        let m;
        try {
          m = decodeMessage(frame);
        } catch {
          continue;
        }
        onFrame(m);
      }
    });
  });
  socket.on('close', () => fail(new Error('the bus connection closed')));
  socket.on('error', (e) => fail(new Error(`the bus connection failed: ${e.message}`)));
  await ready;
  return {
    call: (destination, path, iface, member, signature = '', body = []) => send({ destination, path, interface: iface, member, ...(signature ? { signature, body } : {}) }),
    close: () => {
      socket.destroy();
      fail(new Error('the bus connection was closed'));
    },
  };
}

const TEXT = 'org.a11y.atspi.Text';

/**
 * The AT-SPI reads the settle experiment needs, on one kept connection (`connectBus`): a node's text, caret, first
 * selection, state bits and the Value interface's current value, each one call (two for the selection), node ids as the
 * engines give them (`<bus>:<path>`).
 */
export class AsyncOracle {
  constructor(bus) {
    this.bus = bus;
  }

  static async open(address) {
    return new AsyncOracle(await connectBus(address));
  }

  on(id, iface, member, signature, ...body) {
    const at = splitNodeId(id);
    if (!at) return Promise.reject(new Error(`${id} is not an AT-SPI node`));
    return this.bus.call(at.bus, at.path, iface, member, signature, body);
  }

  /** A property's value (dbus-wire reads the variant `Get` answers as `[signature, value]`). */
  async prop(id, iface, name) {
    const [[, value]] = await this.on(id, 'org.freedesktop.DBus.Properties', 'Get', 'ss', iface, name);
    return value;
  }

  async text(id) {
    return (await this.on(id, TEXT, 'GetText', 'ii', 0, -1))[0];
  }

  caret(id) {
    return this.prop(id, TEXT, 'CaretOffset');
  }

  /** The first selection's `[start, end]`, or null when there is none. */
  async selection(id) {
    const [n] = await this.on(id, TEXT, 'GetNSelections', '');
    if (n < 1) return null;
    const [start, end] = await this.on(id, TEXT, 'GetSelection', 'i', 0);
    return [start, end];
  }

  /** The state set's two words. */
  async states(id) {
    return (await this.on(id, 'org.a11y.atspi.Accessible', 'GetState', ''))[0];
  }

  currentValue(id) {
    return this.prop(id, 'org.a11y.atspi.Value', 'CurrentValue');
  }

  close() {
    this.bus.close();
  }
}
