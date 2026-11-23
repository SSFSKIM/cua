#!/bin/bash
# Task 147 (from task 132's arm-lanes.sh): the development harness for item 3, Chrome's drag_handle long-left x100 at
# twice the load, as tasks 132 and 133 ran it. A second worktree t147-dev detached at H9 = cd03a47b, with task 132's
# add-plans.py applied unchanged as one VM-local commit (never pushed): `t132-handle-long` (and `t132-floor-q`, unused).
# node_modules and xprobe's target are symlinks to t147-h9's (the same lockfile and xprobe source at the same commit), so
# no second npm ci or cargo build. The `off` control: the pinned 0.4.4 engine with `--drag-dnd-release-sync off`, as
# task 132's off-<head> wrappers. The counted checkout t147-h9 is never touched.
set -euo pipefail
D=/Users/new/.local/share/cua-171
T=$D/task147
R=/Users/new/Developer/GitHub/cua
H=$R/.claude/worktrees/t147-h9
G=$R/.claude/worktrees/t147-dev
H9=cd03a47bde2a484e1c3ecbf07cc97aada720fda7
E=$D/m5/home-arm64-044/engine/linux/cua-engine
[ -e "$G" ] && { echo "$G exists"; exit 2; }
git -C "$R" worktree add -q --detach "$G" "$H9"
[ "$(git -C "$G" rev-parse HEAD)" = "$H9" ] || { echo "t147-dev is not at H9"; exit 1; }
python3 -I "$T/add-plans.py" "$G/scripts/linux-engine-diff/drop-signals.mjs"
git -C "$G" -c user.name=task147 -c user.email=task147@localhost commit -q -am "task 147: development plans t132-floor-q and t132-handle-long (task 132's add-plans.py; VM-local, never pushed)"
ln -s "$H/node_modules" "$G/node_modules"
mkdir -p "$G/scripts/linux-engine-diff/xprobe"
ln -s "$H/scripts/linux-engine-diff/xprobe/target" "$G/scripts/linux-engine-diff/xprobe/target"
git -C "$G" log --oneline -2
git -C "$G" diff --stat HEAD~1 HEAD
echo "status (untracked symlinks expected): $(git -C "$G" status --porcelain | tr '\n' ' ')"
mkdir -p "$T/bin"
printf '#!/bin/sh\n# task 147: the pinned 0.4.4 engine with --drag-dnd-release-sync off (0.4.2'"'"'s handle end; a development control lane, never released)\nexec %s --drag-dnd-release-sync off "$@"\n' "$E" > "$T/bin/off-044"
chmod +x "$T/bin/off-044"
cat "$T/bin/off-044"
sha256sum "$E"
