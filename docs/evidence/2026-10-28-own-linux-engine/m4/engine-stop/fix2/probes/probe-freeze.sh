#!/bin/bash
# usage: probe-freeze.sh <label> <engine bin> <trials> [load factor] [extra env...]   (a private xvfb-run display)
label=$1; bin=$2; trials=$3; factor=${4:-0}; shift 4
d=<probes>
wt=<worktree>
out=$d/probe-freeze-$label.log
echo "stress-ng before: $(pgrep -c -x stress-ng)" > "$out"
load=
if [ "$factor" != 0 ]; then
  stress-ng --cpu $(( $(nproc) * factor )) --cpu-method matrixprod --timeout 1h --quiet &
  load=$!
  sleep 5
fi
echo "loadavg: $(cat /proc/loadavg)" >> "$out"
env "$@" timeout 1800 xvfb-run -a -s "-screen 0 1280x800x24 -noreset" dbus-run-session --dbus-daemon="$wt/native/linux-engine/tests/dbus-daemon-quiet" -- node $d/probe-freeze.mjs "$wt" "$bin" "$wt/scripts/linux-engine-diff/xprobe/target/release/xprobe" "$trials" "$label" >> "$out" 2>&1
echo "exit $?" >> "$out"
[ -n "$load" ] && kill $load && wait $load 2>/dev/null
echo "stress-ng after: $(pgrep -c -x stress-ng)" >> "$out"
grep -E 'summary|^exit|stress-ng|loadavg|"error"' "$out" | cut -c1-600
