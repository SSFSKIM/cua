#!/bin/bash
# Task 49: one guarded private-display session. The person's side read before and after (owner-check.sh), watched
# during it from outside the guarded tree (owner-watch.sh), the session under wrap.py with a TMPDIR of the run's own,
# which must be empty afterwards.
# usage: run-session.sh <out> <phases.json>
set -u
here=$(cd "$(dirname "$0")" && pwd)
out=$(realpath -m "$1"); phases=$(realpath "$2")
mkdir -p "$out"
cp "$phases" "$out/phases.json"
"$here/owner-check.sh" before > "$out/owner-before.txt" 2>&1
pid=$(awk '/^owner chrome pid/ {print $4; exit}' "$out/owner-before.txt")
start=$(awk '/^owner chrome pid/ {print $6; exit}' "$out/owner-before.txt")
ids=$(DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority timeout 5 xprop -root _NET_CLIENT_LIST | grep -o '0x[0-9a-f]*')
count=$(echo "$ids" | grep -c .)
digest=$(for id in $ids; do DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority timeout 5 xprop -id "$id" WM_CLASS 2>&1; done | sort | md5sum | cut -c1-12)
echo "owner pid=$pid start=$start :0 count=$count digest=$digest" | tee "$out/owner-baseline.txt"
[ -n "$pid" ] || { echo "no owner Chrome found: stopping before anything runs"; exit 3; }
tmproot=$(mktemp -d /tmp/cua171-task49-XXXXXX)
echo "tmproot $tmproot" >> "$out/owner-baseline.txt"
"$here/owner-watch.sh" "$out" "$pid" "$start" "$count" "$digest" &
watch=$!
python3 -I "$here/wrap.py" "$out" "$tmproot" node "$here/session.mjs" "$out" "$out/phases.json" > "$out/wrap.out" 2>&1
code=$?
touch "$out/session.done"
wait "$watch"
"$here/owner-check.sh" after > "$out/owner-after.txt" 2>&1
left=$(ls -A "$tmproot" 2>&1)
echo "wrap exit $code; tmproot left: [${left}]" | tee -a "$out/owner-baseline.txt"
[ -z "$left" ] && rmdir "$tmproot"
diff <(grep -v '^==' "$out/owner-before.txt") <(grep -v '^==' "$out/owner-after.txt") > "$out/owner-diff.txt" && echo "owner side: no difference" | tee -a "$out/owner-baseline.txt" || { echo "owner side DIFFERS:"; cat "$out/owner-diff.txt"; } | tee -a "$out/owner-baseline.txt"
exit $code
