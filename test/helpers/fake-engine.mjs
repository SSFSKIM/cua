// A fake cua engine for the spike service's tests (scripts/spike/engine/client.mjs, service.mjs, serve.mjs): a Unix
// socket server speaking the engine's wire (a 4-byte little-endian length, then UTF-8 JSON-RPC 2.0; Interfaces,
// EngineProtocol), answering from per-method handlers and recording what it was sent. No app is observed or driven.
// `nativePipe()` is a stand-in for the trusted worker's `nodeRepl.nativePipe` over node:net, shaped as
// src/repl-host/privileged-node-repl.mjs exposes it (createConnection → {write, on, off, end}).
import {createConnection, createServer} from 'node:net';
import {rmSync} from 'node:fs';

export const API_VERSION = 'cua-engine-1';

export function frame(body) {
  const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([header, bytes]);
}

// An engine error a handler throws: {code, message, errorName, ...extra} on the wire.
export class EngineFailure extends Error {
  constructor(code, message, errorName, extra = {}) {
    super(message);
    Object.assign(this, {code, errorName, extra});
  }
}

// Each fake server represents a distinct process, including replacements in the same Node test process.
let nextPid = 10_000;

// Starts the fake on `path`. `handlers[method](params, {socket, request})` returns the result (or a promise of it) or
// throws EngineFailure; `execute` is dispatched on params.method to `handlers['execute:<method>']` when present.
// Defaults: ping answers {serverApiVersion, engineVersion, build} from `identity`.
export async function startFakeEngine(t, path, {identity = {engineVersion: '0.1.0', build: 'b1'}, pid = nextPid++, handlers = {}} = {}) {
  const received = [];
  const sockets = new Set();
  const all = {
    ping: () => ({serverApiVersion: API_VERSION, ...identity}),
    status: () => ({...identity, pid, accessibility: true, screenRecording: true, inputMonitoring: true,
      canPostHid: true, socket: path, bundlePath: '/Applications/Fake Engine.app', connections: sockets.size - 1,
      routes: {}, routeAdvice: []}),
    ...handlers,
  };
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buffer = Buffer.alloc(0);
    socket.on('data', async chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (buffer.length < 4 + length) break;
        const request = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
        buffer = buffer.subarray(4 + length);
        received.push({...request, at: performance.now()});
        const key = request.method === 'execute' && all[`execute:${request.params?.method}`] ? `execute:${request.params.method}` : request.method;
        const handler = all[key];
        let reply;
        try {
          if (!handler) throw new EngineFailure(-32601, `Method not found: ${key}`, 'methodNotFound');
          const result = await handler(request.params ?? {}, {socket, request});
          if (result === NO_REPLY) continue;
          reply = {jsonrpc: '2.0', id: request.id, result: result ?? {}};
        } catch (error) {
          if (!(error instanceof EngineFailure)) throw error;
          reply = {jsonrpc: '2.0', id: request.id, error: {...error.extra, code: error.code, message: error.message, errorName: error.errorName}};
        }
        if (!socket.destroyed) socket.write(frame(reply));
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
  const stop = () => new Promise(resolve => {
    for (const socket of sockets) socket.destroy();
    server.close(() => resolve());
    rmSync(path, {force: true});
  });
  t.after(stop);
  return {received, executes: () => received.filter(r => r.method === 'execute').map(r => r.params), stop, sockets};
}

// A handler's answer that sends nothing (a request that never completes).
export const NO_REPLY = Symbol('no reply');

// The trusted worker's nativePipe, over node:net: one connection per createConnection, rejected when nothing listens.
export function nativePipe({connections = []} = {}) {
  return {
    connections,
    createConnection(path) {
      return new Promise((resolve, reject) => {
        const socket = createConnection(path);
        socket.once('error', reject);
        socket.once('connect', () => {
          socket.off('error', reject);
          const listeners = {data: new Set(), close: new Set(), error: new Set()};
          socket.on('data', chunk => { for (const listener of listeners.data) listener(chunk); });
          socket.on('error', error => { for (const listener of listeners.error) listener(error); });
          socket.on('close', () => { for (const listener of listeners.close) listener(); });
          connections.push(socket);
          resolve({
            write(data) { socket.write(Buffer.from(data)); },
            on(event, listener) { listeners[event].add(listener); },
            off(event, listener) { listeners[event].delete(listener); },
            end() { socket.end(); },
          });
        });
      });
    },
  };
}
