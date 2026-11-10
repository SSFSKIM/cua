#!/bin/bash
# Task 71: T19's sitting on :0, one guarded step, a declared live run (the harness's own CLI declares it) under task
# 50's guards unchanged (person-display-live/scripts/, used by path): owner-check.sh before and after, owner-watch.sh
# from outside the guarded tree (its watchdog file the run's own), tmp-watch.sh, and the harness's CLI under wrap50.py
# in person mode with a TMPDIR of the step's own, which must be empty afterwards. run50.sh's body with two changes: the
# harness is the export named as an argument (as run58.sh takes it), and the real pointer's starting place is read
# before the step and put back after it, outside the guarded tree, once every window of the run's is closed. No
# whole-run RECORD: the harness refuses it on a display without the private mark, and :0 carries none.
# usage: run71.sh <out> <harness dir> <linux-engine-diff.mjs arguments, without --out>
set -u
here=$(cd "$(dirname "$0")" && pwd)
GUARDS=$(cd "$here/../../person-display-live/scripts" && pwd)
out=$(realpath -m "$1"); shift
LIVE=$(realpath "$1"); shift
mkdir -p "$out"
[ -e "$out/run" ] && { echo "$out/run exists: refusing"; exit 2; }
[ -e "$HOME/.local/share/cua-171/hold-sittings" ] && { echo "hold-sittings present: refusing"; exit 5; }
pgrep -x stress-ng > /dev/null && { echo "a load is running: refusing"; exit 4; }
X() { DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority timeout 5 "$@"; }
start=$(X xdotool getmouselocation --shell)
sx=$(awk -F= '$1=="X" {print $2}' <<<"$start")
sy=$(awk -F= '$1=="Y" {print $2}' <<<"$start")
[ -n "$sx" ] && [ -n "$sy" ] || { echo "the pointer's place could not be read: stopping before anything runs"; exit 3; }
echo "pointer at start $sx $sy" > "$out/pointer.txt"
"$GUARDS/owner-check.sh" before > "$out/owner-before.txt" 2>&1
pid=$(awk '/^owner chrome pid/ {print $4; exit}' "$out/owner-before.txt")
[ -n "$pid" ] || { echo "no owner Chrome found: stopping before anything runs"; exit 3; }
echo "owner pid=$pid start=$(awk '/^owner chrome pid/ {print $6; exit}' "$out/owner-before.txt")" | tee "$out/owner-baseline.txt"
tmproot=$(mktemp -d /tmp/c71-XXXXXX)
marker="$out/start.marker"; touch "$marker"
echo "tmproot $tmproot" >> "$out/owner-baseline.txt"
echo "args: $*" >> "$out/owner-baseline.txt"
"$GUARDS/owner-watch.sh" "$out" "$pid" "$out/run/watchdog.jsonl" &
watch=$!
"$GUARDS/tmp-watch.sh" "$out" "$tmproot" "$marker" &
tw=$!
sleep 1
started=$(date -u +%FT%TZ)
cd "$LIVE"
python3 -I "$GUARDS/wrap50.py" "$out" "$tmproot" person node "$LIVE/scripts/linux-engine-diff.mjs" "$@" --out "$out/run" > "$out/wrap.out" 2>&1
code=$?
echo "started $started finished $(date -u +%FT%TZ) wrap exit $code" >> "$out/owner-baseline.txt"
touch "$out/session.done"
wait "$watch" "$tw"
# the pointer back where the person left it
X xdotool mousemove "$sx" "$sy"
end=$(X xdotool getmouselocation --shell | awk -F= '$1=="X" || $1=="Y" {printf "%s ", $2}')
echo "pointer restored to $sx $sy, reads $end" >> "$out/pointer.txt"
"$GUARDS/owner-check.sh" after > "$out/owner-after.txt" 2>&1
left=$(ls -A "$tmproot" 2>&1)
echo "tmproot left: [${left}]" | tee -a "$out/owner-baseline.txt"
[ -z "$left" ] && rmdir "$tmproot"
echo "/tmp/cua171-run-* left: [$(ls -d /tmp/cua171-run-* 2>/dev/null | tr '\n' ' ')]" | tee -a "$out/owner-baseline.txt"
if diff <(grep -v '^==' "$out/owner-before.txt") <(grep -v '^==' "$out/owner-after.txt") > "$out/owner-diff.txt"; then
  echo "owner side: no difference" | tee -a "$out/owner-baseline.txt"
else
  { echo "owner side DIFFERS:"; cat "$out/owner-diff.txt"; } | tee -a "$out/owner-baseline.txt"
fi
exit $code
