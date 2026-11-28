#!/bin/bash
# Appends T8's rerun of the provenance proof at H to m6b/provenance.txt.
set -e
T=/Users/new/.local/share/cua-171/t173
P=$(cd "$T/wt" && pwd -P)/docs/evidence/2026-10-28-own-linux-engine/m6b/provenance.txt
{
  echo
  echo "# Again at H = 3722f2826ca8a8ff3c7a6e28e00ba765d10b077b (#171 M6b T8, task 173), 2026-11-27T19:17:15Z, on dc-linux171-1e68:"
  echo "# the same two debs through the same reader, then the written file compared with H's. The bytes are H's (the hash is"
  echo "# T4's above), and the tree stays clean (x64/scripts/t8.sh, phase prov)."
  echo
  cat "$T/run/prov/provenance-at-H.txt"
} >> "$P"
tail -6 "$P"
