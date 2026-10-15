// The lifeline watcher thread (./lifeline.mjs): reads the lifeline every POLL_MS, sleeping in between (the pipe is open
// without blocking), and kills its own process the moment the read finds the pipe's end. A failure to read other than
// "nothing yet" ends the watch, never the process.
import {readSync} from 'node:fs';
import {workerData} from 'node:worker_threads';

const POLL_MS = 250;
const {fd} = workerData;
const buffer = Buffer.alloc(64);
const pause = new Int32Array(new SharedArrayBuffer(4));
for (;;) {
  let read;
  try {
    read = readSync(fd, buffer, 0, buffer.length, null);
  } catch (error) {
    if (error.code !== 'EAGAIN' && error.code !== 'EWOULDBLOCK') break;
    Atomics.wait(pause, 0, 0, POLL_MS);
    continue;
  }
  if (read === 0) process.kill(process.pid, 'SIGKILL');
}
