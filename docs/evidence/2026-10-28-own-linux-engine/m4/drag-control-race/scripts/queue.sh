#!/bin/bash
# Task 75's remaining locked blocks, each requested only 2 minutes after the last one ended, so a waiting executor can
# take the lock first (the coordinator's fairness request, 2026-11-11).
#   usage: queue.sh <pid of the block now running, or 0>
set -u
d=/Users/new/.local/share/cua-171/task75
L=/Users/new/.local/share/cua-171/locked.sh
while [ "$1" != 0 ] && kill -0 "$1" 2>/dev/null; do sleep 5; done
block() {
  sleep 120
  [ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "hold-sittings: stopped before $*" >> "$d/queue-status.txt"; exit 3; }
  "$@"
  echo "$(date -u +%FT%TZ) block ended: $*" >> "$d/queue-status.txt"
}
block env TASK75_SRC=$d/expfix/native/linux-engine CUA_ENGINE_GIT_SHA=task75fix $L task75 "$d/run.sh" alone 1 100 "$d/runs-fixed"
for a in 47 62 77 92; do
  b=$((a + 14 > 100 ? 100 : a + 14))
  block $L task75 "$d/run.sh" suite "$a" "$b" "$d/runs"
done
echo "$(date -u +%FT%TZ) done" >> "$d/queue-status.txt"
