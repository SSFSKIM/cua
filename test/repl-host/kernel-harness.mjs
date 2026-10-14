// A small driver for cua's own REPL kernel (src/repl-host/kernel.mjs) over its inner JSONL wire (the spec's KernelWire,
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md): it launches a real kernel child the way the supervisor
// does (`<node> --experimental-vm-modules kernel.mjs --session-id <id> --working-dir <cwd>`, an explicit environment,
// nothing of the caller's inherited), sends `exec` messages and answers the kernel's id-correlated requests as the
// supervisor would. The kernel needs the own host's Node (24 or later, the launch's resolver: CUA_NODE, the running node
// or node on PATH); `kernelNode()` names it, or why there is none so a test can skip visibly.
import {spawn} from 'node:child_process';
import {mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {ownHostNode} from '../../src/runtime/launch.mjs';

export const KERNEL = fileURLToPath(new URL('../../src/repl-host/kernel.mjs', import.meta.url));

// -> {node} or {skip: reason}.
export function kernelNode() {
  try { return {node: ownHostNode({ambient: process.env})}; } catch (error) { return {skip: `the own kernel needs Node 24 or later; set CUA_NODE (${error.code})`}; }
}

// The supervisor's default replies: an acknowledged image, and trusted hooks that ran and returned nothing.
export function defaultReply(message) {
  if (message.type === 'emit_image') return {type: 'emit_image_result', id: message.id, ok: true};
  if (message.type === 'trusted_service_hooks') return {type: 'trusted_service_response', id: message.id, ok: true, value: null};
  return undefined;
}

// Starts a kernel in a fresh scratch working directory (removed after the test) -> the driver. `env` is the whole
// child environment besides PATH, HOME and TMPDIR.
export function startKernel(t, {node, env = {}, sessionId = 'kernel-test', args} = {}) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'cua-kernel-')));
  const child = spawn(node, ['--experimental-vm-modules', KERNEL, ...(args ?? ['--session-id', sessionId, '--working-dir', cwd])], {
    cwd, stdio: ['pipe', 'pipe', 'pipe'],
    env: {PATH: '/usr/bin:/bin', HOME: cwd, TMPDIR: cwd, ...env},
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
  const received = [];
  let waiters = [];
  createInterface({input: child.stdout}).on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { message = {raw: line}; }
    received.push(message);
    const woken = waiters;
    waiters = [];
    for (const waiter of woken) waiter();
  });
  const changed = () => new Promise(resolve => waiters.push(resolve));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    rmSync(cwd, {recursive: true, force: true});
  });

  const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
  // The next received message (from `from` on) matching `predicate` -> {message, index}; rejects on child exit.
  async function next(predicate, from = 0) {
    for (;;) {
      const index = received.findIndex((m, i) => i >= from && predicate(m, i));
      if (index !== -1) return {message: received[index], index};
      const done = await Promise.race([changed().then(() => false), exited.then(() => true)]);
      if (done) {
        const late = received.findIndex((m, i) => i >= from && predicate(m, i));
        if (late !== -1) return {message: received[late], index: late};
        throw new Error(`kernel exited before the expected message; stderr: ${stderr}`);
      }
    }
  }

  let execCounter = 0;
  // Runs one cell -> {result, messages}: the exec_result and every message the kernel sent for it, in order. `reply`
  // answers each request (undefined: the default reply; null: no reply).
  async function exec(code, {id = `exec-${++execCounter}`, requestMeta, reply = defaultReply} = {}) {
    const from = received.length;
    const answered = new Set();
    send({type: 'exec', id, code, ...(requestMeta === undefined ? {} : {request_meta: requestMeta})});
    for (;;) {
      const {message, index} = await next((m, i) => !answered.has(i) && (m.id === id && m.type === 'exec_result' || typeof m.id === 'string' && m.id.startsWith(`${id}-`)), from);
      answered.add(index);
      if (message.type === 'exec_result') return {result: message, messages: received.slice(from, index + 1)};
      const answer = reply(message);
      const sent = answer === undefined ? defaultReply(message) : answer;
      if (sent) send(sent);
    }
  }

  return {child, cwd, exec, send, next, received, exited, stderr: () => stderr};
}
