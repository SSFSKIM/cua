#!/bin/bash
# Task 96: the vendor reruns again, after their first attempt failed before anything ran (dbus-daemon: "Socket name too
# long", the private desktop's out directory too deep); that attempt is kept as vendor-reruns/attempt-1. Waits for
# repeats.sh (the E1 repeats) to finish first.
set -u
T=/Users/new/.local/share/cua-171/task96
V=/Users/new/.local/share/cua-171/m5/pilot-arm64/vendor-reruns
while pgrep -f task96/repeats.sh > /dev/null; do sleep 20; done
mkdir -p "$V/attempt-1"
for x in "$V"/rerun-* "$V"/reruns.log; do [ -e "$x" ] && mv "$x" "$V/attempt-1/"; done
"$T/vendor-reruns.sh" 3
echo "repeats2 done $(date -u +%FT%TZ)"
