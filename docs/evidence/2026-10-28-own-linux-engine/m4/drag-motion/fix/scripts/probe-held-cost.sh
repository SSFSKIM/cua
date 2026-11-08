#!/bin/bash
# The held-move cost probe (probe/probe_held_cost.rs) on a commit's engine sources, as the gate builds the live tests,
# on a private Xvfb, never :0. usage: probe-held-cost.sh <commit|worktree> <log>
set -u
if [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; then echo "hold-sittings present" >&2; exit 5; fi
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
f=$HOME/.local/share/cua-171/task66-fix
dir=$f/probe-tree
rm -rf "$dir"
mkdir -p "$dir"
if [ "$1" = worktree ]; then cp -r "$wt/native" "$dir/" && rm -rf "$dir/native/linux-engine/target"
else git -C "$wt" archive "$1" native/linux-engine | tar -x -C "$dir"; fi
cp "$f/probe/probe_held_cost.rs" "$dir/native/linux-engine/tests/probe_held_cost.rs"
cd "$dir/native/linux-engine"
unset DISPLAY
xvfb-run -a -s '-screen 0 1280x800x24' dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live --test probe_held_cost -- --test-threads 1 --nocapture > "$2" 2>&1
echo "exit $?"
grep -E 'PROBE|test result|panicked' "$2"
