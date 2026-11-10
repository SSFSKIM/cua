#!/bin/bash
# A harness run on a private Xvfb with Openbox (private-run.mjs, beside this script), never :0. Exits with the run's
# status: nonzero when a judge failed, the display's watchdog was unclean, or the runner crashed.
# usage: private.sh <harness dir> <name> <linux-engine-diff.mjs args...>   (writes $T/runs/<name>)
set -u
. "$(dirname "$0")/env.sh"
guard
h=$1
name=$2
shift 2
node "$S/private-run.mjs" "$h" "$T/runs/$name" "$@"
status=$?
echo "private run $name exit $status $(date -u +%T)"
exit $status
