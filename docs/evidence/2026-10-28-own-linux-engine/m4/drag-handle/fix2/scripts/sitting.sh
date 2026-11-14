#!/bin/bash
# One of the second fix wave's counted sittings on a private display (task 73's private.sh), never :0, each its own run: the
# drop-signals experiment on the run's own Electron (or Chrome), a plan, and the load its name gives. Run it under the
# host lock (locked.sh), one sitting a call.
#   t17-fix2     Electron: 100 drops, the accepted-then-left and press-inside controls and a drag to the bare root, 30
#                each, as plain drags and as handles, and 30 drops that only move
#   t17-root     the desktop drag to the bare root alone (the review's P2)
# usage: sitting.sh <harness dir> <candidate engine> <name> <plan> <family> idle|gate|load2 [more args...]
set -u
. "$(dirname "$0")/env.sh"
guard
h=$1
cand=$2
name=$3
plan=$4
family=$5
load=$6
shift 6
case $load in
  idle) loadArgs=() ;;
  gate) loadArgs=(--ballast gate) ;;
  load2) loadArgs=(--load --load-factor 2) ;;
  *) echo "unknown load $load" >&2; exit 2 ;;
esac
"$cand" --version
echo "start $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$S/private.sh" "$h" "$name" --experiment drop-signals --family "$family" --cua "$cand" --run "t73fix2-$name" \
  --plan "$plan" "${loadArgs[@]}" "$@"
status=$?
echo "end $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
