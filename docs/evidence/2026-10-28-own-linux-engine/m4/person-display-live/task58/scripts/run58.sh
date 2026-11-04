#!/bin/bash
# Task 58: one guarded step on :0, a declared live run (the driver declares it), under task 50's guards unchanged
# (person-display-live/scripts/): owner-check.sh before and after, owner-watch.sh from outside the guarded tree (its
# watchdog file the run's own), tmp-watch.sh, and the driver under wrap50.py in person mode with a TMPDIR of the step's
# own, which must be empty afterwards. run50.sh's body with one change: the guarded command is a task-58 driver
# (focus58.mjs or engine58.mjs) rather than the harness's CLI, whose focus-timer and engine-stop experiments run only on
# a private server they start themselves. No whole-run RECORD: the harness refuses it on a display without the
# private mark, and :0 carries none.
# usage: run58.sh <out> <driver.mjs> <driver arguments, without --out and --display>
set -u
GUARDS=${CUA171_GUARDS:-$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/person-display-live/scripts}
LIVE=${CUA171_HARNESS:-$HOME/.local/share/cua-171/live-43}
out=$(realpath -m "$1"); shift
driver=$(realpath "$1"); shift
mkdir -p "$out"
[ -e "$out/run" ] && { echo "$out/run exists: refusing"; exit 2; }
pgrep -x stress-ng > /dev/null && { echo "a load is running: refusing"; exit 4; }
"$GUARDS/owner-check.sh" before > "$out/owner-before.txt" 2>&1
pid=$(awk '/^owner chrome pid/ {print $4; exit}' "$out/owner-before.txt")
[ -n "$pid" ] || { echo "no owner Chrome found: stopping before anything runs"; exit 3; }
echo "owner pid=$pid start=$(awk '/^owner chrome pid/ {print $6; exit}' "$out/owner-before.txt")" | tee "$out/owner-baseline.txt"
tmproot=$(mktemp -d /tmp/c58-XXXXXX)
marker="$out/start.marker"; touch "$marker"
echo "tmproot $tmproot" >> "$out/owner-baseline.txt"
echo "driver: $(basename "$driver") args: $*" >> "$out/owner-baseline.txt"
"$GUARDS/owner-watch.sh" "$out" "$pid" "$out/run/watchdog.jsonl" &
watch=$!
"$GUARDS/tmp-watch.sh" "$out" "$tmproot" "$marker" &
tw=$!
sleep 1
started=$(date -u +%FT%TZ)
cd "$LIVE"
python3 -I "$GUARDS/wrap50.py" "$out" "$tmproot" person node "$driver" --display person "$@" --out "$out/run" > "$out/wrap.out" 2>&1
code=$?
echo "started $started finished $(date -u +%FT%TZ) wrap exit $code" >> "$out/owner-baseline.txt"
touch "$out/session.done"
wait "$watch" "$tw"
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
