#!/bin/bash
set -u
. "$(dirname "$0")/env.sh"
for n in 1 2 4 8; do "$T/scripts/make-wrapper.sh" "$C2" "path$n" --path-step-ms "$n"; done
cat "$T/build/wrappers/path1"
"$T/build/wrappers/path1" --version
