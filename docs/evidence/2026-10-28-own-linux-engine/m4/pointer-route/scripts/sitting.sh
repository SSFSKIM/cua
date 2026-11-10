#!/bin/bash
# Task 71's pointer-route sitting (`--experiment pointer-route`, pointer-route.mjs), idle: on a private Xvfb with
# Openbox and a stand-in person's xterm (`private`, private.sh: the dry run), or on the person's display under task 50's
# guards (`person`, run71.sh: the declared live sitting, only after the design session's "GO :0"). Run it under the host
# lock. Prints its start and end with the load; exits with the run's status.
# usage: sitting.sh private|person <harness dir> <candidate engine path> <name> [extra harness arguments...]
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
guard
where=$1
h=$2
cand=$3
name=$4
shift 4
# an idle sitting starts once the machine is quiet: the 1-minute load at most 1.0, waited for up to 5 minutes
for _ in $(seq 60); do
  awk '{exit !($1 <= 1.0)}' /proc/loadavg && break
  sleep 5
done
"$cand" --version
sha256sum "$cand"
echo "start $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
args=(--experiment pointer-route --vendor "$PINNED" --cua "$cand" --run "t71-$name" "$@")
case "$where" in
  private) "$d/private.sh" "$h" "$name" "${args[@]}" ;;
  person) "$d/run71.sh" "$T/runs/$name" "$h" "${args[@]}" ;;
  *) echo "private or person" >&2; exit 2 ;;
esac
status=$?
echo "end $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
