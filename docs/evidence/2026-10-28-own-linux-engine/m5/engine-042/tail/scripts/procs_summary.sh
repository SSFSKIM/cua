#!/bin/bash
# Task 118: which Chrome every run drove, from its process record (procrec.sh): per run, the harness's `chrome`
# processes (their command line names a harness scratch) by executable, and the others seen beside them (not the
# harness's, left alone) by count.
# usage: procs_summary.sh <procs dir>...
echo '| run | harness Chrome processes by executable | other chrome processes seen |'
echo '|---|---|---:|'
for d in "$@"; do
  for f in "$d"/*.txt; do
    h=$(awk '$4 == 1 {print $3}' "$f" | sort | uniq -c | awk '{printf "%s%s: %d", (NR > 1 ? "; " : ""), $2, $1}')
    o=$(awk '$4 != 1' "$f" | wc -l)
    echo "| $(basename "$d")/$(basename "$f" .txt) | ${h:-none} | $o |"
  done
done
