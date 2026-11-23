#!/bin/bash
# Task 116: after a :0 guard stop, waits for the controller to clear hold-sittings, sets the stopped attempt aside
# (arm64/stopped-zero-<n>), and runs the plan again on the fdaff715 binary.
T=/Users/new/.local/share/cua-171/task116
while [ -e /Users/new/.local/share/cua-171/hold-sittings ]; do sleep 30; done
n=1; while [ -e "$T/arm64/stopped-zero-$n" ]; do n=$((n+1)); done
mv "$T/arm64/zero" "$T/arm64/stopped-zero-$n"; mv "$T/arm64/zero.out" "$T/arm64/stopped-zero-$n.out"
echo "$(date -u +%FT%TZ) hold-sittings cleared; the stopped attempt is stopped-zero-$n; plan resumed" >> "$T/arm64/chain.log"
exec "$T/scripts/arm-plan.sh" "$T/bin/cua-engine-042-arm64-fdaff715"
