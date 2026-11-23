#!/bin/bash
# Task 89: which counted steps' stored rows name drag_handle and move_relative (the two of the 21 commands V1-V5 send
# no timed request of), counted as lines naming each over every .jsonl under each step's run directory.
# usage: cmd-steps.sh <out root>...
for root in "$@"; do
  for d in "$root"/*.pinned-release; do
    name=$(basename "$d"); name=${name%%.*}
    dh=0; mr=0
    while IFS= read -r f; do
      dh=$((dh + $(grep -c 'drag_handle' "$f")))
      mr=$((mr + $(grep -c 'move_relative' "$f")))
    done < <(find "$d/run" -name '*.jsonl' 2>/dev/null | sort)
    if [ "$dh" -gt 0 ] || [ "$mr" -gt 0 ]; then echo "$name drag_handle lines:$dh move_relative lines:$mr"; fi
  done
done
