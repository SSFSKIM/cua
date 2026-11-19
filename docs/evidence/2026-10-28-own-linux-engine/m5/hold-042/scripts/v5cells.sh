#!/bin/bash
# Task 113: V5's two failing cells (device cancel, device background short in front) as a development run on a private
# display (private-run.mjs), under the host lock (holder m5-hold042, 45 min cap), with the gate's Chrome ballast.
# usage: v5cells.sh <out dir> <blocks> <load factor, 0 idle> <cua engine> [--variant <label>=<flags>]...
# Paths: CHECKOUT (the harness checkout), VENDOR, NEWEST (the vendor builds; the device cases run cua lanes alone, but
# the harness hashes every lane's binary).
set -u
out=$1; blocks=$2; load=$3; cua=$4; shift 4
: "${CHECKOUT:?}" "${VENDOR:?}" "${NEWEST:?}"
D=/Users/new/.local/share/cua-171
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present: not started"; exit 5; }
loadargs=()
[ "$load" != 0 ] && loadargs=(--load-factor "$load")
exec "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m /usr/bin/node "$D/task113/scripts/private-run.mjs" "$CHECKOUT" "$out" "task 113 development run" "${loadargs[@]}" -- \
  --vendor "$VENDOR" --newest "$NEWEST" --cua "$cua" --scene device-chrome-dnd \
  --ops chrome_dnd_shared,chrome_dnd_short_in_front_shared --blocks "$blocks" --run "m5h042-$(basename "$out")" \
  --ballast gate --dev "$@"
