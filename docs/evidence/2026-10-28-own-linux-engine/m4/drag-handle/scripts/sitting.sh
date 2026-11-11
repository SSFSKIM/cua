#!/bin/bash
# Task 73's sitting (run under the host lock): the drag experiment's held-move cells on a private display (private.sh),
# on a harness export patched for the probe (prepare.sh: patch-harness.mjs, disturb.mjs), the disturbance in the
# `cua:d` lane (and `newest`, when it runs) and the other lanes undisturbed. Each handle's steps, answers and what it
# left pending go to the run's handles.jsonl; with T73_CURSORS=1 the displayed cursor's changes to its cursors.jsonl.
# usage: sitting.sh <harness dir> <candidate engine> <name> <disturbance> <trials> [family] [ops] [lanes] [more args...]
#   family defaults to chrome, ops to handle-select,handle-range,handle-dnd, lanes to pinned,cua,cua:d
set -u
. "$(dirname "$0")/env.sh"
h=$1
cand=$2
name=$3
disturbance=$4
trials=$5
family=${6:-chrome}
ops=${7:-handle-select,handle-range,handle-dnd}
lanes=${8:-pinned,cua,cua:d}
shift 5
[ $# -gt 0 ] && shift
[ $# -gt 0 ] && shift
[ $# -gt 0 ] && shift
mkdir -p "$T/runs/$name"
export T73_DISTURB=$disturbance T73_DISTURB_LANES=newest,cua:d T73_GAP_MS=${T73_GAP_MS:-2000}
export T73_LOG=$T/runs/$name/handles.jsonl T73_DISTURB_MODULE=$S/disturb.mjs
export T73_XPROBE=$h/scripts/linux-engine-diff/xprobe/target/release/xprobe T73_XGRAB=$T/xgrab-target/release/xgrab
if [ "${T73_CURSORS:-0}" = 1 ]; then export T73_CURSORS=$T/runs/$name/cursors.jsonl; else unset T73_CURSORS; fi
exec "$S/private.sh" "$h" "$name" --experiment drag --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" \
  --family "$family" --ops "$ops" --occlusion visible --lanes "$lanes" --variant 'd=--drag-dnd-hold-ms 250' \
  --trials "$trials" --run "t73-$name" "$@"
