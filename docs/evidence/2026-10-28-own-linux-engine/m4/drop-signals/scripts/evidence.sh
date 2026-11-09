#!/bin/bash
# Task 68's sittings copied into the evidence directory, labelled (copy-evidence.py).
set -eu
d=$(dirname "$0")
sed -i "s/^    copy(src + '.order.jsonl', os.path.join(dst, 'order.jsonl'))$//" "$d/copy-evidence.py"
E="$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drop-signals"
mkdir -p "$E"
python3 "$d/copy-evidence.py" "$HOME/.local/share/cua-171/task68/runs" "$E" idle-main=idle-main idle-freeze=idle-freeze \
  idle-cover=idle-cover gate-main=gate-main load2-main=load2-main load2-freeze=load2-freeze idle-extra=idle-extra \
  idle-cover-managed=idle-cover-managed idle-electron=idle-electron pilot1=pilot/pilot1 pilot5=pilot/pilot5 \
  freeze1=pilot/freeze1
du -sh "$E"
grep -rl "$HOME" "$E" || echo "no home paths"
