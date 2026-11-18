#!/bin/bash
# Ruling 823's read-only re-judge of V5's stored rows (task 100): this checkout's judge, the base judge as --old.
# Diagnostic only (wave 8): each exit says whether the replay reproduced the stored verdicts, never a release pass.
# Usage: rejudge-823.sh <base device.mjs, placed beside scripts/linux-engine-diff/device.mjs>
cd "$(dirname "$0")/../../../../.." || exit 2
E=docs/evidence/2026-10-28-own-linux-engine/m5
for d in "$E/x64/out/V5.pinned-release" "$E/x64/out-rerun1/V5.pinned-release" "$E/arm64/pilot/out-zero-r1/V5.development-run.pinned.pilot" "$E/arm64/pilot/out-zero-z1/V5.development-run.pinned.pilot"; do
  node scripts/linux-engine-diff/rejudge-device.mjs --diagnostic --old "$1" "$d"
  echo "{\"path\":\"$d\",\"exit\":$?}"
done
