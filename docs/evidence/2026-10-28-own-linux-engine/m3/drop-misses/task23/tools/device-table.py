#!/usr/bin/env python3
# device-table.py <results.jsonl>: task 23's device run: every device verdict, and per case its samples, answers, how
# many were recorded in front, and the witness (clean, or the fields that failed).
import json
import sys
from collections import defaultdict

rows = [json.loads(line) for line in open(sys.argv[1])]
cases = defaultdict(lambda: {"n": 0, "ok": 0, "in_front": 0, "witness": 0, "fields": set()})
for r in rows:
    if r.get("kind") != "sample" or r.get("engine") != "cua":
        continue
    c = cases[r["op"]]
    c["n"] += 1
    c["ok"] += bool(r.get("ok"))
    c["in_front"] += (r.get("dnd") or {}).get("in_front") is True
    c["witness"] += r.get("witness") is True
    c["fields"].update(r.get("witness_fields") or [])
verdicts = [r for r in rows if r.get("kind") in ("device-verdict", "verdict") and str(r.get("op", "")).startswith(("chrome",))]
for op, c in sorted(cases.items()):
    v = next((x for x in verdicts if x.get("op") == op), {})
    passed = v.get("pass", v.get("verdict"))
    print(f"{op:45} samples {c['n']:2}  ok {c['ok']:2}  in front {c['in_front']:2}  witness clean {c['witness']:2}  "
          f"{'fields ' + ','.join(sorted(c['fields'])) if c['fields'] else ''}  verdict {passed}")
