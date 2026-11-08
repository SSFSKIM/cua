#!/bin/bash
# tests/two-screens.sh on a commit's engine sources with the working tree's live tests and tooling (live_device.rs,
# support/, two-screens.sh, xorg-two-screens.conf). usage: two-screens-red.sh <commit> <log>
set -u
if [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; then echo "hold-sittings present" >&2; exit 5; fi
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
dir=$HOME/.local/share/cua-171/task66-fix/two-screens-$1
rm -rf "$dir"
mkdir -p "$dir"
git -C "$wt" archive "$1" native/linux-engine | tar -x -C "$dir"
for f in live_device.rs support/mod.rs two-screens.sh xorg-two-screens.conf; do
  cp -p "$wt/native/linux-engine/tests/$f" "$dir/native/linux-engine/tests/$f"
done
cd "$dir/native/linux-engine"
unset DISPLAY
tests/two-screens.sh > "$2" 2>&1
echo "exit $?" >> "$2"
cat "$2"
