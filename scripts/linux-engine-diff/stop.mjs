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
