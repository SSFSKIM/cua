#!/bin/bash
# Checks that private.sh, drag.sh and sitting.sh return the private runner's status, without a display, a load or a
# build: a stub `node` that exits with a chosen status stands for private-run.mjs, and a stub `pgrep` stands in for the
# guard's check for stress-ng (another task's sitting may hold the machine). Then the real runner is given a harness
# directory that does not exist, so it crashes at its first import, before it starts any server.
# usage: check-exit.sh   (exits 0 when every case matches)
set -u
d=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export T=$work
mkdir -p "$work/stub"
printf '#!/bin/sh\nexit 1\n' > "$work/stub/pgrep"
printf '#!/bin/sh\nexit "${STUB_STATUS:-0}"\n' > "$work/stub/node"
chmod +x "$work/stub/pgrep" "$work/stub/node"
fails=0
expect() { # <want> <label> <command...>
  local want=$1 label=$2
  shift 2
  "$@" > "$work/out" 2>&1
  local got=$?
  if [ "$got" = "$want" ]; then echo "ok   $label: exit $got"; else echo "FAIL $label: exit $got, want $want"; sed 's/^/     /' "$work/out"; fails=$((fails + 1)); fi
}
for status in 0 7; do
  export STUB_STATUS=$status
  expect $status "private.sh, runner exits $status" env PATH="$work/stub:$PATH" "$d/private.sh" /nonexistent stub-$status
  expect $status "drag.sh, runner exits $status" env PATH="$work/stub:$PATH" "$d/drag.sh" /nonexistent stub-$status /nonexistent-engine
  expect $status "sitting.sh, runner exits $status" env PATH="$work/stub:$PATH" "$d/sitting.sh" /nonexistent /nonexistent-engine stub-$status
done
rm "$work/stub/node"
expect 1 "sitting.sh, the real runner crashing" env PATH="$work/stub:$PATH" "$d/sitting.sh" "$work/no-harness" /nonexistent-engine crash
# the crash is the harness's missing module, so the committed runner beside the script is the one that ran
if grep -q "no-harness/scripts/linux-engine-diff/xtools.mjs" "$work/out"; then echo "ok   the crash is the runner's harness import"; else echo "FAIL the crash is not the harness import"; sed 's/^/     /' "$work/out"; fails=$((fails + 1)); fi
exit $((fails > 0))
