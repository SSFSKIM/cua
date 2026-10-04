// A stand-in for node_repl's trusted-worker `nodeRepl.nativePipe.createConnection`, over a real unix socket. It has
// exactly the stream surface the pinned runtime gives (privileged-node-repl.js inside node_repl 26.928.40906): a
// frozen object with write/on/off/end and no destroy; `on`/`off` accept only data, close and error and throw for any
// other event; data arrives as Buffers; write after close is silently dropped; a failed connect rejects.
import net from 'node:net';

const EVENTS = ['data', 'close', 'error'];

export function nativePipeConnect(path) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(path);
    const listeners = {data: new Set(), close: new Set(), error: new Set()};
    let connected = false;
    let closed = false;
    let failure = null;
    const checked = event => {
      if (!EVENTS.includes(event)) throw new Error(`unsupported native pipe event: ${String(event)}`);
      return listeners[event];
    };
    socket.on('data', chunk => { for (const listener of listeners.data) listener(Buffer.from(chunk)); });
    socket.on('error', error => {
      failure = error;
      if (!connected) reject(error);
    });
    socket.on('close', () => {
      closed = true;
      if (!connected) return;
      if (failure) for (const listener of listeners.error) queueMicrotask(() => listener(failure));
      for (const listener of listeners.close) queueMicrotask(() => listener());
    });
    socket.once('connect', () => {
      connected = true;
      resolve(Object.freeze({
        write(data) {
          if (closed) return;
          if (!(data instanceof Uint8Array)) throw new Error('native pipe write expected bytes');
          socket.write(data);
        },
        on(event, listener) { checked(event).add(listener); },
        off(event, listener) { checked(event).delete(listener); },
        end() { socket.end(); },
      }));
    });
  });
}
