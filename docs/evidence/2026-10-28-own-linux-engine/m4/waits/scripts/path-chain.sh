#!/bin/bash
# The path wait's proof on one engine: the settle experiment's pointer cells on the desktop and foreground routes and
# every move cell, shipped lane, then the activate-then-click cell (both modes, settle-0 and shipped) traced by
# order-watch. One load level per call.
# usage: path-chain.sh <harness dir> <engine> <label> [--load-factor 2]
set -u
. "$(dirname "$0")/env.sh"
h=$1
engine=$2
label=$3
shift 3
run() {
  echo "== $1 $(date -u +%T)"
  "$T/scripts/traced-sitting.sh" "$h" "$engine" "${@}" > "$T/runs/$1.chain.txt" 2>&1
  echo "   exit $? $(grep -o '"kind":"settle-verdict","pass":[a-z]*' "$T/runs/$1/results.jsonl" | head -1)"
}
guard
run "$label-pointer" --kinds click,right_click,scroll,drag,drag_handle --routes desktop,dedicated --lanes shipped "$@"
guard
run "$label-move" --kinds move --lanes shipped "$@"
guard
run "$label-cell" --family gtk3 --kinds activate_click --lanes settle-0,shipped "$@"
echo "== done $(date -u +%T)"
