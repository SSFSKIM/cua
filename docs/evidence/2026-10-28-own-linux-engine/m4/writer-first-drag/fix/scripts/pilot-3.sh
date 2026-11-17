#!/bin/bash
# task 72 fix wave, pilot 3 (under the host lock): Calc's element right click, one trial a lane, its text fields kept
set -u
F=$HOME/.local/share/cua-171/task72fix
W=$HOME/Developer/GitHub/cua/.claude/worktrees/<task72fix-worktree>
S=$W/docs/evidence/2026-10-28-own-linux-engine/m4/writer-first-drag/scripts
export T=$F WT=$W
cand=$F/build/7a965d12eefb468895ec8705e1461ab0bdc4bed9/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
rm -rf "$F/runs/pilot-calc"
"$S/probe.sh" "$W" pilot-calc "$cand" --plan element --trials 1 --family calc
echo "calc $?"
