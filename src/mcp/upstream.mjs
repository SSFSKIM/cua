// The owned runtime process for one connection: the launch record from buildLaunch, spawned in its own process group,
// speaking newline-delimited JSON-RPC over its stdin/stdout.
//
// Ownership is the process group. The vendor launcher, node_repl and its sandboxed kernel/worker children all stay in
// the group the launcher leads, and a kernel that ignores its own shutdown can outlive the launcher there (observed
// with a busy-looping cell after a kernel reset). The native helper is started by the vendor through LaunchServices,
// so it is never in this group and teardown never signals it. A descendant that deliberately starts its own session
// escapes the group; teardown cannot see it and does not claim to.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

const POLL_MS = 25;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function groupAlive(pgid) {
  try { process.kill(-pgid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function signalGroup(pgid, signal) {
  try { process.kill(-pgid, signal); } catch {}
}

async function waitGone(pgid, until) {
  while (groupAlive(pgid)) {
    if (Date.now() >= until) return false;
    await sleep(Math.min(POLL_MS, Math.max(1, until - Date.now())));
  }
  return true;
}

export function spawnUpstream({command, args, env, cwd}, {diagnostics = () => {}, stderr = 'inherit'} = {}) {
  let onMessage = () => {};
  let onExit = () => {};
  let exitInfo = null;
  let exitReported = false;
  let terminating = null;

  const child = spawn(command, args, {env, cwd, stdio: ['pipe', 'pipe', stderr], detached: true});
  const pgid = child.pid;
  child.stdin.on('error', () => {});

  const stdoutEnded = new Promise(resolve => child.stdout.once('close', resolve));
  createInterface({input: child.stdout}).on('line', line => {
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
    if (!info.error) await Promise.race([stdoutEnded, sleep(200)]);
    onExit(exitInfo);
  };
  child.once('exit', (code, signal) => reportExit({code, signal}));
  child.once('error', error => reportExit({code: null, signal: null, error: `${error.code ?? 'error'}: ${error.message}`}));

  return {
    pid: pgid,
    send(msg) {
      if (exitInfo || terminating || !child.stdin.writable) return false;
      child.stdin.write(JSON.stringify(msg) + '\n');
      return true;
    },
    onMessage(fn) { onMessage = fn; },
    onExit(fn) { onExit = fn; },

    // Bounded termination of the owned process group: EOF first (the runtime's orderly shutdown), then SIGTERM, then
    // SIGKILL, all within `budgetMs`. Resolves {confirmed, steps}; confirmed means no member of the group remains.
    terminate({budgetMs = 5000} = {}) {
      terminating ??= (async () => {
        if (!pgid) return {confirmed: true, steps: []};
        const started = Date.now();
        const deadline = started + budgetMs;
        const steps = ['eof'];
        child.stdin.end();
        if (await waitGone(pgid, started + budgetMs * 0.4)) return {confirmed: true, steps};
        steps.push('SIGTERM');
        signalGroup(pgid, 'SIGTERM');
        if (await waitGone(pgid, started + budgetMs * 0.7)) return {confirmed: true, steps};
        steps.push('SIGKILL');
        signalGroup(pgid, 'SIGKILL');
        return {confirmed: await waitGone(pgid, deadline), steps};
      })();
      return terminating;
    },
  };
}
