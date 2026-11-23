#!/bin/bash
# x64 V5 at H8: the two-line status's facts, read from a V5 run's directory after it ends (read-only, display-free):
# the verdict line, the all-clear, wrap71's summary (samples, flags, decoy connections, leftovers), the flags' kinds,
# the pointer, the owner's Chrome (the baseline's pid and ps now, never signalled), the hold canary's rows, the
# sidecar's log, and the run's exit and times from the sitting's output.
# usage: v5-status.sh <run dir> <capture dir> <sitting output, zero-V5<suffix>.out>
set -u
R=$1; C=$2; Z=$3
echo "== $(date -u +%FT%TZ) $R"
echo "verdict: $(grep -h -E 'run valid|acceptance on the pinned release:.*(PASS|FAIL|incomplete)|verdict' "$R/wrap.out" 2>/dev/null | tail -2 | tr '\n' ' ' | cut -c1-400)"
echo "all-clear: $(head -1 "$R/all-clear.txt" 2>/dev/null)"; sed -n '2,8p' "$R/all-clear.txt" 2>/dev/null | sed 's/^/  /'
echo "wrap summary: $(tail -1 "$R/wrap.out" 2>/dev/null | grep '^{' | cut -c1-300)"
if [ -s "$R/flags.jsonl" ]; then
  echo "flags.jsonl: $(wc -l < "$R/flags.jsonl") lines, kinds: $(python3 -I -c 'import json,sys,collections; c=collections.Counter(json.loads(l).get("kind") for l in open(sys.argv[1]) if l.strip()); print(dict(c))' "$R/flags.jsonl")"
else
  echo "flags.jsonl: none"
fi
echo "pointer: $(tr '\n' ' ' < "$R/pointer.txt" 2>/dev/null)"
echo "owner baseline: $(grep -h '^owner pid=' "$R/owner-baseline.txt" 2>/dev/null)"
echo "owner chrome now (ps): $(ps -o pid=,lstart=,comm= -p 2546101)"
echo "owner-diff: $(grep -c '^[<>]' "$R/owner-diff.txt" 2>/dev/null) changed lines: $(grep -h '^[<>]' "$R/owner-diff.txt" 2>/dev/null | sed 's/ [0-9.]*$//' | sort -u | tr '\n' ';' | cut -c1-200)"
echo "canary:"; grep -h -E '^\| device-chrome-dnd \| chrome_(dnd_short_in_front|select_nudged)_shared' "$R/run/summary.md" 2>/dev/null | sed 's/^/  /'
echo "sidecar: $(tail -2 "$C/sidecar.log" 2>/dev/null | tr '\n' ' ')"; ls "$C" 2>/dev/null | tr '\n' ' '; echo
echo "sitting output tail:"; grep -h -E '^--- V5 exit|started .* finished|tmproot left|cua171-run-\* left|^all-clear' "$Z" 2>/dev/null | sed 's/^/  /'
