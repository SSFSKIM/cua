#!/bin/bash
# One qt-activation (or focus-timer) sitting on a private Xvfb the experiment starts itself, from a harness directory
# (an exported commit, or the checkout for a smoke run), on musl builds. Refuses to start while another stress-ng runs.
# usage: sitting.sh <harness dir> <name> <experiment args...>
set -u
harness=$1
name=$2
shift 2
out=$HOME/.local/share/cua-171/task61/runs/$name
if pgrep -x stress-ng >/dev/null; then
  echo "stress-ng is running: not starting $name" >&2
  exit 3
fi
mkdir -p "$out"
cd "$harness" || exit 2
node scripts/linux-engine-diff.mjs --out "$out" --run "t61-$name" "$@" > "$out.out" 2>&1
code=$?
echo "sitting $name exit $code $(date -u +%T)"
tail -30 "$out.out"
