#!/bin/bash
# The third fix wave's preparation for a commit (run under the host lock): the musl engine built the release workflow's
# way (task 73's build-musl.sh), or with `live` its live build (build-musl-live.sh), and the harness exported with its
# xprobe built (export-harness.sh). Prints the engine's path, then the harness's.
# usage: prepare.sh <commit> [live]
set -euo pipefail
. "$(dirname "$0")/env.sh"
if [ "${2:-}" = live ]; then
  engine=$(bash "$(dirname "$0")/build-musl-live.sh" "$1" | tail -1)
else
  engine=$("$S/build-musl.sh" "$1" | tail -1)
fi
harness=$("$S/export-harness.sh" "$1" | tail -1)
echo "$engine"
echo "$harness"
