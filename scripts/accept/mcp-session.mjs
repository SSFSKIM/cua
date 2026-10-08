// A minimal MCP client over a spawned server's stdio, for the live acceptance fixtures. It keeps the whole transcript
// and the server's stderr (the fixtures scan them), and hands every server-initiated request to `onServerRequest`,
// whose result is sent back as the answer; with no handler every such request is declined.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function openSession({args, env, onServerRequest = () => ({action: 'decline'}), clientName = 'cua-accept'}) {
  const child = spawn(process.execPath, args, {stdio: ['pipe', 'pipe', 'pipe'], env});
  const transcript = [];
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal})));
  const waiters = new Map();
  let nextId = 0;
  let terminating = null;
  const send = msg => {
    const line = JSON.stringify(msg);
    transcript.push(line);
    if (child.stdin.writable) child.stdin.write(line + '\n');
  };
  createInterface({input: child.stdout}).on('line', line => {
    transcript.push(line);
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.method !== undefined && msg.id !== undefined) return send({jsonrpc: '2.0', id: msg.id, result: onServerRequest(msg)});
    waiters.get(msg.id)?.(msg);
  });
  const request = (method, params = {}, timeoutMs = 30_000) => new Promise(resolve => {
    const id = ++nextId;
    const timer = setTimeout(() => { waiters.delete(id); resolve({timedOut: true}); }, timeoutMs);
    waiters.set(id, msg => { clearTimeout(timer); waiters.delete(id); resolve(msg); });
    send({jsonrpc: '2.0', id, method, params});
  });
  return {
    pid: child.pid, transcript, exited, request,
    get stderr() { return stderr; },
    // Let the runtime enforce the cell deadline; leave transport time for its timeout/reset reply.
    js: (code, timeoutMs = 60_000) => request('tools/call', {name: 'js', arguments: {code, timeout_ms: timeoutMs}}, timeoutMs + 10_000),
    call: (name, args = {}, timeoutMs = 30_000) => request('tools/call', {name, arguments: args}, timeoutMs),
    async initialize() {
      const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: clientName, version: '0'}}, 120_000);
      if (init.timedOut || init.error) throw new Error(`initialize failed (${init.timedOut ? 'no answer' : init.error.message})`);
      send({jsonrpc: '2.0', method: 'notifications/initialized'});
      return init.result;
    },
    // EOF, then SIGTERM, each with a bounded wait; idempotent, and safe whether or not the server already exited.
    // Resolves {code, signal, forced?, stuck?}: `stuck` means it was still alive after SIGTERM's wait (then SIGKILL).
    terminate({budgetMs = 20_000} = {}) {
      terminating ??= (async () => {
        if (child.stdin.writable) child.stdin.end();
        const first = await Promise.race([exited, sleep(budgetMs * 0.75).then(() => null)]);
        if (first) return first;
        child.kill('SIGTERM');
        const second = await Promise.race([exited, sleep(budgetMs * 0.25).then(() => null)]);
        if (second) return {...second, forced: true};
        child.kill('SIGKILL');
        return {...await exited, forced: true, stuck: true};
      })();
      return terminating;
    },
    // end_task, then terminate.
    async close() {
      if (!terminating) await request('tools/call', {name: 'end_task', arguments: {}}, 15_000);
      return this.terminate();
    },
  };
}

// The text a tool result carries, joined.
export const resultText = reply => (reply.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
