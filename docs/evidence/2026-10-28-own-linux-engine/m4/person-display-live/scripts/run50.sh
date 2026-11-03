#!/bin/bash
# Task 50: one guarded step of the harness on :0, a declared live run (the harness's own CLI declares it). The person's
# side read before and after (owner-check.sh), watched during it from outside the guarded tree (owner-watch.sh), the
# run's temporary files watched (tmp-watch.sh), the CLI under wrap50.py in person mode with a TMPDIR of the step's
# own, which must be empty afterwards. No whole-run RECORD: the harness refuses it on a display without the private
# mark, and :0 carries none.
# usage: run50.sh <out> <linux-engine-diff.mjs arguments, without --out>
set -u
here=$(cd "$(dirname "$0")" && pwd)
out=$(realpath -m "$1"); shift
LIVE=/Users/new/.local/share/cua-171/live-43
mkdir -p "$out"
[ -e "$out/run" ] && { echo "$out/run exists: refusing"; exit 2; }
"$here/owner-check.sh" before > "$out/owner-before.txt" 2>&1
pid=$(awk '/^owner chrome pid/ {print $4; exit}' "$out/owner-before.txt")
[ -n "$pid" ] || { echo "no owner Chrome found: stopping before anything runs"; exit 3; }
echo "owner pid=$pid start=$(awk '/^owner chrome pid/ {print $6; exit}' "$out/owner-before.txt")" | tee "$out/owner-baseline.txt"
tmproot=$(mktemp -d /tmp/c50-XXXXXX)
marker="$out/start.marker"; touch "$marker"
echo "tmproot $tmproot" >> "$out/owner-baseline.txt"
echo "args: $*" >> "$out/owner-baseline.txt"
"$here/owner-watch.sh" "$out" "$pid" "$out/run/watchdog.jsonl" &
watch=$!
"$here/tmp-watch.sh" "$out" "$tmproot" "$marker" &
tw=$!
sleep 1
started=$(date -u +%FT%TZ)
cd "$LIVE"
python3 -I "$here/wrap50.py" "$out" "$tmproot" person node "$LIVE/scripts/linux-engine-diff.mjs" "$@" --out "$out/run" > "$out/wrap.out" 2>&1
code=$?
echo "started $started finished $(date -u +%FT%TZ) wrap exit $code" >> "$out/owner-baseline.txt"
touch "$out/session.done"
wait "$watch" "$tw"
"$here/owner-check.sh" after > "$out/owner-after.txt" 2>&1
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
