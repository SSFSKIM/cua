#!/bin/bash
# Task 73's third fix wave, one locked step: the musl build (release, or `live`) and the harness export of a commit,
# then the sitting lines given (batch.sh's `name plan engine load [args]`), on that harness, with the commit's build as
# `new` (release) or `live`.
# usage: step-prepare.sh <commit> release|live [p3 engine] -- <line>...
set -u
s=$HOME/.local/share/cua-171/task73fix3/scripts
commit=$1
kind=$2
shift 2
p3=""
if [ "${1:-}" != "--" ]; then p3=$1; shift; fi
shift
out=$HOME/.local/share/cua-171/task73fix3/prepare-$commit-$kind.out
if [ "$kind" = live ]; then
  bash "$s/prepare.sh" "$commit" live > "$out" 2> "${out%.out}.err" || { echo "prepare failed"; tail -20 "${out%.out}.err"; exit 1; }
else
  bash "$s/prepare.sh" "$commit" > "$out" 2> "${out%.out}.err" || { echo "prepare failed"; tail -20 "${out%.out}.err"; exit 1; }
fi
engine=$(sed -n 1p "$out")
harness=$(sed -n 2p "$out")
echo "engine $engine"
echo "harness $harness"
if [ "$kind" = live ]; then
  printf "%s\n" "$@" | bash "$s/batch.sh" "$harness" "" "$p3" "$engine"
else
  printf "%s\n" "$@" | bash "$s/batch.sh" "$harness" "$engine" "$p3"
fi
