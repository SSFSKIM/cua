#!/bin/bash
# Task 96 (T6 arm64, pre-flight §7.2 items 6, 7 and 10): the user's half of the arm64 VM's install, as `new`.
#   6. Mozilla's Firefox 159.0~build1 arm64 deb, checked through Mozilla's signed apt index, unpacked as task 59 did on
#      x64 (task59/firefox-deb/root, task59/bin/firefox first on PATH), never the snap.
#   7. Rust 1.94.1 through rustup (minimal profile), for xprobe only; the cargo-under-the-lock wrapper (bin/cargo).
#  10. the run's plumbing: the ssh alias cua-171-arm64 reaching the VM itself (a key of its own in authorized_keys2,
#      which devcloud does not rewrite), and the parity clone ~/Developer/GitHub/cua-parity with the tag
#      linux-engine-v0.4.0. gh is already signed in (checked, not printed).
set -u
D=/Users/new/.local/share/cua-171
log() { echo "== $(date -u +%FT%TZ) $*"; }

log "6. Firefox 159.0~build1 arm64 (Mozilla's deb)"
MOZ=https://packages.mozilla.org/apt
MFPR=35BAA0B33E9EB396F59CA838C0BA5CE6DC6315A3
F=$D/task59/firefox-deb; mkdir -p "$F/index" "$D/task59/bin"
W=$(mktemp -d); export GNUPGHOME=$W/gnupg; mkdir -m 700 "$GNUPGHOME"
curl -fsS "$MOZ/repo-signing-key.gpg" -o "$W/moz.asc" && gpg --batch --quiet --import "$W/moz.asc"
gpg --batch --with-colons --fingerprint | awk -F: '$1=="fpr"{print "   fpr", $10} $1=="uid"{print "   uid", $10}'
gpg --batch --export "$MFPR" > "$W/moz.gpg"
curl -fsS "$MOZ/dists/mozilla/InRelease" -o "$F/index/InRelease"
gpgv --keyring "$W/moz.gpg" "$F/index/InRelease" 2>&1 | sed 's/^/   /'; echo "   gpgv exit ${PIPESTATUS[0]}"
curl -fsS "$MOZ/dists/mozilla/main/binary-arm64/Packages" -o "$F/index/Packages-arm64"
ph=$(sha256sum "$F/index/Packages-arm64" | cut -d' ' -f1)
echo "   arm64 Packages sha256 $ph; in InRelease: $(grep -c "$ph .*main/binary-arm64/Packages$" "$F/index/InRelease")"
entry=$(awk -v RS= '/(^|\n)Package: firefox\n/ && /\nVersion: 159.0~build1\n/ && /\nArchitecture: arm64\n/' "$F/index/Packages-arm64")
echo "$entry" | grep -E '^(Package|Version|Architecture|Filename|Size|SHA256):' | sed 's/^/   /'
fn=$(echo "$entry" | awk '/^Filename:/{print $2}'); want=$(echo "$entry" | awk '/^SHA256:/{print $2}')
deb=$F/$(basename "$fn")
[ -s "$deb" ] || curl -fL --retry 3 -sS -o "$deb" "$MOZ/$fn"
got=$(sha256sum "$deb" | cut -d' ' -f1)
echo "   deb sha256 $got: $([ "$got" = "$want" ] && echo equals the index || echo DIFFERS from the index $want)"
rm -rf "$W"
if [ "$got" = "$want" ]; then
  [ -d "$F/root/usr" ] || dpkg-deb -x "$deb" "$F/root"
  ln -sfn "$F/root/usr/lib/firefox/firefox" "$D/task59/bin/firefox"
  ls -l "$D/task59/bin/firefox" | sed 's/^/   /'
  "$D/task59/bin/firefox" --version 2>&1 | sed 's/^/   /'
fi

log "7. Rust 1.94.1 (rustup), for xprobe"
if [ ! -x "$HOME/.cargo/bin/cargo" ]; then
  curl -fsS --proto '=https' --tlsv1.2 https://sh.rustup.rs -o /tmp/rustup-init.sh
  sh /tmp/rustup-init.sh -y --no-modify-path --profile minimal --default-toolchain 1.94.1 2>&1 | tail -3
  rm -f /tmp/rustup-init.sh
fi
"$HOME/.cargo/bin/rustc" --version; "$HOME/.cargo/bin/cargo" --version
cat > "$D/bin/cargo" <<'WRAP'
#!/bin/bash
# cargo under the host-wide lock (the design session, 2026-11-11; copied to the arm64 VM by task 96): every cargo
# invocation waits for the lock. The holder is CUA_LOCK_HOLDER when set, otherwise "cargo".
# inside a locked step already (locked.sh sets CUA_LOCK_HELD), run cargo directly: a second lock would deadlock
[ -n "${CUA_LOCK_HELD:-}" ] && exec /Users/new/.cargo/bin/cargo "$@"
exec /Users/new/.local/share/cua-171/locked.sh "${CUA_LOCK_HOLDER:-cargo}" /Users/new/.cargo/bin/cargo "$@"
WRAP
chmod +x "$D/bin/cargo"

log "10. the ssh alias cua-171-arm64 (the VM reaching itself)"
K=$HOME/.ssh/cua-171-arm64_ed25519
[ -f "$K" ] || ssh-keygen -q -t ed25519 -N '' -C cua-171-arm64 -f "$K"
grep -qF "$(cut -d' ' -f2 "$K.pub")" "$HOME/.ssh/authorized_keys2" 2>/dev/null || cat "$K.pub" >> "$HOME/.ssh/authorized_keys2"
chmod 600 "$HOME/.ssh/authorized_keys2"
grep -q '^Host cua-171-arm64$' "$HOME/.ssh/config" 2>/dev/null || printf 'Host cua-171-arm64\n    HostName 127.0.0.1\n    User %s\n    IdentityFile %s\n    IdentitiesOnly yes\n' "$(id -un)" "$K" >> "$HOME/.ssh/config"
chmod 600 "$HOME/.ssh/config"
grep -q '^127.0.0.1 ssh-ed25519' "$HOME/.ssh/known_hosts" 2>/dev/null || ssh-keyscan -t ed25519 127.0.0.1 2>/dev/null >> "$HOME/.ssh/known_hosts"
ssh -o BatchMode=yes cua-171-arm64 'echo "   alias reaches $(hostname) as $(id -un)"'; echo "   ssh exit $?"

log "10. the parity clone and its tag"
P=$HOME/Developer/GitHub/cua-parity
[ -d "$P/.git" ] || git clone -q https://github.com/SSFSKIM/cua "$P"
git -C "$P" fetch -q origin tag linux-engine-v0.4.0 --no-tags
echo "   parity clone HEAD $(git -C "$P" rev-parse HEAD); tag linux-engine-v0.4.0 -> $(git -C "$P" rev-parse 'linux-engine-v0.4.0^{commit}')"
gh auth status > /dev/null 2>&1; echo "   gh auth status exit $?"
log "install-user done"
