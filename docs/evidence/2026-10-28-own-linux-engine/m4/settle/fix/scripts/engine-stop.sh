#!/bin/bash
# The engine-stop burst lane of the fix wave (the design session's ruling 1, 2026-11-06), on a private Xvfb the harness
# starts: the drain lane is the exported harness's own cua (the head), the kill lane the control tree of control-tree.sh
# (the head with only the REPL host's stop from before T7b). press_key bursts and key_down/key_up pair bursts, on Chrome
# and Electron, through every production stop path that carries a burst; the control is required to cut.
# usage: engine-stop.sh <harness dir> <engine> <control tree> <name> [more harness flags, e.g. --load-factor 2...]
set -u
harness=$1
bin=$2
control=$3
name=$4
shift 4
out=$HOME/.local/share/cua-171/task62fix/runs/$name
if pgrep -x stress-ng >/dev/null; then
  echo "stress-ng is running: not starting $name" >&2
  exit 3
fi
mkdir -p "$out"
cd "$harness" || exit 2
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$bin" --control-root "$control" --out "$out" \
  --paths idle,eof,signal,remote --cases burst,pairs --browsers chrome,electron --require-burst-cut "$@" > "$out.out" 2>&1
echo "engine-stop $name exit $? $(date -u +%T)"
tail -40 "$out.out"
