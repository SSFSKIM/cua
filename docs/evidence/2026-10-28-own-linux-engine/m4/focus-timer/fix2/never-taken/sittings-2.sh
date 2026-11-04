#!/bin/bash
# The second pair of sittings at twice the load: 60 runs through the proxy, then 200 with no proxy, for the proxy's
# cost and the engine-side signature of a never-taken run without the proxy.
set -u
t=/Users/new/.local/share/cua-171/task56-probe
c=418f1e267ca01a43e213f3116545241045dec178
h=$t/live/$c
b=/Users/new/.local/share/cua-171/task56/build/$c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
cd "$t" || exit 2
timeout 10800 node probe.mjs "$h" "$b" "$t/runs/proxied-2" --runs 60 > "$t/runs/proxied-2.log" 2>&1
echo "proxied-2 exit $?"
timeout 10800 node probe.mjs "$h" "$b" "$t/runs/direct-2" --direct --runs 200 > "$t/runs/direct-2.log" 2>&1
echo "direct-2 exit $?"
