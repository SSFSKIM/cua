// A stopped run cleans up as a finished one does (#171, task 22): on SIGINT or SIGTERM the harness runs its own
// cleanup, then exits as the signal would (128 + its number). Its Chrome scene windows live in the person's running
// Chrome (scenes.mjs opens them with `--new-window`), so a run stopped without it strands them there (task 21's stopped
// gate run left 20, closed by title afterwards).

const CODES = { SIGINT: 130, SIGTERM: 143 };

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
    Promise.resolve()
      .then(cleanup)
      .catch((error) => proc.stderr.write(`the cleanup after ${signal} failed: ${error?.message ?? error}\n`))
      .finally(() => proc.exit(CODES[signal]));
  };
  for (const signal of Object.keys(CODES)) proc.on(signal, handler);
  return () => {
    for (const signal of Object.keys(CODES)) proc.off(signal, handler);
  };
}
