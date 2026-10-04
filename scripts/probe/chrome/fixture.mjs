// Wiring for the M7 fixtures: fake extension <-> adapter <-> owned backend socket, plus a minimal framed JSON-RPC
// client for the deterministic layer (the vendor layer uses the real vendor client instead).
import {connect} from 'node:net';
import {randomBytes} from 'node:crypto';
import {createFakeExtension} from './fake-extension.mjs';
import {createAdapter, backendInfo} from './adapter.mjs';
import {startBackend} from './backend-server.mjs';
import {encodeFrame, frameDecoder} from './frame.mjs';

// Generated, obviously fake markers: a relay capability path and a token, placed only in the fake connect page's URL
// (where the real extension's auto-connect puts them: connect.js:27-69 + background.mjs:537-539 offer sender.tab).
export function fakeSentinels() {
  const tag = randomBytes(12).toString('hex');
  return {token: `M7FAKETOKEN${tag}`, capability: `M7FAKECAPABILITY${tag}`};
}

export function connectPageUrl(sentinels) {
  const relay = `ws://127.0.0.1:49999/extension/${sentinels.capability}`;
  return `chrome-extension://mmlmfjhmonkocbjadbfplnigmagldckm/connect.html?mcpRelayUrl=${encodeURIComponent(relay)}&client=${encodeURIComponent('{"name":"m7-fixture"}')}&protocolVersion=2&token=${sentinels.token}`;
}

// Transport delivery is deferred a turn, like a socket, so disconnects can race in-flight commands.
export async function startFixture({kind, info = backendInfo(kind), socketPath, sentinels, label = kind, timing}) {
  let backend;
  let adapter;
  const extension = createFakeExtension({send: text => setImmediate(() => adapter.onExtensionMessage(text)), ...(timing ? {timing} : {})});
  adapter = createAdapter({kind, info, sendToExtension: text => setImmediate(() => extension.receive(text)), notify: (method, params) => backend?.notify(method, params)});
  extension.onclose = () => setImmediate(() => adapter.onExtensionClose());
  if (socketPath) backend = await startBackend({socketPath, adapter, label});
  // The auto-connected tab is the connect page itself (background.mjs:537-539, handleConnectToTab() with no tab).
  const connectTab = extension.addTab({url: connectPageUrl(sentinels ?? fakeSentinels()), title: 'Playwright MCP extension'});
  return {extension, adapter, backend, connectTab, async close() { extension.dispose(); adapter.dispose(); await backend?.close(); }};
}

export function connectClient(socketPath) {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    const push = frameDecoder();
    const pending = new Map();
    const notifications = [];
    let nextId = 1;
    socket.on('data', chunk => {
      for (const message of push(chunk)) {
        if (message.id !== undefined && pending.has(message.id)) {
          const p = pending.get(message.id);
          pending.delete(message.id);
          message.error ? p.reject(Object.assign(new Error(message.error.message), {code: message.error.code})) : p.resolve(message.result);
        } else if (message.method) notifications.push(message);
      }
    });
    socket.once('error', reject);
    socket.once('connect', () => resolve({
      notifications,
      request(method, params) {
        const id = nextId++;
        return new Promise((ok, fail) => { pending.set(id, {resolve: ok, reject: fail}); socket.write(encodeFrame({jsonrpc: '2.0', method, params, id})); });
      },
      raw: bytes => socket.write(bytes),
      close: () => socket.destroy(),
    }));
  });
}

export const settle = (ms = 0) => new Promise(r => setTimeout(r, ms));
