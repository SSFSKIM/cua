#!/usr/bin/env bash
# The live negative control, on a private display (never :0): Xvfb and Openbox, a terminal standing for the person's
# window, activated first; then the harness's Desktop begun, a front window opened and the run closed, once with the
# worktree's build and once with a build that still restores (make-restoring-build.py). $1: the cua engine; $2: the
# evidence directory.
set -u
T=/Users/new/.local/share/cua-171/task35
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
CUA="${1:?engine}"
OUT="${2:?evidence directory}"
D=:91
mkdir -p "$OUT"
pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null; wait 2>/dev/null; rm -rf "$(dirname "$AUTH")"; }
trap cleanup EXIT
# an authority file of the display's own, as xvfb-run makes one: the audit's proxy copies its credentials
AUTH=$(mktemp -d)/Xauthority
xauth -q -f "$AUTH" add $D . "$(mcookie)"
export XAUTHORITY="$AUTH"
Xvfb $D -screen 0 1280x800x24 -nolisten tcp -auth "$AUTH" >/dev/null 2>&1 & pids+=($!)
sleep 1
DISPLAY=$D openbox >/dev/null 2>&1 & pids+=($!)
sleep 1
DISPLAY=$D xterm -T person -e sleep 900 & pids+=($!)
sleep 1.5
person=$(DISPLAY=$D xdotool search --name '^person$')
DISPLAY=$D xdotool windowactivate --sync "$person"
echo "person's window: $person ($(printf '0x%08x' "$person")); active: $(DISPLAY=$D xdotool getactivewindow)" | tee "$OUT/private-display.txt"
python3 "$T/make-restoring-build.py" "$T/restoring-build"
diff -u "$WT/scripts/linux-engine-diff/scenes.mjs" "$T/restoring-build/scenes.mjs" > "$OUT/restoring-build.diff"
for lane in worktree restoring; do
  dir="$WT/scripts/linux-engine-diff"
  [ "$lane" = restoring ] && dir="$T/restoring-build"
  DISPLAY=$D node "$T/desktop-control.mjs" "$dir" "$CUA" "control-$lane" > "$OUT/$lane.json" 2> "$OUT/$lane.stderr"
  echo "$lane: exit $?; active after: $(DISPLAY=$D xdotool getactivewindow)" | tee -a "$OUT/private-display.txt"
  [ -s "$OUT/$lane.stderr" ] || rm -f "$OUT/$lane.stderr"
done
