// A child that never finishes starting is replaced, not waited on forever (M2 task 3). Under the macOS sandbox a child's
// start-up can block for good (its time zone's launchd lookup: test/repl-host/kernel-runtime.test.mjs, evidence under
// docs/evidence/2026-10-14-own-repl-host-parity/m2/history-hang/). The shared runtime announces `runtime_ready` once it
// has loaded; the supervisor holds a child's work until then, replaces a child not ready within its bound, a few times
// at most, and then fails the waiting work with a sentence. These tests drive the supervisor with child doubles (the
// kernel-child seam); the real announcement is checked against a real kernel at the end.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createSupervisor, TRUSTED_WORKER} from '../../src/repl-host/supervisor.mjs';
import {kernelNode, startKernel as startRealKernel} from './kernel-harness.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const DISABLED = {'codex/sandbox-state-meta': {permissionProfile: {type: 'disabled'}, sandboxCwd: 'file:///fixture/run'}};

// A supervisor over child doubles. `behaviour(kind, n)` says how the n-th child of `kind` ('kernel' | 'worker') acts:
// {ready: boolean}. Ready kernels answer exec (and a cell's one rpc, through the worker); ready workers answer service,
// run_hooks and turn_ended.
function host({behaviour, readyTimeoutMs = 100, env = {}}) {
  const counts = {kernel: 0, worker: 0};
  const children = [];
  const logs = [];
  const startKernel = (launch, {onMessage, onEnd}) => {
    const kind = launch.args.includes(TRUSTED_WORKER) ? 'worker' : 'kernel';
    const n = ++counts[kind];
    const {ready} = behaviour(kind, n);
    const child = {kind, n, received: [], stopped: false};
    children.push(child);
    if (ready) setImmediate(() => onMessage({type: 'runtime_ready'}));
    return {
      pid: undefined,
      send(message) {
        child.received.push(message);
        if (!ready || child.stopped) return true;
        setImmediate(() => {
          if (kind === 'kernel' && message.type === 'exec') {
            if (message.code === 'rpc') onMessage({type: 'trusted_service_request', id: `${message.id}-trusted-rpc-0`, exec_id: message.id, service: 'svc', request: {}});
            else onMessage({type: 'exec_result', id: message.id, ok: true, output: `ran on kernel ${n}`, named_outputs: []});
          }
          if (kind === 'kernel' && message.type === 'trusted_service_response')
            onMessage({type: 'exec_result', id: message.id.split('-trusted-rpc-')[0], ok: message.ok, output: message.ok ? `service said ${message.value}` : '', named_outputs: [], error: message.error ?? null});
          if (kind === 'worker' && message.type === 'service') onMessage({type: 'trusted_service_response', id: message.id, ok: true, value: `worker ${n}`, output: [], content_items: []});
          if (kind === 'worker' && message.type === 'turn_ended') onMessage({type: 'turn_ended_result', id: message.id});
        });
        return true;
      },
      async stop() { child.stopped = true; onEnd({expected: true, diagnostic: ''}); },
    };
  };
  const input = new PassThrough(), output = new PassThrough();
  const replies = new Map();
  output.setEncoding('utf8').on('data', chunk => { for (const line of chunk.split('\n').filter(Boolean)) { const msg = JSON.parse(line); replies.get(msg.id)?.(msg); } });
  const supervisor = createSupervisor({input, output, cwd: '/fixture/run', startKernel, readyTimeoutMs, log: line => logs.push(line),
    env: {CUA_REPL_NODE_PATH: '/fixture/node', PATH: '/usr/bin:/bin', CUA_REPL_TRUSTED_RPC_ENABLED: '1', CUA_REPL_TRUSTED_SERVICES: JSON.stringify({svc: '/fixture/svc.mjs'}), ...env}});
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; replies.set(n, resolve); input.write(`${JSON.stringify({jsonrpc: '2.0', id: n, method, params})}\n`); });
  const js = async (code, timeoutMs) => (await request('tools/call', {name: 'js', arguments: {code, ...(timeoutMs ? {timeout_ms: timeoutMs} : {})}, _meta: DISABLED})).result;
  const turn = async () => (await request('tools/call', {name: 'turn_ended', arguments: {hook_event_name: 'Stop', session_id: 's', turn_id: 't'}, _meta: DISABLED})).result;
  return {supervisor, input, children, logs, request, js, turn, init: () => request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '0'}})};
}
const text = result => result.content.map(c => c.text).join('');

test('a kernel that does not finish starting is replaced; the cell runs on the one that does, and nothing was sent to the stuck one', async () => {
  const h = host({behaviour: (kind, n) => ({ready: !(kind === 'kernel' && n === 1)})});
  await h.init();
  assert.equal(text(await h.js('1')), 'ran on kernel 2');
  const [stuck, replacement] = h.children.filter(c => c.kind === 'kernel');
  assert.equal(stuck.stopped, true);
  assert.deepEqual(stuck.received, [], 'no exec reached the child that never became ready');
  assert.equal(replacement.received[0].type, 'exec');
  assert.match(h.logs.join('\n'), /kernel did not start within 100 ms; starting another \(attempt 2 of 3\)/);
  h.input.end();
  await h.supervisor.closed;
});

test('when no kernel starts, the call is answered with a sentence, not left waiting', async () => {
  const h = host({behaviour: () => ({ready: false})});
  await h.init();
  const result = await h.js('1');
  assert.deepEqual({text: text(result), isError: result.isError}, {text: 'failed to start Node runtime: the kernel did not start within 100 ms, 3 attempts', isError: true});
  assert.equal(h.children.filter(c => c.kind === 'kernel').length, 3);
  assert.ok(h.children.every(c => c.stopped));
  h.input.end();
  await h.supervisor.closed;
});

test('the cell\'s budget still governs: a budget spent while the kernel starts answers with the timeout, and no exec is sent', async () => {
  const h = host({behaviour: () => ({ready: false}), readyTimeoutMs: 400});
  await h.init();
  const result = await h.js('1', 150);
  assert.equal(text(result), 'js execution timed out; kernel reset, rerun your request');
  await delay(500);
  assert.ok(h.children.every(c => c.received.length === 0));
  h.input.end();
  await h.supervisor.closed;
});

test('a trusted worker that does not finish starting is replaced; what was held for it reaches the one that does', async () => {
  const h = host({behaviour: (kind, n) => ({ready: !(kind === 'worker' && n === 1)})});
  await h.init();
  assert.equal(text(await h.js('rpc')), 'service said worker 2');
  const [stuck, replacement] = h.children.filter(c => c.kind === 'worker');
  assert.equal(stuck.stopped, true);
  assert.deepEqual(stuck.received, [], 'the held request was not written to the stuck child');
  assert.deepEqual(replacement.received.map(m => m.type), ['service']);
  assert.equal(text(await h.turn()), '{}');
  assert.match(h.logs.join('\n'), /trusted Node process did not start within 100 ms; starting another \(attempt 2 of 3\)/);
  h.input.end();
  await h.supervisor.closed;
});

test('when no trusted worker starts, the cell\'s rpc fails, a turn end is acknowledged and the host still closes on EOF', async () => {
  const h = host({behaviour: kind => ({ready: kind === 'kernel'})});
  await h.init();
  const result = await h.js('rpc');
  assert.equal(result.isError, true);
  assert.equal(text(result), 'trusted Node process did not start within 100 ms, 3 attempts');
  assert.equal(text(await h.turn()), '{}');
  h.input.end();
  assert.equal(await Promise.race([h.supervisor.closed, delay(2000).then(() => 'still open')]), 0);
});

const {node, skip} = kernelNode();
test('a real kernel announces runtime_ready once it has loaded, before it reads any work', {skip}, async t => {
  const kernel = startRealKernel(t, {node});
  assert.deepEqual(await kernel.ready, {type: 'runtime_ready'});
  assert.deepEqual(kernel.received, [], 'nothing before it');
});
