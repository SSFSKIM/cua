// The child's half of its lifeline to cua's own REPL host supervisor (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// Decision Log, M4 task 3 ruling 2: a child never keeps running once its supervisor is gone). The supervisor
// (./kernel-child.mjs lifelinePipe) makes each child, the kernel and the trusted worker alike, a FIFO whose only write end
// it holds, and names it in CUA_REPL_LIFELINE (`<dev>:<ino>:<path>`). Nothing is ever written to it; once the supervisor
// is gone, however it ended, SIGKILL included, reading it finds its end.
//
// The end of stdin already ends an idle child (./worker-runtime.mjs), but a child busy in synchronous code (a cell's or
// a trusted service's endless loop) never reads it again. So a watcher thread, which the main thread's loop cannot
// block, polls the lifeline and kills its own process at its end. The child opens the read end itself, without blocking
// and close-on-exec, so the watcher never sits in a read (a thread in a blocking read would keep the process from
// exiting) and nothing the child starts inherits it. A child without a lifeline, or whose path is not the named pipe, is
// not watched.
import {closeSync, constants, fstatSync, openSync} from 'node:fs';
import {Worker} from 'node:worker_threads';

export const LIFELINE_ENV = 'CUA_REPL_LIFELINE';

// -> the watcher thread, or null when there is no lifeline to watch. The setting leaves the process environment, so
// nothing the child runs inherits it.
export function watchLifeline(env = process.env) {
  const setting = env[LIFELINE_ENV];
  delete env[LIFELINE_ENV];
  const match = /^(\d+):(\d+):(\/.+)$/.exec(setting ?? '');
  if (!match) return null;
  let fd;
  try {
    fd = openSync(match[3], constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(fd, {bigint: true});
    if (!stat.isFIFO() || String(stat.dev) !== match[1] || String(stat.ino) !== match[2]) { closeSync(fd); return null; }
  } catch {
    if (fd !== undefined) closeSync(fd);
    return null;
  }
  const watcher = new Worker(new URL('./lifeline-thread.mjs', import.meta.url), {workerData: {fd}, stdout: true, stderr: true});
  watcher.unref();
  watcher.on('error', () => {});
  return watcher;
}
