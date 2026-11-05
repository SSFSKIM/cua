#!/bin/bash
# The bounded re-review's probe (review-61/probe-fix2.py, case synthmulti) on a private Xvfb and session bus, never :0:
# Qt 5 and Qt 6, the double click and the one-click control, on the engine named.
# usage: review-probe.sh <engine> <out> [runs]
set -u
engine=$1 out=$2 runs=${3:-5}
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
: > "$out"
for qt in 5 6; do
  for count in 2 1; do
    for i in $(seq "$runs"); do
      echo "## qt$qt click_count $count run $i" >> "$out"
      REVIEW_ENGINE=$engine REVIEW_QT=$qt REVIEW_COUNT=$count timeout 120 xvfb-run -a \
        dbus-run-session --dbus-daemon="$wt/native/linux-engine/tests/dbus-daemon-quiet" -- \
        python3 -I "$HOME/.local/share/cua-171/review-61/probe-fix2.py" synthmulti >> "$out" 2>&1
    done
  done
done
grep -E '^## |"case"' "$out" | paste - - | sed -E 's/.*## (qt. click_count . run .).*"activated": (true|false).*/\1 activated=\2/'
