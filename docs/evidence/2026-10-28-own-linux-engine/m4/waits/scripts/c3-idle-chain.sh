#!/bin/bash
# Task 64's idle sittings on the C3 engine (500b48fd), one after another.
set -u
. "$(dirname "$0")/env.sh"
S=$T/scripts
echo "== events $(date -u +%T)"
"$S/experiment.sh" "$H2" c3-events-idle --experiment events --vendor "$PINNED" --newest "$NEWEST" --cua "$C3" | tail -n 30
echo "== readiness gtk4 $(date -u +%T)"
"$S/readiness.sh" "$H2" "$C3" c3-readiness-gtk4-idle --family gnome-text-editor --trials 30 | tail -n 3
echo "== readiness all $(date -u +%T)"
"$S/readiness.sh" "$H2" "$C3" c3-readiness-all-idle | tail -n 3
echo "== path proof $(date -u +%T)"
"$S/path-chain.sh" "$H2" "$C3" c3-idle
echo "== all done $(date -u +%T)"
