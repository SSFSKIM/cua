#!/bin/bash
# A sitting's inputs for a commit: its musl build made the release workflow's way (build-musl.sh) and its harness
# exported apart from the checkout (export-harness.sh). Prints the candidate's path, then the harness's.
# usage: prepare.sh <commit>
set -euo pipefail
d=$(dirname "$0")
cand=$("$d/build-musl.sh" "$1" | tail -1)
harness=$("$d/export-harness.sh" "$1" | tail -1)
echo "$cand"
echo "$harness"
