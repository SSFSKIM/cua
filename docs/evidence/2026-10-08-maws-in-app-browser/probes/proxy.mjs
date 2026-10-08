// M5 scratch: a byte-transparent proxy in front of a MAWS cua socket that records the method of every host -> MAWS
// debugger.sendCommand (method and session only; no params), to census what the vendor really sends.
import net from 'node:net';
import {writeFileSync, rmSync} from 'node:fs';
const [listen, target, out] = process.argv.slice(2);
rmSync(listen, {force: true});
const seen = [];
net.createServer(client => {
  const upstream = net.connect(target);
  let buf = Buffer.alloc(0);
  client.on('data', chunk => {
    upstream.write(chunk);
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const n = buf.readUInt32LE(0);
      if (buf.length < 4 + n) break;
      const msg = JSON.parse(buf.subarray(4, 4 + n).toString('utf8'));
      buf = buf.subarray(4 + n);
      if (msg.method === 'debugger.sendCommand') seen.push(`${msg.params?.method}${msg.params?.sessionId ? ' [child]' : ''}`);
      else if (msg.method) seen.push(`(${msg.method})`);
    }
    writeFileSync(out, JSON.stringify(seen));
  });
  upstream.on('data', d => client.write(d));
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
  client.on('error', () => {}); upstream.on('error', () => {});
}).listen(listen);
