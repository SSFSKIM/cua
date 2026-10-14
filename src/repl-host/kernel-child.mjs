// One kernel process of cua's own REPL host (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Design
// "Supervisor, execution order and lifecycle"): the spawned child (the sandbox launcher, or the kernel's own Node when
// the sandbox is disabled), its inner JSONL wire (KernelWire), the tail of its stderr and the diagnostic the vendor's
// supervisor reports when a kernel ends while an execution waits on it:
//   node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: {"kernel_pid":…,"kernel_status":"exited(code=…)"
//   or "exited(signal=…)","kernel_stderr_tail":"<last 20 non-empty lines, each at most 512 characters, joined by ' | '>",
//   "reason":"stdout_eof","stream_error":null}
// (sentence, field order and tail shape observed on the pinned node_repl, 2026-10-14). `kernel_pid` is the spawned
// child's, which under the sandbox is the launcher's, not the kernel Node's.
//
// The child stays in the supervisor's process group, the group cua's proxy owns (src/mcp/upstream.mjs). Stopping it
// SIGKILLs the child and every process descending from it, so a kernel under a sandbox launcher (which runs it as its
// own child) or a kernel busy in synchronous code is gone, not orphaned; a descendant started after the listing stays
// in the owned group for the proxy's teardown.
import {spawn, execFileSync} from 'node:child_process';
import {constants} from 'node:os';
import {createInterface} from 'node:readline';

const TAIL_LINES = 20;
const TAIL_LINE_CHARS = 512;
const EXIT_GRACE_MS = 1000;
export const KERNEL_EXIT_SENTENCE = 'node_repl kernel exited unexpectedly';

const signalNumber = signal => constants.signals[signal] ?? signal;
export const exitStatus = ({code, signal}) => (code !== null && code !== undefined ? `exited(code=${code})` : signal ? `exited(signal=${signalNumber(signal)})` : 'unknown');

// The last TAIL_LINES non-empty stderr lines (a trailing \r dropped, each cut to TAIL_LINE_CHARS characters).
export function stderrTail() {
  const lines = [];
  let partial = '';
  const push = line => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line) return;
    lines.push([...line].slice(0, TAIL_LINE_CHARS).join(''));
    if (lines.length > TAIL_LINES) lines.shift();
  };
  return {
    write(chunk) {
      const parts = (partial + chunk).split('\n');
      partial = parts.pop();
      for (const line of parts) push(line);
    },
    text() {
      const all = [...lines];
      const rest = partial.endsWith('\r') ? partial.slice(0, -1) : partial;
      if (rest) all.push([...rest].slice(0, TAIL_LINE_CHARS).join(''));
      return all.slice(-TAIL_LINES).join(' | ');
    },
  };
}

export const exitDiagnostic = ({pid, status, tail, reason = 'stdout_eof', streamError = null}) =>
  `${KERNEL_EXIT_SENTENCE}\n\nnode_repl diagnostics: ${JSON.stringify({kernel_pid: pid ?? null, kernel_status: status, kernel_stderr_tail: tail, reason, stream_error: streamError})}`;

// Every process descending from `pid`, from one `ps` listing.
export function descendantsOf(pid) {
  let listing;
  try { listing = execFileSync('ps', ['-axo', 'pid=,ppid='], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000}); } catch { return []; }
  const rows = listing.split('\n').map(line => line.trim().split(/\s+/).map(Number)).filter(([p, pp]) => Number.isInteger(p) && Number.isInteger(pp));
  const owned = new Set([pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [p, pp] of rows) if (owned.has(pp) && !owned.has(p)) { owned.add(p); changed = true; }
  }
  owned.delete(pid);
  return [...owned];
}

// Starts a kernel child. `onMessage(message)` gets each JSON line it writes (other lines are dropped: a kernel can print
// plain text outside any execution); `onEnd({diagnostic, expected})` is called once when it is gone: `expected` when
// `stop()` ended it, else with the exit diagnostic (or, for a child that could not start, the launch failure).
export function startKernelChild({command, args, env, cwd}, {onMessage, onEnd, spawnProcess = spawn}) {
  const tail = stderrTail();
  let stopping = false;
  let ended = false;
  let exitInfo = null;
  let spawnError = null;
  const child = spawnProcess(command, args, {env, cwd, stdio: ['pipe', 'pipe', 'pipe']});
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => { exitInfo = {code, signal}; resolve(exitInfo); });
    child.once('error', error => { spawnError ??= error; resolve(null); });
  });
  const stderrClosed = new Promise(resolve => child.stderr.once('close', resolve));
  child.stdin.on('error', () => {});
  child.stderr.setEncoding('utf8').on('data', chunk => tail.write(chunk));
  child.stdout.on('error', () => {});
  createInterface({input: child.stdout}).on('line', line => {
    if (ended || !line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message && typeof message === 'object') onMessage(message);
  });

  const within = (promise, ms) => {
    let timer;
    return Promise.race([promise, new Promise(resolve => { timer = setTimeout(resolve, ms); })]).finally(() => clearTimeout(timer));
  };
  const killTree = () => {
    if (!child.pid) return;
    for (const pid of [child.pid, ...descendantsOf(child.pid)]) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
  };

  async function end() {
    if (ended) return;
    ended = true;
    if (spawnError) return onEnd({expected: stopping, diagnostic: `failed to start Node runtime: ${spawnError.message}`});
    if (!exitInfo && !await within(exited, EXIT_GRACE_MS)) { killTree(); await within(exited, EXIT_GRACE_MS); }
    await within(stderrClosed, EXIT_GRACE_MS);
    onEnd({expected: stopping, diagnostic: exitDiagnostic({pid: child.pid, status: exitInfo ? exitStatus(exitInfo) : 'unknown', tail: tail.text()})});
  }
  // The end is the kernel's stdout closing, or its exit when something it started still holds the pipe.
  child.stdout.once('close', end);
  exited.then(info => (info ? within(new Promise(resolve => child.stdout.once('close', resolve)), 200).then(end) : end()));

  return {
    get pid() { return child.pid; },
    get ended() { return ended; },
    send(message) {
      if (ended || stopping || !child.stdin.writable) return false;
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return true;
    },
    // Ends the kernel on purpose: SIGKILL to it and its descendants, its input closed; resolves once its exit was seen
    // (or a bounded wait passed).
    async stop() {
      stopping = true;
      killTree();
      child.stdin.destroy();
      await within(exited, 2 * EXIT_GRACE_MS);
      await end();
    },
  };
}
