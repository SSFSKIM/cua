#!/bin/bash
# Task 73's probe sitting (run under the host lock): the drag experiment's held-move cells into Chrome on a private
# display, on the patched harness copy, the disturbance in the `newest` and `cua:d` lanes; `pinned` and `cua` undisturbed.
# usage: sitting.sh <disturbance> [trials]
set -u
T=$HOME/.local/share/cua-171/task73
export T
H=$(cat "$T/harness-path.txt")
E=$(cat "$T/engine-path.txt")
S=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-load/scripts
name="probe-$1-$(date -u +%H%M%S)"
mkdir -p "$T/runs/$name"
export T73_DISTURB=$1 T73_DISTURB_LANES=newest,cua:d T73_GAP_MS=2000
export T73_LOG=$T/runs/$name/handles.jsonl T73_DISTURB_MODULE=$T/probes/disturb.mjs
export T73_XPROBE=$H/scripts/linux-engine-diff/xprobe/target/release/xprobe T73_XGRAB=$T/probes/xgrab/target/release/xgrab
exec bash "$S/drag.sh" "$H" "$name" "$E" --family chrome --ops handle-select,handle-range,handle-dnd --occlusion visible \
  --lanes pinned,newest,cua,cua:d --variant 'd=--drag-dnd-hold-ms 250' --trials "${2:-20}" --run "t73-$1"
