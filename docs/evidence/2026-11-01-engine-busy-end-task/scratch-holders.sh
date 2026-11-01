#!/bin/bash
# #237 condition 3 live check: a scratch engine on a private socket under a scratch HOME (no TCC prompts), two stand-in
# holders, then the branch CLI's status and stop (stop must refuse busy and name them). Cleans up after itself.
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/fix-237 || exit 2
H=/Users/new/.claude/jobs/b93055dd/tmp/h237
SOCK="$H/Library/Application Support/cua/engine/engine.sock"
OUT=~/.local/share/237/scratch-holders.log
rm -rf "$H"; mkdir -p "$H"
: > "$OUT"
CUA_ENGINE_SOCKET="$SOCK" HOME="$H" ~/.local/share/237/itest-build/debug/cua-engine >> "$OUT" 2>&1 &
ENGINE=$!
for i in 1 2 3 4 5 6 7 8 9 10; do [ -S "$SOCK" ] && break; sleep 0.3; done
node ~/.local/share/237/scripts/holder.mjs "$SOCK" MAWS >> "$OUT" 2>&1 &
H1=$!
node ~/.local/share/237/scripts/holder.mjs "$SOCK" cursor235 >> "$OUT" 2>&1 &
H2=$!
sleep 1
echo "holders: $H1 $H2; engine $ENGINE" >> "$OUT"
echo "== status (2 holders)" >> "$OUT"
HOME="$H" CUA_ENGINE_SOCKET="$SOCK" node bin/cua.mjs engine status >> "$OUT" 2>&1; echo "status exit $?" >> "$OUT"
echo "== stop (must refuse busy)" >> "$OUT"
HOME="$H" CUA_ENGINE_SOCKET="$SOCK" node bin/cua.mjs engine stop >> "$OUT" 2>&1; echo "stop exit $?" >> "$OUT"
kill $H1; sleep 0.5
echo "== status (1 holder after kill $H1)" >> "$OUT"
HOME="$H" CUA_ENGINE_SOCKET="$SOCK" node bin/cua.mjs engine status >> "$OUT" 2>&1; echo "status exit $?" >> "$OUT"
kill $H2; sleep 0.5
echo "== status (0 holders)" >> "$OUT"
HOME="$H" CUA_ENGINE_SOCKET="$SOCK" node bin/cua.mjs engine status >> "$OUT" 2>&1; echo "status exit $?" >> "$OUT"
kill $ENGINE 2>/dev/null; wait $ENGINE 2>/dev/null
rm -rf "$H"
cat "$OUT"
