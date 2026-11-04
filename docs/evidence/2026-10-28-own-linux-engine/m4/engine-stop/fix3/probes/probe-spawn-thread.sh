#!/bin/bash
# Which thread of the REPL host forks the shimmed launcher: strace -f over a Node process that starts a child through
# kernel-child.mjs's startKernelChild with the built engine as its shim, as the supervisor starts the trusted worker.
# PDEATHSIG follows the forking thread: it must be the main thread (tid == pid).
d=<probes>
wt=<worktree>
engine=$1
out=$d/probe-spawn-thread.log
cat > $d/spawn-thread.mjs <<EOF
import {startKernelChild} from '$wt/src/repl-host/kernel-child.mjs';
import {writeFileSync} from 'node:fs';
writeFileSync('$d/spawn-thread.pid', String(process.pid));
// worker_threads and the libuv pool busy, so another thread would show if one forked
const {Worker} = await import('node:worker_threads');
new Worker('setTimeout(() => {}, 500)', {eval: true});
await import('node:fs/promises').then(fs => Promise.all([1, 2, 3, 4].map(() => fs.readFile('/proc/self/status'))));
const child = startKernelChild({command: '/bin/sh', args: ['-c', 'sleep 0.3'], env: {PATH: process.env.PATH}, cwd: '/'},
  {onMessage: () => {}, onEnd: () => { console.log('ended'); process.exit(0); }, lifelines: null, engine: '$engine', shim: '$engine'});
console.log('child', child.pid);
EOF
strace -f -e trace=clone,clone3,vfork,fork,execve,prctl -o $d/spawn-thread.strace node $d/spawn-thread.mjs > $out 2>&1
echo "exit $?" >> $out
pid=$(cat $d/spawn-thread.pid)
echo "node pid (its main thread's tid): $pid" >> $out
child=$(grep '^child' $out | awk '{print $2}')
echo "the child: $child" >> $out
echo "-- the clone that made the child, and the child's prctl and execs:" >> $out
grep -E "^[0-9]+ +(clone|clone3|vfork|fork)\(.*= $child\b" $d/spawn-thread.strace >> $out
grep -E "^$child +(prctl|execve)" $d/spawn-thread.strace | cut -c1-220 >> $out
cat $out
