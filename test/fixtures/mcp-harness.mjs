// Deterministic harness for the MCP server: an in-process fake upstream (standing in for the vendor cua_repl runtime)
// and a client speaking newline-delimited JSON-RPC over in-memory streams. Nothing here spawns a process; the fake
// answers only when a test tells it to, so ordering is explicit rather than timing-dependent.
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {createServer} from '../../src/mcp/server.mjs';

export const UPSTREAM_TOOLS = [
  {name: 'js', description: 'Upstream js description.', inputSchema: {type: 'object', properties: {code: {type: 'string'}, timeout_ms: {type: 'integer', minimum: 1}, title: {type: 'string'}}, required: ['code'], additionalProperties: false}, annotations: {readOnlyHint: true}},
  {name: 'js_add_node_module_dir', description: 'Add a node_modules directory.', inputSchema: {type: 'object', properties: {path: {type: 'string'}}, required: ['path']}},
  {name: 'js_reset', description: 'Upstream reset description.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
  {name: 'turn_ended', description: 'Notify trusted libraries that a Codex turn ended.', inputSchema: {type: 'object', properties: {hook_event_name: {type: 'string'}, session_id: {type: 'string'}, turn_id: {type: 'string'}}, required: ['hook_event_name', 'session_id', 'turn_id']}, _meta: {ui: {visibility: []}}},
];

// Resolves the first element of `list` (now or later) matching `predicate`.
function watchList() {
  const items = [];
  const waiters = [];
  return {
    items,
    push(item) {
      items.push(item);
      for (const w of [...waiters]) if (w.predicate(item)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(item); }
    },
    next(predicate, {after = 0, label = 'item', timeoutMs = 2000} = {}) {
      const found = items.slice(after).find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const w = {predicate, resolve: v => { clearTimeout(timer); resolve(v); }};
        const timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`timed out waiting for ${label}`)); }, timeoutMs);
        waiters.push(w);
      });
    },
  };
}

export function fakeUpstream() {
  const sent = watchList();
  let onMessage = () => {};
  let onExit = () => {};
  const fake = {
    sent: sent.items,
    terminations: [],
    // Replace to control teardown (e.g. a promise the test resolves later).
    terminateImpl: async () => ({confirmed: true, steps: ['eof']}),
    send(msg) { sent.push(structuredClone(msg)); },
    onMessage(fn) { onMessage = fn; },
    onExit(fn) { onExit = fn; },
    terminate(options) { fake.terminations.push(options); return fake.terminateImpl(options); },
    // Test controls.
    next: (predicate, options) => sent.next(predicate, options),
    nextCall: (name, options) => sent.next(m => m.method === 'tools/call' && m.params?.name === name, {label: `upstream ${name} call`, ...options}),
    nextRequest: (method, options) => sent.next(m => m.method === method && m.id !== undefined, {label: `upstream ${method}`, ...options}),
    emit(msg) { onMessage(structuredClone(msg)); },
    reply(request, result) { fake.emit({jsonrpc: '2.0', id: request.id, result}); },
    replyError(request, error) { fake.emit({jsonrpc: '2.0', id: request.id, error}); },
    text: (request, text, extra = {}) => fake.reply(request, {content: [{type: 'text', text}], isError: false, ...extra}),
    exit(info = {code: 1, signal: null}) { onExit(info); },
    calls: name => sent.items.filter(m => m.method === 'tools/call' && m.params?.name === name),
    // Keeps teardown pending (so the connection stays readable in its terminal state) until the returned release().
    holdTeardown(result = {confirmed: true, steps: ['eof']}) {
      let release;
      const held = new Promise(resolve => { release = () => resolve(result); });
      fake.terminateImpl = () => held;
      return release;
    },
  };
  return fake;
}

export function harness(options = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const upstream = options.upstream ?? fakeUpstream();
  const diagnostics = [];
  let n = 0;
  const server = createServer({
    input, output, upstream,
    sessionId: 'session-under-test',
    newId: () => `id-${++n}`,
    completionDeadlineMs: 150,
    teardownBudgetMs: 150,
    diagnostics: line => diagnostics.push(line),
    // The macOS surface (host notes, search hints) unless a test names another platform: the same on any host.
    platform: 'darwin',
    ...options.server,
  });
  const frames = watchList();
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  let nextId = 0;
  const client = {
    frames: frames.items,
    diagnostics,
    send(msg) { input.write(JSON.stringify(msg) + '\n'); },
    raw(line) { input.write(line + '\n'); },
    request(method, params, id = ++nextId) {
      client.send({jsonrpc: '2.0', id, method, params});
      const response = client.response(id);
      response.catch(() => {}); // a test may never await a response it does not expect
      return {id, response};
    },
    call(name, args = {}, {id, meta} = {}) {
      return client.request('tools/call', {name, arguments: args, ...(meta ? {_meta: meta} : {})}, id ?? ++nextId);
    },
    notify(method, params) { client.send({jsonrpc: '2.0', method, params}); },
    response: (id, options) => frames.next(m => m.id === id && m.method === undefined, {label: `response ${JSON.stringify(id)}`, ...options}),
    next: (predicate, options) => frames.next(predicate, options),
    responsesFor: id => frames.items.filter(m => m.id === id && m.method === undefined),
    eof() { input.end(); },
  };
  return {client, upstream, server, input, output};
}

// Answers the upstream handshake so tests can start from an initialized connection.
export async function initialized(h, {clientInfo = {name: 'test-client', version: '0'}} = {}) {
  const init = h.client.request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo});
  const up = await h.upstream.nextRequest('initialize');
  h.upstream.reply(up, {protocolVersion: '2025-06-18', capabilities: {tools: {listChanged: true}}, serverInfo: {name: 'rmcp', version: '1.5.0'}, instructions: 'UI automation through cua_repl using the initialized cua API.'});
  const response = await init.response;
  h.client.notify('notifications/initialized', {});
  return response;
}

export const textOf = response => (response.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
export const structured = response => response.result?.structuredContent;

// Claude Code (2.1.292) shows the model only the structured content of a successful result that has one, as JSON,
// dropping its text blocks; an error result, or one without structured content, keeps its text
// (docs/evidence/2026-10-07-device-multiplexing-acceptance.md). So guidance meant for the model in such a result has to
// be in its structured content: this asserts that every line of the text is there, a JSON line as fields of it and any
// other line inside one of its strings.
export function assertModelSeesText(response) {
  const {result} = response;
  if (result.isError || result.structuredContent == null) return;
  const strings = [];
  (function collect(value) {
    if (typeof value === 'string') strings.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  })(result.structuredContent);
  for (const line of textOf(response).split('\n').filter(Boolean)) {
    let fields = null;
    try { fields = JSON.parse(line); } catch {}
    if (fields && typeof fields === 'object') {
      for (const [key, value] of Object.entries(fields)) assert.deepEqual(result.structuredContent[key], value, `the structured content carries ${key}`);
    } else assert.ok(strings.some(s => s.includes(line)), `a text line the model never sees: ${line}`);
  }
}
export const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

// A connection opener for the HTTP handler (createMcpHttp's `open`) serving in-process connections: each session's
// createServer runs over a fake upstream that answers initialize and tools/list by itself; everything else waits for
// the test (`open.opened[i].upstream`). `open.failWith` (a code) makes the next opens fail; `open.negotiate` is the protocol
// version the runtime answers initialize with.
const UPSTREAM_INIT = {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'rmcp', version: '1.5.0'}, instructions: 'Upstream.'};

export function inProcessConnections() {
  const opened = [];
  const open = async ({sessionId, input, output, onWithdrawn}) => {
    if (open.failWith) throw Object.assign(new Error('open failed'), {code: open.failWith});
    const upstream = fakeUpstream();
    const send = upstream.send;
    upstream.send = msg => {
      send(msg);
      if (msg.method === 'initialize') queueMicrotask(() => upstream.reply(msg, {...UPSTREAM_INIT, ...(open.negotiate ? {protocolVersion: open.negotiate} : {})}));
      if (msg.method === 'tools/list') queueMicrotask(() => upstream.reply(msg, {tools: UPSTREAM_TOOLS}));
    };
    const server = createServer({input, output, upstream, sessionId, onWithdrawn, diagnostics: () => {}, completionDeadlineMs: 100, teardownBudgetMs: 100});
    const closed = server.closed.then(result => ({...result, listingLeftover: false}));
    const connection = {sessionId, closed, upstream, close: reason => { server.close(reason); return closed; }, get state() { return server.state; }};
    opened.push(connection);
    return connection;
  };
  open.opened = opened;
  return open;
}
