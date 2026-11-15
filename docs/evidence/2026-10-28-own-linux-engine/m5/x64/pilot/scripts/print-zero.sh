#!/bin/bash
# Task 87 (from task 79's print-zero.sh): the :0 steps' commands for the x64 pilot, printed by the pilot checkout into
# the pilot's out root, as development runs in their pilot form.
set -u
T=/Users/new/.local/share/cua-171/task87/x64
for s in "$@"; do
  echo "== $s"
  "$T/g.sh" print "$s" --pinned /Users/new/.local/share/cua-171/m5/pilot-x64/home --out /Users/new/.local/share/cua-171/m5/pilot-x64/out --dev --pilot 2 --holder t87-pilot
done
