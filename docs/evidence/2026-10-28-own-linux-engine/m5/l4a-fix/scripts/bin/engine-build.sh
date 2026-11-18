#!/bin/bash
# Task 98: a development build of the engine from a checkout, under the host lock.
# usage: engine-build.sh <checkout> [cargo build args...]   (default profile: dev; give --release for the measured build)
set -u
D=/Users/new/.local/share/cua-171
G=$1; shift
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present: nothing starts"; exit 5; }
cd "$G/native/linux-engine" || exit 2
exec "$D/locked.sh" m5-l4a timeout -s TERM -k 120 40m "$D/bin/cargo" build "$@"
