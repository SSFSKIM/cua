#!/bin/bash
# Task 68's first pilot: Chrome's short drop in front, shipped and with no floor after the take, with the cursor and
# XdndSelection watched for the whole run (exploration, not evidence).
set -u
d=$(dirname "$0")
. "$d/env.sh"
CAND=$HOME/.local/share/cua-171/task67/build/7d464cb25f6368ef867ae2a3069a162c4fbc2299/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$CAND" --version
date -u +%T
uptime
export EXTRA_WATCH='cursor-watch,selection-watch XdndSelection'
"$d/private.sh" "$HOME/.local/share/cua-171/task67/harness-7d464cb2" pilot1 --experiment dnd --vendor "$PINNED" --cua "$CAND" \
  --dnd-short --variant 'f0=--drag-dnd-after-take-ms 0' --lanes cua,cua:f0 --trials 15 --no-grabs --occlusion visible --run t68-pilot1
