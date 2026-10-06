// The owned runtime for one connection: the launch record from buildLaunch, started inside a process group that the
// server can prove is its own, speaking newline-delimited JSON-RPC over stdin/stdout.
//
// Ownership is the process group, and identity is the anchor (anchor.mjs). The vendor launcher, node_repl and its
// sandboxed kernel/worker children all stay in one group, and a kernel that ignores its own shutdown can outlive the
// launcher there (observed after a busy cell's reset). A group's number alone proves nothing once its members are
// gone: it can be reused. The anchor leads the group and stays alive until it is released or killed, so:
// - a group signal is sent only while the anchor's exit is unobserved (its pid, and so the number, is still held);
// - emptiness is judged only after the anchor has acknowledged `stop`, so no launch can follow the judgement;
// - teardown is confirmed only by read-only checks after the anchor's exit was observed: the group lists empty. A
//   failed signal, a failed or timed-out listing, a surviving member or a reused number all read as unconfirmed, and
//   nothing is signalled after the final signal.
// The native helper is started by the vendor through LaunchServices, never in this group. A descendant that starts
// its own session escapes the group; teardown does not claim it.
import {spawn, execFile} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const ANCHOR = fileURLToPath(new URL('./anchor.mjs', import.meta.url));
const POLL_MS = 25;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Waits for `promise` at most `ms`; resolves `fallback` on timeout and leaves no timer behind (a stray one would hold
// the process open after close).
function within(promise, ms, fallback) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(fallback), Math.max(0, ms)); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// The group's members, or null if the listing failed or did not finish within `ms` (its process is then killed).
// pgrep never lists itself or its ancestors, and the server is not a member. The deadline is kept here, not by
// execFile's `timeout`: that one discards the output of a listing that had already exited 0 but was not yet read,
// and reports success with nothing listed, which would read as an empty group. For the same reason a success that
// lists nobody is a failed listing (pgrep exits 0 only when something matched; no match is status 1).
function listGroup(pgrep, pgid, ms) {
  if (ms <= 0) return Promise.resolve(null);
  return new Promise(resolve => {
    let late = false;
    const child = execFile(pgrep, ['-g', String(pgid)], (error, stdout) => {
      clearTimeout(timer);
      const members = String(stdout ?? '').split('\n').filter(Boolean).map(Number);
      if (late || (error ? !(error.code === 1 && !error.killed) : !members.length)) return resolve(null);
      resolve(members);
    });
    const timer = setTimeout(() => { late = true; child.kill('SIGKILL'); }, ms);
  });
}

export function spawnUpstream({command, args, env, cwd}, {
  diagnostics = () => {}, stderr = 'inherit',
  kill = (pid, signal) => process.kill(pid, signal), pgrep = '/usr/bin/pgrep',
} = {}) {
  let onMessage = () => {};
  let onExit = () => {};
  let exitInfo = null;
  let exitReported = false;
  let terminating = null;
  let launcherPid;
  let anchorExited = false;
  let stopAcknowledged = false;

  // The anchor leads a new process group; its pid is the group's number for as long as it lives.
  const anchor = spawn(process.execPath, [ANCHOR], {env, cwd, stdio: ['pipe', 'pipe', stderr, 'ipc'], detached: true});
  const pgid = anchor.pid;
  const anchorGone = new Promise(resolve => anchor.once('exit', resolve));
  anchor.stdin.on('error', () => {});

  const stdoutEnded = new Promise(resolve => anchor.stdout.once('close', resolve));
  createInterface({input: anchor.stdout}).on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch {
      diagnostics(`runtime wrote a non-JSON line to its MCP stream (${line.length} characters); dropped`);
      return;
    }
    onMessage(msg);
  });

  // Report the exit after the runtime's remaining stdout has been read (bounded: an orphan may hold the pipe open).
  const reportExit = async info => {
    exitInfo ??= info;
    if (exitReported) return;
    exitReported = true;
    if (!info.error) await within(stdoutEnded, 200);
    onExit(exitInfo);
  };
  anchor.on('message', msg => {
    if (msg?.started) launcherPid = msg.started;
    if (msg?.exit) reportExit(msg.exit);
    if (msg?.stopped) stopAcknowledged = true;
  });
  anchor.once('exit', (code, signal) => {
    anchorExited = true;
    if (!terminating) reportExit({code, signal, error: 'the runtime anchor exited'});
  });
  anchor.once('error', error => {
    anchorExited = true;
    reportExit({code: null, signal: null, error: `${error.code ?? 'error'}: ${error.message}`});
  });
  const tell = msg => { if (anchor.connected) anchor.send(msg, error => { if (error) diagnostics(`runtime anchor did not take ${Object.keys(msg)[0]}: ${error.message}`); }); };
  if (pgid) tell({launch: {command, args, env, cwd}});

  async function teardown(budgetMs) {
    const started = Date.now();
    const deadline = started + budgetMs;
    const by = fraction => started + budgetMs * fraction;
    const steps = ['eof'];
    const problems = [];  // each one makes the teardown unconfirmed
    const notes = [];     // context, reported only alongside a problem
    const result = () => ({confirmed: !problems.length, steps, ...(problems.length ? {reason: [...problems, ...notes].join('; ')} : {})});

    const signalGroup = signal => {
      if (anchorExited) { notes.push(`process-group identity lost (its anchor exited), so no ${signal} was sent`); return; }
      steps.push(signal);
      // Synchronous with the check above: nothing can reap the anchor in between.
      try { kill(-pgid, signal); } catch (error) { problems.push(`${signal} to the group failed (${error.code ?? error.message})`); }
    };
    const release = async until => {
      if (anchor.connected) anchor.disconnect();
      if (!await within(anchorGone.then(() => true), until - Date.now(), false)) signalGroup('SIGKILL');
    };
    // True once only the anchor is left, launches being impossible; false at `until` or if identity is lost.
    const emptied = async until => {
      while (!anchorExited) {
        if (stopAcknowledged) {
          const members = await listGroup(pgrep, pgid, until - Date.now());
          if (members && !anchorExited && members.length === 1 && members[0] === pgid) return true;
        }
        if (Date.now() >= until) return false;
        await sleep(Math.min(POLL_MS, Math.max(0, until - Date.now())));
      }
      return false;
    };
    // Read-only from here: the anchor's exit must be observed, then the group must list empty.
    const confirm = async () => {
      if (!await within(anchorGone.then(() => true), deadline - Date.now(), false)) {
        problems.push('the runtime anchor is still alive');
        return result();
      }
      for (;;) {
        const members = await listGroup(pgrep, pgid, deadline - Date.now());
        if (members && !members.length) return result();
        if (Date.now() >= deadline) {
          problems.push(members ? `group still lists ${members.length} process(es)` : 'group enumeration failed or timed out');
          return result();
        }
        await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
      }
    };

    anchor.stdin.end();
    tell({stop: true});
    // Only the anchor left: release it (if it does not go, the group's final signal takes it). Otherwise escalate.
    if (await emptied(by(0.4))) await release(by(0.7));
    else {
      signalGroup('SIGTERM');
      if (await emptied(by(0.7))) await release(by(0.85));
      else signalGroup('SIGKILL');
    }
    return confirm();
  }

  // Teardown has ended, confirmed or not, and nothing of the runtime may hold this process open after it: a survivor
  // still holding the MCP stream gets a closed pipe, and a surviving anchor is released as this process's exit would
  // release it. Nothing is signalled here.
  const dispose = () => {
    for (const stream of [anchor.stdin, anchor.stdout, anchor.stderr]) stream?.destroy();
    if (anchor.connected) anchor.disconnect();
    anchor.unref();
  };

  return {
    pid: pgid,
    get launcherPid() { return launcherPid; },
    send(msg) {
      if (exitInfo || terminating || !anchor.stdin.writable) return false;
      anchor.stdin.write(JSON.stringify(msg) + '\n');
      return true;
    },
    onMessage(fn) { onMessage = fn; },
    onExit(fn) { onExit = fn; },

    // Bounded termination of the owned group: EOF first (the runtime's orderly shutdown), then SIGTERM, then SIGKILL,
    // within `budgetMs`. Resolves {confirmed, steps, reason?}; confirmed means the anchor's exit was observed and no
    // member of the group remains. Once it resolves, no handle to the runtime keeps this process alive.
    terminate({budgetMs = 5000} = {}) {
      terminating ??= (pgid ? teardown(budgetMs) : Promise.resolve({confirmed: true, steps: []})).finally(dispose);
      return terminating;
    },
  };
}
