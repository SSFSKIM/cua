// The owned runtime for one connection: the launch record from buildLaunch, started inside a process group that the
// server can prove is its own, speaking newline-delimited JSON-RPC over stdin/stdout.
//
// Ownership is the process group, and identity is the anchor. The vendor launcher, node_repl and its sandboxed
// kernel/worker children all stay in one group, and a kernel that ignores its own shutdown can outlive the launcher
// there (observed after a busy cell's reset). A group's number alone proves nothing once its members are gone: it can
// be reused. So the group is led by a small anchor process (anchor.mjs) that stays alive until the last signal; every
// group signal is sent only while the anchor is known alive (its exit not yet reaped), and if it is not, teardown
// signals nothing and reports cleanup unconfirmed. The native helper is started by the vendor through LaunchServices,
// never in this group. A descendant that starts its own session escapes the group; teardown does not claim it.
import {spawn, execFile} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const ANCHOR = fileURLToPath(new URL('./anchor.mjs', import.meta.url));
const POLL_MS = 25;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Waits for `promise` at most `ms`, leaving no timer behind (a stray one would hold the process open after close).
function within(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, ms)); })]).finally(() => clearTimeout(timer));
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

// Current members of a process group, by pgrep (which never lists itself or its ancestors, and the server is not a
// member). Null when the listing itself failed.
function groupMembers(pgid) {
  return new Promise(resolve => execFile('/usr/bin/pgrep', ['-g', String(pgid)], (error, stdout) => {
    resolve(error && error.code !== 1 ? null : stdout.split('\n').filter(Boolean).map(Number));
  }));
}

export function spawnUpstream({command, args, env, cwd}, {diagnostics = () => {}, stderr = 'inherit', kill = (pid, signal) => process.kill(pid, signal)} = {}) {
  let onMessage = () => {};
  let onExit = () => {};
  let exitInfo = null;
  let exitReported = false;
  let terminating = null;
  let launcherPid;
  let anchorExited = false;
  let markLaunched;
  const launched = new Promise(resolve => { markLaunched = resolve; }); // the anchor has started the launcher, or never will

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
    if (msg?.started) { launcherPid = msg.started; markLaunched(); }
    if (msg?.exit) { markLaunched(); reportExit(msg.exit); }
  });
  anchor.once('exit', (code, signal) => {
    anchorExited = true;
    markLaunched();
    if (!terminating) reportExit({code, signal, error: 'the runtime anchor exited'});
  });
  anchor.once('error', error => {
    anchorExited = true;
    markLaunched();
    reportExit({code: null, signal: null, error: `${error.code ?? 'error'}: ${error.message}`});
  });
  if (pgid) anchor.send({command, args, env, cwd}, error => { if (error) diagnostics(`could not hand the launch to the runtime anchor: ${error.message}`); });

  // Members other than the anchor, or null when the group's identity can no longer be established.
  const others = async () => {
    if (anchorExited) return null;
    const members = await groupMembers(pgid);
    return members === null || anchorExited ? null : members.filter(pid => pid !== pgid);
  };
  const settled = async until => {
    for (;;) {
      const members = await others();
      if (members === null || !members.length || Date.now() >= until) return members;
      await sleep(POLL_MS);
    }
  };
  // Signals the group only if the anchor's exit has not been observed: until then its pid, and so the group number,
  // is still held (alive or an unreaped zombie), and nothing between this synchronous check and the signal reaps it.
  const signalGroup = signal => {
    if (anchorExited) return false;
    try { kill(-pgid, signal); } catch {}
    return true;
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
    // within `budgetMs`. Resolves {confirmed, steps, reason?}; confirmed means no member of the group remains.
    terminate({budgetMs = 5000} = {}) {
      terminating ??= (async () => {
        if (!pgid) return {confirmed: true, steps: []};
        const started = Date.now();
        const deadline = started + budgetMs;
        const steps = ['eof'];
        const lost = () => ({confirmed: false, steps, reason: 'process-group identity lost (its anchor exited early); no group signal was sent'});
        anchor.stdin.end();
        // Membership means nothing until the launcher exists: a close right after start must not release the anchor
        // while the launcher is still being spawned.
        await within(launched, budgetMs * 0.4);
        let remaining = await settled(started + budgetMs * 0.4);
        if (remaining === null) return lost();
        if (remaining.length) {
          steps.push('SIGTERM');
          if (!signalGroup('SIGTERM')) return lost();
          remaining = await settled(started + budgetMs * 0.7);
          if (remaining === null) return lost();
        }
        if (remaining.length) {
          steps.push('SIGKILL');
          const listed = await others();
          if (listed === null || !signalGroup('SIGKILL')) return lost();
          // The anchor goes with this last signal; the members listed while it still held the group must be gone.
          while (listed.some(pidAlive) && Date.now() < deadline) await sleep(POLL_MS);
          return {confirmed: !listed.some(pidAlive), steps};
        }
        // Every runtime process is gone: release the anchor.
        if (anchor.connected) anchor.disconnect();
        await within(anchorGone, deadline - Date.now());
        if (!anchorExited) anchor.kill('SIGKILL');
        return {confirmed: true, steps};
      })();
      return terminating;
    },
  };
}
