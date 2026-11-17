// #384 diagnosis only (branch diag/384-cdp-latency, never merged): per-command timing of the service's CDP commands and
// its own event-loop lag. Rows leave through the backend socket as `cuaDiag` notifications, which cua's host writes to
// its diagnosis file (src/chrome/host.mjs); the service itself writes nothing. A row carries only times, command names
// and the lane (the REPL host the service runs in), never params or results.
import {monitorEventLoopDelay} from 'node:perf_hooks';

export const now = () => Math.round((performance.timeOrigin + performance.now()) * 10) / 10;
export const LANE = process.env.CUA_REPL_TRUSTED_SERVICES ? 'cua' : process.env.NODE_REPL_TRUSTED_SERVICES ? 'vendor' : 'unknown';
let counter = 0;
export const nextKey = () => `${process.pid}-${++counter}`;

// Rows waiting for a backend to carry them (the lag monitor's, an rpc's that ran before any backend was open).
const queue = [];
const MAX_QUEUE = 2000;
const sinks = new Set();
export function record(row) {
  const full = {lane: LANE, pid: process.pid, ...row};
  for (const sink of sinks) { try { sink(full); return; } catch {} }
  if (queue.length < MAX_QUEUE) queue.push(full);
}
// `sink(row)` sends one row; -> unsubscribe. Queued rows are flushed into the first sink.
export function addSink(sink) {
  sinks.add(sink);
  while (queue.length) { try { sink(queue[0]); queue.shift(); } catch { break; } }
  return () => sinks.delete(sink);
}

// One row a second: the worst and the mean event-loop delay of that second, in ms.
const histogram = monitorEventLoopDelay({resolution: 10});
histogram.enable();
const lagTimer = setInterval(() => {
  record({k: 'lag', p: 'svc', t: now(), max: Math.round(histogram.max / 1e5) / 10, mean: Math.round(histogram.mean / 1e5) / 10});
  histogram.reset();
}, 1000);
lagTimer.unref?.();
