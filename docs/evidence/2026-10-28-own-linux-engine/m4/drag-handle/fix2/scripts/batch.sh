#!/bin/bash
# The second fix wave's sittings, one locked call each (under 45 min): a list of `name plan engine load [args...]`
# lines on stdin, each run by sitting.sh with the wave's harness; `old` is the fix wave's engine (d70b9e89's musl
# build, the engine of 2d76095c), `new` this wave's.
# usage: batch.sh <harness dir> <new engine> < lines
set -u
. "$(dirname "$0")/env.sh"
h=$1
new=$2
old=$HOME/.local/share/cua-171/task73fix/build/d70b9e8956ad3b2a92a7ac2919f468dccce151cd/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
while read -r name plan which load rest; do
  [ -z "$name" ] && continue
  case $which in
    old) cand=$old ;;
    new) cand=$new ;;
    *) echo "unknown engine $which" >&2; exit 2 ;;
  esac
  # shellcheck disable=SC2086
  bash "$(dirname "$0")/sitting.sh" "$h" "$cand" "$name" "$plan" electron "$load" $rest < /dev/null
  echo "sitting $name status $?"
done
