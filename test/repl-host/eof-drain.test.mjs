// cua's own REPL host's EOF drain (src/repl-host/supervisor.mjs) is bounded even when what the admitted work waits on
// can no longer arrive: a cell whose budget a service request suspended and whose worker went silent, an elicitation
// the departed client will never answer, and a kernel that never reports its result. A real supervisor, kernel and
// trusted worker over MCP (supervisor-harness.mjs), with fixture trusted services. Needs Node 24 or later (CUA_NODE);
// skips visibly otherwise.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kernelNode} from './kernel-harness.mjs';
import {alive, descendants, startHost, texts} from './supervisor-harness.mjs';
import {DRAIN_MARGIN_MS, SHUTTING_DOWN_SENTENCE, TIMEOUT_SENTENCE, TURN_MARGIN_MS} from '../../src/repl-host/supervisor.mjs';
import {ELICITATION_CANCELLED_SENTENCE} from '../../src/repl-host/elicitation.mjs';

const {node, skip} = kernelNode();
// Bounded, so a host that never exits fails its test rather than the run; generous, since that is all it claims.
const own = {skip, timeout: 60_000};
// What 'answered at once' means beside the cell's 30 s default budget: half of it, a liveness bound and no speed claim.
const NOT_HELD_MS = 15_000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const SLEEP = 'const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));\n';
const rpc = (service, request) => `nodeRepl.write(JSON.stringify(await nodeRepl.rpc(${JSON.stringify(service)}, ${JSON.stringify(request)})));`;
const rpcCaught = (service, request) => `try { ${rpc(service, request)} } catch (e) { nodeRepl.write(JSON.stringify({rejected: e.message})); }`;
const state = promise => Promise.race([promise.then(() => 'settled', () => 'settled'), delay(0).then(() => 'pending')]);

// Ends the host's stdin -> {elapsed, status} once it exited; every process it started must be gone too.
async function endInput(host) {
  const children = descendants(host.child.pid);
  const started = performance.now();
  host.child.stdin.end();
  const status = await host.exited;
  const elapsed = performance.now() - started;
  for (let i = 0; i < 100 && children.some(p => alive(p.pid)); i++) await delay(20);
  assert.deepEqual(children.filter(p => alive(p.pid)).map(p => p.command), [], 'the host\'s children are gone');
  return {elapsed, status};
}

const SUSPENDING_SERVICE = {svc: `${SLEEP}export async function handleRpc(request) {
  if (request.op === 'warm') return 'warm';
  // Suspends the cell's budget, then the worker goes silent: its event loop blocks, so nothing resumes it.
  if (request.op === 'suspend-then-silent') return nodeRepl.withSuspendedTimeout(async () => { setTimeout(() => { for (;;) {} }, 50); await new Promise(() => {}); });
  // Suspends only after a while: by then the drain may have begun.
  if (request.op === 'suspend-late') { await sleep(request.after); await nodeRepl.withSuspendedTimeout(() => sleep(10_000)); return 'unreachable'; }
}`};

test('EOF while a service request holds the cell\'s budget suspended and its worker is silent: the budget resumes, the cell times out on what was left, the host exits', own, async t => {
  const host = await startHost(t, {node, services: SUSPENDING_SERVICE});
  assert.deepEqual(texts(await host.js(rpc('svc', {op: 'warm'}))), ['"warm"']);
  const cell = host.js(rpc('svc', {op: 'suspend-then-silent'}), {timeoutMs: 1500});
  await delay(2000);
  assert.equal(await state(cell), 'pending', 'on a live connection the suspended budget holds the cell past its 1,500 ms');
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  const result = await cell;
  assert.deepEqual({text: texts(result), isError: result.isError}, {text: [TIMEOUT_SENTENCE], isError: true});
  assert.ok(elapsed >= 1000 && elapsed < 1500 + 2500, `the budget left (about 1,500 ms) ran out after EOF, then the host exited (${Math.round(elapsed)} ms)`);
});

test('during the drain a new budget suspension is refused: the cell is held to its budget', own, async t => {
  const host = await startHost(t, {node, services: SUSPENDING_SERVICE});
  assert.deepEqual(texts(await host.js(rpc('svc', {op: 'warm'}))), ['"warm"']);
  const cell = host.js(rpc('svc', {op: 'suspend-late', after: 300}), {timeoutMs: 1200});
  await delay(100);
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  assert.deepEqual(texts(await cell), [TIMEOUT_SENTENCE]);
  assert.ok(elapsed < 1200 + 2500, `the 10 s suspension did not pause the budget (${Math.round(elapsed)} ms)`);
});

const ELICIT_SERVICE = {elicit: `export async function handleRpc(request) {
  if (request.warm) return 'warm';
  const ask = message => nodeRepl.createElicitation({message, requestedSchema: {type: 'object', properties: {ok: {type: 'boolean'}}}});
  // Asks only once an earlier request was withdrawn, which the host does when the drain begins.
  if (request.afterWithdrawn) { try { await ask(request.afterWithdrawn); } catch {} }
  return await ask(request.message);
}`};

test('EOF while an elicitation awaits a client that never answers: the request is cancelled, the service is told why, the cell finishes and the host exits', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: ELICIT_SERVICE});
  const cell = host.js(rpcCaught('elicit', {message: 'approve?'}));
  for (const until = Date.now() + NOT_HELD_MS; !host.serverRequests.some(m => m.method === 'elicitation/create') && Date.now() < until;) await delay(20);
  const [asked] = host.serverRequests.filter(m => m.method === 'elicitation/create');
  assert.ok(asked, 'the client was asked');
  await delay(500);
  assert.equal(await state(cell), 'pending', 'on a live connection the cell waits for the answer');
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  assert.ok(elapsed < NOT_HELD_MS, `not held to the cell's 30 s budget (${Math.round(elapsed)} ms)`);
  assert.deepEqual(texts(await cell), [JSON.stringify({rejected: ELICITATION_CANCELLED_SENTENCE})], 'nothing granted, and the service is told the truth');
  const cancelled = host.frames.filter(m => m.method === 'notifications/cancelled');
  assert.deepEqual(cancelled.map(m => m.params.requestId), [asked.id], 'the client is told the request is withdrawn');
  assert.equal(typeof cancelled[0].params.reason, 'string');
});

test('during the drain a new elicitation is not asked of the departed client: the service is told at once', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: ELICIT_SERVICE});
  assert.deepEqual(texts(await host.js(rpc('elicit', {warm: true}))), ['"warm"']);
  // Ordered by events, not by a delay: the service asks 'late' only after its first request was withdrawn, and the
  // host withdraws it when the drain begins.
  const cell = host.js(rpcCaught('elicit', {afterWithdrawn: 'first', message: 'late'}));
  for (const until = Date.now() + NOT_HELD_MS; !host.serverRequests.some(m => m.method === 'elicitation/create') && Date.now() < until;) await delay(20);
  const [first] = host.serverRequests.filter(m => m.method === 'elicitation/create');
  assert.equal(first?.params.message, 'first', 'the client was asked the first request');
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  assert.ok(elapsed < NOT_HELD_MS, `not held to the cell's 30 s budget (${Math.round(elapsed)} ms)`);
  assert.deepEqual(host.frames.filter(m => m.method === 'notifications/cancelled').map(m => m.params.requestId), [first.id], 'the first was withdrawn');
  assert.deepEqual(texts(await cell), [JSON.stringify({rejected: ELICITATION_CANCELLED_SENTENCE})]);
  assert.deepEqual(host.serverRequests.filter(m => m.method === 'elicitation/create' && m.params.message === 'late'), []);
});

test('EOF while the kernel never reports its result (its event loop blocked during the after-code hooks): once its hooks answered, the drain gives the kernel DRAIN_MARGIN_MS, then answers that the host is shutting down and stops the children', own, async t => {
  const host = await startHost(t, {node, services: {hooks: `${SLEEP}export async function handleRpc() {
    nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 500, run: () => sleep(300)});
    return 'registered';
  }`}});
  assert.deepEqual(texts(await host.js(rpc('hooks', {}))), ['"registered"']);
  const cell = host.js('setTimeout(() => { for (;;) {} }, 100); nodeRepl.write("x")');
  await delay(800);
  assert.equal(await state(cell), 'pending', 'the budget ended with the submitted code, the hooks answered, and the kernel never answers');
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  const result = await cell;
  assert.deepEqual({text: texts(result), isError: result.isError}, {text: [SHUTTING_DOWN_SENTENCE], isError: true});
  assert.ok(elapsed >= DRAIN_MARGIN_MS - 300 && elapsed < DRAIN_MARGIN_MS + 2500, `the margin after the hooks' answer, then forced (${Math.round(elapsed)} ms)`);
  assert.match(host.stderr(), /EOF drain did not finish within \d+ ms; stopping/);
});

// A service whose `register` adds an after-code hook that runs `ms` and declares `timeoutMs`.
const LATE_HOOK_SERVICE = {hooks: `${SLEEP}export async function handleRpc(request) {
  if (request.op === 'warm') return 'warm';
  nodeRepl.addAfterSubmittedCodeHook({timeoutMs: request.timeoutMs, run: async () => { await sleep(request.ms); nodeRepl.write('hook done'); }});
  return 'registered';
}`};
const lateHookCell = (ms, timeoutMs) => `await new Promise(r => setTimeout(r, 300)); ${rpc('hooks', {op: 'register', ms, timeoutMs})} nodeRepl.write(" done");`;

test('a hook registered after the drain began keeps its own declared bound: the cell completes, not shut down at a deadline taken at EOF', own, async t => {
  const host = await startHost(t, {node, services: LATE_HOOK_SERVICE});
  assert.deepEqual(texts(await host.js(rpc('hooks', {op: 'warm'}))), ['"warm"'], 'a warm worker with no hooks');
  const cell = host.js(lateHookCell(5500, 6500), {timeoutMs: 1000});
  await delay(100);
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  const result = await cell;
  assert.deepEqual({text: texts(result), isError: result.isError}, {text: ['"registered" donehook done'], isError: false});
  assert.ok(elapsed >= 5500, `the 5,500 ms hook ran to its end (${Math.round(elapsed)} ms)`);
  assert.doesNotMatch(host.stderr(), /EOF drain did not finish/);
});

test('a worker first started during the drain gets its hooks\' declared bound too', own, async t => {
  const host = await startHost(t, {node, services: LATE_HOOK_SERVICE});
  assert.deepEqual(texts(await host.js('nodeRepl.write("kernel warm")')), ['kernel warm'], 'no worker yet');
  const cell = host.js(lateHookCell(5500, 7000), {timeoutMs: 3000});
  await delay(100);
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  const result = await cell;
  assert.deepEqual({text: texts(result), isError: result.isError}, {text: ['"registered" donehook done'], isError: false});
  assert.ok(elapsed >= 5500, `the 5,500 ms hook ran to its end (${Math.round(elapsed)} ms)`);
  assert.doesNotMatch(host.stderr(), /EOF drain did not finish/);
});
