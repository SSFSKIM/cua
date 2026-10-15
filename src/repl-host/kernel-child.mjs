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
// On Linux the kernel's stdin, stdout and stderr are real pipes (FIFOs opened then unlinked at once), as the vendor's
// are: Node's own child pipes are Unix socket pairs, which the Linux sandbox's network filter makes unreadable and
// unwritable inside it (observed on cua-linux, 2026-10-14: the kernel saw EOF on stdin at once and its output was
// lost). macOS keeps Node's pipes: its sandbox passes them, and there libuv sees no end-of-file on a FIFO whose writers
// have all closed (observed on this Mac, 2026-10-14), so a FIFO would hide the kernel's end.
//
// The child stays in the supervisor's process group, the group cua's proxy owns (src/mcp/upstream.mjs). Stopping it
// freezes and SIGKILLs the child and every process descending from it (killProcessTree), so a kernel under a sandbox
// launcher (which runs it as its own child) or a kernel busy in synchronous code is gone, not orphaned. Whenever a
// kernel ends, expectedly or not, `reap` (the supervisor's ownedGroupReaper) then removes what it left in the owned
// group: a process a cell started is reparented when its kernel dies, so no tree leads to it any more.
import {spawn, execFileSync} from 'node:child_process';
import {closeSync, constants as fsConstants, fstatSync, mkdtempSync, openSync, rmSync} from 'node:fs';
import {Socket} from 'node:net';
import {constants, tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {LIFELINE_ENV} from './lifeline.mjs';

const TAIL_LINES = 20;
const TAIL_LINE_CHARS = 512;
const EXIT_GRACE_MS = 1000;
export const KERNEL_EXIT_SENTENCE = 'node_repl kernel exited unexpectedly';
const sendSignal = (pid, name) => { try { process.kill(pid, name); return true; } catch { return false; } };

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

export const exitDiagnostic = ({pid, status, tail, reason = 'stdout_eof', streamError = null, sentence = KERNEL_EXIT_SENTENCE}) =>
  `${sentence}\n\nnode_repl diagnostics: ${JSON.stringify({kernel_pid: pid ?? null, kernel_status: status, kernel_stderr_tail: tail, reason, stream_error: streamError})}`;

// SIGKILLs `root` and every process descending from it. The tree is frozen first (SIGSTOP, root first, then each
// newly listed descendant until a listing finds no new one), so nothing in it can fork or exit, and so leave the tree,
// between a listing and the kill: a launcher killed first would orphan the kernel it had just started.
export function killProcessTree(root, {list = descendantsOf, signal = sendSignal} = {}) {
  const frozen = new Set();
  if (signal(root, 'SIGSTOP')) frozen.add(root);
  for (let pass = 0; pass < 8; pass++) {
    const found = list(root).filter(pid => !frozen.has(pid));
    if (!found.length) break;
    for (const pid of found) if (signal(pid, 'SIGSTOP')) frozen.add(pid);
  }
  for (const pid of frozen) signal(pid, 'SIGKILL');
  return [...frozen];
}

// [pid, ppid, pgid, command name] of every process, from one `ps` listing ([] when it fails).
export function processTable() {
  let listing;
  try { listing = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,comm='], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000}); } catch { return []; }
  return listing.split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s*(.*)$/)).filter(Boolean)
    .map(([, pid, ppid, pgid, comm]) => [Number(pid), Number(ppid), Number(pgid), comm]);
}

// The pids of `roots` and of every process descending from them in `rows` ([pid, ppid, ...]).
function subtrees(rows, roots) {
  const owned = new Set(roots);
  for (let changed = true; changed;) {
    changed = false;
    for (const [pid, ppid] of rows) if (owned.has(ppid) && !owned.has(pid)) { owned.add(pid); changed = true; }
  }
  return owned;
}

// The ancestors of `self` in `rows` ([pid, ppid, ...]) from its parent up to and including `leader`, or null when
// `leader` is not one of them.
function ancestorsUpTo(rows, self, leader) {
  const parentOf = new Map(rows.map(([pid, ppid]) => [pid, ppid]));
  const chain = [];
  for (let pid = parentOf.get(self); pid !== undefined && pid > 1 && chain.length < 64; pid = parentOf.get(pid)) {
    chain.push(pid);
    if (pid === leader) return chain;
  }
  return null;
}

// The owned-group reaper for a supervisor whose process group is led by one of its ancestors (the proxy's anchor,
// src/mcp/anchor.mjs, which starts it directly or through a wrapper of its own), or null when this process does not run
// in such a group (then only a kernel's tree is ever killed) -> {reap, own}.
// reap() freezes then SIGKILLs every member of the group except the supervisor, its ancestors up to the anchor (an
// ancestor inside the owned group is never a stray), the `ps` listing the reaper itself ran, and every process in a
// protected subtree. own(pid) protects the live child `pid` and everything descending from it until the release it
// returns is called: the supervisor registers every live child (the kernel and #116 M2's trusted worker, with the
// processes they start) and releases a child only in that child's own cleanup. reap() is called only when a child has
// ended, so every unprotected member is what it left behind: processes it started, reparented when it died. (A process that leaves the group, as bwrap's --new-session sandbox does, is not found; that
// sandbox dies with its parent.)
export function ownedGroupReaper({self = process.pid, table = processTable, signal = sendSignal} = {}) {
  const rows = table();
  const row = rows.find(([pid]) => pid === self);
  const leader = row?.[2];
  if (!row || leader === self || leader <= 1 || !ancestorsUpTo(rows, self, leader)) return null;
  const protectedRoots = new Set();
  const strays = () => {
    const current = table();
    const ancestors = new Set(ancestorsUpTo(current, self, leader) ?? [leader]);
    const spared = subtrees(current, protectedRoots);
    return current.filter(([pid, ppid, pgid, comm]) => pgid === leader && pid !== self && !ancestors.has(pid) && !spared.has(pid)
      && !(ppid === self && /(^|\/)ps$/.test(comm ?? ''))).map(([pid]) => pid);
  };
  const reap = () => {
    const frozen = new Set();
    for (let pass = 0; pass < 8; pass++) {
      const found = strays().filter(pid => !frozen.has(pid));
      if (!found.length) break;
      for (const pid of found) if (signal(pid, 'SIGSTOP')) frozen.add(pid);
    }
    for (const pid of frozen) signal(pid, 'SIGKILL');
    return [...frozen];
  };
  const own = pid => { protectedRoots.add(pid); return () => protectedRoots.delete(pid); };
  return {reap, own};
}

// Every process descending from `pid`, from one `ps` listing.
export function descendantsOf(pid) {
  const owned = subtrees(processTable(), [pid]);
  owned.delete(pid);
  return [...owned];
}

// Three FIFO pipes -> {child: [stdin, stdout, stderr] fds for the child, parent: {stdin, stdout, stderr} fds for this
// process}. Each FIFO is opened from both sides without blocking and unlinked before anything runs.
export function kernelPipes() {
  const dir = mkdtempSync(join(tmpdir(), 'cua-kernel-pipes-'));
  const opened = [];
  const open = (path, flags) => { const fd = openSync(path, flags | fsConstants.O_NONBLOCK); opened.push(fd); return fd; };
  try {
    const [input, output, error] = ['in', 'out', 'err'].map(name => join(dir, name));
    execFileSync('mkfifo', ['-m', '600', input, output, error], {stdio: 'ignore'});
    const childIn = open(input, fsConstants.O_RDONLY), parentIn = open(input, fsConstants.O_WRONLY);
    const parentOut = open(output, fsConstants.O_RDONLY), childOut = open(output, fsConstants.O_WRONLY);
    const parentErr = open(error, fsConstants.O_RDONLY), childErr = open(error, fsConstants.O_WRONLY);
    return {child: [childIn, childOut, childErr], parent: {stdin: parentIn, stdout: parentOut, stderr: parentErr}};
  } catch (failure) {
    for (const fd of opened) closeSync(fd);
    throw failure;
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

// The child's lifeline (./lifeline.mjs): a FIFO of this process's own, in a private directory, whose only write end this
// process keeps (opened close-on-exec, so no child inherits it) until the child is gone -> {setting, unlink(), release()}.
// The child opens the read end itself, by the path in its setting (CUA_REPL_LIFELINE, `<dev>:<ino>:<path>`, so it reads
// only that pipe), without blocking: a descriptor inherited at spawn would be put in blocking mode for the child, and a
// thread blocked in a read keeps its process from exiting. unlink() removes the path once the child is ready (it has
// opened it by then); release() closes the write end, from when on the child's read finds the pipe's end.
export function lifelinePipe() {
  const dir = mkdtempSync(join(tmpdir(), 'cua-lifeline-'));
  let reader = null;
  let writer = null;
  try {
    const path = join(dir, 'lifeline');
    execFileSync('mkfifo', ['-m', '600', path], {stdio: 'ignore'});
    // A write end opens without blocking only while a reader exists; this one goes once the writer is open.
    reader = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
    writer = openSync(path, fsConstants.O_WRONLY | fsConstants.O_NONBLOCK);
    const {dev, ino} = fstatSync(writer, {bigint: true});
    closeSync(reader);
    const unlink = () => rmSync(dir, {recursive: true, force: true});
    return {setting: `${dev}:${ino}:${path}`, unlink,
      release() { if (writer !== null) { closeSync(writer); writer = null; } unlink(); },
      get held() { return writer !== null; }};
  } catch (failure) {
    for (const fd of [reader, writer]) if (fd !== null) try { closeSync(fd); } catch { /* closed above */ }
    rmSync(dir, {recursive: true, force: true});
    throw failure;
  }
}

// Starts a kernel child (or the trusted worker, which the same wire and lifecycle serve; `exitSentence` opens its exit
// diagnostic). `onMessage(message)` gets each JSON line it writes (other lines are dropped: a kernel can print plain
// text outside any execution); `onEnd({diagnostic, expected})` is called once when it is gone: `expected` when `stop()`
// ended it, else with the exit diagnostic (or, for a child that could not start, the launch failure).
export function startKernelChild({command, args, env, cwd}, {onMessage, onEnd, spawnProcess = spawn, pipes = process.platform === 'linux' ? kernelPipes : null, reap = () => {},
  exitSentence = KERNEL_EXIT_SENTENCE, lifelines = lifelinePipe}) {
  const tail = stderrTail();
  let stopping = false;
  let ended = false;
  let exitInfo = null;
  let spawnError = null;
  let child = null;
  let fifos = null;
  let lifeline = null;
  try {
    fifos = pipes?.() ?? null;
    lifeline = lifelines?.() ?? null;
    child = spawnProcess(command, args, {env: lifeline ? {...env, [LIFELINE_ENV]: lifeline.setting} : env, cwd, stdio: fifos?.child ?? ['pipe', 'pipe', 'pipe']});
  } catch (error) {
    spawnError = error;
  } finally {
    for (const fd of fifos?.child ?? []) closeSync(fd);
  }
  const stdin = fifos ? new Socket({fd: fifos.parent.stdin, readable: false, writable: true}) : child?.stdin;
  const stdout = fifos ? new Socket({fd: fifos.parent.stdout, readable: true, writable: false}) : child?.stdout;
  const stderr = fifos ? new Socket({fd: fifos.parent.stderr, readable: true, writable: false}) : child?.stderr;
  const exited = child ? new Promise(resolve => {
    child.once('exit', (code, signal) => { exitInfo = {code, signal}; resolve(exitInfo); });
    child.once('error', error => { spawnError ??= error; resolve(null); });
  }) : Promise.resolve(null);
  const closed = stream => (stream ? new Promise(resolve => { if (stream.destroyed) resolve(); else stream.once('close', resolve); }) : Promise.resolve());
  const stdoutClosed = closed(stdout);
  const stderrClosed = closed(stderr);
  stdin?.on('error', () => {});
  stderr?.on('error', () => {}).setEncoding('utf8').on('data', chunk => tail.write(chunk));
  stdout?.on('error', () => {});
  if (stdout) createInterface({input: stdout}).on('line', line => {
    if (ended || !line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message?.type === 'runtime_ready') lifeline?.unlink();
    if (message && typeof message === 'object') onMessage(message);
  });

  const within = (promise, ms) => {
    let timer;
    return Promise.race([promise, new Promise(resolve => { timer = setTimeout(resolve, ms); })]).finally(() => clearTimeout(timer));
  };
  const killTree = () => { if (child?.pid) killProcessTree(child.pid); };

  // Once, however it is reached: every caller (stdout's close, the exit, stop()) waits for the same cleanup.
  let ending = null;
  const end = () => (ending ??= finish());
  async function finish() {
    ended = true;
    if (!exitInfo && !spawnError && !await within(exited, EXIT_GRACE_MS)) { killTree(); await within(exited, EXIT_GRACE_MS); }
    lifeline?.release();
    reap();
    await within(stderrClosed, EXIT_GRACE_MS);
    for (const stream of [stdin, stdout, stderr]) stream?.destroy();
    if (spawnError) return onEnd({expected: stopping, diagnostic: `failed to start Node runtime: ${spawnError.message}`});
    onEnd({expected: stopping, diagnostic: exitDiagnostic({pid: child.pid, status: exitInfo ? exitStatus(exitInfo) : 'unknown', tail: tail.text(), sentence: exitSentence})});
  }
  // The end is the kernel's stdout closing, or its exit when something it started still holds the pipe.
  stdoutClosed.then(end);
  exited.then(info => (info ? within(stdoutClosed, 200).then(end) : end()));

  return {
    get pid() { return child?.pid; },
    get ended() { return ended; },
    send(message) {
      if (ended || stopping || !stdin?.writable) return false;
      stdin.write(`${JSON.stringify(message)}\n`);
      return true;
    },
    // Ends the kernel on purpose: SIGKILL to it and its descendants, its input closed; resolves once its exit was seen
    // (or a bounded wait passed).
    async stop() {
      stopping = true;
      killTree();
      stdin?.destroy();
      await within(exited, 2 * EXIT_GRACE_MS);
      await end();
    },
  };
}
