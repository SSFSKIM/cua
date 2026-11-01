#!/usr/bin/env python3
# press-table.py <runs.jsonl>...: the new engine's park runs (track.mjs) by lane, park and kind: landed, answered the
# stray sentence, the route recorded, what the watch saw; then the atomic press's grab over every drag (p50, p99, max)
# and the false errors (a stray answer with the pointer parked inside, nothing disturbing).
import json
import sys
from collections import Counter, defaultdict

STRAY = "may not have started the drag"
cells = defaultdict(lambda: {"n": 0, "landed": 0, "stray": 0, "other_errors": 0, "routes": Counter(), "seen": Counter(), "landed_stray": 0})
grabs = []
inside_rows = 0
false_errors = []
for path in sys.argv[1:]:
    for line in open(path):
        row = json.loads(line)
        if row.get("setup"):
            continue
        c = cells[(row["lane"], row["park"], row["kind"])]
        c["n"] += 1
        c["landed"] += bool(row["landed"])
        stats = row.get("stats") or {}
        stray = not row["ok"] and STRAY in (row.get("error") or "")
        c["stray"] += stray
        c["landed_stray"] += stray and bool(row["landed"])
        if not row["ok"] and not stray:
            c["other_errors"] += 1
        c["routes"][stats.get("route")] += 1
        press = stats.get("press") or {}
        for kind in (press.get("strays") or {}).get("first", []):
            c["seen"][kind] += 1
        if "grab_ms" in press:
            grabs.append(press["grab_ms"])
        if row["park"] == "inside":
            inside_rows += 1
            if stray:
                false_errors.append((row["lane"], row["i"], row["kind"], press))
for (lane, park, kind), c in sorted(cells.items()):
    seen = ", ".join(f"{k} {v}" for k, v in c["seen"].items()) or "nothing"
    routes = ", ".join(f"{k} {v}" for k, v in c["routes"].items())
    print(f"{lane:5} {park:8} {kind:8} landed {c['landed']:3}/{c['n']:<3} stray-answer {c['stray']:3} (landed {c['landed_stray']:2}) "
          f"other-errors {c['other_errors']} route {routes}; watch saw {seen}")
grabs.sort()
if grabs:
    q = lambda p: grabs[min(len(grabs) - 1, int(p * len(grabs)))]
    print(f"grab: {len(grabs)} drags, p50 {q(0.5):.3f} ms, p99 {q(0.99):.3f} ms, max {grabs[-1]:.3f} ms")
print(f"pointer inside, undisturbed: {inside_rows} drags, {len(false_errors)} stray answers")
for f in false_errors:
    print("  false error:", f)
