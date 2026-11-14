#!/bin/bash
# An experiment that starts its own private X server (events, settle), from a harness directory.
# usage: experiment.sh <harness dir> <name> <linux-engine-diff.mjs args...>
set -u
. "$(dirname "$0")/env.sh"
guard
h=$1
name=$2
shift 2
out=$T/runs/$name
mkdir -p "$out"
cd "$h" || exit 2
node scripts/linux-engine-diff.mjs "$@" --out "$out" --run "t64f-$name" > "$out.out" 2>&1
code=$?
echo "experiment $name exit $code $(date -u +%T)"
tail -n 40 "$out.out"
