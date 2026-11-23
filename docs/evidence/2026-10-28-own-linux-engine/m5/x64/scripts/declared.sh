#!/bin/bash
# Task 89: every step's lines naming a declared or unconfirmed cell, a declared gap, refusal, limit or deviation, or an
# unproved series (F8a), from its summary and its output, so the README lists them apart from the passes.
# usage: declared.sh <out root>...
for root in "$@"; do
  for d in "$root"/*.pinned-release; do
    name=$(basename "$d"); name=${name%%.*}
    for f in "$d/run/summary.md" "$d/stdout.log" "$d/run/baseline/unproved.txt"; do
      [ -s "$f" ] || continue
      grep -hiE "declared|unconfirmed|unproved" "$f" | grep -vE "^\| scene \|" | cut -c1-330 | sed "s|^|$name ($(basename "$f")): |"
    done | sort -u | head -12
  done
done
