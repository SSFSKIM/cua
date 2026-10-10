#!/usr/bin/env node
// A same-user client of a host socket, for the relay peer check's tests (docs/doperpowers/specs/2026-10-09-maws-socket-
// peer-auth-design.md, Acceptance 7): it connects, at once sends a vendor `createTab` request (the bytes a refused peer
// must never have read), and writes what happened to <result file> as one JSON object when the host answers or closes
// the connection: {connected, replied, closed}. Started through `sh -c '(node relay-connector.mjs … &)'` it is an orphan
// (launchd's child), no descendant of the test or of any `cua serve`.
//
//   node test/helpers/relay-connector.mjs <socket> <result file>
import {writeFileSync} from 'node:fs';
import {connect} from 'node:net';
import {createPeer, frameDecoder} from '../../src/chrome/protocol.mjs';

const [socketPath, resultPath] = process.argv.slice(2);
const outcome = {connected: false, replied: false, closed: false};
const finish = () => { writeFileSync(resultPath, JSON.stringify(outcome)); process.exit(0); };
setTimeout(finish, 10_000).unref();

const socket = connect(socketPath);
const peer = createPeer({send: bytes => socket.write(bytes)});
const decode = frameDecoder();
socket.on('data', chunk => { for (const message of decode(chunk)) peer.receive(message); });
socket.on('error', () => {});
socket.once('close', () => { outcome.closed = true; finish(); });
socket.once('connect', () => {
  outcome.connected = true;
  peer.request('createTab', {session_id: 'relay-connector', turn_id: 't1'}).then(() => { outcome.replied = true; finish(); }, () => {});
});
