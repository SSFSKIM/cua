#!/bin/bash
# The second fix wave's preparation for a commit (run under the host lock): the musl engine built the release workflow's way
# (task 73's build-musl.sh) and the harness exported with its xprobe built (export-harness.sh). Prints the engine's
# path, then the harness's.
# usage: prepare.sh <commit>
set -euo pipefail
. "$(dirname "$0")/env.sh"
engine=$("$S/build-musl.sh" "$1" | tail -1)
harness=$("$S/export-harness.sh" "$1" | tail -1)
echo "$engine"
echo "$harness"
