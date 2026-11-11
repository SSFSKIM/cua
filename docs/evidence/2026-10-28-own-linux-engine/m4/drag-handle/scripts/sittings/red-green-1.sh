#!/bin/bash
# task 73b: clippy on the checkout, then the new live tests RED on 6f216132 and GREEN on the checkout
set -u
S=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-handle/scripts
T=$HOME/.local/share/cua-171/task73b
cd $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine
F=(a_drag_handle_started_while_another_client_holds_the_pointer a_click_sent_during_the_pre_press_try a_grab_taken_during_a_drag_handle a_drag_handle_whose_pointer_the_person_moved desktop_pointer_input_is_refused_while_a_drag_handle a_chromium_drag_handle_s_end_arms another_screen a_browser_s_drag_handle_rests)
cargo clippy --release --locked --target x86_64-unknown-linux-musl --all-targets --features live -- -D warnings > "$T/clippy-1.log" 2>&1
echo "clippy status $?"
bash "$S/red-live.sh" 6f216132 "${F[@]}" > "$T/red-1.log" 2>&1
echo "red status $?"
bash "$S/engine-tests.sh" live --test live_device -- --test-threads 1 "${F[@]}" > "$T/green-1.log" 2>&1
echo "green status $?"
