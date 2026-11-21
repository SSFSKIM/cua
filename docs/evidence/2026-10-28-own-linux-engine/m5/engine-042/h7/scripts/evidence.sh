#!/bin/bash
# task 125: the h7 evidence directory (logs kept as .txt: the repository ignores *.log)
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task125
E=$repo/docs/evidence/2026-10-28-own-linux-engine/m5/engine-042/h7
mkdir -p "$E"/{dev-run,comparison,probe,scripts,logs}
S=$T/gate-dev/C1.development-run; D=$E/dev-run/C1.development-run
mkdir -p "$D/run"
for f in README.md step.json session.jsonl watchdog.jsonl; do [ -f "$S/$f" ] && cp "$S/$f" "$D/"; done
cp "$S/stdout.log" "$D/stdout.log.txt"; cp "$S/stderr.log" "$D/stderr.log.txt"
cp "$S/run/summary.md" "$D/run/"; gzip -9 -c "$S/run/results.jsonl" > "$D/run/results.jsonl.gz"
node "$T/scripts/race.mjs" "$repo" "$S/run/results.jsonl" > "$E/dev-run/race.md"
for f in h6-x64 h7-x64 h6-arm64 h7-arm64; do cp "$T/cmp/$f.txt" "$E/comparison/"; done
for a in x64 arm64; do node "$T/scripts/steps-differ.mjs" "$T/cmp/h6-$a.txt" "$T/cmp/h7-$a.txt" | sed "s/^/$a: /"; done > "$E/comparison/steps-differ.txt"
grep -v '^\[' "$T/probe-both.log" > "$E/probe/usertime-156-158.txt"
cp "$T/red-judge.txt" "$E/logs/red-judge-unexercised.txt"
cp "$T"/probe-usertime-any.sh "$T"/probe-both.sh "$T"/devrun.sh "$T"/compare.sh "$T"/evidence.sh "$T"/scripts/race.mjs "$T"/scripts/steps-differ.mjs "$E/scripts/"
grep " m5-h7 " /Users/new/.local/share/cua-171/host-lock.log > "$E/logs/host-lock-m5-h7.txt"
du -sh "$E"
