#!/bin/bash
# Task 109, on the x64 host: waits until the VM's sitting log (zero.log of the given out root) has more than N lines
# matching a step's end ("after <step>"), a hold, a stop or the sitting's end, then prints the log's new lines.
# usage: wait-zero.sh <out root name, e.g. out-arm64-h5> <lines already seen>
set -u
L=/Users/new/.local/share/cua-171/m5/$1/zero.log
n=$2
while :; do
  out=$(ssh cua-171-arm64 "grep -cE ' after | hold-sittings| sitting done| stopped| refused|no command' $L 2>/dev/null")
  [ "${out:-0}" -gt "$n" ] && break
  sleep 60
done
ssh cua-171-arm64 "cat $L"
