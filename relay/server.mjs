// cua-relay: the meeting point between cloud MCP clients and enrolled cua agents (the user's Macs), for hosts the Mac
// cannot be reached on directly. Each agent dials in over a WebSocket at /ws; each HTTP request to /d/<device>/mcp is
// carried to that device's agent as one channel and answered by the agent's own MCP endpoint. The relay keeps no
// session state: sessions live in the agent, so a relay restart costs a reconnect, never a session.
//
// Who may connect, from the device table (devices.json: {"<deviceId>": {deviceCredentialSha256, clientCredentialSha256}},
// the line `cua remote enroll` prints): an agent whose WebSocket bearer hashes to a deviceCredentialSha256 is that device,
// and its first frame must be {t: "hello", deviceId} naming it (another id closes with 4003); a client whose bearer
// hashes to the device's clientCredentialSha256 reaches it. The client's authorization header is forwarded unchanged and
// the agent checks it again. A newer WebSocket for a device replaces the older (closed with 4001, "replaced").
//
// Frames are JSON text: relay → agent {ch, t: "open", method, path: "/mcp", headers}, {ch, t: "body", data (base64)},
// {ch, t: "end"}; agent → relay {ch, t: "head", status, headers}, {ch, t: "data", data (base64)}, {ch, t: "end"};
// either way {ch, t: "abort"} (the client went away, or the agent's handler failed). Frames for an unknown channel are
// dropped and logged. Liveness: every WebSocket is pinged every `pingMs` (25 s) and closed after two missed pongs.
//
// No TLS here: run it behind a proxy that terminates TLS (README.md says what that proxy must pass through).
import {createServer} from 'node:http';
import {createHash, timingSafeEqual} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {WebSocketServer} from 'ws';

// The request headers a channel carries; nothing else reaches the agent.
const FORWARDED = ['authorization', 'mcp-session-id', 'accept', 'content-type', 'last-event-id', 'mcp-protocol-version', 'origin'];
// Connection-level response headers the relay's own HTTP connection decides, never the agent.
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length']);
const REPLACED = 4001;
const WRONG_DEVICE = 4003;
const HEX64 = /^[0-9a-f]{64}$/;
// Bounds on what one authenticated client can make the relay hold: a request body (MCP POST bodies are small), and
// the unsent part of a response to a client that stopped reading (it resumes by Last-Event-ID once it reads again).
const BODY_LIMIT = 4 * 1024 * 1024;
const RESPONSE_BUFFER_LIMIT = 32 * 1024 * 1024;

const sha256 = text => createHash('sha256').update(text).digest();
const bearerOf = header => /^Bearer +(\S+) *$/i.exec(header ?? '')?.[1];
// Equal-length digests, so the comparison is constant-time whatever was presented.
const hashMatches = (expected, presented) => presented !== undefined && timingSafeEqual(expected, sha256(presented));

function rpcError(res, status, message) {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({jsonrpc: '2.0', id: null, error: {code: -32000, message: `cua-relay: ${message}`}}));
}

export function loadDevices(devicesFile) {
  let table;
  try { table = JSON.parse(readFileSync(devicesFile, 'utf8')); } catch (error) {
    throw new Error(`the devices file ${devicesFile} could not be read as JSON (${error.code ?? error.message})`);
  }
  if (table === null || typeof table !== 'object' || Array.isArray(table))
    throw new Error(`the devices file ${devicesFile} must be an object of "<deviceId>": {"deviceCredentialSha256", "clientCredentialSha256"}`);
  const devices = new Map();
  for (const [deviceId, entry] of Object.entries(table)) {
    if (!HEX64.test(entry?.deviceCredentialSha256 ?? '') || !HEX64.test(entry?.clientCredentialSha256 ?? ''))
      throw new Error(`the devices file ${devicesFile}: device ${JSON.stringify(deviceId)} needs deviceCredentialSha256 and clientCredentialSha256, each 64 hex digits (paste the line cua remote enroll printed)`);
    devices.set(deviceId, {device: Buffer.from(entry.deviceCredentialSha256, 'hex'), client: Buffer.from(entry.clientCredentialSha256, 'hex')});
  }
  return devices;
}

export async function startRelay({port, host = '127.0.0.1', devicesFile, pingMs = 25_000, bodyLimit = BODY_LIMIT,
  responseBufferLimit = RESPONSE_BUFFER_LIMIT, diagnostics = line => process.stderr.write(`cua-relay: ${line}\n`)}) {
  const devices = loadDevices(devicesFile);
  const online = new Map();        // device id → its link (the WebSocket that said hello)
  const links = new Set();         // every WebSocket, hello or not

  // ---- the agents' WebSockets ----

  const wss = new WebSocketServer({noServer: true, perMessageDeflate: false});

  // The device whose device credential the bearer is, or null.
  function deviceOf(bearer) {
    if (bearer === undefined) return null;
    const presented = sha256(bearer);
    for (const [deviceId, entry] of devices) if (timingSafeEqual(entry.device, presented)) return deviceId;
    return null;
  }

  // The answer, then the socket destroyed (as ws's own abortHandshake does): a peer that keeps its side open must not
  // hold a socket, or the relay's close, forever.
  function refuseUpgrade(socket, status, text) {
    socket.once('finish', () => socket.destroy());
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  function onUpgrade(req, socket, head) {
    socket.on('error', () => {});
    if (req.url.split('?')[0] !== '/ws') return refuseUpgrade(socket, 404, 'Not Found');
    const deviceId = deviceOf(bearerOf(req.headers.authorization));
    if (deviceId === null) return refuseUpgrade(socket, 401, 'Unauthorized');
    wss.handleUpgrade(req, socket, head, ws => attachAgent(ws, deviceId));
  }

  const send = (link, frame) => { if (link.ws.readyState === link.ws.OPEN) link.ws.send(JSON.stringify(frame)); };

  // A channel whose agent side is gone: an answer not begun is 502; one begun is cut, so the client sees a broken
  // stream (and resumes it) rather than a finished one.
  function failChannel(channel, message) {
    channel.closed = true;
    if (channel.res.headersSent) channel.res.destroy();
    else rpcError(channel.res, 502, message);
  }

  function attachAgent(ws, deviceId) {
    const link = {ws, deviceId, hello: false, channels: new Map(), nextCh: 1, alive: true, missed: 0};
    links.add(link);
    link.pinger = setInterval(() => {
      link.missed = link.alive ? 0 : link.missed + 1;
      if (link.missed >= 2) {
        diagnostics(`device ${deviceId}: two pings without a pong; closing its WebSocket`);
        return ws.terminate();
      }
      link.alive = false;
      ws.ping();
    }, pingMs);
    ws.on('pong', () => { link.alive = true; });
    ws.on('error', error => diagnostics(`device ${deviceId}: WebSocket error (${error.code ?? error.message})`));
    // A frame the relay cannot apply (a head with an impossible status, say) is logged and its channel cut; never fatal.
    ws.on('message', (data, isBinary) => {
      try { onFrame(link, data, isBinary); } catch (error) {
        diagnostics(`device ${deviceId}: a frame could not be applied (${error.message})`);
        let ch;
        try { ({ch} = JSON.parse(data.toString('utf8'))); } catch {}
        const channel = link.channels.get(ch);
        if (channel) {
          link.channels.delete(ch);
          failChannel(channel, 'the device sent an answer the relay could not pass on');
          send(link, {ch, t: 'abort'});
        }
      }
    });
    ws.on('close', code => {
      clearInterval(link.pinger);
      links.delete(link);
      for (const channel of link.channels.values()) failChannel(channel, 'the device disconnected');
      link.channels.clear();
      if (online.get(deviceId) === link) {
        online.delete(deviceId);
        diagnostics(`device ${deviceId} offline (WebSocket closed, code ${code})`);
      }
    });
  }

  function onFrame(link, data, isBinary) {
    let frame;
    try { frame = isBinary ? null : JSON.parse(data.toString('utf8')); } catch {}
    if (frame === null || typeof frame !== 'object' || typeof frame.t !== 'string')
      return diagnostics(`device ${link.deviceId}: dropped a message that is not a frame`);
    if (frame.t === 'hello') return onHello(link, frame);
    if (!link.hello) return diagnostics(`device ${link.deviceId}: dropped a ${frame.t} frame sent before hello`);
    const channel = link.channels.get(frame.ch);
    if (!channel) return diagnostics(`device ${link.deviceId}: dropped a ${frame.t} frame for unknown channel ${JSON.stringify(frame.ch)}`);
    const {res} = channel;
    switch (frame.t) {
      case 'head': {
        if (res.headersSent) return diagnostics(`device ${link.deviceId}: dropped a second head for channel ${frame.ch}`);
        const headers = {};
        for (const [name, value] of Object.entries(frame.headers ?? {})) if (!HOP_BY_HOP.has(name.toLowerCase())) headers[name] = value;
        const sse = Object.entries(headers).some(([name, value]) => name.toLowerCase() === 'content-type' && String(value).startsWith('text/event-stream'));
        if (sse) headers['X-Accel-Buffering'] = 'no';
        res.writeHead(frame.status, headers);
        if (sse) res.flushHeaders();
        return;
      }
      case 'data':
        if (!res.headersSent) return diagnostics(`device ${link.deviceId}: dropped data before the head of channel ${frame.ch}`);
        res.write(Buffer.from(String(frame.data ?? ''), 'base64'));
        if (res.writableLength > responseBufferLimit) {
          diagnostics(`device ${link.deviceId}: channel ${frame.ch}: its client left more than ${responseBufferLimit} bytes unsent; dropping the response`);
          link.channels.delete(frame.ch);
          channel.closed = true;
          res.destroy();
          send(link, {ch: frame.ch, t: 'abort'});
        }
        return;
      case 'end':
        link.channels.delete(frame.ch);
        channel.closed = true;
        if (!res.headersSent) rpcError(res, 502, 'the device ended the request without an answer');
        else res.end();
        return;
      case 'abort':
        link.channels.delete(frame.ch);
        failChannel(channel, 'the device could not answer the request');
        return;
      default:
        diagnostics(`device ${link.deviceId}: dropped a frame of unknown type ${JSON.stringify(frame.t)}`);
    }
  }

  function onHello(link, frame) {
    if (link.hello) return diagnostics(`device ${link.deviceId}: dropped a second hello`);
    if (frame.deviceId !== link.deviceId) {
      diagnostics(`device ${link.deviceId}: its hello named another device; closing (4003)`);
      return link.ws.close(WRONG_DEVICE, 'wrong device');
    }
    link.hello = true;
    const older = online.get(link.deviceId);
    online.set(link.deviceId, link);
    if (older) {
      diagnostics(`device ${link.deviceId}: a newer WebSocket replaces the older (4001)`);
      older.ws.close(REPLACED, 'replaced');
    }
    diagnostics(`device ${link.deviceId} online`);
  }

  // ---- the clients' HTTP requests ----

  function onRequest(req, res) {
    const deviceId = /^\/d\/([^/?]+)\/mcp(?:\?.*)?$/.exec(req.url)?.[1];
    if (deviceId === undefined) return rpcError(res, 404, 'not found (the MCP endpoint of a device is /d/<device>/mcp)');
    const entry = devices.get(deviceId);
    const bearer = bearerOf(req.headers.authorization);
    // An unknown device and a wrong bearer answer alike, and both are decided before the device map is consulted.
    if (!entry || !hashMatches(entry.client, bearer)) return rpcError(res, 401, 'unauthorized');
    const link = online.get(deviceId);
    if (!link) return rpcError(res, 503, 'device offline');

    const ch = link.nextCh++;
    const channel = {res, closed: false};
    link.channels.set(ch, channel);
    const headers = {};
    for (const name of FORWARDED) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
    send(link, {ch, t: 'open', method: req.method, path: '/mcp', headers});
    let received = 0;
    req.on('data', chunk => {
      if (channel.closed) return;
      received += chunk.length;
      if (received > bodyLimit) {
        channel.closed = true;
        if (link.channels.get(ch) === channel) link.channels.delete(ch);
        send(link, {ch, t: 'abort'});
        if (!res.headersSent) rpcError(res, 413, `the request body is larger than ${bodyLimit} bytes`);
        return;
      }
      send(link, {ch, t: 'body', data: chunk.toString('base64')});
    });
    req.on('end', () => { if (!channel.closed) send(link, {ch, t: 'end'}); });
    req.on('error', () => {});
    // The response's close before it ended is the client going away (the request's close fires once its body is read).
    res.on('close', () => {
      if (channel.closed || res.writableEnded) return;
      channel.closed = true;
      if (link.channels.get(ch) === channel) {
        link.channels.delete(ch);
        send(link, {ch, t: 'abort'});
      }
    });
  }

  const server = createServer(onRequest);
  server.on('upgrade', onUpgrade);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({host, port}, () => { server.off('error', reject); resolve(); });
  });
  server.on('error', error => diagnostics(`the listener reported an error (${error.code ?? error.message}); still listening`));
  const address = server.address();
  diagnostics(`listening on http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port} (devices at /d/<device>/mcp, agents at /ws; ${devices.size} device${devices.size === 1 ? '' : 's'})`);

  let closing = null;
  return {
    port: address.port,
    // Drops every WebSocket and every open request at once; the agents reconnect to whatever relay comes back.
    close() {
      closing ??= new Promise(resolve => {
        server.close(() => resolve());
        for (const link of links) link.ws.terminate();
        server.closeAllConnections();
      });
      return closing;
    },
  };
}

const USAGE = 'usage: node server.mjs --port <n> --devices <devices.json> [--host <address>]   (host default 127.0.0.1)';

async function main() {
  let values;
  try {
    ({values} = parseArgs({options: {port: {type: 'string'}, devices: {type: 'string'}, host: {type: 'string'}}, strict: true, allowPositionals: false}));
  } catch { values = {}; }
  const port = Number(values.port);
  if (!values.devices || !/^\d{1,5}$/.test(values.port ?? '') || port > 65535) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  let relay;
  try { relay = await startRelay({port, host: values.host, devicesFile: values.devices}); } catch (error) {
    process.stderr.write(`cua-relay: ${error.message}\n`);
    return 1;
  }
  const signal = await new Promise(resolve => {
    for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => resolve(name));
  });
  process.stderr.write(`cua-relay: ${signal}: closing\n`);
  await relay.close();
  return 0;
}

const isMain = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) process.exitCode = await main();
