#!/bin/bash
# usage: probe-supervisor-kill.sh <label> <root> <engine bin> <held|unheld> [extra env...]   (a private xvfb-run display)
label=$1; root=$2; bin=$3; mode=$4; shift 4
d=<probes>
wt=<worktree>
out=$d/probe-supervisor-kill-$label.log
echo "stress-ng: $(pgrep -c -x stress-ng)" > "$out"
env "$@" timeout 120 xvfb-run -a -s "-screen 0 1280x800x24 -noreset" dbus-run-session --dbus-daemon="$wt/native/linux-engine/tests/dbus-daemon-quiet" -- node $d/probe-supervisor-kill.mjs "$root" "$bin" "$wt/scripts/linux-engine-diff/xprobe/target/release/xprobe" "$mode" "$label" >> "$out" 2>&1
echo "exit $?" >> "$out"
grep -vE '^sig ' "$out" | cut -c1-700
