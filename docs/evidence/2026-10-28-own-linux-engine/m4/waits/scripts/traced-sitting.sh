#!/bin/bash
# A settle sitting (sitting.sh) with `xprobe order-watch` attached to the experiment's own private display for the whole
# sitting, its lines in <runs>/<name>.order.jsonl. Never attaches to :0.
# usage: traced-sitting.sh <harness dir> <engine> <name> [settle args...]
set -u
here=$(dirname "$0")
P=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/xprobe/target/release/xprobe
name=$3
out=$HOME/.local/share/cua-171/task64/runs/$name
"$here/sitting.sh" "$@" &
sitting=$!
display=
for _ in $(seq 1 600); do
  display=$(grep -ho '"kind":"settle-display","display":"[^"]*"' "$out"/*.jsonl 2>/dev/null | head -1 | sed 's/.*"display":"//; s/"$//')
  [ -n "$display" ] && break
  kill -0 $sitting 2>/dev/null || break
  sleep 0.2
done
if [ -z "$display" ] || [ "$display" = ":0" ]; then
  echo "no private display found ($display)" >&2
  wait $sitting
  exit 4
fi
echo "attaching order-watch to $display" >&2
mkfifo "$out.fifo"
DISPLAY=$display "$P" order-watch < "$out.fifo" > "$out.order.jsonl" 2> "$out.order.err" &
watcher=$!
exec 9> "$out.fifo"
wait $sitting
code=$?
exec 9>&-
wait $watcher
rm -f "$out.fifo"
exit $code
