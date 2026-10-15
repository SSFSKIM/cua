// A controlled clock for tests of budget logic (the spec's "assert events, not speed"): Date and setTimeout are the
// test's, and time moves 1 ms after each event-loop turn until `work` settles; then the real clock is back. What the
// code under test decides from the clock (a deadline spent or not, which timeout came first, where a budget ran out) is
// then the same on any machine, however loaded. Code that waits on real I/O does not belong under it.
export async function onControlledClock(t, work) {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: 1_000_000});
  let done = false;
  const result = work().finally(() => { done = true; });
  try {
    while (!done) {
      await new Promise(resolve => setImmediate(resolve));
      if (!done) t.mock.timers.tick(1);
    }
    return await result;
  } finally {
    t.mock.timers.reset();
  }
}
