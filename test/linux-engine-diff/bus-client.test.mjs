// The harness's kept D-Bus connection (scripts/linux-engine-diff/bus-client.mjs), against a fake bus on a temporary
// unix socket that speaks dbus-wire.mjs's wire: authentication and Hello, replies matched by serial whatever their
// order, errors, a closed connection, and the AT-SPI reads the settle experiment makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AsyncOracle, connectBus } from '../../scripts/linux-engine-diff/bus-client.mjs';
import { MESSAGE, decodeMessage, encodeMessage, frameLength } from '../../scripts/linux-engine-diff/dbus-wire.mjs';

/**
 * A fake bus: `answer(m)` gives each call's reply (`{signature, body}`, `{error, message}`, `'hold'` to answer it only
 * when the next call has been answered, or null for none). Records every call.
 */
async function fakeBus(t, answer, { auth = 'OK 0123456789abcdef' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-bus-'));
  const path = join(dir, 'bus');
  const calls = [];
  const sockets = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    let pending = Buffer.alloc(0);
    let begun = false;
    let held = null;
    let serial = 100;
    const reply = (m, r) => {
      if (r.error) socket.write(encodeMessage({ type: MESSAGE.ERROR, serial: ++serial, replySerial: m.serial, errorName: r.error, signature: 's', body: [r.message ?? ''] }));
      else socket.write(encodeMessage({ type: MESSAGE.RETURN, serial: ++serial, replySerial: m.serial, ...(r.signature ? { signature: r.signature, body: r.body } : {}) }));
    };
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (!begun) {
        const auth1 = pending.indexOf('\r\n');
        if (auth1 < 0) return;
        if (pending[0] !== 0 || !pending.subarray(1, auth1).toString('latin1').startsWith('AUTH EXTERNAL ')) throw new Error('no EXTERNAL authentication');
        socket.write(`${auth}\r\n`);
        const begin = pending.indexOf('BEGIN\r\n', auth1);
        if (begin < 0) {
          pending = pending.subarray(auth1 + 2);
          begun = 'authenticated';
          return;
        }
      }
      if (begun !== true) {
        const begin = pending.indexOf('BEGIN\r\n');
        if (begin < 0) return;
        pending = pending.subarray(begin + 7);
        begun = true;
      }
      for (;;) {
        const length = frameLength(pending);
        if (length === null || pending.length < length) return;
        const m = decodeMessage(pending.subarray(0, length));
        pending = pending.subarray(length);
        calls.push(m);
        if (m.member === 'Hello') {
          reply(m, { signature: 's', body: [':1.42'] });
          continue;
        }
        const r = answer(m);
        if (r === 'hold') held = m;
        else if (r) {
          reply(m, r);
          if (held) {
            reply(held, answer({ ...held, released: true }));
            held = null;
          }
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(path, resolve));
  t.after(() => {
    for (const s of sockets) s.destroy();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { address: `unix:path=${path},guid=0123`, calls, sockets };
}

test('a call is authenticated, said Hello to first, and answered with its reply\'s body', async (t) => {
  const bus = await fakeBus(t, (m) => (m.member === 'GetText' ? { signature: 's', body: [`text of ${m.path}`] } : null));
  const client = await connectBus(bus.address);
  t.after(() => client.close());
  assert.deepEqual(await client.call(':1.5', '/org/a11y/atspi/accessible/7', 'org.a11y.atspi.Text', 'GetText', 'ii', [0, -1]), ['text of /org/a11y/atspi/accessible/7']);
  assert.deepEqual(bus.calls.map((m) => m.member), ['Hello', 'GetText']);
  assert.deepEqual(bus.calls[1].body, [0, -1]);
  assert.equal(bus.calls[1].destination, ':1.5');
});

test('replies are matched by serial, whatever order they come in', async (t) => {
  const bus = await fakeBus(t, (m) => (m.path.endsWith('/1') && !m.released ? 'hold' : { signature: 's', body: [m.path] }));
  const client = await connectBus(bus.address);
  t.after(() => client.close());
  const first = client.call(':1.5', '/n/1', 'org.a11y.atspi.Text', 'GetText', 'ii', [0, -1]);
  const second = client.call(':1.5', '/n/2', 'org.a11y.atspi.Text', 'GetText', 'ii', [0, -1]);
  assert.deepEqual(await second, ['/n/2']);
  assert.deepEqual(await first, ['/n/1'], 'the held reply, sent after the second one, settles the first call');
});

test('an error reply rejects with its name and message; a refused authentication rejects the connection', async (t) => {
  const bus = await fakeBus(t, () => ({ error: 'org.freedesktop.DBus.Error.UnknownObject', message: 'no such object' }));
  const client = await connectBus(bus.address);
  t.after(() => client.close());
  await assert.rejects(client.call(':1.5', '/x', 'org.a11y.atspi.Text', 'GetText', 'ii', [0, -1]), { message: 'org.freedesktop.DBus.Error.UnknownObject: no such object' });
  const refused = await fakeBus(t, () => null, { auth: 'REJECTED EXTERNAL' });
  await assert.rejects(connectBus(refused.address), { message: 'the bus refused EXTERNAL authentication: REJECTED EXTERNAL' });
});

test('a call with no reply times out; a closed connection fails what is pending and every later call', async (t) => {
  const bus = await fakeBus(t, () => null);
  const client = await connectBus(bus.address, { timeoutMs: 50 });
  await assert.rejects(client.call(':1.5', '/x', 'org.a11y.atspi.Text', 'GetText', 'ii', [0, -1]), { message: /took more than 50 ms$/ });
  const pending = client.call(':1.5', '/y', 'org.a11y.atspi.Text', 'GetText', 'ii', [0, -1]);
  for (const s of bus.sockets) s.destroy();
  await assert.rejects(pending, { message: /^the bus connection (closed|failed)/ });
  await assert.rejects(client.call(':1.5', '/z', 'org.a11y.atspi.Text', 'GetText', 'ii', [0, -1]), { message: /^the bus connection (closed|failed)/ });
});

/** A bus that accepts the connection and then `behaviour(socket)`: it never authenticates. */
async function silentBus(t, behaviour) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-bus-'));
  const path = join(dir, 'bus');
  const sockets = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    behaviour(socket);
  });
  await new Promise((resolve) => server.listen(path, resolve));
  t.after(() => {
    for (const s of sockets) s.destroy();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return `unix:path=${path},guid=0123`;
}

test('a bus that closes during authentication rejects the connection, and one that never answers it rejects within the bound (the review\'s finding 7)', async (t) => {
  // closed once the client's AUTH line has come, before any answer
  const closing = await silentBus(t, (socket) => socket.once('data', () => socket.destroy()));
  await assert.rejects(connectBus(closing, { timeoutMs: 2000 }), { message: /^the bus connection closed before it was ready/ });
  const mute = await silentBus(t, () => {});
  const started = performance.now();
  await assert.rejects(connectBus(mute, { timeoutMs: 80 }), { message: /^the bus did not finish authentication and Hello within 80 ms/ });
  assert.ok(performance.now() - started < 1000, 'bounded by the call bound');
  // after its OK, a bus that closes before Hello is answered
  const half = await silentBus(t, (socket) => socket.once('data', () => {
    socket.write('OK 0123456789abcdef\r\n');
    socket.once('data', () => socket.destroy());
  }));
  await assert.rejects(connectBus(half, { timeoutMs: 2000 }), { message: /^the bus connection (closed|failed)/ });
});

test('the AT-SPI reads: text, caret through the Text property, the first selection or none, states, the current value', async (t) => {
  let selections = 1;
  const bus = await fakeBus(t, (m) => {
    if (m.member === 'GetText') return { signature: 's', body: ['hello'] };
    if (m.member === 'Get' && m.body[1] === 'CaretOffset') return { signature: 'v', body: [['i', 3]] };
    if (m.member === 'Get' && m.body[1] === 'CurrentValue') return { signature: 'v', body: [['d', 42.5]] };
    if (m.member === 'GetNSelections') return { signature: 'i', body: [selections] };
    if (m.member === 'GetSelection') return { signature: 'ii', body: [1, 4] };
    if (m.member === 'GetState') return { signature: 'au', body: [[0x1000, 0x2]] };
    return null;
  });
  const oracle = await AsyncOracle.open(bus.address);
  t.after(() => oracle.close());
  const id = ':1.9:/org/a11y/atspi/accessible/12';
  assert.equal(await oracle.text(id), 'hello');
  assert.equal(await oracle.caret(id), 3);
  assert.deepEqual(await oracle.selection(id), [1, 4]);
  selections = 0;
  assert.equal(await oracle.selection(id), null);
  assert.deepEqual(await oracle.states(id), [0x1000, 0x2]);
  assert.equal(await oracle.currentValue(id), 42.5);
  const get = bus.calls.find((m) => m.member === 'Get');
  assert.deepEqual([get.destination, get.path, get.interface, get.body], [':1.9', '/org/a11y/atspi/accessible/12', 'org.freedesktop.DBus.Properties', ['org.a11y.atspi.Text', 'CaretOffset']]);
  await assert.rejects(oracle.text('not-a-node'), { message: 'not-a-node is not an AT-SPI node' });
});
