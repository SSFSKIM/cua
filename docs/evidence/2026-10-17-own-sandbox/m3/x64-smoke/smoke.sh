#!/bin/bash
# #115 M3: the x64 helper's smoke on a throwaway x64 Ubuntu 24.04 instance. Every line it reports starts with M3SMOKE.
set -u
say() { echo "M3SMOKE $*"; }
say "start $(date -u +%FT%TZ) $(uname -m) $(. /etc/os-release; echo "$PRETTY_NAME") kernel $(uname -r)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq bubblewrap curl >/dev/null 2>&1
say "bwrap $(bwrap --version 2>&1)"
sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 >/dev/null 2>&1
id smoke >/dev/null 2>&1 || useradd -m smoke
URL="https://github.com/SSFSKIM/cua/releases/download/linux-sandbox-rust-v0.163.0/codex-linux-sandbox-x86_64-unknown-linux-musl"
PIN="da88ac0975a1138b0c90d7cecdf6d30de26e9fc36296d4d537bb9cf1cdb0f344"
H=/home/smoke/cua/sandbox/rust-v0.163.0
mkdir -p $H && curl -fsSL "$URL" -o $H/codex-linux-sandbox && chmod 755 $H/codex-linux-sandbox && chown -R smoke:smoke /home/smoke/cua
GOT=$(sha256sum $H/codex-linux-sandbox | cut -d' ' -f1)
say "sha256 $GOT pinned $PIN $([ "$GOT" = "$PIN" ] && echo MATCH || echo MISMATCH)"
say "file $(file -b $H/codex-linux-sandbox 2>/dev/null | cut -c1-80)"
cat > /home/smoke/run.sh <<'INNER'
#!/bin/bash
H=/home/smoke/cua/sandbox/rust-v0.163.0/codex-linux-sandbox
RUN=/home/smoke/cua/run/s1; DENY=/home/smoke/cua/state; OTHER=/home/smoke/cua/run/other
mkdir -p $RUN/tmp $DENY $OTHER; echo secret > $DENY/secret; echo other > $OTHER/file
prof() { # $1 network, $2 extra entries
  echo "{\"type\":\"managed\",\"network\":\"$1\",\"file_system\":{\"type\":\"restricted\",\"entries\":[{\"path\":{\"type\":\"special\",\"value\":{\"kind\":\"root\"}},\"access\":\"read\"},{\"path\":{\"type\":\"special\",\"value\":{\"kind\":\"project_roots\"}},\"access\":\"write\"},{\"path\":{\"type\":\"special\",\"value\":{\"kind\":\"tmpdir\"}},\"access\":\"write\"}$2]}}"
}
DENIES=",{\"path\":{\"type\":\"path\",\"path\":\"$DENY\"},\"access\":\"none\"},{\"path\":{\"type\":\"path\",\"path\":\"/home/smoke/cua/run\"},\"access\":\"none\"},{\"path\":{\"type\":\"path\",\"path\":\"$RUN\"},\"access\":\"read\"},{\"path\":{\"type\":\"path\",\"path\":\"$RUN/tmp\"},\"access\":\"read\"}"
CHECK='cd "$1"; r() { if eval "$1" >/dev/null 2>&1; then echo "$2 ok"; else echo "$2 refused"; fi; }
r "touch $1/w" "write-run-dir"; r "touch $1/tmp/w" "write-session-tmp"; r "touch /etc/cua-smoke" "write-etc"; r "touch /home/smoke/w" "write-home"
r "cat $2/secret" "read-denied-state"; r "ls $2" "list-denied-state"; r "cat $3/file" "read-other-run"; r "ln $2/secret $1/linked" "link-denied"
r "exec 3<>/dev/tcp/1.1.1.1/53" "tcp-connect"'
cd $RUN
for net in restricted enabled; do
  out=$(PATH=/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=$RUN/tmp $H --sandbox-policy-cwd $RUN --command-cwd $RUN --permission-profile "$(prof $net "$DENIES")" -- /bin/bash -c "$CHECK" smoke $RUN $DENY $OTHER 2>&1; echo "exit=$?")
  echo "$out" | sed "s/^/network-$net /"
done
INNER
chmod 755 /home/smoke/run.sh
su - smoke -c /home/smoke/run.sh 2>&1 | while read -r line; do say "$line"; done
say "done $(date -u +%FT%TZ)"
