// The framing and JSON-RPC peer both of the cua host's wires use: the vendor backend socket (the pinned browser service
// is the client) and Chrome native messaging (the cua extension is the peer). Promoted from M7's
// scripts/probe/chrome/frame.mjs.
//
// Framing: a u32 byte length in the host's native order, then that many bytes of UTF-8 JSON. The vendor encodes and
// decodes with the host's endianness (@oai/browser-desktop 0.1.1, browser-service.mjs 66712-66841), and Chrome's
// native messaging is specified in native byte order, so one codec serves both.
//
// Peer conventions are the vendor client's (browser-service.mjs 10352-10485): numeric ids from 1 per direction; an
// error reply is {code, message} and the caller's promise rejects with that bare message; an unknown request method is
// answered {code: -1, message: "No handler registered for method: <m>"} (the vendor's optional-method fallbacks match
// that string exactly); a handler that throws answers code 1 (or the thrown error's numeric code). An unknown
// notification is ignored. A frame larger than `maxFrameBytes` is never sent: Chrome tears the native port down on a
// host->extension message over 1 MB, so the request rejects, and a reply becomes the error, `message_too_large`.
import {endianness} from 'node:os';

export const HEADER_BYTES = 4;
const LE = endianness() === 'LE';
export const hostEndianness = () => endianness();

export const NO_HANDLER = method => `No handler registered for method: ${method}`;

function frameOf(body) {
  const frame = Buffer.alloc(HEADER_BYTES + body.length);
  if (LE) frame.writeUInt32LE(body.length, 0); else frame.writeUInt32BE(body.length, 0);
  body.copy(frame, HEADER_BYTES);
  return frame;
}

export function encodeFrame(message, maxFrameBytes = 0xffffffff) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > maxFrameBytes) throw new Error(`frame of ${body.length} bytes exceeds limit ${maxFrameBytes}`);
  return frameOf(body);
}

// Returns push(chunk) -> parsed messages; throws on an oversized declared length or invalid JSON, after which the
// caller must close the connection (the vendor closes its transport on any decode error).
export function frameDecoder(maxFrameBytes = 0xffffffff) {
  let pending = Buffer.alloc(0);
  return function push(chunk) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
    const out = [];
    while (pending.length >= HEADER_BYTES) {
      const length = LE ? pending.readUInt32LE(0) : pending.readUInt32BE(0);
      if (length > maxFrameBytes) throw new Error('native pipe frame exceeds limit');
      if (pending.length < HEADER_BYTES + length) break;
      out.push(JSON.parse(pending.subarray(HEADER_BYTES, HEADER_BYTES + length).toString('utf8')));
      pending = pending.subarray(HEADER_BYTES + length);
    }
    return out;
  };
}

export const MESSAGE_TOO_LARGE = 'message_too_large';
const rpcError = (message, code) => Object.assign(new Error(message), {code});

// `send(bytes)` writes one encoded frame; `handlers` maps a method to `params => result` for requests and
// notifications alike. `receive(message)` takes one decoded message from the other side.
export function createPeer({send, handlers = {}, maxFrameBytes = 0xffffffff}) {
  let nextId = 0;
  let closedReason = null;
  const pending = new Map();

  // Encodes and sends, or throws message_too_large without sending anything.
  function write(message) {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    if (body.length > maxFrameBytes) throw rpcError(MESSAGE_TOO_LARGE, 1);
    send(frameOf(body));
  }

  function reply(id, outcome) {
    if (closedReason) return;
    try { write({jsonrpc: '2.0', id, ...outcome}); } catch (error) {
      if (error.message !== MESSAGE_TOO_LARGE) throw error;
      write({jsonrpc: '2.0', id, error: {code: 1, message: MESSAGE_TOO_LARGE}});
    }
  }

  async function answer(message) {
    const handler = Object.hasOwn(handlers, message.method) ? handlers[message.method] : null;
    if (!handler) return reply(message.id, {error: {code: -1, message: NO_HANDLER(message.method)}});
    try {
      reply(message.id, {result: (await handler(message.params ?? {})) ?? null});
    } catch (error) {
      reply(message.id, {error: {code: typeof error?.code === 'number' ? error.code : 1, message: String(error?.message ?? error)}});
    }
  }

  return {
    request(method, params = {}) {
      if (closedReason) return Promise.reject(rpcError(closedReason, 1));
      const id = ++nextId;
      try { write({jsonrpc: '2.0', id, method, params}); } catch (error) { return Promise.reject(error); }
      return new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
    },
    notify(method, params = {}) {
      if (!closedReason) write({jsonrpc: '2.0', method, params});
    },
    receive(message) {
      if (closedReason || !message || typeof message !== 'object') return;
      if (typeof message.method === 'string') {
        if (message.id !== undefined && message.id !== null) { answer(message); return; }
        const handler = Object.hasOwn(handlers, message.method) ? handlers[message.method] : null;
        if (handler) Promise.resolve().then(() => handler(message.params ?? {})).catch(() => {});
        return;
      }
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(rpcError(String(message.error.message ?? message.error), message.error.code));
      else entry.resolve(message.result);
    },
    // Rejects every pending and later request with `reason`; later input is dropped and nothing more is sent.
    close(reason) {
      if (closedReason) return;
      closedReason = reason;
      for (const entry of pending.values()) entry.reject(rpcError(reason, 1));
      pending.clear();
    },
    get pendingCount() { return pending.size; },
  };
}
