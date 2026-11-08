#!/bin/bash
# A drag experiment on a private display (private.sh, beside this script): the pinned and newest vendor builds beside
# the candidate. The candidate is the engine binary's path, as build-musl.sh prints it last, or `released` for the
# installed 0.3.0.
# usage: drag.sh <harness dir> <name> <candidate: released|<path>> <more linux-engine-diff.mjs args...>
set -u
. "$(dirname "$0")/env.sh"
h=$1
name=$2
case "$3" in
  released) cand=$RELEASED ;;
  *) cand=$3 ;;
esac
shift 3
exec "$S/private.sh" "$h" "$name" --experiment drag --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" "$@"
