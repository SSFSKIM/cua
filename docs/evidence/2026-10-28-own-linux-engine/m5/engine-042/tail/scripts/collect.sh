#!/bin/bash
# Task 118: the tables, process records and logs into the evidence directory (counts, ids, times and paths only).
set -eu
E=$1
O=/Users/new/.local/share/cua-171/task118/out
S=/Users/new/.local/share/cua-171/task118/scripts
mkdir -p "$E/80b98959" "$E/f8bd6949" "$E/f10946bf" "$E/logs" "$E/procs/80b98959-f8bd6949" "$E/procs/f10946bf" "$E/scripts"
cp "$O/v5-80b98959.md" "$E/80b98959/v5.md"
cp "$O/samples-80b98959.tsv" "$E/80b98959/samples.tsv"
cp "$O/canary-80b98959.md" "$E/80b98959/canary.md"
cp "$O/canary-80b98959-rejudged.md" "$E/80b98959/canary-rejudged.md"
cp "$O/v5-f8bd6949.md" "$E/f8bd6949/v5.md"
cp "$O/samples-f8bd6949.tsv" "$E/f8bd6949/samples.tsv"
cp "$O/v5-f10946bf.md" "$E/f10946bf/v5.md"
cp "$O/samples-f10946bf.tsv" "$E/f10946bf/samples.tsv"
cp "$O/canary-f10946bf.md" "$E/f10946bf/canary.md"
cp "$O/canary-f10946bf-rejudged.md" "$E/f10946bf/canary-rejudged.md"
cp "$O/rejudge-v5-under-f10946bf.txt" "$E/f10946bf/v5-earlier-runs-rejudged.txt"
cp "$O/procs-80b98959-f8bd6949.md" "$E/procs/summary-80b98959-f8bd6949.md"
cp "$O/procs-f10946bf.md" "$E/procs/summary-f10946bf.md"
scp -q 'cua-171-arm64:/Users/new/.local/share/cua-171/task118/procs/*.txt' "$E/procs/80b98959-f8bd6949/"
scp -q 'cua-171-arm64:/Users/new/.local/share/cua-171/task118/w5/procs/*.txt' "$E/procs/f10946bf/"
scp -q cua-171-arm64:/Users/new/.local/share/cua-171/task118/chain.log "$E/logs/chain.log"
ssh cua-171-arm64 'grep " m5-tail042 " /Users/new/.local/share/cua-171/host-lock.log' > "$E/logs/host-lock-m5-tail042.txt"
ssh cua-171-arm64 'cat /Users/new/.local/share/cua-171/task118/build-arm64.out /Users/new/.local/share/cua-171/task118/build-arm64-w4.out /Users/new/.local/share/cua-171/task118/build-arm64-w5.out' > "$E/logs/builds.txt"
cp "$S"/*.sh "$S"/*.py "$S"/*.mjs "$E/scripts/"
