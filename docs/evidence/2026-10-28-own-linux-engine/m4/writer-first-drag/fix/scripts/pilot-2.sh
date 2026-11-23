#!/bin/bash
# task 72 fix wave, pilot 2 (under the host lock): the element probe's Calc cell (its active cell read directly) and
# Writer's root pane, one trial a lane, and the writer-drag outside park, on the worktree's harness
set -u
F=$HOME/.local/share/cua-171/task72fix
W=$HOME/Developer/GitHub/cua/.claude/worktrees/<task72fix-worktree>
S=$W/docs/evidence/2026-10-28-own-linux-engine/m4/writer-first-drag/scripts
export T=$F WT=$W
cand=$F/build/7a965d12eefb468895ec8705e1461ab0bdc4bed9/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
rm -rf "$F/runs/pilot-element2" "$F/runs/pilot-first"
"$S/probe.sh" "$W" pilot-element2 "$cand" --plan element --trials 1 --family calc,writer-root
echo "element $?"
"$S/probe.sh" "$W" pilot-first "$cand" --plan observe --trials 1
echo "observe $?"
