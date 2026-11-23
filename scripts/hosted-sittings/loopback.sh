#!/bin/sh
# The loopback device (#117 M5, T10b′; #159): the runner reaches itself as `hosted-macos`
# (scripts/repl-parity/devices.mjs) over a user-mode sshd on 127.0.0.1:2222 with the job's PATH. Run by
# scripts/hosted-sittings/setup.mjs and by scripts/repl-parity/hosted/hosted.sh.
#
# Every ssh to the device names the config written here (`ssh -F`, scripts/repl-parity/loopback-ssh.mjs), so no call
# reads the account's own ssh config, the system's or a default known_hosts: the alias is pinned to the endpoint,
# its host key to the sshd's own (HostKeyAlias, strict checking, its own known_hosts and no global one), and the
# identity to the key made here. The sshd's directory is LOOPBACK_SSHD_DIR (default under RUNNER_TEMP).
# It starts an sshd and writes ~/.ssh/environment and ~/.bashrc, so it refuses anywhere but a GitHub-hosted macOS runner.
set -eu
[ "${RUNNER_ENVIRONMENT:-}" = github-hosted ] && [ "$(uname -s)" = Darwin ] || {
  echo "loopback.sh: refused: it runs only on a GitHub-hosted macOS runner (RUNNER_ENVIRONMENT=github-hosted)" >&2; exit 2; }
DEVICE=hosted-macos
SSHD=${LOOPBACK_SSHD_DIR:-${RUNNER_TEMP:?}/hosted-sittings-sshd}
D=$HOME/.local/share/cua-hosted/ssh
mkdir -p "$SSHD" "$D" "$HOME/.ssh" && chmod 700 "$D" "$HOME/.ssh"
rm -f "$SSHD/hostkey" "$SSHD/hostkey.pub" "$D/id_ed25519" "$D/id_ed25519.pub"
ssh-keygen -q -t ed25519 -N '' -f "$SSHD/hostkey"
ssh-keygen -q -t ed25519 -N '' -f "$D/id_ed25519"
cp "$D/id_ed25519.pub" "$D/authorized_keys" && chmod 600 "$D/authorized_keys"
printf 'hosted-macos %s\n' "$(cat "$SSHD/hostkey.pub")" > "$D/known_hosts"
# sshd reads the environment of a session from ~/.ssh/environment only. The login shell is bash, which reads ~/.bashrc
# for a command sshd runs, and the image's ~/.bashrc puts Homebrew's node first; the job's PATH is restored last
# (hosted.sh's history). RUNNER_ENVIRONMENT goes with it (this script refused anywhere else above): the device's
# hosted-only uses check it themselves (the venue's reads, the frame probe's moves), and the mini's sshd never sets it.
echo "PATH=$PATH" > "$HOME/.ssh/environment"
echo "RUNNER_ENVIRONMENT=github-hosted" >> "$HOME/.ssh/environment"
printf "export PATH='%s'\n" "$(printf '%s' "$PATH" | sed "s/'/'\\\\''/g")" >> "$HOME/.bashrc"
cat > "$SSHD/sshd_config" <<EOF
Port 2222
ListenAddress 127.0.0.1
HostKey $SSHD/hostkey
PidFile $SSHD/sshd.pid
AuthorizedKeysFile $D/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
PermitUserEnvironment yes
EOF
cat > "$D/config" <<EOF
Host hosted-macos
  HostName 127.0.0.1
  Port 2222
  User $USER
  IdentityFile $D/id_ed25519
  IdentitiesOnly yes
  HostKeyAlias hosted-macos
  StrictHostKeyChecking yes
  UserKnownHostsFile $D/known_hosts
  GlobalKnownHostsFile /dev/null
  CheckHostIP no
  BatchMode yes
  LogLevel ERROR
EOF
/usr/sbin/sshd -f "$SSHD/sshd_config" -E "$SSHD/sshd.log"
sleep 1
ssh -F "$D/config" "$DEVICE" true
