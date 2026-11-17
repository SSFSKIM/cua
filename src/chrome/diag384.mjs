// #384 diagnosis only (branch diag/384-cdp-latency, never merged): a process's timing rows, appended as JSONL to
// <dir>/<role>-<pid>.jsonl, where `dir` is what ~/.cua-diag-384.json names ({"dir": <absolute path>}); with no such
// file nothing is written. Used by cua's native host (role host) and cua's own REPL supervisor (role sup). Each process
// also writes one row a second with its event-loop delay and the bytes it moved. Rows hold times, counts and command
// names only.
import {appendFileSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';

export const now = () => Math.round((performance.timeOrigin + performance.now()) * 10) / 10;
let role = 'host';
let file = null;
let checked = 0;
function target() {
  if (file) return file;
  const t = Date.now();
  if (t - checked < 2000) return null;
  checked = t;
  try {
    const {dir} = JSON.parse(readFileSync(join(homedir(), '.cua-diag-384.json'), 'utf8'));
    if (typeof dir === 'string' && isAbsolute(dir)) file = join(dir, `${role}-${process.pid}.jsonl`);
  } catch {}
  return file;
}
export function write(row) {
  const path = target();
  if (!path) return;
  try { appendFileSync(path, `${JSON.stringify({pid: process.pid, ...row})}\n`); } catch {}
}
const io = {inN: 0, inB: 0, outN: 0, outB: 0};
export const countIn = bytes => { io.inN++; io.inB += bytes; };
export const countOut = bytes => { io.outN++; io.outB += bytes; };

let started = false;
// Starts the once-a-second row for this process, named `name`.
export function start(name) {
  if (started) return;
  started = true;
  role = name;
  const histogram = monitorEventLoopDelay({resolution: 10});
  histogram.enable();
  const timer = setInterval(() => {
    write({k: 'lag', p: name, t: now(), max: Math.round(histogram.max / 1e5) / 10, mean: Math.round(histogram.mean / 1e5) / 10, ...io});
    histogram.reset();
    io.inN = io.inB = io.outN = io.outB = 0;
  }, 1000);
  timer.unref?.();
}
