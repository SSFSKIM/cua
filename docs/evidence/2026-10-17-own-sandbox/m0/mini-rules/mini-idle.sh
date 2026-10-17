#!/bin/sh
# The mini's CI idle check (the own-sandbox spec's Decision Log, "native runs on the mini"): the mac lane's runner
# (ci-kit-mac-mini, registered to SSFSKIM/MAWS) is not running a job and no MAWS job waiting for a macOS runner is
# queued, and Terminal is the frontmost application (a dialog left up makes every mac CI job fail at once, so the
# runner alone can read idle under it). Looks twice, 45 s apart; prints one line per look and exits 0 only when both
# looks are idle.
look() {
  busy=$(gh api repos/SSFSKIM/MAWS/actions/runners --jq '[.runners[] | select(.name == "ci-kit-mac-mini") | .busy] | first') || return 2
  worker=$(ssh -o BatchMode=yes mini 'pgrep -f actions-runner-maws/bin/Runner.Worker | wc -l | tr -d " "') || return 2
  queued=0
  for run in $(gh api 'repos/SSFSKIM/MAWS/actions/runs?status=queued&per_page=50' --jq '.workflow_runs[].id') $(gh api 'repos/SSFSKIM/MAWS/actions/runs?status=in_progress&per_page=50' --jq '.workflow_runs[].id'); do
    n=$(gh api "repos/SSFSKIM/MAWS/actions/runs/$run/jobs?per_page=100" --jq '[.jobs[] | select(.status == "queued" or .status == "waiting" or .status == "pending") | select(.labels | index("macOS") or index("ci-kit-mac"))] | length') || return 2
    queued=$((queued + n))
  done
  front=$(ssh -o BatchMode=yes mini 'lsappinfo info -only bundleid "$(lsappinfo front)"' | sed -n 's/.*bundleID="\(.*\)".*/\1/p')
  echo "$(date -u +%FT%TZ) runner busy=$busy worker=$worker queued-macOS-jobs=$queued front=${front:-unknown}"
  [ "$busy" = false ] && [ "$worker" = 0 ] && [ "$queued" = 0 ] && [ "$front" = com.apple.Terminal ]
}
look || exit 1
sleep 45
look || exit 1
