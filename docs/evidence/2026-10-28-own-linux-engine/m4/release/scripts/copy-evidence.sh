#!/bin/bash
# task 80: the release evidence into m4/release/ (the transcripts as checks.sh wrote them, the run home's path shown as
# <home>), then a token-shaped scan that prints file names only. Every home here was the run's, with an empty secret
# store, so no stored value can be in it; the scan is for token shapes.
set -u
T=/Users/new/.local/share/cua-171/task80
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/release
mkdir -p "$E/scripts" "$E/attestation"
for p in fresh accept device old; do mkdir -p "$E/$p"; cp "$T/out/$p"/* "$E/$p/"; done
sed "s#$T/homes/old#<home>#g" "$T/logs/old-install.out" > "$E/old/old-install.txt"
cp "$T/logs/verify.out" "$E/verify.txt"
cp "$T/release-view.json" "$E/release-view.json"
cp "$T/logs/pin.out" "$E/pin.txt"
cp "$T"/attestation-cua-engine-0.4.0-linux-*.json "$E/attestation/"
cp "$T/logs/attest-summary.out" "$E/attestation/summary.txt"
cp "$T"/{publish.sh,verify.sh,setup-release.sh,checks.sh,run-part.sh,first-request.mjs,attest-summary.mjs,copy-evidence.sh} "$E/scripts/"
cd "$E" || exit 2
PAT='ghp_[A-Za-z0-9]{20}|gho_[A-Za-z0-9]{20}|ghs_[A-Za-z0-9]{20}|github_pat_|PLAYWRIGHT_MCP_EXTENSION_TOKEN=[^ "]|BEGIN (RSA|EC|OPENSSH)? ?PRIVATE KEY|sk-[A-Za-z0-9_-]{20}|xox[abp]-[A-Za-z0-9-]{10}|AKIA[0-9A-Z]{16}'
r=$(grep -rIlE "$PAT" . | grep -v '^./scripts/copy-evidence.sh$')
echo "token-shaped hits: ${r:-none}"
echo "files: $(find . -type f | wc -l)"
