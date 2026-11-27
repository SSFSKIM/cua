#!/bin/bash
# Runs the citation check over m6b/README.md at H and keeps its output beside the scripts.
T=/Users/new/.local/share/cua-171/t173
W=$(cd "$T/wt" && pwd -P)
node "$T/cites.mjs" "$W" 3722f2826ca8a8ff3c7a6e28e00ba765d10b077b docs/evidence/2026-10-28-own-linux-engine/m6b/README.md > "$T/cites.txt"
c=$?
echo "exit $c" >> "$T/cites.txt"
grep -vE '^(at H|added)' "$T/cites.txt"
cp "$T/cites.mjs" "$T/cites.sh" "$T/cites.txt" "$W/docs/evidence/2026-10-28-own-linux-engine/m6b/x64/scripts/"
exit $c
