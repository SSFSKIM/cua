#!/bin/bash
# Copies task 65's fix-wave sittings into the evidence's fix/ directory (labels for home paths) and writes their
# analyses: the held-move recount, the thumbs' distance against the motions received, the positive controls.
set -euo pipefail
T=$HOME/.local/share/cua-171/task65
EV=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-judges
cd "$T"
python3 -I scripts/copy-evidence.py runs "$EV/fix" fix-handle-head=handle-head fix-idle-released=idle-released fix-load2-released=load2-released smoke-fix=probes/smoke
mkdir -p "$EV/fix/analysis"
node scripts/handle-recount.mjs runs/fix-handle-head/run/results.jsonl > "$EV/fix/analysis/handle-recount.md"
for s in fix-idle-released fix-load2-released; do node scripts/received-table.mjs "runs/$s/run/results.jsonl" > "$EV/fix/analysis/received-${s#fix-}.md"; done
node scripts/positive-controls.mjs "$T/harness-d8d5b552" runs/fix-idle-released/run/results.jsonl > "$EV/fix/analysis/positive-controls-idle-released.txt"
for f in handle-recount.mjs received-table.mjs positive-controls.mjs fix-sittings.sh finish-fix-evidence.sh; do
  sed -e "s#$HOME#<home>#g" "scripts/$f" > "$EV/scripts/$f"
done
du -sh "$EV/fix"
grep -rl "$HOME" "$EV" || echo "no home paths"
