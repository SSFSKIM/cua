#!/bin/bash
# task 73b: the drag-image case RED on 035b1c04 and GREEN on the checkout, clippy first
set -u
S=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-handle/scripts
T=$HOME/.local/share/cua-171/task73b
cd $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine
cargo clippy --release --locked --target x86_64-unknown-linux-musl --all-targets --features live -- -D warnings > "$T/clippy-2.log" 2>&1
echo "clippy status $?"
bash "$S/red-live.sh" 035b1c04 a_chromium_drag_handle_s_end_arms > "$T/red-2.log" 2>&1
echo "red status $?"
bash "$S/engine-tests.sh" live --test live_device -- --test-threads 1 drag_handle > "$T/green-2.log" 2>&1
echo "green status $?"
