#!/bin/bash
# task 80, step 2: both published assets downloaded into a new empty directory, their sha256 against the gated build-only
# artifact's, file, --version, and the attestation of each (JSON form).
set -uo pipefail
T=/Users/new/.local/share/cua-171/task80
D=$T/released-v0.4.0
GATED_X64=751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca
BUILD_ONLY_ARM64=0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42
if [ -e "$D" ]; then echo "$D exists: not reusing it" >&2; exit 2; fi
mkdir -m 700 "$D"
gh release view linux-engine-v0.4.0 --repo SSFSKIM/cua --json tagName,targetCommitish,publishedAt,isDraft,isPrerelease,assets > "$T/release-view.json"
echo "release view exit $?"
gh release download linux-engine-v0.4.0 --repo SSFSKIM/cua --dir "$D"
echo "download exit $?"
ls -l "$D"
X=$D/cua-engine-0.4.0-linux-x64
A=$D/cua-engine-0.4.0-linux-arm64
x=$(sha256sum "$X" | cut -d' ' -f1)
a=$(sha256sum "$A" | cut -d' ' -f1)
echo "x64   sha256 $x"
echo "gated x64    $GATED_X64"
if [ "$x" = "$GATED_X64" ]; then echo "x64: EQUAL to the gated artifact"; else echo "x64: DIFFERS from the gated artifact"; fi
echo "arm64 sha256 $a"
echo "build-only arm64 subject $BUILD_ONLY_ARM64"
if [ "$a" = "$BUILD_ONLY_ARM64" ]; then echo "arm64: EQUAL to the build-only run's"; else echo "arm64: DIFFERS from the build-only run's"; fi
echo "== sums files"
for f in "$D"/*; do case "$f" in *SHA256*|*.sha256) echo "-- $(basename "$f")"; cat "$f";; esac; done
file "$X" "$A"
chmod 700 "$X"
"$X" --version
echo "version exit $?"
for f in "$X" "$A"; do
  n=$(basename "$f")
  gh attestation verify "$f" --repo SSFSKIM/cua --signer-workflow SSFSKIM/cua/.github/workflows/linux-engine.yml --deny-self-hosted-runners --format json > "$T/attestation-$n.json" 2> "$T/attestation-$n.err"
  echo "attestation $n exit $?"
done
