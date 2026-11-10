#!/bin/bash
# Task 69's sittings copied into the evidence directory, labelled (copy-evidence.py), each named on the command line
# as <sitting>=<evidence name>.
# usage: evidence.sh <sitting>=<name>...
set -eu
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
E=$(dirname "$d")
python3 -I "$d/copy-evidence.py" "$T" "$E" "$@"
du -sh "$E"
grep -rl "$HOME" "$E" --exclude-dir=scripts || echo "no home paths"
