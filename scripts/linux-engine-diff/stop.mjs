// A stopped run cleans up as a finished one does (#171, task 22): on SIGINT or SIGTERM the harness runs its own
// cleanup, then exits as the signal would (128 + its number). Its Chrome scene windows live in the person's running
// Chrome (scenes.mjs opens them with `--new-window`), so a run stopped without it strands them there (task 21's stopped
// gate run left 20, closed by title afterwards).
//
// A run that stops itself for a cause of its own (`stopBecause`: its watchdog was lost, task 44) ends with a last line
// naming the cause and whether its cleanup completed, so it can never read as a clean run.

const CODES = { SIGINT: 130, SIGTERM: 143 };

// per process: why it stopped itself (`stopBecause`), and how many cleanups are hooked
const causes = new WeakMap();
const hooks = new WeakMap();

const stoppedLine = (cause, outcome) => `cua171 STOPPED: ${cause}; ${outcome}.\n`;

/**
 * `cleanup` run on SIGINT or SIGTERM, then the process exits 130 or 143. A further signal while it runs is ignored, so
 * a controller that signals the harness and then its process group does not cut the cleanup short (SIGKILL still
 * does); a cleanup that fails is reported on stderr and the process exits all the same. Answers a function that
 * removes the hook, for a run that ends and cleans up by itself.
 */
export function cleanupOnStop(cleanup, { proc = process } = {}) {
  let stopping = false;
  const handler = (signal) => {
    if (stopping) return;
    stopping = true;
    let failure = null;
    Promise.resolve()
      .then(cleanup)
      .catch((error) => {
        failure = error?.message ?? String(error);
        proc.stderr.write(`the cleanup after ${signal} failed: ${failure}\n`);
      })
      .finally(() => {
        const cause = causes.get(proc);
        if (cause) proc.stderr.write(stoppedLine(cause, failure === null ? 'its cleanup completed, unwatched' : `its cleanup did not complete (${failure})`));
        proc.exit(CODES[signal]);
      });
  };
  for (const signal of Object.keys(CODES)) proc.on(signal, handler);
  hooks.set(proc, (hooks.get(proc) ?? 0) + 1);
  let hooked = true;
  return () => {
    if (!hooked) return;
    hooked = false;
    hooks.set(proc, hooks.get(proc) - 1);
    for (const signal of Object.keys(CODES)) proc.off(signal, handler);
  };
}

/**
 * This process stopped for `cause`, as a signal stops it: SIGTERM to itself, so its hooked cleanup runs and the process
 * exits 143, its last line naming `cause` and the cleanup's outcome. With no cleanup hooked, the signal's default ends
 * it at once: the line is written first, saying none ran.
 */
export function stopBecause(cause, { proc = process } = {}) {
  causes.set(proc, cause);
  if (!hooks.get(proc)) proc.stderr.write(stoppedLine(cause, 'no cleanup was in place, so none ran'));
  proc.kill(proc.pid, 'SIGTERM');
}

// per process: the cleanups a fatal error runs (`cleanupOnFatal`), and the one handler that runs them
const FATAL_CLEANUP_MS = 120000;
const fatalHooks = new WeakMap();
const fatalHandlers = new WeakMap();

/**
 * `cleanup` run when the process meets an error nothing caught (an uncaught exception, among them a child's 'error'
 * event with no listener, as M4 candidate 1's D2 spawn of a missing Electron binary was, or an unhandled rejection),
 * which would otherwise end node at once, past every `finally` (#171 M5, T4 round 2; ruling 721). The error is written
 * to stderr, every hooked cleanup runs (each on its own; one that fails is reported), the last line names the error and
 * says the cleanup ran, and the process exits 1. Answers a function that removes the hook; with no hook left the process
 * keeps node's own handling.
 */
export function cleanupOnFatal(cleanup, { proc = process } = {}) {
  const hooked = fatalHooks.get(proc) ?? new Set();
  fatalHooks.set(proc, hooked);
  if (!fatalHandlers.has(proc)) {
    let fatal = false;
    const handler = (error) => {
      if (fatal) return;
      fatal = true;
      proc.stderr.write(`${error?.stack ?? String(error)}\n`);
      const cleanups = [...(fatalHooks.get(proc) ?? [])];
      // a cleanup that hangs (a display gone mid-call) never keeps the process: it exits 1 after `FATAL_CLEANUP_MS`
      setTimeout(() => {
        proc.stderr.write(`cua171 FATAL: ${String(error?.message ?? error).split('\n')[0]}; the run's cleanup did not end within ${FATAL_CLEANUP_MS / 1000} s.\n`);
        proc.exit(1);
      }, FATAL_CLEANUP_MS);
      Promise.allSettled(cleanups.map((c) => Promise.resolve().then(c)))
        .then((settled) => {
          for (const s of settled) if (s.status === 'rejected') proc.stderr.write(`a cleanup after the fatal error failed: ${s.reason?.message ?? s.reason}\n`);
          proc.stderr.write(`cua171 FATAL: ${String(error?.message ?? error).split('\n')[0]}; the run's cleanup ran before the exit.\n`);
        })
        .finally(() => proc.exit(1));
    };
    fatalHandlers.set(proc, handler);
    proc.on('uncaughtException', handler);
    proc.on('unhandledRejection', handler);
  }
  const entry = () => cleanup();
  hooked.add(entry);
  return () => {
    hooked.delete(entry);
    if (hooked.size) return;
    const handler = fatalHandlers.get(proc);
    if (!handler) return;
    proc.off('uncaughtException', handler);
    proc.off('unhandledRejection', handler);
    fatalHandlers.delete(proc);
  };
}
