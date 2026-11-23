#!/bin/sh
# The macOS default-selection mode's approved lane, the hosted+ witness of sitting E (#117 M5, T11a; the M4/M5
# pre-flight's §4 "M5: the default shown live", the cua row): on a GitHub-hosted runner, a disposable home under the
# runner's temp directory gets the run's own engine, built from this checkout and approved there, and
# scripts/accept/macos-default-selection.mjs --approved-home judges a default session on it: cua's engine on cua's own
# host, doctor's inspection of the approved bundle holding by its facts (this build, the socket's owner, the three
# grants, a clean launch; the ad-hoc signature's warning expected), beside the three fallback homes. ci-kit gate
# `default-selection-approved` (dispatch only). Prepared, not run: it needs M4's hosted bundle build and the hosted
# approval (TCC rows for cua Engine, the relaunch and the two-pass `cua engine approve`, in H0's order), which T10b′
# provides after M4 merges, given here as CUA_HOSTED_APPROVE, a command run with HOME set to the disposable home.
# Until then it refuses. No replayd store is written (ruling 1141); the approval's capture runs under the alert rule.
#
#   CUA_HOSTED_APPROVE='<command>' sh scripts/accept/macos-default-selection-hosted.sh
#
# The report: default-selection-approved-out/report.json. Exit 0 PASS, 1 FAIL, 2 refused.
set -eu
refuse() { echo "default-selection-approved: refused: $1" >&2; exit 2; }
[ "$(uname -s)" = Darwin ] || refuse "macOS only"
[ "${RUNNER_ENVIRONMENT:-}" = github-hosted ] || refuse "a GitHub-hosted runner only (RUNNER_ENVIRONMENT=github-hosted): doctor launches and stops the approved engine it reads"
[ -n "${RUNNER_TEMP:-}" ] || refuse "no RUNNER_TEMP"
[ -n "${CUA_HOSTED_APPROVE:-}" ] || refuse "CUA_HOSTED_APPROVE is unset: the hosted approval (T10b′, after M4's hosted bundle build) is not available yet"
R=$(cd "$(dirname "$0")/../.." && pwd -P)
cd "$R"
older=$(ls -d "${RUNNER_TOOL_CACHE:-/nonexistent}"/node/22.*/*/bin/node 2>/dev/null | tail -n 1)
[ -n "$older" ] || refuse "no Node 22 in the runner's tool cache"
# The disposable home, by its real path, removed at exit with the engine it ran stopped first.
H=$(mktemp -d "$RUNNER_TEMP/cua-approved-home.XXXXXX")
H=$(cd "$H" && pwd -P)
trap 'HOME="$H" node bin/cua.mjs engine stop > /dev/null 2>&1 || true; rm -rf "$H"' EXIT
# The run's own engine: built from this checkout, signed ad hoc (CI only), then approved in that home.
HOME="$H" node bin/cua.mjs engine build --sign adhoc --json > "$RUNNER_TEMP/default-selection-build.json"
HOME="$H" sh -c "$CUA_HOSTED_APPROVE"
node scripts/accept/macos-default-selection.mjs --older-node "$older" --approved-home "$H" --out default-selection-approved-out/report.json
