// The child's half of its lifeline to cua's own REPL host supervisor (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// Decision Log, M4 task 3 ruling 2: a child never keeps running once its supervisor is gone). The supervisor
// (./kernel-child.mjs lifelinePipe) makes each child, the kernel and the trusted worker alike, a FIFO under the child's
// TMPDIR whose only write end it holds, and names it in CUA_REPL_LIFELINE (`<dev>:<ino>:<path>`). Nothing is ever
// written to it; once the supervisor is gone, however it ended, SIGKILL included, reading it finds its end.
//
// The end of stdin already ends an idle child (./worker-runtime.mjs), but a child busy in synchronous code (a cell's or
// a trusted service's endless loop) never reads it again. So a watcher thread, which the main thread's loop cannot
// block, polls the lifeline and kills its own process at its end. The child opens the read end itself, without blocking
// and close-on-exec, so the watcher never sits in a read (a thread in a blocking read would keep the process from
// exiting) and nothing the child starts inherits it.
//
// A lifeline the supervisor names is required: a child that cannot watch it (unreadable under its sandbox, not the
// named pipe, malformed, a watcher that does not start) fails its start with LIFELINE_FAILED rather than run
// unprotected, and the child announces it is ready only once its watcher runs (./worker-runtime.mjs). A watcher that
// fails later says so on stderr and ends its process. With no lifeline named, nothing is watched.
import {closeSync, constants, fstatSync, openSync} from 'node:fs';
import {Worker} from 'node:worker_threads';

export const LIFELINE_ENV = 'CUA_REPL_LIFELINE';
export const LIFELINE_FAILED = 'cua-repl-host lifeline unavailable';

let watching = Promise.resolve(null);

// Starts watching the named lifeline -> a promise of the running watcher (null when none is named), rejected with a
// LIFELINE_FAILED error when it cannot be watched. The setting leaves the process environment at once, so nothing the
// child copies or runs sees it.
export function watchLifeline(env = process.env) {
  const setting = env[LIFELINE_ENV];
  delete env[LIFELINE_ENV];
  watching = setting === undefined ? Promise.resolve(null) : install(setting);
  watching.catch(() => {});
  return watching;
}

// The outcome of the last watchLifeline() -> the same promise.
export const lifelineWatched = () => watching;

const failure = reason => new Error(`${LIFELINE_FAILED}: ${reason}`);

async function install(setting) {
  const match = /^(\d+):(\d+):(\/.+)$/.exec(setting);
  if (!match) throw failure(`malformed ${LIFELINE_ENV}`);
  const path = match[3];
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(fd, {bigint: true});
    if (!stat.isFIFO() || String(stat.dev) !== match[1] || String(stat.ino) !== match[2]) throw failure(`${path} is not the named lifeline`);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    throw error.message.startsWith(LIFELINE_FAILED) ? error : failure(error.message);
  }
  const watcher = new Worker(new URL('./lifeline-thread.mjs', import.meta.url), {workerData: {fd, failed: LIFELINE_FAILED}, stdout: true, stderr: true});
  try {
    await new Promise((resolve, reject) => {
      watcher.once('message', message => (message?.watching ? resolve() : reject(failure(message?.failed ?? 'the watcher did not start'))));
      watcher.once('error', error => reject(failure(`the watcher failed: ${error.message}`)));
      watcher.once('exit', code => reject(failure(`the watcher ended (${code})`)));
    });
  } catch (error) {
    watcher.terminate();
    throw error;
  }
  watcher.unref();
  watcher.removeAllListeners();
  // Past its start, a watcher that fails ends the process itself (./lifeline-thread.mjs); this only keeps an
  // unexpected thread error from going unreported.
  watcher.on('error', error => { process.stderr.write(`${LIFELINE_FAILED}: the watcher failed: ${error.message}\n`); process.exit(1); });
  return watcher;
}
