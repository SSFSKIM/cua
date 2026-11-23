#!/bin/bash
# The rest of task 64's twice-the-load sittings, after the hold: the readiness check of every family with its control
# lane, the path proof on C3, and the activate-then-click cell on C2 (no path pause at all) as the stress lane.
set -u
. "$(dirname "$0")/env.sh"
S=$T/scripts
echo "== readiness all load2 $(date -u +%T)"
"$S/readiness.sh" "$H2" "$C3" c3-readiness-all-load2 --variant 'control=--capture-wait quiet' --load-factor 2 | tail -n 3
echo "== path proof load2 $(date -u +%T)"
"$S/path-chain.sh" "$H2" "$C3" c3-load2 --load-factor 2
guard
echo "== cell on C2 (no path pause) load2 $(date -u +%T)"
"$T/scripts/traced-sitting.sh" "$H2" "$C2" c2-load2-cell --family gtk3 --kinds activate_click --lanes settle-0,shipped --load-factor 2 > "$T/runs/c2-load2-cell.chain.txt" 2>&1
grep -o '"kind":"settle-verdict","pass":[a-z]*' "$T/runs/c2-load2-cell/results.jsonl" | head -1
echo "== all done $(date -u +%T)"
