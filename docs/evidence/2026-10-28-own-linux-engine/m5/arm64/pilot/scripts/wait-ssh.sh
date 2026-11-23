#!/bin/bash
# Task 96: wait until `ssh cua-171-arm64` authenticates again (polled each 60 s), up to the given seconds.
end=$(( $(date +%s) + ${1:-580} ))
while [ "$(date +%s)" -lt "$end" ]; do
  ssh -o BatchMode=yes -o ConnectTimeout=10 cua-171-arm64 true 2>/dev/null && { echo "ssh back at $(date -u +%FT%TZ)"; exit 0; }
  sleep 60
done
echo "ssh still refused at $(date -u +%FT%TZ)"; exit 1
