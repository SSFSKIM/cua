#!/bin/sh
# The hosted sittings' device (#117 M5, T10b′): the runner reaches itself as `hosted-macos`
# (scripts/repl-parity/devices.mjs) over a user-mode sshd on loopback with the job's PATH, as
# scripts/repl-parity/hosted/hosted.sh sets it up for the parity gates. Run by scripts/hosted-sittings/setup.mjs.
# It edits ~/.ssh and starts an sshd, so it refuses anywhere but a throwaway GitHub-hosted macOS runner.
set -eu
[ "${RUNNER_ENVIRONMENT:-}" = github-hosted ] && [ "$(uname -s)" = Darwin ] || {
  echo "loopback.sh: refused: it runs only on a GitHub-hosted macOS runner (RUNNER_ENVIRONMENT=github-hosted)" >&2; exit 2; }
DEVICE=hosted-macos
SSHD=${RUNNER_TEMP:?}/hosted-sittings-sshd
mkdir -p "$SSHD" "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
ssh-keygen -q -t ed25519 -N '' -f "$SSHD/hostkey"
rm -f "$HOME/.ssh/hosted-sittings" "$HOME/.ssh/hosted-sittings.pub"
ssh-keygen -q -t ed25519 -N '' -f "$HOME/.ssh/hosted-sittings"
cat "$HOME/.ssh/hosted-sittings.pub" >> "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"
echo "PATH=$PATH" > "$HOME/.ssh/environment"
# The login shell is bash, which reads ~/.bashrc for a command sshd runs, and the image's ~/.bashrc puts Homebrew's node
# first; the job's PATH is restored last (hosted.sh's sshd_up has the history).
printf "export PATH='%s'\n" "$(printf '%s' "$PATH" | sed "s/'/'\\\\''/g")" >> "$HOME/.bashrc"
cat > "$SSHD/sshd_config" <<EOF
Port 2222
ListenAddress 127.0.0.1
HostKey $SSHD/hostkey
PidFile $SSHD/sshd.pid
AuthorizedKeysFile $HOME/.ssh/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
PermitUserEnvironment yes
EOF
cat >> "$HOME/.ssh/config" <<EOF
Host $DEVICE
  HostName 127.0.0.1
  Port 2222
  User $USER
  IdentityFile $HOME/.ssh/hosted-sittings
  IdentitiesOnly yes
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  LogLevel ERROR
EOF
/usr/sbin/sshd -f "$SSHD/sshd_config" -E "$SSHD/sshd.log"
sleep 1
