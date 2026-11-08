#!/bin/bash
# A drag experiment on a private display (private.sh): the pinned and newest vendor builds beside the candidate.
# usage: drag.sh <harness dir> <name> <candidate: released|head|<path>> <more linux-engine-diff.mjs args...>
set -u
. "$(dirname "$0")/env.sh"
h=$1
name=$2
case "$3" in
  released) cand=$RELEASED ;;
  head) cand=$(tail -n 1 "$T/build/head.log") ;;
  *) cand=$3 ;;
esac
shift 3
exec "$T/scripts/private.sh" "$h" "$name" --experiment drag --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" "$@"
