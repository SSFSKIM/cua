#!/bin/bash
# Task 64's sittings at twice the gate's load (16 stress-ng workers on 8 cores) on the C3 engine, one after another.
set -u
. "$(dirname "$0")/env.sh"
S=$T/scripts
echo "== readiness gtk4 load2 $(date -u +%T)"
"$S/readiness.sh" "$H2" "$C3" c3-readiness-gtk4-load2 --family gnome-text-editor --trials 30 --load-factor 2 | tail -n 3
echo "== readiness all load2 $(date -u +%T)"
"$S/readiness.sh" "$H2" "$C3" c3-readiness-all-load2 --variant 'control=--capture-wait quiet' --load-factor 2 | tail -n 3
echo "== path proof load2 $(date -u +%T)"
"$S/path-chain.sh" "$H2" "$C3" c3-load2 --load-factor 2
echo "== all done $(date -u +%T)"
