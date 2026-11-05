#!/bin/bash
# click-then-paste and click-field on the engine as it ships (lane `shipped`), idle and at twice the load.
# usage: shipped-clicks.sh <harness commit> <engine>
set -u
D=$HOME/.local/share/cua-171/task60-fix/scripts
H=$HOME/.local/share/cua-171/task60-fix/harness-$1
"$D/sitting.sh" "$H" "$2" shipped-clicks-idle --scenarios click-paste,click-field --lanes shipped | grep -E '^sitting|not reached|not clean|Incomplete' | cut -c1-300
"$D/sitting.sh" "$H" "$2" shipped-clicks-load2 --scenarios click-paste,click-field --lanes shipped --load-factor 2 | grep -E '^sitting|not reached|not clean|Incomplete' | cut -c1-300
