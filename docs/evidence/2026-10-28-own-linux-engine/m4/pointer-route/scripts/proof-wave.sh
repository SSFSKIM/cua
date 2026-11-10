#!/bin/bash
# Task 71's fix wave: the build's proof on private displays again, each step (build-proof.sh) its own locked call, so a
# step holds the host lock 45 minutes at most and another executor's steps may run between them. Stops at the first
# step that fails; the hold file stops it before the next step.
# usage: proof-wave.sh <harness dir> <candidate engine path> <name> <step>...   (each step's log: $T/<name>-<step>.log)
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
h=$1
cand=$2
name=$3
shift 3
for step in "$@"; do
  [ -e "$HOME/.local/share/cua-171/hold-sittings" ] && { echo "hold-sittings present: stopping before $step"; exit 5; }
  "$HOME/.local/share/cua-171/locked.sh" task71 "$d/build-proof.sh" "$h" "$cand" "$name" "$step" > "$T/$name-$step.log" 2>&1
  status=$?
  echo "$step status $status $(grep -E '^(start|end) ' "$T/$name-$step.log" | tr '\n' ' ')"
  [ $status -eq 0 ] || exit $status
done
