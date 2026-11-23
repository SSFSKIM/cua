#!/bin/bash
# Each sitting directory of the evidence gets analysis.md: the per-series table (series-table.mjs) and the order of
# focus, raise and press per activation (analyze-order.mjs), with the activations grouped by target frame.
# usage: summarize.sh <evidence dir> <sitting dir>...
set -u
here=$(dirname "$0")
E=$1
shift
for s in "$@"; do
  d=$E/$s
  results=$(ls "$d"/results.jsonl* | head -1)
  order=$(ls "$d"/order.jsonl* | head -1)
  {
    echo "# $s"
    echo
    echo "## Per series"
    echo
    node "$here/series-table.mjs" "$results"
    echo
    echo "## Focus, raise and press per activation (server order)"
    echo
    node "$here/analyze-order.mjs" "$order" | tail -4
    echo
    echo "By target frame, in the order first activated (presses, those under another window, the largest raise after"
    echo "the activation request):"
    echo
    echo '```'
    node "$here/analyze-order.mjs" "$order" --json | node "$here/by-frame.mjs"
    echo '```'
    echo
    echo "Every activation:"
    echo
    node "$here/analyze-order.mjs" "$order" | head -n -4
  } > "$d/analysis.md"
  echo "$s: $(wc -l < "$d/analysis.md") lines"
done
