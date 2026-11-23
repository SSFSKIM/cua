#!/bin/bash
# A harness run on a private Xvfb with Openbox (private-run.mjs), never :0.
# usage: private.sh <harness dir> <name> <linux-engine-diff.mjs args...>
set -u
. "$(dirname "$0")/env.sh"
guard
h=$1
name=$2
shift 2
node "$T/scripts/private-run.mjs" "$h" "$T/runs/$name" "$@"
echo "private run $name exit $? $(date -u +%T)"
