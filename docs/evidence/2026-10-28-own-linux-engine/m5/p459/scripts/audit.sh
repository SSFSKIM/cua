#!/bin/bash
# Task 126 (ruling 962.4) on x64: the route audit on the prototype's step. V5's in-front short drop cell
# (chrome_dnd_short_in_front_shared, the background route, Chrome in front) through the harness's run mode with its
# request audit on (no --no-audit), the prototype's build with each ungated form as a variant lane, so the step runs on
# every drop and the audit judges its motions: any XTEST request on the background route fails the sample. A private
# display, idle, under the host lock. Development run, never counted.
# usage: audit.sh <name> <prototype engine>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task126
CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64
PROTO=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459
RUNNER=$PROTO/docs/evidence/2026-10-28-own-linux-engine/m5/engine-042/measure/scripts/private-run.mjs
VENDOR=$D/m5/home-x64-042/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
name=$1; CAND=$2
OUT=$T/x64/$name
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
[ -e "$OUT" ] && { echo "$OUT exists"; exit 2; }
"$D/locked.sh" task126 timeout -s TERM -k 60 45m /usr/bin/node "$RUNNER" "$CHECKOUT" "$OUT" "task 126 development run (#459's prototype, the route audit)" -- \
  --vendor "$VENDOR" --newest "$NEWEST" --cua "$CAND" --scene device-chrome-dnd --ops chrome_dnd_short_in_front_shared \
  --blocks 3 --dev --variant "keepalive=--drag-dnd-release-sync keepalive" --variant "ping=--drag-dnd-release-sync ping" \
  --run "dev-p459-$name"
