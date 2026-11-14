#!/bin/bash
# Task 69's sittings one after another, each under the host lock on its own (locked.sh), so another holder can come
# between them. Each line of $T/chain.log names a sitting and its exit.
# usage: chain.sh <harness dir> <candidate engine> <old engine> <step>...   (steps: see below)
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
h=$1
cand=$2
old=$3
shift 3
lock=$HOME/.local/share/cua-171/locked.sh
for step in "$@"; do
  case $step in
    counts-idle) args=(counts-idle counts idle) ;;
    counts-gate) args=(counts-gate counts gate) ;;
    counts-load2) args=(counts-load2 counts load2) ;;
    device-idle) args=(device-idle device idle) ;;
    device-load2) args=(device-load2 device load2) ;;
    short-drop) args=(short-drop short-drop) ;;
    select) args=(select-40 select) ;;
    long-drop) args=(long-drop long-drop) ;;
    floor-idle) args=(floor-idle floor idle) ;;
    long-idle) args=(long-idle long idle) ;;
    long-gate) args=(long-gate long gate) ;;
    long-load2) args=(long-load2 long load2) ;;
    late-idle) args=(late-idle late idle) ;;
    late-gate) args=(late-gate late gate) ;;
    late-load2) args=(late-load2 late load2) ;;
    # the failing-first run: the real late takes on the head's engine before T14 (task 68's build of 405aa773)
    red-late) "$lock" task69 "$d/sitting.sh" "$h" "$old" red-late late idle > "$T/red-late.out" 2>&1
      echo "$(date -u +%FT%TZ) red-late exit $?" >> "$T/chain.log"; continue ;;
    *) echo "unknown step $step" >&2; exit 2 ;;
  esac
  "$lock" task69 "$d/sitting.sh" "$h" "$cand" "${args[@]}" > "$T/${args[0]}.out" 2>&1
  echo "$(date -u +%FT%TZ) ${args[0]} exit $?" >> "$T/chain.log"
done
