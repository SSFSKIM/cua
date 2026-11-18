#!/usr/bin/env bash
# The re-judge as run (task 102): every stored M5 sitting of the steps that share electronDropVerdict (H1, H2, L4a), and
# task 98's prototype sittings read from its branch's evidence (85886a76). Run from the checkout under judge.
#   bash docs/evidence/2026-10-28-own-linux-engine/m5/l4a-residue/rejudge-l4a-residue.sh > …/rejudge-l4a-residue.txt
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
m5=docs/evidence/2026-10-28-own-linux-engine/m5
t98=85886a76
exec node "$here/rejudge-l4a-residue.mjs" --harness . --old-rev fefe306c \
  "x64 T5 L4a (counted, pinned 0.4.0, at H)=$m5/x64/out/L4a.pinned-release" \
  "x64 pilot L4a (task 87, pilot 2)=$m5/x64/pilot/out/L4a.development-run.pilot" \
  "arm64 pilot L4a (task 96, pilot 2, pinned 0.4.0)=$m5/arm64/pilot/out/L4a.development-run.pinned.pilot" \
  "arm64 pilot L4a rate run (task 96, pilot 100, pinned 0.4.0; task 98's 0.4.0 column)=$m5/arm64/pilot/l4a-rate/L4a/L4a.development-run.pinned.pilot" \
  "task 98 L4a on the prototype (arm64, b74961ca, pilot 100)=git:$t98:$m5/l4a-fix/arm64/gate/L4a.development-run.pilot/run/results.jsonl.gz" \
  "x64 T5 H1 (counted, idle)=$m5/x64/out/H1.pinned-release" \
  "x64 T5 H2 (counted, the gate's window load)=$m5/x64/out/H2.pinned-release" \
  "x64 pilot H1 (task 87)=$m5/x64/pilot/out/H1.development-run.pilot" \
  "x64 pilot H2 (task 87)=$m5/x64/pilot/out/H2.development-run.pilot" \
  "arm64 pilot H1 (task 96, pilot 2)=$m5/arm64/pilot/out/H1.development-run.pinned.pilot" \
  "arm64 pilot H2 (task 96, pilot 2)=$m5/arm64/pilot/out/H2.development-run.pinned.pilot" \
  "arm64 pilot H1 rate run (task 96, pilot 100)=$m5/arm64/pilot/l4a-rate/H1/H1.development-run.pinned.pilot" \
  "task 98 H1 on the prototype (arm64, b74961ca, pilot 100)=git:$t98:$m5/l4a-fix/arm64/gate/H1.development-run.pilot/run/results.jsonl.gz"
