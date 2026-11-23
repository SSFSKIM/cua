#!/bin/bash
# click-field on Chrome and Electron at click-0, idle then at twice the load, on the given harness and engine.
# usage: click-field.sh <harness> <engine> <lanes>
set -u
s=$HOME/.local/share/cua-171/task60-fix/scripts/sitting.sh
"$s" "$1" "$2" fieldsteps-idle --scenarios click-field --lanes "$3" --family chrome,electron | grep -E '^\||^sitting'
"$s" "$1" "$2" fieldsteps-load2 --scenarios click-field --lanes "$3" --family chrome,electron --load-factor 2 | grep -E '^\||^sitting'
