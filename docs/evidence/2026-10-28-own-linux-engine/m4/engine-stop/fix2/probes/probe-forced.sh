#!/bin/bash
# usage: probe-forced.sh <label> <engine bin> <trials> [load factor]   (a private xvfb-run display; load: stress-ng)
label=$1; bin=$2; trials=$3; factor=${4:-0}
d=<probes>
wt=<worktree>
out=$d/probe-forced-$label.log
echo "stress-ng before: $(pgrep -c -x stress-ng)" > "$out"
load=
if [ "$factor" != 0 ]; then
  stress-ng --cpu $(( $(nproc) * factor )) --cpu-method matrixprod --timeout 1h --quiet &
  load=$!
  sleep 5
fi
echo "loadavg: $(cat /proc/loadavg)" >> "$out"
timeout 600 xvfb-run -a -s "-screen 0 1280x800x24 -noreset" dbus-run-session --dbus-daemon="$wt/native/linux-engine/tests/dbus-daemon-quiet" -- node $d/probe-forced.mjs "$bin" "$wt/scripts/linux-engine-diff/xprobe/target/release/xprobe" "$trials" "$label" >> "$out" 2>&1
echo "exit $?" >> "$out"
[ -n "$load" ] && kill $load && wait $load 2>/dev/null
echo "stress-ng after: $(pgrep -c -x stress-ng)" >> "$out"
grep -E 'summary|^exit|stress-ng|loadavg' "$out"
