// Deterministic harness for the MCP server: an in-process fake upstream (standing in for the vendor cua_repl runtime)
// and a client speaking newline-delimited JSON-RPC over in-memory streams. Nothing here spawns a process; the fake
// answers only when a test tells it to, so ordering is explicit rather than timing-dependent.
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
export const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
