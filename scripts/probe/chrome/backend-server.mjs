// An owned CUA browser-backend Unix socket for the M7 spike: length-prefixed JSON-RPC (src/chrome/protocol.mjs) in
// front of an adapter's handleRequest, with every frame recorded as metadata (method, id, error code/message, parameter
// shape).
// Only synthetic data crosses it; the capture still keeps shapes, not arbitrary values.
import {createServer} from 'node:net';
import {rmSync} from 'node:fs';
import {encodeFrame, frameDecoder} from '../../../src/chrome/protocol.mjs';

// Literal values worth keeping in a shape: protocol vocabulary and synthetic ids, never free text.
const KEEP = new Set(['method', 'session_context', 'reason', 'type', 'jsonrpc', 'tabId', 'sessionId', 'targetId', 'status', 'family', 'name']);

export function shape(value, key) {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, k)]));
  if (KEEP.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) return value;
  return value === null ? 'null' : typeof value;
}

export function startBackend({socketPath, adapter, label}) {
  rmSync(socketPath, {force: true});
  const frames = [];
  const sockets = new Set();
  const record = (direction, message) => frames.push({
    backend: label, direction,
    ...(message.id !== undefined ? {id: message.id} : {}),
    ...(message.method !== undefined ? {method: message.method} : {}),
    ...(message.params !== undefined ? {params: shape(message.params)} : {}),
    ...('result' in message ? {result: shape(message.result)} : {}),
    ...(message.error ? {error: {code: message.error.code, message: message.error.message}} : {}),
    ...(message.jsonrpc !== undefined ? {jsonrpc: message.jsonrpc} : {}),
  });
  const write = (socket, message) => { record('backend->client', message); socket.write(encodeFrame(message)); };

  const server = createServer(socket => {
    sockets.add(socket);
    const push = frameDecoder();
    socket.on('data', async chunk => {
      let messages;
      try { messages = push(chunk); } catch (error) { frames.push({backend: label, direction: 'client->backend', decodeError: error.message}); socket.destroy(); return; }
      for (const message of messages) {
        record('client->backend', message);
        if (message.id === undefined) continue;                 // client notification
        try {
          write(socket, {jsonrpc: '2.0', id: message.id, result: await adapter.handleRequest(message.method, message.params)});
        } catch (error) {
          write(socket, {jsonrpc: '2.0', id: message.id, error: {code: error.code ?? 1, message: error.message}});
        }
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => resolve({
      frames,
      connections: () => sockets.size,
      notify(method, params) { for (const socket of sockets) write(socket, {jsonrpc: '2.0', method, params}); },
      async close() {
        for (const socket of sockets) socket.destroy();
        await new Promise(r => server.close(r));
        rmSync(socketPath, {force: true});
      },
    }));
  });
}
