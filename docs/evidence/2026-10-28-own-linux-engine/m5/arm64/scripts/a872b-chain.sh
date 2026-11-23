#!/bin/bash
# Task 99: ruling 872's precise rerun, after F2's private part: a smoke (2 runs a family), then, if it completed and its
# rows carry the read focus, the full run (40 a family).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
until grep -qE 'driver done|REFUSED|STOP|hold-sittings' "$D/m5/f2-arm64/driver.log" 2>/dev/null; do sleep 20; done
"$T/activation-872b.sh" "$D/m5/a872/smoke-b" smoke-b --trials 2; c=$?
echo "smoke-b exit $c"
n=$(grep -c '"focus_at_answer_read":[0-9]' "$D/m5/a872/smoke-b/results.jsonl" 2>/dev/null)
echo "smoke-b rows with a read focus: $n"
[ "$c" -eq 0 ] && [ "${n:-0}" -ge 10 ] || { echo "full-b not started"; exit 3; }
"$T/activation-872b.sh" "$D/m5/a872/full-b" full-b; echo "full-b exit $?"
