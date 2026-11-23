#!/bin/bash
# Copies task 65's sittings and probes into the evidence directory (labels for home paths), writes the analyses, and
# keeps the run scripts beside them.
set -euo pipefail
T=$HOME/.local/share/cua-171/task65
EV=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-judges
cd "$T"
python3 -I scripts/copy-evidence.py runs "$EV" idle-released=idle-released idle-head=idle-head load2-released=load2-released handle-head=handle-head writer-released=writer-released probe-thumb1=probes/thumb-events smoke1=probes/smoke probe-gap100=probes/handle-gap100 probe-gap10=probes/handle-gap10
mkdir -p "$EV/analysis" "$EV/scripts"
for s in idle-released idle-head load2-released; do node scripts/received-table.mjs "runs/$s/run/results.jsonl" > "$EV/analysis/received-$s.md"; done
for s in idle-released idle-head; do node scripts/positive-controls.mjs "$T/harness-b103323d" "runs/$s/run/results.jsonl" > "$EV/analysis/positive-controls-$s.txt"; done
for f in received-table.mjs positive-controls.mjs drag.sh private.sh private-run.mjs norecord.mjs build-musl.sh export-harness.sh env.sh copy-evidence.py finish-evidence.sh; do
  sed -e "s#$HOME#<home>#g" "scripts/$f" > "$EV/scripts/$f"
done
du -sh "$EV"
grep -rl "$HOME" "$EV" || echo "no home paths"
