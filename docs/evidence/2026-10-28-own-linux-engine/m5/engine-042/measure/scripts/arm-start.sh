#!/bin/bash
# Task 116: waits for the arm64 build (build.sh, queued behind the host lock), then runs the plan on its binary.
T=/Users/new/.local/share/cua-171/task116
while pgrep -f "scripts/build.sh .*t116-measure042 arm64" > /dev/null; do sleep 30; done
bin=$(awk "/cua-engine 0.4.2/ {print \$1}" "$T/build-arm64.out")
[ -x "$bin" ] || { echo "no binary: $(cat "$T/build-arm64.out")"; exit 1; }
exec "$T/scripts/arm-plan.sh" "$bin"
