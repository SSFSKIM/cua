#!/bin/bash
# Task 78: Chrome's showContextMenu menu through the candidate and through the pinned vendor build, each with the
# scene client's popups sampled through the request, on private displays, under locked.sh t78-fix. <candidate> is
# the engine proof.sh installed; menu-proof.mjs is this script's neighbour.
# usage: proof-chrome.sh <candidate> <out>
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
C=$(git -C "$HERE" rev-parse --show-toplevel)
CANDIDATE=$1
OUT=$2
mkdir -p "$OUT"
[ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "hold-sittings present: not running"; exit 3; }
PINNED=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
cd "$C"
node "$HERE/menu-proof.mjs" "$C" "$CANDIDATE" "$OUT/cua" chrome > "$OUT/cua.out" 2>&1
echo "cua exit $?"
CUA_PROOF_ENGINE="$PINNED" node "$HERE/menu-proof.mjs" "$C" "$CANDIDATE" "$OUT/pinned" chrome > "$OUT/pinned.out" 2>&1
echo "pinned exit $?"
