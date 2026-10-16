// cua's own REPL host never leaves an orphaned tree (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Decision
// Log, M4 task 3 ruling 2): (a) stdin EOF with no open request ends the whole tree within the bounded drain, even while
// the trusted worker or the kernel is busy in synchronous code; (b) a child never keeps running once the supervisor is
// gone, even when the supervisor dies abruptly (SIGKILL) while that child is busy in synchronous code and so can never
// read the end of its input. A real supervisor, kernel and trusted worker over MCP (supervisor-harness.mjs), with a
// fixture trusted service. Needs Node 24 or later (CUA_NODE); skips visibly otherwise.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kernelNode} from './kernel-harness.mjs';
import {alive, startHost, texts} from './supervisor-harness.mjs';

const {node, skip} = kernelNode();
const own = {skip, timeout: 30_000};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// How long a child may outlive its supervisor: the lifeline's poll plus the kill, with room for a loaded machine.
const ORPHAN_BOUND_MS = 5_000;

const SERVICE = {svc: `export async function handleRpc(request) {
  if (request.op === 'warm') return 'warm';
  if (request.op === 'env') return Object.keys(nodeRepl.env).filter(name => name.includes('LIFELINE'));
  // The worker's event loop blocks shortly after it answers: nothing it is sent is read again.
  if (request.op === 'spin-soon') { setTimeout(() => { for (;;) {} }, 100); return 'spinning soon'; }
}`};
const rpc = op => `nodeRepl.write(JSON.stringify(await nodeRepl.rpc('svc', {op: ${JSON.stringify(op)}})));`;

// The host with a ready worker (and kernel); `busy` blocks the worker's or the kernel's event loop, with no request open.
async function hostWith(t, busy) {
  const host = await startHost(t, {node, services: SERVICE});
  const warm = await host.js(rpc('warm'));
  assert.notEqual(warm.isError, true, JSON.stringify(warm));
  if (busy === 'worker') assert.notEqual((await host.js(rpc("spin-soon"))).isError, true);
  if (busy === 'kernel') assert.notEqual((await host.js(`setTimeout(() => { for (;;) {} }, 100); nodeRepl.write("x")`)).isError, true);
  await delay(400);
  // Registered for teardown before anything disrupts the host, so a failing test leaves nothing reparented.
  const children = host.track();
  assert.ok(children.some(p => p.command.includes('trusted-worker.mjs')) && children.some(p => p.command.includes('kernel.mjs')), JSON.stringify(children));
  return {host, children};
}

async function gone(children, bound) {
  const started = performance.now();
  while (children.some(p => alive(p.pid)) && performance.now() - started < bound) await delay(50);
  return children.filter(p => alive(p.pid)).map(p => p.command);
}

for (const busy of [null, 'worker', 'kernel']) {
  test(`(a) stdin EOF with no open request ends the whole tree within the drain bound${busy ? `, the ${busy} busy in synchronous code` : ''}`, own, async t => {
    const {host, children} = await hostWith(t, busy);
    const started = performance.now();
    host.child.stdin.end();
    assert.deepEqual(await host.exited, {code: 0, signal: null});
    assert.ok(performance.now() - started < ORPHAN_BOUND_MS, `exited after ${Math.round(performance.now() - started)} ms`);
    assert.deepEqual(await gone(children, ORPHAN_BOUND_MS), [], 'every child is gone');
  });

  test(`(b) a supervisor killed outright leaves no child running${busy ? `, the ${busy} busy in synchronous code` : ''}`, own, async t => {
    const {host, children} = await hostWith(t, busy);
    host.child.kill('SIGKILL');
    await host.exited;
    assert.deepEqual(await gone(children, ORPHAN_BOUND_MS), [], 'every child ends without its supervisor');
  });
}

test('the lifeline setting reaches neither a trusted service\'s environment nor a cell\'s', own, async t => {
  const host = await startHost(t, {node, services: SERVICE, env: {CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: 'CUA_REPL_LIFELINE'}});
  const result = await host.js(`${rpc('env')} nodeRepl.write(JSON.stringify(Object.keys(nodeRepl.env)));`);
  assert.deepEqual(result.content.map(c => c.text).join(''), '[][]');
});

for (const denied of ['kernel', 'worker']) {
  test(`a ${denied} that cannot read its lifeline under its sandbox fails its start visibly; nothing runs unprotected`, own, async t => {
    const host = await startHost(t, {node, services: SERVICE, denyLifeline: denied});
    const result = await host.js(rpc('warm'));
    assert.equal(result.isError, true, JSON.stringify(result));
    // A kernel's exit diagnostic is the cell's result; a worker's failure reaches the cell as the vendor's sentence
    // only, and its diagnostic goes to the host's stderr.
    const LIFELINE = /cua-repl-host lifeline unavailable: .*EACCES/;
    if (denied === 'kernel') assert.match(texts(result).join('\n'), LIFELINE);
    else { assert.match(texts(result).join('\n'), /trusted Node process exited unexpectedly/); for (let i = 0; i < 100 && !LIFELINE.test(host.stderr()); i++) await delay(20); assert.match(host.stderr(), LIFELINE); }
    const left = host.track().filter(p => p.command.includes(denied === 'worker' ? 'trusted-worker.mjs' : 'kernel.mjs') && !/sandbox/.test(p.command));
    assert.deepEqual(left.map(p => p.command), [], `no ${denied} is left running`);
  });
}
