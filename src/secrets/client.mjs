// Client for the private per-connection secret broker (the Keychain helper's `broker` mode). It is the only code that
// receives secret values, and it runs only on the trusted side: inside node_repl's trusted worker (the sky wrapper,
// connecting through nodeRepl.nativePipe, which node_repl opens outside the sandbox) and in `cua serve` itself, which
// only lists labels. Untrusted model cells have neither nativePipe nor the token.
//
// Wire (protocol 1; native/keychain/Sources/CuaKeychainCore/Broker.swift is the other side): one request and one
// reply per connection, each a 4-byte big-endian length then UTF-8 JSON.
//   {"v":1,"token":…,"op":"read","label":…} -> {"ok":true,"value":…}
//   {"v":1,"token":…,"op":"list"}           -> {"ok":true,"labels":[…]}
//   failure                                  -> {"ok":false,"error":<code>}
// Errors are BrokerError with a stable `code` and a fixed message. No error ever carries reply bytes or transport
// diagnostics, so a value cannot leak through a failure path; labels are not secret and may appear. A reply must be
// exactly one frame of valid UTF-8: bytes past the frame in what has been received, or invalid UTF-8, are a protocol
// error. The stream is closed as soon as the frame is complete, so nothing after it is ever read.
import {isLabel} from './label.mjs';

export const BROKER_ENV = {endpoint: 'CUA_SECRETS_BROKER_ENDPOINT', token: 'CUA_SECRETS_BROKER_TOKEN'};
export const BROKER_PROTOCOL = 1;
export const MAX_REQUEST_BYTES = 1024;
export const MAX_RESPONSE_BYTES = 262_144;
const DEFAULT_TIMEOUT_MS = 5000;

const MESSAGES = {
  not_configured: 'no secret broker is configured for this connection',
  disconnected: 'the secret broker is not reachable',
  timeout: 'the secret broker did not answer in time',
  protocol: 'the secret broker sent an invalid reply',
  unauthorized: 'the secret broker refused this connection\'s credentials',
  malformed: 'the secret broker could not read the request',
  oversized: 'the request was too large for the secret broker',
  invalid_label: "labels are 1-128 letters, digits, '.', '_' or '-', starting with a letter or digit",
  not_found: 'no such secret',
  denied: 'Keychain access to the secret was denied',
  locked: 'the Keychain is locked',
  unavailable: 'the Keychain could not be used',
  unsupported_value: 'the stored secret is not valid UTF-8 text',
  response_too_large: 'the secret broker\'s reply would be too large',
};
// Outcomes the broker itself may report.
const BROKER_CODES = new Set(['unauthorized', 'malformed', 'oversized', 'invalid_label', 'not_found', 'denied', 'locked', 'unavailable', 'unsupported_value', 'response_too_large']);

export class BrokerError extends Error {
  constructor(code, label) {
    super(code === 'not_found' && label ? `no secret named "${label}"` : MESSAGES[code] ?? MESSAGES.protocol);
    this.name = 'BrokerError';
    this.code = code;
  }
}

// node_repl's trusted-worker transport. Looked up per request; never replaced by node:net, which the sandbox denies
// and which would mean the endpoint had been opened to the sandbox.
async function nativePipe(path) {
  const create = globalThis.nodeRepl?.nativePipe?.createConnection;
  if (typeof create !== 'function') throw new BrokerError('disconnected');
  return create(path);
}

const utf8 = new TextDecoder('utf-8', {fatal: true});
const closeStream = stream => { try { stream?.destroy ? stream.destroy() : stream?.end?.(); } catch {} };

const frame = body => {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
};

export function brokerClient({endpoint, token, connect = nativePipe, timeoutMs = DEFAULT_TIMEOUT_MS}) {
  function exchange(request) {
    return new Promise((resolve, reject) => {
      let stream;
      let settled = false;
      let chunks = [];
      let received = 0;
      let expected = null;
      const finish = (error, reply) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        for (const chunk of chunks) chunk.fill(0);
        chunks = [];
        closeStream(stream);
        if (error) reject(error); else resolve(reply);
      };
      const timer = setTimeout(() => finish(new BrokerError('timeout')), timeoutMs);
      const onData = chunk => {
        if (settled) return;
        const bytes = Buffer.from(chunk);
        chunks.push(bytes);
        received += bytes.length;
        if (expected === null && received >= 4) {
          const all = Buffer.concat(chunks);
          chunks.forEach(c => c.fill(0));
          chunks = [all];
          expected = all.readUInt32BE(0);
          if (expected === 0 || expected > MAX_RESPONSE_BYTES) return finish(new BrokerError('protocol'));
        }
        if (expected === null || received < 4 + expected) return;
        if (received > 4 + expected) return finish(new BrokerError('protocol'));
        const all = Buffer.concat(chunks);
        chunks.forEach(c => c.fill(0));
        chunks = [all];
        let reply;
        try { reply = JSON.parse(utf8.decode(all.subarray(4))); } catch { return finish(new BrokerError('protocol')); }
        finish(null, reply);
      };
      const lost = () => finish(new BrokerError('disconnected'));
      // Any failure to connect, attach or write settles the call once as `disconnected`, whatever the transport threw.
      (async () => {
        try {
          stream = await connect(endpoint);
          if (settled) return closeStream(stream);
          stream.on('data', onData);
          stream.on('error', lost);
          stream.on('end', lost);
          stream.on('close', lost);
          stream.write(frame(Buffer.from(JSON.stringify({v: BROKER_PROTOCOL, token, ...request}), 'utf8')));
        } catch {
          if (settled) closeStream(stream);
          else finish(new BrokerError('disconnected'));
        }
      })();
    });
  }

  const outcome = (reply, label) => {
    if (reply === null || typeof reply !== 'object' || Array.isArray(reply)) throw new BrokerError('protocol');
    if (reply.ok === false && BROKER_CODES.has(reply.error)) throw new BrokerError(reply.error, label);
    if (reply.ok !== true) throw new BrokerError('protocol');
    return reply;
  };

  return {
    // The secret's value. Only the trusted wrapper calls this.
    async read(label) {
      if (!isLabel(label)) throw new BrokerError('invalid_label');
      const reply = outcome(await exchange({op: 'read', label}), label);
      if (typeof reply.value !== 'string') throw new BrokerError('protocol');
      return reply.value;
    },
    // Stored labels, never values.
    async list() {
      const reply = outcome(await exchange({op: 'list'}));
      if (!Array.isArray(reply.labels) || !reply.labels.every(isLabel)) throw new BrokerError('protocol');
      return reply.labels;
    },
  };
}

// The client for this process's broker, from the environment the launcher gives the trusted worker. Without both
// variables every call fails `not_configured`.
export function brokerClientFromEnv({env = process.env, connect, timeoutMs} = {}) {
  const endpoint = env[BROKER_ENV.endpoint];
  const token = env[BROKER_ENV.token];
  if (!endpoint || !token) {
    const unconfigured = async () => { throw new BrokerError('not_configured'); };
    return {read: unconfigured, list: unconfigured};
  }
  return brokerClient({endpoint, token, connect, timeoutMs});
}
