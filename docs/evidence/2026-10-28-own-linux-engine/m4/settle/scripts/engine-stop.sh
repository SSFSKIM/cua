#!/bin/bash
# T7b's production-stop sitting (the engine-stop experiment), idle, on a private Xvfb the harness starts, from an
# exported harness whose REPL host is the drain lane, the REPL host of f59575fb (before T7b) the kill lane.
# usage: engine-stop.sh <harness dir> <engine> <name> [more harness flags...]
set -u
harness=$1
bin=$2
name=$3
shift 3
control=$HOME/.local/share/cua-171/task57/control-f59575fb
out=$HOME/.local/share/cua-171/task62/runs/$name
if pgrep -x stress-ng >/dev/null; then
  echo "stress-ng is running: not starting $name" >&2
  exit 3
fi
mkdir -p "$out"
cd "$harness" || exit 2
node scripts/linux-engine-diff.mjs --experiment engine-stop --cua "$bin" --control-root "$control" --out "$out" "$@" > "$out.out" 2>&1
echo "engine-stop $name exit $? $(date -u +%T)"
tail -30 "$out.out"
