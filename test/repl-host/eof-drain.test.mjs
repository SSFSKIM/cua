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
// Bounded, so a host that never exits fails its test rather than the run.
const own = {skip, timeout: 30_000};
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

const ELICIT_SERVICE = {elicit: `${SLEEP}export async function handleRpc(request) {
  if (request.warm) return 'warm';
  if (request.after) await sleep(request.after);
  return await nodeRepl.createElicitation({message: request.message, requestedSchema: {type: 'object', properties: {ok: {type: 'boolean'}}}});
}`};

test('EOF while an elicitation awaits a client that never answers: the request is cancelled, the service is told why, the cell finishes and the host exits', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: ELICIT_SERVICE});
  const cell = host.js(rpcCaught('elicit', {message: 'approve?'}));
  for (let i = 0; i < 250 && !host.serverRequests.some(m => m.method === 'elicitation/create'); i++) await delay(20);
  const [asked] = host.serverRequests.filter(m => m.method === 'elicitation/create');
  assert.ok(asked, 'the client was asked');
  await delay(500);
  assert.equal(await state(cell), 'pending', 'on a live connection the cell waits for the answer');
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  assert.ok(elapsed < 2500, `not held to the cell's 30 s budget (${Math.round(elapsed)} ms)`);
  assert.deepEqual(texts(await cell), [JSON.stringify({rejected: ELICITATION_CANCELLED_SENTENCE})], 'nothing granted, and the service is told the truth');
  const cancelled = host.frames.filter(m => m.method === 'notifications/cancelled');
  assert.deepEqual(cancelled.map(m => m.params.requestId), [asked.id], 'the client is told the request is withdrawn');
  assert.equal(typeof cancelled[0].params.reason, 'string');
});

test('during the drain a new elicitation is not asked of the departed client: the service is told at once', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: ELICIT_SERVICE});
  assert.deepEqual(texts(await host.js(rpc('elicit', {warm: true}))), ['"warm"']);
  const cell = host.js(rpcCaught('elicit', {message: 'late', after: 300}));
  await delay(100);
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  assert.ok(elapsed < 2500, `${Math.round(elapsed)} ms`);
  assert.deepEqual(texts(await cell), [JSON.stringify({rejected: ELICITATION_CANCELLED_SENTENCE})]);
  assert.deepEqual(host.serverRequests.filter(m => m.method === 'elicitation/create' && m.params.message === 'late'), []);
});

test('EOF while the kernel never reports its result (its event loop blocked during the after-code hooks): the drain gives up at its deadline, answers that the host is shutting down and stops the children', own, async t => {
  const host = await startHost(t, {node, services: {hooks: `${SLEEP}export async function handleRpc() {
    nodeRepl.addAfterSubmittedCodeHook({timeoutMs: 500, run: () => sleep(300)});
    return 'registered';
  }`}});
  assert.deepEqual(texts(await host.js(rpc('hooks', {}))), ['"registered"']);
  const cell = host.js('setTimeout(() => { for (;;) {} }, 100); nodeRepl.write("x")');
  await delay(800);
  assert.equal(await state(cell), 'pending', 'the budget ended with the submitted code, and the kernel never answers');
  const {elapsed, status} = await endInput(host);
  assert.deepEqual(status, {code: 0, signal: null});
  const result = await cell;
  assert.deepEqual({text: texts(result), isError: result.isError}, {text: [SHUTTING_DOWN_SENTENCE], isError: true});
  const deadline = 500 + TURN_MARGIN_MS + DRAIN_MARGIN_MS;
  assert.ok(elapsed >= deadline - 300 && elapsed < deadline + 2500, `the hooks' deadline and the margins, then forced (${Math.round(elapsed)} ms)`);
  assert.match(host.stderr(), /EOF drain did not finish within \d+ ms; stopping/);
});
