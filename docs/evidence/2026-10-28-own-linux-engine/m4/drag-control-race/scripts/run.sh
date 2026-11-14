#!/bin/bash
# Task 75: the Gecko drag control, repeated as the engine-linux gate runs it, on private Xvfb displays.
#   usage: run.sh <alone|suite> <first> <last> <outdir>   (under locked.sh task75)
# alone: the test by itself; suite: the gate's command over every test binary up to and including live_device, in the
# gate's order on one display (the binaries after it run after the test and cannot reach it).
set -u
mode=$1 first=$2 last=$3 out=$4
src=${TASK75_SRC:-/Users/new/.local/share/cua-171/task75/exp/native/linux-engine}
mkdir -p "$out"
cd "$src" || exit 2
export CUA_ENGINE_GIT_SHA=${CUA_ENGINE_GIT_SHA:-task75}
export PATH=/Users/new/.local/share/cua-171/bin:/Users/new/.cargo/bin:$PATH
test_name=a_gecko_drag_the_real_pointer_leaves_while_it_runs_is_reported
for i in $(seq "$first" "$last"); do
  [ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "hold-sittings: stopped before $mode-$i" >> "$out/status.txt"; exit 3; }
  if [ "$mode" = alone ]; then
    args=(--test live_device -- --test-threads 1 "$test_name")
  else
    args=(--bin cua-engine --test identity_boundary --test launcher_shim --test live --test live_device -- --test-threads 1)
  fi
  start=$(date -u +%FT%TZ)
  TASK75_RUN=$mode-$i TASK75_LOG=$out/$mode.jsonl xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- \
    cargo test --release --locked --target x86_64-unknown-linux-musl --features live "${args[@]}" > "$out/$mode-$i.log" 2>&1
  status=$?
  echo "$mode-$i $start $(date -u +%FT%TZ) status=$status load=$(cut -d' ' -f1-3 /proc/loadavg)" >> "$out/status.txt"
done
