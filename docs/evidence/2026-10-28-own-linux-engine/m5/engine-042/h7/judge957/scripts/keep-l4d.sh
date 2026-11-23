#!/bin/bash
# task 128: the L4d development runs' evidence into the Part 2 worktree
set -eu
T=/Users/new/.local/share/cua-171/task128
P=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-p2/docs/evidence/2026-10-28-own-linux-engine/m5/engine-042/h7/judge957/dev-run
bash "$T/keep-devrun.sh" "$T/gate-dev-l4d-3/L4d.development-run" "$P/L4d.development-run" > /dev/null
for pair in "gate-dev-l4d:1-front-window" "gate-dev-l4d-2:2-no-electron-binary"; do
  src=$T/${pair%%:*}/L4d.development-run
  dst=$P/attempts/${pair##*:}
  mkdir -p "$dst"
  cp "$src/README.md" "$src/step.json" "$dst/"
  cp "$src/stderr.log" "$dst/stderr.log.txt"
  gzip -c "$src/run/results.jsonl" > "$dst/results.jsonl.gz"
done
node "$T/electron-takes.mjs" "$T/gate-dev-l4d-3/L4d.development-run/run/results.jsonl" > "$P/electron-takes.txt"
node "$T/judge-parts.mjs" /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-p2/scripts/linux-engine-diff/drop-signals-judge.mjs "$T/gate-dev-l4d-3/L4d.development-run/run/results.jsonl" > "$P/parts.jsonl"
cp "$T/electron-takes.mjs" "$T/keep-l4d.sh" "$P/../scripts/"
du -sh "$P"
cat "$P/electron-takes.txt"
