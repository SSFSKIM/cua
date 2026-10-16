// The lifeline watcher thread (./lifeline.mjs). It reads the lifeline every POLL_MS, sleeping in between (the pipe is
// open without blocking). It reports `watching` once a first read has found the pipe live, and kills its own process
// the moment a read finds the pipe's end. A read that fails before that is reported as the start's failure; one that
// fails later is written to stderr, and then the process is killed: it is never left running unwatched.
import {readSync, writeSync} from 'node:fs';
import {parentPort, workerData} from 'node:worker_threads';

const POLL_MS = 250;
const {fd, failed} = workerData;
const buffer = Buffer.alloc(64);
const pause = new Int32Array(new SharedArrayBuffer(4));
let started = false;
try {
  for (;;) {
    let read;
    try {
      read = readSync(fd, buffer, 0, buffer.length, null);
    } catch (error) {
      if (error.code !== 'EAGAIN' && error.code !== 'EWOULDBLOCK') throw error;
      if (!started) { started = true; parentPort.postMessage({watching: true}); }
      Atomics.wait(pause, 0, 0, POLL_MS);
      continue;
    }
    if (read === 0) process.kill(process.pid, 'SIGKILL');
  }
} catch (error) {
  if (!started) parentPort.postMessage({failed: `the watcher could not read the lifeline: ${error.message}`});
  else {
    try { writeSync(2, `${failed}: the watcher could not read the lifeline: ${error.message}\n`); } catch { /* stderr gone */ }
    process.kill(process.pid, 'SIGKILL');
  }
}
