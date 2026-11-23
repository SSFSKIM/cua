#!/bin/bash
# Task 118: wave 6's smoke (9371d234) and the identification-time tables into the evidence directory, with the logs
# brought up to date.
set -eu
E=$1
O=/Users/new/.local/share/cua-171/task118/out
S=/Users/new/.local/share/cua-171/task118/scripts
mkdir -p "$E/9371d234" "$E/procs/9371d234"
scp -q 'cua-171-arm64:/Users/new/.local/share/cua-171/task118/out/*9371d234*' "$O/"
scp -q 'cua-171-arm64:/Users/new/.local/share/cua-171/task118/out/identify-f10946bf.md' "$O/"
cp "$O/v5-9371d234.md" "$E/9371d234/v5.md"
cp "$O/samples-9371d234.tsv" "$E/9371d234/samples.tsv"
cp "$O/canary-9371d234.md" "$E/9371d234/canary.md"
cp "$O/canary-9371d234-rejudged.md" "$E/9371d234/canary-rejudged.md"
cp "$O/identify-9371d234.md" "$E/9371d234/identify-times.md"
cp "$O/identify-f10946bf.md" "$E/f10946bf/identify-times.md"
cp "$O/procs-9371d234.md" "$E/procs/summary-9371d234.md"
scp -q 'cua-171-arm64:/Users/new/.local/share/cua-171/task118/w6/procs/*.txt' "$E/procs/9371d234/"
scp -q cua-171-arm64:/Users/new/.local/share/cua-171/task118/chain.log "$E/logs/chain.log"
ssh cua-171-arm64 'grep " m5-tail042 " /Users/new/.local/share/cua-171/host-lock.log' > "$E/logs/host-lock-m5-tail042.txt"
ssh cua-171-arm64 'cat /Users/new/.local/share/cua-171/task118/build-arm64.out /Users/new/.local/share/cua-171/task118/build-arm64-w4.out /Users/new/.local/share/cua-171/task118/build-arm64-w5.out /Users/new/.local/share/cua-171/task118/build-arm64-w6.out' > "$E/logs/builds.txt"
cp "$S/identify_times.py" "$S/w6-plan.sh" "$E/scripts/"
