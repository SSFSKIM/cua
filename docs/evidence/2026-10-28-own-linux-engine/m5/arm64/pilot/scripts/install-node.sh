#!/bin/bash
# Task 96 (the controller's word): the run's own Node, 24.22.1 linux-arm64, so the harness matches the x64 run's
# /usr/bin/node 24.22.1, while the image's /usr/bin/node 26 stays for devcloud. The official tarball, checked against
# nodejs.org's SHASUMS256.txt (and that file's own signature, when a Node release key verifies it), into
# ~/.local/share/cua-171/node24. Every harness command runs with node24/bin first on PATH.
set -euo pipefail
V=v24.22.1
P=/Users/new/.local/share/cua-171/node24
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
cd "$W"
echo "== $(date -u +%FT%TZ) Node $V linux-arm64"
curl -fsS -O "https://nodejs.org/dist/$V/SHASUMS256.txt" -O "https://nodejs.org/dist/$V/SHASUMS256.txt.sig"
curl -fsS -O "https://nodejs.org/dist/$V/node-$V-linux-arm64.tar.xz"
grep " node-$V-linux-arm64.tar.xz\$" SHASUMS256.txt | tee want.txt
sha256sum -c want.txt
# the signature over SHASUMS256.txt, by the release keys nodejs/release-keys publishes (informational: the sha256 above is the gate)
export GNUPGHOME=$W/g; mkdir -m 700 "$GNUPGHOME"
if curl -fsS https://raw.githubusercontent.com/nodejs/release-keys/HEAD/gpg/pubring.kbx -o "$W/pubring.kbx"; then
  gpgv --keyring "$W/pubring.kbx" SHASUMS256.txt.sig SHASUMS256.txt 2>&1 | sed 's/^/   /' || echo "   gpgv nonzero"
fi
rm -rf "$P.part"; mkdir -p "$P.part"
tar -xJf "node-$V-linux-arm64.tar.xz" -C "$P.part" --strip-components=1
rm -rf "$P"; mv "$P.part" "$P"
PATH=$P/bin:$PATH
echo "which node: $(command -v node); node --version: $(node --version); npm $(npm --version)"
file -b "$P/bin/node" | cut -c1-100
