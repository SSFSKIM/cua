#!/bin/bash
# Task 126 on the arm64 VM, rulings 957, 958 and 967: each form gated as it would ship (`--drag-dnd-release-sync-when
# outlasted`), against the pinned 0.4.2, every set through p459.sh (one hold each, a private display of its own).
#   long-1, long-2   t14-long (long-left), twice the load: 0.4.2, (a), (b') alternating, 5 rounds a set (10, 10, 15)
#   floor-<form>     t14-floor (plain-long 300, left 30, inzone-out 30), twice the load, one run per form
#   late-<form>      t14-late at idle, one run each: 0.4.2 and the form (ruling 974: the passing form only)
# The chain stops at a set that did not finish (exit 3 or more: a signal, a refusal, the disk, hold-sittings); a set
# whose runs failed their own verdict (a false ok: the measurement) goes on.
# usage: arm-chain2.sh <sha> <set>...
set -u
T=/Users/new/.local/share/cua-171/task126
sha=$1; shift
B=$T/bin
E042=/Users/new/.local/share/cua-171/m5/home-arm64-042/engine/linux/cua-engine
w=$B/ping30-outlasted-arm64-$sha
[ -x "$w" ] || { printf '#!/bin/sh\n# task 126: the prototype %s with the dwell form, gated (a development lane, never released)\nexec %s --drag-dnd-release-sync ping --drag-dnd-release-sync-dwell-ms 30 --drag-dnd-release-sync-when outlasted "$@"\n' "$sha" "$B/cua-engine-p459-arm64-$sha" "$B/cua-engine-p459-arm64-$sha" > "$w"; chmod +x "$w"; }
lanes=(e042="$E042" keep="$B/keepalive-outlasted-arm64-$sha" ping="$B/ping-outlasted-arm64-$sha" ping30="$B/ping30-outlasted-arm64-$sha")
# ruling 974: (b'') dropped; 100 each of 0.4.2 and (a) against 150 of (b') (15 a run where the others take 10)
long=(e042="$E042" keep="$B/keepalive-outlasted-arm64-$sha" ping="$B/ping-outlasted-arm64-$sha@15")
for set in "$@"; do
  case $set in
    long-*) "$T/p459.sh" "$set" t14-long 5 10 2 "${long[@]}" ;;
    floor-keep) "$T/p459.sh" "$set" t14-floor 1 300 2 "${lanes[1]}" ;;
    floor-ping) "$T/p459.sh" "$set" t14-floor 1 300 2 "${lanes[2]}" ;;
    floor-ping30) "$T/p459.sh" "$set" t14-floor 1 300 2 "${lanes[3]}" ;;
    late-keep) "$T/p459.sh" "$set" t14-late 1 10 0 "${lanes[0]}" "${lanes[1]}" ;;
    late-ping) "$T/p459.sh" "$set" t14-late 1 10 0 "${lanes[0]}" "${lanes[2]}" ;;
    # ruling 981: t14-late at twice the load, and t14-floor at idle (its plain-long 50 a run: about 100 a lane)
    late2-ping) "$T/p459.sh" "$set" t14-late 1 10 2 "${lanes[0]}" "${lanes[2]}" ;;
    idle-floor) "$T/p459.sh" "$set" t14-floor 2 50 0 "${lanes[0]}" "${lanes[2]}" ;;
    *) echo "unknown set $set"; exit 2 ;;
  esac
  code=$?
  [ "$code" -ge 3 ] && { echo "$(date -u +%FT%TZ) chain stopped at $set (exit $code)" >> "$T/out/p459.log"; exit "$code"; }
done
echo "$(date -u +%FT%TZ) chain done: $*" >> "$T/out/p459.log"
