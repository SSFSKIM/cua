#!/bin/bash
# Task 61's sittings, probes, test runs and scripts into the evidence directory, home paths labelled.
set -eu
T=$HOME/.local/share/cua-171/task61
EV=$T/checkout/docs/evidence/2026-10-28-own-linux-engine/m4/qt-activation
cd "$T"
python3 scripts/copy-evidence.py runs "$EV" vendor-load2=compare/load2-before ack-load2=wait-rule/load2 \
  final-idle=final/idle final-load2=final/load2 click-paste-shipped-load2=focus-timer/click-paste-load2-final \
  click-paste-before-load2=focus-timer/click-paste-load2-before
python3 scripts/copy-evidence.py runs/trace "$EV/mechanism" kate-x2.runs.jsonl=trace-runs.jsonl \
  segments/activating-run-0.xtrace.txt=activating-run-0.xtrace.txt segments/plain-run-3.xtrace.txt=plain-run-3.xtrace.txt
python3 scripts/copy-evidence.py runs "$EV/mechanism" signal-probe.txt=signal-probe.txt modal-probe.txt=modal-probe.txt
cp runs/trace/kate-x2.xtrace.gz "$EV/mechanism/"
python3 scripts/trace-segments.py runs/trace/kate-x2.xtrace runs/trace/kate-x2.runs.jsonl /tmp/cua171-seg > "$EV/mechanism/trace.md"
rm -rf /tmp/cua171-seg
mkdir -p "$EV/tdd" "$EV/scripts"
python3 scripts/copy-evidence.py tdd "$EV/tdd" red-live-focus-ack.txt=red-live-focus-ack.txt \
  green-live-focus-ack-2.txt=green-live-focus-ack.txt red-focus-timer-judge.txt=red-focus-timer-judge.txt \
  red-harness-1.txt=red-qt-activation-harness.txt
for f in scripts/*.sh scripts/*.mjs scripts/*.py; do
  python3 scripts/copy-evidence.py scripts "$EV/scripts" "$(basename "$f")=$(basename "$f")" > /dev/null
done
grep -rl '<home>' "$EV" || echo "no home paths"
du -sh "$EV"
