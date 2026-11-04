// A child that never finishes starting is replaced, not waited on forever (M2 task 3). Under the macOS sandbox a child's
// start-up can block for good (its time zone's launchd lookup: test/repl-host/kernel-runtime.test.mjs, evidence under
// docs/evidence/2026-10-14-own-repl-host-parity/m2/history-hang/). The shared runtime announces `runtime_ready` once it
// has loaded; the supervisor holds a child's work until then, replaces a child not ready within its bound, a few times
// at most, and then fails the waiting work with a sentence. These tests drive the supervisor with child doubles (the
// kernel-child seam); the real announcement is checked against a real kernel at the end.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createSupervisor, TRUSTED_WORKER} from '../../src/repl-host/supervisor.mjs';
import {kernelNode, startKernel as startRealKernel} from './kernel-harness.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const DISABLED = {'codex/sandbox-state-meta': {permissionProfile: {type: 'disabled'}, sandboxCwd: 'file:///fixture/run'}};

// A supervisor over child doubles. `behaviour(kind, n)` says how the n-th child of `kind` ('kernel' | 'worker') acts:
// {ready: boolean}. Ready kernels answer exec (and a cell's one rpc, through the worker); ready workers answer service,
// run_hooks and turn_ended.
function host({behaviour, readyTimeoutMs = 100, env = {}, reaper = undefined, shimProbe = () => true}) {
  const counts = {kernel: 0, worker: 0};
  const children = [];
  const logs = [];
  const events = [];
  const startKernel = (launch, {onMessage, onEnd, engine, shim, reap}) => {
    const kind = launch.args.includes(TRUSTED_WORKER) ? 'worker' : 'kernel';
    const n = ++counts[kind];
    const {ready} = behaviour(kind, n);
    const child = {kind, n, received: [], stopped: false, engine, shim, held: false, reap};
    children.push(child);
    if (ready) setImmediate(() => onMessage({type: 'runtime_ready'}));
    return {
      pid: undefined,
      holdLauncher() { child.held = true; events.push(`hold ${kind} ${n}`); },
      send(message) {
        child.received.push(message);
        if (!ready || child.stopped) return true;
        setImmediate(() => {
          if (kind === 'kernel' && message.type === 'exec' && message.code === 'hang') return;
          if (kind === 'kernel' && message.type === 'exec' && message.code === 'late-rpc') {
            setTimeout(() => onMessage({type: 'trusted_service_request', id: `${message.id}-trusted-rpc-0`, exec_id: message.id, service: 'svc', request: {}}), 100);
            return;
          }
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
      async stop() { child.stopped = true; events.push(`stop ${kind} ${n}`); onEnd({expected: true, diagnostic: ''}); },
    };
  };
  const input = new PassThrough(), output = new PassThrough();
  const replies = new Map();
  output.setEncoding('utf8').on('data', chunk => { for (const line of chunk.split('\n').filter(Boolean)) { const msg = JSON.parse(line); replies.get(msg.id)?.(msg); } });
  const supervisor = createSupervisor({input, output, cwd: '/fixture/run', startKernel, readyTimeoutMs, shimProbe, ...(reaper ? {reaper} : {}), log: line => logs.push(line),
    env: {CUA_REPL_NODE_PATH: '/fixture/node', PATH: '/usr/bin:/bin', CUA_REPL_TRUSTED_RPC_ENABLED: '1', CUA_REPL_TRUSTED_SERVICES: JSON.stringify({svc: '/fixture/svc.mjs'}), ...env}});
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; replies.set(n, resolve); input.write(`${JSON.stringify({jsonrpc: '2.0', id: n, method, params})}\n`); });
  const js = async (code, timeoutMs, meta = DISABLED) => (await request('tools/call', {name: 'js', arguments: {code, ...(timeoutMs ? {timeout_ms: timeoutMs} : {})}, _meta: meta})).result;
  const turn = async () => (await request('tools/call', {name: 'turn_ended', arguments: {hook_event_name: 'Stop', session_id: 's', turn_id: 't'}, _meta: DISABLED})).result;
  return {supervisor, input, children, logs, events, request, js, turn, init: () => request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '0'}})};
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

// The Linux helper's settings for a sandboxed launch through the doubles: a helper file named with its own SHA-256 and a
// deny list, and a call's scoped policy.
function sandboxedEnv(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-readiness-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const helper = join(dir, 'codex-linux-sandbox');
  writeFileSync(helper, '#!/bin/sh\n');
  chmodSync(helper, 0o755);
  return {CUA_REPL_SANDBOX_HELPER: helper, CUA_REPL_SANDBOX_HELPER_SHA256: createHash('sha256').update(readFileSync(helper)).digest('hex'),
    CUA_SANDBOX_DENY_READ: JSON.stringify({deny: [join(dir, 'denied')], reexpose: [], metadataOnly: [], tiers: []}), CUA_ENGINE_BIN: '/opt/cua/engine/linux/cua-engine'};
}
const SCOPED_META = {'codex/sandbox-state-meta': {permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries: [
  {path: {type: 'special', value: {kind: 'root'}}, access: 'read'}, {path: {type: 'special', value: {kind: 'project_roots'}}, access: 'write'}]}, network: 'restricted'},
sandboxCwd: 'file:///fixture/run'}};
const linuxOnly = {skip: process.platform !== 'linux' && 'the engine\'s drain is Linux only'};

test('once its input ends, the host holds the sandboxed trusted worker\'s launcher, so the owned group\'s SIGTERM cannot end the engine\'s sandbox under it; then the stop', linuxOnly, async t => {
  const h = host({behaviour: () => ({ready: true}), env: sandboxedEnv(t)});
  await h.init();
  assert.equal(text(await h.js('rpc', undefined, SCOPED_META)), 'service said worker 1');
  h.js('hang', 60000, SCOPED_META);   // admitted work the EOF drain waits for
  await delay(50);
  h.input.end();
  await delay(50);
  assert.deepEqual(h.events, ['hold worker 1'], 'held as the drain begins, the kernel\'s launcher left alone, nothing stopped yet');
  await h.supervisor.shutdown();
  assert.deepEqual(h.events.slice(0, 1), ['hold worker 1']);
  assert.ok(h.events.includes('stop worker 1'), 'then the stop, which drains the engine');
});

test('an engine that does not serve as the launcher\'s shim (before T7b\'s fix 3) leaves the launcher unheld and unshimmed', linuxOnly, async t => {
  const probed = [];
  const h = host({behaviour: () => ({ready: true}), env: sandboxedEnv(t), shimProbe: engine => { probed.push(engine); return false; }});
  await h.init();
  assert.equal(text(await h.js('rpc', undefined, SCOPED_META)), 'service said worker 1');
  h.js('hang', 60000, SCOPED_META);
  await delay(50);
  h.input.end();
  await delay(50);
  assert.deepEqual(h.events, [], 'a launcher that would not die with this process is never held');
  assert.equal(h.children.find(c => c.kind === 'worker').shim, null);
  assert.deepEqual(probed, ['/opt/cua/engine/linux/cua-engine'], 'checked once');
  await h.supervisor.shutdown();
});

test('with the sandbox disabled there is no launcher to hold: the worker itself runs the engine\'s service', linuxOnly, async t => {
  const h = host({behaviour: () => ({ready: true}), env: sandboxedEnv(t)});
  await h.init();
  assert.equal(text(await h.js('rpc')), 'service said worker 1');
  h.input.end();
  await h.supervisor.closed;
  assert.deepEqual(h.events.filter(e => e.startsWith('hold')), []);
});

test('a sandboxed worker first started while the host drains is held once it is ready', linuxOnly, async t => {
  const h = host({behaviour: () => ({ready: true}), env: sandboxedEnv(t)});
  await h.init();
  const answered = h.js('late-rpc', 60000, SCOPED_META);   // its service request comes only after the input's end
  await delay(20);
  h.input.end();
  assert.equal(text(await answered), 'service said worker 1');
  await h.supervisor.closed;
  assert.deepEqual(h.events.filter(e => e.endsWith('worker 1')), ['hold worker 1', 'stop worker 1']);
});

test('the owned-group reaper knows the engine itself, so any child\'s reap lets a stray engine drain first, and no caller names it', linuxOnly, async t => {
  const made = [];
  const reaps = [];
  const h = host({behaviour: () => ({ready: true}), env: sandboxedEnv(t),
    reaper: options => { made.push(options); return {reap: (...args) => { reaps.push(args); return Promise.resolve([]); }, own: () => () => {}}; }});
  await h.init();
  await h.js('rpc');
  await h.children.find(c => c.kind === 'worker').reap();
  await h.children.find(c => c.kind === 'kernel').reap();
  assert.deepEqual(made, [{engine: '/opt/cua/engine/linux/cua-engine'}]);
  assert.deepEqual(reaps, [[], []], 'the worker\'s reap and a kernel\'s alike');
  h.input.end();
  await h.supervisor.closed;
});

const {node, skip} = kernelNode();
test('on Linux the trusted worker\'s stop knows the engine its service runs, and a kernel\'s does not; elsewhere neither does', async () => {
  const h = host({behaviour: () => ({ready: true}), env: {CUA_ENGINE_BIN: '/opt/cua/engine/linux/cua-engine'}});
  await h.init();
  assert.equal(text(await h.js('rpc')), 'service said worker 1');
  const worker = h.children.find(c => c.kind === 'worker');
  const kernel = h.children.find(c => c.kind === 'kernel');
  assert.equal(worker.engine, process.platform === 'linux' ? '/opt/cua/engine/linux/cua-engine' : null);
  assert.equal(kernel.engine, undefined);
  assert.equal(worker.shim, process.platform === 'linux' ? '/opt/cua/engine/linux/cua-engine' : null, 'the engine is the worker\'s launcher shim on Linux (its parent-death signal), and nothing elsewhere');
  assert.equal(kernel.shim, undefined);
  h.input.end();
  await h.supervisor.closed;
  const relative = host({behaviour: () => ({ready: true}), env: {CUA_ENGINE_BIN: 'cua-engine'}});
  await relative.init();
  await relative.js('rpc');
  assert.equal(relative.children.find(c => c.kind === 'worker').engine, null, 'only an absolute path names it');
  relative.input.end();
  await relative.supervisor.closed;
});

test('a real kernel announces runtime_ready once it has loaded, before it reads any work', {skip}, async t => {
  const kernel = startRealKernel(t, {node});
  assert.deepEqual(await kernel.ready, {type: 'runtime_ready'});
  assert.deepEqual(kernel.received, [], 'nothing before it');
});
