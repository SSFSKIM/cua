#!/bin/bash
# One settle sitting (the settle experiment starts its own private Xvfb), from a harness directory, on an engine.
# usage: sitting.sh <harness dir> <engine> <name> [settle args...]
# The Mozilla Firefox deb unpacked beside task 59's run comes first on PATH (the system's is a snap that cannot start on
# the run's own session bus). Refuses to start while another stress-ng runs.
set -u
harness=$1
engine=$2
name=$3
shift 3
out=$HOME/.local/share/cua-171/task64/runs/$name
if pgrep -x stress-ng >/dev/null; then
  echo "stress-ng is running: not starting $name" >&2
  exit 3
fi
mkdir -p "$out"
cd "$harness" || exit 2
export PATH=$HOME/.local/share/cua-171/task59/bin:$PATH
node scripts/linux-engine-diff.mjs --experiment settle --cua "$engine" --out "$out" --run "t64-$name" "$@" > "$out.out" 2>&1
code=$?
echo "sitting $name exit $code $(date -u +%T)"
tail -60 "$out.out"
