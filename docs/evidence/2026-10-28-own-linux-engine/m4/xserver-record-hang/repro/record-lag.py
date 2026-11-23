#!/usr/bin/env python3
"""The record client's read lag over a whole-run record: for each line with a server time `t`, the wall clock when it
was read (`ms`) less the wall clock the server's time maps to (`ready.ms + t - t0`). $1: the record's JSONL;
$2 (optional): the bucket width in minutes (default 10)."""
import json, sys
width = float(sys.argv[2]) if len(sys.argv) > 2 else 10
ready = None; rows = []; kinds = {}
for line in open(sys.argv[1]):
    try:
        r = json.loads(line)
    except Exception:
        continue
    kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    if r["kind"] == "ready":
        ready = r
    elif ready and "t" in r:
        rows.append((r["ms"], r["ms"] - (ready["ms"] + r["t"] - ready["t0"])))
print("kinds", kinds)
if not rows:
    sys.exit("no timed rows")
start = rows[0][0]
bucket = {}
for ms, lag in rows:
    b = int((ms - start) / (width * 60000))
    lo, hi, n = bucket.get(b, (1e18, -1e18, 0))
    bucket[b] = (min(lo, lag), max(hi, lag), n + 1)
for b in sorted(bucket):
    lo, hi, n = bucket[b]
    print(f"min {b*width:6.1f}: rows {n:6d} lag ms min {lo:8.0f} max {hi:8.0f}")
print("last 5 lags", [l for _, l in rows[-5:]])
