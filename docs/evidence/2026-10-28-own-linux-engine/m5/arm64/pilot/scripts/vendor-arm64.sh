#!/bin/bash
# Task 96 (T6 arm64, pre-flight §7.2 item 9, C12; T5's verify-third.sh for the method): the vendor's arm64 packages
# beyond the pin, fetched, checked by their own signatures against the vendor key, and extracted.
#   26.1023.51421 arm64: the spec's newest build, the gate's NEWEST (gate.mjs defaultsFor: vendor/deb-26.1023/extracted).
#     The current index lists only 26.1111.21308 (C12), so its check is the deb's own _gpgorigin; and the signed
#     InRelease of 2026-10-27 kept from the x64 fetch (vendor/index/InRelease) names the arm64 Packages hash of its day,
#     which is fetched by that hash if the repository serves it.
#   26.1111.21308 arm64: the third build (F3's unjudged pass), checked as T5 checked the amd64 one: gpgv over today's
#     InRelease, its arm64 Packages' hash in it, the deb's hash in Packages, and the deb's _gpgorigin.
# Negative controls for each: InRelease with one byte changed; the deb check without debian-binary.
set -u
FPR=3BFA0E4AE8B8CC16A2D9BA684A3B4A566C4660E4
BASE=https://persistent.oaistatic.com/codex-app-prod/linux/deb
VD=/Users/new/.local/share/cua-171/vendor
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
export GNUPGHOME=$W/gnupg; mkdir -m 700 "$GNUPGHOME"
echo "== $(date -u +%FT%TZ) vendor-arm64.sh on $(hostname) ($(uname -m))"
curl -fsS "https://keyserver.ubuntu.com/pks/lookup?op=get&options=mr&search=0x$FPR" -o "$W/key.asc" || { echo "key fetch failed"; exit 2; }
gpg --batch --quiet --import "$W/key.asc" 2>&1 | tail -2
echo "== keys in the throwaway keyring:"; gpg --batch --with-colons --fingerprint | awk -F: '$1=="fpr"{print "fpr", $10} $1=="uid"{print "uid", $10}'
got=$(gpg --batch --with-colons --fingerprint | awk -F: '$1=="fpr"{print $10; exit}')
[ "$got" = "$FPR" ] && echo "primary fingerprint equals the pins' record" || { echo "fingerprint DIFFERS: $got"; exit 1; }
gpg --batch --export "$FPR" > "$W/key.gpg"

fetch() { # fetch <url> <file>
  [ -s "$2" ] && { echo "   have $(basename "$2") ($(stat -c %s "$2") bytes)"; return 0; }
  curl -fL --retry 3 -sS -o "$2.part" "$1" && mv "$2.part" "$2" && echo "   fetched $1 ($(stat -c %s "$2") bytes)"
}
inrelease() { # inrelease <file>: gpgv, then a one-byte-changed control
  gpgv --keyring "$W/key.gpg" "$1" 2>&1 | sed 's/^/   /'; local r=${PIPESTATUS[0]}; echo "   gpgv exit $r"
  sed '0,/^Date:/s/^Date: ./Date: X/' "$1" > "$W/InRelease.bad"
  gpgv --keyring "$W/key.gpg" "$W/InRelease.bad" > /dev/null 2>&1; echo "   control (one byte changed): gpgv exit $? (nonzero expected)"
  return "$r"
}
gpgorigin() { # gpgorigin <deb>: the _gpgorigin over the other members in archive order, and the control
  local deb=$1 members r
  echo "   ar members: $(ar t "$deb" | tr '\n' ' ')"
  ar p "$deb" _gpgorigin > "$W/_gpgorigin"
  members=$(ar t "$deb" | grep -v '^_gpgorigin$')
  for m in $members; do ar p "$deb" "$m"; done | gpg --batch --status-fd 1 --verify "$W/_gpgorigin" - 2>/dev/null | grep -E "GOODSIG|VALIDSIG|BADSIG|ERRSIG" | cut -c1-120 | sed 's/^/   /'
  r=${PIPESTATUS[1]}
  for m in $members; do [ "$m" = debian-binary ] || ar p "$deb" "$m"; done | gpg --batch --status-fd 1 --verify "$W/_gpgorigin" - 2>/dev/null | grep -E "GOODSIG|BADSIG" | cut -c1-80 | sed 's/^/   control (without debian-binary): /'
  echo "   _gpgorigin gpg exit $r"
  return "$r"
}
extract() { # extract <deb> <dir>: the package's files, and its sky_linux_arm64
  local deb=$1 dir=$2
  if [ ! -d "$dir/usr" ]; then rm -rf "$dir.part"; mkdir -p "$dir.part" && dpkg-deb -x "$deb" "$dir.part" && mv "$dir.part" "$dir"; fi
  local sky=$dir/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
  echo "   control: $(dpkg-deb -f "$deb" Package Version Architecture | tr '\n' ' ')"
  ls -l "$sky" | sed 's/^/   /'; sha256sum "$sky" | sed 's/^/   /'; file -b "$sky" | cut -c1-120 | sed 's/^/   /'
}

echo; echo "#### 26.1023.51421 arm64 (NEWEST)"
D=$VD/deb-26.1023; mkdir -p "$D/index"
fetch "$BASE/pool/main/c/chatgpt/chatgpt_26.1023.51421_arm64.deb" "$D/chatgpt_26.1023.51421_arm64.deb" || { echo "fetch failed"; exit 2; }
DEB=$D/chatgpt_26.1023.51421_arm64.deb
echo "   deb sha256 $(sha256sum "$DEB" | cut -d' ' -f1), $(stat -c %s "$DEB") bytes (pre-flight §0: 494,741,274)"
echo "== the 2026-10-27 InRelease (kept from the x64 fetch, vendor/index/InRelease)"
cp /Users/new/.local/share/cua-171/task96/vendor-index-2026-10-27-InRelease "$D/index/InRelease.2026-10-27" 2>/dev/null
r0=1; [ -s "$D/index/InRelease.2026-10-27" ] && { inrelease "$D/index/InRelease.2026-10-27"; r0=$?; }
P64=$(awk '/^SHA256:/{s=1;next} /^[A-Z]/{s=0} s && $3=="main/binary-arm64/Packages"{print $1}' "$D/index/InRelease.2026-10-27" 2>/dev/null)
echo "   its arm64 Packages sha256: ${P64:-none}"
byhash=no
if [ -n "$P64" ] && curl -fsS -o "$D/index/Packages-arm64.2026-10-27" "$BASE/dists/stable/main/binary-arm64/by-hash/SHA256/$P64" 2>/dev/null; then
  got=$(sha256sum "$D/index/Packages-arm64.2026-10-27" | cut -d' ' -f1)
  echo "   by-hash Packages fetched: sha256 $got ($([ "$got" = "$P64" ] && echo equals || echo DIFFERS) InRelease's)"
  echo "   deb's sha256 in it: $(grep -c "^SHA256: $(sha256sum "$DEB" | cut -d' ' -f1)$" "$D/index/Packages-arm64.2026-10-27")"
  [ "$got" = "$P64" ] && byhash=yes
else
  rm -f "$D/index/Packages-arm64.2026-10-27"; echo "   the repository does not serve that Packages by hash: the index chain cannot reach this deb (C12)"
fi
echo "== the deb's own _gpgorigin"
gpgorigin "$DEB"; r1=$?
[ "$r1" = 0 ] && extract "$DEB" "$D/extracted"

echo; echo "#### 26.1111.21308 arm64 (the third build, F3)"
D=$VD/deb-26.1111; mkdir -p "$D/index"
fetch "$BASE/dists/stable/InRelease" "$D/index/InRelease" || exit 2
fetch "$BASE/dists/stable/main/binary-arm64/Packages" "$D/index/Packages-arm64" || exit 2
echo "== gpgv over today's InRelease"
inrelease "$D/index/InRelease"; r2=$?
grep -E '^(Date|Architectures):' "$D/index/InRelease" | sed 's/^/   /'
ph=$(sha256sum "$D/index/Packages-arm64" | cut -d' ' -f1)
echo "   arm64 Packages sha256 $ph; in InRelease: $(grep -c "$ph .*main/binary-arm64/Packages$" "$D/index/InRelease")"
grep -E '^(Version|Architecture|Filename|Size|SHA256):' "$D/index/Packages-arm64" | sed 's/^/   /'
fn=$(awk '/^Filename:/{print $2; exit}' "$D/index/Packages-arm64")
fetch "$BASE/$fn" "$D/$(basename "$fn")" || exit 2
DEB=$D/$(basename "$fn")
dh=$(sha256sum "$DEB" | cut -d' ' -f1)
echo "   deb sha256 $dh; in Packages: $(grep -c "^SHA256: $dh$" "$D/index/Packages-arm64")"
echo "== the deb's own _gpgorigin"
gpgorigin "$DEB"; r3=$?
[ "$r3" = 0 ] && extract "$DEB" "$D/extracted"

echo; echo "== results: 26.1023 old InRelease gpgv $r0, by-hash chain $byhash, _gpgorigin $r1; 26.1111 InRelease gpgv $r2, _gpgorigin $r3"
[ "$r1" = 0 ] && [ "$r2" = 0 ] && [ "$r3" = 0 ]
