#!/bin/bash
# task 88: the live pilots' compact records into the repository's evidence: each step's step.json and README.md, the
# gate summary of the fix wave's reruns, the pilot logs and the launchers, no harness logs or results.
set -eu
P=/Users/new/.local/share/cua-171/m5-t4r2
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a458977939f1feb0d/docs/evidence/2026-10-28-own-linux-engine/m5/x64/t4r2-pilots
mkdir -p "$E/records" "$E/scripts"
for set in out out2 out3; do
  for d in "$P/$set"/*/; do
    n=$(basename "$d")
    [ -f "$d/step.json" ] || continue
    mkdir -p "$E/records/$set/$n"
    cp "$d/step.json" "$E/records/$set/$n/"
    [ -f "$d/README.md" ] && cp "$d/README.md" "$E/records/$set/$n/"
  done
  [ -f "$P/$set/pilot.log" ] && cp "$P/$set/pilot.log" "$E/records/$set/"
done
cp "$P/out3/summary.md" "$E/records/out3/"
cp "$P/install-home.sh" "$P/pilot.sh" "$P/live.sh" "$P/verdict-private.mjs" "$P/live-fix1.sh" "$P/copy-evidence.sh" "$E/scripts/"
find "$E" -type f | wc -l
du -sh "$E"
