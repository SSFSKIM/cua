#!/bin/bash
# Task 99: wait (from the x64 host) until a file on the arm64 VM holds a line matching <regex>, up to <seconds>, then
# print the file's last <n> lines. Polls once a minute.
# usage: wait-vm.sh <file on the VM> <regex> [seconds] [n]
F=$1; RE=$2; SECS=${3:-3600}; N=${4:-15}
stop=$(( $(date +%s) + SECS ))
while [ "$(date +%s)" -lt "$stop" ]; do
  ssh -o ConnectTimeout=20 cua-171-arm64 "grep -qE '$RE' '$F' 2>/dev/null" && break
  sleep 60
done
ssh -o ConnectTimeout=20 cua-171-arm64 "tail -n $N '$F'"
