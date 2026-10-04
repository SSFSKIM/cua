#!/usr/bin/env node
// A stand-in for `cua-keychain broker` that exercises the server's side of the broker lifecycle (spawn, stdin
// configuration, ready handshake, bounded close). It is not evidence about the Swift helper, which `npm run
// test:helper` tests directly. FAKE_HELPER_MODE selects the behavior:
//   serve        answer the ready line, serve `list`/`read` from FAKE_HELPER_SECRETS on the socket, stop at stdin EOF
//   refuse       answer {"ready":false,"error":"endpoint_exists"} and exit 1
//   silent       never answer, ignore stdin EOF
//   stubborn     like serve, but ignore stdin EOF and SIGTERM (only SIGKILL stops it), leaving its socket behind
//   protocol-2   answer ready for protocol 2
// FAKE_HELPER_RECORD names a file that receives {argv, env, config} as JSON.
import net from 'node:net';
import {writeFileSync, rmSync} from 'node:fs';
import {createInterface} from 'node:readline';

const mode = process.env.FAKE_HELPER_MODE ?? 'serve';
const secrets = JSON.parse(process.env.FAKE_HELPER_SECRETS ?? '{}');
const keepAlive = setInterval(() => {}, 1 << 30);
if (mode === 'stubborn' || mode === 'silent') process.on('SIGTERM', () => {});

const lines = createInterface({input: process.stdin});
lines.once('line', line => {
  const config = JSON.parse(line);
  if (process.env.FAKE_HELPER_RECORD) writeFileSync(process.env.FAKE_HELPER_RECORD, JSON.stringify({argv: process.argv.slice(2), env: process.env, config}));
  if (mode === 'silent') return;
  if (mode === 'refuse') { process.stdout.write('{"error":"endpoint_exists","ready":false}\n'); process.exit(1); }
  const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4 || buffer.length < 4 + buffer.readUInt32BE(0)) return;
      const request = JSON.parse(buffer.subarray(4).toString('utf8'));
      const reply = request.token !== config.token ? {ok: false, error: 'unauthorized'}
        : request.op === 'list' ? {ok: true, labels: Object.keys(secrets).sort()}
        : request.label in secrets ? {ok: true, value: secrets[request.label]} : {ok: false, error: 'not_found'};
      const body = Buffer.from(JSON.stringify(reply));
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length);
      socket.end(Buffer.concat([header, body]));
    });
  });
  server.listen(config.socket, () => process.stdout.write(`{"protocol":${mode === 'protocol-2' ? 2 : 1},"ready":true}\n`));
  if (mode !== 'stubborn') process.stdin.on('end', () => { server.close(); rmSync(config.socket, {force: true}); clearInterval(keepAlive); process.exit(0); });
});
