// A stand-in session for #237's live check: connects to the engine socket given, sends its cursor label, and holds the
// connection open until killed. node holder.mjs <socket> <label>
import {createConnection} from 'node:net';

const [socket, label] = process.argv.slice(2);
const frame = body => {
  const bytes = Buffer.from(JSON.stringify(body), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([header, bytes]);
};
const connection = createConnection(socket, () => {
  connection.write(frame({jsonrpc: '2.0', id: 1, method: 'ping', params: {clientApiVersion: 'cua-engine-1'}}));
  connection.write(frame({jsonrpc: '2.0', id: 2, method: 'cursor', params: {label}}));
  process.stdout.write(`holding ${socket} as pid ${process.pid} (${label})\n`);
});
connection.on('data', () => {});
connection.on('close', () => process.exit(0));
