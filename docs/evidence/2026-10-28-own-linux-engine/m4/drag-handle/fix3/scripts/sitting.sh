#!/bin/bash
# One of the third fix wave's sittings on a private display (task 73's private.sh), never :0, each its own run: the
# drop-signals experiment on the run's own Electron, a plan, and the load its name gives. Run it under the host lock
# (locked.sh), one sitting a call.
#   t17-fix3    Electron: 100 drops, the accepted-then-left and press-inside controls, and releases off the window to
#               the bare root, the xterm, another browser window and the hung sink, 30 each, as plain drags and handles
#   t17-slow    the sink alone (the third review's P2), run on the engine before the fix first
#   t17-moved   the short drop with the pointer moved to the bare root before the release (P3), on a live build
# usage: sitting.sh <harness dir> <candidate engine> <name> <plan> idle|gate|load2 [more args...]
set -u
. "$(dirname "$0")/env.sh"
guard
h=$1
cand=$2
name=$3
plan=$4
load=$5
shift 5
case $load in
  idle) loadArgs=() ;;
  gate) loadArgs=(--ballast gate) ;;
  load2) loadArgs=(--load --load-factor 2) ;;
  *) echo "unknown load $load" >&2; exit 2 ;;
esac
"$cand" --version
echo "start $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$S/private.sh" "$h" "$name" --experiment drop-signals --family electron --cua "$cand" --run "t73fix3-$name" \
  --plan "$plan" "${loadArgs[@]}" "$@"
status=$?
echo "end $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
