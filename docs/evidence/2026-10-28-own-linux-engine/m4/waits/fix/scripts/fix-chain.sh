#!/bin/bash
# The fix wave's sittings on the final engine (958db275), one after another: the capture rule idle and at twice the
# load (GTK 4 alone, 30 trials a condition; every family with the quiet control lane), then the activate-then-click
# cell at twice the load (both modes, settle-0 and shipped), traced by order-watch. Checks the hold file and stress-ng
# before each sitting.
set -u
. "$(dirname "$0")/env.sh"
S=$T/scripts
step() {
  while [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; do echo "hold-sittings present, waiting $(date -u +%T)"; sleep 60; done
  while pgrep -x stress-ng >/dev/null; do echo "stress-ng running, waiting $(date -u +%T)"; sleep 60; done
  echo "== $1 $(date -u +%T)"
}
step readiness-gtk4-idle
"$S/readiness.sh" "$H" "$FINAL" readiness-gtk4-idle --family gnome-text-editor --trials 30 | tail -n 3
step readiness-all-idle
"$S/readiness.sh" "$H" "$FINAL" readiness-all-idle --variant 'control=--capture-wait quiet' | tail -n 3
step readiness-gtk4-load2
"$S/readiness.sh" "$H" "$FINAL" readiness-gtk4-load2 --family gnome-text-editor --trials 30 --load-factor 2 | tail -n 3
step readiness-all-load2
"$S/readiness.sh" "$H" "$FINAL" readiness-all-load2 --variant 'control=--capture-wait quiet' --load-factor 2 | tail -n 3
step activate-click-load2
"$S/traced-sitting.sh" "$H" "$FINAL" activate-click-load2 --family gtk3 --kinds activate_click --lanes settle-0,shipped --load-factor 2 > "$T/runs/activate-click-load2.chain.txt" 2>&1
echo "   exit $? $(grep -o '"kind":"settle-verdict","pass":[a-z]*' "$T/runs/activate-click-load2/results.jsonl" | head -1)"
echo "== all done $(date -u +%T)"
