// cua's own REPL host with trusted services (M2: TrustedServiceWire and PrivilegedRuntime) end to end: a real
// supervisor, kernel and trusted worker (src/repl-host/trusted-worker.mjs) over MCP, with fixture trusted services
// written by each test (supervisor-harness.mjs `services`) and the sandbox-launcher double. Sentences asserted are the
// vendor's where it has one (recovered NR sources and the supervisor strings of the embedded index). Needs Node 24 or
// later (CUA_NODE); skips visibly otherwise.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, symlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {kernelNode} from './kernel-harness.mjs';
import {alive, descendants, launches, startHost, texts} from './supervisor-harness.mjs';
import {TRUSTED_WORKER, TRUSTED_EXIT_SENTENCE, TURN_MARGIN_MS} from '../../src/repl-host/supervisor.mjs';
import {FORM_UNSUPPORTED_SENTENCE, INVALID_SCHEMA_PREFIX, UNEXPECTED_RESPONSE_SENTENCE} from '../../src/repl-host/elicitation.mjs';
import {REPL_HOST_META_KEY, REPL_HOST_VERSION} from '../../src/repl-host/identity.mjs';

const {node, skip} = kernelNode();
const own = {skip};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SLEEP = 'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));\n';
// A cell's single text output, parsed.
const parsed = result => JSON.parse(texts(result).at(-1));
const rpc = (service, request) => `nodeRepl.write(JSON.stringify(await nodeRepl.rpc(${JSON.stringify(service)}, ${JSON.stringify(request)})));`;
const rpcError = (service, request) => `try { await nodeRepl.rpc(${JSON.stringify(service)}, ${JSON.stringify(request)}); nodeRepl.write('"resolved"'); } catch (e) { nodeRepl.write(JSON.stringify(e.message)); }`;
const workers = host => descendants(host.child.pid).filter(p => p.command.includes(TRUSTED_WORKER) && p.command.startsWith(`${node} `));

test('rpc crosses the trusted wire: the request and result have their keys sorted, service output and content items join the cell\'s, response meta reaches the result', own, async t => {
  const host = await startHost(t, {node, services: {svc: `export async function handleRpc(request) {
    console.log('svc-log'); nodeRepl.write('svc-write'); nodeRepl.emitContentItem('svc-item');
    nodeRepl.setResponseMeta({zeta: 1}); nodeRepl.setResponseMeta({alpha: {y: 1, x: 2}});
    return {value: request.payload, meta: {b: 2, a: 1}, requestKeys: Object.keys(request.payload), list: [3, 1, 2]};
  }`}});
  const result = await host.js(`const r = await nodeRepl.rpc('svc', {payload: {z: 1, y: 2}}); nodeRepl.write(JSON.stringify(r));`);
  assert.equal(result.isError, false, JSON.stringify(result.content));
  assert.deepEqual(result.content, [
    {type: 'text', text: 'svc-log\nsvc-write{"list":[3,1,2],"meta":{"a":1,"b":2},"requestKeys":["y","z"],"value":{"y":2,"z":1}}'},
    {type: 'text', text: 'svc-item'},
  ]);
  const {'codex/nodeReplExecutionDurationMs': duration, [REPL_HOST_META_KEY]: marker, ...responseMeta} = result._meta;
  assert.equal(typeof duration, 'number');
  assert.deepEqual(marker, {host: 'cua', version: REPL_HOST_VERSION});
  assert.deepEqual(responseMeta, {alpha: {x: 2, y: 1}, zeta: 1});
  assert.deepEqual(Object.keys(responseMeta), ['alpha', 'zeta'], 'merged across calls, keys sorted');
  assert.equal(Object.hasOwn((await host.js('nodeRepl.write(1)'))._meta, 'zeta'), false, 'response meta is per execution');
});

test('only a rejection\'s message crosses to the cell, as a plain Error: no stack, cause or custom field of the service\'s', own, async t => {
  const host = await startHost(t, {node, services: {svc: `export async function handleRpc(request) {
    if (request.op === 'error') { const e = new TypeError('plain sentence'); e.secret = 'SENTINEL-FIELD'; e.cause = new Error('SENTINEL-CAUSE'); e.stack = 'SENTINEL-STACK'; throw e; }
    if (request.op === 'string') throw 'a thrown string';
    throw {message: 'SENTINEL-OBJECT'};
  }`}});
  const probe = op => `try { await nodeRepl.rpc('svc', {op: '${op}'}); } catch (e) { nodeRepl.write(JSON.stringify({name: e.name, ctor: e.constructor.name, message: e.message,
    own: Object.getOwnPropertyNames(e).sort(), cause: e.cause === undefined, leaked: JSON.stringify([String(e.stack), Object.entries(e)]).includes('SENTINEL')})); }`;
  assert.deepEqual(parsed(await host.js(probe('error'))), {name: 'Error', ctor: 'Error', message: 'plain sentence', own: ['message', 'stack'], cause: true, leaked: false});
  assert.equal(parsed(await host.js(probe('string'))).message, 'a thrown string');
  assert.deepEqual(parsed(await host.js(probe('object'))), {name: 'Error', ctor: 'Error', message: '[object Object]', own: ['message', 'stack'], cause: true, leaked: false});
});

test('trusted code loads only from its real roots: an outside module, a symlink or .. escape and a package name are refused; misconfigured services say so', own, async t => {
  const host = await startHost(t, {node, services: {
    good: `import {value} from './helper.mjs'; export const handleRpc = () => value;`,
    vialink: `export {handleRpc} from './link.mjs';`,
    dotdot: `export {handleRpc} from '../outside/evil.mjs';`,
    nohandler: `export const nothing = 1;`,
  }, env: {}});
  const outside = join(host.root, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'evil.mjs'), `export const handleRpc = () => 'EVIL'; globalThis.evilLoaded = true;\n`);
  writeFileSync(join(host.trusted, 'helper.mjs'), `export const value = 'helped';\n`);
  symlinkSync(join(outside, 'evil.mjs'), join(host.trusted, 'link.mjs'));
  assert.equal(parsed(await host.js(rpc('good', {}))), 'helped');
  assert.equal(parsed(await host.js(rpcError('vialink', {}))), 'Trusted RPC dependency must resolve within a configured trusted code path: ./link.mjs');
  assert.equal(parsed(await host.js(rpcError('dotdot', {}))), 'Trusted RPC dependency must resolve within a configured trusted code path: ../outside/evil.mjs');
  assert.equal(parsed(await host.js(rpcError('nohandler', {}))), 'Trusted RPC service nohandler does not export handleRpc');
  assert.equal(parsed(await host.js(rpcError('absent', {}))), 'Trusted RPC service is not configured: absent');

  const services = JSON.stringify({outside: join(outside, 'evil.mjs'), pkg: 'some-package'});
  const other = await startHost(t, {node, services: {unused: 'export const handleRpc = () => 1;'}, env: {CUA_REPL_TRUSTED_SERVICES: services}});
  assert.equal(parsed(await other.js(rpcError('outside', {}))), `Trusted RPC dependency must resolve within a configured trusted code path: ${pathToFileURL(join(outside, 'evil.mjs')).href}`);
  assert.equal(parsed(await other.js(rpcError('pkg', {}))), 'Trusted RPC package must resolve within a configured trusted module directory: some-package');
});

// The ApprovalStorage audit (#116 M4, the spec's Design "Trusted services and privileged APIs"): no trusted code the own
// route runs calls nodeRepl.config (readToml, writeToml or the app-server config reads and writes), so the privileged
// API is the retained list and nothing else; the vendor's fetch, otel, telemetry and gaasBrowserConfig bridges are absent too.
test('trusted code gets exactly the retained privileged API: no config storage, fetch, telemetry or account bridge', own, async t => {
  const host = await startHost(t, {node, services: {svc: `export async function handleRpc() {
    const names = new Set();
    for (let object = nodeRepl; object && object !== Object.prototype; object = Object.getPrototypeOf(object)) for (const name of Object.getOwnPropertyNames(object)) names.add(name);
    return [...names].sort();
  }`}});
  assert.deepEqual(parsed(await host.js(rpc('svc', {}))), ['addAfterSubmittedCodeHook', 'addTurnEndedHandler', 'createElicitation', 'cwd', 'emitContentItem', 'emitImage', 'env',
    'homeDir', 'launchServices', 'nativePipe', 'requestMeta', 'setResponseMeta', 'tmpDir', 'withSuspendedTimeout', 'write']);
});

test('cells get no privilege: their nodeRepl is the base one, and privileged requests forged on the kernel\'s stdout are ignored', own, async t => {
  let connections = 0;
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {svc: 'export const handleRpc = () => 1;'}});
  const socket = join(host.root, 'p.sock');
  const server = createServer(c => { connections++; c.destroy(); }).listen(socket);
  t.after(() => server.close());
  assert.deepEqual(parsed(await host.js('nodeRepl.write(JSON.stringify(Object.keys(nodeRepl).sort()))')),
    ['cwd', 'emitImage', 'env', 'homeDir', 'requestMeta', 'rpc', 'tmpDir', 'write']);
  assert.deepEqual(parsed(await host.js('nodeRepl.write(JSON.stringify(["createElicitation","nativePipe","launchServices","addTurnEndedHandler","addAfterSubmittedCodeHook","withSuspendedTimeout","setResponseMeta","emitContentItem"].filter(k => k in nodeRepl)))')), []);
  const forged = [
    {type: 'native_pipe_request', id: 'native-pipe-0', op: 'connect', path: socket},
    {type: 'elicit', id: 'forged-elicitation', exec_id: 'exec-3', message: 'forged', requested_schema: {type: 'object', properties: {}}, meta: null},
    {type: 'launch_services_action', id: 'forged-ls', exec_id: 'exec-3', action: 'open_application', bundle_identifier: 'com.example'},
  ];
  // A console line outside any execution goes to the kernel's stdout unwrapped: the one way a cell can write there.
  await host.js(`setTimeout(() => { for (const line of ${JSON.stringify(forged.map(f => JSON.stringify(f)))}) console.log(line); }, 0); await new Promise(r => setTimeout(r, 50));`);
  await host.js('await new Promise(r => setTimeout(r, 300));');
  assert.equal(connections, 0, 'no socket was opened for the kernel');
  assert.deepEqual(host.serverRequests.filter(m => m.method === 'elicitation/create'), [], 'no elicitation was asked for the kernel');
});

test('after-code hooks: sequential, after a thrown cell too, each under its deadline, errors swallowed, output and content items kept; unregister stops them', own, async t => {
  const host = await startHost(t, {node, services: {hooks: `${SLEEP}const log = []; let removers = [];
    export async function handleRpc(request) {
      if (request.op === 'register') {
        removers.push(nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 5000, run: async () => { log.push('a-start'); await sleep(100); log.push('a-end'); nodeRepl.write('hook-a'); }}));
        removers.push(nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 5000, run: () => { log.push('b'); nodeRepl.emitContentItem('hook-item'); }}));
        removers.push(nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 150, run: () => { log.push('stuck'); return new Promise(() => {}); }}));
        removers.push(nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 5000, run: () => { log.push('throws'); throw new Error('hook boom'); }}));
        try { nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 0, run: () => {}}); } catch (e) { return e.message; }
      }
      if (request.op === 'log') return log.splice(0);
      if (request.op === 'unregister') { const out = removers.map(remove => remove()); removers = []; return out; }
    }`}});
  const ONE_RUN = ['a-start', 'a-end', 'b', 'stuck', 'throws'];
  // A cell's own JSON, ahead of what its hooks wrote (while they are registered).
  const own = result => JSON.parse(texts(result)[0].replace(/hook-a$/, ''));
  let started = performance.now();
  const registered = await host.js(rpc('hooks', {op: 'register'}));
  const elapsed = performance.now() - started;
  assert.deepEqual(registered.content, [{type: 'text', text: '"nodeRepl.addAfterSubmittedCodeHook expected { run: function, timeoutMs: positive integer }"hook-a'}, {type: 'text', text: 'hook-item'}],
    'the hooks ran after the cell\'s code, their write and content item in its result');
  assert.ok(elapsed >= 250 && elapsed < 4000, `the stuck hook was cut at its 150 ms deadline (${Math.round(elapsed)} ms)`);
  const thrown = await host.js('throw new Error("cell boom")');
  assert.equal(thrown.isError, true);
  assert.deepEqual(texts(thrown), ['cell boom', 'hook-a'], 'hooks run after an ordinary error, and their output is kept');
  assert.deepEqual(own(await host.js(rpc('hooks', {op: 'log'}))), [...ONE_RUN, ...ONE_RUN], 'sequential, in registration order, once per cell');
  assert.deepEqual(own(await host.js(rpc('hooks', {op: 'unregister'}))), [true, true, true, true]);
  assert.deepEqual(parsed(await host.js(rpc('hooks', {op: 'log'}))), ONE_RUN, 'the cell that logged had its hooks; the one that unregistered did not');
  started = performance.now();
  assert.deepEqual(parsed(await host.js(rpc('hooks', {op: 'log'}))), []);
  assert.ok(performance.now() - started < 1000);
});

test('turn_ended: handlers run concurrently under their deadlines with a frozen event; one acknowledgement per session and turn, shared by repeats', own, async t => {
  const host = await startHost(t, {node, services: {turns: `${SLEEP}const seen = [];
    export async function handleRpc(request) {
      if (request.op === 'register') {
        nodeRepl.addTurnEndedHandler({timeoutMs: 5000, run: async event => { seen.push(['one-start', event.turn_id, Object.isFrozen(event), Object.keys(event)]); await sleep(300); seen.push(['one-end', event.turn_id]); }});
        nodeRepl.addTurnEndedHandler({timeoutMs: 5000, run: async event => { seen.push(['two-start', event.turn_id]); await sleep(300); seen.push(['two-end', event.turn_id]); }});
        nodeRepl.addTurnEndedHandler({timeoutMs: 200, run: () => new Promise(() => {})});
        const remove = nodeRepl.addTurnEndedHandler({timeoutMs: 5000, run: () => seen.push(['removed'])});
        return remove();
      }
      return seen.splice(0);
    }`}});
  const ended = turnId => host.call('turn_ended', {hook_event_name: 'Stop', session_id: 's', turn_id: turnId});
  assert.deepEqual(texts(await ended('before-any-worker')), ['{}'], 'no worker yet: nothing to run');
  assert.equal(parsed(await host.js(rpc('turns', {op: 'register'}))), true);
  const started = performance.now();
  const [first, repeat] = await Promise.all([ended('t1'), ended('t1')]);
  const elapsed = performance.now() - started;
  assert.deepEqual([texts(first), texts(repeat)], [['{}'], ['{}']]);
  assert.ok(elapsed >= 280 && elapsed < 750, `concurrent handlers, the stuck one cut at 200 ms; in sequence they would take 800 ms (${Math.round(elapsed)} ms)`);
  const again = performance.now();
  assert.deepEqual(texts(await ended('t1')), ['{}']);
  assert.ok(performance.now() - again < 200, 'a repeat after completion is acknowledged at once');
  assert.deepEqual(texts(await ended('t2')), ['{}']);
  const seen = parsed(await host.js(rpc('turns', {op: 'seen'})));
  assert.deepEqual(seen.slice(0, 2).map(e => e[0]).sort(), ['one-start', 'two-start'], 'both started before either ended');
  assert.deepEqual(seen.map(e => e.slice(0, 2)), [['one-start', 't1'], ['two-start', 't1'], ['one-end', 't1'], ['two-end', 't1'], ['one-start', 't2'], ['two-start', 't2'], ['one-end', 't2'], ['two-end', 't2']],
    't1 ran once though it was asked three times; the removed handler never ran');
  assert.deepEqual(seen[0].slice(2), [true, ['hook_event_name', 'session_id', 'turn_id']]);
});

test('unawaited privileged work is drained before a service answers: a suspended wait and an image', own, async t => {
  const host = await startHost(t, {node, services: {svc: `${SLEEP}export async function handleRpc() {
    void nodeRepl.withSuspendedTimeout(async () => { await sleep(300); nodeRepl.write('drained'); });
    void nodeRepl.emitImage('data:image/png;base64,${PNG}');
    return 'returned-early';
  }`}});
  const started = performance.now();
  const result = await host.js(rpc('svc', {}));
  assert.ok(performance.now() - started >= 300);
  assert.deepEqual(result.content, [{type: 'text', text: 'drained"returned-early"'}, {type: 'image', data: PNG, mimeType: 'image/png', _meta: {'codex/imageDetail': 'original'}}]);
});

const ELICIT_SERVICE = `export async function handleRpc(request) {
  return await nodeRepl.createElicitation({message: request.message, requestedSchema: request.schema, meta: request.meta});
}`;
const SCHEMA = {type: 'object', properties: {name: {type: 'string'}}, required: ['name']};

test('createElicitation asks the client: accept, decline and cancel come back intact; malformed or failed answers, a bad schema and a client without form elicitation grant nothing', own, async t => {
  const answers = {
    accept: {result: {action: 'accept', content: {name: 'x', b: 1, a: 2}, _meta: {persist: 'session'}}},
    decline: {result: {action: 'decline'}},
    cancel: {result: {action: 'cancel'}},
    malformed: {result: {action: 'maybe'}},
    'non-object content': {result: {action: 'accept', content: 'yes'}},
    refused: {error: {code: -32000, message: 'client refused'}},
  };
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {elicit: ELICIT_SERVICE}, onServerRequest: msg => answers[msg.params.message]});
  const ask = (message, schema = SCHEMA, meta = {k: 1}) => host.js(`try { nodeRepl.write(JSON.stringify(await nodeRepl.rpc('elicit', ${JSON.stringify({message, schema, meta})}))); } catch (e) { nodeRepl.write(JSON.stringify({rejected: e.message})); }`);
  assert.deepEqual(parsed(await ask('accept')), {action: 'accept', content: {a: 2, b: 1, name: 'x'}, _meta: {persist: 'session'}});
  assert.deepEqual(parsed(await ask('decline')), {action: 'decline', content: null, _meta: null});
  assert.deepEqual(parsed(await ask('cancel')), {action: 'cancel', content: null, _meta: null});
  assert.deepEqual(parsed(await ask('malformed')), {rejected: UNEXPECTED_RESPONSE_SENTENCE});
  assert.deepEqual(parsed(await ask('non-object content')), {rejected: UNEXPECTED_RESPONSE_SENTENCE});
  assert.deepEqual(parsed(await ask('refused')), {rejected: 'client refused'});
  const asked = host.serverRequests.filter(m => m.method === 'elicitation/create');
  assert.equal(asked.length, 6);
  assert.deepEqual(asked[0].params, {_meta: {k: 1}, message: 'accept', requestedSchema: {properties: {name: {type: 'string'}}, required: ['name'], type: 'object'}});
  assert.deepEqual(parsed(await ask('bad schema', {type: 'array'})), {rejected: `${INVALID_SCHEMA_PREFIX}expected type "object"`});
  assert.deepEqual(parsed(await ask('nested schema', {type: 'object', properties: {deep: {type: 'object'}}})), {rejected: `${INVALID_SCHEMA_PREFIX}property "deep" must be a string, number, integer or boolean schema`});
  assert.equal(host.serverRequests.filter(m => m.method === 'elicitation/create').length, 6, 'an invalid schema never reaches the client');

  const plain = await startHost(t, {node, capabilities: {}, services: {elicit: ELICIT_SERVICE}, onServerRequest: () => answers.accept});
  assert.deepEqual(parsed(await plain.js(`try { await nodeRepl.rpc('elicit', ${JSON.stringify({message: 'accept', schema: SCHEMA})}); } catch (e) { nodeRepl.write(JSON.stringify({rejected: e.message})); }`)), {rejected: FORM_UNSUPPORTED_SENTENCE});
  const urlOnly = await startHost(t, {node, capabilities: {elicitation: {url: {}}}, services: {elicit: ELICIT_SERVICE}, onServerRequest: () => answers.accept});
  assert.deepEqual(parsed(await urlOnly.js(`try { await nodeRepl.rpc('elicit', ${JSON.stringify({message: 'accept', schema: SCHEMA})}); } catch (e) { nodeRepl.write(JSON.stringify({rejected: e.message})); }`)), {rejected: FORM_UNSUPPORTED_SENTENCE});
  assert.deepEqual([...plain.serverRequests, ...urlOnly.serverRequests].filter(m => m.method === 'elicitation/create'), []);
});

test('withSuspendedTimeout pauses the budget, nested, and resumes what was left of it', own, async t => {
  const host = await startHost(t, {node, services: {budget: `${SLEEP}export async function handleRpc(request) {
    if (request.op === 'nested') {
      await nodeRepl.withSuspendedTimeout(async () => { await sleep(request.ms); await nodeRepl.withSuspendedTimeout(() => sleep(request.ms)); await sleep(request.ms); });
      return 'survived';
    }
    if (request.op === 'warm') return 'warm';
    await nodeRepl.withSuspendedTimeout(() => sleep(request.suspended));
    await sleep(request.after);
    return 'unreachable';
  }`}});
  // The worker's cold start (a Node process and the service's import) counts against the cell's budget like any other
  // work; it is started first so the short budgets below measure only the suspension.
  assert.deepEqual(texts(await host.js(rpc('budget', {op: 'warm'}))), ['"warm"']);
  let started = performance.now();
  const nested = await host.js(rpc('budget', {op: 'nested', ms: 300}), {timeoutMs: 400});
  assert.deepEqual(texts(nested), ['"survived"'], `900 ms suspended inside a 400 ms budget (${Math.round(performance.now() - started)} ms)`);
  started = performance.now();
  const resumed = await host.js(rpc('budget', {op: 'busy', suspended: 600, after: 3000}), {timeoutMs: 400});
  const elapsed = performance.now() - started;
  assert.deepEqual(texts(resumed), ['js execution timed out; kernel reset, rerun your request']);
  assert.ok(elapsed >= 950 && elapsed < 2500, `600 ms suspended, then the 400 ms left, not the 3 s the service waits (${Math.round(elapsed)} ms)`);
  assert.deepEqual(texts(await host.js('nodeRepl.write("next")')), ['next']);
});

test('the worker outlives kernel timeouts and resets; a timed-out call\'s late answer reaches no later kernel; its exit fails what it held and the next call starts a fresh one', own, async t => {
  const host = await startHost(t, {node, services: {svc: `${SLEEP}let calls = 0;
    export async function handleRpc(request) {
      calls++;
      if (request.op === 'slow') { await sleep(800); return 'LATE'; }
      if (request.op === 'die') setTimeout(() => process.exit(7), 20);
      if (request.op === 'die') return new Promise(() => {});
      return calls;
    }`}});
  // Warm first: the worker's cold start counts against a cell's budget, and the short budget below must reach it.
  assert.equal(parsed(await host.js(rpc('svc', {op: 'count'}))), 1);
  assert.deepEqual(texts(await host.js(rpc('svc', {op: 'slow'}), {timeoutMs: 300})), ['js execution timed out; kernel reset, rerun your request']);
  assert.equal(parsed(await host.js(rpc('svc', {op: 'count'}))), 3, 'the same worker served the next kernel');
  await delay(700);
  assert.deepEqual(texts(await host.js('nodeRepl.write("after the late answer")')), ['after the late answer']);
  assert.deepEqual(texts(await host.call('js_reset', {})), ['js kernel reset']);
  assert.equal(parsed(await host.js(rpc('svc', {op: 'count'}))), 4, 'and survived a reset');
  const [worker] = workers(host);
  assert.ok(worker, 'one worker process');
  assert.equal(parsed(await host.js(rpcError('svc', {op: 'die'}))), TRUSTED_EXIT_SENTENCE);
  for (let i = 0; i < 100 && alive(worker.pid); i++) await delay(20);
  assert.equal(alive(worker.pid), false);
  assert.match(host.stderr(), /trusted Node process exited unexpectedly\n\nnode_repl diagnostics: \{"kernel_pid":\d+,"kernel_status":"exited\(code=7\)"/);
  assert.equal(parsed(await host.js(rpc('svc', {op: 'count'}))), 1, 'a fresh worker');
  const workerLaunches = launches(host.codexHome).filter(l => l.argv.includes(TRUSTED_WORKER));
  assert.equal(workerLaunches.length, 2);
  assert.deepEqual(workerLaunches[0].argv.slice(-4), [node, '--experimental-vm-modules', TRUSTED_WORKER, host.cwd], 'under the same sandbox as the kernel, given the working directory');
});

test('a sandbox-policy change replaces the worker with the kernel; shutdown stops both', own, async t => {
  const host = await startHost(t, {node, services: {svc: 'let calls = 0; export const handleRpc = () => ++calls;'}});
  assert.equal(parsed(await host.js(rpc('svc', {}))), 1);
  assert.equal(parsed(await host.js(rpc('svc', {}))), 2);
  assert.equal(parsed(await host.js(rpc('svc', {}), {mode: 'disabled'})), 1, 'a fresh worker for the new policy');
  const children = descendants(host.child.pid).filter(p => p.command.includes('--experimental-vm-modules'));
  assert.equal(children.length, 2, 'one kernel and one worker');
  host.child.stdin.end();
  assert.deepEqual(await host.exited, {code: 0, signal: null});
  for (let i = 0; i < 100 && children.some(p => alive(p.pid)); i++) await delay(20);
  assert.deepEqual(children.filter(p => alive(p.pid)), []);
});

test('nativePipe through the host: absolute socket paths only, bytes both ways, close seen by late listeners; the connection is the host\'s, outside the worker', own, async t => {
  const host = await startHost(t, {node, services: {pipe: `export async function handleRpc(request) {
    if (request.op === 'bad') { try { await nodeRepl.nativePipe.createConnection(request.path); return 'connected'; } catch (e) { return e.message; } }
    const events = [];
    const connection = await nodeRepl.nativePipe.createConnection(request.path);
    const closed = new Promise(resolve => connection.on('close', () => { events.push('close'); resolve(); }));
    connection.on('data', data => events.push('data:' + Buffer.from(data).toString()));
    connection.on('error', error => events.push('error:' + error.message));
    try { connection.on('end', () => {}); } catch (e) { events.push(e.message); }
    connection.write(new TextEncoder().encode('ping'));
    await closed;
    connection.on('close', () => events.push('late-close'));
    await new Promise(resolve => setTimeout(resolve, 20));
    return {events, frozen: Object.isFrozen(connection), keys: Object.keys(connection).sort()};
  }`}});
  const socket = join(host.root, 'p.sock');
  const peers = [];
  const server = createServer(c => { peers.push(c); c.on('data', d => { if (String(d) === 'ping') c.end('pong'); }); }).listen(socket);
  t.after(() => server.close());
  assert.deepEqual(parsed(await host.js(rpc('pipe', {op: 'echo', path: socket}))),
    {events: ['unsupported native pipe event: end', 'data:pong', 'close', 'late-close'], frozen: true, keys: ['end', 'off', 'on', 'write']});
  assert.equal(peers.length, 1);
  const file = join(host.root, 'not-a-socket');
  writeFileSync(file, '');
  assert.equal(parsed(await host.js(rpc('pipe', {op: 'bad', path: 'relative.sock'}))), 'native pipe path must be absolute');
  assert.equal(parsed(await host.js(rpc('pipe', {op: 'bad', path: file}))), 'native pipe path is not a socket');
  assert.match(parsed(await host.js(rpc('pipe', {op: 'bad', path: join(host.root, 'absent.sock')}))), /^native pipe path unavailable: No such file or directory \(os error 2\)$/);
  assert.equal(parsed(await host.js(rpc('pipe', {op: 'bad', path: ''}))), 'native pipe path must be a non-empty string');
});

// A supervisor under the proxy's anchor (src/mcp/upstream.mjs), as buildLaunch runs it, with fixture services and the
// sandbox disabled so a service can start a process. `wrapper` puts a Node process between the anchor and the
// supervisor, as a fixture tap does. -> {root, call(name, args), terminate()}.
async function anchoredHost(t, {services, wrapper = false}) {
  const {spawnUpstream} = await import('../../src/mcp/upstream.mjs');
  const {mkdtempSync, realpathSync, rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-anchored-worker-')));
  const cwd = join(root, 'run');
  const trusted = join(root, 'trusted');
  mkdirSync(cwd);
  mkdirSync(trusted);
  for (const [name, source] of Object.entries(services)) writeFileSync(join(trusted, `${name}.mjs`), source);
  const supervisor = fileURLToPath(new URL('../../src/repl-host/supervisor.mjs', import.meta.url));
  const args = wrapper
    ? ['-e', 'const c=require("child_process").spawn(process.argv[1],process.argv.slice(2),{stdio:"inherit"});c.on("exit",code=>process.exit(code??1));', node, '--disable-sigusr1', supervisor]
    : ['--disable-sigusr1', supervisor];
  const upstream = spawnUpstream({command: node, args, cwd,
    env: {PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, CUA_REPL_NODE_PATH: node, CUA_REPL_OWNED_GROUP: '1', CUA_REPL_TRUSTED_RPC_ENABLED: '1',
      CUA_REPL_TRUSTED_SERVICES: JSON.stringify(Object.fromEntries(Object.keys(services).map(name => [name, join(trusted, `${name}.mjs`)]))), CUA_REPL_TRUSTED_CODE_PATHS: trusted}}, {stderr: 'ignore'});
  const pending = new Map();
  upstream.onMessage(msg => { pending.get(msg.id)?.(msg); pending.delete(msg.id); });
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); upstream.send({jsonrpc: '2.0', id: n, method, params}); });
  await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '0'}});
  const disabled = {'codex/sandbox-state-meta': {permissionProfile: {type: 'disabled'}, sandboxCwd: pathToFileURL(cwd).href}};
  t.after(async () => { await upstream.terminate({budgetMs: 3000}); rmSync(root, {recursive: true, force: true}); });
  return {root, call: async (name, args) => (await request('tools/call', {name, arguments: args, _meta: disabled})).result, terminate: () => upstream.terminate({budgetMs: 3000})};
}

// A service that starts a long-lived helper (as the Linux sky service starts sky_linux) and reports its pid.
const HELPER_SERVICE = {helper: `import {spawn} from 'node:child_process';
  let helper = null;
  export async function handleRpc(request) {
    if (request.op === 'start') { helper = spawn('/bin/sleep', ['30'], {stdio: 'ignore'}); return helper.pid; }
    if (request.op === 'die') { setTimeout(() => process.exit(3), 20); return new Promise(() => {}); }
    return process.pid;
  }`};

for (const wrapper of [false, true]) {
  test(`in the owned group${wrapper ? ', under a wrapper between the anchor and the host,' : ''} a kernel's end never reaps the trusted worker or its helper; the worker's own end reaps its helper but never the live kernel`, own, async t => {
    const host = await anchoredHost(t, {services: HELPER_SERVICE, wrapper});
    const helper = JSON.parse(texts(await host.call('js', {code: rpc('helper', {op: 'start'})}))[0]);
    const worker = JSON.parse(texts(await host.call('js', {code: rpc('helper', {op: 'pid'})}))[0]);
    const fatal = await host.call('js', {code: 'setTimeout(()=>{throw new Error("late")},10);await new Promise(r=>setTimeout(r,300));'});
    assert.match(fatal.content[0].text, /^node_repl kernel uncaught exception: late/);
    await delay(500);
    assert.deepEqual(texts(await host.call('js_reset', {})), ['js kernel reset']);
    await delay(300);
    assert.equal(alive(worker), true, 'the worker survived the kernel\'s crash and reset');
    assert.equal(alive(helper), true, 'and so did its helper');
    assert.equal(JSON.parse(texts(await host.call('js', {code: rpc('helper', {op: 'pid'})}))[0]), worker, 'the same worker still answers');
    assert.deepEqual(texts(await host.call('js', {code: 'let kept = 41; nodeRepl.write("set")'})), ['set']);
    const died = await host.call('js', {code: rpcError('helper', {op: 'die'})});
    assert.deepEqual({text: texts(died), isError: died.isError}, {text: [JSON.stringify(TRUSTED_EXIT_SENTENCE)], isError: false},
      'the worker\'s exit during an awaited call is a catchable rejection in the cell, not the kernel\'s death');
    for (let i = 0; i < 150 && alive(helper); i++) await delay(20);
    assert.equal(alive(helper), false, 'the dead worker\'s helper was reaped with it');
    assert.deepEqual(texts(await host.call('js', {code: 'nodeRepl.write(kept + 1)'})), ['42'], 'the live kernel and its bindings survived the worker\'s cleanup');
    assert.equal((await host.terminate()).confirmed, true);
  });
}


// A service that holds one nativePipe connection across calls: open it, then send `ping` and await the echo.
const HELD_PIPE_SERVICE = {pipe: `let connection = null, waiting = null, closed = false;
  export async function handleRpc(request) {
    if (request.op === 'open') {
      connection = await nodeRepl.nativePipe.createConnection(request.path);
      connection.on('data', data => waiting?.(Buffer.from(data).toString()));
      connection.on('close', () => { closed = true; waiting?.('closed'); });
      return 'open';
    }
    if (closed) return 'closed';
    const echoed = new Promise(resolve => { waiting = resolve; });
    connection.write(new TextEncoder().encode('ping'));
    return echoed;
  }`};

// macOS connects a long socket path through a connector process, a child of the supervisor that holds the connection.
test('in the owned group, a long-path connection the worker holds survives a kernel\'s crash and reset: its connector is never reaped', {skip: own.skip || (process.platform !== 'darwin' && 'long socket paths connect only on macOS')}, async t => {
  const host = await anchoredHost(t, {services: HELD_PIPE_SERVICE});
  const dir = join(host.root, 'd'.repeat(192 - host.root.length - '/s.sock'.length - 1));
  mkdirSync(dir);
  const path = join(dir, 's.sock');
  assert.equal(Buffer.byteLength(path), 192);
  const alias = join(host.root, 'a');
  symlinkSync(dir, alias);
  const server = createServer(c => { c.on('error', () => {}); c.on('data', d => c.write(d)); }).listen(join(alias, 's.sock'));
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  assert.deepEqual(texts(await host.call('js', {code: rpc('pipe', {op: 'open', path})})), ['"open"']);
  assert.deepEqual(texts(await host.call('js', {code: rpc('pipe', {op: 'ping'})})), ['"ping"']);
  const fatal = await host.call('js', {code: 'setTimeout(()=>{throw new Error("late")},10);await new Promise(r=>setTimeout(r,300));'});
  assert.match(fatal.content[0].text, /^node_repl kernel uncaught exception: late/);
  await delay(500);
  assert.deepEqual(texts(await host.call('js_reset', {})), ['js kernel reset']);
  await delay(300);
  assert.deepEqual(texts(await host.call('js', {code: rpc('pipe', {op: 'ping'})})), ['"ping"'], 'the same connection still echoes');
  assert.equal((await host.terminate()).confirmed, true);
});

test('launchServices.openApplication reaches the host\'s LaunchServices boundary (mocked) from trusted code, normalized, and only for the running execution', own, async t => {
  const {createSupervisor} = await import('../../src/repl-host/supervisor.mjs');
  const {PassThrough} = await import('node:stream');
  const {createInterface} = await import('node:readline');
  const {mkdtempSync, realpathSync, rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-ls-')));
  const trusted = join(root, 'trusted');
  mkdirSync(trusted);
  writeFileSync(join(trusted, 'ls.mjs'), `export async function handleRpc(request) {
    try { return await nodeRepl.launchServices.openApplication(request.target); } catch (e) { return {rejected: e.message}; }
  }`);
  const opened = [];
  const input = new PassThrough(), output = new PassThrough();
  const supervisor = createSupervisor({input, output, cwd: root, log: () => {},
    env: {PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, CUA_REPL_NODE_PATH: node, CUA_REPL_TRUSTED_RPC_ENABLED: '1',
      CUA_REPL_TRUSTED_SERVICES: JSON.stringify({ls: join(trusted, 'ls.mjs')}), CUA_REPL_TRUSTED_CODE_PATHS: trusted},
    launchServices: async message => { opened.push(message); if (message.bundle_identifier === 'com.example.missing') throw new Error('failed to dispatch LaunchServices open: not found'); }});
  t.after(async () => { await supervisor.shutdown(); rmSync(root, {recursive: true, force: true}); });
  const pending = new Map();
  createInterface({input: output}).on('line', line => { const msg = JSON.parse(line); pending.get(msg.id)?.(msg); });
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); input.write(`${JSON.stringify({jsonrpc: '2.0', id: n, method, params})}\n`); });
  await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '0'}});
  const disabled = {'codex/sandbox-state-meta': {permissionProfile: {type: 'disabled'}, sandboxCwd: pathToFileURL(root).href}};
  const open = async target => JSON.parse((await request('tools/call', {name: 'js', arguments: {code: rpc('ls', {target})}, _meta: disabled})).result.content[0].text);
  assert.deepEqual(await open({bundleIdentifier: '  com.example.app  '}), {});
  assert.deepEqual(await open({applicationPath: '/Applications/Example.app'}), {});
  assert.deepEqual(await open({bundleIdentifier: 'com.example.missing'}), {rejected: 'failed to dispatch LaunchServices open: not found'});
  assert.deepEqual(await open({bundleIdentifier: 'a', applicationPath: '/b'}), {rejected: 'nodeRepl.launchServices.openApplication expected exactly one of applicationPath or bundleIdentifier'});
  assert.deepEqual(await open({bundle: 'x'}), {rejected: 'nodeRepl.launchServices.openApplication received an unsupported target'});
  assert.deepEqual(opened.map(({type, action, application_path, bundle_identifier}) => ({type, action, application_path, bundle_identifier})), [
    {type: 'launch_services_action', action: 'open_application', application_path: undefined, bundle_identifier: 'com.example.app'},
    {type: 'launch_services_action', action: 'open_application', application_path: '/Applications/Example.app', bundle_identifier: undefined},
    {type: 'launch_services_action', action: 'open_application', application_path: undefined, bundle_identifier: 'com.example.missing'},
  ], 'normalized by the worker; refused targets never reach the boundary');
});

test('a worker that dies inside withSuspendedTimeout releases its suspensions: a cell that catches the exit is still held to its budget', own, async t => {
  const host = await startHost(t, {node, services: {svc: `${SLEEP}export async function handleRpc(request) {
    if (request.op === 'warm') return 'warm';
    return nodeRepl.withSuspendedTimeout(() => nodeRepl.withSuspendedTimeout(async () => { setTimeout(() => process.exit(5), 50); await sleep(10_000); }));
  }`}});
  assert.deepEqual(texts(await host.js(rpc('svc', {op: 'warm'}))), ['"warm"']);
  const started = performance.now();
  const result = await host.js(`try { await nodeRepl.rpc('svc', {op: 'die'}); } catch {} await new Promise(r => setTimeout(r, 1200)); nodeRepl.write('carried on');`, {timeoutMs: 300});
  const elapsed = performance.now() - started;
  assert.deepEqual({text: texts(result), isError: result.isError}, {text: ['js execution timed out; kernel reset, rerun your request'], isError: true},
    `the budget fires after the catch (${Math.round(elapsed)} ms)`);
  assert.ok(elapsed < 1100, `within the budget left after the worker's death, not after the 1,200 ms wait (${Math.round(elapsed)} ms)`);
});

test('a bare createElicitation suspends the cell\'s budget until the client answers, as the vendor host does', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {elicit: ELICIT_SERVICE},
    onServerRequest: () => delay(650).then(() => ({result: {action: 'accept', content: {name: 'late'}}}))});
  assert.equal(texts(await host.js('nodeRepl.write("warm")'))[0], 'warm');
  assert.equal((await host.js(rpcError('elicit', {message: 'warm', schema: SCHEMA}))).isError, false, 'the worker is warm');
  const started = performance.now();
  const answered = await host.js(rpc('elicit', {message: 'slow', schema: SCHEMA}), {timeoutMs: 300});
  assert.deepEqual(parsed(answered), {action: 'accept', content: {name: 'late'}, _meta: null}, `a 650 ms answer inside a 300 ms budget (${Math.round(performance.now() - started)} ms)`);
  const after = await host.js(`${rpc('elicit', {message: 'slow', schema: SCHEMA})}; await new Promise(() => {});`, {timeoutMs: 300});
  assert.deepEqual(texts(after), ['js execution timed out; kernel reset, rerun your request'], 'the budget resumes once answered');
});

test('response meta merges across a cell\'s rpcs and its after-code hooks, as the vendor host does', own, async t => {
  const host = await startHost(t, {node, services: {meta: `let hooked = false;
    export async function handleRpc(request) {
      if (request.hook && !hooked) { hooked = true; nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 1000, run: () => nodeRepl.setResponseMeta({third: 3, replaced: 'by-hook'})}); }
      nodeRepl.setResponseMeta(request.meta);
      return 'set';
    }`}});
  const result = await host.js(`await nodeRepl.rpc('meta', {meta: {first: 1, replaced: 'first'}}); await nodeRepl.rpc('meta', {meta: {second: 2}, hook: true}); nodeRepl.write('ok');`);
  const {'codex/nodeReplExecutionDurationMs': _d, [REPL_HOST_META_KEY]: _m, ...meta} = result._meta;
  assert.deepEqual(meta, {first: 1, replaced: 'by-hook', second: 2, third: 3});
  assert.deepEqual(Object.keys(meta), ['first', 'replaced', 'second', 'third']);
});

// A ready worker whose trusted code blocks its event loop: the host bounds what it waits for from it by the deadlines
// the worker reported for its handlers plus a margin, then stops it, so turn ends, cells and the EOF drain all finish.
// The after-code hook is registered disarmed, so the registering cell's own hooks finish; the cell that arms it is
// the one whose hooks block.
const BLOCKING_SERVICE = {svc: `let n = 0, armed = false;
  export async function handleRpc(request) {
    n++;
    if (request.op === 'turn-handler') nodeRepl.addTurnEndedHandler({timeoutMs: 200, run: () => {}});
    if (request.op === 'hook-blocks') nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 200, run: () => { if (armed) for (;;) {} }});
    if (request.op === 'arm') armed = true;
    if (request.op === 'block-soon') setTimeout(() => { for (;;) {} }, 50);
    return {worker: process.pid, n};
  }`};

test('a turn end whose worker never answers is acknowledged within its handlers\' deadline plus the margin, once for its duplicates, and the worker is stopped', own, async t => {
  const host = await startHost(t, {node, services: BLOCKING_SERVICE});
  const first = parsed(await host.js(rpc('svc', {op: 'turn-handler'})));
  await host.js(rpc('svc', {op: 'block-soon'}));
  await delay(200);
  const started = performance.now();
  const [a, b] = await Promise.all([1, 2].map(() => host.call('turn_ended', {hook_event_name: 'Stop', session_id: 's', turn_id: 't'})));
  const elapsed = performance.now() - started;
  assert.deepEqual([texts(a), texts(b)], [['{}'], ['{}']]);
  assert.ok(elapsed >= 200 + TURN_MARGIN_MS - 300 && elapsed < 200 + TURN_MARGIN_MS + 2500, `bounded by 200 ms + the margin (${Math.round(elapsed)} ms)`);
  for (let i = 0; i < 100 && alive(first.worker); i++) await delay(20);
  assert.equal(alive(first.worker), false, 'the non-answering worker was stopped');
  assert.match(host.stderr(), /trusted Node process did not answer turn_ended within \d+ ms; stopping it/);
  assert.equal(parsed(await host.js(rpc('svc', {op: 'count'}))).n, 1, 'the next request starts a fresh worker');
});

test('an after-code hook that blocks its worker no longer holds the cell: the result comes within the hooks\' deadline plus the margin, and the worker is stopped', own, async t => {
  const host = await startHost(t, {node, services: BLOCKING_SERVICE});
  const first = parsed(await host.js(rpc('svc', {op: 'hook-blocks'})));
  assert.equal(first.n, 1);
  assert.doesNotMatch(host.stderr(), /did not answer run_hooks/, 'the registering cell\'s hooks finished');
  const started = performance.now();
  const result = await host.js(`${rpc('svc', {op: 'arm'})}; nodeRepl.write("cell done")`);
  const elapsed = performance.now() - started;
  assert.equal(result.isError, false);
  assert.deepEqual(texts(result), [`${JSON.stringify({n: 2, worker: first.worker})}cell done`], 'the arming cell\'s own result');
  assert.ok(elapsed >= 200 + TURN_MARGIN_MS - 300 && elapsed < 200 + TURN_MARGIN_MS + 2500, `held by the blocked hooks, then bounded (${Math.round(elapsed)} ms)`);
  for (let i = 0; i < 100 && alive(first.worker); i++) await delay(20);
  assert.equal(alive(first.worker), false);
  assert.match(host.stderr(), /trusted Node process did not answer run_hooks within \d+ ms; stopping it/);
});

test('EOF while a cell waits on a blocked worker\'s hooks and a turn end waits on it: the host still exits within the bound', own, async t => {
  const host = await startHost(t, {node, services: BLOCKING_SERVICE});
  await host.js(rpc('svc', {op: 'turn-handler'}));
  await host.js(rpc('svc', {op: 'hook-blocks'}));
  assert.doesNotMatch(host.stderr(), /did not answer/, 'registration finished normally');
  const cell = host.js(`${rpc('svc', {op: 'arm'})}; nodeRepl.write("x")`);
  await delay(300);
  const turn = host.call('turn_ended', {hook_event_name: 'Stop', session_id: 's', turn_id: 'eof'});
  await delay(100);
  const state = p => Promise.race([p.then(() => 'settled', () => 'settled'), delay(0).then(() => 'pending')]);
  assert.deepEqual([await state(cell), await state(turn)], ['pending', 'pending'], 'the cell and the turn wait on the blocked worker when EOF comes');
  const started = performance.now();
  host.child.stdin.end();
  assert.deepEqual(await host.exited, {code: 0, signal: null});
  assert.ok(performance.now() - started < 200 + TURN_MARGIN_MS + 4000, `exited within the bound (${Math.round(performance.now() - started)} ms)`);
  assert.match(texts(await cell).join(''), /^\{"n":3,"worker":\d+\}x$/, 'the admitted cell was still answered');
  assert.deepEqual(texts(await turn), ['{}']);
});
