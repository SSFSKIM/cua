#!/usr/bin/env python3
# track-table.py <runs.jsonl>...: landed / drags per lane, park and kind, with the buttonless moves pages saw and errors.
import json
import sys
from collections import defaultdict

cells = defaultdict(lambda: {"n": 0, "landed": 0, "errors": 0, "buttonless": 0, "ms": []})
errors = defaultdict(int)
for path in sys.argv[1:]:
    for line in open(path):
        row = json.loads(line)
        if row.get("setup"):
            continue
        c = cells[(row["lane"], row["park"], row["kind"])]
        c["n"] += 1
        c["landed"] += bool(row["landed"])
        c["ms"].append(row["ms"])
        if not row["ok"]:
            c["errors"] += 1
            errors[row["error"][:160]] += 1
        if row.get("buttonless"):
            c["buttonless"] += 1
for (lane, park, kind), c in sorted(cells.items()):
    ms = sorted(c["ms"])
    print(f"{lane:10} {park:8} {kind:8} landed {c['landed']:3}/{c['n']:<3} errors {c['errors']:3} "
          f"buttonless-seen {c['buttonless']:3} median {ms[len(ms) // 2]:.1f} ms")
for e, n in errors.items():
    print(f"  {n} x {e}")
