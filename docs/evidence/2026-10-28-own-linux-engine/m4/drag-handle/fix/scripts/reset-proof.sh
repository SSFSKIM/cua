#!/bin/bash
# The reset proof (reset-proof.mjs) on a private Xvfb of xvfb-run's, never :0, for one checkout or harness export and
# its engine. Run it under the host lock.
# usage: reset-proof.sh <checkout or harness export> <cua-engine>
set -u
. "$(dirname "$0")/env.sh"
guard
exec xvfb-run -a node "$F/reset-proof.mjs" "$1" "$2"
