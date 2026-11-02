#!/usr/bin/env python3
# device-table.py <results.jsonl>: a differential run's device verdicts, each with its samples' answers (ok, or the
# error's first words), the routes recorded and what the press watch saw; then the run's end line.
import json
import sys
from collections import Counter, defaultdict

samples = defaultdict(list)
verdicts = []
end = None
for line in open(sys.argv[1]):
    row = json.loads(line)
    kind = row.get("kind")
    if kind == "sample" and row.get("engine") == "cua":
        samples[(row["scene"], row["op"])].append(row)
    elif kind == "verdict" and row.get("device"):
        verdicts.append(row)
    elif kind == "end":
        end = row
for v in verdicts:
    rows = samples[(v["scene"], v["op"])]
    answers = Counter("ok" if r["ok"] else r.get("error", "")[:48] for r in rows)
    routes = Counter(r.get("route") for r in rows)
    print(f"{v['verdict']:5} {v['op']:46} {v['device']:10} {len(rows)} samples: "
          + "; ".join(f"{a} x{n}" for a, n in answers.items())
          + f" | routes {dict(routes)}"
          + (f" | {'; '.join(v['reasons'])}" if v["reasons"] else ""))
print("end:", json.dumps(end))
