#!/bin/bash
# Task 96: one vendor arm64 package from the pool by its version, checked by its own _gpgorigin against the vendor key
# (C12's method, as vendor-arm64.sh), with the control, then extracted. Used for 26.1111.21308, F3's third build, which
# today's index no longer lists (it lists 26.1111.71025, signed 2026-11-17).
# usage: vendor-one.sh <version> <dir>
set -u
VER=$1; DIR=$2
FPR=3BFA0E4AE8B8CC16A2D9BA684A3B4A566C4660E4
BASE=https://persistent.oaistatic.com/codex-app-prod/linux/deb
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
export GNUPGHOME=$W/gnupg; mkdir -m 700 "$GNUPGHOME"
echo "== $(date -u +%FT%TZ) vendor-one.sh $VER arm64 on $(hostname)"
curl -fsS "https://keyserver.ubuntu.com/pks/lookup?op=get&options=mr&search=0x$FPR" -o "$W/key.asc" || exit 2
gpg --batch --quiet --import "$W/key.asc" 2>/dev/null
got=$(gpg --batch --with-colons --fingerprint | awk -F: '$1=="fpr"{print $10; exit}')
[ "$got" = "$FPR" ] && echo "   key fingerprint equals the pins' record" || { echo "fingerprint DIFFERS: $got"; exit 1; }
mkdir -p "$DIR"
DEB=$DIR/chatgpt_${VER}_arm64.deb
[ -s "$DEB" ] || { curl -fL --retry 3 -sS -o "$DEB.part" "$BASE/pool/main/c/chatgpt/chatgpt_${VER}_arm64.deb" && mv "$DEB.part" "$DEB"; } || { echo "fetch failed"; exit 2; }
echo "   deb $(stat -c %s "$DEB") bytes, sha256 $(sha256sum "$DEB" | cut -d' ' -f1)"
echo "   ar members: $(ar t "$DEB" | tr '\n' ' ')"
ar p "$DEB" _gpgorigin > "$W/_gpgorigin"
members=$(ar t "$DEB" | grep -v '^_gpgorigin$')
for m in $members; do ar p "$DEB" "$m"; done | gpg --batch --status-fd 1 --verify "$W/_gpgorigin" - 2>/dev/null | grep -E "GOODSIG|VALIDSIG|BADSIG|ERRSIG" | cut -c1-120 | sed 's/^/   /'
r=${PIPESTATUS[1]}
for m in $members; do [ "$m" = debian-binary ] || ar p "$DEB" "$m"; done | gpg --batch --status-fd 1 --verify "$W/_gpgorigin" - 2>/dev/null | grep -E "GOODSIG|BADSIG" | cut -c1-80 | sed 's/^/   control (without debian-binary): /'
echo "   _gpgorigin gpg exit $r"
[ "$r" = 0 ] || exit 1
if [ ! -d "$DIR/extracted/usr" ]; then rm -rf "$DIR/extracted.part"; mkdir -p "$DIR/extracted.part" && dpkg-deb -x "$DEB" "$DIR/extracted.part" && mv "$DIR/extracted.part" "$DIR/extracted"; fi
sky=$DIR/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
echo "   control: $(dpkg-deb -f "$DEB" Package Version Architecture | tr '\n' ' ')"
ls -l "$sky" | sed 's/^/   /'; sha256sum "$sky" | sed 's/^/   /'
