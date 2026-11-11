#!/bin/bash
# Task 75: the suite mode in locked steps of 15 runs (about 41 minutes each), releasing the lock between steps.
#   usage: steps.sh <first> <last> <outdir>
set -u
first=$1 last=$2 out=$3
for ((a = first; a <= last; a += 15)); do
  b=$((a + 14 > last ? last : a + 14))
  [ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "hold-sittings: stopped before suite-$a" >> "$out/status.txt"; exit 3; }
  /Users/new/.local/share/cua-171/locked.sh task75 /Users/new/.local/share/cua-171/task75/run.sh suite "$a" "$b" "$out" || exit $?
done
