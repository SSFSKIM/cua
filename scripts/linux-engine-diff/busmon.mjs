// Accessibility-bus call counts (Design, Verification system): `dbus-monitor --address <a11y bus> --monitor` for a
// pass, and the method calls of the connections that appeared during it (a connection says Hello first, and the
// pass starts before the engine connects), so applications' and the registry's own calls are not counted. For each
// connection: the calls by member, the most in flight, and how many were issued with nothing else outstanding (the
// calls awaited one after another).

import { spawn } from 'node:child_process';
import { once } from 'node:events';

const TYPES = ['method call', 'method return', 'error', 'signal'];

export function parseMonitor(text) {
  const messages = [];
  for (const line of text.split('\n')) {
    const type = TYPES.find((t) => line.startsWith(`${t} `));
    if (!type) continue;
    const message = { type };
    for (const [, key, value] of line.slice(type.length).matchAll(/(\w+)=([^\s;]+)/g)) {
      message[key] = ['serial', 'reply_serial'].includes(key) ? Number(value) : value;
    }
    messages.push(message);
  }
  return messages;
}

/** `names`: connections known to be the engine's from an earlier pass (a persistent connection says Hello once). */
export function attributeCalls(messages, { names = [] } = {}) {
  const fresh = new Set(names);
  for (const m of messages) {
    if (m.type === 'method call' && m.member === 'Hello') fresh.add(m.sender);
  }
  const by = {};
  const outstanding = new Map();
  for (const m of messages) {
    if (m.type === 'method call' && fresh.has(m.sender)) {
      const c = (by[m.sender] ??= { calls: 0, by_member: {}, max_in_flight: 0, serial_calls: 0 });
      const open = outstanding.get(m.sender) ?? new Set();
      outstanding.set(m.sender, open);
      if (open.size === 0) c.serial_calls += 1;
      open.add(m.serial);
      c.calls += 1;
      c.by_member[m.member] = (c.by_member[m.member] ?? 0) + 1;
      c.max_in_flight = Math.max(c.max_in_flight, open.size);
    } else if ((m.type === 'method return' || m.type === 'error') && outstanding.has(m.destination)) {
      outstanding.get(m.destination).delete(m.reply_serial);
    }
  }
  const total = { calls: 0, connections: 0, serial_calls: 0, max_in_flight: 0, by_member: {}, by_connection: by };
  for (const c of Object.values(by)) {
    total.calls += c.calls;
    total.connections += 1;
    total.serial_calls += c.serial_calls;
    total.max_in_flight = Math.max(total.max_in_flight, c.max_in_flight);
    for (const [member, n] of Object.entries(c.by_member)) total.by_member[member] = (total.by_member[member] ?? 0) + n;
  }
  return total;
}

/** Starts a monitor on the bus; `stop()` returns the attributed calls of the pass. */
export async function startMonitor(address) {
  const child = spawn('dbus-monitor', ['--address', address, '--monitor'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    text += chunk;
  });
  // The monitor is live once the bus has told it its name.
  const deadline = Date.now() + 5000;
  while (!text.includes('member=NameAcquired')) {
    if (Date.now() > deadline) throw new Error('dbus-monitor did not start');
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 100));
  return {
    async stop({ names = [] } = {}) {
      await new Promise((r) => setTimeout(r, 150));
      child.kill('SIGINT');
      await once(child, 'exit');
      return attributeCalls(parseMonitor(text), { names });
    },
  };
}
