#!/usr/bin/env bash
# T4b's live proof on :0 (a development run, not a release gate), started with the owner's Chrome active: the holder,
# the run's trace and its whole RECORD, the scenes of task 35's run plus device-xterm (beside minimized-xterm, whose
# label it shared) and the Chrome drop cases that move the real pointer, take the foreground route, or are judged by
# the grab watch, on the musl build made the workflow's way. $1: the cua engine; $2: the run name; $3: the out
# directory under m4/harness-windows/t4b/.
set -uo pipefail
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
cd "$WT"
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
SKY="$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky"
VENDOR="$SKY/bin/linux/sky_linux_x64"
NEWEST="$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64"
CUA="${1:?engine}"
RUN="${2:?run name}"
OUT="$WT/docs/evidence/2026-10-28-own-linux-engine/m4/harness-windows/t4b/${3:?out}"
MINIMIZED="$(node -e "import('./scripts/linux-engine-diff/minimized.mjs').then((m) => console.log(Object.keys(m.MINIMIZED_OPS).join(',')))")"
DND=chrome_dnd_in_front_shared,chrome_dnd_covered_dedicated,chrome_dnd_short_pointer_outside_shared,chrome_select_nudged_shared
XTERM=xterm_key_shared,xterm_key_dedicated,xterm_click_shared
OPS="${OPS:-tree,press_key,click,$MINIMIZED,$XTERM,$DND}"
echo "head: $(git rev-parse HEAD); harness changes not committed: $(git status --short -- scripts/linux-engine-diff | wc -l)"
echo "engine: $("$CUA" --version), sha256 $(sha256sum "$CUA" | cut -c1-64)"
echo "active window before: $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //')"
node scripts/linux-engine-diff.mjs --dev --vendor "$VENDOR" --newest "$NEWEST" --cua "$CUA" \
  --scene "${SCENES:-gedit,minimized,minimized-xterm,minimized-recorder,device-xterm,device-chrome-dnd}" --ops "$OPS" --run "$RUN" --out "$OUT"
echo "exit $?"
echo "active window after: $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //')"
