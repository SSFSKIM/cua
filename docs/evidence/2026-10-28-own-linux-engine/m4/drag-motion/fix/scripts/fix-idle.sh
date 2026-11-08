#!/bin/bash
# The fix wave's idle sitting on a candidate: Firefox's canvas drag and held stroke, Chrome's canvas drag and thumb,
# beside the vendor builds, on private displays (private.sh), never :0. The harness is d92a56f6's export, which the
# head's harness equals (no change under scripts/, src/ or test/ since).
# usage: fix-idle.sh <name> <candidate> [extra args]
set -u
d=$(dirname "$0")
name=$1
cand=$2
shift 2
h=$HOME/.local/share/cua-171/task66/harness-d92a56f6
"$d/drag.sh" "$h" "$name-firefox" "$cand" --family firefox --ops canvas,handle-canvas --occlusion visible --lanes pinned,newest,cua "$@"
"$d/drag.sh" "$h" "$name-chrome" "$cand" --family chrome --ops canvas,scroller --occlusion visible --lanes pinned,newest,cua "$@"
