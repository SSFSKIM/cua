#!/bin/bash
# usage: probe-shim.sh <label> <root> <engine bin> <held|unheld|worker> [extra env...]   (a private xvfb-run display)
label=$1; root=$2; bin=$3; mode=$4; shift 4
d=<fix5>
wt=<worktree>
mkdir -p "$d/probes"
out=$d/probes/$label.log
echo "stress-ng: $(pgrep -c -x stress-ng)" > "$out"
env "$@" timeout 120 xvfb-run -a -s "-screen 0 1280x800x24 -noreset" dbus-run-session --dbus-daemon="$wt/native/linux-engine/tests/dbus-daemon-quiet" -- node $d/probe-shim.mjs "$root" "$bin" "$wt/scripts/linux-engine-diff/xprobe/target/release/xprobe" "$mode" "$label" >> "$out" 2>&1
echo "exit $?" >> "$out"
cut -c1-900 "$out"
