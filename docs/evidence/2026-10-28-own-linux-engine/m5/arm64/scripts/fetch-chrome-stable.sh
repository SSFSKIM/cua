#!/bin/bash
# Task 99 (T7 part 2, F2's unjudged pass): current stable Google Chrome for arm64, fetched from Google's repository and
# checked by its signed index, into a directory of its own (~/.local/share/cua-171/chrome-stable/<version>/), never
# installed: the judged Chrome 156 stays installed and held. Google's signing key is fetched into a throwaway keyring;
# gpgv checks InRelease (and fails it with one byte changed, the control); the arm64 Packages' sha256 must be in
# InRelease; the deb's sha256 must be in Packages. Extraction is extract-chrome-stable.sh's, under the lock.
set -euo pipefail
B=https://dl.google.com/linux/chrome/deb
W=/Users/new/.local/share/cua-171/chrome-stable
mkdir -p "$W/index"
cd "$W/index"
G=$(mktemp -d)
trap 'rm -rf "$G"' EXIT
echo "== $(date -u +%FT%TZ) fetch"
curl -fsS -o linux_signing_key.pub https://dl.google.com/linux/linux_signing_key.pub
gpg --homedir "$G" --quiet --import linux_signing_key.pub 2>&1 | tail -2 || true
gpg --homedir "$G" --fingerprint 2>/dev/null | grep -E '^ +[0-9A-F ]{40,}' | sed 's/^ */key fingerprint: /'
gpg --homedir "$G" --export > "$G/keyring.gpg"
curl -fsS -o InRelease "$B/dists/stable/InRelease"
gpgv --keyring "$G/keyring.gpg" InRelease 2>&1 | sed 's/^/gpgv: /'; echo "gpgv exit ${PIPESTATUS[0]}"
cp InRelease "$G/bad"; printf 'X' | dd of="$G/bad" bs=1 seek=200 conv=notrunc status=none
if gpgv --keyring "$G/keyring.gpg" "$G/bad" > /dev/null 2>&1; then echo "control: one byte changed still verifies: FAIL"; exit 1; else echo "control: one byte changed fails gpgv, as it must"; fi
curl -fsS -o Packages "$B/dists/stable/main/binary-arm64/Packages"
ps=$(sha256sum Packages | cut -d' ' -f1)
grep -q " $ps .*main/binary-arm64/Packages$" InRelease && echo "Packages sha256 $ps is in InRelease" || { echo "Packages sha256 $ps NOT in InRelease"; exit 1; }
awk '/^Package: google-chrome-stable$/{f=1} f&&/^$/{exit} f' Packages > stable.txt
cat stable.txt | grep -E '^(Version|Architecture|Filename|SHA256|Size):'
V=$(awk '/^Version:/{print $2}' stable.txt); F=$(awk '/^Filename:/{print $2}' stable.txt); S=$(awk '/^SHA256:/{print $2}' stable.txt)
mkdir -p "$W/$V"
curl -fsS -o "$W/$V/chrome.deb" "https://dl.google.com/linux/chrome/deb/$F"
d=$(sha256sum "$W/$V/chrome.deb" | cut -d' ' -f1)
[ "$d" = "$S" ] && echo "deb sha256 $d equals Packages'" || { echo "deb sha256 $d differs from Packages' $S"; exit 1; }
echo "$V" > "$W/current"
echo "== done: $V"
