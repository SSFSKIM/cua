#!/usr/bin/env bash
# Task 35's live proof on :0 (a development run, not a release gate), started with the owner's Chrome active: the
# holder, the scenes, the stub and both negative checks, the audit passes and the minimized cases, on the musl build
# made the workflow's way. $1: the cua engine; $2: the run name; $3: the out directory under m4/harness-windows/.
set -uo pipefail
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
cd "$WT"
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
SKY="$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky"
VENDOR="$SKY/bin/linux/sky_linux_x64"
NEWEST="$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64"
CUA="${1:?engine}"
RUN="${2:?run name}"
OUT="$WT/docs/evidence/2026-10-28-own-linux-engine/m4/harness-windows/${3:?out}"
MINIMIZED="$(node -e "import('./scripts/linux-engine-diff/minimized.mjs').then((m) => console.log(Object.keys(m.MINIMIZED_OPS).join(',')))")"
OPS="${OPS:-tree,press_key,click,$MINIMIZED}"
echo "head: $(git rev-parse HEAD); harness changes not committed: $(git status --short -- scripts/linux-engine-diff | wc -l)"
echo "active window before: $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //')"
node scripts/linux-engine-diff.mjs --dev --vendor "$VENDOR" --newest "$NEWEST" --cua "$CUA" \
  --scene "${SCENES:-gedit,minimized,minimized-xterm,minimized-recorder}" --ops "$OPS" --run "$RUN" --out "$OUT"
echo "exit $?"
echo "active window after: $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //')"
