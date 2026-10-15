// The execution budget of cua's own REPL host (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Design
// "Supervisor, execution order and lifecycle"): the timer a `js` call's `timeout_ms` (default 30,000 ms) starts before
// the submitted code is sent. Trusted code pauses it around waits that are not the cell's own work (approvals, a
// helper's startup) with `nodeRepl.withSuspendedTimeout`, whose `suspend_timeout`/`resume_timeout` messages reach the
// supervisor (NR:privileged-node-repl.js:424-449): suspensions nest, and the budget resumes, with what was left of it,
// only when the last one ends. The budget stops for good when the submitted code's phase ends or the execution settles.
const MAX_TIMER_MS = 2_147_483_647;

// A timer for any non-negative duration (setTimeout alone fires at once past 2^31-1 ms) -> cancel.
export function timer(ms, fn) {
  let handle;
  const arm = left => { handle = setTimeout(() => (left > MAX_TIMER_MS ? arm(left - MAX_TIMER_MS) : fn()), Math.min(left, MAX_TIMER_MS)); };
  arm(ms);
  return () => clearTimeout(handle);
}

// Starts a budget of `ms` that calls `onExpire` once when it runs out -> {suspend, resume, stop, get suspended}.
// `now` and `schedule` (timer's shape) are seams for tests.
export function executionBudget(ms, onExpire, {now = () => performance.now(), schedule = timer} = {}) {
  let remaining = ms;
  let startedAt = now();
  let depth = 0;
  let stopped = false;
  const expire = () => { if (!stopped) { stopped = true; onExpire(); } };
  let cancel = schedule(ms, expire);
  return {
    get suspended() { return depth > 0; },
    suspend() {
      if (stopped) return;
      if (depth++ === 0) {
        cancel();
        remaining = Math.max(0, remaining - (now() - startedAt));
      }
    },
    resume() {
      if (stopped || depth === 0) return;
      if (--depth === 0) {
        startedAt = now();
        cancel = schedule(remaining, expire);
      }
    },
    stop() {
      stopped = true;
      cancel();
    },
  };
}
