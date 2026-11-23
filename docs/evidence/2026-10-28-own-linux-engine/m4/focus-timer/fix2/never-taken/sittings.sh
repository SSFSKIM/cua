#!/bin/bash
# The never-taken probe's sittings at twice the load, on the musl build of 418f1e26 and its harness: the terminal
# servers through the probe's xtrace proxy until 3 never-taken runs (at most 400 runs), then the same scene with no proxy
# for as many runs, the proxy's cost.
# usage: sittings.sh <name-suffix> [proxied|direct|both]
set -u
t=/Users/new/.local/share/cua-171/task56-probe
c=418f1e267ca01a43e213f3116545241045dec178
h=$t/live/$c
b=/Users/new/.local/share/cua-171/task56/build/$c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
which=${2:-both}
cd "$t" || exit 2
if [ "$which" != direct ]; then
  timeout 10800 node probe.mjs "$h" "$b" "$t/runs/proxied-$1" --never-taken 3 --max-runs 400 > "$t/runs/proxied-$1.log" 2>&1
  echo "proxied exit $?"
fi
if [ "$which" != proxied ]; then
  n=$(grep -c '"kind":"run"' "$t/runs/proxied-$1/runs.jsonl")
  timeout 10800 node probe.mjs "$h" "$b" "$t/runs/direct-$1" --direct --runs "$n" > "$t/runs/direct-$1.log" 2>&1
  echo "direct exit $? ($n runs)"
fi
