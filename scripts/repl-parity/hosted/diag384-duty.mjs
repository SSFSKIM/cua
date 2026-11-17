#!/usr/bin/env node
// #384 diagnosis only (ruling 794, branch diag/384-cdp-latency, never merged): a duty-cycled CPU burner. Each 100 ms
// period it spins for <pct> % of the period, then sleeps the rest; the period is re-anchored on wall time, so a period
// the scheduler delays does not stack burns. hosted.sh starts one per core.
//   node scripts/repl-parity/hosted/diag384-duty.mjs <pct>
const pct = Number(process.argv[2]);
if (!(pct > 0 && pct < 100)) process.exit(2);
const PERIOD = 100;
const burn = PERIOD * pct / 100;
process.on('SIGTERM', () => process.exit(0));
let x = 0;
function tick() {
  const start = performance.now();
  while (performance.now() - start < burn) x = (x * 1103515245 + 12345) % 2147483648;
  const used = performance.now() - start;
  setTimeout(tick, Math.max(0, PERIOD - used));
}
tick();
