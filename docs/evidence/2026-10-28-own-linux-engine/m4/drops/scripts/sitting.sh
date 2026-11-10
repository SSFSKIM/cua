#!/bin/bash
# One of task 69's counted sittings on a private display (private.sh), never :0, each its own run, the load given by
# its kind. Run it under the host lock (locked.sh); its README cites the lock's acquire and release lines.
# usage: sitting.sh <harness dir> <candidate engine> <name> counts idle|gate|load2
#        sitting.sh <harness dir> <candidate engine> <name> device idle|load2 [ops]
#        sitting.sh <harness dir> <candidate engine> <name> short-drop|select|long-drop
#        sitting.sh <harness dir> <engine> <name> late idle|gate|load2
#        sitting.sh <harness dir> <candidate engine> <name> floor idle|gate|load2
#        sitting.sh <harness dir> <candidate engine> <name> long idle|gate|load2
set -u
d=$(dirname "$0")
. "$d/env.sh"
guard
h=$1
cand=$2
name=$3
kind=$4
load=${5:-idle}
case $load in
  idle) loadArgs=() ;;
  gate) loadArgs=(--ballast gate) ;;
  load2) loadArgs=(--load --load-factor 2) ;;
  *) echo "unknown load $load" >&2; exit 2 ;;
esac
"$cand" --version
echo "start $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
case $kind in
  # the release at the accept's live counts (drop-signals.mjs plan t14)
  counts) "$d/private.sh" "$h" "$name" --experiment drop-signals --cua "$cand" --run "t69-$name" --plan t14 "${loadArgs[@]}" ;;
  # the same drags on the engine as it ships: the floor and the confirmation (plan t14-floor)
  floor) "$d/private.sh" "$h" "$name" --experiment drop-signals --cua "$cand" --run "t69-$name" --plan t14-floor "${loadArgs[@]}" ;;
  # the long-path accepted-then-left control on the engine as it ships (plan t14-long, 30 at the gate's load)
  long) plan=t14-long; [ "$load" = gate ] && plan=t14-long-gate
    "$d/private.sh" "$h" "$name" --experiment drop-signals --cua "$cand" --run "t69-$name" --plan "$plan" "${loadArgs[@]}" ;;
  # #264's real late takes: task 68's freeze cell (drop-signals.mjs plan t14-late), on this engine or the one before T14
  late) "$d/private.sh" "$h" "$name" --experiment drop-signals --cua "$cand" --run "t69-$name" --plan t14-late "${loadArgs[@]}" ;;
  # the gate's Chrome drag-and-drop device cases, cua alone, 3 blocks (9 samples a case, cold ones included)
  device) "$d/private.sh" "$h" "$name" --dev --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" --scene device-chrome-dnd \
    --ops "${6:-all}" --blocks 3 --run "t69-$name" "${loadArgs[@]}" ;;
  # Acceptance 3's speed: the short drop against both vendor builds, every lane's window in front
  short-drop) "$d/private.sh" "$h" "$name" --experiment dnd --dnd-short --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" \
    --lanes pinned,newest,cua --trials 40 --run "t69-$name" ;;
  # the 40 px text selection the same way (a drag that never takes pays the hold, #263)
  select) "$d/private.sh" "$h" "$name" --experiment dnd --dnd-select --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" \
    --lanes pinned,newest,cua --trials 40 --run "t69-$name" ;;
  # and the long drag and drop, the drag experiment's Chrome cell
  long-drop) "$d/private.sh" "$h" "$name" --experiment drag --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" --family chrome \
    --ops dnd --lanes pinned,newest,cua --run "t69-$name" ;;
  *) echo "unknown kind $kind" >&2; exit 2 ;;
esac
status=$?
echo "end $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
