// accept-native's subprocess runner: a child with captured output and a hard time limit. It leads its own process
// group, so the timeout stops it and what it started in that group (npm's test runner, say) and nothing else. The
// child's exit is not the end of its output: a descendant outside the group (one that made its own, say) can keep the
// pipes open. So once the child has exited, the pipes get `drainMs` to close; past that the result is returned with
// what arrived and `streamsIncomplete: true`, for the caller to report as a failed check, never waited on.
// -> {code, signal, timedOut, streamsIncomplete, stdout, stderr, ms} | {code: null, error, stdout, stderr, ms}.
import {spawn} from 'node:child_process';

export function runBounded(command, args, {cwd, env = process.env, timeoutMs = 600_000, stdin = 'ignore', drainMs = 5_000} = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(command, args, {cwd, env, stdio: [stdin, 'pipe', 'pipe'], detached: true});
    let stdout = '', stderr = '', timedOut = false, drain = null, done = false;
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(drain);
      resolve({...result, stdout, stderr, ms: Date.now() - started});
    };
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeoutMs);
    child.on('error', error => finish({code: null, error: error.code ?? error.message}));
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      drain = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish({code, signal, timedOut, streamsIncomplete: true});
      }, drainMs);
    });
    child.on('close', (code, signal) => finish({code, signal, timedOut, streamsIncomplete: false}));
  });
}
