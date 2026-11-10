#!/bin/bash
# A commit's engine built the release workflow's way (build-musl-tar.sh): its `native/linux-engine` tree archived from
# the checkout to $T/build/<commit>/engine.tar, then built there. Prints the binary's path last.
# usage: build.sh <commit>
set -euo pipefail
. "$(dirname "$0")/env.sh"
commit=$(git -C "$WT" rev-parse "$1")
root=$T/build/${commit:0:8}
mkdir -p "$root"
git -C "$WT" archive "$commit" native/linux-engine -o "$root/engine.tar"
"$S/build-musl-tar.sh" "$root" "$commit"
