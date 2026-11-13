#!/bin/bash
# Task 76: gate mode through wrap71, on a private display (before the :0 sitting is asked for). The same guard as a :0
# step (wrap71.py, run71.sh's call with its own TMPDIR) in private mode, around private-run.mjs's private Xvfb, running
# a small verdict in gate mode (no --dev): the candidate's checks (gh attestation verify, the commit, --version) inside
# the guard, then one block of the desktop's list_apps. usage: wrap71-proof.sh <candidate> <out>
set -u
CAND=$1; P=$2
GATE=/Users/new/Developer/GitHub/cua/.claude/worktrees/t76-gate
S=$GATE/docs/evidence/2026-10-28-own-linux-engine/m4/pointer-route/scripts
D=/Users/new/.local/share/cua-171
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present: refusing"; exit 5; }
pgrep -x stress-ng > /dev/null && { echo "a load is running: refusing"; exit 4; }
[ -e "$P" ] && { echo "$P exists: refusing"; exit 2; }
mkdir -p "$P"
export PATH=$D/task59/bin:$PATH
tmproot=$(mktemp -d /tmp/c76-XXXXXX)
echo "tmproot $tmproot" > "$P/proof.txt"
cd "$GATE" || exit 2
echo "head $(git rev-parse HEAD) status $(git status --porcelain | wc -l)" >> "$P/proof.txt"
started=$(date -u +%FT%TZ)
python3 -I "$S/wrap71.py" "$P" "$tmproot" private node "$S/private-run.mjs" "$GATE" "$P/pr" \
  --vendor "$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64" \
  --newest "$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64" \
  --cua "$CAND" --scene desktop --ops list_apps --blocks 1 --run m4-gateproof-wrap71 > "$P/wrap.out" 2>&1
code=$?
echo "started $started finished $(date -u +%FT%TZ) wrap exit $code" >> "$P/proof.txt"
left=$(ls -A "$tmproot" 2>&1); echo "tmproot left: [$left]" >> "$P/proof.txt"; [ -z "$left" ] && rmdir "$tmproot"
cat "$P/proof.txt"; tail -5 "$P/wrap.out"
exit $code
