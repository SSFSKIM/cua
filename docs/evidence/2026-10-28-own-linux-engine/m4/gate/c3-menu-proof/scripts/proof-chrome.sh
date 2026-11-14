#!/bin/bash
# Task 78: Chrome's showContextMenu menu through the candidate and through the pinned vendor build, each with the
# scene client's popups sampled through the request, on private displays, under locked.sh t78-fix.
# usage: proof-chrome.sh <out>
set -u
C=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
D=/Users/new/.local/share/cua-171/t78
OUT=$1
mkdir -p "$OUT"
[ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "hold-sittings present: not running"; exit 3; }
PINNED=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
cd "$C"
node "$D/menu-proof.mjs" "$C" "$D/candidate/cua-engine" "$OUT/cua" chrome > "$OUT/cua.out" 2>&1
echo "cua exit $?"
CUA_PROOF_ENGINE="$PINNED" node "$D/menu-proof.mjs" "$C" "$D/candidate/cua-engine" "$OUT/pinned" chrome > "$OUT/pinned.out" 2>&1
echo "pinned exit $?"
