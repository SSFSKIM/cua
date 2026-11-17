#!/bin/bash
# The third fix wave's sittings, run in one locked call (under 45 min): a list of `name plan engine load [args...]` lines
# on stdin, each run by sitting.sh with the harness given. The engines: `old`, the second fix wave's (69d095f8's musl
# build, the engine of 1df5d015); `hook`, the live build of this wave's cells' commit (a823346e: the hook, no fix);
# `p3`, the live build of the P3 fix's commit; `live`, the live build of the head given; `new`, this wave's release build.
# usage: batch.sh <harness dir> <new engine> [p3 engine] [live engine] < lines
set -u
. "$(dirname "$0")/env.sh"
h=$1
new=$2
p3=${3:-}
live=${4:-}
old=$HOME/.local/share/cua-171/task73fix2/build/69d095f860f4c7a7f63f4648ef024ac84fa2f088/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
hook=$HOME/.local/share/cua-171/task73fix3/build-live/a823346ed34571b2c28c32aa7bd92f8b2be0d40c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
while read -r name plan which load rest; do
  [ -z "$name" ] && continue
  case $which in
    old) cand=$old ;;
    hook) cand=$hook ;;
    p3) cand=$p3 ;;
    live) cand=$live ;;
    new) cand=$new ;;
    *) echo "unknown engine $which" >&2; exit 2 ;;
  esac
  # shellcheck disable=SC2086
  bash "$(dirname "$0")/sitting.sh" "$h" "$cand" "$name" "$plan" "$load" $rest < /dev/null
  echo "sitting $name status $?"
done
