#!/usr/bin/env bash
# T4b's audit round, live on a private display (never :0): Xvfb and Openbox, a window standing for the person's (an
# xprobe recorder this script starts, so it is no client of the harness's) activated first, and a second one titled
# exactly as the run's recorder will be. Then:
# - xprobe grabs refuses the display until it is marked private, and refuses :0 (it only reads there, then stops);
# - controls.mjs runs one harness Desktop per control: a clean run, and the negative controls, each of which must fail.
# $1: the cua engine; $2: the evidence directory.
set -u
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
XPROBE="$WT/scripts/linux-engine-diff/xprobe/target/release/xprobe"
CUA="${1:?engine}"
OUT="${2:?evidence directory}"
D=:92
mkdir -p "$OUT"
pids=()
cleanup() { pkill -P $$ 2>/dev/null; kill "${pids[@]}" 2>/dev/null; wait 2>/dev/null; rm -rf "$(dirname "$AUTH")"; }
trap cleanup EXIT
AUTH=$(mktemp -d)/Xauthority
xauth -q -f "$AUTH" add $D . "$(mcookie)"
Xvfb $D -screen 0 1280x800x24 -nolisten tcp -auth "$AUTH" >/dev/null 2>&1 & pids+=($!)
sleep 1
export DISPLAY=$D XAUTHORITY="$AUTH"
openbox >/dev/null 2>&1 & pids+=($!)
sleep 1
sleep 900 | "$XPROBE" record 700 100 400 300 managed person >/dev/null & pids+=($!)
sleep 900 | "$XPROBE" record 700 450 300 200 managed cua171-diff-precreated-fixednonce-recorder-r >/dev/null & pids+=($!)
sleep 1.5
person=$(xdotool search --name '^person$')
precreated=$(xdotool search --name '^cua171-diff-precreated-fixednonce-recorder-r$')
xdotool windowactivate --sync "$person"
{
  echo "person's window: $(printf '0x%08x' "$person"); the pre-created exact-title window: $(printf '0x%08x' "$precreated"); active: $(printf '0x%08x' "$(xdotool getactivewindow)")"
  echo "== xprobe grabs on the private display, unmarked"
  "$XPROBE" grabs 2>&1; echo "exit $?"
  echo "== marked private (events.mjs startServer's mark)"
  xprop -root -f CUA171_PRIVATE_DISPLAY 8s -set CUA171_PRIVATE_DISPLAY 1
  "$XPROBE" grabs 2>&1; echo "exit $?"
  echo "== on :0 (it reads whether :0 is marked, then refuses; no grab is made)"
  DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority" "$XPROBE" grabs 2>&1; echo "exit $?"
} | tee "$OUT/grabs.txt"
node "$WT/docs/evidence/2026-10-28-own-linux-engine/m4/harness-windows/t4b/controls.mjs" "$CUA" "$person" "$precreated" > "$OUT/controls.json" 2> "$OUT/controls.stderr"
echo "controls: exit $?; active after: $(printf '0x%08x' "$(xdotool getactivewindow)")" | tee -a "$OUT/grabs.txt"
[ -s "$OUT/controls.stderr" ] || rm -f "$OUT/controls.stderr"
