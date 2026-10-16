#!/bin/bash
# Idle gate for the M5 MAWS live probe: no Runner.Worker for either runner, nothing queued or in progress on SSFSKIM/MAWS.
export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:$PATH
label=${1:-check}
workers=$(ps -axww -o pid=,command= | grep -E 'actions-runner-(maws|ida-solution)/.*Runner\.Worker' | grep -v grep)
queued=$(gh -R SSFSKIM/MAWS run list --status queued --json databaseId --jq 'length')
inprog=$(gh -R SSFSKIM/MAWS run list --status in_progress --json databaseId --jq 'length')
echo "$(date -u +%FT%TZ) $label workers=$( [ -z "$workers" ] && echo 0 || echo "$workers" | wc -l | tr -d ' ') queued=$queued in_progress=$inprog load=\"$(uptime | sed 's/.*load averages*: //')\""
[ -z "$workers" ] && [ "$queued" = 0 ] && [ "$inprog" = 0 ]
