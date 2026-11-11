#!/bin/bash
# Task 73: several sittings in one locked call, in turn, one per disturbance, each named <prefix>-<disturbance>.
# usage: batch.sh <harness dir> <candidate engine> <prefix> <family> <ops> <lanes> <trials> <disturbance>...
set -u
d=$(dirname "$0")
h=$1 cand=$2 prefix=$3 family=$4 ops=$5 lanes=$6 trials=$7
shift 7
for disturbance in "$@"; do
  bash "$d/sitting.sh" "$h" "$cand" "$prefix-$disturbance" "$disturbance" "$trials" "$family" "$ops" "$lanes"
done
