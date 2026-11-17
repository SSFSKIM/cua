#!/bin/bash
# task 73: several probe sittings in one locked call, in turn
# usage: batch.sh <disturbance>...
for d in "$@"; do
  bash $HOME/.local/share/cua-171/task73/probes/sitting.sh "$d" 20
done
