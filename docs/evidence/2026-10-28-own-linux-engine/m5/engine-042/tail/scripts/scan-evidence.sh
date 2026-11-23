#!/bin/bash
# Tasks 116 and 118: the evidence scanned before it is pushed: no secret-shaped text in any file, the gzipped samples included.
# usage: scan-evidence.sh <evidence dir>
E=$1
PAT='secret|token|password|passwd|api[_-]?key|playwright_mcp|auth\.json|private key|gh[pousr]_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}'
hits=0
while IFS= read -r -d '' f; do
  case $f in *.gz) n=$(zcat "$f" | grep -ciE "$PAT") ;; *) n=$(grep -ciE "$PAT" "$f") ;; esac
  [ "${n:-0}" != 0 ] && { echo "$f: $n"; hits=1; }
done < <(find "$E" -type f -print0)
[ $hits = 0 ] && echo "scan: clean ($(find "$E" -type f | wc -l) files)"
exit $hits
