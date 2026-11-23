#!/bin/bash
# Task 89 (F3's condition, the controller's word): the vendor's third build, 26.1111.21308 amd64, checked by signature
# before it runs on :0. The vendor key by its fingerprint, as the pins' notes record it (3BFA0E4AE8B8CC16A2D9BA684A3B4A566C4660E4,
# "Codex Linux Repository"), fetched from keyserver.ubuntu.com into a throwaway keyring; then:
#   1. gpgv over dists/stable/InRelease (the Packages index's hash is in it; the deb's is in Packages);
#   2. the deb's own _gpgorigin over its other ar members in archive order, as the pins' notes ran it;
#   3. a negative control for each: InRelease with one byte changed, and the deb check without debian-binary.
set -u
FPR=3BFA0E4AE8B8CC16A2D9BA684A3B4A566C4660E4
V=/Users/new/.local/share/cua-171/vendor/deb-26.1111
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
export GNUPGHOME=$W/gnupg; mkdir -m 700 "$GNUPGHOME"
curl -fsS "https://keyserver.ubuntu.com/pks/lookup?op=get&options=mr&search=0x$FPR" -o "$W/key.asc" || { echo "key fetch failed"; exit 2; }
gpg --batch --quiet --import "$W/key.asc" 2>&1 | tail -2
echo "== keys in the throwaway keyring:"; gpg --batch --with-colons --fingerprint | awk -F: '$1=="fpr"{print "fpr", $10} $1=="uid"{print "uid", $10}'
got=$(gpg --batch --with-colons --fingerprint | awk -F: '$1=="fpr"{print $10; exit}')
[ "$got" = "$FPR" ] && echo "primary fingerprint equals the pins' record" || { echo "fingerprint DIFFERS: $got"; exit 1; }
gpg --batch --export "$FPR" > "$W/key.gpg"
echo "== 1. gpgv InRelease"; gpgv --keyring "$W/key.gpg" "$V/index/InRelease" 2>&1; r1=$?; echo "gpgv exit $r1"
echo "   Packages sha256 $(sha256sum "$V/index/Packages" | cut -d' ' -f1); in InRelease: $(grep -c "$(sha256sum "$V/index/Packages" | cut -d' ' -f1) .*main/binary-amd64/Packages$" "$V/index/InRelease")"
echo "   deb sha256 $(sha256sum "$V/chatgpt.deb" | cut -d' ' -f1); in Packages: $(grep -c "^SHA256: $(sha256sum "$V/chatgpt.deb" | cut -d' ' -f1)$" "$V/index/Packages")"
sed '0,/^Date:/s/^Date: ./Date: X/' "$V/index/InRelease" > "$W/InRelease.bad"
gpgv --keyring "$W/key.gpg" "$W/InRelease.bad" > /dev/null 2>&1; echo "   control (one byte changed): gpgv exit $? (nonzero expected)"
echo "== 2. the deb's _gpgorigin"
cd "$W"; echo "   ar members: $(ar t "$V/chatgpt.deb" | tr '\n' ' ')"
ar p "$V/chatgpt.deb" _gpgorigin > _gpgorigin
members=$(ar t "$V/chatgpt.deb" | grep -v '^_gpgorigin$')
for m in $members; do ar p "$V/chatgpt.deb" "$m"; done | gpg --batch --status-fd 1 --verify _gpgorigin - 2>/dev/null | grep -E "GOODSIG|VALIDSIG|BADSIG|ERRSIG" | cut -c1-120
r2=${PIPESTATUS[1]}
for m in $members; do [ "$m" = debian-binary ] || ar p "$V/chatgpt.deb" "$m"; done | gpg --batch --status-fd 1 --verify _gpgorigin - 2>/dev/null | grep -E "GOODSIG|BADSIG" | cut -c1-80 | sed 's/^/   control (without debian-binary): /'
echo "== results: InRelease gpgv $r1; deb signature gpg $r2"
[ "$r1" = 0 ] && [ "$r2" = 0 ]
