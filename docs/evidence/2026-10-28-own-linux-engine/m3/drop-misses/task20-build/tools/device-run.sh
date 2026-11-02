#!/bin/bash
# device-run.sh <name>: the differential harness's Chrome device scenes (device-chrome, device-chrome-dnd; every case,
# the task's new ones included) on the VM's :0 with ENGINE (default the worktree's release build), BLOCKS (default 2).
# Output under task20b/runs/<name>/; writes <name>/exit when done.
set -u
name=$1
T=/Users/new/.local/share/cua-171/task20b
OUT=$T/runs/$name
mkdir -p "$OUT"
date -u +%FT%TZ > "$OUT/started"
CUA_BIN=${ENGINE:-/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine} \
  /Users/new/.local/share/cua-171/task16/diff.sh --scene "${SCENES:-device-chrome,device-chrome-dnd}" --ops all \
  --blocks "${BLOCKS:-2}" --out "$OUT/diff" --run "$name" > "$OUT/run.log" 2>&1
code=$?
date -u +%FT%TZ > "$OUT/ended"
echo "$code" > "$OUT/exit"
echo "exit $code"
