#!/bin/bash
# The path wait's search on the cells 0 ms missed (Chromium pages' desktop move), from the smallest step up, one
# sitting per step, each a wrapper of C2 with --path-step-ms.
# usage: path-search.sh <label> <steps...> [-- extra settle args]
set -u
. "$(dirname "$0")/env.sh"
label=$1
shift
steps=()
while [ $# -gt 0 ] && [ "$1" != "--" ]; do steps+=("$1"); shift; done
[ "${1:-}" = "--" ] && shift
for n in "${steps[@]}"; do
  guard
  name="search-$label-path$n"
  echo "== $name $(date -u +%T)"
  "$T/scripts/sitting.sh" "$H2" "$T/build/wrappers/path$n" "$name" --family chrome,electron --kinds move --routes desktop --lanes shipped "$@" > "$T/runs/$name.chain.txt" 2>&1
  grep -o '"kind":"settle-verdict","pass":[a-z]*' "$T/runs/$name/results.jsonl" | head -1
done
echo "== search done $(date -u +%T)"
