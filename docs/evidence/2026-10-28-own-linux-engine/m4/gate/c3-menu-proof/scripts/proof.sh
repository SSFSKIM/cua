#!/bin/bash
# Task 78: the live proof of candidate 3's menu detection on every family the gate drives, and Chrome's forced stall
# (task 77's freeze check, its Copy now answered with the new sentence), on private displays, under locked.sh t78-fix.
# The candidate is a musl release build of the checkout holding this script (a development run, not a gate artifact),
# installed at <candidate>; menu-proof.mjs and freeze-check.mjs are this script's neighbours.
# usage: proof.sh <candidate> <out> [families, default all] [--no-freeze]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
C=$(git -C "$HERE" rev-parse --show-toplevel)
CANDIDATE=$1
OUT=$2
FAMS=${3:-chrome,electron,firefox,gtk3,gtk4,qt5,qt6,libreoffice}
# the VM's tools: its packaged Firefox and the cargo wrapper
export PATH=/Users/new/.local/share/cua-171/task59/bin:/Users/new/.local/share/cua-171/bin:$PATH
mkdir -p "$OUT" "$(dirname "$CANDIDATE")"
[ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "hold-sittings present: not running"; exit 3; }
# the checkout's xprobe, built from its own sources (a stale one lacks `popups`)
(cd "$C/scripts/linux-engine-diff/xprobe" && cargo build --release --locked) || exit 2
cd "$C/native/linux-engine"
cargo build --release --locked --target x86_64-unknown-linux-musl || exit 2
install -m 0700 target/x86_64-unknown-linux-musl/release/cua-engine "$CANDIDATE"
"$CANDIDATE" --version | tee "$OUT/candidate-version.txt"
sha256sum "$CANDIDATE" | tee -a "$OUT/candidate-version.txt"
git -C "$C" rev-parse HEAD >> "$OUT/candidate-version.txt"
git -C "$C" status --short >> "$OUT/candidate-version.txt"
cd "$C"
node "$HERE/menu-proof.mjs" "$C" "$CANDIDATE" "$OUT/menus" "$FAMS" > "$OUT/menus.out" 2>&1
echo "menu proof exit $?"
if [ "${4:-}" != "--no-freeze" ]; then
  node "$HERE/freeze-check.mjs" "$C" "$CANDIDATE" "$OUT/frz" > "$OUT/frz.out" 2>&1
  echo "freeze check exit $?"
fi
