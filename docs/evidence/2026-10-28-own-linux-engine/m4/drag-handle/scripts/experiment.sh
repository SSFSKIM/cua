#!/bin/bash
# Task 73 (task 64's): an experiment that starts its own private X server (events, settle), from a harness directory.
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
# a harness export patched for the probe imports disturb.mjs, which does nothing outside the drag experiment
export T73_DISTURB_MODULE=$S/disturb.mjs
node scripts/linux-engine-diff.mjs "$@" --out "$out" --run "t73-$name" > "$out.out" 2>&1
code=$?
echo "experiment $name exit $code $(date -u +%T)"
tail -n 40 "$out.out"
