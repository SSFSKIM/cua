// Probe-only trusted "sky" service for scripts/probe-runtime.mjs. node_repl's trusted worker loads it through
// NODE_REPL_TRUSTED_SERVICES in place of @oai/sky/service. Every vendor request is delegated unchanged to the vendor
// module named by CUA_SKY_VENDOR_SERVICE (launcher configuration, never agent input). One extra request type,
// `cua_probe`, reports what the wrapper saw and whether this sandboxed worker can reach a probe-owned unix socket,
// directly and through nodeRepl.nativePipe. It carries no secrets and is not the production wrapper (M5).
import net from 'node:net';
import {pathToFileURL} from 'node:url';

const vendor = await import(pathToFileURL(process.env.CUA_SKY_VENDOR_SERVICE).href);
const delegated = [];

export async function handleRpc(request) {
  if (request?.type === 'cua_probe') return probe(request);
  delegated.push(request?.type === 'execute' ? `execute:${request.method}` : String(request?.type));
  return vendor.handleRpc(request);
}

async function probe({socketPath, nonce}) {
  return {
    wrapper: import.meta.url,
    vendorExports: Object.keys(vendor),
    delegated: [...delegated],
    pid: process.pid,
    ppid: process.ppid,
    sandboxAllowanceEnv: process.env.NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS ?? null,
    netConnect: socketPath ? await viaNet(socketPath, nonce) : null,
    nativePipe: socketPath ? await viaNativePipe(socketPath, nonce) : null,
  };
}

function exchange(stream, nonce, resolve) {
  let buffer = '';
  const timer = setTimeout(() => finish({ok: false, error: 'timeout'}), 3000);
  function finish(result) {
    clearTimeout(timer);
    try { stream.end(); } catch {}
    resolve(result);
  }
  stream.on('data', chunk => {
    buffer += Buffer.from(chunk).toString('utf8');
    if (buffer.includes('\n')) finish({ok: buffer.trim() === `ack:${nonce}`});
  });
  stream.on('error', error => finish({ok: false, error: error.code ?? error.message}));
  return finish;
}

function viaNet(socketPath, nonce) {
  return new Promise(resolve => {
    const socket = net.connect(socketPath);
    exchange(socket, nonce, resolve);
    socket.on('connect', () => socket.write(`${nonce}\n`));
  });
}

async function viaNativePipe(socketPath, nonce) {
  const createConnection = globalThis.nodeRepl?.nativePipe?.createConnection;
  if (typeof createConnection !== 'function') return {ok: false, error: 'nativePipe unavailable'};
  let stream;
  try { stream = await createConnection(socketPath); } catch (error) { return {ok: false, error: String(error?.message ?? error)}; }
  return new Promise(resolve => {
    exchange(stream, nonce, resolve);
    stream.write(Buffer.from(`${nonce}\n`));
  });
}
