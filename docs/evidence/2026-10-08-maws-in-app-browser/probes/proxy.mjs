// M5 probe: a byte-transparent proxy in front of a MAWS cua socket that records, for every host -> MAWS request, its
// primitive (and for debugger.sendCommand its CDP method), when it was sent, how long MAWS took and the error text of a
// refusal. Never params or results. Writes the list as JSON after every frame.
//
//   node proxy.mjs <listen socket> <MAWS session socket> <out.json>
import net from 'node:net';
import {writeFileSync, rmSync} from 'node:fs';
const [listen, target, out] = process.argv.slice(2);
rmSync(listen, {force: true});
const seen = [];
const frames = onFrame => {
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const n = buf.readUInt32LE(0);
      if (buf.length < 4 + n) break;
      onFrame(JSON.parse(buf.subarray(4, 4 + n).toString('utf8')));
      buf = buf.subarray(4 + n);
    }
  };
};
net.createServer(client => {
  const upstream = net.connect(target);
  const pending = new Map(); // request id -> its entry
  const t0 = Date.now();
  client.on('data', chunk => upstream.write(chunk));
  client.on('data', frames(msg => {
    if (!msg.method) return;
    const entry = {at: Date.now() - t0, call: msg.method === 'debugger.sendCommand' ? `${msg.params?.method}${msg.params?.sessionId ? ' [child]' : ''}` : `(${msg.method})`};
    seen.push(entry);
    if (msg.id !== undefined) pending.set(msg.id, entry);
  }));
  upstream.on('data', chunk => client.write(chunk));
  upstream.on('data', frames(msg => {
    const entry = msg.method ? null : pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    entry.ms = Date.now() - t0 - entry.at;
    if (msg.error) entry.error = String(msg.error.message ?? msg.error).slice(0, 120);
    writeFileSync(out, JSON.stringify(seen));
  }));
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
  client.on('error', () => {}); upstream.on('error', () => {});
}).listen(listen);
