#!/bin/bash
# The review's probe over three engines (before task 60, task 60's, the fix), as the review ran it (the Chrome window
# left focused by GrabFocus) and in the background (`--front`), then the fix with the click settle at 100 ms.
set -u
H=$HOME/.local/share/cua-171/task60-fix/harness-397b2191
R=$HOME/.local/share/cua-171/task60-fix/runs
OLD=$HOME/.local/share/cua-171/task59/build/40b1e16329d69e4bf267acddf5c53364365c4d33/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
T60=$HOME/.local/share/cua-171/task60/build/5570d064e6f6e5757a0072adb880ed7aea603c01/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
FIX=$HOME/.local/share/cua-171/task60-fix/build/397b21913d201d15bb084c09ec9c69dd75d9469b/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
P=$HOME/.local/share/cua-171/task60-fix/scripts/review-probe.mjs
pgrep -x stress-ng && exit 3
timeout 1800 node "$P" "$H" "$R/probe-focused" 10 "before-t60=$OLD" "t60=$T60" "fix=$FIX" > "$R/probe-focused.out" 2>&1
echo "focused exit $?"; tail -1 "$R/probe-focused.out"
timeout 1800 node "$P" --front "$H" "$R/probe-background" 10 "before-t60=$OLD" "t60=$T60" "fix=$FIX" > "$R/probe-background.out" 2>&1
echo "background exit $?"; tail -1 "$R/probe-background.out"
