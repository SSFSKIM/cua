#!/bin/bash
# task 72 fix wave, finding 1: the root pane named itself. Run under the host lock.
#  RED: the worktree's engine with elements.rs and vcl.rs as on 770b924e (the new live tests and fixture kept)
#  GREEN: the worktree's engine
# Each runs `vcl::` (unit) and `vcl_faults` (live, GTK 3 staging) with the gate's flags, on a display xvfb-run picks.
# usage: engine-red-green.sh <out dir>
set -u
out=$1
mkdir -p "$out"
W=$HOME/Developer/GitHub/cua/.claude/worktrees/<task72fix-worktree>
flags=(--release --locked --target x86_64-unknown-linux-musl)
red=$HOME/.local/share/cua-171/task72fix/red-tree
rm -rf "$red"
mkdir -p "$red"
cp -a "$W/native/linux-engine" "$red/"
rm -rf "$red/linux-engine/target"
git -C "$W" show 770b924e:native/linux-engine/src/engine/elements.rs > "$red/linux-engine/src/engine/elements.rs"
git -C "$W" show 770b924e:native/linux-engine/src/vcl.rs > "$red/linux-engine/src/vcl.rs"
run() {
  local dir=$1 name=$2
  cd "$dir" || return 9
  xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test "${flags[@]}" --features live vcl -- --test-threads 1 > "$out/$name.txt" 2>&1
  echo "$name status $?" >> "$out/$name.txt"
}
run "$red/linux-engine" red
run "$W/native/linux-engine" green
cd "$W/native/linux-engine" && cargo fmt --check > "$out/fmt.txt" 2>&1
echo "fmt status $?" >> "$out/fmt.txt"
grep -h "status" "$out"/*.txt
