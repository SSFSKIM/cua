#!/bin/bash
# Task 73's preparation for a commit (run under the host lock): the musl engine built the release workflow's way, the
# harness exported and patched for the probe, and the probe's grab tool built (its target outside the repository).
# Prints the engine's path, then the harness's.
# usage: prepare.sh <commit>
set -euo pipefail
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
engine=$("$d/build-musl.sh" "$1" | tail -1)
harness=$("$d/export-harness.sh" "$1" | tail -1)
node "$d/patch-harness.mjs" "$harness" >&2
(cd "$d/xgrab" && CARGO_TARGET_DIR="$T/xgrab-target" cargo build --release --offline >&2)
echo "$engine"
echo "$harness"
