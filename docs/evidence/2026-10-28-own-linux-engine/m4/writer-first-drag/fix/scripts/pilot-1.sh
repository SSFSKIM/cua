#!/bin/bash
# task 72 fix wave, pilot 1 (under the host lock): the engine's RED/GREEN for finding 1 again, xprobe with
# pointer-chain, the musl engine of a commit, then two short pilot sittings on the worktree's harness: what each
# family's application shows through AT-SPI (--plan identity), and Calc's and Writer's root pane element right click
# (--plan element, one trial a lane).
# usage: pilot-1.sh <engine commit>
set -u
F=$HOME/.local/share/cua-171/task72fix
W=$HOME/Developer/GitHub/cua/.claude/worktrees/<task72fix-worktree>
S=$W/docs/evidence/2026-10-28-own-linux-engine/m4/writer-first-drag/scripts
export T=$F WT=$W
"$F/engine-red-green.sh" "$F/engine-rg-2"
(cd "$W/scripts/linux-engine-diff/xprobe" && cargo build --release --offline) > "$F/xprobe-build.log" 2>&1 || { echo "xprobe build failed"; exit 4; }
cand=$(bash "$S/build-musl.sh" "$1" 2> "$F/build-$1.log" | tail -1)
echo "candidate $cand"
[ -x "$cand" ] || exit 4
"$S/probe.sh" "$W" pilot-identity "$cand" --plan identity
echo "identity $?"
"$S/probe.sh" "$W" pilot-element "$cand" --plan element --trials 1 --family calc,writer-root
echo "element $?"
