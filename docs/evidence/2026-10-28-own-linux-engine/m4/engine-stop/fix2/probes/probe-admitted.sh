#!/bin/bash
# usage: probe-admitted.sh <label> <engine bin> [extra env assignments...]   (a private xvfb-run display)
label=$1; bin=$2; shift 2
wt=<worktree>
out=<probes>/probe-admitted-$label.log
env "$@" timeout 150 xvfb-run -a -s "-screen 0 1280x800x24 -noreset" dbus-run-session -- node <probes>/probe-admitted.mjs "$wt" "$bin" "$wt/scripts/linux-engine-diff/xprobe/target/release/xprobe" ${SLEEP_MS:-12000} > "$out" 2>&1
echo "exit $?" >> "$out"
grep -v '^dbus-daemon' "$out" | cut -c1-400
