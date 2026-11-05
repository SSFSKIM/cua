#!/bin/bash
# One qt-activation sitting: <name> <harness: checkout|commit> <engine commit> <lanes> <kinds> <families> <load factor, 0 idle> [trials]
# The harness is the checkout (a smoke run) or an exported commit's; the engine a musl build of a commit
# (build-musl.sh); the vendor and released binaries from paths.sh.
set -u
here=$(dirname "$0")
. "$here/paths.sh"
name=$1 harness=$2 engine=$3 lanes=$4 kinds=$5 families=$6 load=$7 trials=${8:-}
if [ "$harness" = checkout ]; then dir=$CK; else dir=$T61/harness-$harness; fi
extra=()
[ "$load" != 0 ] && extra+=(--load-factor "$load")
[ -n "$trials" ] && extra+=(--trials "$trials")
exec bash "$here/sitting.sh" "$dir" "$name" --experiment qt-activation --cua "$(musl "$engine")" --vendor "$VENDOR" \
  --released "$RELEASED" --lanes "$lanes" --kinds "$kinds" --family "$families" "${extra[@]}"
