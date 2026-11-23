#!/bin/bash
# Task 130: copy the trace extracts, the scripts and the repro into m5-p459's evidence directory (no raw traces).
set -u
T=/Users/new/.local/share/cua-171/task130
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459/docs/evidence/2026-10-28-own-linux-engine/m5/p459/tail
mkdir -p "$E/x64-trace" "$E/scripts" "$E/repro"
cd "$T/x64" || exit 2
for f in idle-t2/traces/pinned.*.xtrace idle-t2/traces/newest.*.xtrace idle-t2/traces/cua.2824298.xtrace tail-idle-t2/traces/cua.2842434.xtrace; do
  run=${f%%/*}; b=${f##*/}; lane=${b%%.*}
  python3 -I "$T/ends.py" "$f" 14 6 | grep -v -E "RQ (InternAtom|GetProperty|QueryTree|GetWindowAttributes|GetAtomName|GetGeometry)" > "$E/x64-trace/$run-$lane.txt"
done
cp "$T/ends.py" "$T/trace-x64.sh" "$T/t130-run.mjs" "$T/t130-inner.mjs" "$T/bin/trace-engine" "$T/arm-build.sh" "$T/x64-build.sh" "$T/d1.sh" "$T/save-evidence.sh" "$E/scripts/"
cp "$T/repro/synth-drag.c" "$T/repro/repro2.sh" "$T/repro/page.html" "$E/repro/"
ls -la "$E"/*
