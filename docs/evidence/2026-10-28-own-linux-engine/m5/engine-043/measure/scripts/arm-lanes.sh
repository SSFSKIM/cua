#!/bin/bash
# Task 132 on the arm64 VM: the candidate in a run-owned home (task132/home-arm64-043/engine/linux/cua-engine, the
# install layout), the measurement wrappers of it, and the VM-local development plans committed in t132-h71
# (never pushed).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task132
B=$T/bin/cua-engine-043-arm64-f9d1f86b
H=$T/home-arm64-043/engine/linux
mkdir -p "$H"
cp "$B" "$H/cua-engine"
E=$H/cua-engine
wrap() {
  printf '#!/bin/sh\n# task 132: the 0.4.3 candidate f9d1f86b with %s (a development lane, never released)\nexec %s %s "$@"\n' "$2" "$E" "$2" > "$T/bin/$1"
  chmod +x "$T/bin/$1"
  echo "$T/bin/$1"
}
wrap c-on "--drag-dnd-unconfirm-outlasted on"
wrap c-alone "--drag-dnd-release-sync off --drag-dnd-unconfirm-outlasted on"
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t132-h71
if ! git -C "$G" log -1 --format=%s | grep -q 'task 132'; then
  python3 -I "$T/scripts/add-plans.py" "$G/scripts/linux-engine-diff/drop-signals.mjs" || exit 1
  git -C "$G" -c user.name=task132 -c user.email=task132@localhost commit -q -am "task 132: development plans t132-floor-q and t132-handle-long (VM-local, never pushed)"
fi
git -C "$G" log --oneline -2
sha256sum "$E"
