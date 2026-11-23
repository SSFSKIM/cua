// A clock whose timers fire early, as Node's can under load: a timer for `ms` comes due while Date.now() still reads
// up to about 1 ms under the end it was armed for. setTimeout and clearTimeout are node:test's mocked timers and
// Date.now() is the test's, so the two can move apart the same way on any machine. What a deadline's timer decides
// must then hold although the clock still gives the deadline time.
export function earlyTimers(t, {lagMs = 1, now = 1_000_000} = {}) {
  let clock = now;
  t.mock.timers.enable({apis: ['setTimeout']});
  t.mock.method(Date, 'now', () => clock);
  return {
    // Runs the timers that come due within `ms` while Date.now() moves on only `ms - lagMs`: each timer due in that
    // span fires with the clock up to `lagMs` short of its end.
    elapse(ms) {
      clock += ms - lagMs;
      t.mock.timers.tick(ms);
    },
  };
}

// Lets the promise jobs and the event-loop turns that follow settle (setImmediate is not mocked).
export const settle = async (turns = 5) => {
  for (let i = 0; i < turns; i++) await new Promise(resolve => setImmediate(resolve));
};
