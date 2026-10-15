#!/bin/zsh
# Throwaway probe: how often a sandboxed Node's first local-time use blocks, by Node binary and environment.
# Usage: tzprobe.sh <node> <envmode: bare|vendorlike> <n>
NODE=$1 MODE=$2 N=$3 JS=$4
CODEX="$HOME/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/CodexCLI.app/Contents/MacOS/codex"
W=$(mktemp -d /tmp/cua-tzprobe.XXXXXX)
POLICY="permissions.node_repl={filesystem = {\"$(dirname $NODE)\" = \"read\", \":root\" = \"read\", \":tmpdir\" = \"write\", \":workspace_roots\" = {\".\" = \"write\"}}, network = {enabled = false}}"
hung=0
for i in $(seq 1 $N); do
  if [ $MODE = bare ]; then E=(env -i HOME=$HOME PATH=/usr/bin:/bin TMPDIR=$W CODEX_HOME=$W)
  else E=(env -i HOME=$HOME PATH=/usr/bin:/bin TMPDIR=$W CODEX_HOME=$W LANG=ko_KR.UTF-8 __CF_USER_TEXT_ENCODING=0x1F5:0x3:0x33); fi
  ( cd $W && $E "$CODEX" sandbox -c 'shell_environment_policy.inherit="all"' -c 'default_permissions="node_repl"' -c "$POLICY" -- "$NODE" -e "$JS" "tzprobe-$W" > $W/out-$i 2>&1 ) &
  p=$!
  for k in $(seq 1 80); do kill -0 $p 2>/dev/null || break; sleep 0.1; done
  if kill -0 $p 2>/dev/null; then hung=$((hung+1)); pkill -9 -P $p 2>/dev/null; kill -9 $p 2>/dev/null; pkill -9 -f "tzprobe-$W" 2>/dev/null; fi
  wait $p 2>/dev/null
done
pkill -9 -f "$W" 2>/dev/null
echo "$(basename $(dirname $(dirname $NODE)))/$($NODE --version) $MODE: $hung of $N blocked (8s)"
rm -rf $W
