#!/bin/bash
# Task 96: the follow-ups to the idle block, before the :0 sitting. (1) R1's three arm64 vendor outcomes rerun 3 times
# (vendor-reruns.sh, ruling 810). (2) E1 repeated 3 times in the same pilot form, each in its own out root
# (out-E1-repeat-<n>), to give a rate for "an interrupted drag under a held key, then a move", where cua's drag on arm64
# answered ok in 0.82 ms where x64's was interrupted (2.66 to 3.54 ms).
set -u
T=/Users/new/.local/share/cua-171/task96
"$T/vendor-reruns.sh" 3
for i in 1 2 3; do PILOT_OUT=/Users/new/.local/share/cua-171/m5/pilot-arm64/out-E1-repeat-$i "$T/drive.sh" E1; done
echo "repeats done $(date -u +%FT%TZ)"
